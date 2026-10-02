import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import { isOwner } from "../contrib/notify.js";
import { safeText } from "../utils/embeds.js";
import { get } from "./index.js";
import { coverKey } from "./overlay.js";
import { reviewSuggestion, suggestions } from "./worker.js";

const pct = (c) => `${Math.round((c ?? 0) * 100)}%`;

/** Review screen for the first suggestion (or a notice when none are left). */
export function reviewView() {
  const list = suggestions();
  if (!list.length) return { embeds: [new EmbedBuilder().setColor(0x57f287).setDescription("✅ No suggestions waiting for review.")], components: [] };

  const [rel, rec] = list[0];
  const entry = get(rel);
  const key = coverKey(rel);
  const embed = new EmbedBuilder()
    .setColor(0xf5a524)
    .setTitle(`🏷️ Tag suggestion (${list.length} pending)`)
    .addFields(
      { name: "File", value: safeText(rel, 200), inline: false },
      { name: "Current", value: safeText(`${entry?.artist ?? "?"} - ${entry?.title ?? "?"}`, 200), inline: false },
      { name: "Suggestion", value: safeText(`${rec.artist} - ${rec.title}${rec.album ? ` (${rec.album})` : ""}`, 250), inline: false },
      { name: "Source", value: `${rec.source === "acoustid" ? "Audio fingerprint" : "Filename search"} • confidence ${pct(rec.confidence)}`, inline: false },
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`lb:ok:${key}`).setLabel("Apply").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`lb:no:${key}`).setLabel("Skip").setEmoji("🗑️").setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [row] };
}

/** Apply / Skip button press (customId "lb:<ok|no>:<key>"), bot owner only. */
export async function handleLibraryButton(interaction) {
  if (!(await isOwner(interaction.client, interaction.user.id))) {
    return interaction.reply({ content: "Only the bot owner can use this button. Nice try, though.", flags: MessageFlags.Ephemeral });
  }
  const [, action, key] = interaction.customId.split(":");
  const target = suggestions().find(([rel]) => coverKey(rel) === key);
  await interaction.deferUpdate();
  if (target) await reviewSuggestion(target[0], action === "ok");
  await interaction.editReply(reviewView());
}
