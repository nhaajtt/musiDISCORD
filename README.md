# musiDISCORD

Bot phát nhạc Discord tự host, viết bằng discord.js và phát qua Lavalink v4. Điểm mạnh nằm ở **thư viện nhạc riêng**: bot đọc thẻ tên bài, ảnh bìa, lời bài hát trong thư mục `music/` của bạn và xây tính năng quanh đó (tìm kiếm, album, đố nhạc, thống kê, radio 24/7...). Ngoài ra vẫn phát được từ link YouTube, SoundCloud, Spotify.

## Tính năng

- **Thư viện nhạc thông minh:** đọc thẻ (tên, nghệ sĩ, album, thể loại), tự đoán từ tên file và thư mục khi thiếu thẻ, tìm kiếm không phân biệt dấu, phát cả album hoặc nghệ sĩ, danh sách yêu thích riêng từng người.
- **`/nhaajt`:** phát ngẫu nhiên toàn bộ thư viện, hết vòng xáo trộn lại và phát tiếp mãi. Xáo trộn có trọng số theo 👍/👎 của server và tránh cùng nghệ sĩ liền nhau.
- **Giao diện "Đang phát" (Components V2):** ảnh bìa, màu nhấn theo bài, thanh tiến trình tự cập nhật, hai hàng nút (điều khiển, 👍 👎 ❤️ 📜).
- **Tên bài trên kênh thoại:** tự ghi "Đang phát: ..." vào trạng thái kênh thoại.
- **Đố nhạc:** nghe đoạn trích từ thư viện và đoán tên bài; trả lời bằng cửa sổ nhập (không cần quyền đọc tin nhắn), có gợi ý, chuỗi đúng liên tiếp, bảng xếp hạng.
- **Hàng chờ công bằng, `/bump`, bỏ phiếu bỏ qua bài** khi đông người nghe.
- **Thống kê:** `/mystats`, `/leaderboard`, `/wrapped` (thẻ ảnh tổng kết năm vẽ như bản thiết kế) và huy hiệu vui.
- **Lời bài hát:** từ file `.lrc` cạnh bài, lời nhúng trong thẻ hoặc tra LRCLIB, hiện dạng karaoke tô sáng dòng đang hát.
- **Đóng góp từ thành viên:** `/contribute` gửi file nhạc của chính mình để chủ bot duyệt, `/request` đề xuất bài chưa có và được báo khi bài xuất hiện. Bot **không** tải nhạc từ YouTube hay trang chuyển đổi nào.
- **Tự gắn thẻ (tuỳ chọn):** bài thiếu thẻ được nhận diện bằng dấu vân âm thanh (AcoustID, MusicBrainz) rồi điền tên, nghệ sĩ, album, bìa. Thẻ lưu riêng trong `data/shared/`, **không sửa file nhạc gốc**.
- **Phân tích âm thanh (tuỳ chọn):** ước lượng nhịp độ, năng lượng, độ sáng ngay trên máy của bạn để có `/vibe` (radio theo tâm trạng) và `/similar` (bài giống bài đang phát).
- **Nhiều bot, màn hình trạng thái, vận hành cho Raspberry Pi:** chạy 2 đến 3 bot cùng lúc, trang `/display` cho màn hình TFT 3.5 inch, sao lưu, tự cập nhật, Uptime Kuma. Xem phần "Chạy trên Raspberry Pi".
- **24/7:** ở lại kênh kể cả khi không có ai và sau khi khởi động lại; tuỳ chọn radio phát thư viện mãi mãi.
- **Vận hành:** khôi phục hàng chờ sau khi khởi động lại, healthcheck, cảnh báo khi Lavalink mất kết nối, tự rời kênh khi rảnh (trừ 24/7).

## Lệnh

