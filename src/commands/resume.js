import { SlashCommandBuilder } from "discord.js";
import { infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";

export default {
  data: new SlashCommandBuilder().setName("resume").setDescription("Resume playback"),
  async execute(interaction) {
    const player = await requirePlayer(interaction);
    if (!player) return;
    if (!player.paused) return interaction.reply({ embeds: [infoEmbed("▶️ The music is already playing. Listen closely.")] });
    await player.resume();
    await interaction.reply({ embeds: [infoEmbed("▶️ Resumed.")] });
  },
};
