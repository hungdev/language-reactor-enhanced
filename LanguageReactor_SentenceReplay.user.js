// ==UserScript==
// @name         Language Reactor – Sentence Replay & Smart Auto-Pause
// @name:vi      Language Reactor – Phát lại câu & Tự dừng thông minh
// @namespace    https://local.userscripts/lr-sentence-replay
// @version      1.4.0
// @description  Sentence-level Smart Auto-Pause and multi-line replay/loop for Language Reactor's YouTube transcript panel (built against LR 5.1.8). Does not modify the extension.
// @description:vi Tự dừng ở cuối câu và chọn nhiều dòng phụ đề trong panel transcript của Language Reactor để phát lại/lặp (LR 5.1.8). Không sửa extension.
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @noframes
// @sandbox      JavaScript
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const Core = (function () {
    const CLOSERS = '"\'”’»)]}›」』';
    const OPENERS_RE = /^[\s"'“‘«(\[¿¡\-–—♪]+/;
    const STRONG_END = '?!？！。';
    const ABBREVIATIONS = new Set([
      'mr', 'mrs', 'ms', 'mx', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'mt', 'ft', 'gen', 'col', 'lt', 'sgt',
      'capt', 'rev', 'hon', 'gov', 'sen', 'rep', 'pres', 'inc', 'ltd', 'co', 'corp', 'no', 'vol', 'approx',
      'dept', 'est', 'fig', 'cf', 'al', 'ave', 'blvd', 'rd', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug',
      'sep', 'sept', 'oct', 'nov', 'dec', 'p', 'pp', 'ch', 'sec', 'min', 'max',
    ]);
    const NEVER_END_ACRONYMS = new Set(['e.g', 'i.e', 'a.k.a', 'viz']);
    const SOUND_TAG_RE = /^\s*(\[[^\]]*\]|\([^)]*\)|♪[^♪]*♪?|♪+)\s*$/;

    function cleanText(text) {
      return String(text == null ? '' : text)
        .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function stripClosers(text) {
      let t = cleanText(text);
      while (t && CLOSERS.includes(t[t.length - 1])) t = t.slice(0, -1).trimEnd();
      return t;
    }

    function isSoundTag(text) {
      return SOUND_TAG_RE.test(cleanText(text));
    }

    function leadingInfo(text) {
      const t = cleanText(text).replace(OPENERS_RE, '');
      const ch = t.charAt(0);
      return {
        ch,
        upper: !!ch && ch !== ch.toLowerCase() && ch === ch.toUpperCase(),
        lower: !!ch && ch !== ch.toUpperCase() && ch === ch.toLowerCase(),
        digit: /\d/.test(ch),
      };
    }

    function hasTerminalPunctuation(text) {
      const t = stripClosers(text);
      if (!t) return false;
      const last = t[t.length - 1];
      return STRONG_END.includes(last) || last === '.' || last === '…';
    }

    function classifyEnding(text, nextText) {
      const t = stripClosers(text);
      if (!t) return 'continue';
      if (isSoundTag(text)) return 'end';
      const hasNext = nextText != null;
      if (hasNext && isSoundTag(nextText)) return 'end';
      const next = hasNext ? leadingInfo(nextText) : null;
      const last = t[t.length - 1];

      if (STRONG_END.includes(last)) return 'end';

      if (last === '…' || t.endsWith('..')) {
        if (!next) return 'end';
        return next.upper ? 'end' : 'continue';
      }

      if (last !== '.') return 'continue';

      if (/\d\.$/.test(t) && next && next.digit) return 'continue';

      const rawToken = t.split(' ').pop() || '';
      const token = rawToken.replace(/^[^A-Za-z0-9\u00C0-\uFFFF]+/, '');
      const core = token.replace(/\.$/, '');
      const lower = core.toLowerCase();

      if (NEVER_END_ACRONYMS.has(lower)) return 'continue';
      if (ABBREVIATIONS.has(lower)) return 'continue';
      if (/^[A-Z]$/.test(core) && next && next.upper) return 'continue';
      if (/^([a-z]\.)+[a-z]$/i.test(core)) {
        if (!next) return 'end';
        return next.upper ? 'end' : 'continue';
      }
      if (lower === 'etc') {
        if (!next) return 'end';
        return next.upper ? 'end' : 'continue';
      }
      if (next && next.lower) return 'continue';
      return 'end';
    }

    function detectPunctuation(cues) {
      let considered = 0;
      let punctuated = 0;
      for (const c of cues) {
        if (isSoundTag(c.text) || !cleanText(c.text)) continue;
        considered++;
        if (hasTerminalPunctuation(c.text)) punctuated++;
      }
      const ratio = considered ? punctuated / considered : 0;
      return { considered, punctuated, ratio };
    }

    const INSTANT_CUE_MS = 20;

    function isInstantCue(c) {
      return c.end - c.begin < INSTANT_CUE_MS;
    }

    const DEFAULT_GROUP_OPTS = {
      gapBreakMs: 2000,
      maxSentenceMs: 15000,
      unpunctuatedGapMs: 800,
      unpunctuatedMaxMs: 8000,
      minPunctuationRatio: 0.15,
    };

    function groupSentences(cues, options) {
      const o = Object.assign({}, DEFAULT_GROUP_OPTS, options || {});
      const stats = detectPunctuation(cues || []);
      const punctuated = stats.considered < 4 ? stats.punctuated > 0 : stats.ratio >= o.minPunctuationRatio;
      const groups = [];
      if (!cues || !cues.length) return { groups, punctuated, stats };
      let first = 0;
      let nextReal = -1;
      for (let i = 0; i < cues.length; i++) {
        const cue = cues[i];
        const next = cues[i + 1];
        let reason = null;
        if (!next) {
          reason = 'last';
        } else if (!isInstantCue(cue)) {
          if (nextReal <= i) {
            nextReal = i + 1;
            while (nextReal < cues.length && isInstantCue(cues[nextReal])) nextReal++;
          }
          const gap = next.begin - cue.end;
          const ending = classifyEnding(cue.text, (cues[nextReal] || next).text);
          if (punctuated) {
            if (ending === 'end') reason = 'punct';
            else if (gap >= o.gapBreakMs) reason = 'gap';
          } else if (ending === 'end' && STRONG_END.includes(stripClosers(cue.text).slice(-1))) {
            reason = 'punct';
          } else if (gap >= o.unpunctuatedGapMs) {
            reason = 'gap';
          }
          if (!reason) {
            const maxMs = punctuated ? o.maxSentenceMs : o.unpunctuatedMaxMs;
            if (next.end - cues[first].begin > maxMs) reason = 'max';
          }
        }
        if (reason) {
          groups.push({ first, last: i, start: cues[first].begin, end: cue.end, reason });
          first = i + 1;
        }
      }
      for (let k = 0; k < groups.length; k++) groups[k].nextStart = k + 1 < groups.length ? groups[k + 1].start : null;
      return { groups, punctuated, stats };
    }

    function lastIndexStartingBefore(items, t, key) {
      const k = key || 'start';
      let lo = 0;
      let hi = items.length - 1;
      let ans = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (items[mid][k] <= t) {
          ans = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return ans;
    }

    function findGroupAt(groups, t) {
      if (!groups || !groups.length) return -1;
      const i = lastIndexStartingBefore(groups, t);
      return i < 0 ? 0 : i;
    }

    function findCueAt(cues, t) {
      if (!cues || !cues.length) return -1;
      const i = lastIndexStartingBefore(cues, t, 'begin');
      return i < 0 ? 0 : i;
    }

    const ARM_LOOKAHEAD_MS = 300;
    const ARM_MIN_REMAINING_MS = 150;
    const NEXT_CUE_MARGIN_MS = 20;

    function tailBoundary(end, tailMs, nextStart) {
      const b = end + (tailMs || 0);
      if (nextStart == null || !Number.isFinite(nextStart)) return b;
      return Math.min(b, Math.max(nextStart, end) - NEXT_CUE_MARGIN_MS);
    }

    function groupBoundary(g, tailMs) {
      return tailBoundary(g.end, tailMs, g.nextStart);
    }

    function findArmableGroup(groups, t, tailMs) {
      if (!groups || !groups.length) return -1;
      const armable = (i) => i >= 0 && i < groups.length && t < groupBoundary(groups[i], tailMs) - ARM_MIN_REMAINING_MS;
      const cur = lastIndexStartingBefore(groups, t);
      if (armable(cur)) return cur;
      const next = cur + 1;
      if (next < groups.length && groups[next].start - ARM_LOOKAHEAD_MS <= t && armable(next)) return next;
      return -1;
    }

    function createSmartPauser() {
      let armed = -1;
      return {
        get armed() {
          return armed;
        },
        reset() {
          armed = -1;
        },
        step(groups, t, tailMs) {
          const tail = tailMs || 0;
          if (armed >= 0) {
            const g = groups[armed];
            if (!g || t < g.start - 600 || t > g.end + tail + 800) {
              armed = -1;
            } else {
              const boundary = groupBoundary(g, tail);
              if (t >= boundary) {
                const gi = armed;
                armed = -1;
                return { pause: true, group: gi, boundary };
              }
              return { pause: false, group: armed, boundary };
            }
          }
          const gi = findArmableGroup(groups, t, tail);
          if (gi >= 0) {
            armed = gi;
            return { pause: false, group: gi, boundary: groupBoundary(groups[gi], tail) };
          }
          return { pause: false, group: -1, boundary: null };
        },
      };
    }

    function computeReplayInterval(cues, a, b, options) {
      const o = options || {};
      if (!Array.isArray(cues) || !cues.length) return { ok: false, error: 'NO_CUES' };
      if (!Number.isInteger(a) || !Number.isInteger(b)) return { ok: false, error: 'OUT_OF_RANGE' };
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      if (lo < 0 || hi >= cues.length) return { ok: false, error: 'OUT_OF_RANGE' };
      for (let i = lo; i <= hi; i++) {
        const c = cues[i];
        if (!c || !Number.isFinite(c.begin) || !Number.isFinite(c.end) || c.end < c.begin) {
          return { ok: false, error: 'BAD_TIMING' };
        }
      }
      const tail = Math.min(Math.max(Number(o.tailMs) || 0, 0), 1000);
      const start = Math.max(0, cues[lo].begin);
      const following = cues[hi + 1];
      let end = tailBoundary(cues[hi].end, tail, following && Number.isFinite(following.begin) ? following.begin : null);
      if (Number.isFinite(o.durationMs) && o.durationMs > 0) end = Math.min(end, o.durationMs);
      if (end - start < 50) return { ok: false, error: 'TOO_SHORT' };
      return { ok: true, lo, hi, start, end };
    }

    function replayAction(t, interval, loop) {
      if (t < interval.start - 500 || t > interval.end + 1500) return 'outside';
      if (t >= interval.end) return loop ? 'loop' : 'stop';
      return null;
    }

    function clampAnchor(sel) {
      if (!sel) return null;
      const anchor = Math.min(Math.max(sel.anchor, sel.lo), sel.hi);
      return { lo: sel.lo, hi: sel.hi, anchor };
    }

    function applySelectionClick(sel, idx, opts) {
      const shift = !!(opts && opts.shift);
      if (!sel) return { sel: { lo: idx, hi: idx, anchor: idx }, notice: null };
      if (shift) {
        const a = sel.anchor;
        return { sel: { lo: Math.min(a, idx), hi: Math.max(a, idx), anchor: a }, notice: null };
      }
      if (idx >= sel.lo && idx <= sel.hi) {
        if (sel.lo === sel.hi) return { sel: null, notice: null };
        if (idx === sel.lo) return { sel: clampAnchor({ lo: idx + 1, hi: sel.hi, anchor: sel.anchor }), notice: null };
        if (idx === sel.hi) return { sel: clampAnchor({ lo: sel.lo, hi: idx - 1, anchor: sel.anchor }), notice: null };
        return { sel, notice: 'MIDDLE_REMOVE_REJECTED' };
      }
      const next = { lo: Math.min(sel.lo, idx), hi: Math.max(sel.hi, idx), anchor: sel.anchor };
      const adjacent = idx === sel.lo - 1 || idx === sel.hi + 1;
      return { sel: next, notice: adjacent ? null : 'EXTENDED_TO_RANGE' };
    }

    function cueKey(c) {
      return c ? c.begin + ':' + c.end : '';
    }

    function remapSelection(sel, cues) {
      if (!sel || !Array.isArray(cues) || !cues.length) return null;
      const find = (key, hint) => {
        if (cues[hint] && cueKey(cues[hint]) === key) return hint;
        for (let i = 0; i < cues.length; i++) if (cueKey(cues[i]) === key) return i;
        return -1;
      };
      const lo = find(sel.loKey, sel.lo);
      const hi = find(sel.hiKey, sel.hi);
      if (lo < 0 || hi < 0 || hi < lo) return null;
      const shift = lo - sel.lo;
      return Object.assign(clampAnchor({ lo, hi, anchor: sel.anchor + shift }), { loKey: sel.loKey, hiKey: sel.hiKey });
    }

    function normalizeCues(raw) {
      if (!Array.isArray(raw)) return { ok: false, cues: [], error: 'NOT_ARRAY' };
      const cues = new Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        const s = raw[i] || {};
        const begin = Number(s.begin);
        const end = Number(s.end);
        if (!Number.isFinite(begin) || !Number.isFinite(end) || end < begin || begin < 0) {
          return { ok: false, cues: [], error: 'BAD_TIMING', index: i };
        }
        cues[i] = { idx: i, begin, end, text: cleanText(s.text) };
      }
      return { ok: true, cues };
    }

    const TS_RE = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

    function parseTimestamp(s) {
      const m = TS_RE.exec(s);
      if (!m) return NaN;
      const h = m[1] ? parseInt(m[1], 10) : 0;
      const ms = parseInt((m[4] + '00').slice(0, 3), 10);
      return ((h * 60 + parseInt(m[2], 10)) * 60 + parseInt(m[3], 10)) * 1000 + ms;
    }

    function parseSubtitleFile(text) {
      const src = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
      const blocks = src.split(/\n{2,}/);
      const cues = [];
      for (const block of blocks) {
        const lines = block.split('\n');
        const ti = lines.findIndex((l) => l.includes('-->'));
        if (ti < 0) continue;
        const parts = lines[ti].split('-->');
        const begin = parseTimestamp(parts[0]);
        const end = parseTimestamp(parts[1] || '');
        if (!Number.isFinite(begin) || !Number.isFinite(end) || end < begin) continue;
        const body = lines
          .slice(ti + 1)
          .join(' ')
          .replace(/<[^>]+>/g, '')
          .replace(/\{\\[^}]*\}/g, '');
        const t = cleanText(body);
        if (!t) continue;
        cues.push({ begin, end, text: t });
      }
      cues.sort((x, y) => x.begin - y.begin);
      return cues.map((c, i) => ({ idx: i, begin: c.begin, end: c.end, text: c.text }));
    }

    return {
      cleanText,
      stripClosers,
      isSoundTag,
      hasTerminalPunctuation,
      classifyEnding,
      detectPunctuation,
      groupSentences,
      findGroupAt,
      findCueAt,
      findArmableGroup,
      tailBoundary,
      createSmartPauser,
      computeReplayInterval,
      replayAction,
      applySelectionClick,
      remapSelection,
      cueKey,
      normalizeCues,
      parseTimestamp,
      parseSubtitleFile,
      DEFAULT_GROUP_OPTS,
    };
  })();

  if (typeof module === 'object' && module && module.exports) {
    module.exports = Core;
    return;
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const VERSION = '1.4.0';
  const PAGE = typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window;
  try {
    if (PAGE.__LRSR_ACTIVE__) return;
    PAGE.__LRSR_ACTIVE__ = VERSION;
  } catch (_) {}
  const log = (...args) => console.log('[LRSR]', ...args);

  const Store = {
    get(key, def) {
      try {
        if (typeof GM_getValue === 'function') {
          const v = GM_getValue(key);
          return v === undefined ? def : v;
        }
      } catch (_) {}
      try {
        const raw = localStorage.getItem('lrsr:' + key);
        return raw == null ? def : JSON.parse(raw);
      } catch (_) {
        return def;
      }
    },
    set(key, val) {
      try {
        if (typeof GM_setValue === 'function') {
          GM_setValue(key, val);
          return;
        }
      } catch (_) {}
      try {
        localStorage.setItem('lrsr:' + key, JSON.stringify(val));
      } catch (_) {}
    },
  };

  const DEFAULT_PREFS = {
    smartPause: false,
    loop: false,
    replayTailMs: 150,
    smartTailMs: 80,
    gapBreakMs: Core.DEFAULT_GROUP_OPTS.gapBreakMs,
    maxSentenceMs: Core.DEFAULT_GROUP_OPTS.maxSentenceMs,
    shortcuts: true,
    overrideLrAutoPause: true,
    lang: 'auto',
    collapsed: false,
    toolbarPos: null,
  };

  function loadPrefs() {
    const saved = Store.get('prefs', null);
    return Object.assign({}, DEFAULT_PREFS, saved && typeof saved === 'object' ? saved : {});
  }

  function savePrefs() {
    Store.set('prefs', S.prefs);
  }

  const I18N = {
    en: {
      title: 'LR Sentence Replay',
      idle: 'Idle',
      selected: 'Selected: {n} cues',
      replaying: 'Replaying',
      looping: 'Looping ×{n}',
      smartOn: 'Smart Pause ON',
      select: 'Select',
      selectTip: 'Selection mode: click rows (Shift-click for a range) in the LR transcript. Shift+E',
      replay: 'Replay Selected',
      replayTip: 'Replay the selected interval. Shift+R (Z or Shift+R replays the current sentence when nothing is selected)',
      loop: 'Loop',
      loopTip: 'Loop the selected interval. Shift+L',
      stop: 'Stop',
      stopTip: 'Stop replay/loop. Shift+X',
      clear: 'Clear Selection',
      sentence: '↺ Replay sentence',
      sentenceTip: 'Replay the sentence Smart Pause just stopped at (or the sentence at the playhead). Key: Z',
      smartPaused: 'Sentence end · Z to replay',
      smart: 'Smart Pause',
      smartTip: 'Pause at the end of each complete sentence. Shift+S',
      line: 'Line Pause',
      lineTip: 'LR built-in auto-pause: pause at the end of every subtitle line (same as LR “AP”, Q key). Turns Smart Pause off',
      lineOn: 'Line Pause ON',
      pauseOff: 'Auto-pause OFF',
      smartOffForLine: 'LR auto-pause was turned on: Smart Pause turned off (only one pause mode at a time).',
      settings: 'Settings',
      collapse: 'Collapse/expand',
      lrWarn: 'LR auto-pause is ON: it pauses at every subtitle line and conflicts with Smart Pause/Replay.',
      lrFix: 'Turn off LR auto-pause',
      lrFixFailed: 'Could not change LR auto-pause. Press Q (LR shortcut) or untick it in LR.',
      srcLr: 'Source: Language Reactor · {n} cues · {g} sentences{p}',
      srcFile: 'Source: file “{name}” · {n} cues · {g} sentences{p}',
      noPunct: ' · no punctuation (timing heuristic)',
      lrNotFound: 'Language Reactor not detected. Is the extension enabled on this page?',
      lrInaccessible: 'LR is on the page but its data is not reachable. Make sure Tampermonkey runs this script with @sandbox JavaScript (page context).',
      lrNoData: 'Language Reactor has not initialised subtitles yet.',
      lrWaiting: 'Language Reactor found; reading its subtitle data… Press play for a moment if this stays.',
      loading: 'Language Reactor is loading subtitles…',
      noSubs: 'This video has no subtitles: no timing is available, replay cannot start.',
      noSubsSelected: 'Choose a subtitle track in Language Reactor first.',
      subLoadError: 'Language Reactor failed to load subtitles (use LR “Try again”).',
      inAd: 'An ad is playing: replay and Smart Pause are suspended.',
      stale: 'Waiting for Language Reactor to load subtitles for this video…',
      badTiming: 'Subtitle timing from LR is invalid; refusing to guess.',
      unknownState: 'Subtitles unavailable (LR state: {s}).',
      noVideo: 'No YouTube video element found.',
      selectFirst: 'Select one or more transcript rows first (turn on “Select”).',
      extended: 'Non-adjacent row: selection extended to the continuous range {a}–{b}.',
      middleReject: 'Only the first or last row of a range can be removed. Use Clear Selection to start over.',
      seekOut: 'Replay stopped: playback jumped outside the selected range.',
      trackChanged: 'Subtitle track changed: selection cleared.',
      fileRows: 'Row selection needs LR subtitles. With a file loaded, use “Replay sentence” and Smart Pause.',
      errNO_CUES: 'No subtitle timing available.',
      errOUT_OF_RANGE: 'Selection no longer matches the subtitles. Select again.',
      errBAD_TIMING: 'Selected cues have invalid timing.',
      errTOO_SHORT: 'Selected interval is too short.',
      replayEnded: 'Replay finished.',
      videoEnded: 'Video ended: replay stopped.',
      sTail: 'Replay tail buffer (ms)',
      sSmartTail: 'Smart Pause delay after sentence end (ms)',
      sGap: 'Silence that forces a sentence break (ms)',
      sMax: 'Maximum sentence length before forced pause (ms)',
      sShortcuts: 'Keyboard shortcuts (Z, Shift+R/L/X/S/E)',
      sOverride: 'Ignore LR auto-pause inside a replay',
      sLang: 'Language',
      sFile: 'Load .srt/.vtt for this video (fallback)',
      sFileClear: 'Use LR subtitles again',
      sDiag: 'Copy diagnostics',
      sResetPos: 'Reset toolbar position',
      fileLoaded: 'Loaded {n} cues from “{name}” for this video.',
      fileEmpty: 'No cues found in that file.',
      diagCopied: 'Diagnostics copied to clipboard (also printed to console).',
      diagConsole: 'Diagnostics printed to console (clipboard unavailable).',
      autoLang: 'Auto',
    },
    vi: {
      title: 'LR Phát lại câu',
      idle: 'Rảnh',
      selected: 'Đã chọn: {n} dòng',
      replaying: 'Đang phát lại',
      looping: 'Đang lặp ×{n}',
      smartOn: 'Tự dừng câu: BẬT',
      select: 'Chọn',
      selectTip: 'Chế độ chọn: bấm vào dòng (Shift-click để chọn khoảng) trong transcript LR. Shift+E',
      replay: 'Phát đoạn chọn',
      replayTip: 'Phát lại khoảng đã chọn. Shift+R (Z hoặc Shift+R phát câu hiện tại nếu chưa chọn)',
      loop: 'Lặp',
      loopTip: 'Lặp khoảng đã chọn. Shift+L',
      stop: 'Dừng',
      stopTip: 'Dừng phát lại/lặp. Shift+X',
      clear: 'Bỏ chọn',
      sentence: '↺ Phát lại câu',
      sentenceTip: 'Phát lại câu mà Tự dừng câu vừa dừng (hoặc câu tại vị trí đang phát). Phím: Z',
      smartPaused: 'Hết câu · bấm Z để nghe lại',
      smart: 'Tự dừng câu',
      smartTip: 'Dừng ở cuối mỗi câu hoàn chỉnh. Shift+S',
      line: 'Dừng mỗi dòng',
      lineTip: 'Auto-pause có sẵn của LR: dừng ở cuối mỗi dòng phụ đề (giống nút “AP” của LR, phím Q). Bật lên sẽ tắt Tự dừng câu',
      lineOn: 'Dừng mỗi dòng: BẬT',
      pauseOff: 'Tự dừng: TẮT',
      smartOffForLine: 'Auto-pause của LR vừa được bật: đã tắt Tự dừng câu (mỗi lúc chỉ dùng một chế độ dừng).',
      settings: 'Cài đặt',
      collapse: 'Thu gọn/mở rộng',
      lrWarn: 'Auto-pause của LR đang BẬT: nó dừng ở mọi dòng phụ đề và xung đột với Tự dừng câu/Phát lại.',
      lrFix: 'Tắt auto-pause của LR',
      lrFixFailed: 'Không đổi được auto-pause của LR. Nhấn Q (phím tắt LR) hoặc bỏ tick trong LR.',
      srcLr: 'Nguồn: Language Reactor · {n} dòng · {g} câu{p}',
      srcFile: 'Nguồn: file “{name}” · {n} dòng · {g} câu{p}',
      noPunct: ' · không có dấu câu (dùng khoảng lặng)',
      lrNotFound: 'Không phát hiện Language Reactor. Extension đã bật trên trang này chưa?',
      lrInaccessible: 'LR có trên trang nhưng không đọc được dữ liệu. Hãy đảm bảo Tampermonkey chạy script với @sandbox JavaScript (page context).',
      lrNoData: 'Language Reactor chưa khởi tạo phụ đề.',
      lrWaiting: 'Đã thấy Language Reactor; đang đọc dữ liệu phụ đề… Nếu thông báo này không mất, hãy bấm phát video một lúc.',
      loading: 'Language Reactor đang tải phụ đề…',
      noSubs: 'Video không có phụ đề: không có timing nên không thể phát lại.',
      noSubsSelected: 'Hãy chọn một track phụ đề trong Language Reactor trước.',
      subLoadError: 'Language Reactor không tải được phụ đề (dùng nút “Try again” của LR).',
      inAd: 'Đang có quảng cáo: tạm ngưng phát lại và tự dừng.',
      stale: 'Đang chờ Language Reactor tải phụ đề của video này…',
      badTiming: 'Timing phụ đề từ LR không hợp lệ; không tự đoán.',
      unknownState: 'Không có phụ đề (trạng thái LR: {s}).',
      noVideo: 'Không tìm thấy video YouTube.',
      selectFirst: 'Hãy chọn một hoặc nhiều dòng transcript trước (bật “Chọn”).',
      extended: 'Dòng không liền kề: đã mở rộng thành khoảng liên tục {a}–{b}.',
      middleReject: 'Chỉ bỏ được dòng đầu hoặc cuối của khoảng. Dùng “Bỏ chọn” để chọn lại.',
      seekOut: 'Đã dừng phát lại: vị trí phát nhảy ra ngoài khoảng đã chọn.',
      trackChanged: 'Track phụ đề đã đổi: đã bỏ chọn.',
      fileRows: 'Chọn dòng cần phụ đề của LR. Khi dùng file, hãy dùng “Phát lại câu” và Tự dừng câu.',
      errNO_CUES: 'Không có timing phụ đề.',
      errOUT_OF_RANGE: 'Vùng chọn không còn khớp với phụ đề. Hãy chọn lại.',
      errBAD_TIMING: 'Các dòng đã chọn có timing không hợp lệ.',
      errTOO_SHORT: 'Khoảng đã chọn quá ngắn.',
      replayEnded: 'Đã phát lại xong.',
      videoEnded: 'Video kết thúc: đã dừng phát lại.',
      sTail: 'Đệm cuối khi phát lại (ms)',
      sSmartTail: 'Độ trễ tự dừng sau cuối câu (ms)',
      sGap: 'Khoảng lặng buộc ngắt câu (ms)',
      sMax: 'Độ dài câu tối đa trước khi buộc dừng (ms)',
      sShortcuts: 'Phím tắt (Z, Shift+R/L/X/S/E)',
      sOverride: 'Bỏ qua auto-pause của LR trong lúc phát lại',
      sLang: 'Ngôn ngữ',
      sFile: 'Nạp .srt/.vtt cho video này (dự phòng)',
      sFileClear: 'Dùng lại phụ đề của LR',
      sDiag: 'Sao chép chẩn đoán',
      sResetPos: 'Đặt lại vị trí thanh công cụ',
      fileLoaded: 'Đã nạp {n} dòng từ “{name}” cho video này.',
      fileEmpty: 'Không tìm thấy dòng phụ đề nào trong file.',
      diagCopied: 'Đã sao chép chẩn đoán (cũng in ra console).',
      diagConsole: 'Đã in chẩn đoán ra console (không truy cập được clipboard).',
      autoLang: 'Tự động',
    },
  };

  function lang() {
    if (S.prefs.lang === 'en' || S.prefs.lang === 'vi') return S.prefs.lang;
    const l = (document.documentElement.getAttribute('lang') || navigator.language || 'en').toLowerCase();
    return l.startsWith('vi') ? 'vi' : 'en';
  }

  function t(key, vars) {
    const dict = I18N[lang()] || I18N.en;
    let s = dict[key] != null ? dict[key] : I18N.en[key] != null ? I18N.en[key] : key;
    if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  }

  const S = {
    prefs: loadPrefs(),
    videoId: null,
    video: null,
    cueSource: 'NONE',
    cues: [],
    groups: [],
    punctuated: true,
    trackKey: null,
    lrDataRef: null,
    lrDataLen: 0,
    lrStatus: { code: 'INIT' },
    file: null,
    selection: null,
    selectMode: false,
    replay: null,
    smart: Core.createSmartPauser(),
    lastSmartPause: null,
    expectSeek: null,
    ourPauseUntil: 0,
    lastOverrideAt: 0,
    lastLrAutoPause: null,
    stats: { ticks: 0, lastTickAt: 0, timeupdateEvals: 0, smartPauses: 0, smartOffBySync: 0 },
    raf: 0,
    boundaryTimer: 0,
    maintTimer: 0,
  };

  function isWatchPage() {
    return location.pathname === '/watch';
  }

  function currentVideoId() {
    if (!isWatchPage()) return null;
    try {
      return new URLSearchParams(location.search).get('v');
    } catch (_) {
      return null;
    }
  }

  function fmtTime(ms) {
    if (!Number.isFinite(ms)) return '–';
    const total = Math.max(0, ms) / 1000;
    const m = Math.floor(total / 60);
    const s = total - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  function clamp(v, lo, hi) {
    return Math.min(Math.max(v, lo), hi);
  }

  // ---------------------------------------------------------------- video

  function findVideo() {
    const players = Array.from(document.getElementsByTagName('ytd-player')).filter((p) => !p.closest('ytd-miniplayer'));
    const player = players.find((p) => p.closest('ytd-watch-flexy')) || players[0] || null;
    let v = null;
    if (player) v = player.querySelector('video') || (player.shadowRoot && player.shadowRoot.querySelector('video'));
    if (!v) v = document.querySelector('#movie_player video');
    return v || null;
  }

  function isAdShowing(v) {
    const p = (v && v.closest('.html5-video-player')) || document.getElementById('movie_player');
    return !!(p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')));
  }

  const VIDEO_EVENTS = ['play', 'playing', 'pause', 'seeking', 'ratechange', 'ended', 'emptied', 'timeupdate'];

  function bindVideo(v) {
    if (v === S.video) return;
    if (S.video) for (const ev of VIDEO_EVENTS) S.video.removeEventListener(ev, onVideoEvent);
    cancelLoop();
    S.video = v;
    S.smart.reset();
    if (v) {
      for (const ev of VIDEO_EVENTS) v.addEventListener(ev, onVideoEvent);
      ensureLoop();
    }
  }

  function onVideoEvent(e) {
    switch (e.type) {
      case 'play':
      case 'playing':
        ensureLoop();
        updateUI();
        break;
      case 'pause':
        onPause();
        break;
      case 'seeking':
        onSeeking();
        break;
      case 'ratechange':
        clearBoundaryTimer();
        break;
      case 'ended':
        if (S.replay) {
          finishReplay();
          toast(t('videoEnded'));
        }
        break;
      case 'emptied':
        if (S.replay) finishReplay();
        S.smart.reset();
        break;
      case 'timeupdate': {
        const v = S.video;
        if (!v || v.paused || v.ended || !needsLoop()) break;
        S.stats.timeupdateEvals++;
        evaluate(v);
        ensureLoop();
        break;
      }
    }
  }

  function playVideo() {
    const v = S.video;
    if (!v) return;
    try {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}
  }

  function pauseVideo() {
    const v = S.video;
    if (!v) return;
    S.ourPauseUntil = performance.now() + 500;
    v.pause();
  }

  function seekTo(ms) {
    const v = S.video;
    if (!v) return;
    clearBoundaryTimer();
    S.expectSeek = { target: ms, until: performance.now() + 2000 };
    v.currentTime = ms / 1000;
  }

  function onSeeking() {
    clearBoundaryTimer();
    const v = S.video;
    if (!v) return;
    const now = v.currentTime * 1000;
    const exp = S.expectSeek;
    if (exp && performance.now() < exp.until && Math.abs(now - exp.target) < 400) {
      S.expectSeek = null;
      return;
    }
    S.smart.reset();
    S.lastSmartPause = null;
    if (S.replay && (now < S.replay.start - 500 || now > S.replay.end + 200)) {
      finishReplay();
      toast(t('seekOut'));
    }
  }

  function isLrAutoHold() {
    return !!document.body && document.body.getAttribute('lln-player-state') === 'lln-auto-paused';
  }

  function nearCueEnd(ms) {
    const i = Core.findCueAt(S.cues, ms);
    for (const j of [i - 1, i, i + 1]) {
      const c = S.cues[j];
      if (c && ms >= c.end - 80 && ms <= c.end + 250) return true;
    }
    return false;
  }

  function onPause() {
    clearBoundaryTimer();
    const v = S.video;
    const ours = performance.now() < S.ourPauseUntil;
    if (!ours && v && S.replay && S.prefs.overrideLrAutoPause && isLrAutoHold() && nearCueEnd(v.currentTime * 1000)) {
      const now = v.currentTime * 1000;
      const lastCue = S.cues[S.replay.hi];
      const atFinalCue = !!lastCue && now >= lastCue.end - 80;
      if (performance.now() - S.lastOverrideAt > 300) {
        S.lastOverrideAt = performance.now();
        if (!atFinalCue) {
          playVideo();
          return;
        }
        if (S.prefs.loop) {
          S.replay.loops++;
          seekTo(S.replay.start);
          playVideo();
          updateUI();
          return;
        }
        finishReplay();
        toast(t('replayEnded'));
        return;
      }
    }
    updateUI();
  }

  // ------------------------------------------------------- playback loop

  function needsLoop() {
    return !!S.replay || (S.prefs.smartPause && S.groups.length > 0);
  }

  function ensureLoop() {
    if (!S.raf && S.video && !S.video.paused && needsLoop()) S.raf = requestAnimationFrame(tick);
  }

  function cancelLoop() {
    if (S.raf) cancelAnimationFrame(S.raf);
    S.raf = 0;
    clearBoundaryTimer();
  }

  function clearBoundaryTimer() {
    if (S.boundaryTimer) clearTimeout(S.boundaryTimer);
    S.boundaryTimer = 0;
  }

  function tick() {
    S.raf = 0;
    const v = S.video;
    if (!v || v.paused || v.ended || !needsLoop()) {
      clearBoundaryTimer();
      return;
    }
    S.raf = requestAnimationFrame(tick);
    S.stats.ticks++;
    S.stats.lastTickAt = performance.now();
    evaluate(v);
  }

  function scheduleBoundary(boundary, now, rate) {
    const remaining = (boundary - now) / rate;
    if (remaining > 0 && remaining < 45 && !S.boundaryTimer) {
      S.boundaryTimer = setTimeout(() => {
        S.boundaryTimer = 0;
        const v = S.video;
        if (v && !v.paused) evaluate(v);
      }, Math.max(0, remaining - 3));
    }
  }

  function evaluate(v) {
    if (isAdShowing(v)) return;
    const now = v.currentTime * 1000;
    const rate = v.playbackRate || 1;
    const lead = 3 * rate;
    if (S.replay) {
      const r = S.replay;
      const action = Core.replayAction(now + lead, r, S.prefs.loop);
      if (action === 'loop') {
        r.loops++;
        seekTo(r.start);
        updateUI();
      } else if (action === 'stop') {
        pauseVideo();
        finishReplay();
        toast(t('replayEnded'));
      } else if (action === 'outside') {
        finishReplay();
        toast(t('seekOut'));
      } else {
        scheduleBoundary(r.end, now, rate);
      }
      return;
    }
    if (S.prefs.smartPause && S.groups.length) {
      const res = S.smart.step(S.groups, now + lead, S.prefs.smartTailMs);
      if (res.pause) {
        S.stats.smartPauses++;
        pauseVideo();
        S.lastSmartPause = { group: res.group, at: now };
        updateUI();
      } else if (res.boundary != null) {
        scheduleBoundary(res.boundary, now, rate);
      }
    }
  }

  // --------------------------------------------------------- cue provider

  function getLln() {
    try {
      return PAGE.lln || null;
    } catch (_) {
      return null;
    }
  }

  const LR_STATES = new Set(['SUBS_LOADED', 'LOADING', 'SUBS_LOADING', 'NOT_LOADED', 'IN_AD']);

  function isLrSubData(v) {
    return !!v && typeof v === 'object' && typeof v.state === 'string' && LR_STATES.has(v.state) && ('subtitles' in v || 'reason' in v || 'mm' in v);
  }

  const MOBX = { atom: null, trapped: false, captures: 0 };

  function mobxGlobals() {
    try {
      const g = PAGE.__mobxGlobals;
      return g && typeof g === 'object' ? g : null;
    } catch (_) {
      return null;
    }
  }

  function installMobxProbe() {
    if (MOBX.atom && isLrSubData(MOBX.atom.value_)) return;
    MOBX.atom = null;
    if (MOBX.trapped) return;
    const g = mobxGlobals();
    if (!g) return;
    const desc = Object.getOwnPropertyDescriptor(g, 'trackingDerivation');
    if (!desc || !('value' in desc) || !desc.configurable) return;
    let cur = desc.value;
    const seen = new WeakSet();
    const restore = () => {
      Object.defineProperty(g, 'trackingDerivation', { value: cur, writable: true, configurable: true, enumerable: desc.enumerable });
      MOBX.trapped = false;
    };
    const inspect = (d) => {
      if (!d || typeof d !== 'object' || seen.has(d)) return;
      seen.add(d);
      for (const list of [d.newObserving_, d.observing_]) {
        if (!Array.isArray(list)) continue;
        for (const a of list) {
          if (a && typeof a === 'object' && 'value_' in a && isLrSubData(a.value_)) {
            MOBX.atom = a;
            MOBX.captures++;
            restore();
            return;
          }
        }
      }
    };
    Object.defineProperty(g, 'trackingDerivation', {
      configurable: true,
      enumerable: desc.enumerable,
      get() {
        return cur;
      },
      set(v) {
        const prev = cur;
        cur = v;
        if (prev && prev !== v && !MOBX.atom) {
          try {
            inspect(prev);
          } catch (_) {}
        }
      },
    });
    MOBX.trapped = true;
  }

  function lrPresent() {
    try {
      if (PAGE.__LANGUAGE_REACTOR_EXTENSION__) return true;
    } catch (_) {}
    return !!document.querySelector('.lln-vertical-view, #lln-main-subs, .lln-bottom-panel');
  }

  function readLrData() {
    const lln = getLln();
    if (lln && lln.subManager) {
      try {
        return { source: 'lln', data: lln.subManager.data };
      } catch (_) {
        return { source: 'lln', error: true };
      }
    }
    installMobxProbe();
    if (MOBX.atom) return { source: 'mobx', data: MOBX.atom.value_ };
    return { source: null };
  }

  function readLr() {
    const src = readLrData();
    if (src.error) return { status: 'LR_INACCESSIBLE' };
    if (!src.source) return { status: lrPresent() ? 'LR_WAITING' : 'LR_NOT_FOUND' };
    const d = src.data;
    if (!d || typeof d !== 'object') return { status: 'LR_NO_DATA' };
    if (d.state === 'SUBS_LOADED' && Array.isArray(d.subtitles)) return { status: 'SUBS_LOADED', data: d };
    return { status: d.state || 'UNKNOWN', reason: d.reason || null };
  }

  function groupOpts() {
    return { gapBreakMs: S.prefs.gapBreakMs, maxSentenceMs: S.prefs.maxSentenceMs };
  }

  function refreshCues(force) {
    const vid = S.videoId;
    if (S.file && S.file.videoId === vid) {
      S.lrStatus = { code: 'OK' };
      applyCues('FILE', S.file.cues, 'FILE|' + vid + '|' + S.file.name + '|' + S.file.cues.length, force);
      return;
    }
    const r = readLr();
    if (r.status !== 'SUBS_LOADED') {
      S.lrStatus = { code: r.status, reason: r.reason || null };
      S.lrDataRef = null;
      if (S.cueSource !== 'NONE') applyCues('NONE', [], null, false);
      return;
    }
    const d = r.data;
    if (!force && d === S.lrDataRef && d.subtitles.length === S.lrDataLen && S.cueSource === 'LR') return;
    const movieId = d.mm && d.mm.movieId;
    if (vid && movieId && movieId !== vid) {
      S.lrStatus = { code: 'STALE' };
      S.lrDataRef = null;
      if (S.cueSource !== 'NONE') applyCues('NONE', [], null, false);
      return;
    }
    const built = Core.normalizeCues(d.subtitles);
    if (!built.ok) {
      S.lrStatus = { code: 'BAD_TIMING' };
      S.lrDataRef = null;
      applyCues('NONE', [], null, false);
      return;
    }
    S.lrDataRef = d;
    S.lrDataLen = d.subtitles.length;
    S.lrStatus = { code: 'OK' };
    const tm = d.tm || {};
    const key = ['LR', movieId || vid || '', tm.vssId || '', tm.langCode_YT || '', tm.langCode_G || '', tm.md5 || '', built.cues.length].join('|');
    applyCues('LR', built.cues, key, force);
  }

  function applyCues(source, cues, key, regroup) {
    const sameTrack = key === S.trackKey && source === S.cueSource;
    S.cueSource = source;
    S.cues = cues;
    if (sameTrack && !regroup) return;
    const res = Core.groupSentences(cues, groupOpts());
    S.groups = res.groups;
    S.punctuated = res.punctuated;
    if (!sameTrack) {
      const hadKey = S.trackKey;
      S.trackKey = key;
      S.smart.reset();
      S.lastSmartPause = null;
      if (S.selection) {
        const m = Core.remapSelection(S.selection, cues);
        if (m) {
          S.selection = m;
        } else {
          S.selection = null;
          if (hadKey) toast(t('trackChanged'));
        }
      }
    }
    scheduleDecorate();
    updateUI();
    ensureLoop();
  }

  function cueUnavailableMessage() {
    const st = S.lrStatus || {};
    if (S.video && isAdShowing(S.video)) return t('inAd');
    switch (st.code) {
      case 'LR_NOT_FOUND':
        return t('lrNotFound');
      case 'LR_INACCESSIBLE':
        return t('lrInaccessible');
      case 'LR_WAITING':
        return t('lrWaiting');
      case 'LR_NO_DATA':
        return t('lrNoData');
      case 'LOADING':
      case 'SUBS_LOADING':
        return t('loading');
      case 'IN_AD':
        return t('inAd');
      case 'STALE':
        return t('stale');
      case 'BAD_TIMING':
        return t('badTiming');
      case 'NOT_LOADED':
        if (st.reason === 'NO_SUBS_AVAILABLE') return t('noSubs');
        if (st.reason === 'NO_SUBS_SELECTED') return t('noSubsSelected');
        if (st.reason === 'SUB_LOAD_ERROR') return t('subLoadError');
        return t('unknownState', { s: 'NOT_LOADED/' + (st.reason || '?') });
      default:
        return t('unknownState', { s: st.code || '?' });
    }
  }

  // ------------------------------------------------------- LR auto-pause

  function lrAutoPauseEnabled() {
    const lln = getLln();
    try {
      if (lln && lln.setMan && typeof lln.setMan.get === 'function') return !!lln.setMan.get('autoPause');
    } catch (_) {}
    const el = document.getElementById('autoPause');
    return el ? !!el.checked : null;
  }

  function setLrAutoPause(on) {
    const v = S.video;
    const wasPaused = !!v && v.paused;
    if (wasPaused) {
      const keepPaused = () => {
        if (S.video === v && !v.paused) pauseVideo();
      };
      for (const ms of [0, 60, 200, 400]) setTimeout(keepPaused, ms);
    }
    const el = document.getElementById('autoPause');
    if (el && el.checked !== on) el.click();
    if (lrAutoPauseEnabled() !== on) {
      try {
        const lln = getLln();
        if (lln && lln.setMan && typeof lln.setMan.set === 'function') lln.setMan.set('autoPause', on);
      } catch (_) {}
    }
    S.lastLrAutoPause = on;
    setTimeout(() => {
      if (lrAutoPauseEnabled() !== on) toast(t('lrFixFailed'));
      updateUI();
    }, 150);
  }

  function disableLrAutoPause() {
    setLrAutoPause(false);
  }

  function toggleLinePause() {
    const on = lrAutoPauseEnabled() !== true;
    if (on && S.prefs.smartPause) setSmart(false);
    setLrAutoPause(on);
    updateUI();
  }

  function syncPauseModes() {
    const lr = lrAutoPauseEnabled();
    if (lr === true && S.lastLrAutoPause === false && S.prefs.smartPause) {
      S.stats.smartOffBySync++;
      setSmart(false);
      toast(t('smartOffForLine'));
    }
    if (lr != null) S.lastLrAutoPause = lr;
  }

  // ------------------------------------------------------------ selection

  function setSelection(sel) {
    if (sel) {
      S.selection = { lo: sel.lo, hi: sel.hi, anchor: sel.anchor, loKey: Core.cueKey(S.cues[sel.lo]), hiKey: Core.cueKey(S.cues[sel.hi]) };
    } else {
      S.selection = null;
    }
    if (S.replay) {
      if (!S.selection) {
        finishReplay();
      } else {
        const v = S.video;
        const iv = Core.computeReplayInterval(S.cues, S.selection.lo, S.selection.hi, {
          tailMs: S.prefs.replayTailMs,
          durationMs: v && Number.isFinite(v.duration) ? v.duration * 1000 : null,
        });
        if (iv.ok) {
          Object.assign(S.replay, { start: iv.start, end: iv.end, lo: iv.lo, hi: iv.hi });
          const now = v ? v.currentTime * 1000 : iv.start;
          if (now < iv.start - 500 || now > iv.end) seekTo(iv.start);
        } else {
          finishReplay();
        }
      }
    }
    scheduleDecorate();
    updateUI();
  }

  function handleRowSelect(idx, shift) {
    refreshCues(false);
    if (S.cueSource !== 'LR') {
      toast(S.cueSource === 'FILE' ? t('fileRows') : cueUnavailableMessage());
      return;
    }
    if (!S.cues[idx]) return;
    const r = Core.applySelectionClick(S.selection, idx, { shift });
    setSelection(r.sel);
    if (r.notice === 'EXTENDED_TO_RANGE') toast(t('extended', { a: r.sel.lo + 1, b: r.sel.hi + 1 }));
    else if (r.notice === 'MIDDLE_REMOVE_REJECTED') toast(t('middleReject'));
  }

  function clearSelection() {
    setSelection(null);
  }

  // --------------------------------------------------------------- replay

  function startReplay() {
    refreshCues(false);
    if (!S.selection) {
      if (!S.video) return toast(t('noVideo'));
      if (!S.cues.length) return toast(cueUnavailableMessage());
      return toast(t('selectFirst'));
    }
    startReplayRange(S.selection.lo, S.selection.hi);
  }

  function startReplayRange(lo, hi) {
    const v = S.video;
    if (!v) return toast(t('noVideo'));
    if (isAdShowing(v)) return toast(t('inAd'));
    if (!S.cues.length) return toast(cueUnavailableMessage());
    const iv = Core.computeReplayInterval(S.cues, lo, hi, {
      tailMs: S.prefs.replayTailMs,
      durationMs: Number.isFinite(v.duration) ? v.duration * 1000 : null,
    });
    if (!iv.ok) return toast(t('err' + iv.error));
    S.replay = { start: iv.start, end: iv.end, lo: iv.lo, hi: iv.hi, loops: 0 };
    S.smart.reset();
    seekTo(iv.start);
    playVideo();
    ensureLoop();
    scheduleDecorate();
    updateUI();
  }

  function finishReplay() {
    S.replay = null;
    clearBoundaryTimer();
    S.smart.reset();
    scheduleDecorate();
    updateUI();
  }

  function stopReplay() {
    if (!S.replay) return;
    finishReplay();
    pauseVideo();
  }

  function replayCurrentSentence() {
    refreshCues(false);
    const v = S.video;
    if (!v) return toast(t('noVideo'));
    if (!S.cues.length || !S.groups.length) return toast(cueUnavailableMessage());
    const now = v.currentTime * 1000;
    const recent = recentSmartPauseGroup(now);
    const gi = recent != null ? recent : Core.findGroupAt(S.groups, now);
    const g = S.groups[gi];
    if (!g) return toast(t('errNO_CUES'));
    startReplayRange(g.first, g.last);
  }

  function recentSmartPauseGroup(now) {
    const lsp = S.lastSmartPause;
    const g = lsp && S.groups[lsp.group];
    if (!g || now < g.start - 200 || now > g.end + 2500) return null;
    return lsp.group;
  }

  function toggleLoop() {
    S.prefs.loop = !S.prefs.loop;
    savePrefs();
    updateUI();
  }

  function toggleSmart() {
    setSmart(!S.prefs.smartPause);
    if (S.prefs.smartPause && lrAutoPauseEnabled() === true) setLrAutoPause(false);
  }

  function setSmart(on) {
    S.prefs.smartPause = on;
    savePrefs();
    S.smart.reset();
    S.lastSmartPause = null;
    if (on) refreshCues(false);
    ensureLoop();
    updateUI();
  }

  function toggleSelectMode() {
    S.selectMode = !S.selectMode;
    if (S.selectMode) refreshCues(false);
    scheduleDecorate();
    updateUI();
  }

  // -------------------------------------------------- transcript panel

  const TI = { container: null, observer: null, scheduled: 0 };

  function attachTranscript() {
    const c = document.getElementById('lln-vertical-view-subs');
    if (c === TI.container && (!c || c.isConnected)) return;
    if (TI.observer) TI.observer.disconnect();
    TI.observer = null;
    TI.container = c && c.isConnected ? c : null;
    if (!TI.container) return;
    TI.observer = new MutationObserver(scheduleDecorate);
    TI.observer.observe(TI.container, { childList: true, subtree: true });
    scheduleDecorate();
  }

  function scheduleDecorate() {
    if (TI.scheduled) return;
    TI.scheduled = requestAnimationFrame(() => {
      TI.scheduled = 0;
      decorate();
    });
  }

  function rowSelector(i) {
    return ':scope > .lln-vertical-view-sub[data-index="' + i + '"]';
  }

  function decorate() {
    const c = TI.container;
    if (document.body) document.body.classList.toggle('lrsr-select-mode', S.selectMode && S.cueSource === 'LR');
    if (!c || !c.isConnected) return;
    const sel = S.cueSource === 'LR' ? S.selection || S.replay : null;

    for (const row of c.querySelectorAll(':scope > .lln-vertical-view-sub.lrsr-selected')) {
      const i = parseInt(row.getAttribute('data-index'), 10);
      if (!sel || !(i >= sel.lo && i <= sel.hi)) row.classList.remove('lrsr-selected', 'lrsr-sel-first', 'lrsr-sel-last');
    }
    if (sel) {
      for (let i = sel.lo; i <= sel.hi; i++) {
        const row = c.querySelector(rowSelector(i));
        if (!row) continue;
        row.classList.add('lrsr-selected');
        row.classList.toggle('lrsr-sel-first', i === sel.lo);
        row.classList.toggle('lrsr-sel-last', i === sel.hi);
      }
    }

    if (S.selectMode && S.cueSource === 'LR') {
      const rows = c.classList.contains('absolute')
        ? c.querySelectorAll(':scope > .lln-vertical-view-sub.in-scroll[data-index]')
        : c.querySelectorAll(':scope > .lln-vertical-view-sub[data-index]');
      for (const row of rows) {
        if (!row.querySelector(':scope > .lln-sub-text')) continue;
        let cb = row.querySelector(':scope > .lrsr-cb');
        if (!cb) {
          cb = document.createElement('span');
          cb.className = 'lrsr-cb';
          cb.setAttribute('role', 'checkbox');
          row.appendChild(cb);
        }
        const i = parseInt(row.getAttribute('data-index'), 10);
        const own = S.selection;
        const checked = !!own && i >= own.lo && i <= own.hi ? 'true' : 'false';
        if (cb.getAttribute('aria-checked') !== checked) cb.setAttribute('aria-checked', checked);
      }
    } else {
      for (const cb of c.querySelectorAll('.lrsr-cb')) cb.remove();
    }
  }

  function rowFromEvent(e) {
    const c = TI.container;
    if (!c || !S.selectMode || S.cueSource !== 'LR') return null;
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return null;
    const row = target.closest('.lln-vertical-view-sub[data-index]');
    if (!row || row.parentElement !== c) return null;
    if (!target.closest('.lrsr-cb') && target.closest('.lln-word, .lln-star-sub-btn, .lln-sub-menu-btn, a, button, input')) return null;
    return row;
  }

  function onClickCapture(e) {
    if (e.button !== 0) return;
    const row = rowFromEvent(e);
    if (!row) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    handleRowSelect(parseInt(row.getAttribute('data-index'), 10), e.shiftKey);
  }

  function onMouseDownCapture(e) {
    if (e.button !== 0 || !e.shiftKey) return;
    if (rowFromEvent(e)) e.preventDefault();
  }

  // ------------------------------------------------------------ keyboard

  function isEditableTarget(e) {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
    const el = path[0] instanceof Element ? path[0] : e.target instanceof Element ? e.target : null;
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (!['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(type)) return true;
    }
    return !!el.closest('[contenteditable=""], [contenteditable="true"], .lln-full-dict, .lln-modal, #lln-options-modal, #lrsr-toolbar input');
  }

  function onKeyDown(e) {
    if (!S.prefs.shortcuts || !isWatchPage()) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (!e.shiftKey && e.code !== 'KeyZ') return;
    if (isEditableTarget(e)) return;
    let handled = true;
    switch (e.code) {
      case 'KeyZ':
        if (e.shiftKey) handled = false;
        else if (S.selection) startReplay();
        else replayCurrentSentence();
        break;
      case 'KeyR':
        if (S.selection) startReplay();
        else replayCurrentSentence();
        break;
      case 'KeyL':
        toggleLoop();
        break;
      case 'KeyX':
        stopReplay();
        break;
      case 'KeyS':
        toggleSmart();
        break;
      case 'KeyE':
        toggleSelectMode();
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }

  // -------------------------------------------------------------- toolbar

  const CSS = `
#lrsr-toolbar{position:fixed;left:0;top:0;z-index:2100;min-width:250px;max-width:360px;box-sizing:border-box;
  font:12px/1.35 Roboto,Arial,sans-serif;color:#eee;background:rgba(22,22,28,.95);border:1px solid #4a4a55;
  border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.45);user-select:none;-webkit-user-select:none}
#lrsr-toolbar[hidden]{display:none}
#lrsr-toolbar .lrsr-head{display:flex;align-items:center;gap:6px;padding:4px 6px;cursor:move;border-bottom:1px solid #333}
#lrsr-toolbar .lrsr-title{font-weight:600;color:#f5a623;white-space:nowrap}
#lrsr-toolbar .lrsr-status{flex:1;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#ddd}
#lrsr-toolbar .lrsr-body{padding:4px 5px 5px}
#lrsr-toolbar.lrsr-collapsed .lrsr-body{display:none}
#lrsr-toolbar .lrsr-row{display:flex;flex-wrap:wrap;gap:4px;margin:2px 0}
#lrsr-toolbar button{font:inherit;color:#eee;background:#2c2c34;border:1px solid #4a4a55;border-radius:5px;padding:3px 7px;cursor:pointer}
#lrsr-toolbar button:hover:not(:disabled){background:#3a3a44}
#lrsr-toolbar button:disabled{opacity:.4;cursor:default}
#lrsr-toolbar button[aria-pressed="true"]{background:#6b4500;border-color:#f5a623;color:#fff}
#lrsr-toolbar .lrsr-icon{padding:1px 6px;background:transparent;border-color:transparent}
#lrsr-toolbar .lrsr-src{color:#9a9aa6;font-size:11px;margin-top:3px}
#lrsr-toolbar .lrsr-warn{display:none;margin-top:4px;padding:4px 6px;border-radius:5px;background:#4a2a00;color:#ffd28a}
#lrsr-toolbar .lrsr-warn.on{display:block}
#lrsr-toolbar .lrsr-warn button{margin-top:3px}
#lrsr-toolbar .lrsr-toast{display:none;margin-top:4px;padding:4px 6px;border-radius:5px;background:#1d3a55;color:#d6ecff}
#lrsr-toolbar .lrsr-toast.on{display:block}
#lrsr-toolbar .lrsr-settings{display:none;margin-top:5px;padding-top:5px;border-top:1px solid #333}
#lrsr-toolbar .lrsr-settings.on{display:block}
#lrsr-toolbar label{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:3px 0}
#lrsr-toolbar input[type=number]{width:70px;font:inherit;color:#eee;background:#1b1b21;border:1px solid #4a4a55;border-radius:4px;padding:1px 4px}
#lrsr-toolbar select{font:inherit;color:#eee;background:#1b1b21;border:1px solid #4a4a55;border-radius:4px}
#lln-vertical-view-subs .lln-vertical-view-sub.lrsr-selected{box-shadow:inset 4px 0 0 #f5a623;background-color:rgba(245,166,35,.12)}
#lln-vertical-view-subs .lln-vertical-view-sub.lrsr-selected.lrsr-sel-first{box-shadow:inset 4px 0 0 #f5a623,inset 0 1px 0 rgba(245,166,35,.6)}
#lln-vertical-view-subs .lln-vertical-view-sub.lrsr-selected.lrsr-sel-last{box-shadow:inset 4px 0 0 #f5a623,inset 0 -1px 0 rgba(245,166,35,.6)}
#lln-vertical-view-subs .lln-vertical-view-sub.lrsr-selected.lrsr-sel-first.lrsr-sel-last{box-shadow:inset 4px 0 0 #f5a623,inset 0 1px 0 rgba(245,166,35,.6),inset 0 -1px 0 rgba(245,166,35,.6)}
body.lrsr-select-mode #lln-vertical-view-subs .lln-vertical-view-sub{cursor:pointer}
body.lrsr-select-mode #lln-vertical-view-subs .lln-sub-play-btn{visibility:hidden}
#lln-vertical-view-subs .lrsr-cb{position:absolute;left:6px;top:50%;transform:translateY(-50%);width:15px;height:15px;box-sizing:border-box;
  border:2px solid #f5a623;border-radius:3px;background:transparent;cursor:pointer;z-index:2}
#lln-vertical-view-subs .lrsr-cb[aria-checked="true"]{background:#f5a623}
#lln-vertical-view-subs .lrsr-cb[aria-checked="true"]::after{content:"";position:absolute;left:3px;top:0;width:4px;height:8px;border:solid #1a1a1a;border-width:0 2px 2px 0;transform:rotate(45deg)}
`;

  const UI = { root: null, x: null, y: null, toastTimer: 0, els: {} };

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const ch of children || []) if (ch) node.appendChild(ch);
    return node;
  }

  function injectStyle() {
    if (document.getElementById('lrsr-style')) return;
    const style = document.createElement('style');
    style.id = 'lrsr-style';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function numberSetting(labelKey, prefKey, min, max, step, onChange) {
    const input = el('input', { type: 'number', min, max, step });
    input.value = S.prefs[prefKey];
    input.addEventListener('change', () => {
      const v = clamp(Math.round(Number(input.value) || 0), min, max);
      input.value = v;
      S.prefs[prefKey] = v;
      savePrefs();
      if (onChange) onChange();
    });
    return el('label', null, [el('span', { 'data-i18n': labelKey }), input]);
  }

  function checkboxSetting(labelKey, prefKey) {
    const input = el('input', { type: 'checkbox' });
    input.checked = !!S.prefs[prefKey];
    input.addEventListener('change', () => {
      S.prefs[prefKey] = input.checked;
      savePrefs();
    });
    return el('label', null, [el('span', { 'data-i18n': labelKey }), input]);
  }

  function buildToolbar() {
    const existing = document.getElementById('lrsr-toolbar');
    if (existing) existing.remove();
    const E = UI.els;
    const btn = (key, tipKey, onclick) => el('button', { type: 'button', 'data-i18n': key, 'data-i18n-title': tipKey, onclick });

    E.status = el('span', { class: 'lrsr-status' });
    E.collapse = el('button', { type: 'button', class: 'lrsr-icon', 'data-i18n-title': 'collapse', text: S.prefs.collapsed ? '▸' : '▾', onclick: toggleCollapsed });
    const head = el('div', { class: 'lrsr-head' }, [el('span', { class: 'lrsr-title', 'data-i18n': 'title' }), E.status, E.collapse]);

    E.select = btn('select', 'selectTip', toggleSelectMode);
    E.replay = btn('replay', 'replayTip', startReplay);
    E.loop = btn('loop', 'loopTip', toggleLoop);
    E.stop = btn('stop', 'stopTip', stopReplay);
    E.clear = btn('clear', null, clearSelection);
    E.sentence = btn('sentence', 'sentenceTip', replayCurrentSentence);
    E.smart = btn('smart', 'smartTip', toggleSmart);
    E.line = btn('line', 'lineTip', toggleLinePause);
    E.gear = el('button', { type: 'button', class: 'lrsr-icon', 'data-i18n-title': 'settings', text: '⚙', onclick: () => E.settings.classList.toggle('on') });

    E.warn = el('div', { class: 'lrsr-warn' }, [el('div', { 'data-i18n': 'lrWarn' }), btn('lrFix', null, disableLrAutoPause)]);
    E.toast = el('div', { class: 'lrsr-toast', role: 'status' });
    E.src = el('div', { class: 'lrsr-src' });

    E.langSelect = el('select', null, [
      el('option', { value: 'auto', 'data-i18n': 'autoLang' }),
      el('option', { value: 'en', text: 'English' }),
      el('option', { value: 'vi', text: 'Tiếng Việt' }),
    ]);
    E.langSelect.value = S.prefs.lang;
    E.langSelect.addEventListener('change', () => {
      S.prefs.lang = E.langSelect.value;
      savePrefs();
      applyI18n();
      updateUI();
    });

    E.fileInput = el('input', { type: 'file', accept: '.srt,.vtt,text/vtt', style: 'display:none' });
    E.fileInput.addEventListener('change', onFileChosen);
    E.fileClear = btn('sFileClear', null, () => {
      S.file = null;
      refreshCues(true);
    });

    const regroup = () => refreshCues(true);
    E.settings = el('div', { class: 'lrsr-settings' }, [
      numberSetting('sTail', 'replayTailMs', 0, 1000, 10),
      numberSetting('sSmartTail', 'smartTailMs', -100, 600, 10),
      numberSetting('sGap', 'gapBreakMs', 300, 10000, 100, regroup),
      numberSetting('sMax', 'maxSentenceMs', 2000, 60000, 500, regroup),
      checkboxSetting('sShortcuts', 'shortcuts'),
      checkboxSetting('sOverride', 'overrideLrAutoPause'),
      el('label', null, [el('span', { 'data-i18n': 'sLang' }), E.langSelect]),
      el('div', { class: 'lrsr-row' }, [btn('sFile', null, () => E.fileInput.click()), E.fileClear, E.fileInput]),
      el('div', { class: 'lrsr-row' }, [
        btn('sDiag', null, copyDiagnostics),
        btn('sResetPos', null, () => {
          S.prefs.toolbarPos = null;
          savePrefs();
          positionToolbar(true);
        }),
      ]),
    ]);

    const body = el('div', { class: 'lrsr-body' }, [
      el('div', { class: 'lrsr-row' }, [E.select, E.replay, E.loop, E.stop, E.clear]),
      el('div', { class: 'lrsr-row' }, [E.sentence, E.smart, E.line, E.gear]),
      E.src,
      E.warn,
      E.toast,
      E.settings,
    ]);

    UI.root = el('div', { id: 'lrsr-toolbar', hidden: true }, [head, body]);
    if (S.prefs.collapsed) UI.root.classList.add('lrsr-collapsed');
    document.body.appendChild(UI.root);
    enableDrag(head);
    applyI18n();
  }

  function applyI18n() {
    if (!UI.root) return;
    for (const n of UI.root.querySelectorAll('[data-i18n]')) n.textContent = t(n.getAttribute('data-i18n'));
    for (const n of UI.root.querySelectorAll('[data-i18n-title]')) n.title = t(n.getAttribute('data-i18n-title'));
  }

  function toggleCollapsed() {
    S.prefs.collapsed = !S.prefs.collapsed;
    savePrefs();
    UI.root.classList.toggle('lrsr-collapsed', S.prefs.collapsed);
    UI.els.collapse.textContent = S.prefs.collapsed ? '▸' : '▾';
    positionToolbar(true);
  }

  function enableDrag(handle) {
    let start = null;
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target instanceof Element && e.target.closest('button'))) return;
      const r = UI.root.getBoundingClientRect();
      start = { px: e.clientX, py: e.clientY, x: r.left, y: r.top };
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!start) return;
      S.prefs.toolbarPos = { x: start.x + e.clientX - start.px, y: start.y + e.clientY - start.py };
      positionToolbar(true);
    });
    const end = () => {
      if (!start) return;
      start = null;
      savePrefs();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function findLrPanel() {
    for (const p of document.querySelectorAll('.lln-vertical-view')) {
      const r = p.getBoundingClientRect();
      if (r.width > 50 && r.height > 50) return r;
    }
    return null;
  }

  function positionToolbar(force) {
    const tb = UI.root;
    if (!tb || tb.hidden) return;
    const w = tb.offsetWidth;
    const h = tb.offsetHeight;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    let x;
    let y;
    if (S.prefs.toolbarPos) {
      x = S.prefs.toolbarPos.x;
      y = S.prefs.toolbarPos.y;
    } else {
      const r = findLrPanel();
      if (r && r.top - h - 8 >= 64) {
        x = r.left;
        y = r.top - h - 8;
      } else if (r) {
        x = r.left - w - 8;
        y = vh - h - 12;
        if (x < 8) x = vw - w - 12;
      } else {
        x = vw - w - 16;
        y = vh - h - 16;
      }
    }
    x = Math.round(clamp(x, 4, Math.max(4, vw - w - 4)));
    y = Math.round(clamp(y, 4, Math.max(4, vh - h - 4)));
    if (force || x !== UI.x || y !== UI.y) {
      tb.style.left = x + 'px';
      tb.style.top = y + 'px';
      UI.x = x;
      UI.y = y;
    }
  }

  function toast(msg) {
    const E = UI.els;
    if (!E.toast) {
      log(msg);
      return;
    }
    E.toast.textContent = msg;
    E.toast.classList.add('on');
    clearTimeout(UI.toastTimer);
    UI.toastTimer = setTimeout(() => {
      E.toast.classList.remove('on');
      positionToolbar();
    }, 5000);
    positionToolbar();
  }

  function updateUI() {
    if (!UI.root) return;
    const E = UI.els;
    const watch = isWatchPage();
    if (UI.root.hidden === watch) {
      UI.root.hidden = !watch;
      if (watch) positionToolbar(true);
    }
    if (!watch) return;

    let state;
    if (S.replay) state = S.prefs.loop ? t('looping', { n: S.replay.loops + 1 }) : t('replaying');
    else if (S.selection) state = t('selected', { n: S.selection.hi - S.selection.lo + 1 });
    else if (S.video && S.video.paused && recentSmartPauseGroup(S.video.currentTime * 1000) != null) state = t('smartPaused');
    else state = t('idle');
    if (S.selection && S.cues[S.selection.lo] && S.cues[S.selection.hi]) {
      state += ' (' + fmtTime(S.cues[S.selection.lo].begin) + '–' + fmtTime(S.cues[S.selection.hi].end) + ')';
    }
    state += ' · ' + (S.prefs.smartPause ? t('smartOn') : lrAutoPauseEnabled() === true ? t('lineOn') : t('pauseOff'));
    E.status.textContent = state;
    E.status.title = state;

    const hasCues = S.cues.length > 0;
    E.select.setAttribute('aria-pressed', String(S.selectMode));
    E.loop.setAttribute('aria-pressed', String(!!S.prefs.loop));
    E.smart.setAttribute('aria-pressed', String(!!S.prefs.smartPause));
    const lrAp = lrAutoPauseEnabled();
    E.line.setAttribute('aria-pressed', String(lrAp === true));
    E.line.disabled = lrAp == null;
    E.replay.disabled = !S.selection || !hasCues;
    E.stop.disabled = !S.replay;
    E.clear.disabled = !S.selection;
    E.sentence.disabled = !hasCues;
    E.fileClear.disabled = !S.file;

    if (S.cueSource === 'LR') {
      E.src.textContent = t('srcLr', { n: S.cues.length, g: S.groups.length, p: S.punctuated ? '' : t('noPunct') });
    } else if (S.cueSource === 'FILE') {
      E.src.textContent = t('srcFile', { name: S.file ? S.file.name : '?', n: S.cues.length, g: S.groups.length, p: S.punctuated ? '' : t('noPunct') });
    } else {
      E.src.textContent = cueUnavailableMessage();
    }

    const conflict = lrAp === true && (S.prefs.smartPause || (!!S.replay && !S.prefs.overrideLrAutoPause));
    E.warn.classList.toggle('on', conflict);
  }

  // ---------------------------------------------------- file fallback

  function onFileChosen() {
    const f = UI.els.fileInput.files && UI.els.fileInput.files[0];
    UI.els.fileInput.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const cues = Core.parseSubtitleFile(String(reader.result || ''));
      if (!cues.length) return toast(t('fileEmpty'));
      S.file = { videoId: S.videoId, name: f.name, cues };
      setSelection(null);
      refreshCues(true);
      toast(t('fileLoaded', { n: cues.length, name: f.name }));
    };
    reader.readAsText(f);
  }

  // ------------------------------------------------------- diagnostics

  function diagnostics() {
    const lln = getLln();
    const r = readLr();
    const c = document.getElementById('lln-vertical-view-subs');
    const rows = c ? c.querySelectorAll(':scope > .lln-vertical-view-sub') : [];
    const firstRow = rows[0];
    const v = S.video;
    let lrData = null;
    if (r.data) {
      const d = r.data;
      lrData = {
        state: d.state,
        movieId: d.mm && d.mm.movieId,
        tm: d.tm ? { langCode_G: d.tm.langCode_G, langCode_YT: d.tm.langCode_YT, vssId: d.tm.vssId, isTranslatedTrack: d.tm.isTranslatedTrack } : null,
        subtitleCount: d.subtitles.length,
        sample: d.subtitles.slice(0, 3).map((s) => ({ begin: s.begin, end: s.end, text: String(s.text).slice(0, 80) })),
      };
    }
    return {
      script: VERSION,
      time: new Date().toISOString(),
      url: location.href,
      videoId: S.videoId,
      sandbox: { unsafeWindow: typeof unsafeWindow !== 'undefined', gm: typeof GM_getValue === 'function' },
      lr: {
        windowLln: !!lln,
        dataSource: lln && lln.subManager ? 'window.lln' : MOBX.atom ? 'mobx' : null,
        mobx: { globals: !!mobxGlobals(), probeInstalled: MOBX.trapped, captured: !!MOBX.atom, captures: MOBX.captures },
        extensionFlag: (() => {
          try {
            return !!PAGE.__LANGUAGE_REACTOR_EXTENSION__;
          } catch (_) {
            return null;
          }
        })(),
        llnKeys: lln ? Object.keys(lln) : null,
        status: r.status,
        reason: r.reason || null,
        data: lrData,
        autoPause: lrAutoPauseEnabled(),
        playerStateAttr: document.body && document.body.getAttribute('lln-player-state'),
        llnActiveClass: !!document.querySelector('.lln-active'),
      },
      panel: {
        found: !!c,
        absoluteClass: !!(c && c.classList.contains('absolute')),
        rowCount: rows.length,
        inScrollRows: c ? c.querySelectorAll(':scope > .lln-vertical-view-sub.in-scroll').length : 0,
        nonRowChildren: c ? Array.from(c.children).filter((x) => !x.classList.contains('lln-vertical-view-sub')).length : 0,
        firstRow: firstRow
          ? { className: firstRow.className, dataIndex: firstRow.getAttribute('data-index'), attrs: Array.from(firstRow.attributes).map((a) => a.name) }
          : null,
        rowCountMatchesCues: c ? rows.length === S.cues.length : null,
      },
      video: v
        ? {
            found: true,
            currentTimeMs: Math.round(v.currentTime * 1000),
            durationMs: Math.round(v.duration * 1000),
            rate: v.playbackRate,
            paused: v.paused,
            adShowing: isAdShowing(v),
            connected: v.isConnected,
            isMoviePlayerVideo: v === document.querySelector('#movie_player video'),
            videoCount: document.getElementsByTagName('video').length,
          }
        : { found: false },
      loop: {
        rafPending: !!S.raf,
        needsLoop: needsLoop(),
        ticks: S.stats.ticks,
        msSinceLastTick: S.stats.lastTickAt ? Math.round(performance.now() - S.stats.lastTickAt) : null,
        timeupdateEvals: S.stats.timeupdateEvals,
        smartPauses: S.stats.smartPauses,
        smartOffBySync: S.stats.smartOffBySync,
        visibility: document.visibilityState,
        hasFocus: document.hasFocus(),
      },
      nextGroup: (() => {
        if (!v || !S.groups.length) return null;
        const now = v.currentTime * 1000;
        const gi = Core.findGroupAt(S.groups, now);
        return S.groups.slice(Math.max(0, gi), gi + 2).map((g) => ({ first: g.first, last: g.last, start: g.start, end: g.end, nextStart: g.nextStart, reason: g.reason }));
      })(),
      cues: { source: S.cueSource, count: S.cues.length, groups: S.groups.length, punctuated: S.punctuated, trackKey: S.trackKey },
      groupsSample: S.groups.slice(0, 5).map((g) => Object.assign({}, g, { text: S.cues.slice(g.first, g.last + 1).map((x) => x.text).join(' ').slice(0, 120) })),
      selection: S.selection,
      replay: S.replay,
      smartArmed: S.smart.armed,
      prefs: S.prefs,
    };
  }

  function copyDiagnostics() {
    const d = diagnostics();
    const text = JSON.stringify(d, null, 2);
    console.log('[LRSR] diagnostics', d);
    const done = () => toast(t('diagCopied'));
    const fail = () => toast(t('diagConsole'));
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
      else fail();
    } catch (_) {
      fail();
    }
  }

  // ------------------------------------------------------------ lifecycle

  function onVideoChanged(id) {
    S.videoId = id;
    if (S.replay) finishReplay();
    S.selection = null;
    S.smart.reset();
    S.lastSmartPause = null;
    S.lrDataRef = null;
    S.trackKey = null;
    S.cueSource = 'NONE';
    S.cues = [];
    S.groups = [];
    S.lrStatus = { code: 'STALE' };
    scheduleDecorate();
  }

  function maintenance() {
    const id = currentVideoId();
    if (id !== S.videoId) onVideoChanged(id);
    if (isWatchPage()) {
      bindVideo(findVideo());
      attachTranscript();
      refreshCues(false);
    } else {
      bindVideo(null);
      attachTranscript();
    }
    syncPauseModes();
    updateUI();
    positionToolbar();
  }

  function onNavigate() {
    maintenance();
    setTimeout(maintenance, 300);
  }

  function init() {
    injectStyle();
    buildToolbar();
    document.addEventListener('yt-navigate-finish', onNavigate);
    window.addEventListener('popstate', onNavigate);
    window.addEventListener('click', onClickCapture, true);
    window.addEventListener('mousedown', onMouseDownCapture, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', () => positionToolbar());
    S.maintTimer = setInterval(maintenance, 500);
    maintenance();
    try {
      PAGE.LRSR = { version: VERSION, diagnostics: () => diagnostics() };
    } catch (_) {}
    log('v' + VERSION + ' loaded');
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init, { once: true });
})();
