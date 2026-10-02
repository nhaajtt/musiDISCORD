import { SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import * as library from "../library/index.js";
import { moodForHour } from "../radio.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { canControl, denyDj } from "../utils/guards.js";
import { startNhaajt } from "../utils/nhaajt.js";
import { ensurePlayer } from "../utils/playback.js";
import { localHour } from "../utils/time.js";

export default {
  data: new SlashCommandBuilder()
    .setName("radio")
    .setDescription("Server radio: plays the library forever, learning what this server likes and when"),

  async execute(interaction) {
    if (!canControl(interaction.member, interaction.guildId)) return denyDj(interaction);

    const player = await ensurePlayer(interaction);
    if (!player) return;

    if (library.size() === 0) await library.scan();
    const files = library.all().map((e) => e.file);
    if (!files.length) return interaction.editReply({ embeds: [errorEmbed("The music folder is empty. A radio with nothing to play.")] });

    const count = await startNhaajt(player, files, interaction.user, { radio: true });
    if (!count) return interaction.editReply({ embeds: [errorEmbed("Couldn't read any music files in the music folder. They're hiding.")] });

    const mood = config.analysis.enabled ? ` Right now it leans **${moodForHour(localHour(Date.now()))}**.` : "";
    await interaction.editReply({
      embeds: [
        infoEmbed(
          `📻 Server radio is on with **${count}** tracks. Each round is shuffled using this server's 👍/👎, the tracks it plays through or skips, and what it usually listens to at this time of day.${mood}\nUse \`/stop\` or \`/leave\` to stop.`,
        ),
      ],
    });
  },
};
