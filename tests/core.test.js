'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../LanguageReactor_SentenceReplay.user.js');

const cue = (begin, end, text) => ({ begin, end, text });
const groupsOf = (cues, opts) => Core.groupSentences(cues, opts).groups;
const spans = (groups) => groups.map((g) => [g.first, g.last]);

test('acceptance: Pavlov cues form one sentence ending at cue B end', () => {
  const cues = [cue(1000, 2500, "Ooh, bet you're salivating now,"), cue(2500, 4200, "just like one of Pavlov's dogs."), cue(4800, 6000, 'Next one.')];
  assert.equal(Core.classifyEnding(cues[0].text, cues[1].text), 'continue');
  const g = groupsOf(cues);
  assert.deepEqual(spans(g), [[0, 1], [2, 2]]);
  assert.equal(g[0].end, 4200);
  assert.equal(g[0].reason, 'punct');
});

test('zero-length preview cues (rolling YouTube captions) never end a sentence', () => {
  const zw = '\u200B\u200B\u200B \u200B';
  const cues = [
    cue(0, 0, zw + 'If this couple can lose 150 pounds\nbefore their WEDDING day,'),
    cue(0, 4154, zw + 'If this couple can lose 150 pounds\nbefore their WEDDING day,'),
    cue(4234, 4234, zw + 'they win $250,000.'),
    cue(4234, 6601, zw + 'they win $250,000.'),
    cue(6601, 6601, zw + 'Whaaat the HECK?!'),
    cue(6601, 7701, zw + 'Whaaat the HECK?!'),
    cue(7734, 7734, zw + 'And their wedding will be the first\ntime'),
    cue(7734, 9367, zw + 'And their wedding will be the first\ntime'),
    cue(9434, 9434, zw + 'ANYONE in their family sees them.'),
    cue(9434, 10601, zw + 'ANYONE in their family sees them.'),
    cue(11868, 11868, zw + 'Ready to start?'),
    cue(11868, 12587, zw + 'Ready to start?'),
  ];
  const g = groupsOf(cues);
  assert.deepEqual(spans(g), [[0, 3], [4, 5], [6, 9], [10, 11]]);
  assert.deepEqual(g.map((x) => [x.start, x.end]), [[0, 6601], [6601, 7701], [7734, 10601], [11868, 12587]]);
});

test('terminators with trailing quotes and brackets', () => {
  assert.equal(Core.classifyEnding('He said "stop."', 'Then he left.'), 'end');
  assert.equal(Core.classifyEnding('Really?)', 'Yes.'), 'end');
  assert.equal(Core.classifyEnding('Wow!”', 'And then'), 'end');
  assert.equal(Core.classifyEnding('first part,', 'second part.'), 'continue');
  assert.equal(Core.classifyEnding('a list:', 'one, two.'), 'continue');
  assert.equal(Core.classifyEnding('this; that', 'more.'), 'continue');
});

test('abbreviations and initials do not end sentences', () => {
  assert.equal(Core.classifyEnding('I met Mr.', 'Smith yesterday.'), 'continue');
  assert.equal(Core.classifyEnding('Ask Dr.', 'Jones.'), 'continue');
  assert.equal(Core.classifyEnding('fruits, e.g.', 'apples and pears.'), 'continue');
  assert.equal(Core.classifyEnding('that is, i.e.', 'Paris.'), 'continue');
  assert.equal(Core.classifyEnding('written by J.', 'K. Rowling.'), 'continue');
  assert.equal(Core.classifyEnding('he moved to the U.S.', 'Then he got a job.'), 'end');
  assert.equal(Core.classifyEnding('he moved to the U.S.', 'and got a job.'), 'continue');
  assert.equal(Core.classifyEnding('apples, pears, etc.', 'Then we left.'), 'end');
  assert.equal(Core.classifyEnding('apples, pears, etc.', 'were on sale.'), 'continue');
});

