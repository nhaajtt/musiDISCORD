import { SlashCommandBuilder } from "discord.js";
import { getSettings, updateSettings } from "../store.js";
import { infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";
import { is247 } from "../utils/idle.js";

export default {
  data: new SlashCommandBuilder().setName("leave").setDescription("Make the bot leave the voice channel (and turn off 24/7 mode if on)"),
  async execute(interaction) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    // Leaving for good drops 24/7 mode, otherwise the bot would rejoin after a restart
    const was247 = is247(player.guildId, player.voiceChannelId) && getSettings(player.guildId).stay247;
    if (was247) updateSettings(player.guildId, { stay247: null });

    await player.destroy();
    await interaction.reply({ embeds: [infoEmbed(was247 ? "👋 Left the voice channel and turned off 24/7 mode. Gone, but not forgotten." : "👋 Left the voice channel. Smooth exit.")] });
  },
};
