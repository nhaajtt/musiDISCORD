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
  const status = active ? `${active} servers listening • /help` : "/help to see commands";
  client.user.setActivity({ name: status, type: ActivityType.Listening });
}

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    await client.lavalink.init({ id: client.user.id, username: client.user.username });
    console.log(`Logged in: ${client.user.tag}`);

    // Each time the library is scanned: notify the suggester when a new track matches their suggestion
    const notify = createNotifier(client);
    library.onScanned((entries) => {
      const pairs = fulfilMatches(entries);
      if (pairs.length) notifyFulfilled(notify, pairs).catch((error) => console.error("Suggestion notification failed:", error));
    });

    startWorker();
    startDisplayServer(client);

    library.scan().catch((error) => console.error("Library scan failed:", error));
    getOwnerIds(client).catch(() => {});

    // Rescan periodically (only reads tags of new or changed files) and clean up contributions pending too long
    setInterval(() => {
      library.scan().catch((error) => console.error("Library scan failed:", error));
      expirePending().catch((error) => console.error("Contribution cleanup failed:", error));
    }, LIBRARY_REFRESH_MS).unref();

    startAutosave(client);
    startHeartbeat(client);
    updatePresence(client);
    setInterval(() => updatePresence(client), PRESENCE_REFRESH_MS).unref();
  },
};
