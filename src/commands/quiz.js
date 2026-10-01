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
    .setDescription("Đố nhạc: nghe đoạn trích và đoán tên bài trong thư viện nhạc của bot")
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("start")
        .setDescription("Bắt đầu một ván đố nhạc ở kênh thoại bạn đang ở")
        .addIntegerOption((o) => o.setName("rounds").setDescription("Số vòng (mặc định 8)").setMinValue(3).setMaxValue(20))
        .addIntegerOption((o) => o.setName("seconds").setDescription("Độ dài đoạn nhạc, tính bằng giây (mặc định 20)").setMinValue(10).setMaxValue(40)),
    )
    .addSubcommand((s) => s.setName("stop").setDescription("Dừng ván đố nhạc đang chơi"))
    .addSubcommand((s) => s.setName("top").setDescription("Bảng xếp hạng đố nhạc của server")),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "top") {
      const rows = quizLeaderboard(guildId, 10);
      if (!rows.length) return interaction.reply(ephemeral(infoEmbed("Chưa có ai chơi đố nhạc ở server này. Thử `/quiz start` nhé.")));
      const embed = new EmbedBuilder()
        .setColor(0xf5a524)
        .setTitle("🧠 Bảng xếp hạng đố nhạc")
        .setDescription(rows.map((r, i) => `${medal(i)} <@${r.user_id}> • **${r.points}** điểm • ${r.correct} đúng • ${r.games} ván`).join("\n"));
      return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    if (sub === "stop") {
      const player = interaction.client.lavalink.getPlayer(guildId);
      const session = player?.getData("quiz");
      if (!session) return interaction.reply(ephemeral(errorEmbed("Hiện không có ván đố nhạc nào.")));
      if (interaction.user.id !== session.starterId && !isDj(interaction.member, guildId)) {
        return interaction.reply(ephemeral(errorEmbed("Chỉ người bắt đầu ván hoặc DJ mới dừng được.")));
      }
      session.abort();
      return interaction.reply({ embeds: [infoEmbed("🛑 Đang dừng ván đố nhạc…")] });
    }

    if (!canControl(interaction.member, guildId)) return denyDj(interaction);

    if (library.size() === 0) await library.scan();
    if (library.size() < MIN_SONGS) {
      return interaction.reply(ephemeral(errorEmbed(`Thư viện nhạc cần ít nhất ${MIN_SONGS} bài để chơi đố nhạc.`)));
    }

    const existing = interaction.client.lavalink.getPlayer(guildId);
    if (existing && (existing.queue.current || existing.queue.tracks.length)) {
      return interaction.reply(ephemeral(errorEmbed("Bot đang phát nhạc. Hãy `/stop` trước khi bắt đầu đố nhạc.")));
    }
    if (existing?.getData("quiz")) return interaction.reply(ephemeral(errorEmbed("Đang có một ván đố nhạc rồi.")));

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
          `🎧 **Đố nhạc bắt đầu!** ${rounds} vòng, mỗi đoạn ${seconds} giây. Nghe đoạn nhạc rồi bấm 🎯 để đoán tên bài (hoặc nghệ sĩ). Trả lời càng nhanh điểm càng cao.`,
        ),
      ],
    });
  },
};
