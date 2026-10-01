import { AttachmentBuilder } from "discord.js";
import { earnedBadges } from "../badges.js";
import { renderStatsCard } from "../render/statsCard.js";
import { isOptedOut, userStats } from "../stats.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { localDay } from "../utils/time.js";

export const currentYear = () => Number(localDay(Date.now()).slice(0, 4));

const hours = (ms) => (ms / 3_600_000).toFixed(1).replace(".", ",");

/** Dựng và gửi thẻ thống kê (ảnh) của `target` cho một lượt `interaction` đã deferReply. */
export async function replyWithCard(interaction, { kind, year, target }) {
  const guildId = interaction.guildId;

  if (isOptedOut(target.id)) {
    return interaction.editReply({ embeds: [infoEmbed(`**${target.username}** đã tắt thống kê nên không có dữ liệu để hiển thị.`)] });
  }

  const stats = userStats(guildId, target.id, { year: kind === "wrapped" ? year : undefined });
  if (!stats.totalPlays) {
    return interaction.editReply({
      embeds: [errorEmbed(kind === "wrapped" ? `Chưa có dữ liệu nghe nhạc năm ${year} của ${target.username}.` : `${target.username} chưa nghe bài nào cùng bot ở server này.`)],
    });
  }

  const member = interaction.guild?.members.cache.get(target.id);
  const png = await renderStatsCard({
    kind,
    year,
    userName: member?.displayName ?? target.globalName ?? target.username,
    guildName: interaction.guild?.name ?? "",
    totalListenMs: stats.totalListenMs,
    totalPlays: stats.totalPlays,
    totalSkips: stats.totalSkips,
    totalRequests: stats.totalRequests,
    topTracks: stats.topTracks.map(({ title, artist, plays }) => ({ title, artist, plays })),
    topArtists: stats.topArtists,
    hourlyPlays: stats.hourlyPlays,
    busiestHour: stats.busiestHour,
    streakDays: stats.streakDays,
    badges: earnedBadges(guildId, target.id).map((b) => ({ icon: b.icon, name: b.name })),
  });

  const name = kind === "wrapped" ? `wrapped-${year}.png` : "mystats.png";
  const summary = `📊 **${target.username}**: ${hours(stats.totalListenMs)} giờ nghe • ${stats.totalPlays} bài${kind === "wrapped" ? ` • năm ${year}` : ""}`;
  return interaction.editReply({ content: summary, files: [new AttachmentBuilder(png, { name })], allowedMentions: { parse: [] } });
}
