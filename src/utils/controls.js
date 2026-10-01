import { MessageFlags } from "discord.js";
import { showLyrics, stopLive } from "../lyrics/live.js";
import { announceBadges } from "../recorder.js";
import { addFavorite, isFavorite, isOptedOut, removeFavorite, toggleRating } from "../stats.js";
import { refreshNowPlaying } from "../ui/nowPlaying.js";
import { cycleLoop, describeSkip, requestSkip, stopPlayback } from "./actions.js";
import { errorEmbed, infoEmbed } from "./embeds.js";
import { requirePlayer } from "./guards.js";
import { trackKey } from "./trackKey.js";

const LOOP_LABELS = { off: "Tắt lặp", track: "Lặp bài hiện tại", queue: "Lặp cả hàng chờ" };

const ephemeral = (message) => ({ embeds: [infoEmbed(message)], flags: MessageFlags.Ephemeral });
const ephemeralError = (message) => ({ embeds: [errorEmbed(message)], flags: MessageFlags.Ephemeral });

/** Các nút chỉ cần ở cùng kênh thoại, không cần role DJ. */
const OPEN_ACTIONS = new Set(["skip", "up", "down", "fav", "lyrics"]);

/** Xử lý bấm nút dưới tin nhắn "Đang phát" (customId dạng "np:<hành động>"). */
export async function handleControl(interaction) {
  const action = interaction.customId.slice(3);

  const player = interaction.client.lavalink.getPlayer(interaction.guildId);
  if (!player) return interaction.reply(ephemeralError("Phiên phát này đã kết thúc."));

  // Cùng kiểm tra như lệnh: ở cùng kênh thoại, và có quyền DJ với các nút điều khiển
  if (!(await requirePlayer(interaction, { dj: !OPEN_ACTIONS.has(action) }))) return;

  const track = player.queue.current;

  switch (action) {
    case "pause":
      if (player.paused) await player.resume();
      else await player.pause();
      return refreshNowPlaying(player, interaction);

    case "skip": {
      const result = await requestSkip(player, interaction.member);
      // Phiếu bầu thì báo riêng cho người bấm; bỏ qua thật sự thì báo cả kênh
      if (result.status === "skipped") return interaction.reply({ embeds: [infoEmbed(describeSkip(result))] });
      return interaction.reply(ephemeral(describeSkip(result)));
    }

    case "stop":
      await interaction.deferUpdate();
      await stopPlayback(player);
      return interaction.followUp(ephemeral("⏹️ Đã dừng và xoá hàng chờ."));

    case "loop": {
      const mode = await cycleLoop(player);
      await refreshNowPlaying(player, interaction);
      return interaction.followUp(ephemeral(`🔁 ${LOOP_LABELS[mode]}`));
    }

    case "shuffle":
      if (player.queue.tracks.length < 2) return interaction.reply(ephemeralError("Hàng chờ cần ít nhất 2 bài để xáo trộn."));
      await player.queue.shuffle();
      return interaction.reply(ephemeral("🔀 Đã xáo trộn hàng chờ."));

    case "up":
    case "down": {
      if (!track) return interaction.reply(ephemeralError("Không có bài nào đang phát."));
      if (isOptedOut(interaction.user.id)) {
        return interaction.reply(ephemeralError("Bạn đang tắt thống kê nên không đánh giá được. Bật lại bằng `/privacy stats` nếu muốn."));
      }
      const value = toggleRating(interaction.guildId, interaction.user.id, trackKey(track), action === "up" ? 1 : -1);
      await refreshNowPlaying(player, interaction);
      await interaction.followUp(ephemeral(value === 0 ? "Đã bỏ đánh giá." : value > 0 ? `👍 Bạn thích **${track.info.title}**` : `👎 Bạn không thích **${track.info.title}**`));
      return announceBadges(interaction.client, player, interaction.user.id);
    }

    case "fav": {
      if (!track) return interaction.reply(ephemeralError("Không có bài nào đang phát."));
      const key = trackKey(track);
      if (isFavorite(interaction.user.id, key)) {
        removeFavorite(interaction.user.id, key);
        return interaction.reply(ephemeral(`💔 Đã bỏ **${track.info.title}** khỏi danh sách yêu thích.`));
      }
      addFavorite(interaction.user.id, key, track.info.title, track.info.author);
      return interaction.reply(ephemeral(`❤️ Đã thêm **${track.info.title}** vào danh sách yêu thích. Dùng \`/favorites play\` để nghe lại.`));
    }

    case "lyrics":
      if (stopLive(player)) return interaction.reply(ephemeral("📜 Đã tắt lời bài hát trực tiếp."));
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      return showLyrics(interaction, player, { live: true });
  }
}
