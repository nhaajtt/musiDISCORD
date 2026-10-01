import { SlashCommandBuilder } from "discord.js";
import { replyWithCard } from "../ui/statsView.js";

export default {
  data: new SlashCommandBuilder()
    .setName("mystats")
    .setDescription("Thẻ thống kê nghe nhạc của bạn (hoặc của người khác) ở server này")
    .addUserOption((o) => o.setName("user").setDescription("Người muốn xem (mặc định là bạn)")),

  async execute(interaction) {
    await interaction.deferReply();
    const target = interaction.options.getUser("user") ?? interaction.user;
    await replyWithCard(interaction, { kind: "profile", target });
  },
};