| Lệnh | Mô tả |
| --- | --- |
| `/play query [source]` | Phát theo tên hoặc link (bài, playlist, album) |
| `/local file` | Phát một bài trong thư viện (gợi ý theo tên, nghệ sĩ, album) |
| `/album name [shuffle]`, `/artist name [shuffle]` | Phát cả album hoặc các bài của một nghệ sĩ |
| `/favorites add \| remove \| list \| play` | Bài yêu thích của riêng bạn |
| `/nhaajt` | Phát ngẫu nhiên toàn bộ thư viện, lặp mãi cho tới khi `/stop` |
| `/pause`, `/resume`, `/skip`, `/stop`, `/leave` | Điều khiển cơ bản (`/skip` cần bỏ phiếu khi từ 3 người nghe) |
| `/queue`, `/nowplaying` | Xem hàng chờ, bài đang phát |
| `/volume`, `/loop`, `/shuffle`, `/remove`, `/seek` | Âm lượng, lặp, xáo trộn, xoá bài, tua |
| `/bump position` | Bỏ phiếu đưa một bài lên phát kế tiếp |
| `/lyrics [live]` | Lời bài đang phát, `live` để hiện karaoke |
| `/quiz start \| stop \| top` | Đố nhạc từ thư viện |
| `/mystats`, `/leaderboard`, `/wrapped [year]` | Thống kê cá nhân, bảng xếp hạng, tổng kết năm |
| `/privacy stats \| delete` | Tắt thống kê của bạn hoặc xoá toàn bộ dữ liệu của bạn |
| `/247 on [radio] \| off` | Chế độ 24/7 |
| `/contribute submit \| pending \| stats` | Gửi file nhạc của bạn để chủ bot duyệt (tắt mặc định) |
| `/request add \| list \| vote \| mine \| remove \| done \| dismiss` | Đề xuất bài chưa có, bỏ phiếu, được báo khi bài có trong thư viện |
| `/vibe mood` | Radio theo tâm trạng: chill, vừa phải, sôi động, hừng hực (cần `ANALYSIS=on`) |
| `/similar [count]` | Thêm các bài giống bài đang phát vào hàng chờ (cần `ANALYSIS=on`) |
| `/library status | run | stop | review | forget` | (Chủ bot) Gắn thẻ tự động và phân tích âm thanh |
| `/settings view \| dj-role \| volume \| fair-queue \| vc-status \| contributions` | Quản trị (cần quyền Manage Server) |
| `/help`, `/stats` | Hướng dẫn lệnh, tình trạng bot |

## Chuẩn bị

1. Vào https://discord.com/developers/applications, tạo application và thêm Bot.
2. Lấy **Token** (tab Bot) và **Application ID**. Bot chỉ dùng slash commands, nút bấm và voice nên không cần privileged intents.
3. Mời bot bằng link (thay `CLIENT_ID`), quyền gồm View Channel, Send Messages, Embed Links, Attach Files, Connect, Speak, Set Voice Channel Status:
   `https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=281474979908608`
4. Tạo app Spotify tại https://developer.spotify.com/dashboard để lấy Client ID/Secret (chỉ cần nếu muốn dùng link Spotify).
5. `cp .env.example .env` rồi điền các giá trị.

## Thư viện nhạc

Bỏ file nhạc (`.mp3`, `.flac`, `.wav`, `.ogg`, `.opus`, `.m4a`, `.aac`, `.webm`) vào thư mục `music/`. Không cần restart, bot tự quét lại.

- Nên có thẻ tên bài (ID3/Vorbis). File thiếu thẻ vẫn dùng được: tên bài lấy từ tên file, dạng `Nghệ sĩ - Tên bài` sẽ tách được nghệ sĩ.
- Sắp xếp thư mục như `music/Nghệ sĩ/Album/01 - Tên bài.mp3` để `/album` và `/artist` hoạt động tốt kể cả khi không có thẻ.
- Ảnh bìa lấy từ ảnh nhúng trong file hoặc từ `cover.jpg` / `folder.jpg` trong thư mục.
- Lời bài hát: đặt `Tên bài.lrc` cạnh `Tên bài.mp3` (LRC có mốc thời gian để hiện karaoke).
- Bạn chịu trách nhiệm về bản quyền của file nhạc đặt vào đây.

## Đóng góp nhạc từ thành viên

Thư viện `music/` dùng chung cho mọi server mà bot tham gia, nên **chủ bot** là người duyệt, không phải quản trị từng server.

