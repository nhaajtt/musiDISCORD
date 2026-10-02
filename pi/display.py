#!/usr/bin/env python3
"""Màn hình TFT 3.5 inch cảm ứng cho musiDISCORD: đọc /api/np, vẽ lên framebuffer, chạm (bút) để điều khiển.

Thiết kế: tấm áp phích chữ. Tên bài là hình ảnh chính, cỡ chữ tự co cho vừa khung, trên nền gần đen nhuốm màu của bài.
Một màu duy nhất (suy từ bài) cho tên nghệ sĩ, thanh tiến trình và vạch mép trái. Gần như không có chuyển động,
vì bus SPI của màn chỉ gửi được vài khung đầy đủ mỗi giây.

Chạy trên Raspberry Pi (ngoài container). Cần: python3-pil, python3-evdev, tuỳ chọn python3-numpy.
Biến môi trường (xem pi/display.env.example): DISPLAY_URL, DISPLAY_TOKEN, FB_DEVICE, FB_ROTATE, TOUCH_DEVICE,
TOUCH_SWAP, TOUCH_INVERT_X, TOUCH_INVERT_Y, TOUCH_X_MIN/X_MAX/Y_MIN/Y_MAX, TOUCH_DEBUG.
"""
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from array import array

from PIL import Image, ImageDraw, ImageFont, ImageOps

try:
    import numpy as numpy_mod
except ImportError:  # chậm hơn nhưng vẫn chạy được
    numpy_mod = None

URL = os.environ.get("DISPLAY_URL", "http://127.0.0.1:8787").rstrip("/")
TOKEN = os.environ.get("DISPLAY_TOKEN", "")
ROTATE = os.environ.get("FB_ROTATE", "auto")  # auto | 0 | 90 | 180 | 270
POLL = 1.5
W, H = 480, 320  # luôn vẽ ở dạng ngang

TOUCH_DEV = os.environ.get("TOUCH_DEVICE", "")
SWAP = os.environ.get("TOUCH_SWAP", "0") == "1"
INV_X = os.environ.get("TOUCH_INVERT_X", "0") == "1"
INV_Y = os.environ.get("TOUCH_INVERT_Y", "0") == "1"


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

# ---------------------------------------------------------------- phông chữ
ASSET_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "fonts")
FONT_FILES = {
    "display": "BarlowCondensed-Bold.ttf",
    "semi": "BarlowCondensed-SemiBold.ttf",
    "mono": "IBMPlexMono-Regular.ttf",
}
FALLBACK = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
_faces = {}


def face(name, size):
    key = (name, size)
    if key not in _faces:
        try:
            _faces[key] = ImageFont.truetype(os.path.join(ASSET_DIR, FONT_FILES[name]), size)
        except OSError:
            path = next((p for p in FALLBACK if os.path.exists(p)), None)
            _faces[key] = ImageFont.truetype(path, size) if path else ImageFont.load_default()
    return _faces[key]


# ---------------------------------------------------------------- framebuffer
def fb_info():
    base = f"/sys/class/graphics/{os.path.basename(FB)}"
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
        raw, row = rgb565(img), w * 2
    else:
        raw, row = img.convert("RGBA").tobytes("raw", "BGRA"), w * 4
    if stride == row:
        return raw
    out = bytearray(stride * h)
    for y in range(h):
        out[y * stride : y * stride + row] = raw[y * row : (y + 1) * row]
    return bytes(out)


# ---------------------------------------------------------------- dữ liệu từ bot
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


