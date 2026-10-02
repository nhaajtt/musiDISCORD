import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { createNotifier, isOwner } from "../contrib/notify.js";
import {
  MAX_OPEN_PER_USER,
  MAX_TEXT,
  addRequest,
  closeRequest,
  displayOf,
  getRequest,
  listMine,
  listOpen,
  notifyFulfilled,
  removeOwn,
  voteRequest,
} from "../contrib/requests.js";
import { errorEmbed, infoEmbed, safeText } from "../utils/embeds.js";

const ephemeral = (embed) => ({ embeds: [embed], flags: MessageFlags.Ephemeral });
const line = (r) => `**#${r.id}** ${displayOf(r)} • 👍 ${r.votes}`;

export default {
  data: new SlashCommandBuilder()
    .setName("request")
    .setDescription("Suggest a track that isn't in the library; the bot tells you when it shows up")
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Suggest a track (name or YouTube/Spotify/SoundCloud link; the bot downloads nothing)")
        .addStringOption((o) => o.setName("query").setDescription("Track + artist name, or a link").setRequired(true).setMaxLength(MAX_TEXT)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("Most-voted suggestions"))
    .addSubcommand((s) =>
      s.setName("vote").setDescription("Vote for a suggestion").addIntegerOption((o) => o.setName("id").setDescription("Suggestion number").setMinValue(1).setRequired(true)),
    )
    .addSubcommand((s) => s.setName("mine").setDescription("Suggestions you created or voted for"))
    .addSubcommand((s) =>
      s.setName("remove").setDescription("Delete your suggestion").addIntegerOption((o) => o.setName("id").setDescription("Suggestion number").setMinValue(1).setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName("done").setDescription("(Bot owner) Mark a track as added and notify the requester").addIntegerOption((o) => o.setName("id").setDescription("Suggestion number").setMinValue(1).setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName("dismiss").setDescription("(Bot owner) Dismiss a suggestion").addIntegerOption((o) => o.setName("id").setDescription("Suggestion number").setMinValue(1).setRequired(true)),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === "add") {
      const result = addRequest({
        input: interaction.options.getString("query", true),
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId,
      });
      const r = result.request;
      switch (result.status) {
        case "invalid":
          return interaction.reply(ephemeral(errorEmbed("Enter a track name (at least 2 letters) or a valid YouTube, Spotify or SoundCloud link.")));
        case "in-library":
          return interaction.reply(ephemeral(infoEmbed(`This track is already in the library: **${safeText(result.entry.title, 120)}**. Use \`/local\` to listen.`)));
        case "limit":
          return interaction.reply(ephemeral(errorEmbed(`You already have ${MAX_OPEN_PER_USER} open suggestions, wait for some to be resolved before suggesting more.`)));
        case "fulfilled":
          return interaction.reply(ephemeral(infoEmbed(`This suggestion has already been fulfilled${r.fulfilled_file ? `: \`${r.fulfilled_file}\`` : ""}. Use \`/local\` to listen.`)));
        case "dismissed":
          return interaction.reply(ephemeral(errorEmbed("The bot owner already dismissed this suggestion.")));
        case "already-voted":
          return interaction.reply(ephemeral(infoEmbed(`You already voted for this suggestion (👍 ${r.votes}).`)));
        case "voted":
          return interaction.reply({ embeds: [infoEmbed(`👍 Someone already suggested this track, your vote was counted: ${line({ ...r, votes: r.votes + 1 })}`)], allowedMentions: { parse: [] } });
        default:
          return interaction.reply({
            embeds: [infoEmbed(`📝 Suggestion recorded ${line(r)}. When the track is in the library, the bot will let you know. Others can use \`/request vote ${r.id}\` to back it.`)],
            allowedMentions: { parse: [] },
          });
      }
    }

    if (sub === "list" || sub === "mine") {
      const rows = sub === "list" ? listOpen(10) : listMine(userId);
      if (!rows.length) return interaction.reply(ephemeral(infoEmbed(sub === "list" ? "No suggestions yet." : "You have no open suggestions.")));
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(sub === "list" ? "📝 Most-supported suggestions" : "📝 Your suggestions")
        .setDescription(rows.map(line).join("\n").slice(0, 4000));
      return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    if (sub === "vote") {
      const result = voteRequest(interaction.options.getInteger("id", true), userId);
      if (result.status === "none") return interaction.reply(ephemeral(errorEmbed("No open suggestion with that number.")));
      if (result.status === "already-voted") return interaction.reply(ephemeral(infoEmbed("You already voted for this suggestion.")));
      return interaction.reply({ embeds: [infoEmbed(`👍 Vote recorded: ${line({ ...result.request, votes: result.request.votes + 1 })}`)], allowedMentions: { parse: [] } });
    }

    if (sub === "remove") {
      return interaction.reply(
        ephemeral(removeOwn(interaction.options.getInteger("id", true), userId) ? infoEmbed("🗑️ Your suggestion was deleted.") : errorEmbed("You can only delete suggestions you created that are still open.")),
      );
    }

    // done / dismiss: bot owner only
    if (!(await isOwner(interaction.client, userId))) {
      return interaction.reply(ephemeral(errorEmbed("Only the bot owner can use this command.")));
    }
    const id = interaction.options.getInteger("id", true);
    const request = getRequest(id);
    if (!request || request.status !== "open") return interaction.reply(ephemeral(errorEmbed("No open suggestion with that number.")));

    if (sub === "dismiss") {
      closeRequest(id, "dismissed");
      return interaction.reply(ephemeral(infoEmbed(`Dismissed suggestion #${id}.`)));
    }

    closeRequest(id, "fulfilled");
    await interaction.reply(ephemeral(infoEmbed(`✅ Marked #${id} as done, notifying the requester.`)));
    await notifyFulfilled(createNotifier(interaction.client), [{ request, entry: { title: request.display, file: null } }]);
  },
};