test('words that double as numeric abbreviations end a sentence unless a number follows', () => {
  assert.equal(Core.classifyEnding("She'll probably say no.", 'But I could be like, "That was me just now'), 'end');
  assert.equal(Core.classifyEnding('Wait a sec.', 'I need my keys.'), 'end');
  assert.equal(Core.classifyEnding('Turn it up to the max.', 'Louder!'), 'end');
  assert.equal(Core.classifyEnding('It happened in Dec.', 'Nobody noticed.'), 'end');
  assert.equal(Core.classifyEnding('See No.', '5 on the list.'), 'continue');
  assert.equal(Core.classifyEnding('as shown in Fig.', '3 below.'), 'continue');
  assert.equal(Core.classifyEnding('turn to p.', '12 now.'), 'continue');
  assert.equal(Core.classifyEnding('It was on Jan.', '5th.'), 'continue');
  assert.equal(Core.classifyEnding('Say no.', null), 'end');
});

test('decimals and ellipses are conservative', () => {
  assert.equal(Core.classifyEnding('pi is about 3.', '14 or so.'), 'continue');
  assert.equal(Core.classifyEnding('It costs 3.14.', 'Cheap.'), 'end');
  assert.equal(Core.classifyEnding('Well...', 'maybe not.'), 'continue');
  assert.equal(Core.classifyEnding('I waited…', 'Then it came.'), 'end');
  assert.equal(Core.classifyEnding('And then...', null), 'end');
});

test('zero-width characters around punctuation are ignored (seen in real styled YouTube captions)', () => {
  assert.equal(Core.classifyEnding('\u200b\u200b ANYONE in their family sees them.\u200b \u200b\u200b', '\u200b I built'), 'end');
  assert.equal(Core.hasTerminalPunctuation('done.\u200b \u200b'), true);
  assert.equal(Core.cleanText('\u200b a\u00adb \u200b'), 'ab');
});

test('lowercase continuation after a period keeps the sentence open', () => {
  assert.equal(Core.classifyEnding('version 2.', 'was released later.'), 'continue');
});

test('sound tags are standalone groups', () => {
  const cues = [cue(0, 1000, 'So here we go'), cue(1000, 3000, '[Music]'), cue(3000, 4000, 'Hello there.')];
  assert.deepEqual(spans(groupsOf(cues)), [[0, 0], [1, 1], [2, 2]]);
});

test('one cue with multiple sentences joins the next cue when it does not end', () => {
  const cues = [cue(0, 1500, 'Yes. I think'), cue(1500, 2500, 'so.'), cue(2600, 3000, 'Okay.')];
  assert.deepEqual(spans(groupsOf(cues)), [[0, 1], [2, 2]]);
});

test('long silence forces a break even without punctuation', () => {
  const cues = [cue(0, 1000, 'And so we waited'), cue(3500, 4500, 'for a long time.'), cue(4600, 5000, 'Yes.'), cue(5100, 6000, 'Sure.')];
  const g = groupsOf(cues, { gapBreakMs: 2000 });
  assert.deepEqual(spans(g), [[0, 0], [1, 1], [2, 2], [3, 3]]);
  assert.equal(g[0].reason, 'gap');
});

test('max sentence length caps runaway groups', () => {
  const cues = [];
  for (let i = 0; i < 10; i++) cues.push(cue(i * 3000, i * 3000 + 3000, i === 9 ? 'end.' : 'words, more words,'));
  cues.push(cue(31000, 32000, 'Done.'));
  const g = groupsOf(cues, { maxSentenceMs: 15000 });
  for (const grp of g) assert.ok(grp.end - grp.start <= 15000, JSON.stringify(grp));
  assert.ok(g.some((x) => x.reason === 'max'));
});

test('unpunctuated (ASR-like) tracks fall back to timing', () => {
  const cues = [];
  let t = 0;
  for (let i = 0; i < 20; i++) {
    const gap = i === 7 ? 1200 : 0;
    t += gap;
    cues.push(cue(t, t + 2000, 'so we are talking about this thing'));
    t += 2000;
  }
  const res = Core.groupSentences(cues);
  assert.equal(res.punctuated, false);
  assert.equal(res.groups[0].last, 3, 'first group capped by unpunctuatedMaxMs (8s)');
  assert.ok(res.groups.some((g) => g.reason === 'gap' && g.last === 6));
  for (const g of res.groups) assert.ok(g.end - g.start <= 8000);
  const covered = res.groups.reduce((n, g) => n + (g.last - g.first + 1), 0);
  assert.equal(covered, cues.length);
});

