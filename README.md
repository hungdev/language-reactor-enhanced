# LR Sentence Replay — Tampermonkey userscript for Language Reactor (YouTube)

**English** | [Tiếng Việt](README.vi.md)

A userscript that runs alongside the **Language Reactor (LR) 5.1.8** extension on YouTube, without modifying or repackaging LR. It adds two features:

1. **Smart Pause**: pauses at the end of a complete sentence (based on subtitle timing) instead of at the end of every subtitle line.
2. **Multi-line Replay**: select a contiguous range of rows in LR's transcript panel and replay it once or in a loop.

## Installation

1. Install Tampermonkey in Chrome (macOS). On Chrome MV3, enable **Developer mode** at `chrome://extensions` (or turn on "Allow User Scripts" in Tampermonkey's details page) so Tampermonkey is allowed to run userscripts.
2. Open Tampermonkey → *Create a new script* → paste the entire contents of `LanguageReactor_SentenceReplay.user.js` → Save. Alternatively, drag the `.user.js` file into a Chrome window to open Tampermonkey's install page.
3. Open a `https://www.youtube.com/watch?...` video, enable LR and pick a subtitle track. The **LR Sentence Replay** toolbar appears next to the transcript panel.

The script must run in the *page context* to read LR's subtitle data (`window.lln`). The metadata already declares `@sandbox JavaScript` and `@grant unsafeWindow`. If the toolbar says "LR is on the page but its data is not reachable", open Tampermonkey *Settings* (Config mode: Advanced), find the sandbox/injection option under Security and make sure it is not forced to `DOM` mode; then reload the page.

## Usage

| Control | Effect | Shortcut |
|---|---|---|
| **Select** | Toggle selection mode: shows a checkbox on each transcript row. Click to select, Shift-click to select a range | Shift+E |
| **Replay Selected** | Play from the start of the first row to the end of the last row (+ tail padding) | Shift+R |
| **Loop** | Toggle looping of the selected range | Shift+L |
| **Stop** | Exit replay/loop immediately and pause the video | Shift+X |
| **Clear Selection** | Clear the selection | |
| **Current sentence** | Select the sentence at the playhead and replay it (Shift+R does the same when nothing is selected) | |
| **Smart Pause** | Toggle pausing at the end of each sentence | Shift+S |
| ⚙ | Settings: tail padding, Smart Pause delay, gap threshold, max sentence length, shortcuts, EN/VI language, load subtitle file, copy diagnostics | |

Selection rules:

- The selection is always **contiguous**. Clicking a non-adjacent row extends it to the enclosing range and shows a notice.
- Only the first or last row of the range can be removed; removing a row in the middle is rejected with a notice.
- While selection mode is on, clicking a **word** still opens LR's dictionary; clicking elsewhere on the row selects it instead of playing it.
- While selection mode is off, LR behaves as usual; selected rows keep their orange outline.
- The selection survives LR re-rendering the panel (scrolling, closing/reopening the panel) and is cleared when the video or the subtitle track changes.

Shortcuts use **Shift** because LR ignores keys pressed with Shift, and YouTube does not use Shift+R/L/X/S/E. Shortcuts are ignored while typing in inputs, the search box, comments, LR's dictionary or LR's modals. The script does not take over the Space key.

## LR auto-pause

**Turn off LR's auto-pause** (the `Q` key or the toggle in LR) when using Smart Pause, because LR pauses at every subtitle line. If LR auto-pause is on while Smart Pause or Replay is active, the toolbar shows a warning with a **Turn off LR auto-pause** button.

During a replay, the *"Ignore LR auto-pause inside a replay"* setting (on by default) lets the script resume playback when LR itself pauses at the end of a line inside the selected range. The script only does this when LR marks the pause as automatic (`body[lln-player-state="lln-auto-paused"]`) and the playhead is right at the end of a cue. A pause made by the user is never resumed automatically.

## Known limitations

- The timing source is LR's internal state (`window.lln.subManager.data`), which is not a public API. An LR update may change this structure. The script reports a clear error instead of guessing timing.
- Smart Pause is a punctuation-based heuristic. A cue containing several sentences (e.g. `"Yes. I think"`) cannot be paused mid-cue because there is no word-level timing; the script pauses at the end of the next sentence that ends on a cue boundary.
- Auto-generated (ASR) subtitles have no punctuation: the script falls back to splitting on silence gaps (≥ 800 ms) and a maximum sentence length (8 s).
- With a fallback `.srt`/`.vtt` file loaded, only Smart Pause and "Current sentence" are available. Selecting rows in the panel requires LR's subtitles (row indices map 1:1 to LR's subtitle array).
- Mid-roll ads swap the video source, so the replay stops; replay again after the ad.
- Only desktop `youtube.com/watch` pages are supported (no Shorts, embeds or miniplayer).

## Troubleshooting

- **Toolbar not visible**: it only appears on `/watch`. Check that the script is enabled in Tampermonkey and that Chrome allows userscripts.
- **"Language Reactor not detected"**: LR is not enabled or has not finished loading on this tab; reload the page.
- **"Choose a subtitle track"** / **"This video has no subtitles"**: pick subtitles in LR; videos without subtitles cannot be replayed (the script never invents timing).
- **Other errors**: ⚙ → **Copy diagnostics**, or run `LRSR.diagnostics()` in the DevTools Console, and attach the JSON to your bug report.

## Testing

- Logic tests (Node ≥ 18): `node --test tests/core.test.js`
- Manual checklist on YouTube + LR: see `TESTING.md`.
- Technical report (verified selectors and data sources): see `TECHNICAL_REPORT.md`.
