import { ActivityType, Events } from "discord.js";
import { startHeartbeat } from "../health.js";
import * as library from "../library/index.js";
import { startAutosave } from "../persistence.js";

const PRESENCE_REFRESH_MS = 60_000;

function updatePresence(client) {
  const active = [...client.lavalink.players.values()].filter((p) => p.playing).length;
  const status = active ? `${active} server đang nghe • /help` : "/help để xem lệnh";
  client.user.setActivity({ name: status, type: ActivityType.Listening });
}

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    await client.lavalink.init({ id: client.user.id, username: client.user.username });
    console.log(`Đã đăng nhập: ${client.user.tag}`);

    library.scan().catch((error) => console.error("Quét thư viện lỗi:", error));
    startAutosave(client);
    startHeartbeat(client);
    updatePresence(client);
    setInterval(() => updatePresence(client), PRESENCE_REFRESH_MS).unref();
  },
};
