import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { guildLeaderboard, quizLeaderboard } from "../stats.js";
import { infoEmbed } from "../utils/embeds.js";

const hours = (ms) => (ms / 3_600_000).toFixed(1).replace(".", ",");
const medal = (i) => ["🥇", "🥈", "🥉"][i] ?? `**${i + 1}.**`;
const track = (t) => `${t.title}${t.artist ? ` — ${t.artist}` : ""}`.slice(0, 90);

export default {
  data: new SlashCommandBuilder().setName("leaderboard").setDescription("Bảng xếp hạng nghe nhạc của server"),

  async execute(interaction) {
    const board = guildLeaderboard(interaction.guildId, 5);
    const quiz = quizLeaderboard(interaction.guildId, 5);
    if (!board.topListeners.length && !quiz.length) {
      return interaction.reply({ embeds: [infoEmbed("Chưa có dữ liệu. Nghe vài bài cùng bot rồi quay lại nhé.")] });
    }

    const section = (rows, line) => (rows.length ? rows.map((r, i) => `${medal(i)} ${line(r)}`).join("\n") : "Chưa có");
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🏆 Bảng xếp hạng")
      .addFields(
        { name: "Nghe nhiều nhất", value: section(board.topListeners, (r) => `<@${r.userId}> • ${hours(r.ms)} giờ`) },
        { name: "Xếp bài nhiều nhất", value: section(board.topRequesters, (r) => `<@${r.userId}> • ${r.requests} bài`) },
        { name: "Bài nghe nhiều nhất", value: section(board.topTracks, (r) => `${track(r)} • ${r.plays} lượt`) },
        { name: "Được yêu thích nhất", value: section(board.mostLoved, (r) => `${track(r)} • +${r.score}`) },
        { name: "Đố nhạc", value: section(quiz, (r) => `<@${r.user_id}> • ${r.points} điểm`) },
      );
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
