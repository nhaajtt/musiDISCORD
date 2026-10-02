import { SlashCommandBuilder } from "discord.js";
import { infoEmbed } from "../utils/embeds.js";
import { FILTER_CHOICES, FILTERS, setFilter } from "../utils/filters.js";
import { requirePlayer } from "../utils/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("filter")
    .setDescription("Apply an audio filter to the music (bass boost, nightcore, 8D...)")
    .addStringOption((o) =>
      o.setName("effect").setDescription("Which effect to apply").setRequired(true).addChoices(...FILTER_CHOICES),
    ),

  async execute(interaction) {
    const player = await requirePlayer(interaction);
    if (!player) return;

    const effect = interaction.options.getString("effect", true);
    await interaction.deferReply();
    await setFilter(player, effect);

    const message = effect === "off" ? "🎚️ Filter removed." : `🎚️ Filter applied: **${FILTERS[effect].label}**`;
    await interaction.editReply({ embeds: [infoEmbed(message)] });
  },
};
