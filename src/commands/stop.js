import { SlashCommandBuilder } from "discord.js";
import { infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";
import { stopPlayback } from "../utils/actions.js";

export default {
  data: new SlashCommandBuilder().setName("stop").setDescription("Stop playback and clear the queue"),
  async execute(interaction) {
    const player = await requirePlayer(interaction);
    if (!player) return;
    await stopPlayback(player);
    await interaction.reply({ embeds: [infoEmbed("⏹️ Stopped and cleared the queue. Mic drop.")] });
  },
};
