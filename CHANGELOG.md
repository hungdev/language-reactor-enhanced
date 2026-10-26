# Changelog

Mọi thay đổi đáng chú ý của userscript `LanguageReactor_SentenceReplay.user.js` được ghi ở đây. Nhánh `lr-5.1.8` dừng ở v1.3.0 cho LR 5.1.8; các bản mới hơn (cho LR 6.0.0) nằm ở nhánh `master`.
Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), đánh số phiên bản theo [Semantic Versioning](https://semver.org/lang/vi/).

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
