import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { config } from "../config.js";
import { formatDuration, safeText } from "../utils/embeds.js";

let cachedOwners = null;

/** ID những người được duyệt đóng góp: OWNER_IDS nếu có, nếu không thì chủ (hoặc cả nhóm chủ) của ứng dụng bot. */
export async function getOwnerIds(client) {
  if (config.contributions.ownerIds.length) return config.contributions.ownerIds;
  if (cachedOwners) return cachedOwners;

  try {
    await client.application.fetch();
    const owner = client.application.owner;
    cachedOwners = owner?.members ? [...owner.members.keys()] : owner?.id ? [owner.id] : [];
  } catch (error) {
    console.error("Không lấy được chủ bot:", error.message);
    cachedOwners = [];
  }
  return cachedOwners;
}

export async function isOwner(client, userId) {
  return (await getOwnerIds(client)).includes(userId);
}

/** Gửi tin nhắn cho một người: ưu tiên DM, nếu không được thì nhắn ở kênh đã đề xuất (chỉ nhắc đúng người đó). */
export function createNotifier(client) {
  return async (userId, content, channelId = null) => {
    try {
      await client.users.send(userId, { content, allowedMentions: { parse: [] } });
      return true;
    } catch {
      // DM bị chặn
    }
    if (channelId) {
      try {
        await client.channels.cache.get(channelId)?.send({ content: `<@${userId}> ${content}`, allowedMentions: { users: [userId] } });
        return true;
      } catch {
        // mất quyền nhắn ở kênh
      }
    }
    return false;
  };
}

const clip = safeText;

export function contributionEmbed(row, extra = {}) {
  const embed = new EmbedBuilder()
    .setColor(0xf5a524)
    .setTitle(`🎁 Đóng góp #${row.id}`)
    .addFields(
      { name: "Bài", value: clip(row.title, 200) || "—", inline: true },
      { name: "Nghệ sĩ", value: clip(row.artist, 200) || "—", inline: true },
      { name: "Thời lượng", value: formatDuration(row.duration_ms), inline: true },
      { name: "Dung lượng", value: `${(row.size_bytes / 1048576).toFixed(1)} MB`, inline: true },
      { name: "Người gửi", value: row.user_id ? `<@${row.user_id}>` : "(đã xoá)", inline: true },
      { name: "File gốc", value: clip(row.original_name, 120), inline: true },
    )
    .setFooter({ text: `sha256 ${row.sha256.slice(0, 12)}` });
  if (extra.similar) embed.addFields({ name: "⚠️ Có thể trùng với bài đã có", value: clip(extra.similar, 200) });
  return embed;
}

export const reviewButtons = (id) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ct:approve:${id}`).setLabel("Duyệt").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ct:reject:${id}`).setLabel("Từ chối").setEmoji("🗑️").setStyle(ButtonStyle.Danger),
  );

/** Gửi DM cho chủ bot kèm nút Duyệt / Từ chối. Trả về số người nhận được. */
export async function notifyOwnersOfContribution(client, row, extra = {}) {
  let delivered = 0;
  for (const ownerId of await getOwnerIds(client)) {
    try {
      await client.users.send(ownerId, { embeds: [contributionEmbed(row, extra)], components: [reviewButtons(row.id)], allowedMentions: { parse: [] } });
      delivered++;
    } catch {
      // chủ bot chặn DM: dùng /contribute pending
    }
  }
  return delivered;
}
