import { SlashCommandBuilder } from "discord.js";
import { requestBump } from "../utils/actions.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { requirePlayer } from "../utils/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("bump")
    .setDescription("Vote to move a queued track up to play next")
    .addIntegerOption((o) => o.setName("position").setDescription("Position in the queue (starting from 1)").setMinValue(1).setRequired(true)),

  async execute(interaction) {
    const player = await requirePlayer(interaction, { dj: false });
    if (!player) return;

    const result = await requestBump(player, interaction.member, interaction.options.getInteger("position", true) - 1);
    switch (result.status) {
      case "none":
        return interaction.reply({ embeds: [errorEmbed("No track at that position.")] });
      case "moved":
        return interaction.reply({
          embeds: [infoEmbed(result.needed ? `⬆️ Got ${result.votes}/${result.needed} votes, **${result.title}** will play next.` : `⬆️ **${result.title}** will play next.`)],
        });
      case "already":
        return interaction.reply({ embeds: [infoEmbed(`🗳️ You already voted for **${result.title}** (${result.votes}/${result.needed}).`)] });
      default:
        return interaction.reply({
          embeds: [infoEmbed(`🗳️ Votes for **${result.title}**: **${result.votes}/${result.needed}**. More people need to agree.`)],
        });
    }
  },
};
