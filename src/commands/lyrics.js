import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { showLyrics, stopLive } from "../lyrics/live.js";
import { infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("lyrics")
    .setDescription("Lyrics for the current track (from .lrc files, embedded tags or LRCLIB)")
    .addBooleanOption((o) => o.setName("live").setDescription("Show karaoke-style, highlighting the line being sung")),

  async execute(interaction) {
    const player = await requirePlayer(interaction, { dj: false });
    if (!player) return;

    const live = interaction.options.getBoolean("live") ?? false;
    if (live && stopLive(player)) {
      return interaction.reply({ embeds: [infoEmbed("📜 Live lyrics turned off. Back to humming.")], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: live ? MessageFlags.Ephemeral : undefined });
    await showLyrics(interaction, player, { live });
  },
};
