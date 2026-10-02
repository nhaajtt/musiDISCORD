# Nhật ký làm dự án musiDISCORD

Đây là nhật ký thật của tôi khi làm musiDISCORD, từ lúc chọn công nghệ cho tới khi nó chạy 24/7 trên một chiếc Raspberry Pi 5 ở nhà. Tôi ghi cả những lúc làm sai và cách tôi tìm ra nguyên nhân, vì phần lớn thứ tôi học được nằm ở đó.

_30/09 đến 02/10/2026_

## 30/09: Chọn công nghệ và dựng khung

Tôi muốn một bot nhạc tự host, không phụ thuộc dịch vụ của ai. Tôi chọn **Node.js và discord.js** cho bot, **Lavalink v4** làm máy chủ âm thanh riêng (bot chỉ ra lệnh, Lavalink lo giải mã và đẩy âm thanh vào kênh thoại), và **Docker Compose** để đóng gói cả hai.

Câu hỏi đầu tiên làm tôi khựng là dán gì vào `DISCORD_TOKEN`. Tôi tưởng đó là Public Key. Đọc lại Developer Portal tôi mới hiểu: Token là mật khẩu của bot (không bao giờ được đưa lên GitHub), còn Application ID là mã công khai dùng để mời bot và đăng ký lệnh. Từ đó file `.env` nằm trong `.gitignore` ngay từ commit đầu.

Một chi tiết nhỏ tốn thời gian: lệnh gạch chéo đăng ký "toàn cầu" hiện rất chậm, còn đăng ký theo từng server bằng `GUILD_ID` thì hiện ngay. Khi thử tôi dùng cách thứ hai.

## 30/09: YouTube không chịu phát

Phát link YouTube thì báo `This video requires login`, rồi tới lỗi giải mã chữ ký (signature function).

Tôi đã thử lần lượt:

- cập nhật plugin YouTube của Lavalink lên 1.18.2;
- đăng nhập OAuth bằng tài khoản phụ để lấy refresh token;
- bật thêm các client dự phòng;
- tắt VPN, chạy từ IP nhà.

Kết quả là lúc được lúc không. YouTube chủ động chặn kiểu truy cập này, và về điều khoản dịch vụ thì đây cũng không phải thứ nên xây sản phẩm lên trên.

> **Quyết định:** không cố thắng cuộc chơi với YouTube. Chuyển trọng tâm sang **thư viện nhạc riêng** (file của chính mình) cộng SoundCloud; YouTube chỉ giữ như tuỳ chọn. Bài học đầu tiên: khi một hướng phụ thuộc vào thứ mình không kiểm soát, đổi hướng sớm rẻ hơn là gồng.

## 30/09: Nhạc local và cái tên “Unknown title”

File nhạc của tôi không có thẻ, nên ô gợi ý của `/local` toàn "Unknown title", chọn bài rất khó.

Tôi viết bộ quét thư viện: đọc thẻ bằng `music-metadata`; nếu thiếu thì đoán nghệ sĩ và tên bài từ tên file (kiểu `01-ten-bai`, `Nghệ sĩ - Tên bài`) và từ thư mục; tìm kiếm bỏ dấu tiếng Việt; lưu bộ nhớ đệm theo ngày sửa và dung lượng file để lần quét sau chỉ đọc file mới.

Từ đó ra `/nhaajt`: phát ngẫu nhiên cả thư mục, hết vòng thì xáo lại, không dừng cho tới khi bấm dừng. Tôi dùng xáo trộn có trọng số (bài được 👍 lên sớm hơn) và giãn các bài cùng nghệ sĩ ra xa nhau, vì xáo ngẫu nhiên thuần thường cho hai bài của cùng một người hát đứng liền nhau.

## 01/10: Từ chạy được sang dùng được

Bot phát được rồi nhưng chưa phải thứ người khác dùng được. Danh sách tôi tự đặt ra: role DJ và âm lượng mặc định cho từng server, bỏ phiếu bỏ qua bài khi đông người, hàng chờ công bằng (mỗi người một lượt), `/bump`, chế độ 24/7, thẻ "Đang phát" bằng Components V2, đố nhạc, thống kê và Wrapped, lời bài hát chạy theo giọng.

Những chỗ tôi bị kẹt:

