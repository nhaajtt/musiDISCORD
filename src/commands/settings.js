import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getSettings, updateSettings } from "../store.js";
import { infoEmbed } from "../utils/embeds.js";

const onOff = (value) => (value ? "On" : "Off");

export default {
  data: new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Bot settings for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) => s.setName("view").setDescription("View current settings"))
    .addSubcommand((s) =>
      s
        .setName("dj-role")
        .setDescription("Only this role can control the music (leave empty to allow everyone)")
        .addRoleOption((o) => o.setName("role").setDescription("DJ role")),
    )
    .addSubcommand((s) =>
      s
        .setName("volume")
        .setDescription("Default volume whenever the bot joins a voice channel")
        .addIntegerOption((o) =>
          o.setName("level").setDescription("From 1 to 150").setMinValue(1).setMaxValue(150).setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("fair-queue")
        .setDescription("Fair queue: each person gets a turn, one track at a time")
        .addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("contributions")
        .setDescription("Let members submit music files (the bot owner reviews them, needs CONTRIBUTIONS=on)")
        .addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("vc-status")
        .setDescription("Automatically set the current track name as the voice channel status")
        .addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "dj-role") {
      const role = interaction.options.getRole("role");
      updateSettings(guildId, { djRoleId: role?.id ?? null });
      return interaction.reply({
        embeds: [infoEmbed(role ? `🎚️ Only ${role} (and people with Manage Server) can control the music. Anyone can still vote to skip.` : "🎚️ DJ role turned off, anyone can control the music.")],
        allowedMentions: { parse: [] },
      });
    }

    if (sub === "volume") {
      const level = interaction.options.getInteger("level", true);
      updateSettings(guildId, { defaultVolume: level });
      return interaction.reply({ embeds: [infoEmbed(`🔊 Default volume: **${level}%** (applies the next time the bot joins a channel).`)] });
    }

    if (sub === "fair-queue") {
      const enabled = interaction.options.getBoolean("enabled", true);
      updateSettings(guildId, { fairQueue: enabled });
      return interaction.reply({
        embeds: [infoEmbed(enabled ? "⚖️ Fair queue turned on: new tracks are interleaved by person." : "⚖️ Fair queue turned off.")],
      });
    }

    if (sub === "contributions") {
      const enabled = interaction.options.getBoolean("enabled", true);
      updateSettings(guildId, { contributions: enabled });
      return interaction.reply({
        embeds: [infoEmbed(enabled ? "🎁 Music contributions turned on for this server. Members use `/contribute submit`, and the bot owner reviews files before they enter the library." : "🎁 Music contributions turned off for this server.")],
      });
    }

    if (sub === "vc-status") {
      const enabled = interaction.options.getBoolean("enabled", true);
      updateSettings(guildId, { vcStatus: enabled });
      return interaction.reply({
        embeds: [infoEmbed(enabled ? "🎙️ Turned on: the current track name will show on the voice channel (the bot needs the Set Voice Channel Status permission)." : "🎙️ Voice channel status turned off.")],
      });
    }

    const settings = getSettings(guildId);
    const stay = settings.stay247;
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Server settings")
      .addFields(
        { name: "DJ role", value: settings.djRoleId ? `<@&${settings.djRoleId}>` : "No restriction", inline: true },
        { name: "Default volume", value: `${settings.defaultVolume}%`, inline: true },
        { name: "Fair queue", value: onOff(settings.fairQueue), inline: true },
        { name: "Voice channel status", value: onOff(settings.vcStatus), inline: true },
        { name: "Music contributions", value: onOff(settings.contributions), inline: true },
        { name: "24/7 mode", value: stay ? `On in <#${stay.voiceChannelId}>${stay.radio ? " (radio)" : ""}` : "Off", inline: true },
      );
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
