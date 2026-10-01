import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { createNotifier, isOwner } from "../contrib/notify.js";
import {
  MAX_OPEN_PER_USER,
  MAX_TEXT,
  addRequest,
  closeRequest,
  displayOf,
  getRequest,
  listMine,
  listOpen,
  notifyFulfilled,
  removeOwn,
  voteRequest,
} from "../contrib/requests.js";
import { errorEmbed, infoEmbed, safeText } from "../utils/embeds.js";

const ephemeral = (embed) => ({ embeds: [embed], flags: MessageFlags.Ephemeral });
const line = (r) => `**#${r.id}** ${displayOf(r)} • 👍 ${r.votes}`;

export default {
  data: new SlashCommandBuilder()
    .setName("request")
    .setDescription("Đề xuất bài chưa có trong thư viện, bot báo bạn khi bài xuất hiện")
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Đề xuất một bài (tên bài hoặc link YouTube/Spotify/SoundCloud, bot không tải gì về)")
        .addStringOption((o) => o.setName("query").setDescription("Tên bài + nghệ sĩ, hoặc link").setRequired(true).setMaxLength(MAX_TEXT)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("Các đề xuất được bỏ phiếu nhiều nhất"))
    .addSubcommand((s) =>
      s.setName("vote").setDescription("Bỏ phiếu cho một đề xuất").addIntegerOption((o) => o.setName("id").setDescription("Số thứ tự đề xuất").setMinValue(1).setRequired(true)),
    )
    .addSubcommand((s) => s.setName("mine").setDescription("Các đề xuất bạn đã tạo hoặc bỏ phiếu"))
    .addSubcommand((s) =>
      s.setName("remove").setDescription("Xoá đề xuất của bạn").addIntegerOption((o) => o.setName("id").setDescription("Số thứ tự đề xuất").setMinValue(1).setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName("done").setDescription("(Chủ bot) Đánh dấu đã thêm bài và báo người đề xuất").addIntegerOption((o) => o.setName("id").setDescription("Số thứ tự đề xuất").setMinValue(1).setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName("dismiss").setDescription("(Chủ bot) Bỏ một đề xuất").addIntegerOption((o) => o.setName("id").setDescription("Số thứ tự đề xuất").setMinValue(1).setRequired(true)),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === "add") {
      const result = addRequest({
        input: interaction.options.getString("query", true),
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId,
      });
      const r = result.request;
      switch (result.status) {
        case "invalid":
          return interaction.reply(ephemeral(errorEmbed("Hãy nhập tên bài (ít nhất 2 chữ cái) hoặc link YouTube, Spotify, SoundCloud hợp lệ.")));
        case "in-library":
          return interaction.reply(ephemeral(infoEmbed(`Bài này đã có trong thư viện: **${safeText(result.entry.title, 120)}**. Dùng \`/local\` để nghe.`)));
        case "limit":
          return interaction.reply(ephemeral(errorEmbed(`Bạn đang có ${MAX_OPEN_PER_USER} đề xuất mở, hãy đợi bớt rồi đề xuất tiếp.`)));
        case "fulfilled":
          return interaction.reply(ephemeral(infoEmbed(`Đề xuất này đã được đáp ứng${r.fulfilled_file ? `: \`${r.fulfilled_file}\`` : ""}. Dùng \`/local\` để nghe.`)));
        case "dismissed":
          return interaction.reply(ephemeral(errorEmbed("Đề xuất này đã bị chủ bot bỏ qua trước đó.")));
        case "already-voted":
          return interaction.reply(ephemeral(infoEmbed(`Bạn đã bỏ phiếu cho đề xuất này rồi (👍 ${r.votes}).`)));
        case "voted":
          return interaction.reply({ embeds: [infoEmbed(`👍 Đã có người đề xuất bài này, phiếu của bạn được ghi nhận: ${line({ ...r, votes: r.votes + 1 })}`)], allowedMentions: { parse: [] } });
        default:
          return interaction.reply({
            embeds: [infoEmbed(`📝 Đã ghi đề xuất ${line(r)}. Khi bài có trong thư viện, bot sẽ báo bạn. Người khác dùng \`/request vote ${r.id}\` để ủng hộ.`)],
            allowedMentions: { parse: [] },
          });
      }
    }

    if (sub === "list" || sub === "mine") {
      const rows = sub === "list" ? listOpen(10) : listMine(userId);
      if (!rows.length) return interaction.reply(ephemeral(infoEmbed(sub === "list" ? "Chưa có đề xuất nào." : "Bạn chưa có đề xuất nào đang mở.")));
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(sub === "list" ? "📝 Đề xuất được ủng hộ nhiều nhất" : "📝 Đề xuất của bạn")
        .setDescription(rows.map(line).join("\n").slice(0, 4000));
      return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    if (sub === "vote") {
      const result = voteRequest(interaction.options.getInteger("id", true), userId);
      if (result.status === "none") return interaction.reply(ephemeral(errorEmbed("Không có đề xuất mở nào với số đó.")));
      if (result.status === "already-voted") return interaction.reply(ephemeral(infoEmbed("Bạn đã bỏ phiếu cho đề xuất này rồi.")));
      return interaction.reply({ embeds: [infoEmbed(`👍 Đã ghi nhận phiếu: ${line({ ...result.request, votes: result.request.votes + 1 })}`)], allowedMentions: { parse: [] } });
    }

    if (sub === "remove") {
      return interaction.reply(
        ephemeral(removeOwn(interaction.options.getInteger("id", true), userId) ? infoEmbed("🗑️ Đã xoá đề xuất của bạn.") : errorEmbed("Bạn chỉ xoá được đề xuất do mình tạo và còn đang mở.")),
      );
    }

    // done / dismiss: chỉ chủ bot
    if (!(await isOwner(interaction.client, userId))) {
      return interaction.reply(ephemeral(errorEmbed("Chỉ chủ bot dùng được lệnh này.")));
    }
    const id = interaction.options.getInteger("id", true);
    const request = getRequest(id);
    if (!request || request.status !== "open") return interaction.reply(ephemeral(errorEmbed("Không có đề xuất mở nào với số đó.")));

    if (sub === "dismiss") {
      closeRequest(id, "dismissed");
      return interaction.reply(ephemeral(infoEmbed(`Đã bỏ đề xuất #${id}.`)));
    }

    closeRequest(id, "fulfilled");
    await interaction.reply(ephemeral(infoEmbed(`✅ Đã đánh dấu #${id} là xong, đang báo người đề xuất.`)));
    await notifyFulfilled(createNotifier(interaction.client), [{ request, entry: { title: request.display, file: null } }]);
  },
};
