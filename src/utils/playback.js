import { MessageFlags } from "discord.js";
import { config } from "../config.js";
import { errorEmbed, formatDuration, infoEmbed, trackEmbed } from "./embeds.js";
import { getSettings } from "../store.js";
import { applyFairOrder } from "./fairQueue.js";
import { normalizeLocalTrack } from "../library/normalize.js";

async function reject(interaction, message) {
  return interaction.reply({ embeds: [errorEmbed(message)], flags: MessageFlags.Ephemeral });
}

/**
 * Checks the user is in a voice channel, defers the reply and returns the connected player.
 * Returns null (an error reply was already sent) if playback is not possible.
 */
export async function ensurePlayer(interaction) {
  const voiceChannel = interaction.member.voice?.channel;
  if (!voiceChannel) return reject(interaction, "Join a voice channel first, I can't DJ for an empty hallway.");

  const manager = interaction.client.lavalink;
  if (!manager.useable) return reject(interaction, "Not connected to Lavalink yet. Still warming up, try again in a few seconds.");

  let player = manager.getPlayer(interaction.guildId);
  if (player && player.voiceChannelId !== voiceChannel.id) {
    return reject(interaction, "I'm already playing in another voice channel. Join me there, or wait your turn.");
  }
  if (player?.getData("quiz")) return reject(interaction, "A music quiz is in progress, wait for it to end or use `/quiz stop`.");

  // Button presses edit the message they came from; slash commands get a fresh reply
  if (interaction.isButton()) await interaction.deferUpdate();
  else await interaction.deferReply();

  player ??= manager.createPlayer({
    guildId: interaction.guildId,
    voiceChannelId: voiceChannel.id,
    textChannelId: interaction.channelId,
    selfDeaf: config.selfDeaf,
    selfMute: false,
    volume: getSettings(interaction.guildId).defaultVolume,
  });
  if (!player.connected) await player.connect();
  return player;
}

/**
 * Searches for `query` (via `source`), adds it to the user's queue and plays if idle.
 */
export async function queueAndPlay(interaction, { query, source }) {
  const player = await ensurePlayer(interaction);
  if (!player) return;

  const res = await player.search({ query, source }, interaction.user);

  if (!res || res.loadType === "error") {
    return interaction.editReply({ embeds: [errorEmbed("Could not load this track (it may be blocked or the source failed). It said no.")] });
  }
  if (res.loadType === "empty" || !res.tracks.length) {
    return interaction.editReply({ embeds: [errorEmbed("No results found. Even the internet shrugged.")] });
  }

  res.tracks.forEach(normalizeLocalTrack);

  let reply;
  if (res.loadType === "playlist") {
    await player.queue.add(res.tracks);
    const total = res.tracks.reduce((sum, t) => sum + (t.info.duration || 0), 0);
    reply = infoEmbed(
      `📃 Added playlist **${res.playlist?.title ?? "Playlist"}** — ${res.tracks.length} tracks (${formatDuration(total)})`,
    );
  } else {
    reply = await enqueueTrack(player, res.tracks[0], interaction.guildId);
    await interaction.editReply({ embeds: [reply] });
    return;
  }

  await startIfIdle(player, interaction.guildId);
  await interaction.editReply({ embeds: [reply] });
}

async function startIfIdle(player, guildId) {
  if (getSettings(guildId).fairQueue && !player.getData("nhaajt")) await applyFairOrder(player);
  if (!player.playing && !player.paused) await player.play();
}

/** Adds one already-resolved track to the queue, starts playback if idle and returns the embed to show. */
export async function enqueueTrack(player, track, guildId) {
  normalizeLocalTrack(track);
  await player.queue.add(track);
  const queued = player.playing || player.queue.tracks.length > 1;
  await startIfIdle(player, guildId);
  return queued ? trackEmbed(track, "Added to queue") : infoEmbed(`🔎 Found **${track.info.title}**`);
}
