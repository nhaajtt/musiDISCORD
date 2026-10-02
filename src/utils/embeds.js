import { EmbedBuilder, escapeMarkdown } from "discord.js";

const COLOR = 0x5865f2;

/**
 * Prepares user-supplied text for display in a Discord message: escapes markdown as well as [ ] ( ) < >
 * (escapeMarkdown does not escape [text](url) links or <@id> mention syntax).
 */
export function safeText(text, max = 200) {
  return escapeMarkdown(String(text ?? "")).replace(/[\[\]()<>]/g, "\\$&").slice(0, max);
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "LIVE";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const isHttp = (uri) => /^https?:\/\//i.test(uri ?? "");

/** Track title, linked if the track has a web URL (local files only have a path, so no link). */
export function trackLabel(track) {
  const { title, uri } = track.info;
  return isHttp(uri) ? `[${title}](${uri})` : title;
}

export function trackEmbed(track, title = "Now playing") {
  const info = track.info;
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: title })
    .setTitle(info.title)
    .addFields(
      { name: "Author", value: info.author || "Unknown", inline: true },
      { name: "Duration", value: info.isStream ? "LIVE" : formatDuration(info.duration), inline: true },
    );
  if (isHttp(info.uri)) embed.setURL(info.uri);
  if (info.artworkUrl) embed.setThumbnail(info.artworkUrl);
  if (track.requester?.id) embed.setFooter({ text: `Requested by ${track.requester.username ?? track.requester.id}` });
  return embed;
}

export function errorEmbed(message) {
  return new EmbedBuilder().setColor(0xed4245).setDescription(`❌ ${message}`);
}

export function infoEmbed(message) {
  return new EmbedBuilder().setColor(COLOR).setDescription(message);
}

export function progressBar(position, duration, size = 20) {
  if (!Number.isFinite(duration) || duration <= 0) return "🔴 LIVE";
  const ratio = Math.min(position / duration, 1);
  const filled = Math.round(ratio * size);
  return `${"▬".repeat(filled)}🔘${"▬".repeat(Math.max(size - filled, 0))}`;
}
