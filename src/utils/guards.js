import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { getSettings } from "../store.js";
import { errorEmbed } from "./embeds.js";

async function fail(interaction, message) {
  const payload = { embeds: [errorEmbed(message)], flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
  return null;
}

/** A real DJ: has the server's DJ role or the Manage Server permission (unlike canControl: when no DJ role is set, nobody is a DJ). */
export function isDj(member, guildId) {
  const { djRoleId } = getSettings(guildId);
  return member.permissions.has(PermissionFlagsBits.ManageGuild) || Boolean(djRoleId && member.roles.cache.has(djRoleId));
}

/** If the server sets a DJ role, only people with that role (or Manage Server) may control playback. */
export function canControl(member, guildId) {
  const { djRoleId } = getSettings(guildId);
  if (!djRoleId) return true;
  return member.roles.cache.has(djRoleId) || member.permissions.has(PermissionFlagsBits.ManageGuild);
}

export async function denyDj(interaction) {
  const { djRoleId } = getSettings(interaction.guildId);
  return fail(interaction, `You need the <@&${djRoleId}> role to use this command. Velvet rope.`);
}

/**
 * Returns the player if the user is in the bot's voice channel and may control it,
 * otherwise replies with an error and returns null. `dj: false` skips the DJ role check (used for voting, ratings...).
 */
export async function requirePlayer(interaction, { dj = true } = {}) {
  const player = interaction.client.lavalink.getPlayer(interaction.guildId);
  if (!player) return fail(interaction, "Nothing is playing right now. The silence is free, though.");

  const voiceId = interaction.member.voice?.channelId;
  if (!voiceId) return fail(interaction, "Join a voice channel first, I can't DJ for an empty hallway.");
  if (voiceId !== player.voiceChannelId) return fail(interaction, "You must be in the same voice channel as me. I don't do long distance.");
  if (dj && !canControl(interaction.member, interaction.guildId)) return denyDj(interaction);

  return player;
}
