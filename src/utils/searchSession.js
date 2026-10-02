import { randomBytes } from "node:crypto";

const TTL_MS = 60_000;
const sessions = new Map();

/**
 * Remembers the results of one /search so the buttons can refer to them by index.
 * The session disappears after a minute; the original reply is then stripped of its buttons.
 */
export function createSearchSession({ userId, tracks, interaction }) {
  const token = randomBytes(4).toString("hex");
  const timer = setTimeout(() => {
    sessions.delete(token);
    interaction.editReply({ components: [] }).catch(() => {});
  }, TTL_MS);
  timer.unref?.();
  sessions.set(token, { userId, tracks, timer });
  return token;
}

export function getSearchSession(token) {
  return sessions.get(token);
}

export function closeSearchSession(token) {
  const session = sessions.get(token);
  if (session) clearTimeout(session.timer);
  sessions.delete(token);
}
