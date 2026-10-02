import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { currentYear, replyWithCard } from "../ui/statsView.js";

export default {
  data: new SlashCommandBuilder()
    .setName("wrapped")
    .setDescription("Your year-in-music recap card, drawn like a blueprint")
    .addIntegerOption((o) => o.setName("year").setDescription("Year (default: this year)").setMinValue(2020).setMaxValue(2100))
    .addUserOption((o) => o.setName("user").setDescription("User to view (default: you)"))
    .addStringOption((o) =>
      o
        .setName("format")
        .setDescription("Image shape (default: card)")
        .addChoices({ name: "Card", value: "card" }, { name: "Story (9:16, for Instagram or TikTok)", value: "story" }),
    )
    .addStringOption((o) =>
      o.setName("theme").setDescription("Colors (default: dark)").addChoices({ name: "Dark", value: "dark" }, { name: "Light", value: "light" }),
    )
    .addBooleanOption((o) => o.setName("private").setDescription("Only show it to you (default: visible to everyone)")),

  async execute(interaction) {
    const flags = interaction.options.getBoolean("private") ? MessageFlags.Ephemeral : undefined;
    await interaction.deferReply({ flags });
    const year = interaction.options.getInteger("year") ?? currentYear();
    const target = interaction.options.getUser("user") ?? interaction.user;
    await replyWithCard(interaction, {
      kind: "wrapped",
      year,
      target,
      theme: interaction.options.getString("theme") ?? "dark",
      format: interaction.options.getString("format") ?? "card",
    });
  },
};
