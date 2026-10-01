import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { ratingTotals } from "../stats.js";
import { trackKey } from "../utils/trackKey.js";

const btn = (id, emoji, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(`np:${id}`).setEmoji(emoji).setStyle(style);

/** Hai hàng nút dưới tin nhắn "Đang phát": điều khiển và phản hồi (👍 👎 ❤️ 📜). */
export function controlRows(player, track) {
  const looping = player.repeatMode !== "off";
  const key = track ? trackKey(track) : null;
  const totals = key ? ratingTotals(player.guildId, key) : { up: 0, down: 0 };

  const controls = new ActionRowBuilder().addComponents(
    btn("pause", player.paused ? "▶️" : "⏸️", ButtonStyle.Primary),
    btn("skip", "⏭️"),
    btn("stop", "⏹️", ButtonStyle.Danger),
    btn("loop", player.repeatMode === "track" ? "🔂" : "🔁", looping ? ButtonStyle.Success : ButtonStyle.Secondary),
    btn("shuffle", "🔀"),
  );

  const up = btn("up", "👍");
  const down = btn("down", "👎");
  if (totals.up) up.setLabel(String(totals.up));
  if (totals.down) down.setLabel(String(totals.down));

  const feedback = new ActionRowBuilder().addComponents(
    up,
    down,
    btn("fav", "❤️"),
    btn("lyrics", "📜"),
  );

  return [controls, feedback];
}
