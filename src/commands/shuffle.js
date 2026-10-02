import { SlashCommandBuilder } from "discord.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";

export default {
  data: new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle the queue"),
  async execute(interaction) {
    const player = await requirePlayer(interaction);
    if (!player) return;
    if (player.queue.tracks.length < 2) {
      return interaction.reply({ embeds: [errorEmbed("The queue needs at least 2 tracks to shuffle. One track is already shuffled enough.")] });
    }
    await player.queue.shuffle();
    await interaction.reply({ embeds: [infoEmbed("🔀 Queue shuffled. Even I don't know what's next.")] });
  },
};
