import "dotenv/config";

const required = ["DISCORD_TOKEN", "CLIENT_ID"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Thiếu biến môi trường: ${missing.join(", ")}`);
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
  // Thư mục nhạc, cùng đường dẫn trong container bot và Lavalink
  musicDir: process.env.MUSIC_DIR || "/music",
  // Nơi lưu cài đặt từng server (mount thành volume để không mất khi tạo lại container)
  dataDir: process.env.DATA_DIR || "data",
  // Webhook Discord nhận cảnh báo khi Lavalink mất kết nối (tuỳ chọn)
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || null,
  // Múi giờ dùng cho thống kê (giờ nghe, chuỗi ngày)
  timezone: process.env.TIMEZONE || "Asia/Ho_Chi_Minh",
  // Tra lời bài hát từ LRCLIB khi file không có lời (đặt LYRICS_LOOKUP=off để tắt)
  lyricsLookup: process.env.LYRICS_LOOKUP !== "off",
  // Chu kỳ tự lưu hàng chờ (giây). 0 = tắt lưu định kỳ, chỉ lưu khi bắt đầu bài mới và khi tắt bot (đỡ ghi đĩa trên Raspberry Pi)
  autosaveSeconds: Number.isFinite(Number(process.env.AUTOSAVE_SECONDS)) && process.env.AUTOSAVE_SECONDS !== undefined && process.env.AUTOSAVE_SECONDS !== "" ? Number(process.env.AUTOSAVE_SECONDS) : 15,
  idleLeaveMs: 60_000,
};
