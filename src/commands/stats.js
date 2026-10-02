import { EmbedBuilder, SlashCommandBuilder } from "discord.js";

function formatUptime(totalSeconds) {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return [d && `${d} d`, (d || h) && `${h} h`, `${m} min`].filter(Boolean).join(" ");
}

export default {
  data: new SlashCommandBuilder().setName("stats").setDescription("Bot status and health"),

  async execute(interaction) {
    const { client } = interaction;
    const manager = client.lavalink;
    const node = manager.nodeManager.leastUsedNodes()[0];
    const stats = node?.stats;
    const nodes = [...manager.nodeManager.nodes.values()];
    const nodesUp = nodes.filter((n) => n.connected).length;
    const playing = [...manager.players.values()].filter((p) => p.playing).length;

    const embed = new EmbedBuilder()
      .setColor(node?.connected ? 0x57f287 : 0xed4245)
      .setTitle("Bot status")
      .addFields(
        { name: "Uptime", value: formatUptime(process.uptime()), inline: true },
        { name: "Ping Discord", value: `${Math.round(client.ws.ping)} ms`, inline: true },
        { name: "Server", value: String(client.guilds.cache.size), inline: true },
        { name: "Playing", value: `${playing} servers`, inline: true },
        { name: "Lavalink", value: nodes.length > 1 ? `${nodesUp} of ${nodes.length} nodes connected` : node?.connected ? "Connected" : "Disconnected", inline: true },
        { name: "Shards", value: String(client.ws.shards.size), inline: true },
        {
          name: "Lavalink resources",
          value: stats
            ? `${Math.round(stats.memory.used / 1048576)} MB RAM • CPU ${(stats.cpu.lavalinkLoad * 100).toFixed(1)}%`
            : "No data yet",
          inline: true,
        },
      );

    await interaction.reply({ embeds: [embed] });
  },
};
