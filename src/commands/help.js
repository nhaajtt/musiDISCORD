import { EmbedBuilder, SlashCommandBuilder } from "discord.js";

const GROUPS = [
  ["🎵 Phát nhạc", ["play", "local", "album", "artist", "favorites", "nhaajt", "vibe", "similar"]],
  ["🎛️ Điều khiển", ["pause", "resume", "skip", "stop", "leave", "seek", "volume", "loop", "shuffle", "remove", "bump", "247"]],
  ["📜 Thông tin", ["queue", "nowplaying", "lyrics", "stats", "help"]],
  ["🎮 Giải trí", ["quiz"]],
  ["🎁 Đóng góp", ["contribute", "request"]],
  ["📊 Thống kê", ["mystats", "leaderboard", "wrapped", "privacy"]],
  ["⚙️ Quản trị", ["settings", "library"]],
];

export default {
  data: new SlashCommandBuilder().setName("help").setDescription("Danh sách lệnh và cách dùng"),

  async execute(interaction) {
    const { commands } = interaction.client;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Hướng dẫn sử dụng")
      .setDescription(
        "Vào một kênh thoại rồi dùng `/play` hoặc `/local` để bắt đầu. Bấm nút dưới tin nhắn \"Đang phát\" để điều khiển nhanh, đánh giá 👍👎, thêm ❤️ yêu thích hay bật lời bài hát 📜.",
      );

    for (const [title, names] of GROUPS) {
      const lines = names
        .map((name) => commands.get(name))
        .filter(Boolean)
        .map((command) => `**/${command.data.name}** — ${command.data.description}`);
      if (lines.length) embed.addFields({ name: title, value: lines.join("\n").slice(0, 1024) });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
