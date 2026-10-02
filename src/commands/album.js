import { MessageFlags, SlashCommandBuilder } from "discord.js";
import * as library from "../library/index.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { queueFiles } from "../utils/nhaajt.js";
import { ensurePlayer } from "../utils/playback.js";

export default {
  data: new SlashCommandBuilder()
    .setName("album")
    .setDescription("Play a whole album from the music library")
    .addStringOption((o) => o.setName("name").setDescription("Album name").setRequired(true).setAutocomplete(true))
    .addBooleanOption((o) => o.setName("shuffle").setDescription("Smart shuffle instead of album order")),

  async autocomplete(interaction) {
    library.refreshIfStale();
    const hits = library.searchAlbums(interaction.options.getFocused(), 25);
    await interaction.respond(hits.map((a) => ({ name: `${a.name} (${a.tracks.length} tracks)`.slice(0, 100), value: a.name.slice(0, 100) })));
  },

  async execute(interaction) {
    if (library.size() === 0) await library.scan();
    const album = library.findAlbum(interaction.options.getString("name", true));
    if (!album) {
      return interaction.reply({ embeds: [errorEmbed("Album not found. Maybe it's an EP in disguise.")], flags: MessageFlags.Ephemeral });
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
      embeds: [added ? infoEmbed(`💿 Added album **${album.name}** (${added} tracks).`) : errorEmbed("Couldn't read any tracks from this album. It's being shy.")],
    });
  },
};
