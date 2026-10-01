import { SlashCommandBuilder } from "discord.js";
import { describeSkip, requestSkip } from "../utils/actions.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";

export default {
  data: new SlashCommandBuilder().setName("skip").setDescription("Bỏ qua bài đang phát (nhiều người nghe thì cần bỏ phiếu)"),
  async execute(interaction) {
    const player = await requirePlayer(interaction, { dj: false });
    if (!player) return;

    const result = await requestSkip(player, interaction.member);
    const embed = result.status === "none" ? errorEmbed(describeSkip(result)) : infoEmbed(describeSkip(result));
    await interaction.reply({ embeds: [embed] });
  },
};
