import { SlashCommandBuilder } from "discord.js";
import { currentYear, replyWithCard } from "../ui/statsView.js";

export default {
  data: new SlashCommandBuilder()
    .setName("wrapped")
    .setDescription("Your year-in-music recap card, drawn like a blueprint")
    .addIntegerOption((o) => o.setName("year").setDescription("Year (default: this year)").setMinValue(2020).setMaxValue(2100))
    .addUserOption((o) => o.setName("user").setDescription("User to view (default: you)")),

  async execute(interaction) {
    await interaction.deferReply();
    const year = interaction.options.getInteger("year") ?? currentYear();
    const target = interaction.options.getUser("user") ?? interaction.user;
    await replyWithCard(interaction, { kind: "wrapped", year, target });
  },
};
