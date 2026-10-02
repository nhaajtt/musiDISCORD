import { MessageFlags, SlashCommandBuilder } from "discord.js";
import * as library from "../library/index.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { queueFiles } from "../utils/nhaajt.js";
import { ensurePlayer } from "../utils/playback.js";

export default {
  data: new SlashCommandBuilder()
    .setName("artist")
    .setDescription("Play an artist's tracks from the music library")
    .addStringOption((o) => o.setName("name").setDescription("Artist name").setRequired(true).setAutocomplete(true))
    .addBooleanOption((o) => o.setName("shuffle").setDescription("Smart shuffle (default: on)")),

  async autocomplete(interaction) {
    library.refreshIfStale();
    const hits = library.searchArtists(interaction.options.getFocused(), 25);
    await interaction.respond(hits.map((a) => ({ name: `${a.name} (${a.tracks.length} tracks)`.slice(0, 100), value: a.name.slice(0, 100) })));
  },

  async execute(interaction) {
    if (library.size() === 0) await library.scan();
    const artist = library.findArtist(interaction.options.getString("name", true));
    if (!artist) {
      return interaction.reply({ embeds: [errorEmbed("Artist not found.")], flags: MessageFlags.Ephemeral });
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
      embeds: [added ? infoEmbed(`🎤 Added **${added}** tracks by **${artist.name}**.`) : errorEmbed("Couldn't read any tracks by this artist.")],
    });
  },
};
