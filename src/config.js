import "dotenv/config";

const required = ["DISCORD_TOKEN", "CLIENT_ID"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null,
  lavalink: {
    host: process.env.LAVALINK_HOST || "localhost",
    port: Number(process.env.LAVALINK_PORT) || 2333,
    password: process.env.LAVALINK_PASSWORD || "youshallnotpass",
  },
  // Music folder, same path in the bot and Lavalink containers
  musicDir: process.env.MUSIC_DIR || "/music",
  // Where per-server settings are stored (mount as a volume so they survive container recreation)
  dataDir: process.env.DATA_DIR || "data",
  // Discord webhook that receives alerts when Lavalink disconnects (optional)
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || null,
  // Time zone used for stats (listening hours, streaks)
  timezone: process.env.TIMEZONE || "Asia/Ho_Chi_Minh",
  // Look up lyrics from LRCLIB when the file has none (set LYRICS_LOOKUP=off to disable)
  lyricsLookup: process.env.LYRICS_LOOKUP !== "off",
  // Queue autosave interval (seconds). 0 = no periodic saves, only save when a new track starts and on shutdown (less disk writing on a Raspberry Pi)
  autosaveSeconds: Number.isFinite(Number(process.env.AUTOSAVE_SECONDS)) && process.env.AUTOSAVE_SECONDS !== undefined && process.env.AUTOSAVE_SECONDS !== "" ? Number(process.env.AUTOSAVE_SECONDS) : 15,
  // Music contributions: off by default, the bot owner approves. OWNER_IDS (comma-separated) overrides the owner taken from Discord
  contributions: {
    enabled: process.env.CONTRIBUTIONS === "on",
    maxBytes: (Number(process.env.CONTRIB_MAX_MB) > 0 ? Number(process.env.CONTRIB_MAX_MB) : 30) * 1024 * 1024,
    ownerIds: (process.env.OWNER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean),
    folder: "Contributions",
  },
  idleLeaveMs: 60_000,
  // Bot name (shown in alerts and the status API) and a data folder shared between several bots (tags, audio features, covers)
  botName: process.env.BOT_NAME || "musiDISCORD",
  sharedDir: process.env.SHARED_DIR || process.env.DATA_DIR || "data",
  // Only one bot does background work (tagging, analysis); the other bots just read the results
  libraryWorker: process.env.LIBRARY_WORKER !== "off",
  // Auto-tagging via audio fingerprints (AcoustID/MusicBrainz): off by default
  autotag: {
    enabled: process.env.AUTOTAG === "on",
    acoustidKey: process.env.ACOUSTID_KEY || null,
    autoApply: 0.85,
  },
  // Local tempo, energy and brightness analysis with ffmpeg: off by default
  analysis: { enabled: process.env.ANALYSIS === "on" },
  // Status API + /display page for small screens (0 = off)
  display: {
    port: Number(process.env.DISPLAY_PORT) > 0 ? Number(process.env.DISPLAY_PORT) : 0,
    bind: process.env.DISPLAY_BIND || "127.0.0.1",
    token: process.env.DISPLAY_TOKEN || null,
  },
};
