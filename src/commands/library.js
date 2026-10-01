import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { isOwner } from "../contrib/notify.js";
import * as library from "../library/index.js";
import { reviewView } from "../library/handlers.js";
import { forgetTag, progress, runNow, stopWorker, workerState } from "../library/worker.js";
import { errorEmbed, infoEmbed, safeText } from "../utils/embeds.js";

const ephemeral = (embed) => ({ embeds: [embed], flags: MessageFlags.Ephemeral });

export default {
  data: new SlashCommandBuilder()
    .setName("library")
    .setDescription("(Chủ bot) Quản lý thư viện: gắn thẻ tự động, phân tích âm thanh")
    .addSubcommand((s) => s.setName("status").setDescription("Tiến độ gắn thẻ và phân tích"))
    .addSubcommand((s) => s.setName("run").setDescription("Chạy gắn thẻ/phân tích ngay"))
    .addSubcommand((s) => s.setName("stop").setDescription("Dừng tác vụ nền đang chạy"))
    .addSubcommand((s) => s.setName("review").setDescription("Duyệt các gợi ý thẻ có độ tin cậy thấp"))
    .addSubcommand((s) =>
      s.setName("forget").setDescription("Bỏ thẻ gắn tự động của một bài").addStringOption((o) => o.setName("track").setDescription("Tên bài cần bỏ thẻ").setRequired(true).setMaxLength(100)),
    ),

  async execute(interaction) {
    if (!(await isOwner(interaction.client, interaction.user.id))) {
      return interaction.reply(ephemeral(errorEmbed("Chỉ chủ bot dùng được lệnh này.")));
    }
    const sub = interaction.options.getSubcommand();

    if (sub === "status") {
      if (library.size() === 0) await library.scan();
      const p = progress();
      const w = workerState();
      const lines = [
        `📚 **${p.total}** bài • chưa có thẻ: **${p.untagged}**`,
        `🏷️ Gắn thẻ tự động: ${config.autotag.enabled ? "**bật**" : "tắt"}${config.autotag.enabled && !config.autotag.acoustidKey ? " (thiếu `ACOUSTID_KEY`, chỉ tìm theo tên file)" : ""} • đã áp dụng **${p.applied}** • chờ duyệt **${p.suggested}**`,
        `🎚️ Phân tích âm thanh: ${config.analysis.enabled ? "**bật**" : "tắt"} • xong **${p.analyzed}/${p.total}**`,
        config.libraryWorker ? (w.running ? `⏳ Đang chạy: ${w.phase === "tag" ? "gắn thẻ" : "phân tích"} \`${safeText(w.current ?? "", 80)}\`` : "💤 Tác vụ nền đang rảnh") : "ℹ️ Bot này không phải worker (LIBRARY_WORKER=off), chỉ đọc kết quả",
        w.error ? `⚠️ Lỗi gần nhất: ${safeText(w.error, 120)}` : "",
      ].filter(Boolean);
      return interaction.reply(ephemeral(infoEmbed(lines.join("\n"))));
    }

    if (sub === "run" || sub === "stop") {
      if (!config.libraryWorker) return interaction.reply(ephemeral(errorEmbed("Bot này không phải worker (LIBRARY_WORKER=off).")));
      if (sub === "stop") {
        stopWorker();
        return interaction.reply(ephemeral(infoEmbed("⏹️ Đã yêu cầu dừng, tác vụ sẽ dừng sau bài hiện tại.")));
      }
      if (!config.autotag.enabled && !config.analysis.enabled) return interaction.reply(ephemeral(errorEmbed("Chưa bật `AUTOTAG=on` hoặc `ANALYSIS=on` trong .env.")));
      runNow();
      return interaction.reply(ephemeral(infoEmbed("▶️ Đã bắt đầu, xem tiến độ bằng `/library status`.")));
    }

    if (sub === "review") {
      return interaction.reply({ ...reviewView(), flags: MessageFlags.Ephemeral });
    }

    const entry = library.resolve(interaction.options.getString("track", true));
    if (!entry) return interaction.reply(ephemeral(errorEmbed("Không tìm thấy bài đó trong thư viện.")));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ok = await forgetTag(entry.file);
    return interaction.editReply({ embeds: [ok ? infoEmbed(`Đã bỏ thẻ tự động của **${safeText(entry.title, 100)}**.`) : errorEmbed("Bài này chưa có thẻ gắn tự động.")] });
  },
};
