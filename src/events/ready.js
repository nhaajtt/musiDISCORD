import { ActivityType, Events } from "discord.js";
import { expirePending } from "../contrib/approve.js";
import { createNotifier, getOwnerIds } from "../contrib/notify.js";
import { fulfilMatches, notifyFulfilled } from "../contrib/requests.js";
import { startHeartbeat } from "../health.js";
import * as library from "../library/index.js";
import { startWorker } from "../library/worker.js";
import { startAutosave } from "../persistence.js";
import { startDisplayServer } from "../web/server.js";

const PRESENCE_REFRESH_MS = 60_000;
const LIBRARY_REFRESH_MS = 5 * 60_000;

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

    // Mỗi lần thư viện được quét: bài mới khớp đề xuất nào thì báo người đề xuất
    const notify = createNotifier(client);
    library.onScanned((entries) => {
      const pairs = fulfilMatches(entries);
      if (pairs.length) notifyFulfilled(notify, pairs).catch((error) => console.error("Báo đề xuất lỗi:", error));
    });

    startWorker();
    startDisplayServer(client);

    library.scan().catch((error) => console.error("Quét thư viện lỗi:", error));
    getOwnerIds(client).catch(() => {});

    // Quét lại định kỳ (chỉ đọc thẻ file mới hoặc đã đổi) và dọn đóng góp chờ quá lâu
    setInterval(() => {
      library.scan().catch((error) => console.error("Quét thư viện lỗi:", error));
      expirePending().catch((error) => console.error("Dọn đóng góp lỗi:", error));
    }, LIBRARY_REFRESH_MS).unref();

    startAutosave(client);
    startHeartbeat(client);
    updatePresence(client);
    setInterval(() => updatePresence(client), PRESENCE_REFRESH_MS).unref();
  },
};
