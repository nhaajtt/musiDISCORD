import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { guildLeaderboard, quizLeaderboard } from "../stats.js";
import { infoEmbed } from "../utils/embeds.js";

const hours = (ms) => (ms / 3_600_000).toFixed(1).replace(".", ",");
const medal = (i) => ["🥇", "🥈", "🥉"][i] ?? `**${i + 1}.**`;
const track = (t) => `${t.title}${t.artist ? ` — ${t.artist}` : ""}`.slice(0, 90);

export default {
  data: new SlashCommandBuilder().setName("leaderboard").setDescription("Listening leaderboard for this server"),

  async execute(interaction) {
    const board = guildLeaderboard(interaction.guildId, 5);
    const quiz = quizLeaderboard(interaction.guildId, 5);
    if (!board.topListeners.length && !quiz.length) {
      return interaction.reply({ embeds: [infoEmbed("No data yet. Listen to a few tracks with the bot and come back.")] });
    }

    const section = (rows, line) => (rows.length ? rows.map((r, i) => `${medal(i)} ${line(r)}`).join("\n") : "None yet");
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🏆 Leaderboard")
      .addFields(
        { name: "Top listeners", value: section(board.topListeners, (r) => `<@${r.userId}> • ${hours(r.ms)} h`) },
        { name: "Most requests", value: section(board.topRequesters, (r) => `<@${r.userId}> • ${r.requests} tracks`) },
        { name: "Most played tracks", value: section(board.topTracks, (r) => `${track(r)} • ${r.plays} plays`) },
        { name: "Most loved", value: section(board.mostLoved, (r) => `${track(r)} • +${r.score}`) },
        { name: "Music quiz", value: section(quiz, (r) => `<@${r.user_id}> • ${r.points} pts`) },
      );
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
