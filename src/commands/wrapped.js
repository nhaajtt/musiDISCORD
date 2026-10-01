import { SlashCommandBuilder } from "discord.js";
import { currentYear, replyWithCard } from "../ui/statsView.js";

export default {
  data: new SlashCommandBuilder()
    .setName("wrapped")
    .setDescription("Thẻ tổng kết nghe nhạc cả năm của bạn, vẽ như một bản thiết kế")
    .addIntegerOption((o) => o.setName("year").setDescription("Năm (mặc định: năm nay)").setMinValue(2020).setMaxValue(2100))
    .addUserOption((o) => o.setName("user").setDescription("Người muốn xem (mặc định là bạn)")),

  async execute(interaction) {
    await interaction.deferReply();
    const year = interaction.options.getInteger("year") ?? currentYear();
    const target = interaction.options.getUser("user") ?? interaction.user;
    await replyWithCard(interaction, { kind: "wrapped", year, target });
  },
};