- **Khởi động lại bot thì mất hàng chờ.** Tôi lưu ảnh chụp hàng chờ khi bắt đầu bài mới và khi tắt bot. Lỗi tôi gặp: khôi phục vị trí vượt quá độ dài bài làm Lavalink từ chối, nên phải kẹp vị trí về trong khoảng cho phép.
- **Kiểm tra sức khoẻ.** Tôi ghi tín hiệu "còn sống" vào RAM (`/dev/shm`) thay vì ổ đĩa, để sau này đưa lên thẻ SD không bị mòn.
- **Thẻ Wrapped.** Vẽ SVG rồi đổi sang PNG bằng `@resvg/resvg-js`; container không có phông nên tôi đóng gói kèm phông mã nguồn mở.

Từ đây mỗi tính năng đi kèm test (`node:test`). Tới lúc này đã có 131 bài test.

## 01/10: Dữ liệu từ người khác không bao giờ vô hại

Tên bài lấy từ thẻ file, mà thẻ có thể do ai đó đặt. Một tên bài như `[bấm vào đây](http://…)` hoặc `<@id>` sẽ dựng thành liên kết giả hay nhắc tên người trong tin nhắn của bot.

Khi thử, tôi phát hiện hàm `escapeMarkdown` của discord.js không thoát các ký tự `[ ] ( ) < >`. Tôi viết thêm `safeText` và `cleanMeta` (bỏ ký tự điều khiển, ký tự đổi chiều chữ, link dạng markdown) và thêm test cho từng trường hợp. Bài học: mọi chuỗi đi từ ngoài vào (thẻ file, tên người dùng, nội dung đề xuất) đều phải được làm sạch trước khi hiển thị.

## 01/10: Một ý tưởng tôi quyết định không làm

Tôi từng nghĩ ra việc để thành viên gửi link YouTube, bot dùng một trang chuyển đổi mp3 để tải về kho nhạc, cho kho lớn lên nhờ người dùng. Nghe hay.

Nhưng càng nghĩ càng thấy ba vấn đề: sao chép nhạc có bản quyền rồi phát cho cả server là vi phạm; repo và website của tôi công khai nên rất dễ bị gỡ; và về kỹ thuật cũng không ổn định (những trang đó không có API, YouTube chặn y như lỗi hôm 30/09).

Cách làm thay thế mà tôi chọn:

- `/contribute`: người dùng gửi **file của chính họ**, chủ bot duyệt từng file trước khi vào kho. Tắt mặc định; chỉ nhận đường dẫn từ CDN của Discord; giới hạn dung lượng, thời lượng; chặn trùng bằng mã băm; tên file lưu do bot đặt, không dùng tên của người dùng (tránh đường dẫn kiểu `../`).
- `/request`: chỉ ghi tên bài hoặc link vào danh sách mong muốn, **không mở, không tải** link. Khi bài xuất hiện trong thư viện, bot nhắn người đề xuất.

## 01/10: Website, Vercel và lỗi 404 đầu tiên

Tôi làm website giới thiệu theo phong cách bản vẽ kỹ thuật (giấy xanh cyanotype), đẩy repo lên GitHub (công khai) và deploy lên Vercel.

Trang báo `404: NOT_FOUND`. Nguyên nhân: Vercel build ở thư mục gốc của repo, còn trang nằm trong `web/`. Tôi sửa bằng một file `vercel.json` ở gốc, chỉ định thư mục xuất là `web`. Vì repo công khai, tôi cũng rà lại những gì không được commit: `.env`, `data/`, `music/`, plugin Lavalink.

## 01/10: Đưa lên Raspberry Pi 5: mỗi bước một vấp

Tôi có một chiếc Pi 5 (8 GB, chạy Kali Linux) nên quyết định chuyển bot lên đó cho chạy 24/7.

