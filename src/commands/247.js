import { MessageFlags, SlashCommandBuilder } from "discord.js";
import * as library from "../library/index.js";
import { getSettings, updateSettings } from "../store.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { canControl, denyDj } from "../utils/guards.js";
import { cancelIdleLeave, is247, scheduleIdleLeave } from "../utils/idle.js";
import { startNhaajt } from "../utils/nhaajt.js";
import { ensurePlayer } from "../utils/playback.js";

export default {
  data: new SlashCommandBuilder()
    .setName("247")
    .setDescription("Chế độ 24/7: bot ở lại kênh thoại kể cả khi không có ai")
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("on")
        .setDescription("Bật 24/7 tại kênh thoại bạn đang ở")
        .addBooleanOption((o) => o.setName("radio").setDescription("Phát ngẫu nhiên toàn bộ thư viện nhạc mãi mãi, kể cả sau khi bot khởi động lại")),
    )
    .addSubcommand((s) => s.setName("off").setDescription("Tắt chế độ 24/7")),

  async execute(interaction) {
    if (!canControl(interaction.member, interaction.guildId)) return denyDj(interaction);
    const guildId = interaction.guildId;

    if (interaction.options.getSubcommand() === "off") {
      if (!getSettings(guildId).stay247) {
        return interaction.reply({ embeds: [infoEmbed("Chế độ 24/7 đang tắt.")], flags: MessageFlags.Ephemeral });
      }
      updateSettings(guildId, { stay247: null });

      // Nếu đang rảnh thì hẹn rời kênh như bình thường
      const player = interaction.client.lavalink.getPlayer(guildId);
      if (player && !player.queue.current && !player.queue.tracks.length) scheduleIdleLeave(player);
      return interaction.reply({ embeds: [infoEmbed("🌙 Đã tắt chế độ 24/7. Bot sẽ rời kênh khi hết nhạc hoặc kênh trống.")] });
    }

    const radio = interaction.options.getBoolean("radio") ?? false;
    const player = await ensurePlayer(interaction);
    if (!player) return;

    if (radio) {
      if (library.size() === 0) await library.scan();
      if (library.size() === 0) {
        return interaction.editReply({ embeds: [errorEmbed("Thư mục music đang trống nên chưa bật được radio.")] });
      }
    }

    updateSettings(guildId, { stay247: { voiceChannelId: player.voiceChannelId, textChannelId: interaction.channelId, radio } });
    cancelIdleLeave(player);

    if (radio) {
      const files = library.all().map((e) => e.file);
      await startNhaajt(player, files, interaction.user);
    }

    await interaction.editReply({
      embeds: [
        infoEmbed(
          radio
            ? "📻 Đã bật **24/7 radio**: bot ở lại kênh và phát ngẫu nhiên toàn bộ thư viện nhạc mãi mãi, kể cả sau khi khởi động lại. Dùng `/247 off` để tắt."
            : "🌙 Đã bật **24/7**: bot ở lại kênh này kể cả khi không có ai và sau khi khởi động lại. Dùng `/247 off` để tắt.",
        ),
      ],
    });
  },
};
