import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { isOwner } from "../contrib/notify.js";
import * as library from "../library/index.js";
import { reviewView } from "../library/handlers.js";
import { forgetTag, progress, runNow, stopWorker, workerState } from "../library/worker.js";
import { errorEmbed, infoEmbed, safeText } from "../utils/embeds.js";

const ephemeral = (embed) => ({ embeds: [embed], flags: MessageFlags.Ephemeral });

export default {
  data: new SlashCommandBuilder()
    .setName("library")
    .setDescription("(Bot owner) Manage the library: auto-tagging, audio analysis")
    .addSubcommand((s) => s.setName("status").setDescription("Tagging and analysis progress"))
    .addSubcommand((s) => s.setName("run").setDescription("Run tagging/analysis now"))
    .addSubcommand((s) => s.setName("stop").setDescription("Stop the running background task"))
    .addSubcommand((s) => s.setName("review").setDescription("Review low-confidence tag suggestions"))
    .addSubcommand((s) =>
      s.setName("forget").setDescription("Remove the auto-applied tags from a track").addStringOption((o) => o.setName("track").setDescription("Name of the track to untag").setRequired(true).setMaxLength(100)),
    ),

  async execute(interaction) {
    if (!(await isOwner(interaction.client, interaction.user.id))) {
      return interaction.reply(ephemeral(errorEmbed("Only the bot owner can use this command. Nice try, though.")));
    }
    const sub = interaction.options.getSubcommand();

    if (sub === "status") {
      if (library.size() === 0) await library.scan();
      const p = progress();
      const w = workerState();
      const lines = [
        `📚 **${p.total}** tracks • untagged: **${p.untagged}**`,
        `🏷️ Auto-tagging: ${config.autotag.enabled ? "**on**" : "off"}${config.autotag.enabled && !config.autotag.acoustidKey ? " (missing `ACOUSTID_KEY`, matching by filename only)" : ""} • applied **${p.applied}** • awaiting review **${p.suggested}**`,
        `🎚️ Audio analysis: ${config.analysis.enabled ? "**on**" : "off"} • done **${p.analyzed}/${p.total}**`,
        config.libraryWorker ? (w.running ? `⏳ Running: ${w.phase === "tag" ? "tagging" : "analyzing"} \`${safeText(w.current ?? "", 80)}\`` : "💤 Background task is idle") : "ℹ️ This bot is not the worker (LIBRARY_WORKER=off), it only reads the results",
        w.error ? `⚠️ Last error: ${safeText(w.error, 120)}` : "",
      ].filter(Boolean);
      return interaction.reply(ephemeral(infoEmbed(lines.join("\n"))));
    }

    if (sub === "run" || sub === "stop") {
      if (!config.libraryWorker) return interaction.reply(ephemeral(errorEmbed("This bot is not the worker (LIBRARY_WORKER=off).")));
      if (sub === "stop") {
        stopWorker();
        return interaction.reply(ephemeral(infoEmbed("⏹️ Stop requested, the task will stop after the current track.")));
      }
      if (!config.autotag.enabled && !config.analysis.enabled) return interaction.reply(ephemeral(errorEmbed("`AUTOTAG=on` or `ANALYSIS=on` isn't set in .env.")));
      runNow();
      return interaction.reply(ephemeral(infoEmbed("▶️ Started, check progress with `/library status`.")));
    }

    if (sub === "review") {
      return interaction.reply({ ...reviewView(), flags: MessageFlags.Ephemeral });
    }

    const entry = library.resolve(interaction.options.getString("track", true));
    if (!entry) return interaction.reply(ephemeral(errorEmbed("Track not found in the library.")));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ok = await forgetTag(entry.file);
    return interaction.editReply({ embeds: [ok ? infoEmbed(`Removed the auto-applied tags from **${safeText(entry.title, 100)}**.`) : errorEmbed("This track has no auto-applied tags.")] });
  },
};
