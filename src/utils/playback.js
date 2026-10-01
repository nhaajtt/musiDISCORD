import { MessageFlags } from "discord.js";
import { errorEmbed, formatDuration, infoEmbed, trackEmbed } from "./embeds.js";
import { getSettings } from "../store.js";
import { applyFairOrder } from "./fairQueue.js";
import { normalizeLocalTrack } from "../library/normalize.js";

async function reject(interaction, message) {
  return interaction.reply({ embeds: [errorEmbed(message)], flags: MessageFlags.Ephemeral });
}

/**
 * Kiểm tra người dùng đang ở kênh thoại, trả lời "đang xử lý" (defer) và trả về player đã kết nối.
 * Trả null (đã phản hồi lỗi) nếu không thể phát.
 */
export async function ensurePlayer(interaction) {
  const voiceChannel = interaction.member.voice?.channel;
  if (!voiceChannel) return reject(interaction, "Bạn cần vào một kênh thoại trước.");

  const manager = interaction.client.lavalink;
  if (!manager.useable) return reject(interaction, "Chưa kết nối được Lavalink, thử lại sau ít giây.");

  let player = manager.getPlayer(interaction.guildId);
  if (player && player.voiceChannelId !== voiceChannel.id) {
    return reject(interaction, "Bot đang phát ở kênh thoại khác.");
  }
  if (player?.getData("quiz")) return reject(interaction, "Đang chơi đố nhạc, hãy đợi hết ván hoặc dùng `/quiz stop`.");

  await interaction.deferReply();

  player ??= manager.createPlayer({
    guildId: interaction.guildId,
    voiceChannelId: voiceChannel.id,
    textChannelId: interaction.channelId,
    selfDeaf: true,
    selfMute: false,
    volume: getSettings(interaction.guildId).defaultVolume,
  });
  if (!player.connected) await player.connect();
  return player;
}

/**
 * Tìm `query` (qua `source`), thêm vào hàng chờ của người dùng và phát nếu đang rảnh.
 */
export async function queueAndPlay(interaction, { query, source }) {
  const player = await ensurePlayer(interaction);
  if (!player) return;

  const res = await player.search({ query, source }, interaction.user);

  if (!res || res.loadType === "error") {
    return interaction.editReply({ embeds: [errorEmbed("Không tải được bài này (có thể bị chặn hoặc lỗi nguồn).")] });
  }
  if (res.loadType === "empty" || !res.tracks.length) {
    return interaction.editReply({ embeds: [errorEmbed("Không tìm thấy kết quả nào.")] });
  }

  res.tracks.forEach(normalizeLocalTrack);

  let reply;
  if (res.loadType === "playlist") {
    await player.queue.add(res.tracks);
    const total = res.tracks.reduce((sum, t) => sum + (t.info.duration || 0), 0);
    reply = infoEmbed(
      `📃 Đã thêm playlist **${res.playlist?.title ?? "Playlist"}** — ${res.tracks.length} bài (${formatDuration(total)})`,
    );
  } else {
    const track = res.tracks[0];
    await player.queue.add(track);
    reply = player.playing || player.queue.tracks.length > 1
      ? trackEmbed(track, "Đã thêm vào hàng chờ")
      : infoEmbed(`🔎 Đã tìm thấy **${track.info.title}**`);
  }

  if (getSettings(interaction.guildId).fairQueue && !player.getData("nhaajt")) await applyFairOrder(player);
  if (!player.playing && !player.paused) await player.play();

  await interaction.editReply({ embeds: [reply] });
}
