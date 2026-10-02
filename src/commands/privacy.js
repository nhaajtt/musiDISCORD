import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { deleteUserData, isOptedOut, setStatsEnabled } from "../stats.js";
import { infoEmbed } from "../utils/embeds.js";

const ephemeral = (embed, extra = {}) => ({ embeds: [embed], flags: MessageFlags.Ephemeral, ...extra });

export default {
  data: new SlashCommandBuilder()
    .setName("privacy")
    .setDescription("Privacy: turn off stats or delete your data")
    .addSubcommand((s) =>
      s
        .setName("stats")
        .setDescription("Turn recording of your listening stats on or off")
        .addBooleanOption((o) => o.setName("enabled").setDescription("true = record stats, false = don't record").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("delete").setDescription("Delete all your data (stats, ratings, favorites, points, badges)")),

  async execute(interaction) {
    const userId = interaction.user.id;

    if (interaction.options.getSubcommand() === "stats") {
      const enabled = interaction.options.getBoolean("enabled", true);
      setStatsEnabled(userId, enabled);
      return interaction.reply(
        ephemeral(
          infoEmbed(
            enabled
              ? "✅ Stats turned on. The bot will record the tracks you listen to and request."
              : "🔒 Stats turned off. From now on the bot won't record what you listen to, request or rate. Existing data is kept until you use `/privacy delete`.",
          ),
        ),
      );
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("privacy:confirm").setLabel("Delete my data").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("privacy:cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary),
    );
    const message = await interaction.reply(
      ephemeral(
        infoEmbed(
          `This permanently deletes your listening stats, ratings, favorites, quiz points and badges. This can't be undone.${isOptedOut(userId) ? "" : "\nAfter deleting, the bot will keep recording new stats unless you turn it off with `/privacy stats`."}`,
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
        await pressed.update({ embeds: [infoEmbed("🗑️ All your data has been deleted.")], components: [] });
      } else {
        await pressed.update({ embeds: [infoEmbed("Cancelled, nothing was deleted.")], components: [] });
      }
    } catch {
      await interaction.editReply({ embeds: [infoEmbed("Confirmation timed out, nothing was deleted.")], components: [] }).catch(() => {});
    }
  },
};
