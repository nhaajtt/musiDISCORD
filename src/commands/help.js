import { EmbedBuilder, SlashCommandBuilder } from "discord.js";

const GROUPS = [
  ["🎵 Playback", ["play", "search", "local", "album", "artist", "favorites", "playlist", "nhaajt", "radio", "vibe", "similar"]],
  ["🎛️ Controls", ["pause", "resume", "skip", "stop", "leave", "seek", "volume", "loop", "shuffle", "filter", "remove", "bump", "247"]],
  ["📜 Info", ["queue", "nowplaying", "lyrics", "stats", "help"]],
  ["🎮 Fun", ["quiz"]],
  ["🎁 Contribute", ["contribute", "request"]],
  ["📊 Stats", ["mystats", "leaderboard", "wrapped", "privacy"]],
  ["⚙️ Admin", ["settings", "library"]],
];

export default {
  data: new SlashCommandBuilder().setName("help").setDescription("List of commands and how to use them"),

  async execute(interaction) {
    const { commands } = interaction.client;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("How to use")
      .setDescription(
        "Join a voice channel and use `/play` or `/local` to get started. The buttons under the \"Now Playing\" message do quick controls, 👍👎 ratings, ❤️ favorites and 📜 lyrics. I'm only slightly lost without them.",
      );

    for (const [title, names] of GROUPS) {
      const lines = names
        .map((name) => commands.get(name))
        .filter(Boolean)
        .map((command) => `**/${command.data.name}** — ${command.data.description}`);
      if (lines.length) embed.addFields({ name: title, value: lines.join("\n").slice(0, 1024) });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
