import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { getSettings } from "../store.js";
import { errorEmbed } from "./embeds.js";

async function fail(interaction, message) {
  const payload = { embeds: [errorEmbed(message)], flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
  return null;
}

/** DJ thật sự: có role DJ của server hoặc quyền Manage Server (khác với canControl: khi chưa đặt role DJ thì không ai là DJ). */
export function isDj(member, guildId) {
  const { djRoleId } = getSettings(guildId);
  return member.permissions.has(PermissionFlagsBits.ManageGuild) || Boolean(djRoleId && member.roles.cache.has(djRoleId));
}

/** Nếu server đặt role DJ thì chỉ người có role đó (hoặc quyền Manage Server) mới được điều khiển. */
export function canControl(member, guildId) {
  const { djRoleId } = getSettings(guildId);
  if (!djRoleId) return true;
  return member.roles.cache.has(djRoleId) || member.permissions.has(PermissionFlagsBits.ManageGuild);
}

export async function denyDj(interaction) {
  const { djRoleId } = getSettings(interaction.guildId);
  return fail(interaction, `Bạn cần role <@&${djRoleId}> để dùng lệnh này.`);
}

/**
 * Trả về player nếu người dùng ở cùng kênh thoại với bot và có quyền điều khiển,
 * ngược lại trả lời lỗi và trả null. `dj: false` bỏ kiểm tra role DJ (dùng cho bỏ phiếu, đánh giá...).
 */
export async function requirePlayer(interaction, { dj = true } = {}) {
  const player = interaction.client.lavalink.getPlayer(interaction.guildId);
  if (!player) return fail(interaction, "Hiện không có nhạc nào đang phát.");

  const voiceId = interaction.member.voice?.channelId;
  if (!voiceId) return fail(interaction, "Bạn cần vào một kênh thoại trước.");
  if (voiceId !== player.voiceChannelId) return fail(interaction, "Bạn phải ở cùng kênh thoại với bot.");
  if (dj && !canControl(interaction.member, interaction.guildId)) return denyDj(interaction);

  return player;
}
