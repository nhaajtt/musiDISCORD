import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { featuresOf, similarTo } from "../library/worker.js";
import { errorEmbed, infoEmbed, safeText } from "../utils/embeds.js";
import { canControl, denyDj } from "../utils/guards.js";
import { queueFiles } from "../utils/nhaajt.js";
import { ensurePlayer } from "../utils/playback.js";
import { localRelativePath } from "../utils/trackKey.js";

const ephemeral = (embed) => ({ embeds: [embed], flags: MessageFlags.Ephemeral });

export default {
  data: new SlashCommandBuilder()
    .setName("similar")
    .setDescription("Queue library tracks with a tempo and energy similar to the current track")
    .addIntegerOption((o) => o.setName("count").setDescription("Number of tracks to add (default 10)").setMinValue(1).setMaxValue(25)),

  async execute(interaction) {
    if (!canControl(interaction.member, interaction.guildId)) return denyDj(interaction);
    if (!config.analysis.enabled) return interaction.reply(ephemeral(errorEmbed("Audio analysis isn't enabled (`ANALYSIS=on` in .env).")));

    const player = interaction.client.lavalink.getPlayer(interaction.guildId);
    const current = player?.queue.current;
    const rel = current ? localRelativePath(current.info) : null;
    if (!rel) return interaction.reply(ephemeral(errorEmbed("Play a track from the library (`/local`) first.")));
    if (!featuresOf(rel)) return interaction.reply(ephemeral(errorEmbed("This track hasn't been analyzed yet, try again later.")));

    const queued = new Set(player.queue.tracks.map((t) => localRelativePath(t.info)));
    const picks = similarTo(rel, 40)
      .filter((e) => !queued.has(e.file))
      .slice(0, interaction.options.getInteger("count") ?? 10);
    if (!picks.length) return interaction.reply(ephemeral(errorEmbed("Couldn't find similar tracks (few tracks in the library have been analyzed).")));

    const ready = await ensurePlayer(interaction);
    if (!ready) return;
    const added = await queueFiles(ready, picks.map((e) => e.file), interaction.user);
    await interaction.editReply({
      embeds: [infoEmbed(`🧬 Added the **${added}** closest tracks to **${safeText(current.info.title, 80)}**: ${picks.slice(0, 3).map((e) => safeText(e.title, 40)).join(", ")}${added > 3 ? "…" : ""}`)],
    });
  },
};