# ---------------------------------------------------------------- vẽ
INK = (255, 246, 236)
MARGIN = 28
RIGHT = W - 20
AVATAR_W = int(os.environ.get("AVATAR_W", "212"))  # ảnh đại diện: khung chữ nhật bo góc, gần nửa màn, nằm bên phải
AVATAR_H = int(os.environ.get("AVATAR_H", "208"))
AVATAR_RADIUS = int(os.environ.get("AVATAR_RADIUS", "10"))  # 0 = góc vuông
AVATAR_POS = (W - 18 - AVATAR_W, 14)
TEXT_TOP, TEXT_BOTTOM = 40, 228  # vùng chữ (giữa dòng tên server và thanh tiến trình)
BAR_Y = 236
BTN_Y = 282
BTN_TOP = 258  # từ đây trở xuống là vùng nút
BUTTONS = ["loop", "vol-", "toggle", "vol+", "skip"]
BTN_X = [W * (i + 0.5) / 5 for i in range(5)]
WEEKDAYS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật"]


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def hex_rgb(s, default=(122, 69, 211)):
    try:
        return tuple(int(s[i : i + 2], 16) for i in (1, 3, 5))
    except Exception:
        return default


def palette(np):
    """Nền gần đen nhuốm màu bài, và một màu nhấn sáng cùng sắc độ."""
    import colorsys

    hue = colorsys.rgb_to_hls(*(c / 255 for c in hex_rgb(np.get("accent", "#7a45d3"))))[0]

    def hsl(h, s, l):
        r, g, b = colorsys.hls_to_rgb(h % 1, l, s)
        return (int(r * 255), int(g * 255), int(b * 255))

    return hsl(hue, 0.38, 0.085), hsl(hue, 0.86, 0.66)


def ellipsize(d, text, f, max_w):
    if d.textlength(text, font=f) <= max_w:
        return text
    while text and d.textlength(text + "…", font=f) > max_w:
        text = text[:-1]
    return text + "…"


def wrap(d, text, f, width):
    """Ngắt dòng theo từ; từ nào dài hơn khung thì cắt theo ký tự."""
    lines, cur = [], ""
    for word in text.split():
        trial = (cur + " " + word).strip()
        if d.textlength(trial, font=f) <= width:
            cur = trial
            continue
        if cur:
            lines.append(cur)
        cur = word
        while d.textlength(cur, font=f) > width and len(cur) > 1:
            cut = len(cur)
            while cut > 1 and d.textlength(cur[:cut], font=f) > width:
                cut -= 1
            lines.append(cur[:cut])
            cur = cur[cut:]
    if cur:
        lines.append(cur)
    return lines


_fit_cache = {}


