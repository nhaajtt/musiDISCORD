// Turns a piece of content (a question, a joke, a fact, a bit of banter) into a small script:
// who says what, how long to wait before each line, and what to do if a human joins in.

export const KIND_WEIGHTS = { question: 0.3, riddle: 0.25, fact: 0.25, banter: 0.2 };

const MIN = 60_000;
export const between = (rng, min, max) => Math.round(min + rng() * (max - min));
const pick = (list, rng) => list[Math.floor(rng() * list.length)];

export const CONTENT_KEY = { question: "questions", riddle: "riddles", fact: "facts", banter: "banter" };

/** Picks a kind of conversation (weighted), skipping kinds that have no unused content left. */
export function pickKind(content, recent, rng) {
  const options = Object.entries(KIND_WEIGHTS).filter(([kind]) => freshItems(content, kind, recent).length > 0);
  if (!options.length) return null;
  let roll = rng() * options.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [kind, weight] of options) {
    roll -= weight;
    if (roll <= 0) return kind;
  }
  return options.at(-1)[0];
}

/** Items of a kind that were not used recently (so the bots do not repeat themselves). */
export function freshItems(content, kind, recent) {
  const used = new Set(recent);
  return (content[CONTENT_KEY[kind]] ?? []).filter((item) => !used.has(item.id));
}

export const pickItem = (content, kind, recent, rng) => pick(freshItems(content, kind, recent), rng);

const persona = (content, slot) => content.personas[slot % content.personas.length];

/**
 * Builds the steps of one conversation. `slots` are the bots that can talk, the first one starts.
 * A step is { slot, text, waitMs, onHumans, replyTo }:
 *   waitMs   how long to wait after the previous line (0 for the opening line)
 *   onHumans what to do if a human has spoken in the channel since the conversation began:
 *            "post" go ahead anyway, "skip" leave this line out, "stop" end the conversation
 *   replyTo  "starter" or "previous": which of the bots' own messages this line replies to
 */
export function buildScript({ kind, item, slots, content, rng = Math.random }) {
  const [a, b = a, c = a] = slots;

  if (kind === "banter") {
    return item.lines.map((text, i) => ({
      slot: i % 2 === 0 ? a : b,
      text,
      waitMs: i === 0 ? 0 : between(rng, 1 * MIN, 3 * MIN),
      onHumans: "stop",
      replyTo: i === 0 ? null : "previous",
    }));
  }

  if (kind === "question") {
    const answer = pick(item.answers?.length ? item.answers : persona(content, b).react, rng);
    const lead = rng() < 0.5 ? `${pick(persona(content, b).lead, rng)} ` : "";
    return [
      { slot: a, text: item.text, waitMs: 0, onHumans: "stop", replyTo: null },
      { slot: b, text: `${lead}${answer}`, waitMs: between(rng, 5 * MIN, 10 * MIN), onHumans: "stop", replyTo: "starter" },
      { slot: c, text: pick(persona(content, c).react, rng), waitMs: between(rng, 1 * MIN, 3 * MIN), onHumans: "stop", replyTo: "previous" },
    ];
  }

  if (kind === "riddle") {
    return [
      { slot: a, text: item.setup, waitMs: 0, onHumans: "stop", replyTo: null },
      { slot: b, text: pick(persona(content, b).giveUp, rng), waitMs: between(rng, 4 * MIN, 8 * MIN), onHumans: "skip", replyTo: "starter" },
      // the answer is posted even if people joined in: someone is probably waiting for it
      { slot: a, text: item.punchline, waitMs: between(rng, 1 * MIN, 3 * MIN), onHumans: "post", replyTo: "starter" },
    ];
  }

  // fact
  return [
    { slot: a, text: item.text, waitMs: 0, onHumans: "stop", replyTo: null },
    { slot: b, text: pick(persona(content, b).factReact, rng), waitMs: between(rng, 3 * MIN, 8 * MIN), onHumans: "stop", replyTo: "starter" },
  ];
}

/** A short thank-you for a person who replied to one of the bots. */
export const ackText = (content, slot, rng = Math.random) => pick(persona(content, slot).ack, rng);
