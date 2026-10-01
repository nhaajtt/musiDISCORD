import { EmbedBuilder, SlashCommandBuilder } from "discord.js";

function formatUptime(totalSeconds) {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return [d && `${d} ngày`, (d || h) && `${h} giờ`, `${m} phút`].filter(Boolean).join(" ");
}

export default {
  data: new SlashCommandBuilder().setName("stats").setDescription("Tình trạng hoạt động của bot"),

  async execute(interaction) {
    const { client } = interaction;
    const manager = client.lavalink;
    const node = manager.nodeManager.leastUsedNodes()[0];
    const stats = node?.stats;
    const playing = [...manager.players.values()].filter((p) => p.playing).length;

    const embed = new EmbedBuilder()
      .setColor(node?.connected ? 0x57f287 : 0xed4245)
      .setTitle("Tình trạng bot")
      .addFields(
        { name: "Hoạt động", value: formatUptime(process.uptime()), inline: true },
        { name: "Ping Discord", value: `${Math.round(client.ws.ping)} ms`, inline: true },
        { name: "Server", value: String(client.guilds.cache.size), inline: true },
        { name: "Đang phát", value: `${playing} server`, inline: true },
        { name: "Lavalink", value: node?.connected ? "Đã kết nối" : "Mất kết nối", inline: true },
        {
          name: "Tài nguyên Lavalink",
          value: stats
            ? `${Math.round(stats.memory.used / 1048576)} MB RAM • CPU ${(stats.cpu.lavalinkLoad * 100).toFixed(1)}%`
            : "Chưa có dữ liệu",
          inline: true,
        },
      );

    await interaction.reply({ embeds: [embed] });
  },
};
