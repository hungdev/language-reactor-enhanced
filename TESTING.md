# Hướng dẫn kiểm thử

## 1. Test tự động (logic thuần)

```bash
node --test tests/core.test.js
```

File test `require` trực tiếp userscript: khi chạy trong Node, script chỉ export phần `Core` mà không đụng tới DOM. Các test bao phủ:

- Phân loại cuối câu: `.?!`, dấu ngoặc/ngoặc kép phía sau, viết tắt (`Mr.`, `Dr.`, `e.g.`, `U.S.`, `etc.`), chữ cái viết tắt tên, số thập phân bị cắt (`3.` + `14`), dấu ba chấm, tiếp nối bằng chữ thường, tag âm thanh `[Music]`, ký tự zero-width.
- Gom câu: ví dụ Pavlov (tiêu chí 1), ngắt theo khoảng lặng, giới hạn độ dài câu, track ASR không dấu câu, bao phủ mọi cue đúng một lần.
- Khoảng phát lại: đầu/cuối, đệm cuối, giới hạn theo độ dài video, lỗi rõ ràng (`NO_CUES`, `OUT_OF_RANGE`, `BAD_TIMING`, `TOO_SHORT`).
- Quy tắc chọn dòng: click, Shift-click, liền kề, không liền kề, bỏ dòng ở giữa.
- Remap selection theo timestamp khi dữ liệu được tải lại.
- Mô phỏng Smart Pause từng frame ở 0.5x / 1x / 1.25x / 1.5x / 2x: dừng đúng một lần mỗi câu, không bao giờ sớm, trễ tối đa một frame, không dừng ở cuối cue A.
- Parse SRT/VTT.

## 2. Checklist thủ công (Chrome macOS + Tampermonkey + LR 5.1.8)

Chuẩn bị: cài script, mở một video có phụ đề người làm (ví dụ TED `https://www.youtube.com/watch?v=iG9CE55wbtY`), bật LR, mở panel Subtitles bên phải, **tắt auto-pause của LR**.

### Khởi động
- [ ] Thanh công cụ hiện đúng một lần, không che dòng transcript, từ điển hay thanh cuộn. Kéo được bằng thanh tiêu đề; vị trí được nhớ sau khi tải lại.
- [ ] Dòng nguồn ghi `Source: Language Reactor · N cues · M sentences`.
- [ ] ⚙ → *Copy diagnostics*: `sandbox.unsafeWindow = true`, `lr.windowLln = true`, `lr.status = "SUBS_LOADED"`, `panel.rowCountMatchesCues = true`.

### Smart Pause (tiêu chí 1, 4, 6)
- [ ] Bật Smart Pause. Phát qua một câu kéo dài 2 dòng (ví dụ "There have been three themes running through the conference," + "which are relevant to what I want to talk about."): video **không** dừng ở cuối dòng 1, và dừng ngay sau khi dòng 2 kết thúc.
- [ ] Lặp lại ở tốc độ 0.5x, 1.5x, 2x.
- [ ] Bấm dừng giữa câu, đợi 5 s: video không tự phát lại.
- [ ] Sau một lần tự dừng, bấm Play: video chạy tiếp và dừng ở cuối câu kế tiếp, không dừng lại ngay.
- [ ] Tắt Smart Pause: video chạy liên tục như bình thường.
- [ ] Seek vào giữa một câu: video dừng ở cuối câu đó.