- **Bật:** đặt `CONTRIBUTIONS=on` trong `.env`, khởi động lại bot, rồi quản trị server dùng `/settings contributions enabled:true`. Tính năng tắt mặc định.
- **Gửi:** thành viên dùng `/contribute submit`, đính kèm file của họ và chọn `confirm: True` để xác nhận mình sở hữu hoặc được phép chia sẻ. Bot kiểm tra file là âm thanh thật (tối đa `CONTRIB_MAX_MB` MB, 10 giây đến 20 phút), chặn trùng nội dung, giới hạn 3 file chờ và 5 file mỗi ngày cho mỗi người.
- **Duyệt:** chủ bot nhận tin nhắn riêng có nút Duyệt / Từ chối (hoặc dùng `/contribute pending`). File được duyệt chuyển vào `music/Đóng góp/` và xuất hiện ở `/local`. File chờ quá 14 ngày tự bị xoá. Chủ bot lấy từ ứng dụng Discord của bot, hoặc đặt `OWNER_IDS`.
- **Đề xuất:** `/request add` nhận tên bài hoặc link YouTube, Spotify, SoundCloud. Bot chỉ ghi lại để bỏ phiếu, **không mở hay tải** link đó. Khi một file khớp xuất hiện trong thư viện (từ đóng góp được duyệt hoặc do bạn tự bỏ vào `music/`), mọi người đã đề xuất và bỏ phiếu được báo qua tin nhắn riêng.
- Container `bot` được ghi vào `music/` (Lavalink vẫn chỉ đọc); đường dẫn ghi luôn bị ép nằm trong `music/Đóng góp/`.

## Gắn thẻ và phân tích tự động

Cả hai tắt mặc định, chạy nền, tuần tự và dừng lại khi máy bận (hợp với Raspberry Pi), và **không bao giờ sửa file trong `music/`**: kết quả nằm ở `data/shared/tags.json`, `features.json` và `covers/`.

