import { SlashCommandBuilder } from "discord.js";
import { queueAndPlay } from "../utils/playback.js";

const URL_RE = /^https?:\/\//i;

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Phát nhạc từ tên bài hoặc link YouTube / SoundCloud / Spotify")
    .addStringOption((o) =>
      o.setName("query").setDescription("Tên bài hát hoặc link").setRequired(true).setAutocomplete(true),
    )
    .addStringOption((o) =>
      o
        .setName("source")
        .setDescription("Nguồn tìm kiếm khi nhập tên bài (mặc định: YouTube)")
        .addChoices(
          { name: "YouTube", value: "ytsearch" },
          { name: "YouTube Music", value: "ytmsearch" },
          { name: "SoundCloud", value: "scsearch" },
          { name: "Spotify", value: "spsearch" },
        ),
    ),

  async autocomplete(interaction) {
    const query = interaction.options.getFocused();
    if (!query || query.length < 2 || URL_RE.test(query)) return interaction.respond([]);

    const player = interaction.client.lavalink.getPlayer(interaction.guildId);
    const node = interaction.client.lavalink.nodeManager.leastUsedNodes()[0];
    if (!node?.connected) return interaction.respond([]);

    const source = interaction.options.getString("source") ?? "ytsearch";
    const res = await (player ?? node).search({ query, source }, interaction.user).catch(() => null);
    const tracks = res?.loadType === "search" ? res.tracks.slice(0, 10) : [];

    await interaction.respond(
      tracks.map((t) => ({
        name: `${t.info.title} — ${t.info.author}`.slice(0, 100),
        value: (t.info.uri ?? query).slice(0, 100),
      })),
    );
  },

  async execute(interaction) {
    await queueAndPlay(interaction, {
      query: interaction.options.getString("query", true),
      source: interaction.options.getString("source") ?? "ytsearch",
    });
  },
};