- **SSH bằng khoá.** Chạy `ssh` qua công cụ không có terminal thì không nhập được mật khẩu, báo `Permission denied`. Tôi tạo khoá ed25519 và chép sang Pi nhưng vẫn bị từ chối. Chế độ `-v` cho thấy server đã chấp nhận khoá nhưng client không ký được. Nguyên nhân: hai dấu nháy `""` tôi gõ khi tạo khoá bị Windows hiểu thành **passphrase thật**. Tôi gỡ nó bằng `ssh-keygen -p`.
- **Quyền Docker.** Docker có sẵn nhưng tài khoản chưa thuộc nhóm `docker`, còn `sudo` cần mật khẩu. Tôi tách việc cần quyền root (cài gói, thêm nhóm) ra tự chạy, phần còn lại làm qua SSH.
- **Plugin Lavalink báo 404.** Trên Pi, Lavalink không tải được plugin YouTube vì Maven trả 404 cho đúng phiên bản đó (trên PC chạy được vì đã tải từ trước). Plugin là file Java nên chạy được trên mọi kiến trúc: tôi chép thẳng file `.jar` từ PC sang. Thư mục plugins lại thuộc `root` do Docker tạo ra, nên phải đổi chủ qua một container tạm.
- **Một dòng bị dính.** File `.env` không có dấu xuống dòng cuối, nên dòng tôi thêm vào dính luôn vào `ANALYSIS=on` thành `ANALYSIS=onAUTOSAVE_SECONDS=0`. Từ đó mỗi lần sửa `.env` tôi đều kiểm tra lại.

Vì Pi dùng **thẻ SD** (dễ mòn khi ghi nhiều), tôi giảm ghi đĩa: tín hiệu "còn sống" trong RAM, `AUTOSAVE_SECONDS=0`, log Docker xoay vòng.

## 02/10: Tận dụng Pi: gắn thẻ, phân tích âm thanh, nhiều bot

Tôi muốn Pi làm được những việc mà trước giờ máy tính cá nhân không để chạy nền được.

- **Tự gắn thẻ** bằng dấu vân âm thanh: `fpcalc` tạo dấu vân, hỏi AcoustID, nếu không có thì tìm MusicBrainz theo tên file. Thẻ được lưu **ngoài** file nhạc (file gốc không bị sửa). Chạy thử trên 10 bài thật của tôi thì AcoustID không nhận ra bài nào (đều là bản rip), nên chỉ còn đường tìm theo tên file, độ tin cậy tối đa 80%, dưới ngưỡng tự áp dụng 85% và thành hàng đợi chờ tôi duyệt. Tôi cố ý đặt ngưỡng như vậy để máy không tự ghi đè bằng một phỏng đoán sai.
- **Phân tích âm thanh** để có `/vibe` (radio theo tâm trạng) và `/similar`: giải mã 40 giây giữa bài bằng ffmpeg rồi tính năng lượng, độ sáng và BPM bằng FFT và tự tương quan, viết bằng JavaScript thuần. Tôi kiểm bằng nhịp tổng hợp từ 80 đến 170 BPM. Bản đầu nhận 140 BPM thành 70 (nhầm sang nhịp một nửa); làm mượt đường bao onset thì sai số còn dưới 1 BPM. Chạy trên kho thật, tôi thấy năng lượng bị "bão hoà" ở 1,0 với các bài master to, nên đo âm lượng thực của kho (khoảng từ −18 đến −5 dB) rồi hiệu chỉnh lại thang.
- **Nhiều bot cùng lúc.** Thêm profile `multi` trong Docker Compose. Vì hai tiến trình dùng chung thư mục dữ liệu sẽ đè file của nhau, tôi tách dữ liệu riêng từng bot và chỉ cho một bot "worker" ghi vào thư mục dùng chung.
- **Vận hành.** Sao lưu bằng `VACUUM INTO` (bản sao nhất quán dù bot đang ghi; tôi kiểm bằng cách giải nén và đọc lại). Script tự cập nhật từ GitHub có **quay về bản cũ** nếu bot không khoẻ sau cập nhật. Uptime Kuma để giám sát. Tailscale để vào từ xa mà không phải mở cổng router.

## 02/10: Trang trạng thái `/display` và chuyện “tên bài biến mất”

Tôi làm một trang web nhỏ hiện bài đang phát cho điện thoại và màn hình lớn, có nút điều khiển bảo vệ bằng token. Thiết kế lại nhiều vòng: chiếc đĩa quay và đập theo BPM thật của bài, màu cả trang đổi theo bài, thước dưới chân là các vạch nhịp, bấm vào thước để tua.

