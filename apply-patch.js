/**
 * INEX CLIENT — apply the "code access" patch (run from the project root):  node apply-patch.js
 * Edits main.js, preload.js, src/index.html IN PLACE (backups: *.bak-before-code-access)
 * and deletes the old friend-system files. If an expected line is not found it STOPS and changes nothing.
 */
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const P = f => path.join(root, f);
const read = f => fs.readFileSync(P(f), 'utf8');
const fail = m => { console.error('\nSTOP — ' + m + '\nNothing was changed.'); process.exit(1); };

for (const f of ['main.js', 'preload.js', 'src/index.html', 'src/main/codeAccess.js', 'src/p2p-link.js', 'src/coaccess-ui.js', 'src/accounts-ui.js'])
  if (!fs.existsSync(P(f))) fail('missing file: ' + f + ' (run this inside the project folder, after extracting the zip)');

const out = {};

/* ---------------- main.js ---------------- */
let m = read('main.js');
if (m.includes('codeAccess')) fail('main.js already patched.');
const need = (re, label) => { if (!re.test(m)) fail('main.js: could not find ' + label); };

need(/const \{ OnlineManager \} = require\('\.\/src\/main\/onlineManager'\);/, 'OnlineManager require');
m = m.replace(/const \{ OnlineManager \} = require\('\.\/src\/main\/onlineManager'\);/, "const { CodeAccess } = require('./src/main/codeAccess');");

need(/const onlineManager = new OnlineManager\([^\n]*\);/, 'new OnlineManager(...)');
m = m.replace(/const onlineManager = new OnlineManager\([^\n]*\);/, 'const codeAccess = new CodeAccess({ settingsManager });');

