import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import * as library from "../library/index.js";
import { byMood, progress } from "../library/worker.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { canControl, denyDj } from "../utils/guards.js";
import { startNhaajt } from "../utils/nhaajt.js";
import { ensurePlayer } from "../utils/playback.js";

const MOODS = {
  chill: "😌 Chill (slow, soft)",
  steady: "🚶 Steady (even, easy listening)",
  upbeat: "🎉 Upbeat",
  hype: "🔥 Hype (fast, intense)",
};

export default {
  data: new SlashCommandBuilder()
    .setName("vibe")
    .setDescription("Mood radio: plays tracks matching the tempo and energy you pick, forever")
    .addStringOption((o) =>
      o.setName("mood").setDescription("Mood").setRequired(true).addChoices(...Object.entries(MOODS).map(([value, name]) => ({ name, value }))),
    ),

  async execute(interaction) {
    if (!canControl(interaction.member, interaction.guildId)) return denyDj(interaction);
    if (!config.analysis.enabled) {
      return interaction.reply({ embeds: [errorEmbed("Audio analysis isn't enabled. The bot owner needs to set `ANALYSIS=on` in .env and restart.")], flags: MessageFlags.Ephemeral });
    }

    const player = await ensurePlayer(interaction);
    if (!player) return;

    if (library.size() === 0) await library.scan();
    const mood = interaction.options.getString("mood", true);
    const files = byMood(mood).map((e) => e.file);
    if (!files.length) {
      const p = progress();
      return interaction.editReply({ embeds: [errorEmbed(`No tracks match this mood yet (${p.analyzed}/${p.total} tracks analyzed). Wait for the bot to analyze more, then try again.`)] });
    }

    const count = await startNhaajt(player, files, interaction.user);
    if (!count) return interaction.editReply({ embeds: [errorEmbed("Couldn't read any music files.")] });
    await interaction.editReply({
      embeds: [infoEmbed(`${MOODS[mood]}: playing **${count}** tracks that fit this mood, shuffled and on repeat until \`/stop\`.\n*Tempo is only an estimate from audio analysis.*`)],
    });
  },
};
