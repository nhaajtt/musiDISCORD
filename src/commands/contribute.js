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
    .setDescription("Submit your music file for the bot owner to review and add to the library")
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("submit")
        .setDescription("Submit one of your music files")
        .addAttachmentOption((o) => o.setName("file").setDescription("Music file (mp3, flac, ogg, opus, m4a, wav...)").setRequired(true))
        .addBooleanOption((o) => o.setName("confirm").setDescription("Choose True if you own this file or are allowed to share it").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("pending").setDescription("(Bot owner) View files awaiting review"))
    .addSubcommand((s) => s.setName("stats").setDescription("(Bot owner) Contribution stats")),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "pending" || sub === "stats") {
      if (!(await isOwner(interaction.client, interaction.user.id))) {
        return interaction.reply(ephemeral(errorEmbed("Only the bot owner can use this command. Nice try, though.")));
      }
      if (sub === "stats") {
        const c = contributionCounts();
        const embed = new EmbedBuilder()
          .setColor(0xf5a524)
          .setTitle("🎁 Contribution stats")
          .setDescription(`Pending: **${c.pending ?? 0}**\nApproved: **${c.approved ?? 0}**\nRejected: **${c.rejected ?? 0}**\nExpired: **${c.expired ?? 0}**`);
        return interaction.reply(ephemeral(embed));
      }

      const rows = listPending(5);
      if (!rows.length) return interaction.reply(ephemeral(infoEmbed("No contributions are awaiting review. Inbox zero.")));
      await interaction.reply(ephemeral(infoEmbed(`Showing the ${rows.length} longest-waiting contributions.`)));
      for (const row of rows) {
        await interaction.followUp({ embeds: [contributionEmbed(row)], components: [reviewButtons(row.id)], flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (!config.contributions.enabled) {
      return interaction.reply(ephemeral(errorEmbed("Contributions are turned off on this bot. The door is closed.")));
    }
    if (!getSettings(interaction.guildId).contributions) {
      return interaction.reply(ephemeral(errorEmbed("Contributions aren't enabled on this server yet. An admin can use `/settings contributions`.")));
    }
    if (!interaction.options.getBoolean("confirm", true)) {
      return interaction.reply(ephemeral(errorEmbed("Quick legal moment: confirm you own this file or may share it (set confirm to True).")));
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
            `✅ Received **${result.title}** (contribution #${result.id}). The bot owner will review it and you'll get a DM with the verdict.${delivered ? "" : "\n(The bot owner couldn't be notified right away, but the file is still in the pending list.)"}${result.similar ? "\n⚠️ This track seems to be in the library already; the bot owner will take that into account." : ""}`,
          ),
        ],
      });
    } catch (error) {
      if (!(error instanceof ContribError)) console.error("Failed to receive contribution:", error);
      await interaction.editReply({ embeds: [errorEmbed(error instanceof ContribError ? error.message : "Something went wrong receiving the file. Not you, probably me. Try again later.")] });
    }
  },
};