def fit_title(d, text, avail_w, avail_h):
    """Cỡ chữ lớn nhất để cả tên bài nằm gọn trong khung: tên ngắn thì rất to, tên dài thì nhỏ dần."""
    key = (text, avail_w, avail_h)
    if key in _fit_cache:
        return _fit_cache[key]
    result = None
    for size in range(120, 27, -2):
        f = face("display", size)
        lines = wrap(d, text, f, avail_w)
        lh = int(size * 0.98)  # đủ chỗ cho dấu tiếng Việt chồng lên dòng trên
        if len(lines) * lh <= avail_h:
            result = (size, lines, lh)
            break
    if result is None:  # quá dài: cỡ nhỏ nhất, cắt bớt
        size = 28
        f = face("display", size)
        lh = int(size * 0.98)
        lines = wrap(d, text, f, avail_w)[: max(1, avail_h // lh)]
        lines[-1] = ellipsize(d, lines[-1] + "…", f, avail_w)
        result = (size, lines, lh)
    if len(_fit_cache) > 40:
        _fit_cache.clear()
    _fit_cache[key] = result
    return result


def icon(d, name, cx, cy, ink, accent, np):
    """Biểu tượng nét mảnh, không nền."""
    lw = 2
    if name == "toggle":
        d.ellipse((cx - 21, cy - 21, cx + 21, cy + 21), outline=accent, width=2)
        if np.get("paused"):
            d.polygon([(cx - 5, cy - 9), (cx - 5, cy + 9), (cx + 9, cy)], fill=accent)
        else:
            d.rectangle((cx - 7, cy - 8, cx - 3, cy + 8), fill=accent)
            d.rectangle((cx + 3, cy - 8, cx + 7, cy + 8), fill=accent)
    elif name == "skip":
        d.polygon([(cx - 9, cy - 9), (cx - 9, cy + 9), (cx + 5, cy)], outline=ink, width=lw)
        d.line((cx + 9, cy - 9, cx + 9, cy + 9), fill=ink, width=lw)
    elif name in ("vol+", "vol-"):
        d.polygon([(cx - 11, cy - 4), (cx - 6, cy - 4), (cx - 1, cy - 9), (cx - 1, cy + 9), (cx - 6, cy + 4), (cx - 11, cy + 4)], outline=ink, width=lw)
        d.line((cx + 5, cy, cx + 13, cy), fill=ink, width=lw)
        if name == "vol+":
            d.line((cx + 9, cy - 4, cx + 9, cy + 4), fill=ink, width=lw)
    elif name == "loop":
        mode = np.get("repeat")
        color = accent if mode in ("track", "queue") else ink
        d.arc((cx - 9, cy - 9, cx + 9, cy + 9), 40, 320, fill=color, width=lw)
        d.polygon([(cx + 7, cy - 11), (cx + 13, cy - 3), (cx + 3, cy - 4)], fill=color)
        if mode == "track":
            d.text((cx, cy + 1), "1", fill=color, font=face("mono", 10), anchor="mm")


_avatar = {"img": None, "loaded": False}


def load_avatar():
    """Ảnh đại diện (khung chữ nhật bo góc) từ AVATAR_PATH (mặc định pi/avatar.jpg). Không có ảnh thì bỏ qua.
    AVATAR_CROP="x0,y0,x1,y1" chọn vùng cắt trên ảnh gốc; không đặt thì lấy phần trên, chính giữa (hợp ảnh chân dung)."""
    if _avatar["loaded"]:
        return _avatar["img"]
    _avatar["loaded"] = True
    path = os.environ.get("AVATAR_PATH") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "avatar.jpg")
    if not os.path.exists(path):
        return None
    try:
        src = Image.open(path).convert("RGB")
        sw, sh = src.size
        if os.environ.get("AVATAR_CROP"):
            box = tuple(int(v) for v in os.environ["AVATAR_CROP"].split(","))
            region = src.crop(box)
        else:
            region = src.crop((0, int(sh * 0.02), sw, sh))
        # lấp đầy khung đúng tỉ lệ, giữ phần trên (đầu người) khi phải cắt bớt
        out = ImageOps.fit(region, (AVATAR_W, AVATAR_H), Image.LANCZOS, centering=(0.5, 0.25))
        k = 4  # vẽ mặt nạ lớn rồi thu nhỏ để góc bo mịn
        mask = Image.new("L", (AVATAR_W * k, AVATAR_H * k), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, AVATAR_W * k - 1, AVATAR_H * k - 1), radius=AVATAR_RADIUS * k, fill=255)
        _avatar["img"] = (out, mask.resize((AVATAR_W, AVATAR_H), Image.LANCZOS))
    except Exception as e:
        print("Không đọc được ảnh đại diện:", e, file=sys.stderr)
    return _avatar["img"]


def draw_avatar(img, d, bg):
    """Ảnh đại diện lớn bên phải, không viền màu: chỉ có bốn dấu góc mảnh kiểu khung ngắm, màu trung tính.
    Trả về mép phải của cột chữ (không có ảnh thì chiếm hết bề ngang)."""
    av = load_avatar()
    if av is None:
        return RIGHT
    x, y = AVATAR_POS
    img.paste(av[0], (x, y), av[1])
    mark = mix(bg, INK, 0.62)
    gap, ln, lw = 7, 16, 2  # cách ảnh, độ dài mỗi nhánh, độ dày nét
    left, top, right, bottom = x - gap, y - gap, x + AVATAR_W + gap - 1, y + AVATAR_H + gap - 1
    for cx, cy, sx, sy in ((left, top, 1, 1), (right, top, -1, 1), (left, bottom, 1, -1), (right, bottom, -1, -1)):
        d.line((cx, cy, cx + sx * ln, cy), fill=mark, width=lw)
        d.line((cx, cy, cx, cy + sy * ln), fill=mark, width=lw)
    return x - 14


