(() => {
  const CH = '__lrsr_ext';
  const NS = 'lrsr:';
  const SRC = 'lrsr_src:';
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  let seq = 0;
  let port = null;
  let reqSeq = 0;
  const pending = new Map();

  const toMain = (msg) => window.postMessage(Object.assign({ [CH]: 'toMain' }, msg), location.origin);

  const b64ToBuf = (b64) => {
    const str = atob(b64);
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i);
    return out.buffer;
  };

  const getPort = () => {
    if (port) return port;
    port = chrome.runtime.connect({ name: 'lrsr' });
    port.onMessage.addListener((m) => {
      const resolve = m && pending.get(m.id);
      if (!resolve) return;
      pending.delete(m.id);
      resolve(m.result);
    });
    port.onDisconnect.addListener(() => {
      port = null;
      for (const resolve of pending.values()) resolve({ error: 'NETWORK' });
      pending.clear();
    });
    return port;
  };

  const toBackground = (op, data) =>
    new Promise((resolve) => {
      const id = ++reqSeq;
      pending.set(id, resolve);
      try {
        getPort().postMessage({ id, op, data });
      } catch (_) {
        pending.delete(id);
        resolve({ error: 'NETWORK' });
      }
    });

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data[CH] !== 'toBridge') return;
    const m = e.data;
    switch (m.op) {
      case 'hello': {
        const all = await chrome.storage.local.get(null);
        const values = {};
        for (const k of Object.keys(all)) if (k.startsWith(NS)) values[k.slice(NS.length)] = all[k];
        toMain({ op: 'init', values });
        break;
      }
      case 'set':
        chrome.storage.local.set({ [NS + m.key]: m.value, [SRC + m.key]: token + ':' + ++seq });
        break;
      case 'xhr': {
        const r = (await toBackground('xhr', m.data)) || { error: 'NETWORK' };
        if (r.b64 != null) {
          r.buffer = b64ToBuf(r.b64);
          delete r.b64;
        }
        toMain({ op: 'reply', id: m.id, result: r });
        break;
      }
      case 'openTab':
        toMain({ op: 'reply', id: m.id, result: await toBackground('openTab', m.data) });
        break;
      case 'closeTab':
        toBackground('closeTab', { tabId: m.tabId });
        break;
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const k of Object.keys(changes)) {
      if (!k.startsWith(NS)) continue;
      const key = k.slice(NS.length);
      const src = changes[SRC + key];
      if (src && String(src.newValue).startsWith(token + ':')) continue;
      toMain({ op: 'change', key, value: changes[k].newValue });
    }
  });
})();
