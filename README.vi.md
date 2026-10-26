# LR Sentence Replay — Tampermonkey userscript cho Language Reactor (YouTube)

[English](README.md) | **Tiếng Việt**

Userscript chạy song song với extension **Language Reactor (LR)** trên YouTube (đã thử với 5.1.8 và 6.0.0), không sửa hay đóng gói lại LR. Script thêm hai tính năng:

1. **Smart Pause (Tự dừng câu)**: dừng ở cuối một câu hoàn chỉnh (theo timing phụ đề), thay vì dừng ở cuối mỗi dòng phụ đề.
2. **Multi-line Replay**: chọn một khoảng dòng liên tục trong panel transcript bên phải của LR, phát lại một lần hoặc lặp.

## Phiên bản và nhánh

| Nhánh | Language Reactor | Userscript | Release |
|---|---|---|---|
| `master` | 6.0.0 (`6.0.0_0/`, `6.0.0_0.zip`) | bản mới nhất (1.5.0 trở lên): có phiên âm IPA + phát âm Cambridge, vẫn chạy được với LR 5.1.8 | |
| [`lr-5.1.8`](https://github.com/hungdev/language-reactor-enhanced/tree/lr-5.1.8) | 5.1.8 (`5.1.8_0/`, `5.1.8_0.zip`) | 1.3.0, bản cuối cùng chỉ dành cho LR 5.1.8, không phát triển tiếp | [v1.3.0](https://github.com/hungdev/language-reactor-enhanced/releases/tag/v1.3.0) |

Dùng `master` nếu bạn dùng LR 6.0.0. Nếu vẫn dùng LR 5.1.8, chuyển sang nhánh `lr-5.1.8` (`git checkout lr-5.1.8`) hoặc tải release v1.3.0. Lịch sử thay đổi của script: [CHANGELOG.md](CHANGELOG.md).

## Cài đặt

1. Cài Tampermonkey trên Chrome (macOS). Với Chrome MV3, bật **Developer mode** tại `chrome://extensions` (hoặc bật "Allow User Scripts" trong chi tiết Tampermonkey) để Tampermonkey được chạy userscript.
2. Mở Tampermonkey → *Create a new script* → dán toàn bộ nội dung `LanguageReactor_SentenceReplay.user.js` → Save. Cách khác: kéo thả file `.user.js` vào cửa sổ Chrome để Tampermonkey hiện trang cài đặt.
3. Mở một video `https://www.youtube.com/watch?...`, bật LR và chọn một track phụ đề. Thanh công cụ **LR Sentence Replay** sẽ hiện cạnh panel transcript.

Script cần chạy trong *page context* để đọc dữ liệu phụ đề của LR (`window.lln` trên LR 5.x; LR 6.x không còn `window.lln`, script đọc cùng dữ liệu đó qua state MobX của LR, chỉ đọc, không sửa). Metadata đã khai báo `@sandbox JavaScript` và `@grant unsafeWindow`. Nếu thanh công cụ báo "LR có trên trang nhưng không đọc được dữ liệu", mở Tampermonkey *Settings* (Config mode: Advanced), tìm mục sandbox/injection ở phần Security và đảm bảo nó không bị ép về chế độ `DOM`; sau đó tải lại trang.

## Sử dụng

| Điều khiển | Tác dụng | Phím tắt |
|---|---|---|
| **Select** | Bật chế độ chọn: hiện checkbox trên mỗi dòng transcript. Click để chọn, Shift-click để chọn khoảng | Shift+E |
| **Replay Selected** | Phát từ đầu dòng đầu tới cuối dòng cuối (+ đệm cuối) | Shift+R |
| **Loop** | Bật/tắt lặp khoảng đã chọn | Shift+L |
| **Stop** | Thoát replay/loop ngay và dừng video | Shift+X |
| **Clear Selection** | Bỏ chọn | |
| **↺ Phát lại câu** | Phát lại trọn câu mà Smart Pause vừa dừng (ví dụ cả hai dòng của một câu dài hai dòng); nếu không thì phát câu tại vị trí đang phát. Không tạo vùng chọn | **Z** (hoặc Shift+R khi chưa chọn dòng nào) |
| **Smart Pause** | Bật/tắt tự dừng ở cuối câu | Shift+S |
| **Line Pause** (Dừng mỗi dòng) | Bật/tắt auto-pause có sẵn của LR (dừng ở cuối mỗi dòng phụ đề, giống công tắc "AP" của LR) | Q (phím của LR) |
| ⚙ | Cài đặt: đệm cuối, độ trễ Smart Pause, ngưỡng khoảng lặng, độ dài câu tối đa, phím tắt, ngôn ngữ EN/VI, nạp file phụ đề, sao chép chẩn đoán | |

Khi bật Smart Pause, cách dùng thường là: video dừng ở cuối câu (thanh trạng thái hiện "Hết câu · bấm Z để nghe lại"), bấm **Z** hoặc **↺ Phát lại câu** để nghe lại cả câu từ dòng đầu, bao nhiêu lần tuỳ ý, rồi bấm Play để nghe tiếp. Smart Pause dừng ngay trước khi dòng sau bắt đầu, nên LR vẫn tô câu vừa nghe.

Quy tắc chọn dòng:

- Vùng chọn luôn **liên tục**. Click một dòng không liền kề sẽ mở rộng thành khoảng bao quanh và hiện thông báo.
- Chỉ bỏ được dòng đầu hoặc dòng cuối của khoảng; bỏ dòng ở giữa sẽ bị từ chối kèm thông báo.
- Khi chế độ chọn đang bật, click vào **từ** vẫn mở từ điển của LR; click vào phần còn lại của dòng sẽ chọn dòng thay vì phát.
- Khi chế độ chọn tắt, LR hoạt động như bình thường; các dòng đã chọn vẫn được tô viền cam.
- Vùng chọn được giữ khi LR vẽ lại panel (cuộn, đóng/mở panel), và bị xoá khi đổi video hoặc đổi track phụ đề.

**Z** là phím đơn duy nhất: cả LR (dùng A, S, D, W, E, R, F, Q, 1, 2, Space) lẫn YouTube đều không dùng phím này. Các phím tắt còn lại dùng tổ hợp **Shift** vì LR bỏ qua phím có Shift, còn YouTube không dùng Shift+R/L/X/S/E. Khi đang có vùng chọn, Z phát lại vùng chọn giống Shift+R. Phím tắt bị bỏ qua khi đang gõ trong ô nhập liệu, ô tìm kiếm, bình luận, từ điển hoặc modal của LR. Script không chiếm phím Space.

## Auto-pause của LR

**Smart Pause** và **Dừng mỗi dòng** loại trừ nhau: bật cái này sẽ tắt cái kia, và có thể tắt cả hai. "Dừng mỗi dòng" chính là auto-pause của LR, nên công tắc "AP" và phím `Q` của LR luôn đồng bộ với nút này; bấm `Q` khi đang bật Smart Pause sẽ tắt Smart Pause kèm thông báo. Thanh trạng thái hiện chế độ đang dùng ("Tự dừng câu: BẬT", "Dừng mỗi dòng: BẬT" hoặc "Tự dừng: TẮT").

Trong lúc Replay, tùy chọn *"Bỏ qua auto-pause của LR trong lúc phát lại"* (mặc định bật) cho phép script tự phát tiếp khi chính LR dừng ở cuối một dòng bên trong khoảng chọn. Script chỉ làm vậy khi LR đánh dấu là tự dừng (`body[lln-player-state="lln-auto-paused"]`) và vị trí phát nằm sát cuối một cue. Người dùng tự bấm dừng thì video không bao giờ bị tự phát lại.

## Giới hạn đã biết

- Nguồn timing là state nội bộ của LR (`window.lln.subManager.data` trên 5.x, cùng object đó lấy qua MobX trên 6.x), vốn không phải API công khai. LR 6.0.0 đã bỏ `window.lln`; bản cập nhật sau có thể lại thay đổi. Script sẽ báo rõ lỗi chứ không tự đoán timing.
- Smart Pause là heuristic dựa trên dấu câu. Một cue chứa nhiều câu (ví dụ `"Yes. I think"`) không thể dừng giữa cue vì không có timing theo từ; script sẽ dừng ở cuối câu kết thúc sau đó.
- Phụ đề tự động (ASR) không có dấu câu: script chuyển sang chia theo khoảng lặng (≥ 800 ms) và giới hạn độ dài câu (8 s).
- Khi nạp file `.srt`/`.vtt` dự phòng, chỉ dùng được Smart Pause và "Phát lại câu". Chọn dòng trong panel cần phụ đề của LR (chỉ số dòng ánh xạ 1-1 với mảng phụ đề LR).
- Quảng cáo giữa video (mid-roll) đổi nguồn video nên replay sẽ dừng; phát lại sau khi hết quảng cáo.
- Chỉ hỗ trợ trang `youtube.com/watch` trên desktop (không hỗ trợ Shorts, embed, miniplayer).

## Xử lý sự cố

- **Không thấy thanh công cụ**: chỉ hiện trên `/watch`. Kiểm tra Tampermonkey đã bật script và Chrome đã cho phép userscript.
- **"Không phát hiện Language Reactor"**: LR chưa được bật hoặc chưa tải xong trên tab này; tải lại trang.
- **"Hãy chọn track phụ đề"** / **"Video không có phụ đề"**: chọn phụ đề trong LR; video không có phụ đề thì không thể phát lại (script không tự tạo timing).
- **Lỗi khác**: ⚙ → **Copy diagnostics**, hoặc chạy `LRSR.diagnostics()` trong DevTools Console, rồi gửi JSON kèm báo lỗi.

## Kiểm thử

- Test logic (Node ≥ 18): `node --test tests/core.test.js`
- Checklist thủ công trên YouTube + LR: xem `TESTING.md`.
- Báo cáo kỹ thuật (selector và nguồn dữ liệu đã xác minh): xem `TECHNICAL_REPORT.md`.
