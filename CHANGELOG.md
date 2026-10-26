# Changelog

Mọi thay đổi đáng chú ý của userscript `LanguageReactor_SentenceReplay.user.js` được ghi ở đây. Nhánh `master` chứa bản mới nhất cho LR 6.0.0; bản v1.3.0 cho LR 5.1.8 nằm ở nhánh `lr-5.1.8` (release `v1.3.0`).
Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), đánh số phiên bản theo [Semantic Versioning](https://semver.org/lang/vi/).

## 1.5.0 - 2026-10-26

### Thêm
- Phiên âm IPA ngay cạnh từ trong popup Dictionary của Language Reactor 6.0.0 (`.lln-dict-headword`), lấy từ Cambridge Dictionary.
- Tô sáng trọng âm: âm tiết mang trọng âm chính (`ˈ`) in đậm, gạch chân cam; trọng âm phụ (`ˌ`) gạch đứt; dấu tách âm tiết `.` làm mờ.
- Nút phát âm **UK** / **US** có IPA riêng của từng giọng, phát mp3 của Cambridge. Bấm chip luôn phát âm, không mở trang Cambridge.
- Từ đổi phát âm theo từ loại (ví dụ *record* n./v.) hiện một dòng cho mỗi từ loại.
- Tải Cambridge trực tiếp từ YouTube: cookie xác minh `cf_clearance` của Cloudflare là cookie phân vùng (`partitionKey: cambridge.org`) nên Chrome không tự gửi nó từ YouTube; script đọc cookie qua `GM_cookie` và gửi kèm request (`cookiePartition` + `cookie`).
- Nút "Kết nối Cambridge" khi cookie hết hạn hoặc bị xoá: mở Cambridge trong tab nền, tự đóng tab khi xác minh xong.
- Dự phòng khi vẫn bị chặn: lấy dữ liệu qua một tab Cambridge đang mở (script chạy thêm trên `dictionary.cambridge.org`, trao đổi qua `GM_setValue` / `GM_addValueChangeListener`).
- Dự phòng khi Cambridge không có từ: dictionaryapi.dev; khi không có audio: Google TTS (en-GB/en-US).
- Cài đặt mới: bật/tắt tính năng, giọng ưu tiên (UK/US), tự phát âm khi mở từ.
- Test cho `parseCambridgeHtml`, `parseFreeDictJson`, `ipaSyllables`, `normalizeLookupWord`.

### Thay đổi
- Thêm `@match https://dictionary.cambridge.org/*`.
- Thêm quyền `GM_xmlhttpRequest`, `GM_openInTab`, `GM_cookie`, `GM_addValueChangeListener`, `GM_removeValueChangeListener`.
- Thêm `@connect` cho `dictionary.cambridge.org`, `api.dictionaryapi.dev`, `translate.google.com`.

## 1.4.0 - 2026-10-19

### Sửa lỗi
- Hỗ trợ Language Reactor 6.0.0: LR 6 bỏ `window.lln`, script đọc dữ liệu phụ đề qua state MobX của LR (chỉ đọc, không sửa).
- Auto-pause của LR được đọc/ghi qua checkbox `#autoPause` (LR 6 không còn `setMan`); giữ video ở trạng thái dừng khi chuyển chế độ.

### Thêm
- Đánh giá Smart Pause cả trong sự kiện `timeupdate` để không lỡ điểm dừng.
- Thông báo trạng thái "đang đọc dữ liệu phụ đề" và thêm số liệu vào chẩn đoán.

## 1.3.0 - 2026-10-18

### Thêm
- Nút **Line Pause** (Dừng mỗi dòng): bật/tắt auto-pause có sẵn của LR, đồng bộ với công tắc "AP" và phím `Q`.
- Smart Pause và Line Pause loại trừ nhau; thanh trạng thái hiện chế độ đang dùng.

## 1.2.0 - 2026-10-18

### Thêm
- Phím **Z** / nút **↺ Phát lại câu**: phát lại trọn câu mà Smart Pause vừa dừng (kể cả câu nhiều dòng), không tạo vùng chọn.

### Sửa lỗi
- Caption kiểu "cuộn" (cue dài 0 ms lặp lại): không bao giờ kết thúc câu tại cue dài dưới 20 ms.
- Giới hạn khoảng đệm cuối tại `cue kế tiếp.begin − 20 ms` để LR vẫn tô dòng vừa nghe khi dừng.

## 1.0.0 - 2026-10-18

### Thêm
- Phiên bản đầu tiên cho Language Reactor 5.1.8 trên YouTube.
- **Smart Pause**: tự dừng ở cuối mỗi câu hoàn chỉnh (dựa trên dấu câu, khoảng lặng và độ dài tối đa).
- Chọn nhiều dòng trong transcript của LR (Shift-click để chọn khoảng) để **Replay** / **Loop**.
- Phím tắt Shift+R/L/X/S/E, thanh công cụ kéo thả, cài đặt, giao diện tiếng Anh/tiếng Việt.
- Nạp file `.srt`/`.vtt` dự phòng và nút sao chép chẩn đoán.
