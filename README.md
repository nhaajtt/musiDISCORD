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
| `/settings view \| dj-role \| volume \| fair-queue \| vc-status` | Quản trị (cần quyền Manage Server) |
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

- **Dữ liệu:** thư mục `data/` (mount ra ngoài container) chứa cài đặt từng server, hàng chờ đã lưu, cơ sở dữ liệu thống kê (`musidiscord.db`) và bộ nhớ đệm thư viện. Sao lưu thư mục này nếu muốn giữ dữ liệu.
- **Giảm ghi đĩa (Raspberry Pi):** nhịp tim ghi vào RAM, Lavalink chỉ ghi log cảnh báo, log Docker được giới hạn dung lượng. Đặt `AUTOSAVE_SECONDS=0` trong `.env` để tắt việc lưu hàng chờ định kỳ (bot vẫn lưu khi bắt đầu mỗi bài mới và khi tắt). Nên dùng SSD/USB thay cho thẻ SD.
- **Khôi phục hàng chờ:** trạng thái phát được lưu mỗi 15 giây và khi tắt bot; sau khi khởi động lại bot tự vào lại kênh và phát tiếp nếu còn người nghe.
- **24/7:** `/247 on` giữ bot ở lại kênh; thêm `radio` để phát thư viện mãi mãi, kể cả sau khi khởi động lại.
- **Kiểm tra sức khoẻ:** container bot có healthcheck (`docker compose ps` hiện `healthy`/`unhealthy`). Nếu điền `ALERT_WEBHOOK_URL` (webhook của một kênh Discord riêng), bạn nhận cảnh báo khi Lavalink mất kết nối.
- **Múi giờ:** đặt `TIMEZONE` (mặc định `Asia/Ho_Chi_Minh`) cho thống kê giờ nghe và chuỗi ngày.
- **Lời bài hát online:** khi file không có lời, bot gửi tên bài, nghệ sĩ và độ dài tới dịch vụ công khai LRCLIB. Đặt `LYRICS_LOOKUP=off` để tắt.
- **Quyền riêng tư:** người dùng tự tắt thống kê bằng `/privacy stats` và xoá dữ liệu bằng `/privacy delete`. Bot không đọc nội dung tin nhắn.

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