test('groups cover every cue exactly once and in order', () => {
  const cues = [cue(0, 1000, 'A b,'), cue(1000, 2000, 'c d.'), cue(2000, 3000, 'E?'), cue(3000, 4000, 'f g'), cue(4000, 5000, 'h.')];
  const g = groupsOf(cues);
  let expected = 0;
  for (const grp of g) {
    assert.equal(grp.first, expected);
    assert.ok(grp.last >= grp.first);
    expected = grp.last + 1;
  }
  assert.equal(expected, cues.length);
});

test('computeReplayInterval: start of first, end of last plus tail', () => {
  const cues = [cue(1000, 2000, 'a'), cue(2000, 3500, 'b'), cue(4000, 5000, 'c')];
  assert.deepEqual(Core.computeReplayInterval(cues, 0, 1, { tailMs: 150 }), { ok: true, lo: 0, hi: 1, start: 1000, end: 3650 });
  assert.deepEqual(Core.computeReplayInterval(cues, 2, 0, { tailMs: 0 }), { ok: true, lo: 0, hi: 2, start: 1000, end: 5000 });
  assert.equal(Core.computeReplayInterval(cues, 1, 2, { tailMs: 500, durationMs: 5200 }).end, 5200);
  assert.equal(Core.computeReplayInterval(cues, 2, 2, { tailMs: 99999 }).end, 6000);
  assert.equal(Core.computeReplayInterval(cues, 2, 2, { tailMs: -50 }).end, 5000);
});

test('tail never runs into the next cue, so LR keeps showing the finished line', () => {
  const cues = [cue(1000, 2000, 'a'), cue(2000, 3500, 'b'), cue(3567, 5000, 'c')];
  assert.equal(Core.computeReplayInterval(cues, 0, 0, { tailMs: 150 }).end, 1980);
  assert.equal(Core.computeReplayInterval(cues, 1, 1, { tailMs: 150 }).end, 3547);
  assert.equal(Core.tailBoundary(3500, 80, 3567), 3547);
  assert.equal(Core.tailBoundary(3500, 80, 9000), 3580);
  assert.equal(Core.tailBoundary(3500, 80, null), 3580);
  const g = groupsOf([cue(0, 2000, 'One two three four.'), cue(2067, 4000, 'Five six.')]);
  assert.equal(g[0].nextStart, 2067);
  assert.equal(g[1].nextStart, null);
  const p = Core.createSmartPauser();
  let paused = null;
  for (let t = 0; t <= 2200 && paused == null; t += 16) {
    const r = p.step(g, t, 80);
    if (r.pause) paused = r.boundary;
  }
  assert.equal(paused, 2047);
});

test('computeReplayInterval: explicit errors, never fabricated timing', () => {
  assert.equal(Core.computeReplayInterval([], 0, 0).error, 'NO_CUES');
  assert.equal(Core.computeReplayInterval(null, 0, 0).error, 'NO_CUES');
  const cues = [cue(0, 1000, 'a'), cue(1000, 1020, 'b')];
  assert.equal(Core.computeReplayInterval(cues, 0, 5).error, 'OUT_OF_RANGE');
  assert.equal(Core.computeReplayInterval(cues, -1, 0).error, 'OUT_OF_RANGE');
  assert.equal(Core.computeReplayInterval(cues, 1, 1, { tailMs: 0 }).error, 'TOO_SHORT');
  assert.equal(Core.computeReplayInterval([cue(0, NaN, 'x')], 0, 0).error, 'BAD_TIMING');
  assert.equal(Core.computeReplayInterval([cue(500, 100, 'x')], 0, 0).error, 'BAD_TIMING');
});

test('replayAction: loop vs stop at boundary, outside detection', () => {
  const iv = { start: 1000, end: 3000 };
  assert.equal(Core.replayAction(2000, iv, false), null);
  assert.equal(Core.replayAction(3000, iv, false), 'stop');
  assert.equal(Core.replayAction(3010, iv, true), 'loop');
  assert.equal(Core.replayAction(200, iv, true), 'outside');
  assert.equal(Core.replayAction(9000, iv, true), 'outside');
});

