import { SlashCommandBuilder } from "discord.js";
import { replyWithCard } from "../ui/statsView.js";

export default {
  data: new SlashCommandBuilder()
    .setName("mystats")
    .setDescription("Listening stats card for you (or someone else) on this server")
    .addUserOption((o) => o.setName("user").setDescription("User to view (default: you)")),

  async execute(interaction) {
    await interaction.deferReply();
    const target = interaction.options.getUser("user") ?? interaction.user;
    await replyWithCard(interaction, { kind: "profile", target });
  },
};
