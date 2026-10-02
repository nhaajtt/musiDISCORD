import { getEarnedBadges, saveBadges, userStats } from "./stats.js";

export const BADGES = [
  { id: "night_owl", icon: "🦉", name: "Vampire Hours", hint: "10 tracks between midnight and 5 AM. Sleep is a rumor", test: (s) => s.nightPlays >= 10 },
  { id: "ruthless", icon: "🗡️", name: "Skip Goblin", hint: "Skip 50 tracks. Nobody's taste is safe from your thumb", test: (s) => s.totalSkips >= 50 },
  { id: "queue_master", icon: "📋", name: "Queue Gremlin", hint: "Queue 100 tracks. The playlist fears you", test: (s) => s.totalRequests >= 100 },
  { id: "die_hard", icon: "🔁", name: "Broken Record", hint: "Play the same track 10 times. We are worried, but proud", test: (s) => s.maxSameTrack >= 10 },
  { id: "audiophile", icon: "🎧", name: "Headphone Zombie", hint: "10 hours of listening. Touch grass, then come back", test: (s) => s.totalListenMs >= 10 * 3_600_000 },
  { id: "critic", icon: "⭐", name: "Armchair Critic", hint: "Rate 50 tracks. Everyone's a critic", test: (s) => s.ratingsCount >= 50 },
  { id: "quiz_master", icon: "🧠", name: "Smarty Pants", hint: "Earn 500 quiz points. Insufferable at parties", test: (s) => s.quizPoints >= 500 },
  { id: "sharp_ear", icon: "👂", name: "Bat Ears", hint: "50 correct quiz answers. You hear things", test: (s) => s.quizCorrect >= 50 },
  { id: "season_champion", icon: "🏆", name: "Monthly Menace", hint: "Top the quiz for a whole month. Bow before no one", test: (s) => s.seasonWins >= 1 },
  { id: "streak7", icon: "🔥", name: "Streak Addict", hint: "Listen 7 days in a row. Not even a day off", test: (s) => s.streakDays >= 7 },
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
