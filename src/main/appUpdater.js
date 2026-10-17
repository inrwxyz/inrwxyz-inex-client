// Free auto-update via GitHub Releases (electron-updater). No own server needed.
// Flow: launcher starts -> checks latest GitHub Release -> downloads in background ->
// asks the user "Restart now?" -> installs. Users never download a new .exe by hand.
const { app, dialog } = require('electron');

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch (_) {
  autoUpdater = null; // dev mode / dependency not installed -> updater is silently skipped
}

function initAppUpdater({ getWindow, sendToRenderer, log = console }) {
  if (!autoUpdater) {
    log.warn('[INEX UPDATE] electron-updater not installed, skipping.');
    return { check: async () => ({ skipped: true }) };
  }
  if (!app.isPackaged) {
    // Updates only work in the installed (.exe) build.
    return { check: async () => ({ skipped: true, reason: 'dev' }) };
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // also installs when user simply closes the launcher
  autoUpdater.logger = null;

  const emit = (stage, extra = {}) => {
    try { sendToRenderer('event:app-update', { stage, ...extra }); } catch (_) {}
  };

  autoUpdater.on('checking-for-update', () => emit('checking'));
  autoUpdater.on('update-available', info => emit('available', { version: info && info.version }));
  autoUpdater.on('update-not-available', () => emit('none'));
  autoUpdater.on('download-progress', p => emit('downloading', { percent: Math.round(p.percent || 0) }));
  autoUpdater.on('error', err => {
    log.warn('[INEX UPDATE] ' + (err && err.message));
    emit('error', { message: err && err.message });
  });

  autoUpdater.on('update-downloaded', async info => {
    emit('ready', { version: info && info.version });
    const win = getWindow();
    const opts = {
      type: 'info',
      buttons: ['Restart & update', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'INEX CLIENT update',
      message: `Version ${info && info.version} is ready.`,
      detail: 'Restart the launcher to finish updating. If you pick Later, it installs when you close the launcher.'
    };
    const res = win && !win.isDestroyed()
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts);
    if (res.response === 0) autoUpdater.quitAndInstall(false, true);
  });

  const check = async () => {
    try { return await autoUpdater.checkForUpdates(); }
    catch (e) { log.warn('[INEX UPDATE] check failed: ' + e.message); return { error: e.message }; }
  };

  // check shortly after start, then every 2 hours while the launcher stays open
  setTimeout(check, 5000);
  setInterval(check, 2 * 60 * 60 * 1000);
  return { check };
}

module.exports = { initAppUpdater };
