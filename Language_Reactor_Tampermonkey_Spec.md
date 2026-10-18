# Project specification: Language Reactor Sentence Replay for YouTube

## 1. Goal

Build a **Tampermonkey userscript** that works alongside the **existing Language Reactor (LR) Chrome extension** on YouTube. Do not patch, repackage, or redistribute LR. The script should add two features:

1. **Smart Auto-Pause**: Pause at the end of a complete spoken sentence, rather than at the end of every subtitle segment.
2. **Multi-line Replay**: Select a continuous range of subtitle segments in LR's right-hand transcript panel and replay that exact time interval, once or in a loop.

Primary target: desktop Google Chrome on macOS, `https://www.youtube.com/watch*`. User interface can be in English or Vietnamese.

## 2. Available inputs

- Original installed LR extension archive: `5.1.8_0.zip` (provide this ZIP separately to the coding AI).
- LR version folder: `5.1.8_0/`.
- Relevant files observed in the archive: `manifest.json`, `content_youtube.js`, `pageScript_lly.min.js`, `pageScript_lln.min.js`, `pageScript_lla.min.js`, `side_panel.js`.
- A previous prototype may be available as `LanguageReactor_SentenceReplay.user.js`; treat it as an **unverified prototype**, not a proven solution.

**Important:** The archive contents have not been fully reverse-engineered. Do not assume a particular CSS selector, internal API, event format, or subtitle timestamp storage mechanism without inspecting the extension and validating in the browser.

## 3. Desired behavior

### 3.1 Smart Auto-Pause

Example subtitle cues:

- Cue A: `Ooh, bet you're salivating now,`
- Cue B: `just like one of Pavlov's dogs.`

Expected: continue playing at the end of cue A; pause **after cue B finishes**, not when cue B begins. Determine the end time from subtitle timing, not merely when a DOM text node changes.

Default sentence terminators: `.`, `?`, `!`, including trailing quotes/brackets. Commas, colons, and semicolons normally do not end sentences. Handle abbreviations, decimals, ellipses, missing punctuation, split subtitles, and punctuation inside quotes conservatively. This is a heuristic: provide manual controls or fallback when the actual sentence boundary is ambiguous. Prefer subtitle timing over `timeupdate` alone for accurate stopping.

The user should be able to toggle Smart Auto-Pause on/off independently from replay. Recommend disabling LR's own **Toggle auto-pause** while the script controls pauses, to avoid conflicts. If LR auto-pause is still enabled, detect or clearly warn about conflicts where feasible; do not repeatedly auto-resume against a user's deliberate pause.

### 3.2 Multi-line Replay

In LR's right-side transcript/script panel:

- Provide a nonintrusive way to select subtitle rows, ideally checkboxes or a selection mode.
- Support selecting one row or a **contiguous range** of rows (e.g. click first, Shift-click last). Noncontiguous selections should either be rejected with clear feedback or converted to the enclosing continuous interval; never silently jump between unrelated intervals.
- Show `Replay Selected`, `Loop`, `Stop`, `Clear Selection` controls.
- Replay from the selected first cue's `start` to the selected last cue's `end`, with an optional small adjustable tail buffer (default 0–200 ms).
- If Loop is on, seek back to start when the end boundary is reached. If off, pause at the end boundary.
- Manual Stop immediately ends replay mode and should not unexpectedly resume playback.
- Support selection persistence across panel re-renders during the same video, keyed by stable cue identity or timestamps rather than transient DOM nodes.
- Clear or appropriately restore selection when the YouTube video ID changes.

### 3.3 Controls and UX

- Prefer adding controls near LR's transcript panel; if this proves brittle, use a compact movable/floating toolbar while leaving LR intact.
- Visually highlight selected cues without obscuring translation text, dictionary popups, scrollbars, or existing LR controls.
- Provide clear status: `Idle`, `Selected: N cues`, `Replaying`, `Looping`, `Smart Pause ON`.
- Optional shortcuts must not hijack typing in inputs, search boxes, comments, or LR dictionary fields. Avoid overriding YouTube's Space shortcut by default.
- Save user preferences with `GM_setValue`/`GM_getValue` or another Tampermonkey-compatible storage mechanism.

## 4. Technical investigation required BEFORE implementation

