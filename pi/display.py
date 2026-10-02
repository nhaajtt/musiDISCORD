#!/usr/bin/env python3
"""Màn hình TFT 3.5 inch cảm ứng cho musiDISCORD: đọc /api/np, vẽ lên framebuffer, cảm ứng điều khiển.

Chạy trên Raspberry Pi (ngoài container). Cần: python3-pil, python3-evdev (apt install python3-pil python3-evdev).
Biến môi trường (xem pi/display.env.example): DISPLAY_URL, DISPLAY_TOKEN, FB_DEVICE, TOUCH_DEVICE,
FB_ROTATE, TOUCH_SWAP, TOUCH_INVERT_X, TOUCH_INVERT_Y, TOUCH_MIN, TOUCH_MAX (chung) hoặc TOUCH_X_MIN/X_MAX/Y_MIN/Y_MAX (riêng từng trục).
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
from array import array

from PIL import Image, ImageDraw, ImageFont

try:
    import numpy as numpy_mod
except ImportError:  # chậm hơn nhưng vẫn chạy được
    numpy_mod = None

URL = os.environ.get("DISPLAY_URL", "http://127.0.0.1:8787").rstrip("/")
TOKEN = os.environ.get("DISPLAY_TOKEN", "")
ROTATE = os.environ.get("FB_ROTATE", "auto")  # auto | 0 | 90 | 180 | 270


def find_fb():
    """FB_DEVICE nếu đặt; không thì tìm màn SPI (ili9486, ili9341...), cuối cùng mặc định /dev/fb1."""
    if os.environ.get("FB_DEVICE"):
        return os.environ["FB_DEVICE"]
    try:
        for name in sorted(os.listdir("/sys/class/graphics")):
            if not name.startswith("fb") or not name[2:].isdigit():
                continue
            with open(f"/sys/class/graphics/{name}/name") as f:
                if any(k in f.read().lower() for k in ("ili", "st77", "hx83", "ssd1")):
                    return f"/dev/{name}"
    except OSError:
        pass
    return "/dev/fb1"


FB = find_fb()
TOUCH_DEV = os.environ.get("TOUCH_DEVICE", "")
SWAP = os.environ.get("TOUCH_SWAP", "0") == "1"
INV_X = os.environ.get("TOUCH_INVERT_X", "0") == "1"
INV_Y = os.environ.get("TOUCH_INVERT_Y", "0") == "1"
T_MIN = os.environ.get("TOUCH_MIN", "")  # để trống = đọc dải giá trị từ thiết bị
T_MAX = os.environ.get("TOUCH_MAX", "")
POLL = 1.5
# Màn SPI chỉ gửi được vài khung đầy đủ mỗi giây, nên mặc định đĩa đứng yên và chỉ vẽ lại khi có thay đổi thật.
# TFT_ANIMATE=1 bật đĩa quay (cần SPI nhanh, tối thiểu 16 MHz).
ANIMATE = os.environ.get("TFT_ANIMATE", "0") == "1"
FRAME_S = float(os.environ.get("FRAME_SECONDS", "0.12"))  # khoảng cách giữa hai khung khi đĩa quay

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


def rgb565(img):
    """Ảnh PIL -> RGB565 little-endian (PIL không có bộ mã hoá 565 nên tự đổi)."""
    if numpy_mod is not None:
        a = numpy_mod.asarray(img.convert("RGB"), dtype=numpy_mod.uint16)
        return (((a[..., 0] & 0xF8) << 8) | ((a[..., 1] & 0xFC) << 3) | (a[..., 2] >> 3)).astype("<u2").tobytes()
    raw = img.convert("RGB").tobytes()
    arr = array("H", [((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3) for r, g, b in zip(raw[0::3], raw[1::3], raw[2::3])])
    if sys.byteorder == "big":
        arr.byteswap()
    return arr.tobytes()


def to_fb_bytes(img, bpp, stride):
    w, h = img.size
    if bpp == 16:
        raw = rgb565(img)
        row = w * 2
    else:
        raw = img.convert("RGBA").tobytes("raw", "BGRA")
        row = w * 4
    if stride == row:
        return raw
    out = bytearray(stride * h)
    for y in range(h):
        out[y * stride : y * stride + row] = raw[y * row : (y + 1) * row]
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
        self.wake = threading.Event()  # đặt khi cần vẽ lại ngay (sau khi chạm)

    def poll(self):
        try:
            np = json.loads(req("/api/np"))
        except urllib.error.HTTPError as e:
            np = {"error": e.code}
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


ASSET_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "fonts")
FONT_FILES = {
    "disp-bold": "BarlowCondensed-Bold.ttf",
    "disp-semi": "BarlowCondensed-SemiBold.ttf",
    "mono": "IBMPlexMono-Regular.ttf",
    "mono-bold": "IBMPlexMono-Bold.ttf",
}
_faces = {}


def face(name, size):
    key = (name, size)
    if key not in _faces:
        try:
            _faces[key] = ImageFont.truetype(os.path.join(ASSET_DIR, FONT_FILES[name]), size)
        except OSError:
            _faces[key] = font(size)
    return _faces[key]


INK = (255, 246, 236)
X0, X1 = 238, 466            # cột chữ bên phải
DISC_C = (112, 160)          # tâm đĩa
RULER = (X0, 222, X1, 246)   # vùng thước theo nhịp (chạm để tua)
BTN_Y = 290
BTN_X = [X0 + 22 + i * (X1 - X0 - 44) / 4 for i in range(5)]
BUTTONS = [("loop", 19), ("vol-", 19), ("toggle", 24), ("vol+", 19), ("skip", 19)]


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def theme(np):
    """Màu sân khấu theo bài: nền đậm, màu nhấn sáng, màu phụ."""
    import colorsys

    r, g, b = hex_rgb(np.get("accent", "#7a45d3"))
    hue = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)[0]
    en = np.get("energy")
    en = 0.5 if en is None else max(0.0, min(1.0, en))

    def hsl(hh, s, l):
        rr, gg, bb = colorsys.hls_to_rgb(hh % 1, l, s)
        return (int(rr * 255), int(gg * 255), int(bb * 255))

    return hsl(hue, 0.50 + 0.24 * en, 0.25), hsl(hue + 48 / 360, 0.88, 0.62), hsl(hue + 300 / 360, 0.78, 0.40)


def wrap(d, text, f, width, max_lines):
    lines, cur = [], ""
    for word in text.split():
        trial = (cur + " " + word).strip()
        if d.textlength(trial, font=f) <= width:
            cur = trial
            continue
        if cur:
            lines.append(cur)
        cur = word
        while d.textlength(cur, font=f) > width and len(cur) > 1:  # từ quá dài thì cắt
            cut = len(cur)
            while cut > 1 and d.textlength(cur[:cut], font=f) > width:
                cut -= 1
            lines.append(cur[:cut])
            cur = cur[cut:]
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = ellipsize(d, lines[-1] + "…", f, width)
    return lines


def glow(size, c2, c3):
    """Hai quầng sáng mờ ở góc, vẽ nhỏ rồi phóng to cho rẻ."""
    from PIL import ImageFilter

    sw, sh = size[0] // 4, size[1] // 4
    layer = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.ellipse((-sw * 0.35, -sh * 0.45, sw * 0.55, sh * 0.6), fill=c2 + (110,))
    ld.ellipse((sw * 0.55, sh * 0.5, sw * 1.35, sh * 1.5), fill=c3 + (150,))
    return layer.filter(ImageFilter.GaussianBlur(9)).resize(size, Image.BILINEAR)


def draw_icon(d, name, cx, cy, color, np):
    if name == "toggle":
        if np.get("paused"):
            d.polygon([(cx - 6, cy - 9), (cx - 6, cy + 9), (cx + 10, cy)], fill=color)
        else:
            d.rectangle((cx - 8, cy - 9, cx - 3, cy + 9), fill=color)
            d.rectangle((cx + 3, cy - 9, cx + 8, cy + 9), fill=color)
    elif name == "skip":
        d.polygon([(cx - 8, cy - 8), (cx - 8, cy + 8), (cx + 5, cy)], fill=color)
        d.rectangle((cx + 7, cy - 8, cx + 9, cy + 8), fill=color)
    elif name in ("vol+", "vol-"):
        d.polygon([(cx - 9, cy - 4), (cx - 5, cy - 4), (cx, cy - 9), (cx, cy + 9), (cx - 5, cy + 4), (cx - 9, cy + 4)], fill=color)
        if name == "vol+":
            d.line((cx + 5, cy, cx + 12, cy), fill=color, width=2)
            d.line((cx + 8.5, cy - 3.5, cx + 8.5, cy + 3.5), fill=color, width=2)
        else:
            d.line((cx + 5, cy, cx + 12, cy), fill=color, width=2)
    elif name == "loop":
        d.arc((cx - 8, cy - 8, cx + 8, cy + 8), 40, 320, fill=color, width=2)
        d.polygon([(cx + 6, cy - 10), (cx + 12, cy - 3), (cx + 2, cy - 4)], fill=color)
        mode = np.get("repeat")
        if mode in ("track", "queue"):
            d.text((cx, cy + 1), "1" if mode == "track" else "∞", fill=color, font=face("mono-bold", 9), anchor="mm")


def render(state, w, h):
    with state.lock:
        np, at = dict(state.np), state.at
    c1, c2, c3 = theme(np)
    img = Image.new("RGB", (w, h), c1).convert("RGBA")
    img.alpha_composite(glow((w, h), c2, c3))
    d = ImageDraw.Draw(img)

    live = bool(np.get("title"))
    pos = np.get("position", 0) + ((time.time() - at) * 1000 if np.get("playing") else 0)
    dur = np.get("duration")
    if dur:
        pos = min(pos, dur)
    frac = (pos / dur) if (live and dur) else 0
    cx, cy = DISC_C
    dim = not live

    # vòng tiến trình + đĩa
    d.ellipse((cx - 104, cy - 104, cx + 104, cy + 104), outline=mix(c1, INK, 0.2), width=3)
    if live and frac > 0:
        d.arc((cx - 104, cy - 104, cx + 104, cy + 104), -90, -90 + 360 * frac, fill=c2, width=4)
    body = (11, 11, 18) if not dim else mix(c1, (11, 11, 18), 0.7)
    d.ellipse((cx - 92, cy - 92, cx + 92, cy + 92), fill=body)
    if state.cover is not None and live:
        side = 184
        art = state.cover.resize((side, side)).convert("RGBA")
        mask = Image.new("L", (side, side), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, side - 1, side - 1), fill=255)
        img.paste(art, (cx - side // 2, cy - side // 2), mask)
    else:
        for r in range(34, 91, 4):
            d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=mix(body, c3, 0.22 if r % 8 else 0.4))
    if live:
        a = (time.time() * 40) % 360 if (ANIMATE and np.get("playing")) else 35  # ánh bóng quay 40 độ/giây, hoặc đứng yên
        for k in (0, 180):
            d.arc((cx - 74, cy - 74, cx + 74, cy + 74), a + k, a + k + 34, fill=mix(body, (255, 255, 255), 0.17), width=9)
            d.arc((cx - 58, cy - 58, cx + 58, cy + 58), a + k + 6, a + k + 26, fill=mix(body, (255, 255, 255), 0.11), width=7)
    d.ellipse((cx - 30, cy - 30, cx + 30, cy + 30), fill=c2)
    label_ink = (22, 15, 36)
    if np.get("hidden"):
        d.text((cx, cy), "?", fill=label_ink, font=face("disp-bold", 38), anchor="mm")
    elif live and np.get("bpm"):
        d.text((cx, cy - 4), str(round(np["bpm"])), fill=label_ink, font=face("disp-bold", 30), anchor="mm")
        d.text((cx, cy + 15), "nhịp/phút", fill=label_ink, font=face("mono", 8), anchor="mm")
    elif live:
        d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=label_ink)

    colw = X1 - X0
    if not live:
        if np.get("hidden"):
            head, hint = "Đang chơi đố nhạc", "Tên bài được giấu để không lộ đáp án."
        elif np.get("offline"):
            head, hint = "Mất kết nối với bot", "Màn sẽ tự thử lại sau vài giây."
        elif np.get("error") == 401:
            head, hint = "Sai token", "Kiểm tra DISPLAY_TOKEN trong pi/display.env."
        else:
            head, hint = "Chưa có bài nào đang phát", "Vào kênh thoại rồi dùng /play, /local hoặc /nhaajt."
        y = 96
        for line in wrap(d, head.upper(), face("disp-bold", 34), colw, 3):
            d.text((X0, y), line, fill=INK, font=face("disp-bold", 34))
            y += 36
        for line in wrap(d, hint, face("mono", 11), colw, 4):
            d.text((X0, y + 8), line, fill=mix(c1, INK, 0.65), font=face("mono", 11))
            y += 16
        return img.convert("RGB")

    # chữ
    where = np.get("guild") or np.get("bot") or ""
    d.text((X0, 8), ellipsize(d, where, face("mono", 10), colw - (60 if np.get("paused") else 0)), fill=mix(c1, INK, 0.65), font=face("mono", 10))
    if np.get("paused"):
        d.rounded_rectangle((X1 - 56, 6, X1, 22), 8, outline=mix(c1, INK, 0.35))
        d.text((X1 - 28, 14), "Tạm dừng", fill=INK, font=face("mono", 9), anchor="mm")
    y = 26
    title_f = face("disp-bold", 34)
    for line in wrap(d, np["title"].upper(), title_f, colw, 3):
        d.text((X0, y), line, fill=INK, font=title_f)
        y += 35
    d.text((X0, y + 2), ellipsize(d, np.get("artist") or "", face("disp-semi", 20), colw), fill=mix(c2, (255, 255, 255), 0.38), font=face("disp-semi", 20))
    meta = [f"Âm lượng {np.get('volume', 0)}%"]
    if np.get("queueLength"):
        meta.append(f"còn {np['queueLength']} bài")
    d.text((X0, 200), "  ".join(meta), fill=mix(c1, INK, 0.62), font=face("mono", 10))

    # thước theo nhịp: mỗi vạch là một nhịp của bài
    rx0, ry0, rx1, ry1 = RULER
    width = rx1 - rx0
    if dur:
        beats = (dur / 60000 * np["bpm"]) if np.get("bpm") else dur / 5000
        px = width / max(beats, 1)
        while px < 4:
            px *= 2
    else:
        px = 6
    played_x = rx0 + width * frac
    k, x = 0, float(rx0)
    while x <= rx1:
        major = k % 4 == 0
        color = c2 if x <= played_x else mix(c1, INK, 0.3)
        d.line((x, ry1 - (22 if major else 10), x, ry1), fill=color, width=1)
        k += 1
        x = rx0 + k * px
    d.line((played_x, ry0 - 2, played_x, ry1 + 2), fill=INK, width=2)
    d.text((X0, 250), fmt(pos), fill=mix(c1, INK, 0.62), font=face("mono", 10))
    end = fmt(dur) if dur else "LIVE"
    d.text((X1, 250), end, fill=mix(c1, INK, 0.62), font=face("mono", 10), anchor="ra")

    # nút
    for (name, r), bx in zip(BUTTONS, BTN_X):
        main = name == "toggle"
        d.ellipse((bx - r, BTN_Y - r, bx + r, BTN_Y + r), fill=INK if main else mix(c1, INK, 0.12), outline=None if main else mix(c1, INK, 0.28))
        draw_icon(d, name, bx, BTN_Y, c1 if main else INK, np)
    return img.convert("RGB")


def hit(x, y):
    """Điểm chạm (toạ độ ngang 480x320) -> ("button", tên) | ("seek", tỉ lệ 0..1) | None."""
    for (name, r), bx in zip(BUTTONS, BTN_X):
        if (x - bx) ** 2 + (y - BTN_Y) ** 2 <= (r + 12) ** 2:  # vùng bấm rộng hơn nút (màn điện trở, bấm bằng bút)
            return ("button", name)
    rx0, ry0, rx1, ry1 = RULER
    if rx0 - 4 <= x <= rx1 + 4 and ry0 - 8 <= y <= ry1 + 8:
        return ("seek", max(0.0, min(0.999, (x - rx0) / (rx1 - rx0))))
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
    ax, ay = dev.absinfo(evdev.ecodes.ABS_X), dev.absinfo(evdev.ecodes.ABS_Y)
    def bound(name, fallback_env, dev_value):
        v = os.environ.get(name) or fallback_env
        return int(v) if v else dev_value

    ranges = {
        "x": (bound("TOUCH_X_MIN", T_MIN, ax.min), bound("TOUCH_X_MAX", T_MAX, ax.max)),
        "y": (bound("TOUCH_Y_MIN", T_MIN, ay.min), bound("TOUCH_Y_MAX", T_MAX, ay.max)),
    }
    print("Dải cảm ứng:", ranges, file=sys.stderr)
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
                (ra, rb) = (ranges["y"], ranges["x"]) if SWAP else (ranges["x"], ranges["y"])
                a, b = (raw_y, raw_x) if SWAP else (raw_x, raw_y)
                nx = min(1, max(0, (a - ra[0]) / max(1, ra[1] - ra[0])))
                ny = min(1, max(0, (b - rb[0]) / max(1, rb[1] - rb[0])))
                if INV_X:
                    nx = 1 - nx
                if INV_Y:
                    ny = 1 - ny
                if os.environ.get("TOUCH_DEBUG") == "1":
                    print(f"chạm: raw=({raw_x},{raw_y}) -> x={int(nx * w)} y={int(ny * h)}", flush=True)
                target = hit(int(nx * w), int(ny * h))
                if not target:
                    continue
                kind, what = target
                cur = state.np
                if kind == "seek":
                    if not cur.get("duration") or cur.get("isStream"):
                        continue
                    act = ("seek", int(what * cur["duration"]))
                else:
                    vol = cur.get("volume", 100)
                    act = {
                        "toggle": ("toggle", None),
                        "skip": ("skip", None),
                        "loop": ("loop", None),
                        "vol+": ("volume", min(150, vol + 10)),
                        "vol-": ("volume", max(0, vol - 10)),
                    }[what]
                try:
                    req("/api/control", {"action": act[0], "value": act[1]})
                    state.poll()
                    state.wake.set()
                except Exception as e:
                    print("Điều khiển lỗi:", e, file=sys.stderr)


def changed_regions(new, old, fh, stride, cpp, gap=24):
    """Các vùng chữ nhật thay đổi giữa hai khung: [(hàng đầu, hàng cuối, byte đầu, byte cuối)].
    Gửi theo vùng (chỉ các cột đổi trong mỗi hàng) vì driver DRM gộp các lần ghi thành một hình chữ nhật cần cập nhật."""
    a = numpy_mod.frombuffer(new, dtype=numpy_mod.uint8).reshape(fh, stride)
    b = numpy_mod.frombuffer(old, dtype=numpy_mod.uint8).reshape(fh, stride)
    diff = a != b
    rows = numpy_mod.flatnonzero(diff.any(axis=1))
    if not rows.size:
        return []
    groups, start, prev = [], int(rows[0]), int(rows[0])
    for r in rows[1:]:
        r = int(r)
        if r - prev > gap:
            groups.append((start, prev))
            start = r
        prev = r
    groups.append((start, prev))
    out = []
    for r0, r1 in groups:
        cols = numpy_mod.flatnonzero(diff[r0 : r1 + 1].any(axis=0))
        out.append((r0, r1, int(cols[0]) // cpp * cpp, (int(cols[-1]) // cpp + 1) * cpp))
    return out


def in_disc(region, cpp, fb_w, land_w, margin=6):
    """Vùng thay đổi (toạ độ framebuffer sau khi xoay 90 độ) có nằm trọn trong hình vuông bao quanh đĩa không."""
    r0, r1, b0, b1 = region
    c0, c1 = b0 // cpp, b1 // cpp - 1
    cx, cy = DISC_C
    reach = 106 + margin
    # xoay 90 độ ngược chiều kim đồng hồ: (x, y) ngang -> cột = y, hàng = land_w - 1 - x
    return c0 >= cy - reach and c1 <= cy + reach and r0 >= land_w - 1 - (cx + reach) and r1 <= land_w - 1 - (cx - reach)


def main():
    w, h, bpp, stride = fb_info()
    # Luôn vẽ ở dạng ngang; màn dọc (320x480 của driver DRM) thì xoay khi ghi
    fw, fh = w, h
    w, h = max(fw, fh), min(fw, fh)
    rot = (90 if fh > fw else 0) if ROTATE == "auto" else int(ROTATE)
    print(f"Framebuffer {FB}: {fw}x{fh} {bpp}bpp, vẽ {w}x{h}, xoay {rot}", file=sys.stderr)
    state = State()
    threading.Thread(target=touch_loop, args=(state, w, h), daemon=True).start()
    last_poll = 0
    last_frame = None
    with open(FB, "wb", buffering=0) as fb:
        while True:
            if time.time() - last_poll >= POLL:
                state.poll()
                last_poll = time.time()
            img = render(state, w, h)
            if rot:
                img = img.rotate(rot, expand=True)
            if img.size != (fw, fh):
                img = img.resize((fw, fh))
            data = to_fb_bytes(img, bpp, stride)
            if last_frame is None or len(last_frame) != len(data) or numpy_mod is None:
                if data != last_frame:
                    fb.seek(0)
                    fb.write(data)
            else:
                # chỉ gửi qua SPI những hàng thật sự đổi: SPI là điểm nghẽn của màn này
                regions = changed_regions(data, last_frame, fh, stride, bpp // 8)
                if regions and (rot != 90 or not all(in_disc(r, bpp // 8, fw, w) for r in regions)):
                    # đổi cả chữ/nút: gửi cả khung cho chắc (vùng nhỏ ngoài đĩa không luôn được driver làm mới)
                    fb.seek(0)
                    fb.write(data)
                else:
                    # chỉ đĩa quay: gửi riêng vùng đĩa cho nhanh
                    for r0, r1, c0, c1 in regions:
                        for r in range(r0, r1 + 1):
                            pos = r * stride + c0
                            fb.seek(pos)
                            fb.write(data[pos : r * stride + c1])
            last_frame = data
            animating = ANIMATE and bool(state.np.get("playing"))
            state.wake.wait(FRAME_S if animating else 0.25)
            state.wake.clear()


if __name__ == "__main__":
    main()
