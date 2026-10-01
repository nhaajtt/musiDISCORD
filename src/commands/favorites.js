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
    .setDescription("Danh sách bài yêu thích của riêng bạn")
    .addSubcommand((s) => s.setName("add").setDescription("Thêm bài đang phát vào yêu thích"))
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Bỏ một bài khỏi yêu thích")
        .addStringOption((o) => o.setName("song").setDescription("Bài cần bỏ").setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("Xem danh sách yêu thích"))
    .addSubcommand((s) =>
      s
        .setName("play")
        .setDescription("Phát các bài yêu thích có trong thư viện nhạc")
        .addBooleanOption((o) => o.setName("shuffle").setDescription("Xáo trộn thông minh (mặc định: bật)")),
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
      if (!track) return interaction.reply(ephemeral(errorEmbed("Hiện không có bài nào đang phát.")));
      if (isFavorite(userId, trackKey(track))) return interaction.reply(ephemeral(infoEmbed("Bài này đã có trong danh sách yêu thích của bạn.")));
      addFavorite(userId, trackKey(track), track.info.title, track.info.author);
      return interaction.reply(ephemeral(infoEmbed(`❤️ Đã thêm **${track.info.title}** vào yêu thích.`)));
    }

    if (sub === "remove") {
      const key = interaction.options.getString("song", true);
      return interaction.reply(
        ephemeral(removeFavorite(userId, key) ? infoEmbed("💔 Đã bỏ khỏi yêu thích.") : errorEmbed("Bài này không có trong yêu thích của bạn.")),
      );
    }

    const favorites = listFavorites(userId);

    if (sub === "list") {
      if (!favorites.length) return interaction.reply(ephemeral(infoEmbed("Bạn chưa có bài yêu thích nào. Bấm ❤️ dưới bài đang phát để thêm.")));
      const lines = favorites.slice(0, 25).map((f, i) => `**${i + 1}.** ${label(f)}`);
      const more = favorites.length > 25 ? `\n… và ${favorites.length - 25} bài nữa` : "";
      const embed = new EmbedBuilder().setColor(0xed4245).setTitle("❤️ Bài yêu thích của bạn").setDescription(lines.join("\n") + more);
      return interaction.reply(ephemeral(embed));
    }

    // play: chỉ phát được các bài có trong thư viện nhạc của bot
    if (library.size() === 0) await library.scan();
    const files = favorites
      .filter((f) => f.track_key.startsWith("local:"))
      .map((f) => f.track_key.slice("local:".length))
      .filter((rel) => library.get(rel));
    if (!files.length) {
      return interaction.reply(ephemeral(errorEmbed("Không có bài yêu thích nào nằm trong thư viện nhạc để phát.")));
    }

    const player = await ensurePlayer(interaction);
    if (!player) return;
    const added = await queueFiles(player, files, interaction.user, { shuffle: interaction.options.getBoolean("shuffle") ?? true });
    await interaction.editReply({ embeds: [added ? infoEmbed(`❤️ Đã thêm **${added}** bài yêu thích của bạn.`) : errorEmbed("Không đọc được bài nào.")] });
  },
};
