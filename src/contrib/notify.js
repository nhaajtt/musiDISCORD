import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { config } from "../config.js";
import { formatDuration, safeText } from "../utils/embeds.js";

let cachedOwners = null;

/** IDs of the people who can review contributions: OWNER_IDS if set, otherwise the owner (or owning team) of the bot application. */
export async function getOwnerIds(client) {
  if (config.contributions.ownerIds.length) return config.contributions.ownerIds;
  if (cachedOwners) return cachedOwners;

  try {
    await client.application.fetch();
    const owner = client.application.owner;
    cachedOwners = owner?.members ? [...owner.members.keys()] : owner?.id ? [owner.id] : [];
  } catch (error) {
    console.error("Could not fetch the bot owner:", error.message);
    cachedOwners = [];
  }
  return cachedOwners;
}

export async function isOwner(client, userId) {
  return (await getOwnerIds(client)).includes(userId);
}

/** Message a person: DM first, otherwise post in the channel where it was suggested (mentioning only that person). */
export function createNotifier(client) {
  return async (userId, content, channelId = null) => {
    try {
      await client.users.send(userId, { content, allowedMentions: { parse: [] } });
      return true;
    } catch {
      // DMs are blocked
    }
    if (channelId) {
      try {
        await client.channels.cache.get(channelId)?.send({ content: `<@${userId}> ${content}`, allowedMentions: { users: [userId] } });
        return true;
      } catch {
        // lost permission to post in the channel
      }
    }
    return false;
  };
}

const clip = safeText;

export function contributionEmbed(row, extra = {}) {
  const embed = new EmbedBuilder()
    .setColor(0xf5a524)
    .setTitle(`🎁 Contribution #${row.id}`)
    .addFields(
      { name: "Track", value: clip(row.title, 200) || "—", inline: true },
      { name: "Artist", value: clip(row.artist, 200) || "—", inline: true },
      { name: "Duration", value: formatDuration(row.duration_ms), inline: true },
      { name: "Size", value: `${(row.size_bytes / 1048576).toFixed(1)} MB`, inline: true },
      { name: "Submitted by", value: row.user_id ? `<@${row.user_id}>` : "(deleted)", inline: true },
      { name: "Original file", value: clip(row.original_name, 120), inline: true },
    )
    .setFooter({ text: `sha256 ${row.sha256.slice(0, 12)}` });
  if (extra.similar) embed.addFields({ name: "⚠️ May duplicate an existing track", value: clip(extra.similar, 200) });
  return embed;
}

export const reviewButtons = (id) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ct:approve:${id}`).setLabel("Approve").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ct:reject:${id}`).setLabel("Reject").setEmoji("🗑️").setStyle(ButtonStyle.Danger),
  );

/** DM the bot owner with Approve / Reject buttons. Returns how many people received it. */
export async function notifyOwnersOfContribution(client, row, extra = {}) {
  let delivered = 0;
  for (const ownerId of await getOwnerIds(client)) {
    try {
      await client.users.send(ownerId, { embeds: [contributionEmbed(row, extra)], components: [reviewButtons(row.id)], allowedMentions: { parse: [] } });
      delivered++;
    } catch {
      // the owner blocks DMs: use /contribute pending
    }
  }
  return delivered;
}
