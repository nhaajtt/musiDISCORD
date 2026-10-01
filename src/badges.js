import { getEarnedBadges, saveBadges, userStats } from "./stats.js";

export const BADGES = [
  { id: "night_owl", icon: "🦉", name: "Cú đêm", hint: "Nghe 10 bài trong khung 0h-5h sáng", test: (s) => s.nightPlays >= 10 },
  { id: "ruthless", icon: "🗡️", name: "Tàn nhẫn", hint: "Bỏ qua 50 bài", test: (s) => s.totalSkips >= 50 },
  { id: "queue_master", icon: "📋", name: "Bậc thầy hàng chờ", hint: "Xếp 100 bài vào hàng chờ", test: (s) => s.totalRequests >= 100 },
  { id: "die_hard", icon: "🔁", name: "Fan cứng", hint: "Nghe cùng một bài 10 lần", test: (s) => s.maxSameTrack >= 10 },
  { id: "audiophile", icon: "🎧", name: "Thính phòng", hint: "Nghe tổng cộng 10 giờ", test: (s) => s.totalListenMs >= 10 * 3_600_000 },
  { id: "critic", icon: "⭐", name: "Nhà phê bình", hint: "Đánh giá 50 bài", test: (s) => s.ratingsCount >= 50 },
  { id: "quiz_master", icon: "🧠", name: "Bậc thầy đố nhạc", hint: "Đạt 500 điểm đố nhạc", test: (s) => s.quizPoints >= 500 },
  { id: "streak7", icon: "🔥", name: "Chuỗi 7 ngày", hint: "Nghe nhạc 7 ngày liên tiếp", test: (s) => s.streakDays >= 7 },
];

const byId = new Map(BADGES.map((b) => [b.id, b]));
export const badgeById = (id) => byId.get(id);

/** Kiểm tra và ghi nhận huy hiệu mới. Trả về danh sách huy hiệu vừa đạt được. */
export function awardBadges(guildId, userId) {
  const stats = userStats(guildId, userId);
  const earned = getEarnedBadges(guildId, userId);
  const fresh = BADGES.filter((b) => !earned.has(b.id) && b.test(stats));
  if (fresh.length) saveBadges(guildId, userId, fresh.map((b) => b.id));
  return fresh;
}

/** Tất cả huy hiệu một người đang có (đã tính cả những huy hiệu mới đạt). */
export function earnedBadges(guildId, userId) {
  awardBadges(guildId, userId);
  const earned = getEarnedBadges(guildId, userId);
  return BADGES.filter((b) => earned.has(b.id));
}
