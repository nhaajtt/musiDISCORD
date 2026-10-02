import { getEarnedBadges, saveBadges, userStats } from "./stats.js";

export const BADGES = [
  { id: "night_owl", icon: "🦉", name: "Night Owl", hint: "Listen to 10 tracks between 0:00 and 5:00 AM", test: (s) => s.nightPlays >= 10 },
  { id: "ruthless", icon: "🗡️", name: "Ruthless", hint: "Skip 50 tracks", test: (s) => s.totalSkips >= 50 },
  { id: "queue_master", icon: "📋", name: "Queue Master", hint: "Queue up 100 tracks", test: (s) => s.totalRequests >= 100 },
  { id: "die_hard", icon: "🔁", name: "Die-Hard Fan", hint: "Listen to the same track 10 times", test: (s) => s.maxSameTrack >= 10 },
  { id: "audiophile", icon: "🎧", name: "Audiophile", hint: "Listen for 10 hours in total", test: (s) => s.totalListenMs >= 10 * 3_600_000 },
  { id: "critic", icon: "⭐", name: "Critic", hint: "Rate 50 tracks", test: (s) => s.ratingsCount >= 50 },
  { id: "quiz_master", icon: "🧠", name: "Quiz Master", hint: "Earn 500 quiz points", test: (s) => s.quizPoints >= 500 },
  { id: "sharp_ear", icon: "👂", name: "Sharp Ear", hint: "Get 50 quiz answers right", test: (s) => s.quizCorrect >= 50 },
  { id: "season_champion", icon: "🏆", name: "Season Champion", hint: "Finish a month as the top quiz player on a server", test: (s) => s.seasonWins >= 1 },
  { id: "streak7", icon: "🔥", name: "7-Day Streak", hint: "Listen to music 7 days in a row", test: (s) => s.streakDays >= 7 },
];

const byId = new Map(BADGES.map((b) => [b.id, b]));
export const badgeById = (id) => byId.get(id);

/** Checks for and records new badges. Returns the badges just earned. */
export function awardBadges(guildId, userId) {
  const stats = userStats(guildId, userId);
  const earned = getEarnedBadges(guildId, userId);
  const fresh = BADGES.filter((b) => !earned.has(b.id) && b.test(stats));
  if (fresh.length) saveBadges(guildId, userId, fresh.map((b) => b.id));
  return fresh;
}

/** All badges a user currently has (including newly earned ones). */
export function earnedBadges(guildId, userId) {
  awardBadges(guildId, userId);
  const earned = getEarnedBadges(guildId, userId);
  return BADGES.filter((b) => earned.has(b.id));
}
