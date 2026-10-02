import { config } from "../config.js";

const formatters = new Map();
function formatter(options) {
  const key = JSON.stringify(options);
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat("en-GB", { timeZone: config.timezone, ...options }));
  return formatters.get(key);
}

/** Hour (0-23) of a timestamp in the configured time zone. */
export function localHour(ms) {
  return Number(formatter({ hour: "2-digit", hourCycle: "h23" }).format(ms)) % 24;
}

/** Date as YYYY-MM-DD in the configured time zone. */
export function localDay(ms) {
  const p = Object.fromEntries(formatter({ year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ms).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function offsetMs(ms) {
  const p = Object.fromEntries(
    formatter({ year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(ms)
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** The [start, end) range of a year in the configured time zone, in ms. */
export function yearRange(year) {
  const edge = (y) => {
    const guess = Date.UTC(y, 0, 1);
    return guess - offsetMs(guess);
  };
  return [edge(year), edge(year + 1)];
}
