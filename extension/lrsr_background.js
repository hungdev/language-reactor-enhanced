(() => {
  const ALLOWED_HOSTS = new Set(['dictionary.cambridge.org', 'api.dictionaryapi.dev', 'translate.google.com']);
  const TAB_HOSTS = new Set(['dictionary.cambridge.org']);
  const FORBIDDEN_HEADERS = /^(referer|cookie|host|origin|user-agent|content-length|connection)$/i;
  const RULE_ID = 91001;

  chrome.declarativeNetRequest
    .updateSessionRules({
      removeRuleIds: [RULE_ID],
      addRules: [
        {
          id: RULE_ID,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [{ header: 'Referer', operation: 'set', value: 'https://dictionary.cambridge.org/' }],
          },
          condition: {
            urlFilter: '||dictionary.cambridge.org/',
            resourceTypes: ['xmlhttprequest'],
            tabIds: [chrome.tabs.TAB_ID_NONE],
          },
        },
      ],
    })
    .catch((e) => console.warn('[LRSR] referer rule', e));

  function bufToB64(buf) {
    const bytes = new Uint8Array(buf);
    let str = '';
    for (let i = 0; i < bytes.length; i += 0x8000) str += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(str);
  }

  function parseHttps(url, hosts) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && hosts.has(u.hostname) ? u : null;
    } catch (_) {
      return null;
    }
  }

  async function doXhr(data) {
    const u = parseHttps(data.url, ALLOWED_HOSTS);
    if (!u) return { error: 'FORBIDDEN' };
    const headers = {};
    for (const [k, v] of Object.entries(data.headers || {})) if (!FORBIDDEN_HEADERS.test(k)) headers[k] = String(v);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), data.timeout || 15000);
    try {
      const r = await fetch(u.href, { method: data.method === 'HEAD' ? 'HEAD' : 'GET', headers, credentials: 'include', signal: ctrl.signal });
      const out = { status: r.status, finalUrl: r.url };
      if (data.responseType === 'arraybuffer') out.b64 = bufToB64(await r.arrayBuffer());
      else out.text = await r.text();
      return out;
    } catch (e) {
      return { error: e && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK' };
    } finally {
      clearTimeout(timer);
    }
  }

  async function openTab(data, sender) {
    const u = parseHttps(data.url, TAB_HOSTS);
    if (!u) return { error: 'FORBIDDEN' };
    const props = { url: u.href, active: !!data.active };
    if (sender.tab) {
      props.openerTabId = sender.tab.id;
      props.index = sender.tab.index + 1;
    }
    const tab = await chrome.tabs.create(props);
    const { lrsrOpenedTabs = [] } = await chrome.storage.session.get('lrsrOpenedTabs');
    await chrome.storage.session.set({ lrsrOpenedTabs: lrsrOpenedTabs.concat(tab.id).slice(-50) });
    return { tabId: tab.id };
  }

  async function closeTab(tabId) {
    const { lrsrOpenedTabs = [] } = await chrome.storage.session.get('lrsrOpenedTabs');
    if (!lrsrOpenedTabs.includes(tabId)) return;
    await chrome.storage.session.set({ lrsrOpenedTabs: lrsrOpenedTabs.filter((id) => id !== tabId) });
    chrome.tabs.remove(tabId).catch(() => {});
  }

  async function handle(msg, sender) {
    const data = msg.data || {};
    if (msg.op === 'xhr') return doXhr(data);
    if (msg.op === 'openTab') return openTab(data, sender).catch(() => ({ error: 'TAB' }));
    if (msg.op === 'closeTab') return closeTab(data.tabId);
    return { error: 'UNKNOWN_OP' };
  }

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'lrsr' || !port.sender || port.sender.id !== chrome.runtime.id) return;
    port.onMessage.addListener(async (msg) => {
      if (!msg || msg.id == null) return;
      const result = await handle(msg, port.sender);
      try {
        port.postMessage({ id: msg.id, result });
      } catch (_) {}
    });
  });
})();
