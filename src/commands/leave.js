import { SlashCommandBuilder } from "discord.js";
import { getSettings, updateSettings } from "../store.js";
import { infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";
import { is247 } from "../utils/idle.js";

export default {
  data: new SlashCommandBuilder().setName("leave").setDescription("Cho bot rời kênh thoại (và tắt chế độ 24/7 nếu đang bật)"),
  async execute(interaction) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    // Rời hẳn thì không giữ chế độ 24/7 nữa, nếu không bot sẽ tự vào lại sau khi khởi động
    const was247 = is247(player.guildId, player.voiceChannelId) && getSettings(player.guildId).stay247;
    if (was247) updateSettings(player.guildId, { stay247: null });

    await player.destroy();
    await interaction.reply({ embeds: [infoEmbed(was247 ? "👋 Đã rời kênh thoại và tắt chế độ 24/7." : "👋 Đã rời kênh thoại.")] });
  },
};
