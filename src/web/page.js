/** Trang /display: 480x320, tự đủ (không tải gì từ ngoài), hợp màn hình TFT 3.5" và điện thoại. */
export function displayHtml() {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>Đang phát</title>
<style>
  :root { --accent: #3b82f6; --bg: #0b1220; --ink: #e8eefc; --dim: #8fa0c4; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--ink); font-family: system-ui, "Segoe UI", sans-serif; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; }
  main { width: 100%; max-width: 480px; height: 100%; max-height: 320px; padding: 12px; display: grid; grid-template-rows: 1fr auto auto; gap: 8px; background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 28%, var(--bg)), var(--bg) 70%); transition: background .6s; }
  .top { display: grid; grid-template-columns: 132px 1fr; gap: 12px; min-height: 0; }
  .cover { width: 132px; height: 132px; border-radius: 6px; background: color-mix(in srgb, var(--accent) 40%, #000); object-fit: cover; align-self: center; }
  .meta { display: flex; flex-direction: column; justify-content: center; min-width: 0; gap: 4px; }
  .title { font-size: 22px; font-weight: 700; line-height: 1.15; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
  .artist { color: var(--dim); font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .small { color: var(--dim); font-size: 12px; }
  .bar { height: 6px; background: rgba(255,255,255,.15); border-radius: 3px; overflow: hidden; }
  .bar i { display: block; height: 100%; width: 0; background: var(--accent); }
  .times { display: flex; justify-content: space-between; color: var(--dim); font-size: 12px; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .btns { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  button { height: 52px; border: 0; border-radius: 8px; font-size: 22px; color: var(--ink); background: rgba(255,255,255,.12); }
  button:active { background: var(--accent); }
  button[hidden] { display: none; }
  .idle { grid-row: 1 / 4; display: none; align-items: center; justify-content: center; text-align: center; color: var(--dim); font-size: 18px; }
  body.idle .top, body.idle .prog, body.idle .btns { display: none; }
  body.idle .idle { display: flex; }
</style>
</head>
<body class="idle">
<main>
  <div class="top">
    <img id="cover" class="cover" alt="">
    <div class="meta"><div id="title" class="title"></div><div id="artist" class="artist"></div><div id="sub" class="small"></div></div>
  </div>
  <div class="prog"><div class="bar"><i id="fill"></i></div><div class="times"><span id="pos">0:00</span><span id="dur">0:00</span></div></div>
  <div class="btns">
    <button id="vdown" aria-label="Giảm âm lượng">🔉</button>
    <button id="toggle" aria-label="Tạm dừng / phát">⏯</button>
    <button id="skip" aria-label="Bỏ qua">⏭</button>
    <button id="vup" aria-label="Tăng âm lượng">🔊</button>
  </div>
  <div id="idle" class="idle">🎵 Chưa có bài nào đang phát</div>
</main>
<script>
(function () {
  var q = new URLSearchParams(location.search);
  var token = q.get("token") || "";
  var guild = q.get("guild") || "";
  var state = null, at = 0, coverKey = "";
  var $ = function (id) { return document.getElementById(id); };
  function qs(extra) {
    var p = new URLSearchParams(extra || {});
    if (guild) p.set("guild", guild);
    if (token) p.set("token", token);
    var s = p.toString();
    return s ? "?" + s : "";
  }
  function fmt(ms) { var t = Math.floor(ms / 1000), m = Math.floor(t / 60), s = t % 60; return m + ":" + (s < 10 ? "0" : "") + s; }
  function render() {
    var s = state;
    var idle = !s || !s.title;
    document.body.className = idle ? "idle" : "";
    $("idle").textContent = s && s.hidden ? "🎲 Đang chơi đố nhạc" : "🎵 Chưa có bài nào đang phát";
    if (idle) return;
    document.documentElement.style.setProperty("--accent", s.accent || "#3b82f6");
    $("title").textContent = s.title;
    $("artist").textContent = s.artist || "";
    $("sub").textContent = (s.paused ? "⏸ Tạm dừng • " : "") + "Âm lượng " + s.volume + "%" + (s.queueLength ? " • còn " + s.queueLength + " bài" : "");
    var key = s.title + "|" + s.artist;
    if (key !== coverKey) {
      coverKey = key;
      $("cover").style.visibility = s.cover ? "visible" : "hidden";
      if (s.cover) $("cover").src = "/api/cover" + qs({ t: Date.now() });
    }
    tick();
  }
  function tick() {
    var s = state;
    if (!s || !s.title) return;
    var pos = s.position + (s.playing ? Date.now() - at : 0);
    if (s.duration) pos = Math.min(pos, s.duration);
    $("pos").textContent = fmt(pos);
    $("dur").textContent = s.duration ? fmt(s.duration) : "LIVE";
    $("fill").style.width = s.duration ? (100 * pos / s.duration).toFixed(1) + "%" : "100%";
  }
  function poll() {
    fetch("/api/np" + qs(), { cache: "no-store", headers: token ? { "x-token": token } : {} })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j) { state = j; at = Date.now(); render(); } })
      .catch(function () {});
  }
  function send(action, value) {
    fetch("/api/control" + qs(), { method: "POST", headers: { "content-type": "application/json", "x-token": token }, body: JSON.stringify({ action: action, value: value }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j) { state = j; at = Date.now(); render(); } })
      .catch(function () {});
  }
  $("toggle").onclick = function () { send("toggle"); };
  $("skip").onclick = function () { send("skip"); };
  $("vup").onclick = function () { send("volume", Math.min(150, ((state && state.volume) || 100) + 10)); };
  $("vdown").onclick = function () { send("volume", Math.max(0, ((state && state.volume) || 100) - 10)); };
  poll();
  setInterval(poll, 1500);
  setInterval(tick, 500);
})();
</script>
</body>
</html>`;
}