1. Inspect the supplied LR 5.1.8 archive and identify how the YouTube transcript rows are rendered, how cue text and timing are represented, and whether usable timestamp attributes exist in the DOM.
2. Check whether LR transcript content is in the main document, shadow DOM, iframe, or extension-isolated context. Do not assume Tampermonkey can access extension-internal JavaScript state.
3. Validate selectors and interaction strategy against a **real YouTube video with LR enabled**. A static ZIP alone cannot prove runtime DOM structure.
4. Prefer public DOM/HTMLMediaElement interactions and minimal observation (`MutationObserver` with appropriate cleanup). Avoid modifying LR source files or calling undocumented internal APIs unless absolutely necessary.
5. If LR timestamps are not exposed, investigate a legitimate, maintainable fallback: YouTube's accessible timed-text data, captions exposed in the page, or a separate user-provided subtitle file. Do not claim a fallback works until tested. No login bypass, DRM circumvention, or CAPTCHA bypass.
6. YouTube uses SPA navigation: support `yt-navigate-finish`, video element replacement, caption changes, transcript panel reopening, and language switching.
7. Coordinate seek and pause logic with user interactions: manual pause, seek, playback rate, buffering, ads, video ending, and LR's existing shortcuts.
8. Avoid race conditions, overlapping event handlers, duplicate toolbars, and repeated observer initialization.

## 5. Suggested architecture

- `videoController`: discover the active `HTMLVideoElement`, manage seek/play/pause, track replay boundaries and user intent.
- `cueProvider`: obtain `{id, text, start, end}` cues with validated timing, sorted by start; report unavailable timestamps explicitly.
- `sentenceGrouper`: group adjacent cues into sentence-level intervals using punctuation heuristics and timing gaps, without assuming each cue is a full sentence.
- `transcriptIntegration`: discover LR panel rows, map them to cues, inject selection UI, and handle re-renders.
- `toolbar`: controls, status, settings.
- `lifecycle`: init/dispose and SPA navigation handling.

Implementation may be a single `.user.js` file; internal modules are conceptual only. Use `requestAnimationFrame`, `timeupdate`, or a hybrid for boundary checks; test tolerance at different playback rates. Avoid excessive DOM polling.

## 6. Important edge cases

- Subtitle text wraps onto multiple visual lines but is **one** cue.
- One sentence spans several cues; one cue may contain multiple sentences.
- Auto-generated captions omit punctuation or have imperfect timing.
- A cue ends in `Mr.`, `Dr.`, `e.g.`, `3.14`, or ellipsis.
- Transcript panel is closed or virtualized, so not all rows exist in DOM.
- User changes YouTube video without reloading the page.
- Caption language changes or subtitles are unavailable.
- Playback rate changes (0.5x–2x).
- User clicks a different timestamp while a loop is active.
- LR's own auto-pause is enabled.
- YouTube shows ads or switches video elements.

## 7. Acceptance criteria

1. With cue A `Ooh, bet you're salivating now,` and cue B `just like one of Pavlov's dogs.`, Smart Auto-Pause does not pause at A's end and pauses at B's end (within reasonable video timing tolerance).
2. User can select two or more adjacent LR transcript rows and replay the combined interval.
3. Loop continuously replays only the selected interval, and Stop exits the loop.
4. Toggling Smart Auto-Pause off returns ordinary YouTube/LR playback behavior (subject to LR's own settings).
5. No duplicated UI after opening/closing LR panel or navigating between YouTube videos.
6. Works with YouTube playback speed changes and does not unexpectedly resume user-paused videos.
7. On videos without usable caption timing, the script clearly reports why replay cannot start; no fabricated timing.
8. Existing LR translation, dictionary, and transcript navigation remain usable.

## 8. Deliverables for the coding AI

1. **Working installable `LanguageReactor_SentenceReplay.user.js`** with valid Tampermonkey metadata (`@match https://www.youtube.com/*`, correct run timing and grants).
2. A concise `README.md` explaining install, usage, LR Auto-pause setting, known limitations, and troubleshooting.
3. A brief technical report documenting **actual verified** DOM selectors/data sources for LR 5.1.8, plus any fallback.
4. Tests for sentence grouping and replay interval calculation; manual browser test checklist for YouTube + LR.
5. No requirement for a backend, paid API, or changes to the original extension.

## 9. Implementation order

- Phase 1: Inspect LR archive and runtime; prove access to cue text and timing.
- Phase 2: Implement selecting transcript rows and replaying a selected contiguous interval.
- Phase 3: Implement sentence grouping and Smart Auto-Pause.
- Phase 4: Add preferences, UX polish, and navigation/re-render resilience.

**Do not present the userscript as fully working until tested in the target browser with LR 5.1.8.** If runtime inspection is unavailable, deliver a clearly marked prototype and request a DOM snapshot or console diagnostics rather than inventing selectors.
