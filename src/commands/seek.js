import { SlashCommandBuilder } from "discord.js";
import { errorEmbed, formatDuration, infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("seek")
    .setDescription("Tua tới một thời điểm trong bài")
    .addIntegerOption((o) => o.setName("seconds").setDescription("Giây").setMinValue(0).setRequired(true)),
  async execute(interaction) {
    const player = await requirePlayer(interaction);
    if (!player) return;
    const track = player.queue.current;
    if (!track || !track.info.isSeekable) {
      return interaction.reply({ embeds: [errorEmbed("Bài hiện tại không thể tua.")] });
    }
    const ms = interaction.options.getInteger("seconds", true) * 1000;
    if (ms >= track.info.duration) {
      return interaction.reply({ embeds: [errorEmbed("Thời điểm vượt quá độ dài bài hát.")] });
    }
    await player.seek(ms);
    await interaction.reply({ embeds: [infoEmbed(`⏩ Đã tua tới **${formatDuration(ms)}**`)] });
  },
};
