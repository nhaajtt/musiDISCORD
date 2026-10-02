// The brain of the companion bots. It never talks to Discord directly: it is given `bots` (who can speak, and a way to
// send) and the settings store, and it is driven by tick() plus noteHumanMessage(). That keeps it easy to test.
import { ackText, between, buildScript, pickItem, pickKind } from "./script.js";
import { PRESETS, isQuietHour, localParts } from "./settings.js";

const MIN = 60_000;
const HUMANS_BUSY_MS = 3 * MIN; // do not start a conversation while people are chatting
const RETRY_MS = 10 * MIN; // when blocked (quiet hours, daily cap...) look again after this long
const RECENT_ITEMS = 60; // how many pieces of content to remember so they are not repeated
const BOT_MESSAGE_TTL_MS = 60 * MIN; // how long a bot message counts as "one a person may reply to"
const ACK_COOLDOWN_MS = 10 * MIN;
const ACK_DAILY_CAP = 10;

/**
 * @param {object} deps
 * @param {{get(guildId): object, all(): [string, object][]}} deps.store  settings per server
 * @param {(language: string) => object} deps.content  content bank for a language
 * @param {{available(guildId: string, channelId: string): {slot: number}[],
 *          send(m: {slot: number, guildId: string, channelId: string, text: string, replyTo: string|null}): Promise<string|null>}} deps.bots
 * @param {string} deps.timezone  used for quiet hours and the daily cap
 */
export class CompanionEngine {
  #deps;
  #guilds = new Map();
  #seen = new Set();

  constructor({ store, content, bots, timezone = "UTC", rng = Math.random, now = Date.now, log = () => {} }) {
    this.#deps = { store, content, bots, timezone, rng, now, log };
  }