- **Gắn thẻ:** `AUTOTAG=on` và `ACOUSTID_KEY` (khoá miễn phí tại https://acoustid.org/new-application). Với mỗi bài thiếu thẻ, bot tạo dấu vân bằng `fpcalc`, hỏi AcoustID, nếu không ra thì tìm MusicBrainz theo tên file. Độ tin cậy từ 85% trở lên tự áp dụng, thấp hơn thì thành gợi ý để chủ bot duyệt bằng `/library review`. Chỉ dấu vân và thời lượng (không phải file nhạc) và tên file được gửi ra ngoài; xem trang Quyền riêng tư.
- **Phân tích:** `ANALYSIS=on`. Dùng ffmpeg giải mã 40 giây giữa mỗi bài, tính nhịp độ (BPM, chỉ là ước lượng), năng lượng và độ sáng, rồi xếp tâm trạng. Khoảng 0,2 giây mỗi bài trên PC; lần đầu với thư viện lớn trên Pi có thể mất vài chục phút.
- `/library status` cho thấy tiến độ. Đổi `LIBRARY_WORKER=off` ở bot phụ để chỉ một bot làm việc nền.

## Chạy bằng Docker (VPS)

```bash
docker compose up -d --build
docker compose run --rm bot node src/deploy-commands.js   # đăng ký slash commands (chạy 1 lần, và mỗi khi đổi lệnh)
docker compose logs -f
```

Lần chạy đầu Lavalink tải plugin về `lavalink/plugins/`, mất khoảng một phút. Bot tự thử kết nối lại tới Lavalink trong lúc chờ.

## Chạy cục bộ (không Docker cho bot)

Chạy riêng Lavalink bằng compose (`docker compose up -d lavalink`, cần thêm `ports: ["2333:2333"]` cho service này), đặt `LAVALINK_HOST=localhost`, `MUSIC_DIR` và `DATA_DIR` trỏ tới thư mục thật trong `.env`, rồi:

```bash
npm install
npm run deploy-commands
npm start
```

Cần Node.js 22 trở lên (dùng `node:sqlite` có sẵn, không cần thêm database).

## Vận hành

- **Dữ liệu:** thư mục `data/` (mount ra ngoài container) chứa cài đặt từng server, hàng chờ đã lưu, cơ sở dữ liệu thống kê (`musidiscord.db`), bộ nhớ đệm thư viện và `shared/` (thẻ, đặc trưng âm thanh, bìa). Dùng `scripts/backup.sh` để sao lưu nhất quán (không chép tay file `.db` khi bot đang chạy).
- **Giảm ghi đĩa (Raspberry Pi):** nhịp tim ghi vào RAM, Lavalink chỉ ghi log cảnh báo, log Docker được giới hạn dung lượng. Đặt `AUTOSAVE_SECONDS=0` trong `.env` để tắt việc lưu hàng chờ định kỳ (bot vẫn lưu khi bắt đầu mỗi bài mới và khi tắt). Nên dùng SSD/USB thay cho thẻ SD.
- **Khôi phục hàng chờ:** trạng thái phát được lưu mỗi 15 giây và khi tắt bot; sau khi khởi động lại bot tự vào lại kênh và phát tiếp nếu còn người nghe.
- **24/7:** `/247 on` giữ bot ở lại kênh; thêm `radio` để phát thư viện mãi mãi, kể cả sau khi khởi động lại.
- **Kiểm tra sức khoẻ:** container bot có healthcheck (`docker compose ps` hiện `healthy`/`unhealthy`). Nếu điền `ALERT_WEBHOOK_URL` (webhook của một kênh Discord riêng), bạn nhận cảnh báo khi Lavalink mất kết nối.
- **Múi giờ:** đặt `TIMEZONE` (mặc định `Asia/Ho_Chi_Minh`) cho thống kê giờ nghe và chuỗi ngày.
- **Lời bài hát online:** khi file không có lời, bot gửi tên bài, nghệ sĩ và độ dài tới dịch vụ công khai LRCLIB. Đặt `LYRICS_LOOKUP=off` để tắt.
- **Quyền riêng tư:** người dùng tự tắt thống kê bằng `/privacy stats` và xoá dữ liệu bằng `/privacy delete`. Bot không đọc nội dung tin nhắn.

## Chạy trên Raspberry Pi

Lavalink và bot đều có bản arm64. Nên dùng SSD qua USB thay vì thẻ SD, có quạt tản nhiệt, và đặt `AUTOSAVE_SECONDS=0`.

**Cài đặt (Kali hoặc Debian/Raspberry Pi OS):**
```bash
sudo apt update && sudo apt install -y docker.io git
docker compose version             # nếu chưa có Compose v2, cài gói docker-compose-v2 hoặc docker-compose-plugin tuỳ bản
sudo usermod -aG docker $USER      # đăng xuất rồi đăng nhập lại
git clone https://github.com/nhaajtt/musiDISCORD.git && cd musiDISCORD
cp .env.example .env               # điền token, ID, mật khẩu Lavalink
docker compose up -d --build
docker compose run --rm bot node src/deploy-commands.js
```
Trên Kali nhớ đổi mật khẩu mặc định (`passwd`), bật SSH (`sudo systemctl enable --now ssh`); nếu Docker lỗi mạng, thử `sudo update-alternatives --set iptables /usr/sbin/iptables-legacy`.

**Truy cập từ xa an toàn:** cài Tailscale (`curl -fsSL https://tailscale.com/install.sh | sh` rồi `sudo tailscale up`), SSH qua địa chỉ Tailscale mà không cần mở cổng router. Muốn xem trang trạng thái hay Uptime Kuma từ điện thoại: `sudo tailscale serve --bg 8787` hoặc `3001`.

### Nhiều bot cùng lúc

Mỗi bot một ứng dụng và token riêng (Discord Developer Portal), chung Lavalink và thư mục nhạc. Dữ liệu thống kê, cài đặt, hàng chờ tách riêng từng bot; thẻ, đặc trưng âm thanh, bìa dùng chung và chỉ bot chính ghi.

```bash
cp .env.bot2.example .env.bot2     # điền DISCORD_TOKEN, CLIENT_ID riêng; BOT_NAME tuỳ ý
docker compose --profile multi up -d --build
docker compose run --rm bot2 node src/deploy-commands.js
```
`bot3` làm tương tự với `.env.bot3`. Mặc định chỉ chạy một bot; mỗi bot thêm tốn RAM và CPU của Pi.

### Màn hình trạng thái và TFT 3.5 inch

Đặt `DISPLAY_PORT=8787` và `DISPLAY_TOKEN=<chuỗi ngẫu nhiên dài>` trong `.env`, khởi động lại. Docker chỉ mở cổng này trên chính máy chạy bot:

- `http://127.0.0.1:8787/display?token=...` là trang 480×320 hiện bài đang phát, có nút ⏯ ⏭ và âm lượng; mở được trên điện thoại hay máy tính bảng (qua Tailscale).
- API: `GET /api/np`, `GET /api/cover`, `POST /api/control` (`toggle`, `skip`, `volume`; luôn cần token). Không có ID Discord hay tên người yêu cầu, và ẩn hoàn toàn khi đang đố nhạc. Không đặt token thì chỉ xem được, không điều khiển được.
- **Màn TFT:** bật driver màn hình và cảm ứng của thẻ (thường là `dtoverlay` kiểu `piscreen`/`waveshare35a` kèm `ads7846` trong `/boot/firmware/config.txt`; **driver SPI cũ có thể chưa chạy trên Pi 5 + Kali**, nếu vậy dùng màn HDMI hoặc điện thoại). Khi thấy `/dev/fb1`:
```bash
sudo apt install -y python3-pil python3-evdev
cp pi/display.env.example pi/display.env     # điền DISPLAY_TOKEN, chỉnh TOUCH_* nếu cảm ứng lệch
sed "s#__USER__#$USER#g; s#__DIR__#$PWD#g" deploy/pi/musidiscord-display.service | sudo tee /etc/systemd/system/musidiscord-display.service
sudo systemctl daemon-reload && sudo systemctl enable --now musidiscord-display
```

### Sao lưu, tự cập nhật, giám sát

```bash
sh scripts/backup.sh      # data/backups/musidiscord-*.tar.gz, giữ BACKUP_KEEP bản (mặc định 14)
sh scripts/update.sh      # git pull (chỉ fast-forward), dựng lại, chờ healthy, hỏng thì quay về bản cũ
docker compose --profile ops up -d uptime-kuma   # http://localhost:3001
```
Đặt `BACKUP_RCLONE_REMOTE=gdrive:musidiscord` trong `.env` (và cài, cấu hình rclone) để đẩy bản sao lưu lên cloud. Chạy định kỳ bằng systemd timer:
```bash
for u in backup update; do
  for ext in service timer; do
    sed "s#__USER__#$USER#g; s#__DIR__#$PWD#g" deploy/pi/musidiscord-$u.$ext | sudo tee /etc/systemd/system/musidiscord-$u.$ext >/dev/null
  done
  sudo systemctl enable --now musidiscord-$u.timer
done
```
**Khôi phục:** dừng bot (`docker compose stop bot`), giải nén bản sao lưu vào `data/` (`tar -xzf data/backups/<file> -C data`), rồi `docker compose start bot`.

## Kiểm thử

```bash
npm test
```

## Lưu ý về YouTube

YouTube thường chặn IP của VPS và thay đổi cách phát liên tục, nên không nên phụ thuộc vào nó. Nguồn phát ổn định nhất là thư viện nhạc riêng và SoundCloud. Nếu vẫn muốn dùng YouTube, cấu hình `oauth` trong `lavalink/application.yml` (phần `plugins.youtube`, refresh token đặt ở `YOUTUBE_REFRESH_TOKEN` trong `.env`) bằng một tài khoản Google phụ, hoặc `pot` (`token` và `visitorData`). Xem hướng dẫn mới nhất tại https://github.com/lavalink-devs/youtube-source và luôn dùng bản mới nhất của `youtube-plugin`.

## Trang web

Thư mục `web/` là trang giới thiệu tĩnh (không cần build) kèm trang quyền riêng tư và điều khoản. Xem thử bằng `python -m http.server` trong thư mục `web/`.

## Tác giả

Làm bởi nhaajt: [GitHub](https://github.com/nhaajtt) • [Instagram](https://www.instagram.com/nhaajt_hehee/). Góp ý hoặc báo lỗi bằng cách mở issue tại repo này.
