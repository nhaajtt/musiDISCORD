import { MessageFlags, SlashCommandBuilder } from "discord.js";
import * as library from "../library/index.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { queueFiles } from "../utils/nhaajt.js";
import { ensurePlayer } from "../utils/playback.js";

export default {
  data: new SlashCommandBuilder()
    .setName("artist")
    .setDescription("Phát các bài của một nghệ sĩ trong thư viện nhạc")
    .addStringOption((o) => o.setName("name").setDescription("Tên nghệ sĩ").setRequired(true).setAutocomplete(true))
    .addBooleanOption((o) => o.setName("shuffle").setDescription("Xáo trộn thông minh (mặc định: bật)")),

  async autocomplete(interaction) {
    library.refreshIfStale();
    const hits = library.searchArtists(interaction.options.getFocused(), 25);
    await interaction.respond(hits.map((a) => ({ name: `${a.name} (${a.tracks.length} bài)`.slice(0, 100), value: a.name.slice(0, 100) })));
  },

  async execute(interaction) {
    if (library.size() === 0) await library.scan();
    const artist = library.findArtist(interaction.options.getString("name", true));
    if (!artist) {
      return interaction.reply({ embeds: [errorEmbed("Không tìm thấy nghệ sĩ đó.")], flags: MessageFlags.Ephemeral });
    }

    const player = await ensurePlayer(interaction);
    if (!player) return;

    const added = await queueFiles(
      player,
      artist.tracks.map((t) => t.file),
      interaction.user,
      { shuffle: interaction.options.getBoolean("shuffle") ?? true },
    );
    await interaction.editReply({
      embeds: [added ? infoEmbed(`🎤 Đã thêm **${added}** bài của **${artist.name}**.`) : errorEmbed("Không đọc được bài nào của nghệ sĩ này.")],
    });
  },
};
