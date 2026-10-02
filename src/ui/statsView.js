import { AttachmentBuilder } from "discord.js";
import { earnedBadges } from "../badges.js";
import { renderStatsCard } from "../render/statsCard.js";
import { isOptedOut, userStats } from "../stats.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { localDay } from "../utils/time.js";

export const currentYear = () => Number(localDay(Date.now()).slice(0, 4));

const hours = (ms) => (ms / 3_600_000).toFixed(1).replace(".", ",");

/** Builds and sends the stats card (image) of `target` for an `interaction` that was already deferred. */
export async function replyWithCard(interaction, { kind, year, target, theme, format }) {
  const guildId = interaction.guildId;

  if (isOptedOut(target.id)) {
    return interaction.editReply({ embeds: [infoEmbed(`**${target.username}** has turned off stats, so there is nothing to show. Respect the mystery.`)] });
  }

  const stats = userStats(guildId, target.id, { year: kind === "wrapped" ? year : undefined });
  if (!stats.totalPlays) {
    return interaction.editReply({
      embeds: [errorEmbed(kind === "wrapped" ? `No listening data for ${year} for ${target.username}.` : `${target.username} hasn't listened to anything with the bot on this server yet.`)],
    });
  }

  const member = interaction.guild?.members.cache.get(target.id);
  const png = await renderStatsCard(
    {
    kind,
    year,
    userName: member?.displayName ?? target.globalName ?? target.username,
    guildName: interaction.guild?.name ?? "",
    totalListenMs: stats.totalListenMs,
    totalPlays: stats.totalPlays,
    totalSkips: stats.totalSkips,
    totalRequests: stats.totalRequests,
    topTracks: stats.topTracks.map(({ title, artist, plays }) => ({ title, artist, plays })),
    topArtists: stats.topArtists,
    hourlyPlays: stats.hourlyPlays,
    busiestHour: stats.busiestHour,
    streakDays: stats.streakDays,
    badges: earnedBadges(guildId, target.id).map((b) => ({ icon: b.icon, name: b.name })),
    },
    { theme, format },
  );

  const suffix = format === "story" ? "-story" : "";
  const name = kind === "wrapped" ? `wrapped-${year}${suffix}.png` : `mystats${suffix}.png`;
  const summary = `📊 **${target.username}**: ${hours(stats.totalListenMs)} hours listened • ${stats.totalPlays} tracks${kind === "wrapped" ? ` • ${year}` : ""}`;
  return interaction.editReply({ content: summary, files: [new AttachmentBuilder(png, { name })], allowedMentions: { parse: [] } });
}
