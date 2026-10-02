// musiDISCORD /display: đĩa quay theo nhịp thật của bài, loang màu khi đổi bài, điều khiển và tua bằng chạm.
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const token = params.get("token") || "";
  const guild = params.get("guild") || "";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const fine = matchMedia("(pointer: fine)");
  const root = document.documentElement;

  const el = {
    deck: $("deck"), pulse: $("pulse"), ring: $("ring"), ringText: $("ringText"), progFill: $("progFill"), disc: $("disc"), spin: $("discSpin"),
    cover: $("cover"), bpm: $("bpm"), bpmUnit: $("bpmUnit"), where: $("where"), title: $("title"), artist: $("artist"), meta: $("meta"),
    emptyTitle: $("emptyTitle"), emptyText: $("emptyText"), ruler: $("ruler"), head: $("head"), pos: $("pos"), dur: $("dur"),
    controls: $("controls"), loopBtn: document.querySelector('[data-act="loop"]'), loopDot: $("loopDot"),
    ghost: $("ghost"), toast: $("toast"), wipe: $("wipe"), live: $("live"), theme: $("themeColor"),
  };
  el.label = el.disc.querySelector(".disc__label");

  const MOODS = { chill: "Chill", steady: "Vừa phải", upbeat: "Sôi động", hype: "Hừng hực" };
  const COPY = {
    idle: ["Chưa có bài nào đang phát", "Vào kênh thoại rồi dùng /play, /local hoặc /nhaajt để bắt đầu."],
    quiz: ["Đang chơi đố nhạc", "Tên bài được giấu để không lộ đáp án."],
    offline: ["Mất kết nối với bot", "Trang sẽ tự thử lại sau vài giây."],
    auth: ["Cần token để xem trang này", "Thêm ?token=… vào cuối địa chỉ. Token nằm ở mục DISPLAY_TOKEN trong file .env của bot."],
  };

  let np = null;
  let at = 0;
  let trackKey = "";
  let mode = "idle";
  let canControl = false;
  let angle = 0;
  let vel = 0;
  let lastSecond = -1;
  let boxes = [];
  let pointer = null;

  const api = (path, extra = {}) => {
    const p = new URLSearchParams(extra);
    if (guild) p.set("guild", guild);
    if (token) p.set("token", token);
    const s = p.toString();
    return s ? `${path}?${s}` : path;
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const fmt = (ms) => {
    const t = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = String(t % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  };

  /* ---------- màu theo bài ---------- */
  function hueOf(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    if (!Number.isFinite(n)) return 262;
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    if (!d) return 262;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (Math.round(h * 60) + 360) % 360;
  }
  function theme(hue, energy) {
    const sat = 50 + Math.round(clamp(energy ?? 0.5, 0, 1) * 24);
    const c1 = `hsl(${hue} ${sat}% 25%)`;
    root.style.setProperty("--c1", c1);
    root.style.setProperty("--c2", `hsl(${(hue + 48) % 360} 88% 62%)`);
    root.style.setProperty("--c3", `hsl(${(hue + 300) % 360} 78% 40%)`);
    el.theme.setAttribute("content", c1);
    return c1;
  }

  /* ---------- hiệu ứng chữ ---------- */
  function buildTitle(text, delay) {
    el.title.textContent = "";
    el.title.setAttribute("aria-label", text);
    el.title.style.setProperty("--t0", `${delay}ms`);
    const letters = [];
    let i = 0;
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const w = document.createElement("span");
      w.className = "w";
      w.setAttribute("aria-hidden", "true");
      for (const ch of [...word]) {
        const c = document.createElement("span");
        c.className = "c";
        c.style.setProperty("--i", String(i++));
        c.textContent = ch;
        w.appendChild(c);
        letters.push(c);
      }
      el.title.appendChild(w);
      el.title.appendChild(document.createTextNode(" "));
    }
    const len = [...text].length;
    el.title.style.setProperty("--fit", String(len <= 12 ? 1 : len <= 22 ? 0.82 : len <= 36 ? 0.66 : len <= 56 ? 0.52 : 0.42));
    return letters;
  }

  const NOISE = "#%&/<>+*=ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  function scramble(node, text, delay) {
    clearInterval(node._t);
    if (reduced.matches || !text) {
      node.textContent = text || "";
      return;
    }
    let f = 0;
    const frames = 16;
    setTimeout(() => {
      node._t = setInterval(() => {
        f++;
        const keep = Math.floor((text.length * f) / frames);
        node.textContent = [...text].map((ch, i) => (i < keep || ch === " " ? ch : NOISE[(Math.random() * NOISE.length) | 0])).join("");
        if (f >= frames) {
          clearInterval(node._t);
          node.textContent = text;
        }
      }, 34);
    }, delay);
  }

  function measureLetters() {
    boxes = [...el.title.querySelectorAll(".c")].map((c) => {
      const r = c.getBoundingClientRect();
      return { c, x: r.left + r.width / 2, y: r.top + r.height / 2, d: 0 };
    });
  }

  let leanQueued = false;
  function lean() {
    leanQueued = false;
    const range = innerHeight * 0.3;
    for (const b of boxes) {
      const d = pointer ? clamp(1 - Math.hypot(pointer.x - b.x, pointer.y - b.y) / range, 0, 1) : 0;
      if (Math.abs(d - b.d) > 0.03) {
        b.d = d;
        b.c.style.setProperty("--d", d.toFixed(2));
      }
    }
  }
  addEventListener("pointermove", (e) => {
    if (!fine.matches || reduced.matches || e.pointerType !== "mouse") return;
    pointer = { x: e.clientX, y: e.clientY };
    const nx = (e.clientX / innerWidth - 0.5) * 2, ny = (e.clientY / innerHeight - 0.5) * 2;
    el.deck.style.transform = `perspective(900px) rotateY(${(nx * 5).toFixed(2)}deg) rotateX(${(-ny * 5).toFixed(2)}deg)`;
    if (!leanQueued) {
      leanQueued = true;
      requestAnimationFrame(lean);
    }
  });
  document.addEventListener("pointerleave", () => {
    pointer = null;
    el.deck.style.transform = "";
    requestAnimationFrame(lean);
  });

  /* ---------- loang màu khi đổi bài ---------- */
  function wipe(color) {
    if (reduced.matches || !el.wipe.animate) return;
    const r = el.deck.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 40;
    el.wipe.style.setProperty("--wipe", color);
    const grow = el.wipe.animate(
      [{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${R}px at ${x}px ${y}px)` }],
      { duration: 1050, easing: "cubic-bezier(.7,0,.2,1)", fill: "forwards" },
    );
    grow.onfinish = () => {
      const fade = el.wipe.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: "forwards" });
      fade.onfinish = () => {
        grow.cancel();
        fade.cancel();
      };
    };
  }

  /* ---------- chuyển bài ---------- */
  function onNewTrack(n, firstLoad) {
    const hue = hueOf(n.accent);
    const color = theme(hue, n.energy);
    if (!firstLoad) {
      wipe(color);
      vel = 560; // đĩa quay vọt rồi chậm dần
    }

    buildTitle(n.title, firstLoad ? 150 : 420);
    scramble(el.artist, n.artist || "", firstLoad ? 400 : 650);
    document.title = n.artist ? `${n.title} – ${n.artist}` : n.title;
    el.live.textContent = `Đang phát: ${n.title}${n.artist ? `, ${n.artist}` : ""}`;

    // vòng chữ: lặp nguyên cụm (không cắt giữa chừng) và chỉnh cỡ chữ cho vừa một vòng
    const clip = (s, max) => ([...s].length > max ? `${[...s].slice(0, max - 1).join("")}…` : s);
    const unit = `${clip(n.title, 30)} • ${clip(n.artist || "musiDISCORD", 22)} • `;
    const chars = [...unit].length;
    const ring = unit.repeat(Math.max(1, Math.round(76 / chars)));
    el.ringText.textContent = ring;
    el.ringText.parentNode.style.fontSize = `${clamp(1657 / [...ring].length, 16, 30).toFixed(1)}px`;

    const ghost = (n.artist || n.title).toUpperCase();
    el.ghost.textContent = `${ghost}   ${ghost}   ${ghost}`;

    el.cover.hidden = false;
    el.cover.classList.remove("is-on");
    if (n.cover) {
      el.cover.onload = () => el.cover.classList.add("is-on");
      el.cover.onerror = () => el.cover.classList.remove("is-on");
      el.cover.src = api("/api/cover", { t: trackKey });
    } else {
      el.cover.removeAttribute("src");
    }

    layoutRuler();
    setTimeout(measureLetters, 1700);
  }

  /* ---------- hiển thị ---------- */
  function setMode(next) {
    mode = next;
    document.body.dataset.state = next;
    if (next === "quiz") {
      el.bpm.textContent = "?";
      el.bpmUnit.textContent = "";
    } else if (next !== "playing" && next !== "paused") {
      el.bpm.textContent = "";
      el.bpmUnit.textContent = "";
    }
    const copy = COPY[next];
    if (copy) {
      el.emptyTitle.textContent = copy[0];
      el.emptyText.textContent = copy[1];
    }
  }

  function renderWhere(n) {
    const name = document.createElement("span");
    name.textContent = n.guild || n.bot || "";
    const nodes = [name];
    if (n.paused && n.title) {
      const chip = document.createElement("em");
      chip.className = "chip";
      chip.textContent = "Tạm dừng";
      nodes.push(chip);
    }
    el.where.replaceChildren(...nodes);
  }

  function renderMeta(n) {
    const lines = [];
    if (n.album) lines.push(n.album);
    if (n.mood) lines.push(`${MOODS[n.mood] || n.mood}${n.energy != null ? `, năng lượng ${Math.round(n.energy * 100)}%` : ""}`);
    if (n.next) lines.push(`Tiếp theo: ${n.next}`);
    else if (n.queueLength) lines.push(`Còn ${n.queueLength} bài trong hàng chờ`);
    if (n.repeat === "track") lines.push("Đang lặp bài này");
    if (n.repeat === "queue") lines.push("Đang lặp cả hàng chờ");
    el.meta.textContent = lines.join("\n");
  }

  function renderDisc(n) {
    if (n.bpm) {
      el.bpm.textContent = String(Math.round(n.bpm));
      el.bpmUnit.textContent = "nhịp/phút";
    } else {
      el.bpm.textContent = "♪";
      el.bpmUnit.textContent = "";
    }
    el.loopBtn.dataset.loop = n.repeat || "off";
    el.loopDot.textContent = n.repeat === "track" ? "1" : n.repeat === "queue" ? "∞" : "";
    const seekable = canControl && !n.isStream && n.duration;
    el.ruler.setAttribute("aria-disabled", seekable ? "false" : "true");
    el.controls.classList.toggle("is-off", !canControl);
  }

  function render(n) {
    np = n;
    at = performance.now();
    canControl = Boolean(n.canControl);
    renderWhere(n);

    if (n.hidden) return setMode("quiz");
    if (!n.title) return setMode("idle");

    const key = `${n.guildId}|${n.title}|${n.artist}`;
    const first = trackKey === "";
    setMode(n.paused ? "paused" : "playing");
    if (key !== trackKey) {
      trackKey = key;
      onNewTrack(n, first);
    }
    renderMeta(n);
    renderDisc(n);
  }

  /* ---------- thước theo nhịp ---------- */
  function layoutRuler() {
    if (!np || !np.duration) return;
    const w = el.ruler.clientWidth || 300;
    const beats = np.bpm ? (np.duration / 60000) * np.bpm : np.duration / 5000;
    let px = w / Math.max(beats, 1);
    while (px < 4) px *= 2;
    el.ruler.style.setProperty("--tick", `${px.toFixed(2)}px`);
  }
  addEventListener("resize", () => {
    layoutRuler();
    measureLetters();
  });

  function position(now) {
    if (!np) return 0;
    const p = np.position + (np.playing ? now - at : 0);
    return np.duration ? clamp(p, 0, np.duration) : p;
  }

  /* ---------- vòng lặp hoạt ảnh ---------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const live = mode === "playing" || mode === "paused";
    const playing = mode === "playing";

    // đĩa: tăng tốc, giảm tốc có quán tính
    const target = playing ? 34 + 40 * (np?.energy ?? 0.4) : 0;
    vel += (target - vel) * (1 - Math.exp(-dt / (playing ? 0.5 : 0.75)));
    angle = (angle + vel * dt) % 360;
    if (!reduced.matches) {
      el.spin.style.transform = `rotate(${angle.toFixed(2)}deg)`;
      el.ring.style.transform = `rotate(${(-angle * 0.35).toFixed(2)}deg)`;
    }

    if (live && np) {
      const pos = position(now);
      const p = np.duration ? pos / np.duration : 1;
      el.progFill.style.strokeDashoffset = String(1000 * (1 - p));
      el.ruler.style.setProperty("--played", `${(p * 100).toFixed(2)}%`);
      el.ghost.style.setProperty("--p", p.toFixed(4));
      const sec = Math.floor(pos / 1000);
      if (sec !== lastSecond) {
        lastSecond = sec;
        el.pos.textContent = fmt(pos);
        el.dur.textContent = np.duration ? fmt(np.duration) : "LIVE";
        el.ruler.setAttribute("aria-valuenow", String(Math.round(p * 100)));
      }

      // nhịp: đập đúng theo BPM đo được; không có BPM thì chỉ thở chậm
      if (!reduced.matches) {
        let k;
        if (playing && np.bpm) {
          const period = 60000 / np.bpm;
          k = Math.pow(1 - (pos % period) / period, 4);
        } else {
          k = playing ? ((Math.sin(now / 1100) + 1) / 2) * 0.45 : 0;
        }
        const e = np.energy ?? 0.5;
        el.pulse.style.transform = `scale(${(1 + (0.12 + 0.14 * e) * (1 - k)).toFixed(4)})`;
        el.pulse.style.opacity = String((0.7 * k).toFixed(3));
        el.label.style.transform = `scale(${(1 + 0.05 * k).toFixed(4)})`;
      }
    }
    requestAnimationFrame(frame);
  }

  /* ---------- thông báo ---------- */
  let toastTimer = 0;
  function toast(text, big) {
    el.toast.replaceChildren();
    if (big) {
      const b = document.createElement("b");
      b.textContent = big;
      el.toast.appendChild(b);
    }
    el.toast.append(text);
    el.toast.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("on"), 1800);
  }

  /* ---------- điều khiển ---------- */
  async function send(action, value) {
    if (!canControl) return toast("Điều khiển đang tắt. Mở trang với ?token=… và đặt DISPLAY_TOKEN trên bot.");
    if (action === "toggle" && np) {
      np.position = position(performance.now());
      at = performance.now();
      np.paused = !np.paused;
      np.playing = !np.paused;
      setMode(np.paused ? "paused" : "playing");
      renderWhere(np);
    }
    try {
      const res = await fetch(api("/api/control"), { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-token": token } : {}) }, body: JSON.stringify({ action, value }) });
      if (res.ok) return render(await res.json());
      const msg = { 401: "Thiếu hoặc sai token.", 403: "Điều khiển đang tắt trên bot.", 409: "Không có bài đang phát." }[res.status];
      toast(msg || "Không điều khiển được, thử lại nhé.");
    } catch {
      toast("Mất kết nối với bot.");
    }
  }

  el.controls.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "vol+" || act === "vol-") {
      const v = clamp((np?.volume ?? 100) + (act === "vol+" ? 10 : -10), 0, 150);
      if (canControl) toast("% âm lượng", String(v));
      return send("volume", v);
    }
    send(act);
  });
  el.disc.addEventListener("click", () => send("toggle"));

  function seekFromEvent(e) {
    if (!np?.duration || np.isStream) return;
    if (el.ruler.getAttribute("aria-disabled") === "true") return toast("Cần token để tua bài.");
    const r = el.ruler.getBoundingClientRect();
    const ratio = clamp((e.clientX - r.left) / r.width, 0, 0.999);
    send("seek", Math.round(ratio * np.duration));
  }
  el.ruler.addEventListener("pointerdown", seekFromEvent);
  el.ruler.addEventListener("keydown", (e) => {
    if (!np?.duration || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const to = clamp(position(performance.now()) + (e.key === "ArrowRight" ? 10000 : -10000), 0, np.duration - 1);
    send("seek", Math.round(to));
  });

  /* ---------- lấy dữ liệu ---------- */
  async function poll() {
    let wait = 1500;
    try {
      const res = await fetch(api("/api/np"), { cache: "no-store", headers: token ? { "x-token": token } : {} });
      if (res.status === 401) {
        setMode("auth");
        wait = 4000;
      } else if (res.ok) {
        render(await res.json());
      } else {
        setMode("offline");
        wait = 3000;
      }
    } catch {
      setMode("offline");
      wait = 3000;
    }
    setTimeout(poll, wait);
  }

  // giữ màn hình sáng (điện thoại, máy tính bảng dùng làm bảng hiển thị)
  async function keepAwake() {
    try {
      await navigator.wakeLock?.request("screen");
    } catch {
      // trình duyệt không cho thì thôi
    }
  }
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && keepAwake());

  setMode("idle");
  keepAwake();
  requestAnimationFrame(frame);
  poll();
})();
