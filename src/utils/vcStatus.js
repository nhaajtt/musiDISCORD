import { getSettings } from "../store.js";

const lastText = new Map();
const warned = new Set();

/** Sets the voice channel status ("Playing: ..."). Needs the Set Voice Channel Status permission; ignored if missing. */
export async function setVoiceStatus(client, channelId, text) {
  if (!channelId || lastText.get(channelId) === text) return;
  lastText.set(channelId, text);
  try {
    await client.rest.put(`/channels/${channelId}/voice-status`, { body: { status: text.slice(0, 500) } });
  } catch (error) {
    lastText.delete(channelId);
    if (!warned.has(channelId)) {
      warned.add(channelId);
      console.warn(`Could not set voice channel status for ${channelId}: ${error.message}`);
    }
  }
}

const trim = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Updates the channel status for the current track (if the server enabled vc-status). */
export function announceTrack(client, player, track) {
  if (!getSettings(player.guildId).vcStatus || !player.voiceChannelId) return;
  const { title, author } = track.info;
  return setVoiceStatus(client, player.voiceChannelId, `🎵 ${trim(title, 120)}${author ? ` — ${trim(author, 80)}` : ""}`);
}

/** Clears the voice channel status. */
export function clearVoiceStatus(client, player) {
  if (!player.voiceChannelId) return;
  return setVoiceStatus(client, player.voiceChannelId, "");
}
