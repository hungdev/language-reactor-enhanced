const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const LR_DIR = path.join(root, '6.0.0_0');
const DIST = path.join(root, 'dist');
const OUT_DIR = path.join(DIST, 'LanguageReactor-SentenceReplay');
const LRSR_HOSTS = ['https://dictionary.cambridge.org', 'https://api.dictionaryapi.dev', 'https://translate.google.com'];
const MATCHES = ['https://www.youtube.com/*', 'https://dictionary.cambridge.org/*'];

const userscript = fs.readFileSync(path.join(root, 'LanguageReactor_SentenceReplay.user.js'), 'utf8');
const shim = fs.readFileSync(path.join(__dirname, 'src', 'gm-shim.js'), 'utf8');
const version = (userscript.match(/^\/\/\s*@version\s+(\S+)/m) || [])[1] || '?';
const body = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.cpSync(LR_DIR, OUT_DIR, { recursive: true, filter: (src) => path.basename(src) !== '_metadata' });

fs.writeFileSync(
  path.join(OUT_DIR, 'lrsr_main.js'),
  ['(function () {', "'use strict';", shim, '__lrsrReady.then(function () {', body, '});', '})();', ''].join('\n'),
);
fs.copyFileSync(path.join(__dirname, 'lrsr_bridge.js'), path.join(OUT_DIR, 'lrsr_bridge.js'));
fs.copyFileSync(path.join(__dirname, 'lrsr_background.js'), path.join(OUT_DIR, 'lrsr_background.js'));
fs.writeFileSync(path.join(OUT_DIR, 'lrsr_sw.js'), "importScripts('background.min.js', 'lrsr_background.js');\n");

const manifestPath = path.join(OUT_DIR, 'manifest.json');
const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const lrBg = m.background.service_worker;

delete m.update_url;
m.name = m.name + ' + Sentence Replay';
m.background = { service_worker: 'lrsr_sw.js', scripts: [lrBg, 'lrsr_background.js'] };
m.permissions = Array.from(new Set((m.permissions || []).concat('declarativeNetRequestWithHostAccess')));
m.host_permissions = Array.from(new Set((m.host_permissions || []).concat(LRSR_HOSTS.map((h) => h + '/*'))));
m.content_security_policy.extension_pages = m.content_security_policy.extension_pages.replace(
  /connect-src ([^;]*)/,
  (all, list) => 'connect-src ' + list + ' ' + LRSR_HOSTS.join(' '),
);
m.content_scripts.push(
  { matches: MATCHES, js: ['lrsr_bridge.js'], run_at: 'document_start', world: 'ISOLATED' },
  { matches: MATCHES, js: ['lrsr_main.js'], run_at: 'document_idle', world: 'MAIN' },
);
fs.writeFileSync(manifestPath, JSON.stringify(m, null, 3) + '\n');

console.log('Built ' + path.relative(root, OUT_DIR) + ' (LR ' + m.version + ' + LRSR ' + version + ')');

const zipName = 'LanguageReactor-' + m.version + '-SentenceReplay-' + version + '.zip';
const zipPath = path.join(DIST, zipName);
fs.rmSync(zipPath, { force: true });
execFileSync('zip', ['-rqX', zipName, path.basename(OUT_DIR), '-x', '*.DS_Store'], { cwd: DIST });
console.log('Zipped ' + path.relative(root, zipPath));
