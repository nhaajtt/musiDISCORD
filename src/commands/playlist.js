import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  MAX_TRACKS,
  PlaylistError,
  addTracks,
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  listTracks,
  removeTrack,
  resolvePlaylist,
  toStoredTrack,
  findPlaylist,
} from "../playlists.js";
import { errorEmbed, formatDuration, infoEmbed, safeText } from "../utils/embeds.js";
import { canControl } from "../utils/guards.js";
import { ensurePlayer } from "../utils/playback.js";
import { queuePlaylist } from "../utils/playlistPlayback.js";
import { trackKey } from "../utils/trackKey.js";

const ephemeral = (embed) => ({ embeds: [embed], flags: MessageFlags.Ephemeral });
const SCOPES = [
  { name: "Personal (only you, on every server)", value: "user" },
  { name: "Server (shared by this server)", value: "guild" },
];
const VIEW_LIMIT = 20;

const playlistOption = (o, description) =>
  o.setName("playlist").setDescription(description).setRequired(true).setAutocomplete(true);
const scopeOption = (o) =>
  o.setName("scope").setDescription("Whose playlist (default: personal)").addChoices(...SCOPES);

const ownerOf = (scope, interaction) => (scope === "user" ? interaction.user.id : interaction.guildId);
const scopeLabel = (scope) => (scope === "user" ? "personal" : "server");

export default {
  data: new SlashCommandBuilder()
    .setName("playlist")
    .setDescription("Saved playlists, personal or shared by the server")
    .addSubcommand((s) =>
      s
        .setName("create")
        .setDescription("Create an empty playlist")
        .addStringOption((o) => o.setName("name").setDescription("Playlist name").setRequired(true))
        .addStringOption(scopeOption),
    )
    .addSubcommand((s) =>
      s
        .setName("save")
        .setDescription("Save what is playing and queued into a playlist (created if it doesn't exist)")
        .addStringOption((o) => o.setName("name").setDescription("Playlist name").setRequired(true))
        .addStringOption(scopeOption),
    )
    .addSubcommand((s) =>
      s.setName("add").setDescription("Add the current track to a playlist").addStringOption((o) => playlistOption(o, "Playlist to add to")),
    )
    .addSubcommand((s) =>
      s
        .setName("play")
        .setDescription("Queue a playlist")
        .addStringOption((o) => playlistOption(o, "Playlist to play"))
        .addBooleanOption((o) => o.setName("shuffle").setDescription("Smart shuffle (default: off)")),
    )
    .addSubcommand((s) =>
      s.setName("view").setDescription("Show the tracks in a playlist").addStringOption((o) => playlistOption(o, "Playlist to show")),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a track from a playlist")
        .addStringOption((o) => playlistOption(o, "Playlist to edit"))
        .addIntegerOption((o) => o.setName("position").setDescription("Track number (see /playlist view)").setMinValue(1).setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName("delete").setDescription("Delete a playlist").addStringOption((o) => playlistOption(o, "Playlist to delete")),
    )
    .addSubcommand((s) => s.setName("list").setDescription("List your playlists and the server's playlists")),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const mine = listPlaylists("user", interaction.user.id).map((p) => ({ ...p, tag: "personal" }));
    const shared = interaction.guildId ? listPlaylists("guild", interaction.guildId).map((p) => ({ ...p, tag: "server" })) : [];
    const hits = [...mine, ...shared]
      .filter((p) => p.name.toLowerCase().includes(typed))
      .slice(0, 25)
      .map((p) => ({ name: `${p.name} (${p.tag}, ${p.tracks} tracks)`.slice(0, 100), value: `${p.scope}:${p.id}` }));
    await interaction.respond(hits);
  },

  async execute(interaction) {
    try {
      await run(interaction);
    } catch (error) {
      if (!(error instanceof PlaylistError)) throw error;
      const payload = ephemeral(errorEmbed(error.message));
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
      else await interaction.reply(payload);
    }
  },
};

/** The member may change a playlist if it is theirs, or if it is the server's and they pass the DJ check. */
function canEdit(interaction, playlist) {
  return playlist.scope === "user" || canControl(interaction.member, interaction.guildId);
}

