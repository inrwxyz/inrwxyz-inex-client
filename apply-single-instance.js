#!/usr/bin/env node
// INEX CLIENT — "only one app window" fix.
// Opening the app again now brings the already-running window to the front instead of starting a second copy.
// Touches ONLY: src-tauri/Cargo.toml (+1 line) and src-tauri/src/lib.rs (+1 plugin block). Backups are made first.
'use strict';
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const cargoPath = path.join(root, 'src-tauri', 'Cargo.toml');
const libPath = path.join(root, 'src-tauri', 'src', 'lib.rs');

for (const p of [cargoPath, libPath]) {
  if (!fs.existsSync(p)) { console.error('NOT FOUND: ' + p + '\nRun this from the project folder (the one that contains src-tauri).'); process.exit(1); }
}

const eolOf = s => (s.includes('\r\n') ? '\r\n' : '\n');
let changed = 0;

// ---- Cargo.toml ----
let cargo = fs.readFileSync(cargoPath, 'utf8');
if (cargo.includes('tauri-plugin-single-instance')) {
  console.log('skip     src-tauri/Cargo.toml (already has single-instance)');
} else {
  const eol = eolOf(cargo);
  const anchor = /^tauri-plugin-process\s*=\s*"2"\s*$/m;
  if (!anchor.test(cargo)) { console.error('Could not find the tauri-plugin-process line in Cargo.toml. Nothing changed.'); process.exit(1); }
  fs.writeFileSync(cargoPath + '.bak-before-single-instance', cargo);
  cargo = cargo.replace(anchor, m => m + eol + 'tauri-plugin-single-instance = "2"');
  fs.writeFileSync(cargoPath, cargo);
  console.log('patched  src-tauri/Cargo.toml   (backup: Cargo.toml.bak-before-single-instance)');
  changed++;
}

// ---- lib.rs ----
let lib = fs.readFileSync(libPath, 'utf8');
if (lib.includes('tauri_plugin_single_instance')) {
  console.log('skip     src-tauri/src/lib.rs (already has single-instance)');
} else {
  const eol = eolOf(lib);
  const anchor = 'tauri::Builder::default()';
  if (!lib.includes(anchor)) { console.error('Could not find tauri::Builder::default() in lib.rs. Nothing changed.'); process.exit(1); }
  const block = [
    '',
    '        // Must be the FIRST plugin: a second launch exits right away and just brings the running window to the front.',
    '        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {',
    '            if let Some(w) = app.get_webview_window("main") {',
    '                let _ = w.unminimize();',
    '                let _ = w.show();',
    '                let _ = w.set_focus();',
    '            }',
    '        }))'
  ].join(eol);
  fs.writeFileSync(libPath + '.bak-before-single-instance', lib);
  lib = lib.replace(anchor, anchor + block);
  fs.writeFileSync(libPath, lib);
  console.log('patched  src-tauri/src/lib.rs   (backup: lib.rs.bak-before-single-instance)');
  changed++;
}

console.log(changed ? '\nDONE. Next: npm run dev  (open the app, then open it again -> no 2nd window)' : '\nNothing to do.');