test('selection: click, shift-range, adjacency, non-contiguous handling', () => {
  let r = Core.applySelectionClick(null, 5, {});
  assert.deepEqual(r.sel, { lo: 5, hi: 5, anchor: 5 });
  r = Core.applySelectionClick(r.sel, 8, { shift: true });
  assert.deepEqual(r.sel, { lo: 5, hi: 8, anchor: 5 });
  r = Core.applySelectionClick(r.sel, 3, { shift: true });
  assert.deepEqual(r.sel, { lo: 3, hi: 5, anchor: 5 });
  r = Core.applySelectionClick(r.sel, 6, {});
  assert.deepEqual(r.sel, { lo: 3, hi: 6, anchor: 5 });
  assert.equal(r.notice, null);
  r = Core.applySelectionClick(r.sel, 10, {});
  assert.deepEqual(r.sel, { lo: 3, hi: 10, anchor: 5 });
  assert.equal(r.notice, 'EXTENDED_TO_RANGE');
  const before = r.sel;
  r = Core.applySelectionClick(before, 7, {});
  assert.equal(r.notice, 'MIDDLE_REMOVE_REJECTED');
  assert.deepEqual(r.sel, before);
  r = Core.applySelectionClick(before, 10, {});
  assert.deepEqual(r.sel, { lo: 3, hi: 9, anchor: 5 });
  r = Core.applySelectionClick({ lo: 4, hi: 4, anchor: 4 }, 4, {});
  assert.equal(r.sel, null);
  r = Core.applySelectionClick({ lo: 4, hi: 6, anchor: 4 }, 4, {});
  assert.deepEqual(r.sel, { lo: 5, hi: 6, anchor: 5 });
});

test('remapSelection keeps selection by timestamps and drops it when cues differ', () => {
  const cues = [cue(0, 1000, 'a'), cue(1000, 2000, 'b'), cue(2000, 3000, 'c')];
  const sel = { lo: 1, hi: 2, anchor: 1, loKey: Core.cueKey(cues[1]), hiKey: Core.cueKey(cues[2]) };
  assert.deepEqual(Core.remapSelection(sel, cues.map((c) => ({ ...c }))), { lo: 1, hi: 2, anchor: 1, loKey: sel.loKey, hiKey: sel.hiKey });
  const shifted = [cue(-0, 500, 'x'), ...cues];
  assert.equal(Core.remapSelection(sel, shifted).lo, 2);
  assert.equal(Core.remapSelection(sel, [cue(0, 1100, 'a'), cue(1100, 2100, 'b')]), null);
});

