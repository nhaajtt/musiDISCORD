import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { nowPlayingReply } from "../ui/nowPlaying.js";
import { errorEmbed } from "../utils/embeds.js";

export default {
  data: new SlashCommandBuilder().setName("nowplaying").setDescription("Show the current track"),

  async execute(interaction) {
    const player = interaction.client.lavalink.getPlayer(interaction.guildId);
    const payload = player ? await nowPlayingReply(player) : null;
    if (!payload) {
      return interaction.reply({ embeds: [errorEmbed("Nothing is playing right now.")], flags: MessageFlags.Ephemeral });
    }
    await interaction.reply(payload);
  },
};