### Chọn dòng và phát lại (tiêu chí 2, 3)
- [ ] Bấm **Select**: checkbox hiện trên mỗi dòng, nút play của LR bị ẩn.
- [ ] Click dòng A, Shift-click dòng C: A–C được tô viền cam; trạng thái `Selected: 3 cues (…)`. Video không nhảy.
- [ ] Click một dòng cách xa: vùng chọn mở rộng thành khoảng liên tục, kèm thông báo.
- [ ] Click dòng giữa của vùng chọn: bị từ chối kèm thông báo; click dòng đầu/cuối: vùng chọn thu lại.
- [ ] **Replay Selected**: phát từ đầu A, dừng ở cuối C (+150 ms), trạng thái về `Selected`.
- [ ] Bật **Loop** rồi phát lại: quay lại đầu A liên tục (`Looping ×n`) và không phát lấn sang dòng sau C.
- [ ] **Stop** khi đang lặp: video dừng ngay, không tự phát lại.
- [ ] Đang lặp, tắt Select rồi bấm một dòng LR ngoài khoảng: LR nhảy tới dòng đó, replay tự thoát kèm thông báo.
- [ ] Đang lặp, đổi tốc độ 0.5x/2x: vẫn lặp đúng khoảng.
- [ ] Nút "Line Pause": bật thì công tắc AP của LR bật và Smart Pause tắt; bật Smart Pause thì AP tắt; bấm Line Pause lần nữa thì cả hai tắt; bấm Q khi Smart Pause đang bật thì Smart Pause tự tắt kèm thông báo.
- [ ] Bật Smart Pause, để video dừng ở cuối một câu dài 2 dòng, bấm Z: phát lại cả 2 dòng từ đầu câu rồi dừng; bấm Z lần nữa vẫn đúng câu đó. Gõ "z" trong ô tìm kiếm không kích hoạt.
- [ ] Shift+R / Shift+L / Shift+X / Shift+S / Shift+E hoạt động; gõ các chữ này trong ô tìm kiếm hoặc bình luận YouTube không kích hoạt script. Space vẫn là phím của YouTube.

### Tương thích LR (tiêu chí 8)
- [ ] Khi đang ở chế độ chọn, click vào một từ thì từ điển LR mở và selection không đổi. Hover-dictionary, nút sao và menu của dòng vẫn dùng được.
- [ ] Tắt Select: click dòng LR phát dòng đó như bình thường; phím A/S/D/Q của LR hoạt động.
- [ ] Bật auto-pause LR (phím `Q`) khi Smart Pause đang bật: cảnh báo hiện ra; nút **Turn off LR auto-pause** tắt được nó.
- [ ] Bật auto-pause LR rồi Replay/Loop 3 dòng: phát liền mạch qua các dòng và quay lại đầu ở dòng cuối.

### Re-render và điều hướng (tiêu chí 5)
- [ ] Cuộn panel thật xa rồi quay lại: các dòng đã chọn vẫn được tô viền.
- [ ] Đóng panel LR (✕) rồi mở lại: selection vẫn còn; chỉ có một thanh công cụ.
- [ ] Click sang video khác (không tải lại trang): selection/replay bị xoá, nguồn cập nhật theo video mới, chỉ có một thanh công cụ. Bấm Back của trình duyệt: hoạt động tương tự.
- [ ] Đổi ngôn ngữ phụ đề trong LR khi đang chọn dòng: selection bị xoá kèm thông báo (hoặc được giữ nếu timestamp trùng).
- [ ] Rời sang trang chủ/Shorts: thanh công cụ ẩn.

### Trường hợp không có timing (tiêu chí 7)
- [ ] Video không có phụ đề: dòng nguồn ghi rõ "Video không có phụ đề…"; Replay/Phát lại câu bị vô hiệu; Shift+R hiện thông báo lý do.
- [ ] LR chưa chọn track: thông báo "Hãy chọn một track phụ đề…".
- [ ] Đang có quảng cáo: thông báo "Đang có quảng cáo…", script không seek/pause trong quảng cáo.
- [ ] Phụ đề tự động (không dấu câu): dòng nguồn có chú thích "không có dấu câu"; Smart Pause dừng theo khoảng lặng hoặc sau tối đa ~8 s.

## 3. Khi báo lỗi

Gửi kèm: URL video, kết quả `LRSR.diagnostics()` (DevTools Console) hoặc JSON từ *Copy diagnostics*, phiên bản Chrome/Tampermonkey/LR, và các bước tái hiện.
