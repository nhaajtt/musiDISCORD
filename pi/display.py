#!/usr/bin/env python3
"""Màn hình TFT 3.5 inch cảm ứng cho musiDISCORD: đọc /api/np, vẽ lên framebuffer, cảm ứng điều khiển.

Chạy trên Raspberry Pi (ngoài container). Cần: python3-pil, python3-evdev (apt install python3-pil python3-evdev).
Biến môi trường (xem pi/display.env.example): DISPLAY_URL, DISPLAY_TOKEN, FB_DEVICE, TOUCH_DEVICE,
TOUCH_SWAP, TOUCH_INVERT_X, TOUCH_INVERT_Y, TOUCH_MIN, TOUCH_MAX.
"""
import io
import json
import os
import struct
import sys
import threading
import time
import urllib.error
import urllib.request

from PIL import Image, ImageDraw, ImageFont

URL = os.environ.get("DISPLAY_URL", "http://127.0.0.1:8787").rstrip("/")
TOKEN = os.environ.get("DISPLAY_TOKEN", "")
FB = os.environ.get("FB_DEVICE", "/dev/fb1")
TOUCH_DEV = os.environ.get("TOUCH_DEVICE", "")
SWAP = os.environ.get("TOUCH_SWAP", "0") == "1"
INV_X = os.environ.get("TOUCH_INVERT_X", "0") == "1"
INV_Y = os.environ.get("TOUCH_INVERT_Y", "0") == "1"
T_MIN = int(os.environ.get("TOUCH_MIN", "200"))
T_MAX = int(os.environ.get("TOUCH_MAX", "3900"))
POLL = 1.5

FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
]


def font(size):
    for p in FONT_PATHS:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def fb_info():
    name = os.path.basename(FB)
    base = f"/sys/class/graphics/{name}"
    with open(f"{base}/virtual_size") as f:
        w, h = (int(x) for x in f.read().strip().split(","))
    with open(f"{base}/bits_per_pixel") as f:
        bpp = int(f.read().strip())
    with open(f"{base}/stride") as f:
        stride = int(f.read().strip())
    return w, h, bpp, stride


def to_fb_bytes(img, bpp, stride):
    w, h = img.size
    if bpp == 16:
        raw = img.convert("RGB").tobytes()
        out = bytearray(stride * h)
        for y in range(h):
            row = bytearray()
            for x in range(w):
                i = (y * w + x) * 3
                r, g, b = raw[i], raw[i + 1], raw[i + 2]
                row += struct.pack("<H", ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3))
            out[y * stride : y * stride + len(row)] = row
        return bytes(out)
    # 32 bit: BGRA
    raw = img.convert("RGBA").tobytes("raw", "BGRA")
    if stride == w * 4:
        return raw
    out = bytearray(stride * h)
    for y in range(h):
        out[y * stride : y * stride + w * 4] = raw[y * w * 4 : (y + 1) * w * 4]
    return bytes(out)


def req(path, data=None):
    headers = {"x-token": TOKEN} if TOKEN else {}
    if data is not None:
        headers["content-type"] = "application/json"
        data = json.dumps(data).encode()
    r = urllib.request.Request(URL + path, data=data, headers=headers, method="POST" if data is not None else "GET")
    return urllib.request.urlopen(r, timeout=5).read()


class State:
    def __init__(self):
        self.np = {}
        self.at = time.time()
        self.cover_key = None
        self.cover = None
        self.lock = threading.Lock()

    def poll(self):
        try:
            np = json.loads(req("/api/np"))
        except (urllib.error.URLError, ValueError, OSError):
            np = {"offline": True}
        with self.lock:
            self.np, self.at = np, time.time()
        key = (np.get("title"), np.get("artist"))
        if np.get("cover") and key != self.cover_key:
            try:
                img = Image.open(io.BytesIO(req("/api/cover"))).convert("RGB")
                self.cover = img
            except Exception:
                self.cover = None
            self.cover_key = key
        elif not np.get("cover"):
            self.cover, self.cover_key = None, key


def hex_rgb(s, default=(59, 130, 246)):
    try:
        return tuple(int(s[i : i + 2], 16) for i in (1, 3, 5))
    except Exception:
        return default


