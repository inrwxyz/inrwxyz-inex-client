#!/usr/bin/env node
// (One-off helper, already run) Rebuilds scripts/assets/updater-ui.js from the update card in src/main/appUpdater.js.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const srcText = fs.readFileSync(path.join(root, 'src', 'main', 'appUpdater.js'), 'utf8');
const start = srcText.indexOf('function overlayScript(state) {');
const end = srcText.indexOf('function initAppUpdater');
if (start < 0 || end < 0) throw new Error('overlayScript not found in appUpdater.js');
let fn = srcText.slice(start, end).trimEnd();
fn = fn
  .replace("console.log('${INSTALL_MSG}')", `window.dispatchEvent(new CustomEvent("inex-update",{detail:"install"}))`)
  .replace("console.log('${LATER_MSG}')", `window.dispatchEvent(new CustomEvent("inex-update",{detail:"later"}))`)
  .replace("' is ready</div>'", "' is available</div>'")
  .replace('Update v\'+(s.version||\'\')+\' is ready', 'Update v\'+(s.version||\'\')+\' is available')
  .replace('Restart &amp; install', 'Update now');
fs.writeFileSync(path.join(root, 'scripts', 'assets', 'updater-ui.js'), `/* Update card + Tauri updater wiring. Card markup/CSS comes from the old Electron appUpdater.js. */
(function () {
  'use strict';
  var T = window.__TAURI__;
  if (!T || !T.updater) return;
  var OVERLAY_ID = 'inex-update-overlay';
  ${fn.replace(/\n/g, '\n  ')}

  var pending = null;
  var busy = false;
  function draw(state) { try { (0, eval)(overlayScript(state)); } catch (e) { console.error(e); } }

  window.addEventListener('inex-update', function (ev) {
    if (ev.detail === 'later') { draw({ stage: 'hide' }); return; }
    if (ev.detail !== 'install' || !pending || busy) return;
    busy = true;
    var total = 0, got = 0, version = pending.version;
    draw({ stage: 'downloading', percent: 0, version: version });
    pending.downloadAndInstall(function (e) {
      if (e.event === 'Started') total = (e.data && e.data.contentLength) || 0;
      else if (e.event === 'Progress') {
        got += (e.data && e.data.chunkLength) || 0;
        draw({ stage: 'downloading', percent: total ? Math.min(100, Math.round(got * 100 / total)) : 0, version: version });
      } else if (e.event === 'Finished') draw({ stage: 'installing' });
    }).then(function () {
      // On Windows the installer takes over and closes the launcher itself; relaunch only matters elsewhere.
      if (T.process && T.process.relaunch) return T.process.relaunch();
    }).catch(function (err) {
      console.error('[update]', err);
      busy = false;
      draw({ stage: 'hide' });
    });
  });

  function check() {
    if (busy) return;
    T.updater.check().then(function (u) {
      if (u) { pending = u; draw({ stage: 'ready', version: u.version }); }
    }).catch(function (e) { console.warn('[update] check failed', e); });
  }
  setTimeout(check, 5000);
  setInterval(check, 2 * 60 * 60 * 1000);
})();
`);
console.log('gen-updater-ui: wrote scripts/assets/updater-ui.js');
