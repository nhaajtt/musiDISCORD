import { SlashCommandBuilder } from "discord.js";
import { infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";

export default {
  data: new SlashCommandBuilder().setName("pause").setDescription("Pause the music"),
  async execute(interaction) {
    const player = await requirePlayer(interaction);
    if (!player) return;
    if (player.paused) return interaction.reply({ embeds: [infoEmbed("⏸️ The music is already paused. Maximum pause achieved.")] });
    await player.pause();
    await interaction.reply({ embeds: [infoEmbed("⏸️ Paused. Take your time.")] });
  },
};
