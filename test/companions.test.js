import assert from "node:assert/strict";
import test from "node:test";
import { getContent } from "../src/companions/content/index.js";
import { CompanionEngine } from "../src/companions/engine.js";
import { CONTENT_KEY, KIND_WEIGHTS, buildScript } from "../src/companions/script.js";
import { createSettingsStore, isQuietHour, localParts, validTimeZone } from "../src/companions/settings.js";

const MIN = 60_000;
const NOON = Date.UTC(2026, 9, 2, 12, 0, 0);

/** Small deterministic random generator so tests do not flake. */
function seeded(seed = 1) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An engine wired to fake bots and a fake clock. `only` limits the content to one kind of conversation. */
function harness({ slots = [0, 1, 2], settings = {}, only = null, language = "en", seed = 3, startAt = NOON } = {}) {
  let time = startAt;
  const sent = [];
  let counter = 0;
  const base = getContent(language);
  const content = only
    ? () => ({ ...base, ...Object.fromEntries(Object.values(CONTENT_KEY).filter((k) => k !== CONTENT_KEY[only]).map((k) => [k, []])) })
    : () => base;
  const state = { enabled: true, channelId: "chan", language, preset: "normal", quietStart: 23, quietEnd: 8, ...settings };
  const store = { get: () => state, all: () => [["guild", state]] };
  const bots = {
    available: () => slots.map((slot) => ({ slot })),
    send: async (m) => {
      const id = `m${++counter}`;
      sent.push({ ...m, id, at: time });
      return id;
    },
  };
  const engine = new CompanionEngine({ store, content, bots, timezone: "UTC", rng: seeded(seed), now: () => time });
  return {
    engine,
    sent,
    state,
    set slots(next) {
      slots = next;
    },
    advance: async (ms) => {
      time += ms;
      await engine.tick();
    },
    now: () => time,
    /** Moves time forward in small steps until the engine says something (or gives up). */
    untilSpeaks: async (maxMs = 12 * 60 * MIN, step = MIN) => {
      const before = sent.length;
      for (let waited = 0; waited < maxMs && sent.length === before; waited += step) await engine_advance();
      return sent.length > before;
      async function engine_advance() {
        time += step;
        await engine.tick();
      }
    },
  };
}

test("content: every bank is complete and well-formed in both languages", () => {
  for (const language of ["en", "vi"]) {
    const c = getContent(language);
    assert.equal(c.language, language);
    assert.equal(c.personas.length, 5, `${language}: five personalities`);

    for (const [kind, key] of Object.entries(CONTENT_KEY)) {
      assert.ok(c[key].length >= 12, `${language}: enough ${key}`);
      assert.equal(new Set(c[key].map((i) => i.id)).size, c[key].length, `${language}: unique ids in ${key}`);
      assert.ok(kind in KIND_WEIGHTS);
    }
    for (const q of c.questions) assert.ok(q.text && q.answers.length >= 2, q.id);
    for (const r of c.riddles) assert.ok(r.setup && r.punchline, r.id);
    for (const f of c.facts) assert.ok(f.text.length > 20, f.id);
    for (const b of c.banter) assert.ok(b.lines.length >= 2 && b.lines.length <= 4 && b.lines.every(Boolean), b.id);

    for (const p of c.personas) {
      assert.ok(p.name && p.blurb);
      for (const list of ["lead", "giveUp", "react", "ack", "factReact"]) assert.ok(p[list].length >= 3, `${language} ${p.name} ${list}`);
    }

    const everyText = [
      ...c.questions.flatMap((q) => [q.text, ...q.answers]),
      ...c.riddles.flatMap((r) => [r.setup, r.punchline]),
      ...c.facts.map((f) => f.text),
      ...c.banter.flatMap((b) => b.lines),
      ...c.personas.flatMap((p) => [p.lead, p.giveUp, p.react, p.ack, p.factReact].flat()),
    ];
    for (const text of everyText) {
      assert.ok(text.length > 0 && text.length < 400, text);
      assert.ok(!text.includes("${") && !text.includes("undefined"), text);
      assert.ok(!/@everyone|@here|<@/.test(text), `no pings: ${text}`);
    }
  }
  assert.equal(getContent("fr").language, "en", "unknown languages fall back to English");
});

