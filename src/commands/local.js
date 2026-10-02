import { MessageFlags, SlashCommandBuilder } from "discord.js";
import * as library from "../library/index.js";
import { errorEmbed } from "../utils/embeds.js";
import { musicPath } from "../utils/library.js";
import { queueAndPlay } from "../utils/playback.js";

export default {
  data: new SlashCommandBuilder()
    .setName("local")
    .setDescription("Play a track from the bot's music library (search by title, artist, album)")
    .addStringOption((o) =>
      o.setName("file").setDescription("Track, artist or album name").setRequired(true).setAutocomplete(true),
    ),

  async autocomplete(interaction) {
    library.refreshIfStale();
    const hits = library.search(interaction.options.getFocused(), 25);
    await interaction.respond(
      hits.map((e) => ({
        name: `${e.title}${e.artist ? ` — ${e.artist}` : ""}`.slice(0, 100),
        value: library.choiceValue(e),
      })),
    );
  },

  async execute(interaction) {
    if (library.size() === 0) await library.scan();
    const entry = library.resolve(interaction.options.getString("file", true));
    if (!entry) {
      return interaction.reply({
        embeds: [errorEmbed("No matching track found in the music library. Not even close.")],
        flags: MessageFlags.Ephemeral,
      });
    }
    await queueAndPlay(interaction, { query: musicPath(entry.file), source: "local" });
  },
};
