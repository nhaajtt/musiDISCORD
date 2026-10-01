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
  // Đóng góp nhạc: tắt mặc định, chủ bot duyệt. OWNER_IDS (cách nhau bởi dấu phẩy) ghi đè chủ bot lấy từ Discord
  contributions: {
    enabled: process.env.CONTRIBUTIONS === "on",
    maxBytes: (Number(process.env.CONTRIB_MAX_MB) > 0 ? Number(process.env.CONTRIB_MAX_MB) : 30) * 1024 * 1024,
    ownerIds: (process.env.OWNER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean),
    folder: "Đóng góp",
  },
  idleLeaveMs: 60_000,
  // Tên bot (hiện trong cảnh báo, API trạng thái) và thư mục dữ liệu dùng chung giữa nhiều bot (thẻ, đặc trưng âm thanh, bìa)
  botName: process.env.BOT_NAME || "musiDISCORD",
  sharedDir: process.env.SHARED_DIR || process.env.DATA_DIR || "data",
  // Chỉ một bot làm việc nền (gắn thẻ, phân tích); các bot khác chỉ đọc kết quả
  libraryWorker: process.env.LIBRARY_WORKER !== "off",
  // Tự gắn thẻ bằng dấu vân âm thanh (AcoustID/MusicBrainz): tắt mặc định
  autotag: {
    enabled: process.env.AUTOTAG === "on",
    acoustidKey: process.env.ACOUSTID_KEY || null,
    autoApply: 0.85,
  },
  // Phân tích nhịp độ, năng lượng, độ sáng cục bộ bằng ffmpeg: tắt mặc định
  analysis: { enabled: process.env.ANALYSIS === "on" },
  // API trạng thái + trang /display cho màn hình nhỏ (0 = tắt)
  display: {
    port: Number(process.env.DISPLAY_PORT) > 0 ? Number(process.env.DISPLAY_PORT) : 0,
    bind: process.env.DISPLAY_BIND || "127.0.0.1",
    token: process.env.DISPLAY_TOKEN || null,
  },
};