test("settings helpers: quiet hours wrap around midnight, time zones, validation", () => {
  assert.equal(isQuietHour(23, 23, 8), true);
  assert.equal(isQuietHour(3, 23, 8), true);
  assert.equal(isQuietHour(8, 23, 8), false);
  assert.equal(isQuietHour(12, 23, 8), false);
  assert.equal(isQuietHour(2, 1, 5), true);
  assert.equal(isQuietHour(6, 1, 5), false);
  assert.equal(isQuietHour(4, 4, 4), false, "equal start and end means no quiet hours");

  assert.deepEqual(localParts(Date.UTC(2026, 9, 2, 17, 30), "Asia/Ho_Chi_Minh"), { hour: 0, day: "2026-10-03" });
  assert.deepEqual(localParts(Date.UTC(2026, 9, 2, 17, 30), "UTC"), { hour: 17, day: "2026-10-02" });
  assert.equal(validTimeZone("Asia/Ho_Chi_Minh"), true);
  assert.equal(validTimeZone("Mars/Olympus"), false);
});

test("settings store keeps defaults and persists changes", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = mkdtempSync(path.join(os.tmpdir(), "musi-comp-"));
  try {
    const file = path.join(dir, "companions.json");
    const store = createSettingsStore(file);
    assert.equal(store.get("g1").enabled, false);
    assert.equal(store.get("g1").language, "en");
    store.update("g1", { enabled: true, channelId: "c1", language: "vi" });
    const again = createSettingsStore(file);
    assert.deepEqual([again.get("g1").enabled, again.get("g1").channelId, again.get("g1").language], [true, "c1", "vi"]);
    assert.equal(again.all().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scripts: each kind has the right shape and different bots speak", () => {
  const c = getContent("en");
  const rng = seeded(9);
  const q = buildScript({ kind: "question", item: c.questions[0], slots: [4, 1, 2], content: c, rng });
  assert.deepEqual(q.map((s) => s.slot), [4, 1, 2]);
  assert.equal(q[0].waitMs, 0);
  assert.ok(q[1].waitMs >= 5 * MIN && q[1].waitMs <= 10 * MIN);
  assert.equal(q[1].replyTo, "starter");

  const r = buildScript({ kind: "riddle", item: c.riddles[0], slots: [0, 1], content: c, rng });
  assert.equal(r[0].text, c.riddles[0].setup);
  assert.equal(r[1].onHumans, "skip");
  assert.equal(r[2].text, c.riddles[0].punchline);
  assert.equal(r[2].slot, 0, "the teller delivers the punchline");
  assert.equal(r[2].onHumans, "post");

  const b = buildScript({ kind: "banter", item: c.banter.find((x) => x.lines.length === 3), slots: [2, 3], content: c, rng });
  assert.deepEqual(b.map((s) => s.slot), [2, 3, 2]);

  const f = buildScript({ kind: "fact", item: c.facts[0], slots: [0, 1], content: c, rng });
  assert.equal(f.length, 2);

  // With only one bot available nothing breaks: it just talks to itself
  assert.equal(buildScript({ kind: "question", item: c.questions[0], slots: [0], content: c, rng }).length, 3);
});

test("a question: nothing at first, then one bot asks and, with no human around, other bots answer", async () => {
  const h = harness({ only: "question" });
  await h.advance(0);
  assert.equal(h.sent.length, 0, "does not speak the moment it is switched on");

  assert.ok(await h.untilSpeaks(), "starts after the normal gap");
  assert.equal(h.sent.length, 1);
  const asker = h.sent[0];
  assert.equal(asker.replyTo, null);

  assert.ok(await h.untilSpeaks(), "someone answers after a while");
  const answer = h.sent[1];
  assert.notEqual(answer.slot, asker.slot);
  assert.equal(answer.replyTo, asker.id);
  assert.ok(answer.at - asker.at >= 5 * MIN, "waited long enough for a human to answer first");

  assert.ok(await h.untilSpeaks(), "a third bot reacts");
  assert.equal(h.sent.length, 3);
  assert.equal(await h.untilSpeaks(80 * MIN), false, "then it goes quiet again for a good while");
});

test("when a person speaks, the bots stop talking and let them", async () => {
  const h = harness({ only: "question" });
  await h.untilSpeaks();
  assert.equal(h.sent.length, 1);

  h.engine.noteHumanMessage({ guildId: "guild", channelId: "chan", messageId: "h1" });
  assert.equal(await h.untilSpeaks(30 * MIN), false, "no pile-on after a human joined in");
  assert.equal(h.sent.length, 1);
});

test("messages in other channels do not count as someone joining in", async () => {
  const h = harness({ only: "question" });
  await h.untilSpeaks();
  h.engine.noteHumanMessage({ guildId: "guild", channelId: "elsewhere", messageId: "h1" });
  assert.ok(await h.untilSpeaks(), "still answers");
});

test("a joke: the punchline still comes if people tried to guess, but the other bot's shrug is skipped", async () => {
  const h = harness({ only: "riddle", seed: 5 });
  await h.untilSpeaks();
  const setup = h.sent[0];
  h.engine.noteHumanMessage({ guildId: "guild", channelId: "chan", messageId: "guess1" });

  assert.ok(await h.untilSpeaks(30 * MIN));
  assert.equal(h.sent.length, 2);
  const punchline = h.sent[1];
  assert.equal(punchline.slot, setup.slot, "the teller delivers it");
  assert.equal(punchline.replyTo, setup.id);
  assert.ok(getContent("en").riddles.some((r) => r.punchline === punchline.text));
});

test("a joke nobody answers: another bot shrugs, then the teller gives the punchline", async () => {
  const h = harness({ only: "riddle", seed: 7 });
  await h.untilSpeaks();
  await h.untilSpeaks();
  await h.untilSpeaks();
  assert.equal(h.sent.length, 3);
  assert.notEqual(h.sent[1].slot, h.sent[0].slot);
  assert.equal(h.sent[2].slot, h.sent[0].slot);
});

test("quiet hours: silent at night, speaks again in the morning", async () => {
  const h = harness({ only: "fact", startAt: Date.UTC(2026, 9, 2, 22, 0) });
  assert.equal(await h.untilSpeaks(5 * 60 * MIN), false, "nothing between 23:00 and 08:00");
  assert.ok(h.now() >= Date.UTC(2026, 9, 3, 3, 0));
  assert.ok(await h.untilSpeaks(8 * 60 * MIN, 5 * MIN), "wakes up once the quiet window ends");
  assert.ok(localParts(h.sent[0].at, "UTC").hour >= 8 && localParts(h.sent[0].at, "UTC").hour < 23);
});

test("daily limit: stops after the cap and starts again the next day", async () => {
  const h = harness({ only: "fact", settings: { preset: "calm", quietStart: 0, quietEnd: 0 }, startAt: Date.UTC(2026, 9, 2, 0, 0) });
  const day = (ms) => localParts(ms, "UTC").day;
  for (let waited = 0; waited < 23 * 60 * MIN; waited += 5 * MIN) await h.advance(5 * MIN);
  const starters = h.sent.filter((m) => m.replyTo === null);
  assert.ok(starters.length >= 1 && starters.length <= 4, `at most 4 conversations a day, saw ${starters.length}`);
  assert.ok(starters.every((m) => day(m.at) === "2026-10-02"));

  const before = h.sent.filter((m) => m.replyTo === null).length;
  for (let waited = 0; waited < 8 * 60 * MIN; waited += 5 * MIN) await h.advance(5 * MIN);
  assert.ok(h.sent.filter((m) => m.replyTo === null).length > before, "new day, new conversations");
});

test("needs at least two bots that can write in the channel", async () => {
  const h = harness({ slots: [0], only: "question" });
  assert.equal(await h.untilSpeaks(24 * 60 * MIN, 5 * MIN), false);
  h.slots = [0, 1];
  assert.ok(await h.untilSpeaks(24 * 60 * MIN, 5 * MIN));
});

test("does not start a conversation while people are busy chatting", async () => {
  const h = harness({ only: "fact", settings: { preset: "lively" } });
  for (let i = 0; i < 40; i++) {
    h.engine.noteHumanMessage({ guildId: "guild", channelId: "chan", messageId: `busy${i}` });
    await h.advance(MIN);
  }
  assert.equal(h.sent.length, 0, "40 minutes of chatter and the bots kept out of it");
  assert.ok(await h.untilSpeaks(2 * 60 * MIN), "once it calms down they may speak");
});

test("a person who replies to a bot gets a short thank-you, but not over and over", async () => {
  const h = harness({ only: "fact" });
  await h.untilSpeaks();
  const fact = h.sent[0];

  h.engine.noteHumanMessage({ guildId: "guild", channelId: "chan", messageId: "reply1", replyToMessageId: fact.id });
  await h.advance(2 * MIN);
  const ack = h.sent.find((m) => m.replyTo === "reply1");
  assert.ok(ack, "the bots thank them");
  assert.equal(ack.slot, fact.slot, "the same bot they replied to");
  assert.ok(ack.at - fact.at >= 20_000, "after a natural pause");

  h.engine.noteHumanMessage({ guildId: "guild", channelId: "chan", messageId: "reply2", replyToMessageId: ack.id });
  await h.advance(2 * MIN);
  assert.equal(h.sent.some((m) => m.replyTo === "reply2"), false, "ten minute cooldown between thank-yous");
});

test("replies to something that is not a bot message get no thank-you", async () => {
  const h = harness({ only: "fact" });
  await h.untilSpeaks();
  h.engine.noteHumanMessage({ guildId: "guild", channelId: "chan", messageId: "x1", replyToMessageId: "someone-elses-message" });
  await h.advance(3 * MIN);
  assert.equal(h.sent.some((m) => m.replyTo === "x1"), false);
});

test("/companions now works during quiet hours, but only when set up and idle", async () => {
  const h = harness({ only: "question", startAt: Date.UTC(2026, 9, 2, 3, 0) });
  const result = await h.engine.startNow("guild");
  assert.equal(result.started, true);
  assert.equal(h.sent.length, 1);
  assert.equal((await h.engine.startNow("guild")).started, false, "already talking");

  const off = harness({ settings: { enabled: false } });
  assert.equal((await off.engine.startNow("guild")).started, false);
  const lonely = harness({ slots: [0] });
  assert.equal((await lonely.engine.startNow("guild")).started, false);
});

test("the same piece of content is not repeated until the others have been used", async () => {
  const h = harness({ only: "fact", settings: { preset: "lively", quietStart: 0, quietEnd: 0 }, seed: 11 });
  const total = getContent("en").facts.length;
  const seen = new Set();
  for (let waited = 0; waited < 40 * 24 * 60 * MIN && seen.size < Math.min(total, 10); waited += 10 * MIN) {
    await h.advance(10 * MIN);
    for (const m of h.sent) if (m.replyTo === null) seen.add(m.text);
  }
  const starters = h.sent.filter((m) => m.replyTo === null).map((m) => m.text);
  assert.ok(starters.length >= 10, "plenty of conversations happened");
  assert.equal(new Set(starters.slice(0, 10)).size, 10, "the first ten facts are all different");
});

test("status reports what the command shows", async () => {
  const h = harness({ only: "fact" });
  await h.advance(0);
  const before = h.engine.status("guild");
  assert.equal(before.botsAvailable, 3);
  assert.equal(before.talking, false);
  assert.equal(before.dailyCap, 8);
  assert.ok(before.nextStartInMs > 0);
  await h.untilSpeaks();
  assert.equal(h.engine.status("guild").startsToday, 1);
});

test("Vietnamese content runs through the same engine", async () => {
  const h = harness({ language: "vi", only: "riddle", seed: 21 });
  await h.untilSpeaks();
  assert.ok(getContent("vi").riddles.some((r) => r.setup === h.sent[0].text));
});
