import { SlashCommandBuilder } from "discord.js";
import { errorEmbed, formatDuration, infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("seek")
    .setDescription("Seek to a point in the track")
    .addIntegerOption((o) => o.setName("seconds").setDescription("Seconds").setMinValue(0).setRequired(true)),
  async execute(interaction) {
    const player = await requirePlayer(interaction);
    if (!player) return;
    const track = player.queue.current;
    if (!track || !track.info.isSeekable) {
      return interaction.reply({ embeds: [errorEmbed("The current track can't be seeked.")] });
    }
    const ms = interaction.options.getInteger("seconds", true) * 1000;
    if (ms >= track.info.duration) {
      return interaction.reply({ embeds: [errorEmbed("That position is past the end of the track.")] });
    }
    await player.seek(ms);
    await interaction.reply({ embeds: [infoEmbed(`⏩ Seeked to **${formatDuration(ms)}**`)] });
  },
};
