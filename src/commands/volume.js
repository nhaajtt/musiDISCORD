import { SlashCommandBuilder } from "discord.js";
import { infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Chỉnh âm lượng")
    .addIntegerOption((o) =>
      o.setName("level").setDescription("Âm lượng từ 1 đến 150").setMinValue(1).setMaxValue(150).setRequired(true),
    ),
  async execute(interaction) {
    const player = await requirePlayer(interaction);
    if (!player) return;
    const level = interaction.options.getInteger("level", true);
    await player.setVolume(level);
    await interaction.reply({ embeds: [infoEmbed(`🔊 Âm lượng: **${level}%**`)] });
  },
};
