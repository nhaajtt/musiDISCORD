import { awardBadges } from "./badges.js";
import { recordPlay } from "./stats.js";
import { trackKey } from "./utils/trackKey.js";

const MIN_LISTEN_MS = 15_000;

/** Records when a track starts playing. */
export function beginPlay(player, track) {
  if (player.getData("quiz")) return;
  player.setData("playInfo", {
    key: trackKey(track),
    title: track.info.title,
    artist: track.info.author || null,
    durationMs: track.info.isStream ? null : track.info.duration,
    requesterId: track.requester?.id ?? null,
    startedAt: Date.now(),
  });
}

/** Records who skipped the current track (for the "Ruthless" stat). */
export function noteSkip(player, userId) {
  player.setData("skippedBy", userId);
}

function listenersOf(client, player) {
  const channel = client.guilds.cache.get(player.guildId)?.channels.cache.get(player.voiceChannelId);
  return channel ? [...channel.members.filter((m) => !m.user.bot).keys()] : [];
}

/** Announces a user's new badge in the channel that is playing. */
export function announceBadges(client, player, userId) {
  if (!userId) return;
  for (const badge of awardBadges(player.guildId, userId)) {
    client.channels.cache
      .get(player.textChannelId)
      ?.send({ content: `🏅 <@${userId}> just earned the badge **${badge.icon} ${badge.name}** (${badge.hint})`, allowedMentions: { parse: [] } })
      .catch(() => {});
  }
}

/** Records the play when a track ends (finished, skipped or stopped). */
export function endPlay(client, player, payload) {
  const info = player.getData("playInfo");
  player.setData("playInfo", undefined);
  const skippedBy = player.getData("skippedBy");
  player.setData("skippedBy", undefined);
  if (!info || payload?.reason === "loadFailed") return;

  const finished = payload?.reason === "finished";
  const elapsed = Date.now() - info.startedAt;
  const listenedMs = finished ? (info.durationMs ?? elapsed) : Math.min(info.durationMs ?? elapsed, elapsed);
  const skipper = finished ? null : skippedBy;
  const counted = listenedMs >= MIN_LISTEN_MS;
  if (!counted && !skipper) return;

  recordPlay({
    guildId: player.guildId,
    requesterId: info.requesterId,
    skippedBy: skipper,
    trackKey: info.key,
    title: info.title,
    artist: info.artist,
    durationMs: info.durationMs,
    listenedMs,
    listenerIds: counted ? listenersOf(client, player) : [],
  });

  announceBadges(client, player, info.requesterId);
  if (skipper && skipper !== info.requesterId) announceBadges(client, player, skipper);
}