Khi kiểm bằng Chrome không giao diện, ảnh chụp luôn **thiếu tên bài**. Tôi mất một lúc nghi ngờ code, cho tới khi nhận ra chế độ "thời gian ảo" của Chrome không chạy hoạt ảnh CSS, nên chữ vẫn ở trạng thái ẩn của đầu hoạt ảnh. Tôi viết script điều khiển Chrome qua DevTools, chờ thời gian thật rồi mới chụp. Bài học: khi công cụ kiểm tra cho kết quả lạ, hãy kiểm tra công cụ trước khi sửa code.

Về bảo mật của trang: chỉ mở trên `127.0.0.1` ở máy chạy bot; điều khiển cần `DISPLAY_TOKEN`; không lộ ID Discord hay tên người yêu cầu; tự ẩn khi đang đố nhạc (kẻo lộ đáp án); chính sách CSP chặt (không script nhúng, không tài nguyên ngoài). Test cũng bắt được một lỗi: giá trị `null` từng bị coi là số 0 nên một yêu cầu tua có thể đưa bài về đầu; tôi sửa để API chỉ nhận số thật.

## 02/10: Màn TFT 3.5 inch: câu chuyện dài nhất

Tôi có một màn TFT cảm ứng 3.5 inch cắm thẳng lên chân GPIO của Pi. Mục tiêu: hiện bài đang phát ngay trên Pi.

### 1. Màn trắng

Driver nạp bình thường, `dmesg` sạch, nhưng màn trắng. Tôi đọc cây thiết bị để kiểm các chân điều khiển: DC là GPIO24 và RESET là GPIO25, đúng bộ điều khiển RP1 của Pi 5. Tô thẳng màu đỏ vào framebuffer vẫn trắng.

### 2. Tìm nguyên nhân

Tra tài liệu: hãng chỉ hỗ trợ Pi 3B và 4B. Overlay `tft35a` mà Pi đang dùng không thuộc nhân Raspberry Pi mà do script của hãng cài, dựa trên driver `fbtft` cũ. Overlay chính thức `piscreen` có thêm tuỳ chọn `drm` để dùng driver hiện đại. Tôi đổi sang `dtoverlay=piscreen,drm,rotate=90`: màn chuyển từ trắng sang đen. Đen cũng là tiến bộ, vì nó chứng tỏ panel đã nhận lệnh khởi tạo.

### 3. Chứng minh dữ liệu có đi

Màn vẫn đen khi vẽ. Thay vì đoán, tôi đọc bộ đếm byte của bus SPI trong `sysfs` trước và sau khi ghi một khung: tăng đúng 307.222 byte (480×320×2 byte cộng lệnh). Vậy Pi gửi đủ, lỗi nằm chỗ khác. Giả thuyết kế tiếp là tốc độ SPI: driver mới mặc định 24 MHz, trong khi hãng thiết kế cho 16 MHz. Tôi hạ xuống 8 MHz thì ảnh hiện ra.

### 4. Hướng xoay

Tôi vẽ một ảnh thử có bốn ô màu ở bốn góc và chữ để nhìn ra màn đang bị xoay bao nhiêu độ. Kết quả: cần xoay 90°.

### 5. Cảm ứng

Hiệu chỉnh lần đầu sai: tôi chỉ ghi được 3 trên 4 lần chạm góc nên đoán sai thứ tự và đặt nhầm trục. Khi thử bấm nút, nhật ký chạm cho thấy mọi lần bấm đều bị tính ở góc dưới trái. Đối chiếu lại toàn bộ dữ liệu thì suy ra đúng: không hoán đổi trục, chỉ đảo trục ngang. Sau đó tôi mới nhận ra màn này là **cảm ứng điện trở**, phải dùng bút, ngón tay bấm không ổn định.

### 6. Lag

Bản đầu gửi cả khung hình 2 lần mỗi giây (khoảng 614 KB mỗi giây, trong khi bus 8 MHz chỉ chịu được khoảng 1 MB). Tôi thử chỉ gửi vùng thay đổi và thấy còn giật hơn. Đo lại thì phần vẽ chỉ mất 12 ms, điểm nghẽn là bus SPI, và chiếc đĩa quay đòi quá nhiều băng thông. Tôi đổi thiết kế: **bỏ chuyển động trên màn nhỏ**, chỉ vẽ lại mỗi giây một lần (thanh tiến trình chạy) và ngay khi chạm. Lưu lượng còn khoảng 307 KB mỗi giây. Bài học: phần cứng quyết định thiết kế. Cùng một ý tưởng trên điện thoại thì mượt, trên màn SPI thì không.

