/* musiDISCORD site: theme, plotted linework, drafting-table motion */
(() => {
  "use strict";

  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const wideMq = window.matchMedia("(min-width: 900px)");
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const easeBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const isStatic = () => reduceMotion.matches;
  const hc = navigator.hardwareConcurrency || 8;
  const dm = navigator.deviceMemory || 8;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const lite = hc <= 2 || dm <= 2 || saveData;
  if (lite) root.classList.add("lite");

  /* ---------- shared frame loop: runs only while something visible needs it ---------- */

  const loops = new Set();
  let running = false;
  function frame(t) {
    let any = false;
    for (const l of [...loops]) {
      if (l.active) {
        any = true;
        l.fn(t);
      }
    }
    if (any && !document.hidden) requestAnimationFrame(frame);
    else running = false;
  }
  function wake() {
    if (!running && !document.hidden) {
      running = true;
      requestAnimationFrame(frame);
    }
  }
  function makeLoop(fn) {
    const l = { active: false, fn };
    loops.add(l);
    return l;
  }
  function setActive(l, v) {
    l.active = v;
    if (v) wake();
  }
  document.addEventListener("visibilitychange", wake);

  function watch(el, cb, opts) {
    if (!el || !("IntersectionObserver" in window)) {
      cb(true);
      return;
    }
    new IntersectionObserver((es) => es.forEach((e) => cb(e.isIntersecting)), opts || { rootMargin: "60px" }).observe(el);
  }
  function once(el, cb, threshold = 0.4) {
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      cb();
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          cb();
        }
      },
      { threshold }
    );
    io.observe(el);
  }

  /* ---------- effects: ring + screen shake ---------- */

  function slamFx(el, shake = true) {
    if (isStatic() || !el) return;
    const r = el.getBoundingClientRect();
    const ring = document.createElement("i");
    ring.className = "ring";
    ring.style.left = r.left + r.width / 2 + "px";
    ring.style.top = r.top + r.height / 2 + "px";
    document.body.appendChild(ring);
    setTimeout(() => ring.remove(), 800);
    if (shake && !lite) {
      root.classList.remove("shake");
      void root.offsetWidth;
      root.classList.add("shake");
      setTimeout(() => root.classList.remove("shake"), 360);
    }
  }

  let toastEl = null;
  let toastTimer = 0;
  function toast(text, ms = 4200) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
  }

  /* ---------- theme ---------- */

  const themeBtn = $("#theme");
  const metaTheme = $('meta[name="theme-color"]');
  const THEME_COLOR = { dark: "#0b3a60", light: "#e8f1f3" };

  function applyTheme(theme) {
    root.dataset.theme = theme;
    if (metaTheme) metaTheme.setAttribute("content", THEME_COLOR[theme]);
    if (themeBtn) {
      themeBtn.setAttribute("aria-pressed", String(theme === "light"));
      themeBtn.setAttribute("aria-label", theme === "light" ? "Chuyển sang giao diện tối" : "Chuyển sang giao diện sáng");
    }
  }
  applyTheme(root.dataset.theme === "light" ? "light" : "dark");

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const next = root.dataset.theme === "light" ? "dark" : "light";
      applyTheme(next);
      try {
        localStorage.setItem("musi-theme", next);
      } catch (e) {
        /* storage may be blocked */
      }
    });
  }

  /* ---------- frame zone marks (A-F down the sides, 1-8 along the top and bottom) ---------- */

  const zones = $(".zones");
  if (zones) {
    const add = (text, style) => {
      const s = document.createElement("span");
      s.textContent = text;
      Object.assign(s.style, style);
      zones.appendChild(s);
    };
    for (let i = 0; i < 8; i++) {
      const left = `calc(${((i + 0.5) / 8) * 100}% - 6px)`;
      add(String(i + 1), { left, top: "-6px" });
      add(String(i + 1), { left, bottom: "-6px" });
    }
    for (let i = 0; i < 6; i++) {
      const top = `calc(${((i + 0.5) / 6) * 100}% - 6px)`;
      const letter = "ABCDEF"[i];
      add(letter, { top, left: "-3px" });
      add(letter, { top, right: "-3px" });
    }
  }

  /* ---------- hero title: letters ink in one at a time ---------- */

  const split = $("[data-split]");
  if (split) {
    const text = split.textContent.trim();
    split.setAttribute("aria-label", text);
    split.textContent = "";
    [...text].forEach((ch, i) => {
      const s = document.createElement("span");
      s.className = "ch";
      s.setAttribute("aria-hidden", "true");
      s.style.setProperty("--i", String(i));
      s.textContent = ch;
      split.appendChild(s);
    });
  }

  /* ---------- section headings: pen-plotted letter by letter ---------- */

  const plotHeads = $$(".sheet h2, .legal h1, .legal .clause h2").map((h) => {
    const text = h.textContent.trim();
    h.setAttribute("aria-label", text);
    h.textContent = "";
    h.classList.add("ptext");
    const letters = [];
    text.split(/(\s+)/).forEach((tok) => {
      if (!tok) return;
      if (!tok.trim()) {
        h.appendChild(document.createTextNode(" "));
        return;
      }
      const w = document.createElement("span");
      w.className = "pw";
      w.setAttribute("aria-hidden", "true");
      [...tok].forEach((ch) => {
        const s = document.createElement("span");
        s.className = "pc";
        s.textContent = ch;
        w.appendChild(s);
        letters.push(s);
      });
      h.appendChild(w);
    });
    const pen = document.createElement("i");
    pen.className = "pen";
    pen.setAttribute("aria-hidden", "true");
    h.appendChild(pen);
    return { h, letters, pen, started: false };
  });

  function runPlot(o) {
    if (o.started) return;
    o.started = true;
    if (isStatic()) {
      o.h.classList.add("done");
      return;
    }
    const n = o.letters.length;
    const step = Math.min(60, 1100 / Math.max(1, n));
    const t0 = performance.now() + 120;
    let shown = -1;
    let ended = false;
    const l = makeLoop((t) => {
      const idx = Math.floor((t - t0) / step);
      if (idx < 0) return;
      const upto = Math.min(idx, n - 1);
      while (shown < upto) {
        shown++;
        o.letters[shown].classList.add("in");
      }
      const L = o.letters[Math.max(0, upto)];
      o.pen.style.transform = `translate(${L.offsetLeft + L.offsetWidth}px, ${L.offsetTop + L.offsetHeight * 0.8}px)`;
      o.pen.classList.add("on");
      if (idx >= n && !ended) {
        ended = true;
        o.pen.classList.remove("on");
        setTimeout(() => {
          o.h.classList.add("done");
          loops.delete(l);
        }, 750);
        l.active = false;
      }
    });
    setActive(l, true);
  }
  plotHeads.forEach((o) => once(o.h, () => runPlot(o), 0.6));

  /* ---------- dimension lines flying in under each sheet heading ---------- */

  const dims = $$(".sheet__head").filter((h) => !h.closest(".pin")).map((head) => {
    const d = document.createElement("div");
    d.className = "dimfly";
    d.setAttribute("aria-hidden", "true");
    d.innerHTML = "<s></s><i></i><b></b><i></i><s></s>";
    head.appendChild(d);
    return { head, d, label: d.querySelector("b") };
  });
  function labelDims() {
    const vals = dims.map(({ head }) => {
      let wpx = 0;
      $$(".pw", head).forEach((w) => (wpx = Math.max(wpx, w.offsetLeft + w.offsetWidth)));
      return Math.round((wpx || head.clientWidth) * 0.2646) + " mm";
    });
    dims.forEach(({ label }, i) => {
      if (label.textContent !== vals[i]) label.textContent = vals[i];
    });
  }
  dims.forEach(({ d }) => once(d, () => d.classList.add("on"), 1));

  /* ---------- plotted linework ---------- */

  $$("[data-draw],[data-intro]").forEach((n) => n.setAttribute("pathLength", "1"));

  const plots = $$("[data-plot]").map((el) => ({
    el,
    mode: el.dataset.plot,
    anchor: el.dataset.plot === "reveal" ? $(".plot, .wcard", el) || el : el,
    pin: false,
    p: -1,
    draws: $$("[data-draw]", el).map((n) => {
      const [a, b] = n.dataset.draw.split(",").map(Number);
      return { n, a, b: Math.max(b, a + 0.001) };
    }),
    shows: $$("[data-show]", el).map((n) => ({ n, t: parseFloat(n.dataset.show) })),
    steps: $$("[data-at]", el).map((n) => ({ n, at: parseFloat(n.dataset.at) })),
  }));
  const pinned = plots.filter((pl) => pl.mode === "pin");

  function configure() {
    const staticMode = reduceMotion.matches;
    root.classList.toggle("static", staticMode);
    const canPin = !staticMode && window.innerWidth >= 900 && window.innerHeight >= 700;
    pinned.forEach((pl) => {
      pl.el.classList.toggle("no-pin", !canPin);
      pl.pin = canPin;
    });
    if (root.classList.contains("ready")) {
      labelDims();
      update(true);
    }
  }

  /* ---------- sheet strip (current drawing in the bottom title strip) ---------- */

  const sheets = $$("[data-sheet]");
  const stripNo = $("#strip-no") || $(".strip b");
  const stripName = $("#strip-name") || $(".strip__name");
  let lastSheet = null;
  const sheetTops = [];

  function updateStrip() {
    if (!sheets.length || !stripNo || !stripName || !$("#strip-no")) return;
    let current = sheets[0];
    for (let i = 0; i < sheets.length; i++) {
      if (sheetTops[i] <= window.innerHeight * 0.45) current = sheets[i];
    }
    if (current === lastSheet) return;
    lastSheet = current;
    const [no, name] = current.dataset.sheet.split("|");
    stripNo.textContent = no;
    stripName.textContent = name;
  }

  /* ---------- parallax drafting layers (grid is layer 0) ---------- */

  const pxLayers = [];
  function buildParallax() {
    if (isStatic() || lite) return;
    const ticks = (x, y0, n, step, dir) => {
      let d = "";
      for (let i = 0; i <= n; i++) {
        const len = i % 5 === 0 ? 34 : 16;
        d += `M${x} ${y0 + i * step}h${dir * len}`;
      }
      return d;
    };
    const layers = [
      {
        k: 0.07,
        svg: `<circle cx="760" cy="430" r="330"/><circle cx="760" cy="430" r="250" stroke-dasharray="10 8"/><circle cx="760" cy="430" r="6"/><path d="M760 40V820M340 430H1180" stroke-dasharray="18 5 3 5"/><path d="M120 900A460 460 0 0 1 640 960" /><path d="M90 160A210 210 0 0 1 300 40"/>`,
      },
      {
        k: 0.15,
        svg: `<path d="M190 300l92-53 92 53v106l-92 53-92-53z"/><path d="M190 300l92 53 92-53M282 353v106"/><path d="M190 406l92 53" stroke-dasharray="6 6"/><path d="${ticks(40, 120, 40, 20, 1)}"/><path d="M820 620h120v120H820zM820 620l40-30h120l-40 30M980 590v120l-40 30" stroke-dasharray="5 5"/>`,
      },
      {
        k: 0.28,
        svg: `<path d="M0 780L1000 150M0 930L720 0"/><path d="M880 880l40 -26M920 854l-6 -44" /><circle cx="300" cy="560" r="14"/><path d="M300 540v40M280 560h40"/><circle cx="860" cy="260" r="10"/><path d="M846 260h28M860 246v28"/><path d="M560 880h300M560 868v24M860 868v24"/>`,
      },
    ];
    layers.forEach((L, i) => {
      const el = document.createElement("div");
      el.className = "px px--" + (i + 1);
      el.setAttribute("aria-hidden", "true");
      const mk = `<svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">${L.svg}</svg>`;
      el.innerHTML = mk + mk;
      document.body.insertBefore(el, document.body.firstChild.nextSibling);
      pxLayers.push({ el, k: L.k, y: -1 });
    });
  }
  buildParallax();

  /* ---------- fold-open sections ---------- */

  const folds = $$(".sheet:not(.pin), .foot").map((el) => ({ el, u: -1, on: false }));
  let rects = { plots: [], folds: [] };

  /* ---------- frame loop (scroll) ---------- */

  let ticking = false;

  function update(force) {
    ticking = false;
    const vh = window.innerHeight;
    const y = window.scrollY;

    /* reads */
    const max = document.documentElement.scrollHeight - vh;
    root.style.setProperty("--scroll", max > 0 ? (y / max).toFixed(4) : "0");
    for (let i = 0; i < sheets.length; i++) sheetTops[i] = sheets[i].getBoundingClientRect().top;
    if (reduceMotion.matches) {
      updateStrip();
      return;
    }
    rects.plots = plots.map((pl) => (pl.pin ? pl.el : pl.anchor).getBoundingClientRect());
    rects.folds = folds.map((f) => f.el.getBoundingClientRect().top);

    /* writes */
    updateStrip();

    for (const L of pxLayers) {
      const off = -((y * L.k) % vh);
      if (force || Math.abs(off - L.y) > 0.3) {
        L.y = off;
        L.el.style.transform = `translate3d(0, ${off.toFixed(1)}px, 0)`;
      }
    }

    folds.forEach((f, i) => {
      const top = rects.folds[i];
      const raw = clamp((vh * 0.98 - top) / (vh * 0.5));
      const u = ease(raw);
      if (!force && Math.abs(u - f.u) < 0.004) return;
      f.u = u;
      const needOn = u < 0.999;
      if (needOn !== f.on) {
        f.on = needOn;
        f.el.classList.toggle("fold-on", needOn);
      }
      f.el.style.setProperty("--unf", u.toFixed(3));
    });

    plots.forEach((pl, i) => {
      const r = rects.plots[i];
      let p;
      if (pl.pin) p = clamp(-r.top / Math.max(1, r.height - vh));
      else p = clamp((vh * 0.92 - r.top) / (r.height * 0.75 + vh * 0.1));
      if (!force && Math.abs(p - pl.p) < 0.0005) return;
      pl.p = p;

      for (const d of pl.draws) {
        d.n.style.strokeDashoffset = (1 - ease(clamp((p - d.a) / (d.b - d.a)))).toFixed(4);
      }
      for (const s of pl.shows) s.n.classList.toggle("on", p >= s.t);

      if (pl.steps.length) {
        let active = pl.steps[0];
        for (const s of pl.steps) if (p >= s.at) active = s;
        pl.steps.forEach((s) => s.n.classList.toggle("is-active", s === active));
      }
    });
  }

  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => update(false));
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", configure);
  reduceMotion.addEventListener("change", configure);

  /* ---------- copy buttons ---------- */

  $$("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const code = btn.parentElement.querySelector("code");
      const text = code ? code.innerText.trim() : "";
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
        } catch (err) {
          /* nothing else to try */
        }
        ta.remove();
      }
      btn.textContent = "Đã chép";
      setTimeout(() => (btn.textContent = "Chép"), 1600);
    });
  });

  /* =====================================================================
     Pencil cursor: graphite trail, grid-snapped crosshair, compass click
     ===================================================================== */

  const penBtn = $("#pen");
  let penOn = true;
  try {
    penOn = localStorage.getItem("musi-pen") !== "off";
  } catch (e) {
    /* ignore */
  }
  const ink = { cv: null };

  function initInk() {
    if (isStatic() || lite || !finePointer.matches) return;
    const cv = document.createElement("canvas");
    cv.id = "ink";
    cv.setAttribute("aria-hidden", "true");
    document.body.appendChild(cv);
    const ctx = cv.getContext("2d");
    let dpr = 1;
    let W = 0;
    let H = 0;
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    window.addEventListener("resize", size);

    const pts = [];
    const ripples = [];
    const LIFE = 900;
    const MAXPTS = 56;
    let mx = -100;
    let my = -100;
    let sx = -100;
    let sy = -100;
    let inside = false;
    let colLine = "#cdeeff";
    let colRed = "#ff8a78";
    let colTheme = "";
    const readColors = () => {
      const cs = getComputedStyle(root);
      colLine = cs.getPropertyValue("--line").trim() || colLine;
      colRed = cs.getPropertyValue("--redline").trim() || colRed;
      colTheme = root.dataset.theme;
    };

    const lp = makeLoop((t) => {
      if (colTheme !== root.dataset.theme) readColors();
      ctx.clearRect(0, 0, W, H);
      while (pts.length && t - pts[0].t > LIFE) pts.shift();

      /* graphite trail */
      ctx.lineCap = "round";
      ctx.strokeStyle = colLine;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[i - 1];
        const k = 1 - (t - a.t) / LIFE;
        if (k <= 0) continue;
        ctx.globalAlpha = 0.5 * k;
        ctx.lineWidth = 0.7 + 1.5 * k;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(a.x, a.y);
        ctx.stroke();
        ctx.globalAlpha = 0.22 * k;
        ctx.lineWidth = 0.6;
        const o = i % 2 ? 0.9 : -0.9;
        ctx.beginPath();
        ctx.moveTo(b.x + o, b.y - o);
        ctx.lineTo(a.x + o, a.y - o);
        ctx.stroke();
      }

      /* snapped crosshair */
      const tx = Math.round(mx / 12) * 12;
      const ty = Math.round(my / 12) * 12;
      sx += (tx - sx) * 0.4;
      sy += (ty - sy) * 0.4;
      const settled = Math.abs(tx - sx) < 0.3 && Math.abs(ty - sy) < 0.3;
      if (inside) {
        ctx.globalAlpha = 0.17;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, sy + 0.5);
        ctx.lineTo(W, sy + 0.5);
        ctx.moveTo(sx + 0.5, 0);
        ctx.lineTo(sx + 0.5, H);
        ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(sx, sy, 4.5, 0, 6.2832);
        ctx.moveTo(sx - 9, sy);
        ctx.lineTo(sx + 9, sy);
        ctx.moveTo(sx, sy - 9);
        ctx.lineTo(sx, sy + 9);
        ctx.stroke();
        ctx.globalAlpha = 0.65;
        ctx.fillStyle = colLine;
        ctx.font = "10px 'IBM Plex Mono', monospace";
        const lab = `x ${String(Math.round(sx)).padStart(4, "0")}  y ${String(Math.round(sy + window.scrollY)).padStart(4, "0")}`;
        ctx.fillText(lab, Math.min(sx + 12, W - 110), Math.max(sy - 10, 12));
      }

      /* compass ripples */
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const u = (t - r.t) / 750;
        if (u >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        const rad = 6 + 78 * ease(u);
        ctx.globalAlpha = 0.85 * (1 - u);
        ctx.strokeStyle = colRed;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(r.x, r.y, rad, 0, 6.2832);
        ctx.stroke();
        ctx.setLineDash([]);
        const ang = -1.2 + u * 5;
        ctx.beginPath();
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x + Math.cos(ang) * rad, r.y + Math.sin(ang) * rad);
        ctx.stroke();
        ctx.strokeStyle = colLine;
      }
      ctx.globalAlpha = 1;
      if (!pts.length && !ripples.length && settled) lp.active = false;
    });
    readColors();

    window.addEventListener(
      "pointermove",
      (e) => {
        if (!penOn || e.pointerType === "touch") return;
        mx = e.clientX;
        my = e.clientY;
        if (!inside) {
          inside = true;
          sx = mx;
          sy = my;
        }
        const t = performance.now();
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(last.x - mx, last.y - my) > 2.5) {
          pts.push({ x: mx, y: my, t });
          if (pts.length > MAXPTS) pts.shift();
        }
        setActive(lp, true);
      },
      { passive: true }
    );
    window.addEventListener("pointerdown", (e) => {
      if (!penOn || e.pointerType === "touch") return;
      ripples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (ripples.length > 4) ripples.shift();
      setActive(lp, true);
    });
    document.documentElement.addEventListener("pointerleave", () => {
      inside = false;
      pts.length = 0;
      ctx.clearRect(0, 0, W, H);
      lp.active = false;
    });
    ink.cv = cv;
    ink.clear = () => {
      pts.length = 0;
      ripples.length = 0;
      inside = false;
      ctx.clearRect(0, 0, W, H);
      lp.active = false;
    };
  }
  if (penBtn) {
    const paintPen = () => {
      penBtn.setAttribute("aria-pressed", String(penOn));
      penBtn.setAttribute("aria-label", penOn ? "Tắt bút vẽ theo con trỏ" : "Bật bút vẽ theo con trỏ");
      if (ink.cv) ink.cv.style.display = penOn ? "" : "none";
    };
    paintPen();
    penBtn.addEventListener("click", () => {
      penOn = !penOn;
      try {
        localStorage.setItem("musi-pen", penOn ? "on" : "off");
      } catch (e) {
        /* ignore */
      }
      if (!penOn && ink.clear) ink.clear();
      paintPen();
    });
  }

  /* ---------- magnetic, stamp-like buttons ---------- */

  if (finePointer.matches && !lite) {
    const mags = $$(".btn, .icon-btn");
    let mTick = false;
    let px = 0;
    let py = 0;
    window.addEventListener(
      "pointermove",
      (e) => {
        if (isStatic() || e.pointerType === "touch") return;
        px = e.clientX;
        py = e.clientY;
        if (mTick) return;
        mTick = true;
        requestAnimationFrame(() => {
          mTick = false;
          const reads = mags.map((b) => b.getBoundingClientRect());
          mags.forEach((b, i) => {
            const r = reads[i];
            if (r.bottom < -80 || r.top > window.innerHeight + 80) return;
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const dx = px - cx;
            const dy = py - cy;
            const near = Math.abs(dx) < r.width / 2 + 70 && Math.abs(dy) < r.height / 2 + 70;
            if (near) {
              b.style.setProperty("--mx", clamp(dx * 0.22, -8, 8).toFixed(1) + "px");
              b.style.setProperty("--my", clamp(dy * 0.3, -6, 6).toFixed(1) + "px");
            } else if (b.style.getPropertyValue("--mx")) {
              b.style.removeProperty("--mx");
              b.style.removeProperty("--my");
            }
          });
        });
      },
      { passive: true }
    );
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".btn");
    if (!b || isStatic()) return;
    const p = document.createElement("i");
    p.className = "print";
    b.appendChild(p);
    setTimeout(() => p.remove(), 750);
  });

  /* ---------- pulling a new sheet between pages (fallback when View Transitions are missing) ---------- */

  window.addEventListener("pageshow", (e) => {
    if (e.persisted) $$(".pull").forEach((p) => p.remove());
  });
  if (!("CSSViewTransitionRule" in window)) {
    const norm = (p) => p.replace(/index\.html$/, "");
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || isStatic()) return;
      if (a.target && a.target !== "_self") return;
      let u;
      try {
        u = new URL(a.href, location.href);
      } catch (err) {
        return;
      }
      if (u.origin !== location.origin || norm(u.pathname) === norm(location.pathname)) return;
      e.preventDefault();
      const p = document.createElement("div");
      p.className = "pull";
      p.setAttribute("aria-hidden", "true");
      p.textContent = "Rút tờ bản vẽ mới";
      document.body.appendChild(p);
      void p.offsetWidth;
      p.classList.add("go");
      try {
        sessionStorage.setItem("musi-pull", "1");
      } catch (err) {
        /* ignore */
      }
      setTimeout(() => {
        location.href = u.href;
      }, 480);
    });
  }

  /* =====================================================================
     Dial gauges
     ===================================================================== */

  $$("[data-gauge]").forEach((g) => {
    const val = +g.dataset.gauge;
    const max = +g.dataset.max || val;
    const dial = $(".gauge__dial", g);
    const num = $("[data-num]", g);
    const C = 60;
    const Y = 64;
    const pt = (f, r) => {
      const a = Math.PI * (1 + f);
      return [C + r * Math.cos(a), Y + r * Math.sin(a)];
    };
    let ticks = "";
    for (let i = 0; i <= 20; i++) {
      const f = i / 20;
      const major = i % 2 === 0;
      const [x1, y1] = pt(f, major ? 40 : 44);
      const [x2, y2] = pt(f, 50);
      ticks += `<path class="${major ? "g-tick" : "g-tick g-tick--s"}" d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
    }
    const [zx1, zy1] = pt(0.86, 56);
    const [zx2, zy2] = pt(1, 56);
    dial.innerHTML = `<svg viewBox="0 0 120 76" aria-hidden="true"><path class="g-arc" d="M10 ${Y}A50 50 0 0 1 110 ${Y}"/><path class="g-zone" d="M${zx1.toFixed(1)} ${zy1.toFixed(1)}A56 56 0 0 1 ${zx2.toFixed(1)} ${zy2.toFixed(1)}"/>${ticks}<line class="g-need" x1="${C}" y1="${Y}" x2="${C}" y2="26" style="transform-origin:${C}px ${Y}px;transform:rotate(-90deg)"/><circle class="g-hub" cx="${C}" cy="${Y}" r="4.5"/></svg>`;
    const needle = $(".g-need", dial);
    const target = clamp(val / max);
    const setAngle = (f) => (needle.style.transform = `rotate(${(-90 + 180 * f).toFixed(2)}deg)`);
    const finish = () => {
      setAngle(target);
      num.textContent = String(val);
    };
    if (isStatic()) {
      finish();
      return;
    }
    num.textContent = "0";
    once(g, () => {
      const t0 = performance.now() + 120;
      let last = -1;
      const l = makeLoop((t) => {
        const u = clamp((t - t0) / 1500);
        if (t < t0) return;
        setAngle(target * easeBack(u));
        const n = Math.round(val * ease(u));
        if (n !== last) {
          last = n;
          num.textContent = String(n);
        }
        if (u >= 1) {
          finish();
          l.active = false;
          loops.delete(l);
        }
      });
      setActive(l, true);
    }, 0.6);
  });

  /* =====================================================================
     Live signal on the pipeline diagram
     ===================================================================== */

  (function initSignal() {
    const sec = $("#so-do");
    if (!sec) return;
    const pulses = $$(".pulse", sec).map((c) => ({
      c,
      path: document.getElementById(c.dataset.sig),
      len: -1,
      sp: parseFloat(c.dataset.sp) || 0.5,
      off: parseFloat(c.dataset.off) || 0,
      wide: !!c.closest(".show-wide"),
    }));
    const bars = $$(".eqbar", sec);
    const eq = $(".eq", sec);
    const lp = makeLoop((t) => {
      if (isStatic()) {
        lp.active = false;
        return;
      }
      const wide = wideMq.matches;
      for (const p of pulses) {
        if (p.len < 0) {
          try {
            p.len = p.path.getTotalLength();
          } catch (e) {
            p.len = 0;
          }
        }
        if (p.wide !== wide || !p.len) {
          p.c.style.opacity = "0";
          continue;
        }
        if (!p.path.classList.contains("on")) {
          p.c.style.opacity = "0";
          continue;
        }
        const u = (t / 1000) * p.sp + p.off;
        const f = u - Math.floor(u);
        const pt = p.path.getPointAtLength(f * p.len);
        p.c.style.transform = `translate(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px)`;
        p.c.style.opacity = f < 0.06 || f > 0.94 ? "0.3" : "1";
      }
      if (eq && eq.classList.contains("on") && wide) {
        for (let i = 0; i < bars.length; i++) {
          const v = 0.2 + 0.8 * Math.abs(Math.sin(t / 230 + i * 0.9) * Math.cos(t / 410 + i * 0.37));
          bars[i].style.transform = `scaleY(${v.toFixed(3)})`;
        }
      }
    });
    watch(sec, (v) => setActive(lp, v && !isStatic()), { rootMargin: "0px" });
  })();

  /* =====================================================================
     Stamps that slam
     ===================================================================== */

  const revStamp = $("#rev-stamp");
  if (revStamp) {
    once(revStamp.closest("tr"), () => {
      revStamp.classList.add("show");
      setTimeout(() => slamFx(revStamp), 300);
    }, 0.8);
  }
  const badges = $("#badges");
  if (badges) {
    $$("li", badges).forEach((li, i) => li.style.setProperty("--i", String(i)));
    once(badges, () => {
      badges.classList.add("in");
      if (!isStatic()) setTimeout(() => slamFx($(".badge", badges), true), 300);
    }, 0.5);
  }

  /* =====================================================================
     Now Playing: exploded view, live progress
     ===================================================================== */

  (function initXV() {
    const xv = $("#xv");
    if (!xv) return;
    const songs = [
      { t: "Giai điệu số 7", a: "Nghệ sĩ mẫu, Album Một", d: 222, h: 200 },
      { t: "Đêm ở ga cuối", a: "Nghệ sĩ mẫu, Album Hai", d: 185, h: 332 },
      { t: "Lúc cà phê nguội", a: "Nghệ sĩ khác, Album Ba", d: 252, h: 38 },
    ];
    const SPEED = 8;
    let si = 0;
    let pos = 0;
    let playing = true;
    let loopMode = 0;
    let visible = false;
    let lastSec = -1;
    let pinned = false;
    const el = {
      fill: $("#xv-fill"),
      time: $("#xv-time"),
      title: $("#xv-title"),
      artist: $("#xv-artist"),
      kicker: $("#xv-kicker"),
      note: $("#xv-note"),
      loop: $("#xv-loop"),
    };
    const fmt = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
    const loopNames = ["tắt lặp", "lặp bài", "lặp hàng chờ"];
    const loopTags = ["", "1", "all"];
    const say = (s) => (el.note.textContent = s);
    function paintSong() {
      const s = songs[si];
      xv.style.setProperty("--hue", s.h);
      if (xv.dataset.mode === "now") {
        el.kicker.textContent = "Đang phát";
        el.title.textContent = s.t;
        el.artist.textContent = s.a;
      } else {
        el.kicker.textContent = "Hàng chờ";
        el.title.textContent = "Trang 1 / 3";
        el.artist.textContent = "10 bài mỗi trang";
      }
      lastSec = -1;
      render();
    }
    function render() {
      const s = songs[si];
      el.fill.style.transform = `scaleX(${clamp(pos / s.d).toFixed(4)})`;
      const sec = Math.floor(pos);
      if (sec !== lastSec) {
        lastSec = sec;
        el.time.textContent = fmt(pos) + " / " + fmt(s.d);
      }
    }
    function next() {
      si = (si + 1) % songs.length;
      pos = 0;
      paintSong();
    }
    const lp = makeLoop((t) => {
      const dt = Math.min(0.1, (t - (lp.last || t)) / 1000);
      lp.last = t;
      if (!playing) return;
      pos += dt * SPEED;
      if (pos >= songs[si].d) {
        if (loopMode === 1) pos = 0;
        else next();
      }
      render();
    });
    const sync = () => {
      xv.classList.toggle("is-live", visible);
      lp.last = 0;
      setActive(lp, visible && playing && !isStatic());
    };
    watch(xv, (v) => {
      visible = v;
      sync();
    });
    xv.classList.add("is-playing");
    paintSong();

    xv.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "pp") {
        playing = !playing;
        xv.classList.toggle("is-playing", playing);
        say(playing ? "tiếp tục phát" : "đã tạm dừng");
        sync();
      } else if (act === "skip") {
        next();
        say("bỏ qua, sang bài kế (đủ phiếu rồi)");
      } else if (act === "stop") {
        pos = 0;
        playing = false;
        xv.classList.remove("is-playing");
        render();
        say("đã dừng và xóa hàng chờ");
        sync();
      } else if (act === "loop") {
        loopMode = (loopMode + 1) % 3;
        el.loop.textContent = loopTags[loopMode];
        say("chế độ lặp: " + loopNames[loopMode]);
      } else if (act === "shuffle") {
        say("đã xáo trộn hàng chờ");
      } else if (act === "up" || act === "down") {
        const other = $(`[data-act="${act === "up" ? "down" : "up"}"]`, xv);
        const on = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", String(on));
        if (on) other.setAttribute("aria-pressed", "false");
        say(on ? (act === "up" ? "đã ghi 👍, bài này sẽ lên điểm" : "đã ghi 👎, bài này sẽ ít xuất hiện") : "đã bỏ đánh giá");
      } else if (act === "fav") {
        const on = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", String(on));
        say(on ? "đã thêm vào /favorites của bạn" : "đã bỏ khỏi /favorites");
      } else if (act === "lyrics") {
        say("lời bài hát chạy theo giọng nằm ở bản vẽ S-08");
      }
    });
    $$("[data-xv-mode]", xv).forEach((b) =>
      b.addEventListener("click", () => {
        xv.dataset.mode = b.dataset.xvMode;
        $$("[data-xv-mode]", xv).forEach((o) => {
          const on = o === b;
          o.classList.toggle("is-on", on);
          o.setAttribute("aria-pressed", String(on));
        });
        paintSong();
      })
    );
    const ex = $("#xv-explode");
    const setEx = (v) => xv.classList.toggle("is-exploded", v);
    ex.addEventListener("click", () => {
      pinned = !pinned;
      ex.setAttribute("aria-pressed", String(pinned));
      setEx(pinned);
    });
    /* hovering a legend item pulls the drawing apart and lights up that button */
    const lis = $$("#dang-phat .legend--keys li");
    const targets = () => [...$$(".xv__l--r1 .xb", xv), ...$$(".xv__l--r2 .xb", xv)];
    lis.forEach((li, i) => {
      const on = () => {
        if (isStatic()) return;
        if (xv.dataset.mode !== "now") $("[data-xv-mode=now]", xv).click();
        setEx(true);
        const t = targets()[i];
        if (t) t.classList.add("hl");
      };
      const off = () => {
        if (!pinned) setEx(false);
        targets().forEach((t) => t.classList.remove("hl"));
      };
      li.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && on());
      li.addEventListener("pointerleave", off);
    });
    /* once, when first seen: pull apart for a moment, then fold back */
    once(xv, () => {
      if (isStatic()) return;
      setTimeout(() => {
        if (!pinned) setEx(true);
      }, 700);
      setTimeout(() => {
        if (!pinned && !xv.matches(":hover")) setEx(false);
      }, 3600);
    }, 0.6);
  })();

  /* =====================================================================
     Fair queue + bump lanes
     ===================================================================== */

  (function initLanes() {
    const box = $("#fq");
    if (!box) return;
    const lanes = $$(".lane", box);
    const votes = $(".votes", box);
    let timers = [];
    const reset = () => {
      timers.forEach(clearTimeout);
      timers = [];
      lanes.forEach((l) =>
        $$(".chip3", l).forEach((c, i) => {
          c.style.transition = "none";
          c.classList.remove("hop");
          c.style.setProperty("--k", c.dataset.from);
          c.style.setProperty("--j", String(i));
        })
      );
      if (votes) votes.textContent = "0";
      void box.offsetWidth;
      lanes.forEach((l) => $$(".chip3", l).forEach((c) => (c.style.transition = "")));
    };
    const go = (l) => $$(".chip3", l).forEach((c) => c.style.setProperty("--k", c.dataset.to));
    const play = () => {
      reset();
      timers.push(setTimeout(() => go(lanes[0]), 500));
      [1, 2, 3].forEach((v, i) => timers.push(setTimeout(() => votes && (votes.textContent = String(v)), 700 + i * 600)));
      timers.push(
        setTimeout(() => {
          go(lanes[1]);
          const b = $(".is-bump", lanes[1]);
          b.classList.add("hop");
          setTimeout(() => slamFx(b, false), 700);
        }, 2700)
      );
    };
    lanes.forEach((l) =>
      $$(".chip3", l).forEach((c, i) => {
        c.style.setProperty("--k", c.dataset.from);
        c.style.setProperty("--j", String(i));
      })
    );
    if (isStatic()) {
      lanes.forEach(go);
      if (votes) votes.textContent = "3";
    } else {
      once(box, play, 0.5);
    }
    $("#fq-replay").addEventListener("click", () => {
      if (isStatic()) return;
      play();
    });
  })();

  /* =====================================================================
     Weighted pick demo
     ===================================================================== */

  (function initWeights() {
    const list = $("#wt-list");
    if (!list) return;
    const items = $$("li", list).map((li) => ({ li, w: +li.dataset.w, artist: li.dataset.artist, bar: $(".wt__bar u", li) }));
    let last = null;
    const paint = () => items.forEach((it) => it.bar.style.setProperty("--w", (it.w / 6).toFixed(3)));
    paint();
    list.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-d]");
      if (!b) return;
      const it = items.find((x) => x.li.contains(b));
      it.w = clamp(it.w + Number(b.dataset.d), 0.5, 6);
      paint();
    });
    $("#wt-pick").addEventListener("click", () => {
      let pool = items.filter((x) => x.artist !== last);
      if (!pool.length) pool = items;
      const total = pool.reduce((s, x) => s + x.w, 0);
      let r = Math.random() * total;
      let pick = pool[pool.length - 1];
      for (const x of pool) {
        r -= x.w;
        if (r <= 0) {
          pick = x;
          break;
        }
      }
      items.forEach((x) => {
        x.li.classList.toggle("is-pick", x === pick);
        x.li.classList.toggle("is-out", last !== null && x.artist === last);
      });
      $("#wt-out").textContent = `Bài kế: ${$("b", pick.li).textContent} (${pick.artist}), chiếm ${Math.round((pick.w / total) * 100)}% cơ hội trong lượt này.`;
      last = pick.artist;
    });
  })();

  /* =====================================================================
     Quiz
     ===================================================================== */

  (function initQuiz() {
    const qz = $("#qz");
    if (!qz) return;
    const fill = $("#qz-fill");
    const ptsEl = $("#qz-pts");
    const hint = $("#qz-hint");
    const pop = $("#qz-pop");
    const input = $("#qz-in");
    const stamp = $("#qz-stamp");
    const streakEl = $("#qz-streak");
    const meEl = $("#qz-me");
    const answerBtn = $("#qz-answer");
    const hintBtn = $("#qz-hbtn");
    const ANSWER = "Đêm ở ga cuối";
    const HINTS = ["Chữ cái đầu của bài là Đ.", "Tên bài có bốn từ.", "Từ cuối cùng là cuối."];
    const norm = (s) =>
      s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/đ/gi, "d")
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    let t = 0;
    let hints = 0;
    let state = "run";
    let streak = 0;
    let score = 1200;
    const pts = () => Math.max(60, Math.round(1000 - 40 * t) - hints * 150);
    const lp = makeLoop((now) => {
      const dt = Math.min(0.1, (now - (lp.last || now)) / 1000);
      lp.last = now;
      if (state !== "run") return;
      t += dt;
      draw();
      if (t > 22) end("HẾT GIỜ", "không ai kịp trả lời");
    });
    function draw() {
      const p = pts();
      ptsEl.textContent = String(p);
      fill.style.transform = `scaleX(${clamp(p / 1000).toFixed(3)})`;
    }
    function show(big, small) {
      stamp.innerHTML = "";
      stamp.append(document.createTextNode(big));
      const s = document.createElement("small");
      s.textContent = small;
      stamp.appendChild(s);
      stamp.classList.remove("show");
      void stamp.offsetWidth;
      stamp.classList.add("show");
      setTimeout(() => slamFx(stamp), 280);
    }
    function end(big, small) {
      state = "done";
      qz.classList.remove("is-live");
      pop.hidden = true;
      show(big, small);
    }
    function reset() {
      t = 0;
      hints = 0;
      state = "run";
      hint.textContent = "Chưa xin gợi ý. Mỗi gợi ý trừ 150 điểm.";
      stamp.classList.remove("show");
      pop.hidden = true;
      draw();
      sync();
    }
    let vis = false;
    function sync() {
      lp.last = 0;
      qz.classList.toggle("is-live", vis && state === "run" && !isStatic());
      setActive(lp, vis && state === "run" && !isStatic());
    }
    watch(qz, (v) => {
      vis = v;
      sync();
    });
    draw();
    answerBtn.addEventListener("click", () => {
      if (state !== "run") return;
      pop.hidden = false;
      input.value = "";
      input.focus({ preventScroll: true });
    });
    $("#qz-cancel").addEventListener("click", () => {
      pop.hidden = true;
      answerBtn.focus({ preventScroll: true });
    });
    pop.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        pop.hidden = true;
        answerBtn.focus({ preventScroll: true });
      }
    });
    pop.addEventListener("submit", (e) => {
      e.preventDefault();
      if (state !== "run") return;
      const ok = norm(input.value) === norm(ANSWER);
      pop.hidden = true;
      if (ok) {
        const base = pts();
        const gain = Math.round(base * (1 + 0.1 * streak));
        score += gain;
        meEl.textContent = String(score);
        meEl.closest("li").classList.add("bump");
        setTimeout(() => meEl.closest("li").classList.remove("bump"), 1200);
        const note = streak ? `chuỗi ${streak + 1}, thưởng ${streak * 10}%` : "câu đầu của chuỗi";
        streak += 1;
        streakEl.textContent = String(streak);
        end("ĐÚNG +" + gain, note);
      } else {
        streak = 0;
        streakEl.textContent = "0";
        state = "run";
        show("SAI", "chuỗi về 0, thử lại");
        answerBtn.focus({ preventScroll: true });
      }
    });
    hintBtn.addEventListener("click", () => {
      if (state !== "run" || hints >= HINTS.length) return;
      hints += 1;
      hint.textContent = `Gợi ý ${hints}/3 (đã trừ ${hints * 150} điểm): ${HINTS[hints - 1]}`;
      draw();
    });
    $("#qz-reset").addEventListener("click", reset);
    if (isStatic()) draw();
  })();

  /* =====================================================================
     Wrapped card: counter + tilt
     ===================================================================== */

  (function initWrapped() {
    const card = $("#wcard");
    if (!card) return;
    const cnt = $("[data-count]", card);
    if (cnt && !isStatic()) {
      const target = +cnt.dataset.count;
      cnt.textContent = "0";
      once(card, () => {
        const t0 = performance.now() + 700;
        const l = makeLoop((t) => {
          if (t < t0) return;
          const u = clamp((t - t0) / 1900);
          cnt.textContent = Math.round(target * ease(u)).toLocaleString("vi-VN");
          if (u >= 1) {
            l.active = false;
            loops.delete(l);
          }
        });
        setActive(l, true);
      }, 0.5);
    }
    if (finePointer.matches && !lite) {
      card.addEventListener("pointermove", (e) => {
        if (isStatic()) return;
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        card.style.setProperty("--rx", ((x - 0.5) * 12).toFixed(2) + "deg");
        card.style.setProperty("--ry", ((0.5 - y) * 10).toFixed(2) + "deg");
        card.style.setProperty("--gx", (x * 100).toFixed(0) + "%");
        card.style.setProperty("--gy", (y * 100).toFixed(0) + "%");
      });
      card.addEventListener("pointerleave", () => {
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      });
    }
  })();

  /* =====================================================================
     Karaoke lyrics
     ===================================================================== */

  let lyricsReady = null;
  (function initLyrics() {
    const box = $("#lyr");
    if (!box) return;
    const ul = $("#lyr-lines");
    const lis = $$("li", ul);
    const tm = $("#lyr-tm");
    const win = $(".lyr__win", box);
    const times = lis.map((li) => +li.dataset.t);
    const STEP = 3;
    const TOTAL = times[times.length - 1] + STEP + 1;
    let T = 0;
    let cur = -1;
    let ty = 0;
    let tgt = 0;
    const offsets = [];
    const measure = () => {
      lis.forEach((li, i) => (offsets[i] = li.offsetTop + li.offsetHeight / 2));
    };
    const fmt = (s) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(Math.floor(s % 60)).padStart(2, "0");
    function paint(T0, instant) {
      let idx = 0;
      for (let i = 0; i < times.length; i++) if (T0 >= times[i]) idx = i;
      if (idx !== cur) {
        cur = idx;
        lis.forEach((li, i) => {
          li.classList.toggle("is-now", i === idx);
          li.classList.toggle("is-past", i < idx);
        });
        tgt = offsets[idx] - win.clientHeight / 2;
      }
      const p = clamp((T0 - times[idx]) / STEP);
      lis[idx].style.setProperty("--p", (p * 100).toFixed(1) + "%");
      if (instant) ty = tgt;
      tm.textContent = fmt(T0);
    }
    const lp = makeLoop((now) => {
      const dt = Math.min(0.1, (now - (lp.last || now)) / 1000);
      lp.last = now;
      T = (T + dt) % TOTAL;
      paint(T, false);
      ty += (tgt - ty) * Math.min(1, dt * 7);
      ul.style.transform = `translate3d(0, ${(-ty).toFixed(1)}px, 0)`;
    });
    let measured = false;
    const place = () => {
      measure();
      measured = true;
      cur = -1;
      if (isStatic()) T = 10;
      paint(T, true);
      ul.style.transform = `translate3d(0, ${(-ty).toFixed(1)}px, 0)`;
    };
    window.addEventListener("resize", () => measured && place());
    lyricsReady = place;
    watch(box, (v) => {
      lp.last = 0;
      if (v && !measured) place();
      setActive(lp, v && !isStatic());
    });
  })();

  /* =====================================================================
     Voice channel: status text and 24/7
     ===================================================================== */

  (function initVC() {
    const vc = $("#vc");
    if (!vc) return;
    const stEl = $("#vc-status");
    const stText = $("#vc-status-text");
    const people = $$("[data-p]", vc);
    const bot = $("#vc-bot");
    const swSt = $("#vc-st");
    const sw247 = $("#vc-247");
    const swRadio = $("#vc-radio");
    const leaveBtn = $("#vc-leave");
    const restartBtn = $("#vc-restart");
    const logEl = $("#vc-log");
    let alone = false;
    let botIn = true;
    let typeTimer = 0;
    let shown = "";
    let botTimer = 0;
    const log = (s) => {
      const li = document.createElement("li");
      li.textContent = s;
      logEl.prepend(li);
      while (logEl.children.length > 4) logEl.lastChild.remove();
    };
    const statusText = () => (!botIn || !swSt.checked ? "" : swRadio.checked && sw247.checked ? "Radio: cả thư mục nhạc, phát không ngừng" : "Đang phát: Giai điệu số 7");
    function type(text) {
      clearTimeout(typeTimer);
      if (text === shown) return;
      if (isStatic() || !text) {
        shown = text;
        stText.textContent = text;
        stEl.classList.toggle("off", !text);
        return;
      }
      stEl.classList.remove("off");
      shown = text;
      let i = 0;
      stText.textContent = "";
      const tick = () => {
        i++;
        stText.textContent = text.slice(0, i);
        if (i < text.length) typeTimer = setTimeout(tick, 34);
      };
      tick();
    }
    const paint = () => {
      bot.classList.toggle("gone", !botIn);
      type(statusText());
      if (!statusText()) stEl.classList.add("off");
    };
    swSt.addEventListener("change", () => {
      log(swSt.checked ? "đã bật /settings vc-status: tên bài hiện trên kênh" : "đã tắt vc-status: kênh không còn dòng tên bài");
      paint();
    });
    sw247.addEventListener("change", () => {
      vc.dataset["247"] = sw247.checked ? "on" : "off";
      swRadio.disabled = !sw247.checked;
      if (!sw247.checked) swRadio.checked = false;
      log(sw247.checked ? "đã bật /247: bot ở lại kể cả khi vắng người" : "đã tắt /247: vắng người thì bot rời sau 60 giây");
      if (!sw247.checked && alone && botIn) scheduleLeave();
      paint();
    });
    swRadio.addEventListener("change", () => {
      log(swRadio.checked ? "radio bật: bot phát cả thư mục không ngừng" : "radio tắt");
      paint();
    });
    function scheduleLeave() {
      clearTimeout(botTimer);
      botTimer = setTimeout(() => {
        if (alone && !sw247.checked && botIn) {
          botIn = false;
          log("hết 60 giây (bản mẫu rút còn vài giây): bot rời kênh");
          paint();
        }
      }, 2600);
    }
    leaveBtn.addEventListener("click", () => {
      alone = !alone;
      people.forEach((p) => p.classList.toggle("gone", alone));
      leaveBtn.textContent = alone ? "Mọi người quay lại" : "Mọi người rời kênh";
      if (alone) {
        if (sw247.checked) log("kênh vắng nhưng bot vẫn ở lại, đèn vẫn sáng");
        else {
          log("kênh vắng, bot đếm ngược 60 giây");
          scheduleLeave();
        }
      } else {
        clearTimeout(botTimer);
        log(botIn ? "mọi người quay lại, nhạc vẫn đang phát" : "mọi người quay lại nhưng bot đã rời, gõ /play để gọi lại");
      }
    });
    restartBtn.addEventListener("click", () => {
      if (bot.classList.contains("restarting")) return;
      bot.classList.add("restarting");
      log("bot đang khởi động lại...");
      setTimeout(() => {
        bot.classList.remove("restarting");
        botIn = sw247.checked;
        log(botIn ? "bot tự vào lại kênh nhờ /247" : "bot không tự vào lại, vì /247 đang tắt");
        paint();
      }, 1600);
    });
    once(vc, () => paint(), 0.4);
    if (isStatic()) paint();
  })();

  /* =====================================================================
     Isometric turntable of the architecture
     ===================================================================== */

  function initTurn() {
    const cv = $("#turn");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const hint = $("#turn-hint");
    let W = 0;
    let H = 0;
    let dpr = 1;
    let ang = 0.7;
    let vel = 0;
    let dragging = false;
    let lastX = 0;
    let idle = 0;
    let col = { line: "#cdeeff", dim: "rgba(205,238,255,.38)", paper: "#072b49", red: "#ff8a78", ink: "#e3f5ff" };
    let colTheme = "";
    const readCol = () => {
      const cs = getComputedStyle(root);
      col = {
        line: cs.getPropertyValue("--line").trim(),
        dim: cs.getPropertyValue("--line-dim").trim(),
        paper: cs.getPropertyValue("--paper-2").trim(),
        red: cs.getPropertyValue("--redline").trim(),
        ink: cs.getPropertyValue("--ink").trim(),
      };
      colTheme = root.dataset.theme;
    };
    const boxes = [
      { n: 1, name: "Bot", x: 0, z: 0, w: 2.2, d: 2.2, h: 1.9 },
      { n: 2, name: "Lavalink", x: 3.6, z: -0.8, w: 1.9, d: 1.9, h: 1.3 },
      { n: 3, name: "music/", x: -3.6, z: -1.8, w: 2.0, d: 1.4, h: 0.8 },
      { n: 4, name: "data/", x: -3.4, z: 2.0, w: 1.7, d: 1.5, h: 0.55 },
      { n: 5, name: "Kênh thoại", x: 3.5, z: 2.9, w: 2.2, d: 1.5, h: 0.9 },
      { n: 6, name: "LRCLIB", x: 0, z: 3.6, w: 1.5, d: 1.1, h: 0.55, dashed: true },
    ];
    const links = [
      { a: 0, b: 1, heavy: true, sp: 0.5 },
      { a: 1, b: 4, heavy: true, sp: 0.42 },
      { a: 2, b: 0, sp: 0.45 },
      { a: 3, b: 0, sp: 0.3 },
      { a: 0, b: 5, dashed: true, sp: 0.25 },
    ];
    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now());
    }
    function draw(t) {
      if (colTheme !== root.dataset.theme) readCol();
      ctx.clearRect(0, 0, W, H);
      const S = Math.min(W / 15.5, H / 7.6);
      const cx = W / 2;
      const cy = H * 0.56;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const P = (x, y, z) => {
        const xr = x * c - z * s;
        const zr = x * s + z * c;
        return [cx + xr * S, cy + zr * S * 0.5 - y * S * 0.866, zr];
      };
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      /* ground grid */
      ctx.strokeStyle = col.line;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.14;
      ctx.beginPath();
      for (let i = -7; i <= 7; i++) {
        let a = P(i, 0, -5);
        let b = P(i, 0, 5);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        a = P(-7, 0, i * 0.714);
        b = P(7, 0, i * 0.714);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();

      /* turntable ring with degree ticks */
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * Math.PI * 2;
        const p = P(Math.cos(a) * 6.6, 0, Math.sin(a) * 6.6);
        if (i) ctx.lineTo(p[0], p[1]);
        else ctx.moveTo(p[0], p[1]);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const r2 = i % 6 === 0 ? 6.2 : 6.42;
        const p1 = P(Math.cos(a) * 6.6, 0, Math.sin(a) * 6.6);
        const p2 = P(Math.cos(a) * r2, 0, Math.sin(a) * r2);
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
      }
      ctx.stroke();

      /* links on the ground, with moving signal dots */
      const cen = (b) => [b.x, 0.02, b.z];
      for (const L of links) {
        const A = cen(boxes[L.a]);
        const B = cen(boxes[L.b]);
        const pa = P(...A);
        const pb = P(...B);
        ctx.globalAlpha = L.dashed ? 0.7 : 0.9;
        ctx.strokeStyle = L.dashed ? col.dim : col.line;
        ctx.lineWidth = L.heavy ? 2.6 : 1.5;
        ctx.setLineDash(L.dashed ? [7, 6] : []);
        ctx.beginPath();
        ctx.moveTo(pa[0], pa[1]);
        ctx.lineTo(pb[0], pb[1]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (!L.dashed || true) {
          const u = ((t / 1000) * L.sp) % 1;
          const q = P(A[0] + (B[0] - A[0]) * u, 0.05, A[2] + (B[2] - A[2]) * u);
          ctx.globalAlpha = 1;
          ctx.fillStyle = col.red;
          ctx.beginPath();
          ctx.arc(q[0], q[1], L.heavy ? 4 : 3, 0, 6.2832);
          ctx.fill();
        }
      }

      /* boxes, far to near */
      const order = boxes
        .map((b) => ({ b, z: b.x * s + b.z * c }))
        .sort((p, q) => p.z - q.z)
        .map((o) => o.b);
      const labels = [];
      for (const b of order) {
        const x0 = b.x - b.w / 2;
        const x1 = b.x + b.w / 2;
        const z0 = b.z - b.d / 2;
        const z1 = b.z + b.d / 2;
        const bot = [P(x0, 0, z0), P(x1, 0, z0), P(x1, 0, z1), P(x0, 0, z1)];
        const top = [P(x0, b.h, z0), P(x1, b.h, z0), P(x1, b.h, z1), P(x0, b.h, z1)];
        const faces = [
          { i: [0, 1], nx: 0, nz: -1, sh: 0.1 },
          { i: [3, 2], nx: 0, nz: 1, sh: 0.2 },
          { i: [0, 3], nx: -1, nz: 0, sh: 0.06 },
          { i: [1, 2], nx: 1, nz: 0, sh: 0.15 },
        ];
        const poly = (pts) => {
          ctx.beginPath();
          pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.closePath();
        };
        for (const f of faces) {
          const nzr = f.nx * s + f.nz * c;
          if (nzr <= 0.001) continue;
          const [a, d] = f.i;
          poly([bot[a], bot[d], top[d], top[a]]);
          if (!b.dashed) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = col.paper;
            ctx.fill();
            ctx.globalAlpha = f.sh + 0.05 * nzr;
            ctx.fillStyle = col.line;
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          ctx.strokeStyle = b.dashed ? col.dim : col.line;
          ctx.lineWidth = 1.6;
          ctx.setLineDash(b.dashed ? [6, 5] : []);
          ctx.stroke();
        }
        poly(top);
        if (!b.dashed) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = col.paper;
          ctx.fill();
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = col.line;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = b.dashed ? col.dim : col.line;
        ctx.lineWidth = 1.8;
        ctx.setLineDash(b.dashed ? [6, 5] : []);
        ctx.stroke();
        ctx.setLineDash([]);
        const tc = P(b.x, b.h, b.z);
        labels.push({ b, x: tc[0], y: tc[1] });
      }

      /* number bubbles and names */
      ctx.font = "600 12px 'IBM Plex Mono', monospace";
      ctx.textBaseline = "middle";
      for (const L of labels) {
        const y = L.y - 22;
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = col.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(L.x, L.y);
        ctx.lineTo(L.x, y + 11);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = col.paper;
        ctx.beginPath();
        ctx.arc(L.x, y, 11, 0, 6.2832);
        ctx.fill();
        ctx.setLineDash(L.b.dashed ? [4, 3] : []);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = col.ink;
        ctx.textAlign = "center";
        ctx.fillText(String(L.b.n), L.x, y + 0.5);
        if (W > 560) {
          ctx.textAlign = "left";
          ctx.fillText(L.b.name, L.x + 16, y + 0.5);
        }
      }

      /* angle readout */
      const deg = ((Math.round((ang * 180) / Math.PI) % 360) + 360) % 360;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = col.red;
      ctx.textAlign = "right";
      ctx.font = "600 13px 'IBM Plex Mono', monospace";
      ctx.fillText(`θ = ${String(deg).padStart(3, "0")}°`, W - 14, H - 16);
      ctx.globalAlpha = 1;
    }
    let visible = false;
    let acc = 0;
    const lp = makeLoop((now) => {
      const dt = Math.min(0.1, (now - (lp.last || now)) / 1000);
      lp.last = now;
      if (lite) {
        acc += dt;
        if (acc < 1 / 30) return;
        acc = 0;
      }
      if (!dragging) {
        idle += dt;
        vel *= Math.pow(0.04, dt);
        ang += vel * dt;
        if (idle > 1.5 && !isStatic()) ang += 0.2 * dt;
      }
      draw(now);
    });
    watch(cv, (v) => {
      visible = v;
      lp.last = 0;
      setActive(lp, v && !isStatic());
      if (v && isStatic()) draw(0);
    });
    cv.addEventListener("pointerdown", (e) => {
      dragging = true;
      lastX = e.clientX;
      vel = 0;
      cv.setPointerCapture(e.pointerId);
      if (hint) hint.textContent = "Thả ra để mâm tự quay tiếp";
    });
    cv.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      ang += dx * 0.011;
      vel = dx * 0.011 * 60;
      idle = 0;
      if (isStatic()) draw(0);
    });
    const up = () => {
      dragging = false;
      idle = 0;
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        ang += e.key === "ArrowLeft" ? -0.14 : 0.14;
        idle = 0;
        if (isStatic()) draw(0);
      }
    });
    window.addEventListener("resize", size);
    readCol();
    size();
  }
  (function lazyTurn() {
    const cv = $("#turn");
    if (!cv) return;
    if (!("IntersectionObserver" in window)) {
      initTurn();
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          initTurn();
        }
      },
      { rootMargin: "500px 0px" }
    );
    io.observe(cv);
  })();

  /* =====================================================================
     Contribution gate + wishlist demo
     ===================================================================== */

  (function initGate() {
    const g = $("#gate");
    if (!g) return;
    const own = $("#g-own");
    const send = $("#g-send");
    const ok = $("#g-ok");
    const no = $("#g-no");
    const stamp = $("#g-stamp");
    const log = $("#g-log");
    const lib = $("#g-lib");
    const bell = $("#g-bell");
    const bellc = $("#g-bellc");
    const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    const files = ["Đêm ở ga cuối.mp3", "Remix cuối tuần.mp3", "Bài lạ chưa rõ nguồn.mp3"];
    let n = 0;
    let cur = null;
    let notified = 0;
    const say = (s) => {
      const li = document.createElement("li");
      li.textContent = s;
      log.prepend(li);
      while (log.children.length > 4) log.lastChild.remove();
    };
    const step = (id, on) => $(id, g).classList.toggle("is-on", on);
    const mark = (big) => {
      stamp.textContent = big;
      stamp.classList.remove("show");
      void stamp.offsetWidth;
      stamp.classList.add("show");
      setTimeout(() => slamFx(stamp), 280);
    };
    const sync = () => {
      send.disabled = !own.checked || !!cur;
      ok.disabled = no.disabled = !cur;
    };
    own.addEventListener("change", sync);
    send.addEventListener("click", () => {
      cur = files[n % files.length];
      n += 1;
      $("#g-file").textContent = cur;
      $("#g-state").textContent = "đang chờ duyệt";
      $("#g-dm").textContent = "chủ bot nhận DM có nút Duyệt, Từ chối";
      step("#g-s1", true);
      step("#g-s2", true);
      step("#g-s3", false);
      say("đã gửi " + cur + ", file nằm trong hàng chờ duyệt");
      sync();
    });
    ok.addEventListener("click", () => {
      if (!cur) return;
      const f = cur;
      cur = null;
      $("#g-state").textContent = "đã duyệt";
      $("#g-dm").textContent = "người gửi được báo qua DM";
      step("#g-s3", true);
      const e = $(".empty", lib);
      if (e) e.remove();
      const li = document.createElement("li");
      li.textContent = f;
      lib.appendChild(li);
      mark("ĐÃ DUYỆT");
      say(f + " được duyệt, chuyển vào music/Đóng góp/");
      const key = norm(f.replace(/\.mp3$/, ""));
      $$("#g-board li").forEach((r) => {
        if (r.dataset.match === key && !r.classList.contains("done")) {
          r.classList.add("done");
          $(".st", r).textContent = "đã có trong kho";
          const votes = +$("b", r).textContent;
          notified += votes;
          bellc.textContent = String(notified);
          bell.classList.remove("ring");
          void bell.offsetWidth;
          bell.classList.add("ring");
          say("có file khớp, báo " + votes + " người đã đề xuất hoặc bầu qua DM");
        }
      });
      sync();
    });
    no.addEventListener("click", () => {
      if (!cur) return;
      const f = cur;
      cur = null;
      $("#g-state").textContent = "bị từ chối";
      $("#g-dm").textContent = "file tạm bị xóa, người gửi được báo lý do";
      step("#g-s3", false);
      mark("TỪ CHỐI");
      say(f + " bị từ chối, file tạm đã xóa");
      sync();
    });
    $("#g-board").addEventListener("click", (e) => {
      const b = e.target.closest("[data-vote]");
      if (!b || b.disabled) return;
      const c = $("b", b);
      c.textContent = String(+c.textContent + 1);
      b.disabled = true;
      say("đã thêm một phiếu bầu, mỗi người một phiếu cho mỗi đề xuất");
    });
    sync();
  })();

  /* =====================================================================
     Easter egg: Konami code, or tap the logo seven times
     ===================================================================== */

  function encore() {
    if (root.classList.contains("encore")) return;
    toast("Mở khóa REV E (chưa chính thức): thêm hai tấn bass. Đùa thôi, bot không có lệnh /bass.", 6000);
    if (isStatic()) return;
    root.classList.add("encore");
    const glyphs = ["♪", "♫", "♩", "♬"];
    const n = lite ? 10 : 24;
    for (let i = 0; i < n; i++) {
      const g = document.createElement("span");
      g.className = "noteRain";
      g.textContent = glyphs[i % glyphs.length];
      g.style.left = Math.random() * 100 + "vw";
      g.style.setProperty("--t", (3 + Math.random() * 3).toFixed(2) + "s");
      g.style.setProperty("--w", (Math.random() * 2).toFixed(2) + "s");
      g.style.setProperty("--dx", (Math.random() * 120 - 60).toFixed(0) + "px");
      g.style.setProperty("--r", (Math.random() * 120 - 60).toFixed(0) + "deg");
      document.body.appendChild(g);
      setTimeout(() => g.remove(), 6500);
    }
    slamFx($(".top") || document.body, true);
    setTimeout(() => root.classList.remove("encore"), 6500);
  }
  const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  let kpos = 0;
  window.addEventListener("keydown", (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    kpos = k === KONAMI[kpos] ? kpos + 1 : k === KONAMI[0] ? 1 : 0;
    if (kpos === KONAMI.length) {
      kpos = 0;
      encore();
    }
  });
  const logo = $(".logo");
  if (logo) {
    let taps = 0;
    let tapTimer = 0;
    logo.addEventListener("click", () => {
      taps++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => (taps = 0), 2200);
      if (taps >= 7) {
        taps = 0;
        encore();
      }
    });
  }

  /* ---------- start ---------- */

  configure();

  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise((res) => setTimeout(res, 1200))]).then(() => {
    root.classList.add("ready");
    labelDims();
    update(true);
    if (lyricsReady) lyricsReady();
    setTimeout(() => {
      initInk();
      if (penBtn && ink.cv && !penOn) ink.cv.style.display = "none";
    }, 500);
    const hs = $("#hero-stamp");
    if (hs && !isStatic()) {
      setTimeout(() => {
        if (window.scrollY < 300) slamFx(hs, true);
      }, 3150);
    }
  });
})();
