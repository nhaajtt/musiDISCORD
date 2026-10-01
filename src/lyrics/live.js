import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, MessageFlags } from "discord.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { trackKey } from "../utils/trackKey.js";
import { currentLineIndex, lyricsWindow, paginateLyrics } from "./lrc.js";
import { getLyrics } from "./service.js";

const TICK_MS = 2500;
const PAGE_CHARS = 1500;

const titleOf = (track) => `📜 ${track.info.title}`.slice(0, 250);

function liveEmbed(track, parsed, index, source) {
  const rows = lyricsWindow(parsed.lines, index, { before: 2, after: 3 });
  const body = rows.map((r) => (r.current ? `🎤 **${r.text}**` : `▫️ ${r.text}`)).join("\n");
  return new EmbedBuilder().setColor(0x5865f2).setTitle(titleOf(track)).setDescription(body || "…").setFooter({ text: `Lời: ${source}` });
}

/** Dừng karaoke của một player (nếu đang chạy). */
export function stopLive(player) {
  const live = player.getData("lyricsLive");
  if (!live) return false;
  clearInterval(live.timer);
  player.setData("lyricsLive", undefined);
  live.message?.edit({ embeds: [infoEmbed("📜 Đã kết thúc lời bài hát.")], components: [] }).catch(() => {});
  return true;
}

async function showStatic(interaction, track, parsed, source) {
  const pages = paginateLyrics(parsed.lines, PAGE_CHARS);
  const build = (page) => {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(titleOf(track))
      .setDescription(pages[page])
      .setFooter({ text: `Trang ${page + 1}/${pages.length} • Lời: ${source}` });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ly:prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId("ly:next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= pages.length - 1),
    );
    return { embeds: [embed], components: pages.length > 1 ? [row] : [] };
  };

  let page = 0;
  const message = await interaction.editReply(build(page));
  if (pages.length < 2) return;

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 180_000,
    filter: (i) => i.user.id === interaction.user.id,
  });
  collector.on("collect", async (i) => {
    page += i.customId === "ly:next" ? 1 : -1;
    await i.update(build(page));
  });
  collector.on("end", () => interaction.editReply({ components: [] }).catch(() => {}));
}

/**
 * Hiện lời bài đang phát cho `interaction` (đã deferReply).
 * - `live` và lời có mốc thời gian: gửi một tin nhắn karaoke tự cập nhật theo vị trí phát.
 * - Ngược lại: hiện toàn bộ lời, chia trang.
 */
export async function showLyrics(interaction, player, { live = false } = {}) {
  const track = player.queue.current;
  if (!track) return interaction.editReply({ embeds: [errorEmbed("Hiện không có bài nào đang phát.")] });

  const found = await getLyrics(track);
  if (!found) {
    return interaction.editReply({ embeds: [errorEmbed("Không tìm thấy lời cho bài này. Bạn có thể đặt file .lrc cùng tên cạnh file nhạc.")] });
  }
  const { parsed, source } = found;

  if (!live || !parsed.synced) {
    if (live) await interaction.followUp({ embeds: [infoEmbed("Lời bài này không có mốc thời gian nên hiện dạng đọc.")], flags: MessageFlags.Ephemeral }).catch(() => {});
    return showStatic(interaction, track, parsed, source);
  }

  stopLive(player);
  const channel = interaction.channel;
  const key = trackKey(track);
  const message = await channel.send({ embeds: [liveEmbed(track, parsed, currentLineIndex(parsed.lines, player.position), source)] });
  await interaction.editReply({ embeds: [infoEmbed("🎤 Đã bật lời bài hát trực tiếp. Bấm 📜 lần nữa hoặc đổi bài để tắt.")] });

  let lastIndex = -2;
  const timer = setInterval(() => {
    const now = player.queue.current;
    if (!now || trackKey(now) !== key) return stopLive(player);
    if (player.paused) return;

    const index = currentLineIndex(parsed.lines, player.position);
    if (index === lastIndex) return;
    lastIndex = index;
    message.edit({ embeds: [liveEmbed(now, parsed, index, source)] }).catch(() => stopLive(player));
  }, TICK_MS);
  timer.unref?.();

  player.setData("lyricsLive", { timer, message, key });
}
