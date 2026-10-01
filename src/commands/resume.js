import { SlashCommandBuilder } from "discord.js";
import { infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";

export default {
  data: new SlashCommandBuilder().setName("resume").setDescription("Tiếp tục phát nhạc"),
  async execute(interaction) {
    const player = await requirePlayer(interaction);
    if (!player) return;
    if (!player.paused) return interaction.reply({ embeds: [infoEmbed("▶️ Nhạc đang phát rồi.")] });
    await player.resume();
    await interaction.reply({ embeds: [infoEmbed("▶️ Đã tiếp tục phát.")] });
  },
};
