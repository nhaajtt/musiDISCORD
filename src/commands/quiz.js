import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import * as library from "../library/index.js";
import { MODES, eligibleFor } from "../quiz/engine.js";
import { startQuiz } from "../quiz/session.js";
import { quizLeaderboard, seasonLeaderboard, seasonOf } from "../stats.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { canControl, denyDj, isDj } from "../utils/guards.js";
import { cancelIdleLeave } from "../utils/idle.js";
import { ensurePlayer } from "../utils/playback.js";

const MIN_SONGS = 4;
/** The month before the current one, as "YYYY-MM". */
function previousSeason() {
  const [year, month] = seasonOf().split("-").map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

const medal = (i) => ["🥇", "🥈", "🥉"][i] ?? `**${i + 1}.**`;
const ephemeral = (embed) => ({ embeds: [embed], flags: MessageFlags.Ephemeral });

export default {
  data: new SlashCommandBuilder()
    .setName("quiz")
    .setDescription("Music quiz: listen to a clip and guess the track from the bot's music library")
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("start")
        .setDescription("Start a music quiz in the voice channel you are in")
        .addStringOption((o) =>
          o
            .setName("mode")
            .setDescription("What to guess (default: the song)")
            .addChoices(...Object.entries(MODES).map(([value, { label }]) => ({ name: label, value }))),
        )
        .addIntegerOption((o) => o.setName("rounds").setDescription("Number of rounds (default 8)").setMinValue(3).setMaxValue(20))
        .addIntegerOption((o) => o.setName("seconds").setDescription("Clip length in seconds (default 20)").setMinValue(10).setMaxValue(40)),
    )
    .addSubcommand((s) => s.setName("stop").setDescription("Stop the running music quiz"))
    .addSubcommand((s) =>
      s
        .setName("top")
        .setDescription("Music quiz leaderboard for this server")
        .addStringOption((o) =>
          o
            .setName("period")
            .setDescription("Which ranking (default: this month)")
            .addChoices(
              { name: "This month", value: "month" },
              { name: "Last month", value: "last" },
              { name: "All time", value: "all" },
            ),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "top") {
      const period = interaction.options.getString("period") ?? "month";
      const season = period === "last" ? previousSeason() : seasonOf();
      const rows = period === "all" ? quizLeaderboard(guildId, 10) : seasonLeaderboard(guildId, season, 10);
      if (!rows.length) {
        const where = period === "all" ? "yet" : period === "last" ? "last month" : "this month";
        return interaction.reply(ephemeral(infoEmbed(`Nobody has played the music quiz on this server ${where}. Try \`/quiz start\`.`)));
      }
      const title = period === "all" ? "All time" : period === "last" ? `Season ${season}` : `This month (${season})`;
      const embed = new EmbedBuilder()
        .setColor(0xf5a524)
        .setTitle(`🧠 Music quiz leaderboard: ${title}`)
        .setFooter({ text: period === "all" ? "A new season starts every month. The top player of each month earns the Season Champion badge." : "Seasons reset on the 1st of each month." })
        .setDescription(rows.map((r, i) => `${medal(i)} <@${r.user_id}> • **${r.points}** pts • ${r.correct} correct • ${r.games} games`).join("\n"));
      return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    if (sub === "stop") {
      const player = interaction.client.lavalink.getPlayer(guildId);
      const session = player?.getData("quiz");
      if (!session) return interaction.reply(ephemeral(errorEmbed("There's no music quiz running right now.")));
      if (interaction.user.id !== session.starterId && !isDj(interaction.member, guildId)) {
        return interaction.reply(ephemeral(errorEmbed("Only the person who started the game or a DJ can stop it.")));
      }
      session.abort();
      return interaction.reply({ embeds: [infoEmbed("🛑 Stopping the music quiz…")] });
    }

    if (!canControl(interaction.member, guildId)) return denyDj(interaction);

    if (library.size() === 0) await library.scan();
    const mode = interaction.options.getString("mode") ?? "title";
    if (eligibleFor(library.all(), mode).length < MIN_SONGS) {
      const need = { year: "with a release year tag", artist: "with an artist", title: "", lyrics: "" }[mode];
      return interaction.reply(ephemeral(errorEmbed(`The music library needs at least ${MIN_SONGS} tracks ${need ? need + " " : ""}to play this mode.`)));
    }

    const existing = interaction.client.lavalink.getPlayer(guildId);
    if (existing && (existing.queue.current || existing.queue.tracks.length)) {
      return interaction.reply(ephemeral(errorEmbed("The bot is playing music. Use `/stop` before starting a music quiz.")));
    }
    if (existing?.getData("quiz")) return interaction.reply(ephemeral(errorEmbed("A music quiz is already running.")));

    const player = await ensurePlayer(interaction);
    if (!player) return;
    cancelIdleLeave(player);

    const rounds = Math.min(interaction.options.getInteger("rounds") ?? 8, eligibleFor(library.all(), mode).length);
    const seconds = interaction.options.getInteger("seconds") ?? 20;

    startQuiz({
      client: interaction.client,
      player,
      channel: interaction.channel,
      starter: interaction.user,
      entries: library.all(),
      rounds,
      mode,
      clipMs: seconds * 1000,
    });

    await interaction.editReply({
      embeds: [
        infoEmbed(
          `🎧 **Music quiz started: ${MODES[mode].label}!** ${rounds} rounds, ${seconds} seconds per clip. Listen to the clip, then press 🎯 to answer. The faster you answer, the more points you get.`,
        ),
      ],
    });
  },
};
