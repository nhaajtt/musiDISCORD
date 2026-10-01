import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { featuresOf, similarTo } from "../library/worker.js";
import { errorEmbed, infoEmbed, safeText } from "../utils/embeds.js";
import { canControl, denyDj } from "../utils/guards.js";
import { queueFiles } from "../utils/nhaajt.js";
import { ensurePlayer } from "../utils/playback.js";
import { localRelativePath } from "../utils/trackKey.js";

const ephemeral = (embed) => ({ embeds: [embed], flags: MessageFlags.Ephemeral });

export default {
  data: new SlashCommandBuilder()
    .setName("similar")
    .setDescription("Thêm vào hàng chờ các bài trong thư viện có nhịp độ và năng lượng giống bài đang phát")
    .addIntegerOption((o) => o.setName("count").setDescription("Số bài muốn thêm (mặc định 10)").setMinValue(1).setMaxValue(25)),

  async execute(interaction) {
    if (!canControl(interaction.member, interaction.guildId)) return denyDj(interaction);
    if (!config.analysis.enabled) return interaction.reply(ephemeral(errorEmbed("Phân tích âm thanh chưa bật (`ANALYSIS=on` trong .env).")));

    const player = interaction.client.lavalink.getPlayer(interaction.guildId);
    const current = player?.queue.current;
    const rel = current ? localRelativePath(current.info) : null;
    if (!rel) return interaction.reply(ephemeral(errorEmbed("Hãy phát một bài trong thư viện (`/local`) trước.")));
    if (!featuresOf(rel)) return interaction.reply(ephemeral(errorEmbed("Bài này chưa được phân tích, hãy thử lại sau.")));

    const queued = new Set(player.queue.tracks.map((t) => localRelativePath(t.info)));
    const picks = similarTo(rel, 40)
      .filter((e) => !queued.has(e.file))
      .slice(0, interaction.options.getInteger("count") ?? 10);
    if (!picks.length) return interaction.reply(ephemeral(errorEmbed("Chưa tìm được bài giống (thư viện còn ít bài đã phân tích).")));

    const ready = await ensurePlayer(interaction);
    if (!ready) return;
    const added = await queueFiles(ready, picks.map((e) => e.file), interaction.user);
    await interaction.editReply({
      embeds: [infoEmbed(`🧬 Đã thêm **${added}** bài gần nhất với **${safeText(current.info.title, 80)}**: ${picks.slice(0, 3).map((e) => safeText(e.title, 40)).join(", ")}${added > 3 ? "…" : ""}`)],
    });
  },
};
