import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { REST, Routes } from "discord.js";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const commandsDir = path.join(__dirname, "commands");

const body = [];
for (const file of readdirSync(commandsDir).filter((f) => f.endsWith(".js"))) {
  const { default: command } = await import(pathToFileURL(path.join(commandsDir, file)).href);
  body.push(command.data.toJSON());
}

const rest = new REST().setToken(config.token);
const route = config.guildId
  ? Routes.applicationGuildCommands(config.clientId, config.guildId)
  : Routes.applicationCommands(config.clientId);

await rest.put(route, { body });
console.log(`Đã đăng ký ${body.length} lệnh (${config.guildId ? "server " + config.guildId : "toàn cầu"}).`);
