import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import * as library from "../library/index.js";
import { addFavorite, isFavorite, listFavorites, removeFavorite } from "../stats.js";
import { errorEmbed, infoEmbed } from "../utils/embeds.js";
import { queueFiles } from "../utils/nhaajt.js";
import { ensurePlayer } from "../utils/playback.js";
import { trackKey } from "../utils/trackKey.js";

const ephemeral = (embed) => ({ embeds: [embed], flags: MessageFlags.Ephemeral });
const label = (f) => `${f.title}${f.artist ? ` — ${f.artist}` : ""}`;

export default {
  data: new SlashCommandBuilder()
    .setName("favorites")
    .setDescription("Your personal list of favorite tracks")
    .addSubcommand((s) => s.setName("add").setDescription("Add the current track to your favorites"))
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a track from your favorites")
        .addStringOption((o) => o.setName("song").setDescription("Track to remove").setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("View your favorites"))
    .addSubcommand((s) =>
      s
        .setName("play")
        .setDescription("Play your favorites that are in the music library")
        .addBooleanOption((o) => o.setName("shuffle").setDescription("Smart shuffle (default: on)")),
    ),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const hits = listFavorites(interaction.user.id)
      .filter((f) => label(f).toLowerCase().includes(typed) && f.track_key.length <= 100)
      .slice(0, 25);
    await interaction.respond(hits.map((f) => ({ name: label(f).slice(0, 100), value: f.track_key })));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === "add") {
      const track = interaction.client.lavalink.getPlayer(interaction.guildId)?.queue.current;
      if (!track) return interaction.reply(ephemeral(errorEmbed("Nothing is playing right now.")));
      if (isFavorite(userId, trackKey(track))) return interaction.reply(ephemeral(infoEmbed("This track is already in your favorites.")));
      addFavorite(userId, trackKey(track), track.info.title, track.info.author);
      return interaction.reply(ephemeral(infoEmbed(`❤️ Added **${track.info.title}** to your favorites.`)));
    }

    if (sub === "remove") {
      const key = interaction.options.getString("song", true);
      return interaction.reply(
        ephemeral(removeFavorite(userId, key) ? infoEmbed("💔 Removed from your favorites.") : errorEmbed("This track isn't in your favorites.")),
      );
    }

    const favorites = listFavorites(userId);

    if (sub === "list") {
      if (!favorites.length) return interaction.reply(ephemeral(infoEmbed("You don't have any favorites yet. Press ❤️ under the now-playing message to add one.")));
      const lines = favorites.slice(0, 25).map((f, i) => `**${i + 1}.** ${label(f)}`);
      const more = favorites.length > 25 ? `\n… and ${favorites.length - 25} more` : "";
      const embed = new EmbedBuilder().setColor(0xed4245).setTitle("❤️ Your favorites").setDescription(lines.join("\n") + more);
      return interaction.reply(ephemeral(embed));
    }

    // play: only tracks that are in the bot's music library can be played
    if (library.size() === 0) await library.scan();
    const files = favorites
      .filter((f) => f.track_key.startsWith("local:"))
      .map((f) => f.track_key.slice("local:".length))
      .filter((rel) => library.get(rel));
    if (!files.length) {
      return interaction.reply(ephemeral(errorEmbed("None of your favorites are in the music library, so there's nothing to play.")));
    }

    const player = await ensurePlayer(interaction);
    if (!player) return;
    const added = await queueFiles(player, files, interaction.user, { shuffle: interaction.options.getBoolean("shuffle") ?? true });
    await interaction.editReply({ embeds: [added ? infoEmbed(`❤️ Added **${added}** of your favorites.`) : errorEmbed("Couldn't read any tracks.")] });
  },
};
