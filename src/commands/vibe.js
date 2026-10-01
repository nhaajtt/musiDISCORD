import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import * as library from "../library/index.js";
import { byMood, progress } from "../library/worker.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { canControl, denyDj } from "../utils/guards.js";
import { startNhaajt } from "../utils/nhaajt.js";
import { ensurePlayer } from "../utils/playback.js";

const MOODS = {
  chill: "😌 Chill (chậm, nhẹ)",
  steady: "🚶 Vừa phải (đều, dễ nghe)",
  upbeat: "🎉 Sôi động",
  hype: "🔥 Hừng hực (nhanh, mạnh)",
};

export default {
  data: new SlashCommandBuilder()
    .setName("vibe")
    .setDescription("Radio theo tâm trạng: phát mãi các bài hợp nhịp độ và năng lượng bạn chọn")
    .addStringOption((o) =>
      o.setName("mood").setDescription("Tâm trạng").setRequired(true).addChoices(...Object.entries(MOODS).map(([value, name]) => ({ name, value }))),
    ),

  async execute(interaction) {
    if (!canControl(interaction.member, interaction.guildId)) return denyDj(interaction);
    if (!config.analysis.enabled) {
      return interaction.reply({ embeds: [errorEmbed("Phân tích âm thanh chưa bật. Chủ bot đặt `ANALYSIS=on` trong .env rồi khởi động lại.")], flags: MessageFlags.Ephemeral });
    }

    const player = await ensurePlayer(interaction);
    if (!player) return;

    if (library.size() === 0) await library.scan();
    const mood = interaction.options.getString("mood", true);
    const files = byMood(mood).map((e) => e.file);
    if (!files.length) {
      const p = progress();
      return interaction.editReply({ embeds: [errorEmbed(`Chưa có bài nào thuộc tâm trạng này (đã phân tích ${p.analyzed}/${p.total} bài). Đợi bot phân tích thêm rồi thử lại.`)] });
    }

    const count = await startNhaajt(player, files, interaction.user);
    if (!count) return interaction.editReply({ embeds: [errorEmbed("Không đọc được file nhạc nào.")] });
    await interaction.editReply({
      embeds: [infoEmbed(`${MOODS[mood]}: đang phát **${count}** bài hợp tâm trạng này, xáo trộn và lặp mãi cho tới khi \`/stop\`.\n*Nhịp độ chỉ là ước lượng từ phân tích âm thanh.*`)],
    });
  },
};