test('normalizeCues keeps LR order/indices and rejects invalid timing', () => {
  const r = Core.normalizeCues([{ begin: 0, end: 1000, text: ' a  b ' }, { begin: 1000, end: 2000, text: 'c' }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.cues[0], { idx: 0, begin: 0, end: 1000, text: 'a b' });
  assert.equal(Core.normalizeCues([{ begin: 0, end: 'x', text: 'a' }]).ok, false);
  assert.equal(Core.normalizeCues(undefined).ok, false);
});

function simulateSmartPause(cues, rate, opts) {
  const groups = Core.groupSentences(cues).groups;
  const pauser = Core.createSmartPauser();
  const frameMs = 1000 / 60;
  const pauses = [];
  let t = cues[0].begin - 500;
  const endT = cues[cues.length - 1].end + 1500;
  while (t < endT) {
    const res = pauser.step(groups, t, (opts && opts.tailMs) || 0);
    if (res.pause) {
      pauses.push({ group: res.group, at: t, boundary: res.boundary });
    }
    t += frameMs * rate;
  }
  return { groups, pauses };
}

test('Smart Pause simulation: pauses once per sentence, never at cue A, at 0.5x–2x', () => {
  const cues = [
    cue(1000, 2500, "Ooh, bet you're salivating now,"),
    cue(2500, 4200, "just like one of Pavlov's dogs."),
    cue(4300, 6000, 'Mr.'),
    cue(6000, 7000, 'Smith agreed.'),
    cue(7100, 8000, 'Did he?'),
  ];
  for (const rate of [0.5, 1, 1.25, 1.5, 2]) {
    const { groups, pauses } = simulateSmartPause(cues, rate);
    assert.deepEqual(spans(groups), [[0, 1], [2, 3], [4, 4]]);
    assert.deepEqual(pauses.map((p) => p.group), [0, 1, 2], 'rate ' + rate);
    for (const p of pauses) {
      assert.ok(p.at >= p.boundary, 'never early');
      assert.ok(p.at - p.boundary <= (1000 / 60) * rate + 1e-6, 'overshoot ≤ one frame at rate ' + rate);
    }
    assert.ok(!pauses.some((p) => Math.abs(p.at - 2500) < 50), 'no pause at end of cue A');
  }
});

test('Smart Pause: seeking into the last 150 ms of a sentence does not pause instantly', () => {
  const cues = [cue(0, 2000, 'Hello there.'), cue(2500, 4000, 'Second one.')];
  const groups = Core.groupSentences(cues).groups;
  const p = Core.createSmartPauser();
  assert.equal(p.step(groups, 1900, 0).pause, false);
  assert.equal(p.armed, -1);
  assert.equal(p.step(groups, 2010, 0).pause, false);
  assert.equal(p.armed, -1);
  assert.equal(p.step(groups, 2250, 0).pause, false);
  assert.equal(p.armed, 1, 'arms the next sentence once inside its lookahead');
});

test('Smart Pause: seeking mid-sentence close to the next one still arms the current sentence', () => {
  const cues = [cue(0, 2000, 'Hello there.'), cue(2100, 4000, 'Second one.')];
  const groups = Core.groupSentences(cues).groups;
  const p = Core.createSmartPauser();
  p.step(groups, 1700, 0);
  assert.equal(p.armed, 0);
  assert.equal(p.step(groups, 2000, 0).pause, true);
});

test('Smart Pause: after a pause, resuming does not re-pause the same sentence', () => {
  const cues = [cue(0, 2000, 'Hello there.'), cue(5000, 7000, 'Second one.')];
  const groups = Core.groupSentences(cues).groups;
  const p = Core.createSmartPauser();
  p.step(groups, 1000, 0);
  assert.equal(p.step(groups, 2001, 0).pause, true);
  for (let t = 2010; t < 4600; t += 16) assert.equal(p.step(groups, t, 0).pause, false);
});

test('parseSubtitleFile handles SRT and VTT', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,500\nOoh, bet you\'re\nsalivating now,\n\n2\n00:00:02,500 --> 00:00:04,200\n<i>just like one of Pavlov\'s dogs.</i>\n';
  const a = Core.parseSubtitleFile(srt);
  assert.deepEqual(a, [
    { idx: 0, begin: 1000, end: 2500, text: "Ooh, bet you're salivating now," },
    { idx: 1, begin: 2500, end: 4200, text: "just like one of Pavlov's dogs." },
  ]);
  const vtt = 'WEBVTT\n\n00:01.000 --> 00:02.000 align:start\nHello.\n\nnote\n01:00:00.5 --> 01:00:01.25\nLater.\n';
  const b = Core.parseSubtitleFile(vtt);
  assert.equal(b.length, 2);
  assert.equal(b[0].begin, 1000);
  assert.equal(b[1].begin, 3600500);
  assert.equal(b[1].end, 3601250);
});

const cambridgeEntry = (pos, uk, us, ukMp3, usMp3) =>
  '<div class="pos-header dpos-h"><div class="di-title"><span class="headword hdb tw-bw dhw dpos-h_hw "><span class="hw dhw">record</span></span></div>' +
  '<div class="posgram dpos-g hdib lmr-5"><span class="pos dpos" title="x">' + pos + '</span></div>' +
  '<span class="uk dpron-i "><span class="region dreg">uk</span><span class="daud"><audio class="hdn" preload="none" id="a1">' +
  '<source type="audio/mpeg" src="' + ukMp3 + '"/><source type="audio/ogg" src="/x.ogg"/></audio></span>' +
  '<span class="pron dpron">/<span class="ipa dipa lpr-2 lpl-1">' + uk + '</span>/</span></span> ' +
  '<span class="us dpron-i "><span class="region dreg">us</span><span class="daud"><audio class="hdn" preload="none" id="a2">' +
  '<source type="audio/mpeg" src="' + usMp3 + '"/></audio></span>' +
  '<span class="pron dpron">/<span class="ipa dipa lpr-2 lpl-1">' + us + '</span>/</span></span>' +
  '</div><div class="pos-body"><span class="us dpron-i "><span class="ipa dipa">WRONG</span></span></div>';

