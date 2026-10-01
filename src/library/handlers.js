import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import { isOwner } from "../contrib/notify.js";
import { safeText } from "../utils/embeds.js";
import { get } from "./index.js";
import { coverKey } from "./overlay.js";
import { reviewSuggestion, suggestions } from "./worker.js";

const pct = (c) => `${Math.round((c ?? 0) * 100)}%`;

/** Màn hình duyệt gợi ý đầu tiên (hoặc thông báo hết). */
export function reviewView() {
  const list = suggestions();
  if (!list.length) return { embeds: [new EmbedBuilder().setColor(0x57f287).setDescription("✅ Không còn gợi ý nào chờ duyệt.")], components: [] };

  const [rel, rec] = list[0];
  const entry = get(rel);
  const key = coverKey(rel);
  const embed = new EmbedBuilder()
    .setColor(0xf5a524)
    .setTitle(`🏷️ Gợi ý thẻ (${list.length} đang chờ)`)
    .addFields(
      { name: "File", value: safeText(rel, 200), inline: false },
      { name: "Hiện tại", value: safeText(`${entry?.artist ?? "?"} - ${entry?.title ?? "?"}`, 200), inline: false },
      { name: "Gợi ý", value: safeText(`${rec.artist} - ${rec.title}${rec.album ? ` (${rec.album})` : ""}`, 250), inline: false },
      { name: "Nguồn", value: `${rec.source === "acoustid" ? "Dấu vân âm thanh" : "Tìm theo tên file"} • tin cậy ${pct(rec.confidence)}`, inline: false },
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`lb:ok:${key}`).setLabel("Áp dụng").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`lb:no:${key}`).setLabel("Bỏ qua").setEmoji("🗑️").setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [row] };
}

/** Bấm nút Áp dụng / Bỏ qua (customId "lb:<ok|no>:<khoá>"), chỉ chủ bot. */
export async function handleLibraryButton(interaction) {
  if (!(await isOwner(interaction.client, interaction.user.id))) {
    return interaction.reply({ content: "Chỉ chủ bot dùng được nút này.", flags: MessageFlags.Ephemeral });
  }
  const [, action, key] = interaction.customId.split(":");
  const target = suggestions().find(([rel]) => coverKey(rel) === key);
  await interaction.deferUpdate();
  if (target) await reviewSuggestion(target[0], action === "ok");
  await interaction.editReply(reviewView());
}