def fmt(ms):
    t = max(0, int(ms // 1000))
    return f"{t // 60}:{t % 60:02d}"


def render_idle(d, np, bg, accent, col_right):
    """Chưa phát: đồng hồ lớn, yên tĩnh. Các trạng thái lỗi dùng cùng bố cục."""
    if np.get("hidden"):
        big, line, hint = "?", "Đang chơi đố nhạc", "Tên bài được giấu để không lộ đáp án."
    elif np.get("offline"):
        big, line, hint = "—", "Mất kết nối với bot", "Màn sẽ tự thử lại sau vài giây."
    elif np.get("error") == 401:
        big, line, hint = "!", "Sai hoặc thiếu token", "Kiểm tra DISPLAY_TOKEN trong pi/display.env."
    else:
        now = time.localtime()
        big = time.strftime("%H:%M", now)
        line = f"{WEEKDAYS[now.tm_wday]}, {now.tm_mday} tháng {now.tm_mon}"
        hint = "Chưa có bài nào đang phát. Vào kênh thoại rồi dùng /play, /local hoặc /nhaajt."
    width = col_right - MARGIN
    size = 132
    while size > 40 and d.textlength(big, font=face("display", size)) > width + 6:
        size -= 4
    d.text((MARGIN - 4, 46), big, fill=INK, font=face("display", size))
    y = 46 + int(size * 0.98)
    d.text((MARGIN, y), ellipsize(d, line, face("semi", 24), width), fill=accent, font=face("semi", 24))
    y += 40
    for part in wrap(d, hint, face("mono", 11), width):
        d.text((MARGIN, y), part, fill=mix(bg, INK, 0.55), font=face("mono", 11))
        y += 17


def render(state, w=W, h=H):
    with state.lock:
        np, at = dict(state.np), state.at
    bg, accent = palette(np)
    img = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(img)
    dim = mix(bg, INK, 0.55)
    d.rectangle((0, 0, 5, h), fill=accent)  # vạch mép trái: dấu hiệu duy nhất của màu bài

    col_right = draw_avatar(img, d, bg)
    if not np.get("title"):
        render_idle(d, np, bg, accent, col_right)
        return img

    width = col_right - MARGIN
    d.text((MARGIN, 18), ellipsize(d, np.get("guild") or np.get("bot") or "", face("mono", 11), width), fill=dim, font=face("mono", 11))

    # khối chữ: tên bài cỡ lớn nhất cho vừa cột, rồi nghệ sĩ, rồi nhịp độ/trạng thái; cả khối căn giữa theo chiều dọc
    artist = np.get("artist") or ""
    info = ["Tạm dừng"] if np.get("paused") else []
    if np.get("bpm"):
        info.append(f"{round(np['bpm'])} nhịp/phút")
    reserve = (30 if artist else 0) + (20 if info else 0)
    size, lines, lh = fit_title(d, np["title"].upper(), width, TEXT_BOTTOM - TEXT_TOP - reserve)
    block = len(lines) * lh + reserve
    y = TEXT_TOP + max(0, (TEXT_BOTTOM - TEXT_TOP - block) // 2) - int(size * 0.12)
    f = face("display", size)
    for line in lines:
        d.text((MARGIN - 2, y), line, fill=INK, font=f)
        y += lh
    y += int(size * 0.12) + 4
    if artist:
        d.text((MARGIN, y), ellipsize(d, artist, face("semi", 22), width), fill=accent, font=face("semi", 22))
        y += 30
    if info:
        x = MARGIN
        for k, part in enumerate(info):
            color = accent if part == "Tạm dừng" else dim
            d.text((x, y), part, fill=color, font=face("mono", 11))
            x += int(d.textlength(part, font=face("mono", 11))) + 16

    # thanh tiến trình: một đường mảnh
    pos = np.get("position", 0) + ((time.time() - at) * 1000 if np.get("playing") else 0)
    dur = np.get("duration")
    if dur:
        pos = min(pos, dur)
    pos = pos // 1000 * 1000  # làm tròn về giây: mọi thay đổi trên màn chỉ xảy ra mỗi giây một lần
    frac = (pos / dur) if dur else 1.0
    d.rectangle((MARGIN, BAR_Y, RIGHT, BAR_Y + 2), fill=mix(bg, INK, 0.17))
    d.rectangle((MARGIN, BAR_Y, MARGIN + int((RIGHT - MARGIN) * frac), BAR_Y + 2), fill=accent)
    d.text((MARGIN, BAR_Y + 8), fmt(pos), fill=dim, font=face("mono", 11))
    d.text((RIGHT, BAR_Y + 8), fmt(dur) if dur else "LIVE", fill=dim, font=face("mono", 11), anchor="ra")

    # nút
    for name, bx in zip(BUTTONS, BTN_X):
        icon(d, name, bx, BTN_Y, INK, accent, np)
    return img


def hit(x, y, has_track=True):
    """Điểm chạm (toạ độ ngang 480x320) -> ("button", tên) | ("seek", tỉ lệ 0..1) | None.
    Vùng bấm là cột rộng (màn điện trở, bấm bằng bút)."""
    if not has_track:
        return None
    if y >= BTN_TOP + 8:
        return ("button", BUTTONS[min(4, int(x / (W / 5)))])
    if BAR_Y - 18 <= y <= BAR_Y + 14 and MARGIN - 8 <= x <= RIGHT + 8:
        return ("seek", max(0.0, min(0.999, (x - MARGIN) / (RIGHT - MARGIN))))
    return None


# ---------------------------------------------------------------- cảm ứng
def touch_loop(state):
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

    def bound(name, fallback):
        v = os.environ.get(name)
        return int(v) if v else fallback

    ranges = {
        "x": (bound("TOUCH_X_MIN", ax.min), bound("TOUCH_X_MAX", ax.max)),
        "y": (bound("TOUCH_Y_MIN", ay.min), bound("TOUCH_Y_MAX", ay.max)),
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
                continue
            if not (down and raw_x is not None and raw_y is not None):
                continue
            down = False
            (ra, rb) = (ranges["y"], ranges["x"]) if SWAP else (ranges["x"], ranges["y"])
            a, b = (raw_y, raw_x) if SWAP else (raw_x, raw_y)
            nx = min(1, max(0, (a - ra[0]) / max(1, ra[1] - ra[0])))
            ny = min(1, max(0, (b - rb[0]) / max(1, rb[1] - rb[0])))
            if INV_X:
                nx = 1 - nx
            if INV_Y:
                ny = 1 - ny
            x, y = int(nx * W), int(ny * H)
            cur = state.np
            if os.environ.get("TOUCH_DEBUG") == "1":
                print(f"chạm: raw=({raw_x},{raw_y}) -> x={x} y={y}", flush=True)
            target = hit(x, y, bool(cur.get("title")))
            if not target:
                continue
            kind, what = target
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


# ---------------------------------------------------------------- vòng chính
def main():
    fw, fh, bpp, stride = fb_info()
    rot = (90 if fh > fw else 0) if ROTATE == "auto" else int(ROTATE)
    print(f"Framebuffer {FB}: {fw}x{fh} {bpp}bpp, vẽ {W}x{H}, xoay {rot}", file=sys.stderr)
    state = State()
    threading.Thread(target=touch_loop, args=(state,), daemon=True).start()
    last_poll = 0
    last_frame = None
    with open(FB, "wb", buffering=0) as fb:
        while True:
            if time.time() - last_poll >= POLL:
                state.poll()
                last_poll = time.time()
            img = render(state)
            if rot:
                img = img.rotate(rot, expand=True)
            if img.size != (fw, fh):
                img = img.resize((fw, fh))
            data = to_fb_bytes(img, bpp, stride)
            if data != last_frame:  # chỉ gửi qua SPI khi khung thật sự đổi (thường mỗi giây một lần)
                fb.seek(0)
                fb.write(data)
                last_frame = data
            state.wake.wait(0.25)
            state.wake.clear()


if __name__ == "__main__":
    main()
