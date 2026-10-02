import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { replyWithCard } from "../ui/statsView.js";

export default {
  data: new SlashCommandBuilder()
    .setName("mystats")
    .setDescription("Listening stats card for you (or someone else) on this server")
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
    const target = interaction.options.getUser("user") ?? interaction.user;
    await replyWithCard(interaction, {
      kind: "profile",
      target,
      theme: interaction.options.getString("theme") ?? "dark",
      format: interaction.options.getString("format") ?? "card",
    });
  },
};
