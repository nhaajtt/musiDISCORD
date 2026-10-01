import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { showLyrics, stopLive } from "../lyrics/live.js";
import { infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("lyrics")
    .setDescription("Lời bài đang phát (từ file .lrc, thẻ trong file hoặc LRCLIB)")
    .addBooleanOption((o) => o.setName("live").setDescription("Hiện dạng karaoke, tô sáng dòng đang hát")),

  async execute(interaction) {
    const player = await requirePlayer(interaction, { dj: false });
    if (!player) return;

    const live = interaction.options.getBoolean("live") ?? false;
    if (live && stopLive(player)) {
      return interaction.reply({ embeds: [infoEmbed("📜 Đã tắt lời bài hát trực tiếp.")], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: live ? MessageFlags.Ephemeral : undefined });
    await showLyrics(interaction, player, { live });
  },
};
