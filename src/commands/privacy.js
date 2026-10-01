import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { deleteUserData, isOptedOut, setStatsEnabled } from "../stats.js";
import { infoEmbed } from "../utils/embeds.js";

const ephemeral = (embed, extra = {}) => ({ embeds: [embed], flags: MessageFlags.Ephemeral, ...extra });

export default {
  data: new SlashCommandBuilder()
    .setName("privacy")
    .setDescription("Quyền riêng tư: tắt thống kê hoặc xoá dữ liệu của bạn")
    .addSubcommand((s) =>
      s
        .setName("stats")
        .setDescription("Bật hoặc tắt việc ghi thống kê nghe nhạc của bạn")
        .addBooleanOption((o) => o.setName("enabled").setDescription("true = ghi thống kê, false = không ghi").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("delete").setDescription("Xoá toàn bộ dữ liệu của bạn (thống kê, đánh giá, yêu thích, điểm, huy hiệu)")),

  async execute(interaction) {
    const userId = interaction.user.id;

    if (interaction.options.getSubcommand() === "stats") {
      const enabled = interaction.options.getBoolean("enabled", true);
      setStatsEnabled(userId, enabled);
      return interaction.reply(
        ephemeral(
          infoEmbed(
            enabled
              ? "✅ Đã bật thống kê. Bot sẽ ghi lại những bài bạn nghe và yêu cầu."
              : "🔒 Đã tắt thống kê. Từ giờ bot không ghi lại bài bạn nghe, yêu cầu hay đánh giá. Dữ liệu cũ vẫn còn cho tới khi bạn dùng `/privacy delete`.",
          ),
        ),
      );
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("privacy:confirm").setLabel("Xoá dữ liệu của tôi").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("privacy:cancel").setLabel("Huỷ").setStyle(ButtonStyle.Secondary),
    );
    const message = await interaction.reply(
      ephemeral(
        infoEmbed(
          `Thao tác này xoá vĩnh viễn thống kê nghe nhạc, đánh giá, bài yêu thích, điểm đố nhạc và huy hiệu của bạn. Không thể hoàn tác.${isOptedOut(userId) ? "" : "\nSau khi xoá, bot vẫn tiếp tục ghi thống kê mới trừ khi bạn tắt bằng `/privacy stats`."}`,
        ),
        { components: [row], withResponse: true },
      ),
    ).then((r) => r.resource?.message ?? interaction.fetchReply());

    try {
      const pressed = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 30_000,
        filter: (i) => i.user.id === userId,
      });
      if (pressed.customId === "privacy:confirm") {
        deleteUserData(userId);
        await pressed.update({ embeds: [infoEmbed("🗑️ Đã xoá toàn bộ dữ liệu của bạn.")], components: [] });
      } else {
        await pressed.update({ embeds: [infoEmbed("Đã huỷ, không có gì bị xoá.")], components: [] });
      }
    } catch {
      await interaction.editReply({ embeds: [infoEmbed("Hết thời gian xác nhận, không có gì bị xoá.")], components: [] }).catch(() => {});
    }
  },
};
