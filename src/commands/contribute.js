import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { ContribError, ingestAttachment } from "../contrib/ingest.js";
import { contributionEmbed, isOwner, notifyOwnersOfContribution, reviewButtons } from "../contrib/notify.js";
import { contributionCounts, getContribution, listPending } from "../contrib/store.js";
import { getSettings } from "../store.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";

const ephemeral = (embed, extra = {}) => ({ embeds: [embed], flags: MessageFlags.Ephemeral, ...extra });

export default {
  data: new SlashCommandBuilder()
    .setName("contribute")
    .setDescription("Gửi file nhạc của bạn để chủ bot duyệt và thêm vào thư viện")
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("submit")
        .setDescription("Gửi một file nhạc của bạn")
        .addAttachmentOption((o) => o.setName("file").setDescription("File nhạc (mp3, flac, ogg, opus, m4a, wav...)").setRequired(true))
        .addBooleanOption((o) => o.setName("confirm").setDescription("Chọn True nếu bạn sở hữu hoặc được phép chia sẻ file này").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("pending").setDescription("(Chủ bot) Xem các file đang chờ duyệt"))
    .addSubcommand((s) => s.setName("stats").setDescription("(Chủ bot) Thống kê đóng góp")),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "pending" || sub === "stats") {
      if (!(await isOwner(interaction.client, interaction.user.id))) {
        return interaction.reply(ephemeral(errorEmbed("Chỉ chủ bot dùng được lệnh này.")));
      }
      if (sub === "stats") {
        const c = contributionCounts();
        const embed = new EmbedBuilder()
          .setColor(0xf5a524)
          .setTitle("🎁 Thống kê đóng góp")
          .setDescription(`Chờ duyệt: **${c.pending ?? 0}**\nĐã duyệt: **${c.approved ?? 0}**\nĐã từ chối: **${c.rejected ?? 0}**\nHết hạn: **${c.expired ?? 0}**`);
        return interaction.reply(ephemeral(embed));
      }

      const rows = listPending(5);
      if (!rows.length) return interaction.reply(ephemeral(infoEmbed("Không có đóng góp nào đang chờ duyệt.")));
      await interaction.reply(ephemeral(infoEmbed(`Đang hiện ${rows.length} đóng góp chờ lâu nhất.`)));
      for (const row of rows) {
        await interaction.followUp({ embeds: [contributionEmbed(row)], components: [reviewButtons(row.id)], flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (!config.contributions.enabled) {
      return interaction.reply(ephemeral(errorEmbed("Tính năng đóng góp đang tắt trên bot này.")));
    }
    if (!getSettings(interaction.guildId).contributions) {
      return interaction.reply(ephemeral(errorEmbed("Server này chưa bật đóng góp. Quản trị viên dùng `/settings contributions`.")));
    }
    if (!interaction.options.getBoolean("confirm", true)) {
      return interaction.reply(ephemeral(errorEmbed("Bạn cần xác nhận mình sở hữu hoặc được phép chia sẻ file này (chọn confirm là True).")));
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const result = await ingestAttachment({
        attachment: interaction.options.getAttachment("file", true),
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });

      const delivered = await notifyOwnersOfContribution(interaction.client, getContribution(result.id), { similar: result.similar });
      await interaction.editReply({
        embeds: [
          infoEmbed(
            `✅ Đã nhận **${result.title}** (đóng góp #${result.id}). Chủ bot sẽ xem và bạn sẽ được báo qua DM khi có kết quả.${delivered ? "" : "\n(Chủ bot chưa nhận được thông báo ngay, file vẫn nằm trong danh sách chờ.)"}${result.similar ? "\n⚠️ Có vẻ bài này đã có trong thư viện, chủ bot sẽ cân nhắc." : ""}`,
          ),
        ],
      });
    } catch (error) {
      if (!(error instanceof ContribError)) console.error("Nhận đóng góp lỗi:", error);
      await interaction.editReply({ embeds: [errorEmbed(error instanceof ContribError ? error.message : "Có lỗi khi nhận file, bạn thử lại sau.")] });
    }
  },
};
