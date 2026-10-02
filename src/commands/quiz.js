import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import * as library from "../library/index.js";
import { startQuiz } from "../quiz/session.js";
import { quizLeaderboard } from "../stats.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { canControl, denyDj, isDj } from "../utils/guards.js";
import { cancelIdleLeave } from "../utils/idle.js";
import { ensurePlayer } from "../utils/playback.js";

const MIN_SONGS = 4;
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
        .addIntegerOption((o) => o.setName("rounds").setDescription("Number of rounds (default 8)").setMinValue(3).setMaxValue(20))
        .addIntegerOption((o) => o.setName("seconds").setDescription("Clip length in seconds (default 20)").setMinValue(10).setMaxValue(40)),
    )
    .addSubcommand((s) => s.setName("stop").setDescription("Stop the running music quiz"))
    .addSubcommand((s) => s.setName("top").setDescription("Music quiz leaderboard for this server")),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "top") {
      const rows = quizLeaderboard(guildId, 10);
      if (!rows.length) return interaction.reply(ephemeral(infoEmbed("Nobody has played the music quiz on this server yet. Try `/quiz start`.")));
      const embed = new EmbedBuilder()
        .setColor(0xf5a524)
        .setTitle("🧠 Music quiz leaderboard")
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
    if (library.size() < MIN_SONGS) {
      return interaction.reply(ephemeral(errorEmbed(`The music library needs at least ${MIN_SONGS} tracks to play the music quiz.`)));
    }

    const existing = interaction.client.lavalink.getPlayer(guildId);
    if (existing && (existing.queue.current || existing.queue.tracks.length)) {
      return interaction.reply(ephemeral(errorEmbed("The bot is playing music. Use `/stop` before starting a music quiz.")));
    }
    if (existing?.getData("quiz")) return interaction.reply(ephemeral(errorEmbed("A music quiz is already running.")));

    const player = await ensurePlayer(interaction);
    if (!player) return;
    cancelIdleLeave(player);

    const rounds = Math.min(interaction.options.getInteger("rounds") ?? 8, library.size());
    const seconds = interaction.options.getInteger("seconds") ?? 20;

    startQuiz({
      client: interaction.client,
      player,
      channel: interaction.channel,
      starter: interaction.user,
      entries: library.all(),
      rounds,
      clipMs: seconds * 1000,
    });

    await interaction.editReply({
      embeds: [
        infoEmbed(
          `🎧 **Music quiz started!** ${rounds} rounds, ${seconds} seconds per clip. Listen to the clip, then press 🎯 to guess the track (or artist). The faster you answer, the more points you get.`,
        ),
      ],
    });
  },
};
