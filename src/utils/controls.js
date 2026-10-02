import { MessageFlags } from "discord.js";
import { showLyrics, stopLive } from "../lyrics/live.js";
import { announceBadges } from "../recorder.js";
import { addFavorite, isFavorite, isOptedOut, removeFavorite, toggleRating } from "../stats.js";
import { refreshNowPlaying } from "../ui/nowPlaying.js";
import { cycleLoop, describeSkip, requestSkip, stopPlayback } from "./actions.js";
import { errorEmbed, infoEmbed } from "./embeds.js";
import { requirePlayer } from "./guards.js";
import { trackKey } from "./trackKey.js";

const LOOP_LABELS = { off: "Loop off", track: "Loop track", queue: "Loop queue" };

const ephemeral = (message) => ({ embeds: [infoEmbed(message)], flags: MessageFlags.Ephemeral });
const ephemeralError = (message) => ({ embeds: [errorEmbed(message)], flags: MessageFlags.Ephemeral });

/** Buttons that only require being in the same voice channel, no DJ role needed. */
const OPEN_ACTIONS = new Set(["skip", "up", "down", "fav", "lyrics"]);

/** Handles button presses under the "Now playing" message (customId like "np:<action>"). */
export async function handleControl(interaction) {
  const action = interaction.customId.slice(3);

  const player = interaction.client.lavalink.getPlayer(interaction.guildId);
  if (!player) return interaction.reply(ephemeralError("This playback session has ended. The show's over."));

  // Same checks as commands: same voice channel, and DJ permission for control buttons
  if (!(await requirePlayer(interaction, { dj: !OPEN_ACTIONS.has(action) }))) return;

  const track = player.queue.current;

  switch (action) {
    case "pause":
      if (player.paused) await player.resume();
      else await player.pause();
      return refreshNowPlaying(player, interaction);

    case "skip": {
      const result = await requestSkip(player, interaction.member);
      // Votes are reported only to the presser; an actual skip is announced to the channel
      if (result.status === "skipped") return interaction.reply({ embeds: [infoEmbed(describeSkip(result))] });
      return interaction.reply(ephemeral(describeSkip(result)));
    }

    case "stop":
      await interaction.deferUpdate();
      await stopPlayback(player);
      return interaction.followUp(ephemeral("⏹️ Stopped and cleared the queue. Mic drop."));

    case "loop": {
      const mode = await cycleLoop(player);
      await refreshNowPlaying(player, interaction);
      return interaction.followUp(ephemeral(`🔁 ${LOOP_LABELS[mode]}`));
    }

    case "shuffle":
      if (player.queue.tracks.length < 2) return interaction.reply(ephemeralError("The queue needs at least 2 tracks to shuffle. One track is already shuffled enough."));
      await player.queue.shuffle();
      return interaction.reply(ephemeral("🔀 Queue shuffled. Even I don't know what's next."));

    case "up":
    case "down": {
      if (!track) return interaction.reply(ephemeralError("Nothing is playing. The silence is free, though."));
      if (isOptedOut(interaction.user.id)) {
        return interaction.reply(ephemeralError("You have stats turned off, so ratings are unavailable. Turn them back on with `/privacy stats` if you like."));
      }
      const value = toggleRating(interaction.guildId, interaction.user.id, trackKey(track), action === "up" ? 1 : -1);
      await refreshNowPlaying(player, interaction);
      await interaction.followUp(ephemeral(value === 0 ? "Rating removed." : value > 0 ? `👍 You liked **${track.info.title}**. Noted.` : `👎 You disliked **${track.info.title}**. Noted, and I won't take it personally.`));
      return announceBadges(interaction.client, player, interaction.user.id);
    }

    case "fav": {
      if (!track) return interaction.reply(ephemeralError("Nothing is playing. The silence is free, though."));
      const key = trackKey(track);
      if (isFavorite(interaction.user.id, key)) {
        removeFavorite(interaction.user.id, key);
        return interaction.reply(ephemeral(`💔 Removed **${track.info.title}** from your favorites.`));
      }
      addFavorite(interaction.user.id, key, track.info.title, track.info.author);
      return interaction.reply(ephemeral(`❤️ **${track.info.title}** is now a favorite. Use \`/favorites play\` to listen again.`));
    }

    case "lyrics":
      if (stopLive(player)) return interaction.reply(ephemeral("📜 Turned off live lyrics. Back to humming."));
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      return showLyrics(interaction, player, { live: true });
  }
}
