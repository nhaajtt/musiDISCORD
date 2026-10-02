import { SlashCommandBuilder } from "discord.js";
import { infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Adjust the volume")
    .addIntegerOption((o) =>
      o.setName("level").setDescription("Volume from 1 to 150").setMinValue(1).setMaxValue(150).setRequired(true),
    ),
  async execute(interaction) {
    const player = await requirePlayer(interaction);
    if (!player) return;
    const level = interaction.options.getInteger("level", true);
    await player.setVolume(level);
    await interaction.reply({ embeds: [infoEmbed(`🔊 Volume: **${level}%**`)] });
  },
};
