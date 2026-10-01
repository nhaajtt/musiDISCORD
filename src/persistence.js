import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { normalizeLocalTrack } from "./library/normalize.js";
import { is247 } from "./utils/idle.js";

const file = path.join(config.dataDir, "queues.json");
const DECODE_CHUNK = 50;

let lastWritten = "";
let frozen = false;
// Chỉ bắt đầu ghi sau khi đã đọc xong dữ liệu cũ, tránh ghi đè bằng trạng thái rỗng
let restored = false;

const toSaved = (track) => ({
  encoded: track.encoded,
  requester: track.requester ? { id: track.requester.id, username: track.requester.username } : null,
});

/** Chụp trạng thái phát của một player thành dữ liệu có thể ghi ra file. */
export function snapshotPlayer(player) {
  const current = player.queue.current;
  if (!current && player.queue.tracks.length === 0) return null;

  const nhaajt = player.getData("nhaajt") === true;
  return {
    guildId: player.guildId,
    voiceChannelId: player.voiceChannelId,
    textChannelId: player.textChannelId,
    volume: player.volume,
    repeatMode: player.repeatMode,
    paused: player.paused,
    position: current ? Math.round(player.position) : 0,
    current: current ? toSaved(current) : null,
    tracks: player.queue.tracks.map(toSaved),
    nhaajt,
    library: nhaajt ? (player.getData("nhaajtTracks") ?? []).map(toSaved) : [],
  };
}

function write(snapshots) {
  const text = JSON.stringify(snapshots);
  if (text === lastWritten) return;
  mkdirSync(config.dataDir, { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
  lastWritten = text;
}

/** Ghi trạng thái của mọi player đang hoạt động (bỏ qua `exclude`, thường là player vừa bị huỷ). */
export function saveAll(manager, { exclude } = {}) {
  if (frozen || !restored) return;
  const snapshots = {};
  for (const player of manager.players.values()) {
    if (player.guildId === exclude) continue;
    const snap = snapshotPlayer(player);
    if (snap) snapshots[player.guildId] = snap;
  }
  write(snapshots);
}

/** Lưu lần cuối trước khi tắt bot rồi khoá, để việc huỷ player lúc tắt không xoá dữ liệu. */
export function saveAndFreeze(manager) {
  saveAll(manager);
  frozen = true;
}

export function startAutosave(client) {
  if (config.autosaveSeconds <= 0) return;
  setInterval(() => saveAll(client.lavalink), config.autosaveSeconds * 1000).unref();
}

function load() {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") console.error(`Không đọc được ${file}:`, error.message);
    return {};
  }
}

async function decodeAll(player, saved, fallbackRequester) {
  const tracks = [];
  for (let i = 0; i < saved.length; i += DECODE_CHUNK) {
    const chunk = saved.slice(i, i + DECODE_CHUNK);
    const decoded = await player.node.decode.multipleTracks(
      chunk.map((s) => s.encoded),
      fallbackRequester,
    );
    decoded.forEach((track, j) => {
      track.requester = chunk[j]?.requester ?? fallbackRequester;
      tracks.push(normalizeLocalTrack(track));
    });
  }
  return tracks;
}

async function restoreOne(client, snap) {
  const guild = client.guilds.cache.get(snap.guildId);
  const channel = guild?.channels.cache.get(snap.voiceChannelId);
  if (!channel?.isVoiceBased()) return false;
  // Không ai nghe thì không cần vào lại
  if (!is247(snap.guildId, snap.voiceChannelId) && channel.members.filter((m) => !m.user.bot).size === 0) return false;

  const requester = { id: client.user.id, username: client.user.username };
  const player = client.lavalink.createPlayer({
    guildId: snap.guildId,
    voiceChannelId: snap.voiceChannelId,
    textChannelId: snap.textChannelId,
    selfDeaf: true,
    selfMute: false,
    volume: snap.volume,
  });

  try {
    await player.connect();

    const playlist = [snap.current, ...snap.tracks].filter(Boolean);
    if (!playlist.length) return false;
    await player.queue.add(await decodeAll(player, playlist, requester));

    if (snap.nhaajt && snap.library?.length) {
      player.setData("nhaajtTracks", await decodeAll(player, snap.library, requester));
      player.setData("nhaajt", true);
    }
    await player.setRepeatMode(snap.repeatMode ?? "off");
    // Vị trí phải nhỏ hơn độ dài bài, nếu không Lavalink từ chối phát
    const duration = player.queue.current?.info.duration ?? 0;
    const resumeAt = snap.current && duration > 3000 ? Math.min(snap.position, duration - 2000) : 0;
    await player.play({ position: Math.max(0, resumeAt), paused: Boolean(snap.paused) });

    await client.channels.cache
      .get(snap.textChannelId)
      ?.send({ content: "♻️ Bot vừa khởi động lại, đã khôi phục hàng chờ và tiếp tục phát." })
      .catch(() => {});
    return true;
  } catch (error) {
    console.error(`Khôi phục hàng chờ của server ${snap.guildId} thất bại:`, error);
    await player.destroy("RestoreFailed").catch(() => {});
    return false;
  }
}

/** Khôi phục các hàng chờ đã lưu trước lần tắt bot gần nhất. */
export async function restoreQueues(client) {
  try {
    const snapshots = Object.values(load());
    if (!snapshots.length) return;

    let count = 0;
    for (const snap of snapshots) {
      if (await restoreOne(client, snap)) count++;
    }
    console.log(`Đã khôi phục ${count}/${snapshots.length} hàng chờ.`);
  } finally {
    restored = true;
  }
}
