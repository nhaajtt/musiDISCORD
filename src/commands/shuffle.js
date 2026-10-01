import { SlashCommandBuilder } from "discord.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";

export default {
  data: new SlashCommandBuilder().setName("shuffle").setDescription("Xáo trộn hàng chờ"),
  async execute(interaction) {
    const player = await requirePlayer(interaction);
    if (!player) return;
    if (player.queue.tracks.length < 2) {
      return interaction.reply({ embeds: [errorEmbed("Hàng chờ cần ít nhất 2 bài để xáo trộn.")] });
    }
    await player.queue.shuffle();
    await interaction.reply({ embeds: [infoEmbed("🔀 Đã xáo trộn hàng chờ.")] });
  },
};
