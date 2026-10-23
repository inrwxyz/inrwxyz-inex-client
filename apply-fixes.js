/**
 * INEX CLIENT — small fixes (run from the project root):  node apply-fixes.js
 *  1) Skin Sync pill: only "SKIN SYNC" + the on/off switch (no "ON • CLOUD SYNC" text)
 *  2) The big "CAPE PRESETS ..." block -> one small line
 *  3) Game keeps running when the launcher is closed (spawn detached)
 * Edits files in place (backup: *.bak-before-fixes). If a line is not found it STOPS and changes nothing.
 */
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const P = f => path.join(root, f);
const fail = m => { console.error('\nSTOP — ' + m + '\nNothing was changed.'); process.exit(1); };
const files = { html: 'src/index.html', launcher: 'src/main/launcher.js' };
for (const f of Object.values(files)) if (!fs.existsSync(P(f))) fail('missing file: ' + f + ' (run this inside the project folder)');

/* ---- index.html ---- */
let h = fs.readFileSync(P(files.html), 'utf8');
const syncRe = /[ \t]*<span class="sync-sub" id="skinSyncStateText">[^<]*<\/span>\r?\n/;
if (!syncRe.test(h)) fail('index.html: the "ON • CLOUD SYNC" text was not found (already fixed?)');
h = h.replace(syncRe, '');

const capeRe = /([ \t]*)<div class="cape-customizer-card"[\s\S]*?<\/div>\s*<\/div>\r?\n/;
if (!capeRe.test(h)) fail('index.html: the CAPE PRESETS block was not found (already fixed?)');
h = h.replace(capeRe, (_, ind) => ind + '<div id="capeLine" style="font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--text-secondary);padding:2px 4px;">CAPE UPLOAD · coming soon</div>\n');

/* ---- launcher.js ---- */
let l = fs.readFileSync(P(files.launcher), 'utf8');
if (/detached:\s*true/.test(l)) fail('launcher.js: already has detached: true (already fixed?)');
const spawnRe = /(const child = spawn\(javaResolution\.runtime\.path, fullArgs, \{\s*cwd: profile\.gameDir,\s*windowsHide: false)(\s*\}\);)/;
if (!spawnRe.test(l)) fail('launcher.js: the game spawn(...) call was not found');
l = l.replace(spawnRe, '$1,\n      detached: true // keep the game running even if the launcher is closed$2');
const setRe = /this\.runningProcesses\.set\(profile\.id, child\);/;
if (!setRe.test(l)) fail('launcher.js: runningProcesses.set(...) was not found');
l = l.replace(setRe, 'this.runningProcesses.set(profile.id, child);\n    try { child.unref(); } catch (_) {}');

for (const [f, txt] of [[files.html, h], [files.launcher, l]]) {
  fs.copyFileSync(P(f), P(f) + '.bak-before-fixes');
  fs.writeFileSync(P(f), txt, 'utf8');
  console.log('patched  ' + f + '   (backup: ' + f + '.bak-before-fixes)');
}
console.log('\nDONE.');
