import { MessageFlags, SlashCommandBuilder } from "discord.js";
import * as library from "../library/index.js";
import { getSettings, updateSettings } from "../store.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { canControl, denyDj } from "../utils/guards.js";
import { cancelIdleLeave, is247, scheduleIdleLeave } from "../utils/idle.js";
import { startNhaajt } from "../utils/nhaajt.js";
import { ensurePlayer } from "../utils/playback.js";

export default {
  data: new SlashCommandBuilder()
    .setName("247")
    .setDescription("24/7 mode: the bot stays in the voice channel even when it is empty")
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("on")
        .setDescription("Turn on 24/7 in the voice channel you are in")
        .addBooleanOption((o) => o.setName("radio").setDescription("Shuffle-play the whole music library forever, even after the bot restarts")),
    )
    .addSubcommand((s) => s.setName("off").setDescription("Turn off 24/7 mode")),

  async execute(interaction) {
    if (!canControl(interaction.member, interaction.guildId)) return denyDj(interaction);
    const guildId = interaction.guildId;

    if (interaction.options.getSubcommand() === "off") {
      if (!getSettings(guildId).stay247) {
        return interaction.reply({ embeds: [infoEmbed("24/7 mode is off. Nothing to turn off, so that was easy.")], flags: MessageFlags.Ephemeral });
      }
      updateSettings(guildId, { stay247: null });

      // If idle, schedule leaving the channel as usual
      const player = interaction.client.lavalink.getPlayer(guildId);
      if (player && !player.queue.current && !player.queue.tracks.length) scheduleIdleLeave(player);
      return interaction.reply({ embeds: [infoEmbed("🌙 24/7 mode turned off. I'll leave when the music ends or the channel empties. Bedtime.")] });
    }

    const radio = interaction.options.getBoolean("radio") ?? false;
    const player = await ensurePlayer(interaction);
    if (!player) return;

    if (radio) {
      if (library.size() === 0) await library.scan();
      if (library.size() === 0) {
        return interaction.editReply({ embeds: [errorEmbed("The music folder is empty, so there's no radio to run. Dead air isn't a format.")] });
      }
    }

    updateSettings(guildId, { stay247: { voiceChannelId: player.voiceChannelId, textChannelId: interaction.channelId, radio } });
    cancelIdleLeave(player);

    if (radio) {
      const files = library.all().map((e) => e.file);
      await startNhaajt(player, files, interaction.user);
    }

    await interaction.editReply({
      embeds: [
        infoEmbed(
          radio
            ? "📻 **24/7 radio** is on: I stay in the channel and shuffle the whole library forever, even after a restart. No breaks. Use `/247 off` to stop me."
            : "🌙 **24/7** is on: I'll stay in this channel, even when nobody is here and after a restart. Use `/247 off` to send me home.",
        ),
      ],
    });
  },
};
