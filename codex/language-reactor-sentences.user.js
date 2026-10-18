// ==UserScript==
// @name         Language Reactor — Dừng cuối câu & Replay YouTube
// @namespace    local.language-reactor.sentences
// @version      1.0.0
// @description  Ghép phụ đề thành câu, dừng cuối câu và phát lặp các câu được chọn. Dành cho LR 5.1.8.
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        none
// @sandbox      raw
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  // Quy tắc dự phòng khi phụ đề thiếu dấu câu. Đơn vị: mili giây.
  const MAX_SENTENCE_MS = 25000;
  const MAX_CUES = 10;
  const GAP_MS = 1800;

  function endsSentence(text, nextText = '') {
    const clean = String(text).trim().replace(/["'”’»\)\]]+$/u, '').trim();
    if (/[!?。！？]$/u.test(clean)) return true;
    if (!/\.$/u.test(clean)) return false;
    // Dấu ba chấm thường là ngập ngừng; tiếp tục đến dòng sau.
    if (/(?:\.{2,}|…)$/u.test(clean)) return false;
    const token = clean.match(/([^\s]+)\.$/u)?.[1] || '';
    if (/^(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|e\.g|i\.e)$/iu.test(token)) return false;
    // Chữ cái đầu tên người và từ viết tắt: J. / U.S.
    if (/^(?:[A-Za-z]|(?:[A-Za-z]\.)+[A-Za-z])$/u.test(token)) {
      return !/^\s*[\p{L}\p{N}]/u.test(nextText);
    }
    return true;
  }

  function buildGroups(cues, forcedEnds = new Set()) {
    const groups = [];
    let start = 0;
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      const next = cues[i + 1];
      const limit = next && (next.end - cues[start].begin > MAX_SENTENCE_MS || i - start + 1 >= MAX_CUES);
      if (!next || forcedEnds.has(i) || endsSentence(cue.text, next.text) ||
          next.begin - cue.end >= GAP_MS || limit) {
        groups.push({ start, last: i, begin: cues[start].begin, end: cue.end,
          text: cues.slice(start, i + 1).map(c => c.text).join(' ') });
        start = i + 1;
      }
    }
    return groups;
  }

  function nextGroup(groups, time) {
    let lo = 0;
    let hi = groups.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (groups[mid].end <= time + 1) lo = mid + 1;
      else hi = mid;
    }
    return groups[lo] || null;
  }

  // Browser integration. Các hàm phía trên độc lập để kiểm thử quy tắc ghép câu.
  if (window.__lrSentenceHelper) return;
  window.__lrSentenceHelper = true;

  let lr, cues, groups = [], byIndex = new Map();
  let movieId = '', target = null, looping = false, autoPause = false;
  let nativeOwner = null, savedNative = false, nativePending = false;
  let selected = new Set(), forcedEnds = new Set();
  let expectedSeek = null, video = null, panel = null, status = null;
  let autoButton, loopButton, count, dirty = true, lastUI = 0;

  function el(tag, text, parent) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (parent) parent.append(node);
    return node;
  }

  function message(text) {
    if (status && status.textContent !== text) status.textContent = text;
  }

  // set('autoPause', false) của LR gọi play(). Giữ nguyên trạng thái pause của người dùng.
  function setNative(owner, value) {
    const wasPlaying = lr?.vidMan.getPlaying();
    try {
      const result = owner.set('autoPause', value);
      if (!value && !wasPlaying) lr?.vidMan.pause();
      Promise.resolve(result).catch(error => {
        console.error('[LR Sentences] Lưu AP thất bại:', error);
        message('Không lưu được AP của LR. Hãy tắt AP thủ công.');
      }).finally(() => { nativePending = false; });
    } catch (error) {
      nativePending = false;
      throw error;
    }
  }

  function syncNative() {
    const ownPlayback = autoPause || looping;
    if (ownPlayback && lr) {
      if (nativeOwner !== lr.setMan) {
        releaseNative();
        nativeOwner = lr.setMan;
        savedNative = nativeOwner.get('autoPause');
      }
      if (!nativePending && nativeOwner.get('autoPause')) {
        nativePending = true;
        setNative(nativeOwner, false);
      }
    } else releaseNative();
  }

  function releaseNative() {
    if (!nativeOwner) return;
    const owner = nativeOwner;
    nativeOwner = null;
    if (savedNative) setNative(owner, true);
  }

  function rebuild() {
    groups = buildGroups(cues, forcedEnds);
    byIndex = new Map();
    for (const group of groups) {
      for (let i = group.start; i <= group.last; i++) byIndex.set(i, group);
    }
    selected.clear();
    looping = false;
    target = null;
    dirty = true;
    syncNative();
  }

  function playGroup(group) {
    target = group;
    expectedSeek = group.begin;
    lr.playMan.playSubtitle(group.start, false);
  }

  function stopLoop() {
    looping = false;
    target = null;
    dirty = true;
    syncNative();
  }

  function addPanel() {
    panel = el('section');
    panel.id = 'lr-sentence-tools';
    panel.setAttribute('aria-label', 'Language Reactor: luyện theo câu');
    const details = el('details', undefined, panel);
    details.open = true;
    el('summary', 'LR · Luyện theo câu', details);
    const body = el('div', undefined, details);
    autoButton = el('button', '', body);
    autoButton.onclick = () => {
      autoPause = !autoPause;
      target = null;
      syncNative();
      dirty = true;
    };
    loopButton = el('button', '▶ Lặp câu đã chọn', body);
    loopButton.onclick = () => {
      if (looping) {
        stopLoop();
        lr?.vidMan.pause();
      } else if (selected.size && lr) {
        looping = true;
        syncNative();
        playGroup(groups.find(g => selected.has(g.start)));
        dirty = true;
      } else message('Tích ô cạnh phụ đề bên phải trước khi phát lặp.');
    };
    const clear = el('button', 'Bỏ chọn hết', body);
    clear.onclick = () => { stopLoop(); selected.clear(); dirty = true; };
    count = el('span', '', body);
    status = el('p', 'Đang chờ Language Reactor…', body);
    el('p', '☑ chọn cả câu · │ đặt/bỏ điểm ngắt sau dòng', body);
    document.body.append(panel);

    const style = el('style');
    style.textContent = `
      #lr-sentence-tools {position:fixed;left:16px;bottom:16px;z-index:2147483646;
        max-width:min(420px,90vw);background:#202024;color:#fff;padding:10px 12px;
        border:1px solid #a56bc4;border-radius:9px;font:13px/1.5 Arial,sans-serif;
        box-shadow:0 3px 18px #0008}
      #lr-sentence-tools summary {cursor:pointer;font-weight:bold}
      #lr-sentence-tools button {background:#38343f;color:#fff;border:1px solid #756283;
        border-radius:5px;padding:5px 8px;margin:7px 5px 0 0;cursor:pointer;font:inherit}
      #lr-sentence-tools button[aria-pressed=true] {background:#72419a}
      #lr-sentence-tools p {margin:6px 0 0;max-width:390px}
      .lrs-controls {display:inline-flex;align-items:center;gap:4px;position:relative;
        z-index:3;float:right;margin:2px 5px;background:#26222b;border-radius:4px}
      .lrs-controls input {appearance:auto!important;position:static!important;
        opacity:1!important;width:17px!important;height:17px!important;margin:4px!important;cursor:pointer}
      .lrs-controls button {font:16px Arial!important;background:#332b3c!important;color:#ddd!important;
        border:0;padding:3px 5px;cursor:pointer}
      .lrs-controls button[aria-pressed=true] {background:#8851aa!important;color:#fff!important}
      .lln-vertical-view-sub.lrs-selected {box-shadow:inset -4px 0 #bc77e7}
    `;
    document.head.append(style);
    // LR nhận phím tắt ở document; các nút của script không kích hoạt shortcut đó.
    panel.addEventListener('keydown', event => event.stopPropagation());
  }

  function decorateRows() {
    for (const row of document.querySelectorAll('.lln-vertical-view-sub[data-index]')) {
      const index = Number(row.dataset.index);
      const group = byIndex.get(index);
      if (!group) continue;
      let controls = row.querySelector('.lrs-controls');
      if (!controls) {
        controls = el('span');
        controls.className = 'lrs-controls';
        el('input', undefined, controls).type = 'checkbox';
        el('button', '│', controls).type = 'button';
        for (const name of ['click', 'mousedown', 'mouseup', 'dblclick', 'keydown']) {
          controls.addEventListener(name, event => event.stopPropagation());
        }
        // Luôn đọc index từ row: LR có thể tái sử dụng node khi cuộn.
        controls.firstChild.addEventListener('change', event => {
          event.stopPropagation();
          const current = byIndex.get(Number(row.dataset.index));
          if (!current) return;
          if (event.target.checked) selected.add(current.start);
          else selected.delete(current.start);
          if (looping) stopLoop();
          dirty = true;
        });
        controls.lastChild.onclick = () => {
          const currentIndex = Number(row.dataset.index);
          if (forcedEnds.has(currentIndex)) forcedEnds.delete(currentIndex);
          else forcedEnds.add(currentIndex);
          rebuild();
        };
        row.prepend(controls);
      }
      const checked = selected.has(group.start);
      controls.firstChild.checked = checked;
      controls.firstChild.title = `Chọn câu: ${group.text}`;
      controls.firstChild.setAttribute('aria-label', `Chọn phát lặp: ${group.text}`);
      controls.lastChild.title = 'Đặt/bỏ điểm ngắt câu sau dòng này (xóa lựa chọn hiện tại)';
      controls.lastChild.setAttribute('aria-label', 'Điểm ngắt câu sau dòng này');
      controls.lastChild.setAttribute('aria-pressed', String(forcedEnds.has(index)));
      row.classList.toggle('lrs-selected', checked);
    }
  }

  function onSeek() {
    const time = lr?.vidMan.getTime();
    if (expectedSeek !== null && Math.abs(time - expectedSeek) < 300) {
      expectedSeek = null;
      return;
    }
    expectedSeek = null;
    stopLoop();
  }

  function update() {
    if (!panel) addPanel();
    lr = window.lln;
    const data = lr?.subManager?.data;
    const active = location.pathname === '/watch' && document.body.classList.contains('lln-active');
    const ready = active && data?.state === 'SUBS_LOADED' && Array.isArray(data.subtitles) &&
      typeof lr?.vidMan?.getTime === 'function' && typeof lr?.playMan?.playSubtitle === 'function';
    if (!ready) {
      looping = false;
      target = null;
      releaseNative();
      message('Đang chờ LR và phụ đề. Mở video YouTube, bật LR và chọn ngôn ngữ phụ đề.');
      return;
    }
    const id = new URL(location.href).searchParams.get('v');
    // Không dùng phụ đề video trước trong lúc YouTube chuyển trang.
    if (data.mm?.movieId && String(data.mm.movieId) !== id) {
      stopLoop();
      message('Đang đợi phụ đề của video mới…');
      return;
    }
    if (cues !== data.subtitles || movieId !== id) {
      cues = data.subtitles;
      movieId = id;
      forcedEnds.clear();
      expectedSeek = null;
      rebuild();
    }
    const currentVideo = document.querySelector('video.html5-main-video');
    if (video !== currentVideo) {
      video?.removeEventListener('seeking', onSeek);
      video = currentVideo;
      video?.addEventListener('seeking', onSeek);
      target = null;
    }
    syncNative();
    const time = lr.vidMan.getTime();
    const inAd = document.querySelector('.html5-video-player.ad-showing, .html5-video-player.ad-interrupting');
    if (inAd) {
      target = null;
    } else if (video?.seeking) {
      // Giữ đích của lần seek do chính script tạo; seek bên ngoài đã xử lý ở onSeek.
    } else if (lr.vidMan.getPlaying() || (looping && video?.ended)) {
      if (looping) {
        if (!target) playGroup(groups.find(g => selected.has(g.start)));
        else if (time >= target.end) {
          const choices = groups.filter(g => selected.has(g.start));
          const pos = choices.indexOf(target);
          playGroup(choices[(pos + 1) % choices.length]);
        }
      } else if (autoPause) {
        if (!target) target = nextGroup(groups, time);
        if (target && time >= target.end) {
          lr.vidMan.pause();
          target = null;
        }
      }
    } else if (!looping) target = null;

    if (dirty || performance.now() - lastUI > 650) {
      autoButton.textContent = `Dừng cuối câu: ${autoPause ? 'BẬT' : 'TẮT'}`;
      autoButton.setAttribute('aria-pressed', String(autoPause));
      loopButton.textContent = looping ? '■ Dừng lặp' : '▶ Lặp câu đã chọn';
      loopButton.setAttribute('aria-pressed', String(looping));
      count.textContent = `${selected.size} câu đã chọn`;
      message(looping ? 'Đang lặp các câu đã chọn theo thứ tự video. Space để tạm dừng.' :
        autoPause ? 'Dừng sau cả câu. Space để nghe câu tiếp. AP gốc của LR tạm tắt.' :
        'Sẵn sàng. Bật “Dừng cuối câu” hoặc chọn câu để phát lặp.');
      decorateRows();
      dirty = false;
      lastUI = performance.now();
    }
  }

  // Timer hoạt động cả khi requestAnimationFrame bị chậm trong tab nền.
  setInterval(() => {
    try { update(); }
    catch (error) {
      looping = false;
      target = null;
      releaseNative();
      message('Không tương thích với LR hiện tại. Xem lỗi [LR Sentences] trong Console.');
      console.error('[LR Sentences]', error);
    }
  }, 30);
  window.addEventListener('pagehide', releaseNative);
})();
