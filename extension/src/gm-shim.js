const __LRSR_CH = '__lrsr_ext';
const __lrsrCache = Object.create(null);
const __lrsrListeners = new Map();
const __lrsrPending = new Map();
let __lrsrSeq = 0;
let __lrsrReadyResolve;
const __lrsrReady = new Promise((resolve) => (__lrsrReadyResolve = resolve));

const unsafeWindow = window;

function __lrsrClone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function __lrsrSend(msg) {
  window.postMessage(Object.assign({ [__LRSR_CH]: 'toBridge' }, msg), location.origin);
}

function __lrsrCall(op, data) {
  return new Promise((resolve) => {
    const id = ++__lrsrSeq;
    __lrsrPending.set(id, resolve);
    __lrsrSend({ op, id, data });
  });
}

function __lrsrNotify(key, oldV, newV, remote) {
  for (const l of __lrsrListeners.values()) {
    if (l.key !== key) continue;
    try {
      l.cb(key, __lrsrClone(oldV), __lrsrClone(newV), remote);
    } catch (e) {
      console.error('[LRSR] value listener', e);
    }
  }
}

window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || e.data[__LRSR_CH] !== 'toMain') return;
  const m = e.data;
  if (m.op === 'init') {
    Object.assign(__lrsrCache, m.values || {});
    __lrsrReadyResolve();
  } else if (m.op === 'change') {
    const old = __lrsrCache[m.key];
    __lrsrCache[m.key] = m.value;
    __lrsrNotify(m.key, old, m.value, true);
  } else if (m.op === 'reply') {
    const resolve = __lrsrPending.get(m.id);
    if (!resolve) return;
    __lrsrPending.delete(m.id);
    resolve(m.result || { error: 'NETWORK' });
  }
});

function GM_getValue(key, def) {
  return key in __lrsrCache ? __lrsrClone(__lrsrCache[key]) : def;
}

function GM_setValue(key, value) {
  const old = __lrsrCache[key];
  const v = __lrsrClone(value);
  __lrsrCache[key] = v;
  __lrsrSend({ op: 'set', key, value: v });
  __lrsrNotify(key, old, v, false);
}

function GM_addValueChangeListener(key, cb) {
  const id = ++__lrsrSeq;
  __lrsrListeners.set(id, { key, cb });
  return id;
}

function GM_removeValueChangeListener(id) {
  __lrsrListeners.delete(id);
}

function GM_xmlhttpRequest(details) {
  const data = {
    url: String(details.url),
    method: details.method || 'GET',
    headers: details.headers || {},
    responseType: details.responseType || 'text',
    timeout: details.timeout || 0,
  };
  __lrsrCall('xhr', data).then((r) => {
    if (r.error === 'TIMEOUT') return details.ontimeout && details.ontimeout(r);
    if (r.error) return details.onerror && details.onerror(r);
    if (details.onload) {
      details.onload({
        status: r.status,
        finalUrl: r.finalUrl,
        responseText: r.text != null ? r.text : '',
        response: data.responseType === 'arraybuffer' ? r.buffer : r.text,
      });
    }
  });
}

function GM_openInTab(url, opts) {
  const o = typeof opts === 'boolean' ? { active: !opts } : opts || {};
  const p = __lrsrCall('openTab', { url: String(url), active: !!o.active });
  return {
    close() {
      p.then((r) => r && r.tabId != null && __lrsrSend({ op: 'closeTab', tabId: r.tabId }));
    },
  };
}

__lrsrSend({ op: 'hello' });
setTimeout(() => __lrsrReadyResolve(), 3000);
