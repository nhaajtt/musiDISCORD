import { SlashCommandBuilder } from "discord.js";
import * as library from "../library/index.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { canControl, denyDj } from "../utils/guards.js";
import { startNhaajt } from "../utils/nhaajt.js";
import { ensurePlayer } from "../utils/playback.js";

export default {
  data: new SlashCommandBuilder()
    .setName("nhaajt")
    .setDescription("Phát ngẫu nhiên toàn bộ nhạc trong thư mục music, lặp mãi cho tới khi /stop"),

  async execute(interaction) {
    if (!canControl(interaction.member, interaction.guildId)) return denyDj(interaction);

    const player = await ensurePlayer(interaction);
    if (!player) return;

    if (library.size() === 0) await library.scan();
    const files = library.all().map((e) => e.file);
    if (!files.length) {
      return interaction.editReply({ embeds: [errorEmbed("Thư mục music đang trống.")] });
    }

    const count = await startNhaajt(player, files, interaction.user);
    if (!count) {
      return interaction.editReply({ embeds: [errorEmbed("Không đọc được file nhạc nào trong thư mục music.")] });
    }

    await interaction.editReply({
      embeds: [
        infoEmbed(
          `🔀 Đang phát ngẫu nhiên **${count}** bài trong thư mục music, hết vòng sẽ xáo trộn lại và phát tiếp. Bài được 👍 nhiều sẽ lên sớm hơn, bài bị 👎 xuống cuối.\nDùng \`/stop\` hoặc \`/leave\` để dừng.`,
        ),
      ],
    });
  },
};
