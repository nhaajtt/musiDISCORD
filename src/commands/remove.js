import { SlashCommandBuilder } from "discord.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Xoá một bài khỏi hàng chờ")
    .addIntegerOption((o) =>
      o.setName("position").setDescription("Vị trí trong hàng chờ (bắt đầu từ 1)").setMinValue(1).setRequired(true),
    ),
  async execute(interaction) {
    const player = await requirePlayer(interaction);
    if (!player) return;
    const position = interaction.options.getInteger("position", true);
    const track = player.queue.tracks[position - 1];
    if (!track) return interaction.reply({ embeds: [errorEmbed("Không có bài ở vị trí đó.")] });
    await player.queue.remove(position - 1);
    await interaction.reply({ embeds: [infoEmbed(`🗑️ Đã xoá **${track.info.title}**`)] });
  },
};
