# Báo cáo kỹ thuật — tích hợp với Language Reactor 5.1.8 trên YouTube

Phương pháp: đọc tĩnh `5.1.8_0.zip` (manifest, `content_youtube.js`, `pageScript_lly.min.js`), sau đó xác minh runtime trên **Chrome for Testing 156** có nạp bản giải nén của LR 5.1.8 (profile tạm, chưa đăng nhập), với 3 video: `jNQXAC9IVRw` (6 cue), `iG9CE55wbtY` (TED, 427 cue có dấu câu), `RE3_PGwDwhw` (3224 cue, caption kiểu karaoke có ký tự zero-width). Userscript được nạp qua Chrome DevTools Protocol `Runtime.evaluate` ở page context, tương đương `@sandbox JavaScript` của Tampermonkey. **Chưa chạy thử qua Tampermonkey thật** (xem cuối báo cáo).

## 1. LR chạy ở đâu

| Mục | Kết quả | Bằng chứng |
|---|---|---|
| Content script | `content_youtube.js` (`all_frames`, `document_start`) chèn `<script src=chrome-extension://…/pageScript_lly.min.js>` vào frame top | tĩnh |
| Context của UI và state LR | **Main world của trang** (không phải isolated world, không iframe, không shadow DOM) | tĩnh + runtime: `#lln-vertical-view-subs.getRootNode() === document` |
| Global công khai | `window.lln = {rpc, setMan, bottomPanel, savedItems, playMan, ui, pureText, liMan, verticalView, vidMan, subManager, fullDict, hoverDict_verticalView, modal}`; `window.__LANGUAGE_REACTOR_EXTENSION__ = true` | tĩnh + runtime (đủ 14 key) |
| Trusted Types | LR tự tạo policy `dioco-policy`. Userscript **không dùng `innerHTML`**, chỉ dùng `createElement`/`textContent` | tĩnh |

## 2. Nguồn timing phụ đề (đã xác minh)

DOM **không** chứa timestamp. Nguồn duy nhất là state của LR:

```
window.lln.subManager.data            // getter webpack (live binding), đổi object mỗi lần tải
  .state      "LOADING" | "SUBS_LOADED" | "NOT_LOADED" | "IN_AD"
  .reason     (khi NOT_LOADED) "NO_SUBS_AVAILABLE" | "NO_SUBS_SELECTED" | "SUB_LOAD_ERROR"
  .mm.movieId video ID của YouTube (runtime: trùng ?v=)
  .tm         { langCode_G, langCode_YT, vssId, md5, isTranslatedTrack, … }
  .subtitles  [{ begin: ms, end: ms, text }]   // text có thể chứa "\n" và \u200B
```

- LR lấy phụ đề `json3` từ `/api/timedtext` (kèm token `pot` mà nó bắt được từ XHR của YouTube), parse trong hàm `we()`. Với ASR, LR gộp từng cặp event thành một cue và cắt chồng lấn (`e.end = next.tStartMs`).
- Userscript chỉ **đọc** `subManager.data`. Nó kiểm tra `mm.movieId === videoId` trong URL để không dùng phụ đề cũ sau khi điều hướng SPA, và kiểm tra `begin`/`end` là số hữu hạn với `end ≥ begin`. Nếu không thoả, script báo lỗi thay vì đoán.
- Phương án tự fetch `timedtext` bị loại: YouTube yêu cầu token `pot`, và LR đã làm việc này.
- Phương án dự phòng đã cài: nạp file `.srt`/`.vtt` do người dùng cung cấp (parser có unit test; chưa thử trên trình duyệt).

## 3. Panel transcript (đã xác minh)

| Selector | Ý nghĩa | Runtime |
|---|---|---|
| `.lln-vertical-view` | Panel bên phải; nằm trong `#full-bleed-container` | x=800, top=56 trong viewport 1200px |
| `#lln-vertical-view-subs` | Container các dòng của tab Subtitles | class `lln-styled-scrollbar lln-vertical-view-content scroll-event-added absolute` |
| `#lln-vertical-view-subs > .lln-vertical-view-sub[data-index=i]` | Một dòng = một cue; `i` là chỉ số trong `subMan.data.subtitles` | số dòng = số cue (6/6, 427/427) |
| `.lln-sub-play-btn`, `.lln-sub-text` | Con của dòng khi đã render | đúng |
| `.in-scroll` | Dòng đang render; dòng khác có `innerHTML = " "` và `display:none` (ảo hoá) | đúng |
| `#llnCloseVV`, `.lln-toggle-vertical-view` | Đóng/mở panel | container được giữ lại khi mở lại |
| `#autoPause` | Checkbox auto-pause của LR | có |
| `body[lln-player-state]` | `lln-auto-paused` khi LR tự dừng | xác nhận khi LR auto-pause |

