import { SlashCommandBuilder } from "discord.js";
import { infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";

const LABELS = { off: "Tắt lặp", track: "Lặp bài hiện tại", queue: "Lặp cả hàng chờ" };

export default {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Chế độ lặp")
    .addStringOption((o) =>
      o
        .setName("mode")
        .setDescription("Chế độ lặp")
        .setRequired(true)
        .addChoices(
          { name: LABELS.off, value: "off" },
          { name: LABELS.track, value: "track" },
          { name: LABELS.queue, value: "queue" },
        ),
    ),
  async execute(interaction) {
    const player = await requirePlayer(interaction);
    if (!player) return;
    const mode = interaction.options.getString("mode", true);
    await player.setRepeatMode(mode);
    await interaction.reply({ embeds: [infoEmbed(`🔁 ${LABELS[mode]}`)] });
  },
};