test('parseCambridgeHtml extracts UK/US IPA + audio per part of speech and merges duplicates', () => {
  const html =
    cambridgeEntry('noun', 'ˈrek.ɔːd', 'ˈrek.<span class="sp dsp">ɚ</span>d', '/media/english/uk_pron/r/rec/n_uk.mp3', '/media/english/us_pron/r/rec/n_us.mp3') +
    cambridgeEntry('verb', 'rɪˈkɔːd', 'rɪˈkɔːrd', '/media/english/uk_pron/r/rec/v_uk.mp3', '/media/english/us_pron/r/rec/v_us.mp3') +
    cambridgeEntry('adjective', 'ˈrek.ɔːd', 'ˈrek.ɚd', '/media/english/uk_pron/r/rec/n_uk.mp3', '/media/english/us_pron/r/rec/n_us.mp3');
  const r = Core.parseCambridgeHtml(html);
  assert.equal(r.blocked, false);
  assert.equal(r.entries.length, 2);
  assert.deepEqual(r.entries[0].pos, ['noun', 'adjective']);
  assert.equal(r.entries[0].uk.ipa, 'ˈrek.ɔːd');
  assert.equal(r.entries[0].us.ipa, 'ˈrek.ɚd');
  assert.equal(r.entries[0].uk.audio, 'https://dictionary.cambridge.org/media/english/uk_pron/r/rec/n_uk.mp3');
  assert.equal(r.entries[1].us.ipa, 'rɪˈkɔːrd');
  assert.equal(r.entries[1].us.audio, 'https://dictionary.cambridge.org/media/english/us_pron/r/rec/v_us.mp3');
});

test('parseCambridgeHtml detects the Cloudflare challenge page', () => {
  const r = Core.parseCambridgeHtml('<html><head><title>Just a moment...</title></head><body>cf-chl-x</body></html>');
  assert.equal(r.blocked, true);
  assert.equal(r.entries.length, 0);
});

test('parseFreeDictJson picks UK/US audio and IPA', () => {
  const data = [
    {
      word: 'profound',
      phonetic: '/pɹəˈfaʊnd/',
      phonetics: [
        { text: '/pɹəˈfaʊnd/', audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/profound-uk.mp3' },
        { text: '/pɹoʊˈfaʊnd/', audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/profound-us.mp3' },
      ],
      meanings: [{ partOfSpeech: 'adjective' }, { partOfSpeech: 'noun' }],
    },
  ];
  const e = Core.parseFreeDictJson(data);
  assert.equal(e.length, 1);
  assert.equal(e[0].uk.ipa, 'pɹəˈfaʊnd');
  assert.equal(e[0].us.ipa, 'pɹoʊˈfaʊnd');
  assert.deepEqual(e[0].pos, ['adjective', 'noun']);
  assert.deepEqual(Core.parseFreeDictJson({ title: 'No Definitions Found' }), []);
});

test('ipaSyllables marks primary and secondary stress', () => {
  assert.deepEqual(Core.ipaSyllables('ˌɪn.təˈnæʃ.ən.əl'), [
    { text: 'ɪn', stress: 2 },
    { text: 'tə', stress: 0 },
    { text: 'næʃ', stress: 1 },
    { text: 'ən', stress: 0 },
    { text: 'əl', stress: 0 },
  ]);
  assert.deepEqual(Core.ipaSyllables('prəˈfaʊnd'), [
    { text: 'prə', stress: 0 },
    { text: 'faʊnd', stress: 1 },
  ]);
});

test('normalizeLookupWord and cambridgeUrl', () => {
  assert.equal(Core.normalizeLookupWord(' Profound, '), 'profound');
  assert.equal(Core.normalizeLookupWord('I’m'), "i'm");
  assert.equal(Core.normalizeLookupWord('look up'), 'look up');
  assert.equal(Core.normalizeLookupWord('sâu sắc'), null);
  assert.equal(Core.normalizeLookupWord('123'), null);
  assert.equal(Core.cambridgeUrl('look up'), 'https://dictionary.cambridge.org/dictionary/english/look-up');
});
