import { SlashCommandBuilder } from "discord.js";
import * as library from "../library/index.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { canControl, denyDj } from "../utils/guards.js";
import { startNhaajt } from "../utils/nhaajt.js";
import { ensurePlayer } from "../utils/playback.js";

export default {
  data: new SlashCommandBuilder()
    .setName("nhaajt")
    .setDescription("Shuffle-play all music in the music folder on repeat until /stop"),

  async execute(interaction) {
    if (!canControl(interaction.member, interaction.guildId)) return denyDj(interaction);

    const player = await ensurePlayer(interaction);
    if (!player) return;

    if (library.size() === 0) await library.scan();
    const files = library.all().map((e) => e.file);
    if (!files.length) {
      return interaction.editReply({ embeds: [errorEmbed("The music folder is empty.")] });
    }

    const count = await startNhaajt(player, files, interaction.user);
    if (!count) {
      return interaction.editReply({ embeds: [errorEmbed("Couldn't read any music files in the music folder.")] });
    }

    await interaction.editReply({
      embeds: [
        infoEmbed(
          `🔀 Shuffle-playing **${count}** tracks from the music folder; when the round ends it reshuffles and keeps going. Tracks with more 👍 come up sooner, 👎 tracks go to the end.\nUse \`/stop\` or \`/leave\` to stop.`,
        ),
      ],
    });
  },
};