  #state(guildId) {
    if (!this.#guilds.has(guildId)) {
      this.#guilds.set(guildId, {
        conv: null,
        nextStartAt: null,
        lastHumanAt: 0,
        recent: [],
        day: "",
        starts: 0,
        acks: 0,
        lastAckAt: 0,
        pendingAck: null,
        botMessages: new Map(), // message id -> { slot, at }
      });
    }
    return this.#guilds.get(guildId);
  }

  #gap(settings) {
    const preset = PRESETS[settings.preset] ?? PRESETS.normal;
    return between(this.#deps.rng, preset.minGapMin * MIN, preset.maxGapMin * MIN);
  }

  /** Call every few seconds. Advances conversations and starts new ones when it is time. */
  async tick() {
    for (const [guildId, settings] of this.#deps.store.all()) {
      if (!settings.enabled || !settings.channelId) continue;
      try {
        await this.#tickGuild(guildId, settings);
      } catch (error) {
        console.error(`Companions: error in server ${guildId}:`, error);
      }
    }
  }

  async #tickGuild(guildId, settings) {
    const { now } = this.#deps;
    const st = this.#state(guildId);
    const time = now();
    this.#prune(st, time);

    if (st.pendingAck && time >= st.pendingAck.at) await this.#sendAck(guildId, settings, st);

    if (st.conv) {
      if (time >= st.conv.nextAt) await this.#advance(guildId, settings, st);
      return;
    }

    // First time we see this server (or after a restart): wait a normal gap instead of speaking right away
    if (st.nextStartAt === null) st.nextStartAt = time + this.#gap(settings);
    if (time < st.nextStartAt) return;

    const blocked = this.#blockedReason(settings, st, time);
    if (blocked) {
      st.nextStartAt = time + RETRY_MS;
      return;
    }
    await this.#start(guildId, settings, st);
  }

  #blockedReason(settings, st, time) {
    const { hour, day } = localParts(time, this.#deps.timezone);
    if (st.day !== day) Object.assign(st, { day, starts: 0, acks: 0 });
    const preset = PRESETS[settings.preset] ?? PRESETS.normal;
    if (isQuietHour(hour, settings.quietStart, settings.quietEnd)) return "quiet hours";
    if (st.starts >= preset.dailyCap) return "daily limit reached";
    if (time - st.lastHumanAt < HUMANS_BUSY_MS) return "people are chatting";
    return null;
  }

  #prune(st, time) {
    for (const [id, { at }] of st.botMessages) if (time - at > BOT_MESSAGE_TTL_MS) st.botMessages.delete(id);
  }

  /** Starts a conversation right now, ignoring quiet hours and the daily limit (for testing with /companions now). */
  async startNow(guildId) {
    const settings = this.#deps.store.get(guildId);
    if (!settings.enabled || !settings.channelId) return { started: false, reason: "Companions are off or no channel is set." };
    const st = this.#state(guildId);
    if (st.conv) return { started: false, reason: "A conversation is already going on." };
    const started = await this.#start(guildId, settings, st);
    return started ? { started: true } : { started: false, reason: "I need at least two companion bots that can write in that channel." };
  }

  async #start(guildId, settings, st) {
    const { bots, content: contentFor, rng, now } = this.#deps;
    const present = bots.available(guildId, settings.channelId);
    if (present.length < 2) {
      st.nextStartAt = now() + RETRY_MS;
      return false;
    }

    const content = contentFor(settings.language);
    const kind = pickKind(content, st.recent, rng);
    if (!kind) {
      st.recent = []; // everything was used recently: start over
      st.nextStartAt = now() + RETRY_MS;
      return false;
    }

    const item = pickItem(content, kind, st.recent, rng);
    const slots = shuffle(present.map((b) => b.slot), rng);
    const steps = buildScript({ kind, item, slots, content, rng });

    const first = steps[0];
    const id = await bots.send({ slot: first.slot, guildId, channelId: settings.channelId, text: first.text, replyTo: null });
    if (!id) {
      st.nextStartAt = now() + RETRY_MS;
      return false;
    }

    const time = now();
    st.recent = [...st.recent, item.id].slice(-RECENT_ITEMS);
    st.starts++;
    st.botMessages.set(id, { slot: first.slot, at: time });
    st.conv = { kind, steps, index: 1, startedAt: time, nextAt: time + (steps[1]?.waitMs ?? 0), starterId: id, previousId: id, previousSlot: first.slot };
    this.#deps.log(`Companions: started a ${kind} in ${guildId}`);
    if (steps.length === 1) this.#end(settings, st);
    return true;
  }

  async #advance(guildId, settings, st) {
    const { bots, now } = this.#deps;
    const conv = st.conv;
    const step = conv.steps[conv.index];
    const humansJoined = st.lastHumanAt >= conv.startedAt;

    if (humansJoined && step.onHumans === "stop") return this.#end(settings, st);
    if (humansJoined && step.onHumans === "skip") {
      conv.index++;
      if (conv.index >= conv.steps.length) return this.#end(settings, st);
      conv.nextAt = now() + conv.steps[conv.index].waitMs;
      return;
    }

    // Use the bot the script chose; if it cannot speak any more, any other bot except the one who spoke last
    const present = bots.available(guildId, settings.channelId);
    const slot = present.some((b) => b.slot === step.slot) ? step.slot : present.find((b) => b.slot !== conv.previousSlot)?.slot;
    if (slot === undefined) return this.#end(settings, st);

    const replyTo = step.replyTo === "starter" ? conv.starterId : step.replyTo === "previous" ? conv.previousId : null;
    const id = await bots.send({ slot, guildId, channelId: settings.channelId, text: step.text, replyTo });
    if (!id) return this.#end(settings, st);

    const time = now();
    st.botMessages.set(id, { slot, at: time });
    conv.previousId = id;
    conv.previousSlot = slot;
    conv.index++;
    if (conv.index >= conv.steps.length) return this.#end(settings, st);
    conv.nextAt = time + conv.steps[conv.index].waitMs;
  }

  #end(settings, st) {
    st.conv = null;
    st.nextStartAt = this.#deps.now() + this.#gap(settings);
  }

  /**
   * Tell the engine about a message written by a person (not a bot) in a server. Messages outside the chosen channel
   * are ignored. A reply to one of the bots earns a short thank-you after a human-looking pause.
   */
  noteHumanMessage({ guildId, channelId, messageId, replyToMessageId = null }) {
    if (this.#seen.has(messageId)) return;
    this.#seen.add(messageId);
    if (this.#seen.size > 1000) this.#seen.delete(this.#seen.values().next().value);

    const settings = this.#deps.store.get(guildId);
    if (!settings.enabled || settings.channelId !== channelId) return;

    const { now, rng } = this.#deps;
    const st = this.#state(guildId);
    const time = now();
    st.lastHumanAt = time;

    const replied = replyToMessageId ? st.botMessages.get(replyToMessageId) : null;
    const { day } = localParts(time, this.#deps.timezone);
    if (st.day !== day) Object.assign(st, { day, starts: 0, acks: 0 });
    if (replied && !st.pendingAck && time - st.lastAckAt >= ACK_COOLDOWN_MS && st.acks < ACK_DAILY_CAP) {
      st.pendingAck = { at: time + between(rng, 20_000, 90_000), replyTo: messageId, slot: replied.slot };
    }
  }

  async #sendAck(guildId, settings, st) {
    const { bots, content, rng, now } = this.#deps;
    const ack = st.pendingAck;
    st.pendingAck = null;

    const present = bots.available(guildId, settings.channelId);
    if (!present.length) return;
    const slot = present.some((b) => b.slot === ack.slot) ? ack.slot : present[0].slot;
    const id = await bots.send({ slot, guildId, channelId: settings.channelId, text: ackText(content(settings.language), slot, rng), replyTo: ack.replyTo });
    if (!id) return;
    st.acks++;
    st.lastAckAt = now();
    st.botMessages.set(id, { slot, at: now() });
  }

  /** A snapshot for /companions status. */
  status(guildId) {
    const settings = this.#deps.store.get(guildId);
    const st = this.#state(guildId);
    const time = this.#deps.now();
    const preset = PRESETS[settings.preset] ?? PRESETS.normal;
    return {
      settings,
      botsAvailable: settings.channelId ? this.#deps.bots.available(guildId, settings.channelId).length : 0,
      startsToday: localParts(time, this.#deps.timezone).day === st.day ? st.starts : 0,
      dailyCap: preset.dailyCap,
      nextStartInMs: st.nextStartAt === null ? null : Math.max(0, st.nextStartAt - time),
      talking: Boolean(st.conv),
    };
  }
}

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
