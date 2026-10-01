import { SlashCommandBuilder } from "discord.js";
import { requestBump } from "../utils/actions.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("bump")
    .setDescription("Bỏ phiếu đưa một bài trong hàng chờ lên phát kế tiếp")
    .addIntegerOption((o) => o.setName("position").setDescription("Vị trí trong hàng chờ (bắt đầu từ 1)").setMinValue(1).setRequired(true)),

  async execute(interaction) {
    const player = await requirePlayer(interaction, { dj: false });
    if (!player) return;

    const result = await requestBump(player, interaction.member, interaction.options.getInteger("position", true) - 1);
    switch (result.status) {
      case "none":
        return interaction.reply({ embeds: [errorEmbed("Không có bài nào ở vị trí đó.")] });
      case "moved":
        return interaction.reply({
          embeds: [infoEmbed(result.needed ? `⬆️ Đủ ${result.votes}/${result.needed} phiếu, **${result.title}** sẽ phát kế tiếp.` : `⬆️ **${result.title}** sẽ phát kế tiếp.`)],
        });
      case "already":
        return interaction.reply({ embeds: [infoEmbed(`🗳️ Bạn đã bỏ phiếu cho **${result.title}** rồi (${result.votes}/${result.needed}).`)] });
      default:
        return interaction.reply({
          embeds: [infoEmbed(`🗳️ Phiếu cho **${result.title}**: **${result.votes}/${result.needed}**. Cần thêm người đồng ý.`)],
        });
    }
  },
};