def fmt(ms):
    t = int(ms // 1000)
    return f"{t // 60}:{t % 60:02d}"


def ellipsize(draw, text, f, max_w):
    if draw.textlength(text, font=f) <= max_w:
        return text
    while text and draw.textlength(text + "…", font=f) > max_w:
        text = text[:-1]
    return text + "…"


BUTTONS = [("vol-", "−"), ("toggle", "⏯"), ("skip", "⏭"), ("vol+", "+")]


def render(state, w, h):
    with state.lock:
        np, at = dict(state.np), state.at
    accent = hex_rgb(np.get("accent", "#3b82f6"))
    bg = tuple(int(c * 0.22) + 8 for c in accent)
    img = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(img)
    pad = 10

    if not np.get("title"):
        msg = "Đang chơi đố nhạc" if np.get("hidden") else ("Mất kết nối bot" if np.get("offline") else "Chưa có bài nào đang phát")
        f = font(20)
        d.text(((w - d.textlength(msg, font=f)) / 2, h / 2 - 12), msg, fill=(200, 210, 230), font=f)
        return img

    side = min(h - 110, w // 3)
    if state.cover is not None:
        img.paste(state.cover.resize((side, side)), (pad, pad))
    else:
        d.rectangle((pad, pad, pad + side, pad + side), fill=tuple(int(c * 0.5) for c in accent))
    tx = pad + side + pad
    tw = w - tx - pad
    ft, fa, fs = font(20), font(15), font(12)
    title = np["title"]
    lines, cur = [], ""
    for word in title.split(" "):
        trial = (cur + " " + word).strip()
        if d.textlength(trial, font=ft) <= tw or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    lines.append(cur)
    y = pad
    for line in lines[:3]:
        d.text((tx, y), ellipsize(d, line, ft, tw), fill=(240, 244, 255), font=ft)
        y += 25
    d.text((tx, y + 4), ellipsize(d, np.get("artist") or "", fa, tw), fill=(170, 184, 214), font=fa)
    sub = ("Tạm dừng • " if np.get("paused") else "") + f"Âm lượng {np.get('volume', 0)}%"
    d.text((tx, pad + side - 16), sub, fill=(150, 165, 200), font=fs)

    pos = np.get("position", 0) + ((time.time() - at) * 1000 if np.get("playing") else 0)
    dur = np.get("duration")
    if dur:
        pos = min(pos, dur)
    by = pad + side + 12
    d.rounded_rectangle((pad, by, w - pad, by + 6), 3, fill=tuple(min(255, c + 40) for c in bg))
    frac = (pos / dur) if dur else 1
    d.rounded_rectangle((pad, by, pad + int((w - 2 * pad) * frac), by + 6), 3, fill=accent)
    d.text((pad, by + 10), fmt(pos), fill=(150, 165, 200), font=fs)
    end = fmt(dur) if dur else "LIVE"
    d.text((w - pad - d.textlength(end, font=fs), by + 10), end, fill=(150, 165, 200), font=fs)

    bw = (w - pad * 2 - 3 * 8) // 4
    bh = 44
    top = h - bh - pad
    fb = font(24)
    for i, (_, label) in enumerate(BUTTONS):
        x = pad + i * (bw + 8)
        d.rounded_rectangle((x, top, x + bw, top + bh), 8, fill=tuple(min(255, c + 35) for c in bg))
        d.text((x + (bw - d.textlength(label, font=fb)) / 2, top + 6), label, fill=(240, 244, 255), font=fb)
    return img


def button_at(x, y, w, h):
    pad, bh = 10, 44
    top = h - bh - pad
    if y < top or y > top + bh:
        return None
    bw = (w - pad * 2 - 3 * 8) // 4
    for i, (name, _) in enumerate(BUTTONS):
        bx = pad + i * (bw + 8)
        if bx <= x <= bx + bw:
            return name
    return None


def touch_loop(state, w, h):
    try:
        import evdev
    except ImportError:
        print("Thiếu python3-evdev, bỏ qua cảm ứng", file=sys.stderr)
        return
    dev = None
    for path in evdev.list_devices():
        d = evdev.InputDevice(path)
        if (TOUCH_DEV and path == TOUCH_DEV) or (not TOUCH_DEV and any(k in d.name.lower() for k in ("ads7846", "touch", "xpt2046"))):
            dev = d
            break
    if not dev:
        print("Không thấy thiết bị cảm ứng", file=sys.stderr)
        return
    print("Cảm ứng:", dev.name, file=sys.stderr)
    raw_x = raw_y = None
    down = False
    for ev in dev.read_loop():
        if ev.type == evdev.ecodes.EV_ABS:
            if ev.code == evdev.ecodes.ABS_X:
                raw_x = ev.value
            elif ev.code == evdev.ecodes.ABS_Y:
                raw_y = ev.value
        elif ev.type == evdev.ecodes.EV_KEY and ev.code == evdev.ecodes.BTN_TOUCH:
            if ev.value == 1:
                down = True
            elif down and raw_x is not None and raw_y is not None:
                down = False
                a, b = (raw_y, raw_x) if SWAP else (raw_x, raw_y)
                nx = min(1, max(0, (a - T_MIN) / (T_MAX - T_MIN)))
                ny = min(1, max(0, (b - T_MIN) / (T_MAX - T_MIN)))
                if INV_X:
                    nx = 1 - nx
                if INV_Y:
                    ny = 1 - ny
                name = button_at(int(nx * w), int(ny * h), w, h)
                if name:
                    act = {"toggle": ("toggle", None), "skip": ("skip", None)}.get(name)
                    vol = state.np.get("volume", 100)
                    if name == "vol+":
                        act = ("volume", min(150, vol + 10))
                    elif name == "vol-":
                        act = ("volume", max(0, vol - 10))
                    try:
                        req("/api/control", {"action": act[0], "value": act[1]})
                        state.poll()
                    except Exception as e:
                        print("Điều khiển lỗi:", e, file=sys.stderr)


def main():
    w, h, bpp, stride = fb_info()
    print(f"Framebuffer {FB}: {w}x{h} {bpp}bpp", file=sys.stderr)
    state = State()
    threading.Thread(target=touch_loop, args=(state, w, h), daemon=True).start()
    last_poll = 0
    with open(FB, "wb", buffering=0) as fb:
        while True:
            if time.time() - last_poll >= POLL:
                state.poll()
                last_poll = time.time()
            fb.seek(0)
            fb.write(to_fb_bytes(render(state, w, h), bpp, stride))
            time.sleep(0.5)


if __name__ == "__main__":
    main()
