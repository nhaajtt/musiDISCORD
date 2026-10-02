import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { errorEmbed, formatDuration, safeText } from "../utils/embeds.js";
import { createSearchSession } from "../utils/searchSession.js";

const URL_RE = /^https?:\/\//i;
const MAX_RESULTS = 10;

/** Numbered buttons (five per row) plus a cancel button. */
function resultRows(token, count) {
  const rows = [];
  for (let start = 0; start < count; start += 5) {
    const row = new ActionRowBuilder();
    for (let i = start; i < Math.min(start + 5, count); i++) {
      row.addComponents(
        new ButtonBuilder().setCustomId(`sr:${token}:${i}`).setLabel(String(i + 1)).setStyle(ButtonStyle.Primary),
      );
    }
    rows.push(row);
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sr:${token}:x`).setLabel("Cancel").setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

function resultsEmbed(query, tracks) {
  const lines = tracks.map(
    (t, i) => `**${i + 1}.** ${safeText(t.info.title, 70)} — ${safeText(t.info.author, 40)} \`${formatDuration(t.info.duration)}\``,
  );
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Results for "${safeText(query, 60)}"`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Press a number to add that track. This menu expires in 60 seconds." });
}

export default {
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search for a song and pick which result to play")
    .addStringOption((o) => o.setName("query").setDescription("Song name or artist").setRequired(true))
    .addStringOption((o) =>
      o
        .setName("source")
        .setDescription("Where to search (default: YouTube)")
        .addChoices(
          { name: "YouTube", value: "ytsearch" },
          { name: "YouTube Music", value: "ytmsearch" },
          { name: "SoundCloud", value: "scsearch" },
          { name: "Spotify", value: "spsearch" },
        ),
    ),

  async execute(interaction) {
    const query = interaction.options.getString("query", true);
    const source = interaction.options.getString("source") ?? "ytsearch";
    const fail = (message) => interaction.reply({ embeds: [errorEmbed(message)], flags: MessageFlags.Ephemeral });

    if (URL_RE.test(query)) return fail("That looks like a link. Use `/play` to play a link directly.");
    if (!interaction.member.voice?.channel) return fail("Join a voice channel first. I don't do street performances.");

    const manager = interaction.client.lavalink;
    if (!manager.useable) return fail("Not connected to Lavalink yet. Still warming up, try again in a few seconds.");

    await interaction.deferReply();
    const player = manager.getPlayer(interaction.guildId);
    const node = manager.nodeManager.leastUsedNodes()[0];
    const res = await (player ?? node).search({ query, source }, interaction.user).catch(() => null);
    const tracks = res?.loadType === "search" ? res.tracks.slice(0, MAX_RESULTS) : [];
    if (!tracks.length) return interaction.editReply({ embeds: [errorEmbed("No results found. Even the internet shrugged.")] });

    const token = createSearchSession({ userId: interaction.user.id, tracks, interaction });
    await interaction.editReply({ embeds: [resultsEmbed(query, tracks)], components: resultRows(token, tracks.length) });
  },
};