Ràng buộc quan trọng rút ra từ source LR:

- LR highlight dòng đang phát bằng `container.children[n]`, nên **không được chèn phần tử nào trực tiếp vào `#lln-vertical-view-subs`**. Userscript chỉ thêm class vào dòng và chèn checkbox **bên trong** dòng (runtime: `nonRowChildren = 0`).
- LR thay `innerHTML` của dòng khi cuộn, nên checkbox bị xoá theo. Một `MutationObserver` duy nhất (trên container, gom xử lý theo `requestAnimationFrame`) gắn lại checkbox và class. Selection lưu theo chỉ số kèm khoá timestamp `begin:end`, không phụ thuộc node DOM.
- Click handler của LR được uỷ quyền qua jQuery ở tầng document. Userscript nghe `click` ở **window capture phase** và chỉ chặn khi chế độ chọn đang bật, target nằm trong dòng, và target không phải `.lln-word`/nút sao/menu. Nhờ vậy từ điển vẫn dùng được.

## 4. Auto-pause và phím tắt của LR

- Cài đặt auto-pause: `window.lln.setMan.get('autoPause')` (đây chính là `n(2).b` mà `playMan` dùng). Phím `Q` của LR gọi `setMan.set('autoPause', !…)`.
- LR có vòng `requestAnimationFrame` riêng: khi bật `autoPause`, nó dừng khi `currentTime > sub.end`. `vidMan` thao tác trực tiếp trên `HTMLVideoElement` (`ytd-player video`, bỏ qua `ytd-miniplayer`).
- Bộ nghe `keydown` của LR (capture, trên document) bỏ qua mọi phím khi có Shift/Ctrl/Meta, nhưng **không** bỏ qua Alt. Vì vậy phím tắt của userscript dùng Shift.
- Phát hiện quảng cáo: `.html5-video-player.ad-showing`, giống cách LR làm.

## 5. Kết quả đo runtime

| Kịch bản | Kết quả |
|---|---|
| Replay 3 cue không lặp (biên 14.517 ms) | dừng tại 14.515 ms |
| Loop (Shift+L, Shift+R) ~20 s | quay về 5.318 ms 2 lần; Stop (Shift+X) dừng và vẫn dừng sau 3 s |
| Smart Pause, câu 2 cue (`…conference,` + `…talk about.`), kỳ vọng 49.053 ms | 0.5x: 49.053 ms; 1x: 49.055 ms; không dừng ở cuối cue A |
| Smart Pause 2x, kỳ vọng 103.426 ms | 103.423 ms |
| Chọn dòng: click + Shift-click | chọn đúng 3 dòng; LR không phát; không bôi đen văn bản |
| Auto-pause LR bật + Replay/Loop | LR dừng ở mỗi cue, script phát tiếp; cue cuối → quay lại đầu (Looping ×3) |
| Nút "Turn off LR auto-pause" | `setMan.get('autoPause')` thành `false`, cảnh báo biến mất |
| Đóng/mở panel, cuộn | selection 5–7 được giữ; checkbox gắn lại |
| Click vào từ khi đang chọn | từ điển LR mở; selection không đổi |
| Bấm dòng LR ngoài khoảng trong lúc Loop | LR nhảy tới dòng đó; replay tự thoát kèm thông báo |
| Điều hướng SPA sang video khác | selection/replay reset; 1 toolbar, 1 style |
| Đang có quảng cáo | LR báo `SUB_LOAD_ERROR`; nút phát lại bị vô hiệu, có thông báo |
| Caption chứa `\u200B` | trước khi sửa bị nhận nhầm là track không dấu câu; đã sửa `cleanText` và thêm unit test |

## 6. Chưa xác minh

- Chạy qua **Tampermonkey thật** (giả định `@sandbox JavaScript` cho `unsafeWindow` là `window` của trang, và `GM_getValue`/`GM_setValue` hoạt động). Kiểm tra bằng ⚙ → *Copy diagnostics*: `sandbox.unsafeWindow` và `lr.windowLln` phải là `true`.
- Đổi ngôn ngữ phụ đề trong LR khi đã chọn dòng (logic remap theo timestamp đã có unit test).
- Profile LR đã đăng nhập, chế độ toàn màn hình, theater mode, Netflix (ngoài phạm vi).
- Phương án nạp file `.srt`/`.vtt` trên trình duyệt.
