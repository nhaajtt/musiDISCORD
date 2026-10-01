import { MessageFlags, SlashCommandBuilder } from "discord.js";
import * as library from "../library/index.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { queueFiles } from "../utils/nhaajt.js";
import { ensurePlayer } from "../utils/playback.js";

export default {
  data: new SlashCommandBuilder()
    .setName("album")
    .setDescription("Phát cả một album trong thư viện nhạc")
    .addStringOption((o) => o.setName("name").setDescription("Tên album").setRequired(true).setAutocomplete(true))
    .addBooleanOption((o) => o.setName("shuffle").setDescription("Xáo trộn thông minh thay vì đúng thứ tự album")),

  async autocomplete(interaction) {
    library.refreshIfStale();
    const hits = library.searchAlbums(interaction.options.getFocused(), 25);
    await interaction.respond(hits.map((a) => ({ name: `${a.name} (${a.tracks.length} bài)`.slice(0, 100), value: a.name.slice(0, 100) })));
  },

  async execute(interaction) {
    if (library.size() === 0) await library.scan();
    const album = library.findAlbum(interaction.options.getString("name", true));
    if (!album) {
      return interaction.reply({ embeds: [errorEmbed("Không tìm thấy album đó.")], flags: MessageFlags.Ephemeral });
    }

    const player = await ensurePlayer(interaction);
    if (!player) return;

    const added = await queueFiles(
      player,
      album.tracks.map((t) => t.file),
      interaction.user,
      { shuffle: interaction.options.getBoolean("shuffle") ?? false },
    );
    await interaction.editReply({
      embeds: [added ? infoEmbed(`💿 Đã thêm album **${album.name}** (${added} bài).`) : errorEmbed("Không đọc được bài nào trong album này.")],
    });
  },
};
