import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import { config } from "./config.js";
import { createLavalink } from "./lavalink.js";
import { saveAndFreeze } from "./persistence.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.lavalink = createLavalink(client);
client.on("raw", (packet) => client.lavalink.sendRawData(packet));

client.commands = new Collection();
for (const file of readdirSync(path.join(__dirname, "commands")).filter((f) => f.endsWith(".js"))) {
  const { default: command } = await import(pathToFileURL(path.join(__dirname, "commands", file)).href);
  client.commands.set(command.data.name, command);
}

for (const file of readdirSync(path.join(__dirname, "events")).filter((f) => f.endsWith(".js"))) {
  const { default: event } = await import(pathToFileURL(path.join(__dirname, "events", file)).href);
  const register = event.once ? client.once.bind(client) : client.on.bind(client);
  register(event.name, (...args) => event.execute(client, ...args));
}

process.on("unhandledRejection", (error) => console.error("Unhandled rejection:", error));

// Khi Docker dừng container: rời các kênh thoại gọn gàng rồi mới thoát
let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`Nhận ${signal}, đang tắt bot...`);
  saveAndFreeze(client.lavalink);
  for (const player of [...client.lavalink.players.values()]) {
    await player.destroy("Shutdown").catch(() => {});
  }
  await client.destroy();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

await client.login(config.token);
