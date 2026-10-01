import { config } from "./config.js";

const COOLDOWN_MS = 60_000;
const lastSent = new Map();

/** Gửi cảnh báo cho người vận hành qua webhook Discord (nếu có cấu hình ALERT_WEBHOOK_URL). */
export async function alertOwner(key, message) {
  if (!config.alertWebhookUrl) return;

  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < COOLDOWN_MS) return;
  lastSent.set(key, now);

  await fetch(config.alertWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: config.botName, content: `[${config.botName}] ${message}`.slice(0, 1900) }),
  }).catch(() => {});
}
