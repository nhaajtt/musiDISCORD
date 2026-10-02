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
        return interaction.reply({ embeds: [errorEmbed("No track at that position. Check the queue, I'll wait.")] });
      case "moved":
        return interaction.reply({
          embeds: [infoEmbed(result.needed ? `⬆️ Got ${result.votes}/${result.needed} votes. **${result.title}** cuts the line and plays next.` : `⬆️ **${result.title}** cuts the line and plays next.`)],
        });
      case "already":
        return interaction.reply({ embeds: [infoEmbed(`🗳️ You already voted for **${result.title}** (${result.votes}/${result.needed}). Democracy has limits.`)] });
      default:
        return interaction.reply({
          embeds: [infoEmbed(`🗳️ Votes for **${result.title}**: **${result.votes}/${result.needed}**. Rally some more people to agree.`)],
        });
    }
  },
};