### 7. Giao diện

Tôi lặp lại nhiều lần theo cảm nhận của mình: áp phích chữ, đồng hồ lớn khi nhàn rỗi, ảnh đại diện cỡ lớn, rồi bìa tạp chí với phông có chân. Viền quanh ảnh bị tôi loại bốn lần (viền màu, dấu góc, thước chia vạch, khung chữ nhật) cho tới khi chọn bỏ hẳn viền và để ảnh tràn mép như một bìa tạp chí thật.

## 02/10: Những lỗi vặt tốn thời gian

- `pkill -f` tự giết chính phiên SSH của mình, vì chuỗi cần tìm cũng nằm ngay trong lệnh đang chạy. Cách tránh: tách thành lệnh riêng hoặc dùng mẹo `[p]attern`.
- Dịch vụ Tailscale ở trạng thái `disabled`, nên sau khi khởi động lại Pi, trang điều khiển và Kuma qua Tailscale biến mất. Tôi kiểm `systemctl is-enabled` thay vì chỉ `is-active`, rồi bật tự chạy.
- `git pull` trên Pi bị từ chối vì trước đó tôi đã chép tay file lên. Từ đó tôi luôn commit rồi mới đồng bộ.
- Ảnh chân dung để trong thư mục dự án suýt bị `git add -A` đưa lên repo công khai; tôi thêm nó vào `.gitignore` trước khi commit.
- Nhiều lệnh dài trong shell Windows hỏng vì dấu nháy và dấu gạch chéo ngược; tôi chuyển sang ghi script ra file rồi chạy.

## 02/10: Dọn dẹp và viết lại tài liệu

Cuối cùng tôi dọn cả hai máy. Trên PC: dừng và xoá container, image và cache Docker của dự án (đã chuyển hết sang Pi), xoá dữ liệu cũ sau khi lấy về một bản sao lưu mới từ Pi (để có một bản nằm ngoài thẻ SD). Trên Pi: xoá file tạm và image dư. Những thứ không thuộc dự án này tôi giữ nguyên. Sau đó tôi tách website thành nhiều trang cho dễ đọc và viết nhật ký này.

## Những gì tôi học được

- Khi một hướng phụ thuộc vào thứ mình không kiểm soát (YouTube), đổi hướng sớm.
- Đo trước khi tối ưu: bộ đếm byte của bus SPI, thời gian vẽ, lưu lượng. Đoán sai tốn nhiều thời gian hơn đo.
- Chia vấn đề phần cứng thành các giả thuyết kiểm chứng được: chân nào, dữ liệu có đi không, tốc độ, hướng xoay.
- Dữ liệu từ bên ngoài luôn phải được làm sạch trước khi hiển thị hay ghi ra đĩa.
- Thiết kế phải nằm trong giới hạn của phần cứng, không phải ngược lại.
- Với tính năng có thể gây hại (tải nhạc có bản quyền), cân nhắc rủi ro rồi chọn phương án an toàn hơn thay vì làm cho bằng được.
- Vận hành quan trọng ngang viết code: sao lưu, tự cập nhật có quay lui, giám sát, tự khởi động lại.
- Viết test cho phần có logic (BPM, chặn đường dẫn, API, làm sạch chuỗi) và ghi rõ chỗ chưa có test.

## Còn dở

- Chưa thử SPI 16 MHz (có thể cho phép bật lại chuyển động trên màn TFT).
- Chưa kiểm chứng màn TFT tự bật lại sau khi Pi khởi động lại: dòng `@reboot` trong crontab chưa qua một lần thử thật.
- Code Python của màn TFT chưa có test tự động; hiện chỉ kiểm bằng ảnh xuất ra và chạy trên thiết bị.
- Phần quay về bản cũ của script tự cập nhật mới được viết và kiểm với trường hợp "không có bản mới"; chưa thử bằng một bản hỏng thật.
- Profile nhiều bot (`multi`) chưa được chạy thử với token thứ hai.
- Thẻ SD vẫn là điểm yếu; nên chuyển sang SSD USB để chạy lâu dài.