need(/onlineManager\.setServerProvider\(/, 'setServerProvider');
need(/onlineManager\.setRemoteExecutor\(/, 'setRemoteExecutor');
m = m.replace(/onlineManager\.setServerProvider\(/g, 'codeAccess.setServerProvider(').replace(/onlineManager\.setRemoteExecutor\(/g, 'codeAccess.setRemoteExecutor(');

// events main -> renderer
const evRe = /  onlineManager\.on\('editor-access-request'[\s\S]*?onlineManager\.on\('p2p-kick'[\s\S]*?\n  \}\);\n/;
need(evRe, 'online event wiring (editor-access-request ... p2p-kick)');
m = m.replace(evRe, [
  "  codeAccess.on('state', data => {",
  "    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('event:access-state', data);",
  "  });",
  "  codeAccess.on('p2p-expect', data => {",
  "    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('event:p2p-expect', data);",
  "  });",
  "  codeAccess.on('p2p-kick', data => {",
  "    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('event:p2p-kick', data);",
  "  });",
  ""
].join('\n'));

// IPC handlers
const ipcRe = /  \/\/ ---- Online, Friends[\s\S]*?cohost:respondEditor[^\n]*\n/;
need(ipcRe, 'online/friends/cohost IPC block');
m = m.replace(ipcRe, [
  "  // ---- Code access (one-time code -> P2P Remote Server Editor) ----",
  "  ipcMain.handle('access:status', () => codeAccess.getStatus());",
  "  ipcMain.handle('access:create', (_, serverId) => codeAccess.createCode(serverId));",
  "  ipcMain.handle('access:cancel', () => codeAccess.cancelCode());",
  "  ipcMain.handle('access:disconnect', () => codeAccess.disconnect());",
  "  ipcMain.handle('access:check', (_, code) => codeAccess.check(code));",
  "  ipcMain.handle('p2p:signalSend', (_, role, code, sid, data) => codeAccess.signalSend(role, code, sid, data));",
  "  ipcMain.handle('p2p:signalPoll', (_, role, code, sid) => codeAccess.signalPoll(role, code, sid));",
  "  ipcMain.handle('p2p:end', (_, role, code, sid) => codeAccess.end(role, code, sid));",
  "  ipcMain.handle('p2p:claim', (_, code, sid) => codeAccess.claim(code, sid));",
  "  ipcMain.handle('p2p:hostOpened', (_, code) => codeAccess.hostOpened(code));",
  "  ipcMain.handle('p2p:hostClosed', (_, code) => codeAccess.hostClosed(code));",
  "  ipcMain.handle('p2p:exec', (_, code, method, args) => codeAccess.p2pExec(code, method, args));",
  ""
].join('\n'));

m = m.replace(/onlineManager\.autoStart\(\)/g, 'codeAccess.autoStart()').replace(/onlineManager\.shutdown\(\)/g, 'codeAccess.shutdown()');
if (/onlineManager|OnlineManager/.test(m)) {
  const i = m.search(/onlineManager|OnlineManager/);
  fail('main.js still mentions the old online manager near: ' + m.slice(Math.max(0, i - 60), i + 80).replace(/\n/g, ' '));
}
out['main.js'] = m;

/* ---------------- preload.js ---------------- */
let p = read('preload.js');
const preRe = /  \/\/ Online \(optional password[\s\S]*?onEditorAccessRequest:[^\n]*\n/;
if (!preRe.test(p)) fail('preload.js: could not find the old Online/Friends/P2P block');
p = p.replace(preRe, [
  "  // Code access (one-time code -> P2P Remote Server Editor)",
  "  accessStatus: () => ipcRenderer.invoke('access:status'),",
  "  accessCreate: serverId => ipcRenderer.invoke('access:create', serverId),",
  "  accessCancel: () => ipcRenderer.invoke('access:cancel'),",
  "  accessDisconnect: () => ipcRenderer.invoke('access:disconnect'),",
  "  accessCheck: code => ipcRenderer.invoke('access:check', code),",
  "  p2pSignalSend: (role, code, sid, data) => ipcRenderer.invoke('p2p:signalSend', role, code, sid, data),",
  "  p2pSignalPoll: (role, code, sid) => ipcRenderer.invoke('p2p:signalPoll', role, code, sid),",
  "  p2pEnd: (role, code, sid) => ipcRenderer.invoke('p2p:end', role, code, sid),",
  "  p2pClaim: (code, sid) => ipcRenderer.invoke('p2p:claim', code, sid),",
  "  p2pHostOpened: code => ipcRenderer.invoke('p2p:hostOpened', code),",
  "  p2pHostClosed: code => ipcRenderer.invoke('p2p:hostClosed', code),",
  "  p2pExec: (code, method, args) => ipcRenderer.invoke('p2p:exec', code, method, args),",
  "  onP2PExpect: cb => ipcRenderer.on('event:p2p-expect', (_, data) => cb(data)),",
  "  onP2PKick: cb => ipcRenderer.on('event:p2p-kick', (_, data) => cb(data)),",
  "  onAccessState: cb => ipcRenderer.on('event:access-state', (_, data) => cb(data)),",
  ""
].join('\n'));
if (/onlineStatus|friendsList|cohost|onEditorAccessRequest|onlineLogin|onlineClaim/.test(p)) fail('preload.js still has old friend/online entries.');
out['preload.js'] = p;

/* ---------------- src/index.html ---------------- */
let h = read('src/index.html');
const tagRe = /[ \t]*<script src="online-ui\.js"><\/script>\r?\n/;
if (!tagRe.test(h)) fail('src/index.html: <script src="online-ui.js"> not found');
h = h.replace(tagRe, '  <script src="accounts-ui.js"></script>\n');
out['src/index.html'] = h;

/* ---------------- write everything ---------------- */
for (const f of Object.keys(out)) {
  fs.copyFileSync(P(f), P(f) + '.bak-before-code-access');
  fs.writeFileSync(P(f), out[f], 'utf8');
  console.log('patched  ' + f + '   (backup: ' + f + '.bak-before-code-access)');
}
for (const f of ['src/online-ui.js', 'src/main/onlineManager.js']) {
  if (fs.existsSync(P(f))) { fs.unlinkSync(P(f)); console.log('deleted  ' + f); }
}
console.log('\nDONE. Next: node scripts/prepare.js  (or: npm run tauri build / npm run dev)');
