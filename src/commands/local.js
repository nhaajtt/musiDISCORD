import { MessageFlags, SlashCommandBuilder } from "discord.js";
import * as library from "../library/index.js";
import { errorEmbed } from "../utils/embeds.js";
import { musicPath } from "../utils/library.js";
import { queueAndPlay } from "../utils/playback.js";

export default {
  data: new SlashCommandBuilder()
    .setName("local")
    .setDescription("Phát một bài trong thư viện nhạc của bot (tìm theo tên, nghệ sĩ, album)")
    .addStringOption((o) =>
      o.setName("file").setDescription("Tên bài, nghệ sĩ hoặc album").setRequired(true).setAutocomplete(true),
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
        embeds: [errorEmbed("Không tìm thấy bài nào khớp trong thư viện nhạc.")],
        flags: MessageFlags.Ephemeral,
      });
    }
    await queueAndPlay(interaction, { query: musicPath(entry.file), source: "local" });
  },
};
