import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { nowPlayingReply } from "../ui/nowPlaying.js";
import { errorEmbed } from "../utils/embeds.js";

export default {
  data: new SlashCommandBuilder().setName("nowplaying").setDescription("Xem bài đang phát"),

  async execute(interaction) {
    const player = interaction.client.lavalink.getPlayer(interaction.guildId);
    const payload = player ? await nowPlayingReply(player) : null;
    if (!payload) {
      return interaction.reply({ embeds: [errorEmbed("Hiện không có bài nào đang phát.")], flags: MessageFlags.Ephemeral });
    }
    await interaction.reply(payload);
  },
};
