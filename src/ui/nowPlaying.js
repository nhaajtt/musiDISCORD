import {
  AttachmentBuilder,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { getCover } from "../library/index.js";
import { formatDuration, progressBar } from "../utils/embeds.js";
import { localRelativePath } from "../utils/trackKey.js";
import { controlRows } from "./rows.js";

const TICK_MS = 15_000;
const LOOP_LABELS = { off: "", track: " • 🔂 lặp bài", queue: " • 🔁 lặp hàng chờ" };
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

export const V2 = MessageFlags.IsComponentsV2;

const trim = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Màu nhấn riêng cho từng bài, suy ra từ tên bài và nghệ sĩ. */
export function accentFor(seed) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  const h = hash % 360;
  const s = 0.62;
  const l = 0.55;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

/** Xác định ảnh bìa: file đính kèm (ảnh nhúng/ảnh trong thư mục) hoặc đường dẫn web của nguồn. */
export async function resolveCover(track) {
  const rel = localRelativePath(track.info);
  if (rel !== null) {
    const cover = await getCover(rel);
    if (!cover) return null;
    const name = `cover.${EXT[cover.mime] ?? "jpg"}`;
    return { ref: `attachment://${name}`, file: new AttachmentBuilder(cover.buffer, { name }) };
  }
  return /^https?:\/\//i.test(track.info.artworkUrl ?? "") ? { ref: track.info.artworkUrl, file: null } : null;
}

/**
 * Bố cục "Đang phát" (Components V2). `state` = { track, coverRef, finished? }.
 * `finished` bỏ hàng nút và thanh tiến trình, giữ lại thẻ để làm lịch sử.
 */
export function buildNowPlaying(player, state) {
  const { track, coverRef, finished } = state;
  const info = track.info;
  const label = finished ? "ĐÃ PHÁT" : player.paused ? "TẠM DỪNG" : "ĐANG PHÁT";
  const lines = [`-# ${label}`, `### ${trim(info.title, 120)}`, `${trim(info.author || "Không rõ", 80)}${info.album ? ` • ${trim(info.album, 60)}` : ""}`];

  const container = new ContainerBuilder().setAccentColor(accentFor(`${info.title}${info.author}`));
  const head = new TextDisplayBuilder().setContent(lines.join("\n"));
  if (coverRef) {
    container.addSectionComponents(
      new SectionBuilder().addTextDisplayComponents(head).setThumbnailAccessory(new ThumbnailBuilder().setURL(coverRef)),
    );
  } else {
    container.addTextDisplayComponents(head);
  }

  if (!finished) {
    const position = info.isStream ? 0 : Math.min(player.position ?? 0, info.duration ?? 0);
    const time = info.isStream ? "LIVE" : `${formatDuration(position)} / ${formatDuration(info.duration)}`;
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${progressBar(position, info.isStream ? NaN : info.duration, 16)}\n${time}  •  🔊 ${player.volume}%${LOOP_LABELS[player.repeatMode] ?? ""}`,
      ),
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addActionRowComponents(...controlRows(player, track));
  }

  const queued = player.queue.tracks.length;
  const who = track.requester?.username ? `Yêu cầu bởi ${track.requester.username}` : "";
  const footer = [who, !finished && queued ? `${queued} bài đang chờ` : ""].filter(Boolean).join(" • ");
  if (footer) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`));

  return { components: [container], flags: V2 };
}

const stopTicker = (player) => {
  clearInterval(player.getData("npTicker"));
  player.setData("npTicker", undefined);
};

/** Cập nhật lại tin nhắn "Đang phát" (thanh tiến trình, nút bấm). Có `interaction` thì trả lời trực tiếp lượt bấm nút. */
export async function refreshNowPlaying(player, interaction = null) {
  const state = player.getData("npState");
  const message = player.getData("npMessage");
  if (!state || (!message && !interaction)) return;

  const payload = buildNowPlaying(player, state);
  try {
    if (interaction) await interaction.update(payload);
    else await message.edit(payload);
  } catch {
    // tin nhắn đã bị xoá hoặc bot mất quyền: bỏ qua
  }
}

/**
 * Kết thúc tin nhắn "Đang phát" cũ và dừng cập nhật: mặc định biến thành thẻ lịch sử (không còn nút),
 * `remove` thì xoá luôn để kênh không bị đầy khi phát liên tục.
 */
export async function finalizeNowPlaying(player, { remove = false } = {}) {
  stopTicker(player);
  const state = player.getData("npState");
  const message = player.getData("npMessage");
  player.setData("npMessage", undefined);
  player.setData("npState", undefined);
  if (!state || !message) return;
  if (remove) {
    await message.delete().catch(() => {});
    return;
  }
  await message.edit(buildNowPlaying(player, { ...state, finished: true })).catch(() => {});
}

/** Gửi tin nhắn "Đang phát" mới cho bài vừa bắt đầu và bật cập nhật định kỳ. */
export async function sendNowPlaying(client, player, track) {
  await finalizeNowPlaying(player, { remove: true });

  const channel = client.channels.cache.get(player.textChannelId);
  if (!channel) return;

  const cover = await resolveCover(track);
  const state = { track, coverRef: cover?.ref ?? null };
  const payload = buildNowPlaying(player, state);
  if (cover?.file) payload.files = [cover.file];

  const message = await channel.send(payload).catch(() => null);
  if (!message) return;

  player.setData("npState", state);
  player.setData("npMessage", message);
  player.setData(
    "npTicker",
    setInterval(() => {
      if (player.playing && !player.paused) refreshNowPlaying(player);
    }, TICK_MS),
  );
}

/** Dựng payload "Đang phát" để trả lời một lệnh (kèm ảnh bìa nếu có). */
export async function nowPlayingReply(player) {
  const track = player.queue.current;
  if (!track) return null;
  const cover = await resolveCover(track);
  const payload = buildNowPlaying(player, { track, coverRef: cover?.ref ?? null });
  if (cover?.file) payload.files = [cover.file];
  return payload;
}
