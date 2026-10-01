import { getSettings } from "../store.js";

const lastText = new Map();
const warned = new Set();

/** Ghi trạng thái cho kênh thoại ("Đang phát: ..."). Cần quyền Set Voice Channel Status, thiếu quyền thì bỏ qua. */
export async function setVoiceStatus(client, channelId, text) {
  if (!channelId || lastText.get(channelId) === text) return;
  lastText.set(channelId, text);
  try {
    await client.rest.put(`/channels/${channelId}/voice-status`, { body: { status: text.slice(0, 500) } });
  } catch (error) {
    lastText.delete(channelId);
    if (!warned.has(channelId)) {
      warned.add(channelId);
      console.warn(`Không đặt được trạng thái kênh thoại ${channelId}: ${error.message}`);
    }
  }
}

const trim = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Cập nhật trạng thái kênh theo bài đang phát (nếu server bật vc-status). */
export function announceTrack(client, player, track) {
  if (!getSettings(player.guildId).vcStatus || !player.voiceChannelId) return;
  const { title, author } = track.info;
  return setVoiceStatus(client, player.voiceChannelId, `🎵 ${trim(title, 120)}${author ? ` — ${trim(author, 80)}` : ""}`);
}

/** Xoá trạng thái kênh thoại. */
export function clearVoiceStatus(client, player) {
  if (!player.voiceChannelId) return;
  return setVoiceStatus(client, player.voiceChannelId, "");
}