async function run(interaction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  if (sub === "list") {
    const mine = listPlaylists("user", userId);
    const shared = listPlaylists("guild", guildId);
    if (!mine.length && !shared.length) {
      return interaction.reply(ephemeral(infoEmbed("No playlists yet. Create one with `/playlist create` or `/playlist save`. Empty shelves, big potential.")));
    }
    const lines = (rows) => rows.map((p) => `• **${safeText(p.name)}**: ${p.tracks} track${p.tracks === 1 ? "" : "s"}`).join("\n") || "None yet";
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Playlists")
      .addFields({ name: "Personal", value: lines(mine).slice(0, 1024) }, { name: "This server", value: lines(shared).slice(0, 1024) });
    return interaction.reply(ephemeral(embed));
  }

  if (sub === "create" || sub === "save") {
    const scope = interaction.options.getString("scope") ?? "user";
    const name = interaction.options.getString("name", true);
    const ownerId = ownerOf(scope, interaction);
    if (scope === "guild" && !canControl(interaction.member, guildId)) {
      return interaction.reply(ephemeral(errorEmbed("You need the DJ role to change the server's playlists. Ask nicely.")));
    }

    if (sub === "create") {
      const playlist = createPlaylist({ scope, ownerId, name, createdBy: userId });
      return interaction.reply(ephemeral(infoEmbed(`📁 Created the ${scopeLabel(scope)} playlist **${safeText(playlist.name)}**.`)));
    }

    const player = interaction.client.lavalink.getPlayer(guildId);
    const current = player?.queue.current;
    if (!current) return interaction.reply(ephemeral(errorEmbed("Nothing is playing right now. Can't save silence.")));
    const playlist = findPlaylist(scope, ownerId, name) ?? createPlaylist({ scope, ownerId, name, createdBy: userId });
    const tracks = [current, ...player.queue.tracks].map((t) => toStoredTrack(t, trackKey(t)));
    const { added, duplicates, full } = addTracks(playlist.id, tracks);
    const extra = `${duplicates ? ` (${duplicates} already in it)` : ""}${full ? ` The playlist is full (${MAX_TRACKS} tracks).` : ""}`;
    return interaction.reply(ephemeral(infoEmbed(`💾 Saved **${added}** track${added === 1 ? "" : "s"} to **${safeText(playlist.name)}**.${extra}`)));
  }

  // Everything below works on an existing playlist
  const playlist = resolvePlaylist(interaction.options.getString("playlist", true), { userId, guildId });
  if (!playlist) return interaction.reply(ephemeral(errorEmbed("Couldn't find that playlist. Pick one from the list that appears as you type.")));
  const title = safeText(playlist.name);

  if (sub === "view") {
    const rows = listTracks(playlist.id);
    const lines = rows
      .slice(0, VIEW_LIMIT)
      .map((t) => `**${t.position}.** ${safeText(t.title, 70)}${t.artist ? ` — ${safeText(t.artist, 40)}` : ""}${t.duration_ms ? ` \`${formatDuration(t.duration_ms)}\`` : ""}`);
    if (rows.length > VIEW_LIMIT) lines.push(`… and ${rows.length - VIEW_LIMIT} more`);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📁 ${title} (${scopeLabel(playlist.scope)})`)
      .setDescription(lines.join("\n") || "This playlist is empty. A blank mixtape.");
    return interaction.reply(ephemeral(embed));
  }

  if (sub === "play") {
    const rows = listTracks(playlist.id);
    if (!rows.length) return interaction.reply(ephemeral(errorEmbed("This playlist is empty. A blank mixtape.")));
    const player = await ensurePlayer(interaction);
    if (!player) return;
    const { added, missing } = await queuePlaylist(player, rows, interaction.user, {
      shuffle: interaction.options.getBoolean("shuffle") ?? false,
    });
    const note = missing ? ` (${missing} couldn't be loaded)` : "";
    return interaction.editReply({
      embeds: [added ? infoEmbed(`📁 Queued **${added}** track${added === 1 ? "" : "s"} from **${title}**.${note}`) : errorEmbed("None of the tracks could be loaded. They all ghosted me.")],
    });
  }

  if (!canEdit(interaction, playlist)) {
    return interaction.reply(ephemeral(errorEmbed("You need the DJ role to change the server's playlists. Ask nicely.")));
  }

  if (sub === "add") {
    const track = interaction.client.lavalink.getPlayer(guildId)?.queue.current;
    if (!track) return interaction.reply(ephemeral(errorEmbed("Nothing is playing right now. Can't save silence.")));
    const { added, full } = addTracks(playlist.id, [toStoredTrack(track, trackKey(track))]);
    const message = added
      ? `➕ Added **${safeText(track.info.title)}** to **${title}**.`
      : full
        ? `**${title}** is full (${MAX_TRACKS} tracks).`
        : `**${safeText(track.info.title)}** is already in **${title}**.`;
    return interaction.reply(ephemeral(infoEmbed(message)));
  }

  if (sub === "remove") {
    const removed = removeTrack(playlist.id, interaction.options.getInteger("position", true));
    return interaction.reply(
      ephemeral(removed ? infoEmbed(`➖ Removed **${safeText(removed.title)}** from **${title}**.`) : errorEmbed("There is no track at that position.")),
    );
  }

  // delete
  deletePlaylist(playlist.id);
  return interaction.reply(ephemeral(infoEmbed(`🗑️ Deleted the ${scopeLabel(playlist.scope)} playlist **${title}**.`)));
}
