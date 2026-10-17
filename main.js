const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Ensure Windows taskbar displays "INEX CLIENT" instead of "Electron"
app.setName('INEX CLIENT');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.inexclient.launcher');
}
process.title = 'INEX CLIENT';

const { SettingsManager } = require('./src/main/settingsManager');
const { ProfileManager } = require('./src/main/profileManager');
const { VersionManager } = require('./src/main/versionManager');
const { JavaManager } = require('./src/main/javaManager');
const { LoaderManager } = require('./src/main/loaderManager');
const { MinecraftInstaller } = require('./src/main/installer');
const { MinecraftLauncher } = require('./src/main/launcher');
const { ModrinthManager } = require('./src/main/modrinthManager');
const { AccountManager, MS_REDIRECT_URI } = require('./src/main/accountManager');
const { DiscordRpcManager } = require('./src/main/discordRpcManager');
const { inspectHudJar, checkHudCompat } = require('./src/main/hudJar');
const { initAppUpdater } = require('./src/main/appUpdater');

let mainWindow = null;
let appUpdater = null;

// Initialize modular backend services
const settingsManager = new SettingsManager();
const profileManager = new ProfileManager(settingsManager);
const versionManager = new VersionManager(settingsManager);
const javaManager = new JavaManager(settingsManager);
const loaderManager = new LoaderManager(settingsManager);
const accountManager = new AccountManager(settingsManager);
const discordRpcManager = new DiscordRpcManager(settingsManager);
const installer = new MinecraftInstaller({
  settingsManager,
  versionManager,
  loaderManager,
  javaManager,
  profileManager
});
const launcher = new MinecraftLauncher({
  settingsManager,
  profileManager,
  versionManager,
  loaderManager,
  javaManager,
  accountManager,
  installer,
  discordRpcManager
});
const modrinthManager = new ModrinthManager({
  settingsManager,
  profileManager
});

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 780,
    minWidth: 1024,
    minHeight: 660,
    frame: false,
    backgroundColor: '#050508',
    title: 'INEX CLIENT',
    icon: path.join(__dirname, 'src', 'inex-logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function registerIpcHandlers() {
  const syncCosmeticsToAllProfiles = () => {
    try {
      const { profiles } = profileManager.listProfiles();
      for (const p of profiles || []) {
        if (p && p.gameDir) {
          accountManager.applyLocalCosmeticsToGameDir(p.gameDir);
        }
      }
    } catch (_) {}
  };

  ipcMain.handle('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }
    mainWindow.maximize();
    return true;
  });

  ipcMain.handle('window:close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle('app:checkUpdate', () => (appUpdater ? appUpdater.check() : { skipped: true }));
  ipcMain.handle('app:version', () => app.getVersion());

  ipcMain.handle('app:bootstrap', async () => {
    const settings = settingsManager.getSettings();
    const profilesState = profileManager.listProfiles();
    const accountsState = accountManager.listAccounts();
    const javaRuntimes = javaManager.detectInstalledRuntimes();
    const versionsData = await versionManager.listVersions({ includeSnapshots: settings.showSnapshots });
    const runningProfileIds = launcher.getRunningProfiles();
    const discordStatus = discordRpcManager.getStatus();

    discordRpcManager.setLauncherMenuPresence(profileManager.getActiveProfile());

    return {
      settings,
      profilesState,
      accountsState,
      javaRuntimes,
      versionsData,
      runningProfileIds,
      discordStatus
    };
  });

  // Profile IPC
  ipcMain.handle('profiles:list', () => profileManager.listProfiles());
  ipcMain.handle('profiles:setActive', (_, id) => {
    const res = profileManager.setActiveProfile(String(id));
    discordRpcManager.setLauncherMenuPresence(profileManager.getActiveProfile());
    return res;
  });
  ipcMain.handle('profiles:create', (_, payload) => {
    const res = profileManager.createProfile(payload);
    discordRpcManager.setLauncherMenuPresence(profileManager.getActiveProfile());
    return res;
  });
  ipcMain.handle('profiles:update', (_, { id, updates }) => {
    const res = profileManager.updateProfile(String(id), updates);
    discordRpcManager.setLauncherMenuPresence(profileManager.getActiveProfile());
    return res;
  });
  ipcMain.handle('profiles:delete', (_, id) => {
    const res = profileManager.deleteProfile(String(id));
    discordRpcManager.setLauncherMenuPresence(profileManager.getActiveProfile());
    return res;
  });
  ipcMain.handle('profiles:openFolder', async (_, id) => {
    const profile = profileManager.getProfileById(String(id));
    if (!profile) throw new Error('Profile not found.');
    fs.mkdirSync(profile.gameDir, { recursive: true });
    await shell.openPath(profile.gameDir);
    return { opened: true, path: profile.gameDir };
  });

  // Versions, Loaders & Java IPC
  ipcMain.handle('versions:list', (_, opts) => versionManager.listVersions(opts || {}));
  ipcMain.handle('loaders:getSupported', (_, mcVersion) =>
    loaderManager.getSupportedLoadersForVersion(String(mcVersion || '1.21.4'))
  );
  ipcMain.handle('java:detect', () => javaManager.detectInstalledRuntimes());
  ipcMain.handle('java:bundle', async (_, targetMajor) => {
    const runtime = await javaManager.bundlePortableJavaRuntime(Number(targetMajor) || 21, progress => {
      sendToRenderer('event:install-progress', progress);
    });
    return {
      bundled: runtime,
      runtimes: javaManager.detectInstalledRuntimes()
    };
  });

  // Installation & Launch IPC
  ipcMain.handle('installer:install', async (_, profileId) => {
    return await installer.installProfile(String(profileId), progress => {
      sendToRenderer('event:install-progress', progress);
    });
  });

  ipcMain.handle('installer:cancel', (_, profileId) => {
    return installer.cancelInstallation(String(profileId));
  });

  ipcMain.handle('launcher:launch', async (_, profileId) => {
    const res = await launcher.launchProfile(String(profileId), {
      onProgress: progress => sendToRenderer('event:install-progress', progress),
      onLog: logEntry => sendToRenderer('event:game-log', logEntry),
      onExit: exitInfo => sendToRenderer('event:game-exit', exitInfo)
    });

    const closeBehavior = settingsManager.getSettings().closeBehavior;
    if (closeBehavior === 'minimize' && mainWindow) {
      mainWindow.minimize();
    } else if (closeBehavior === 'close' && mainWindow) {
      mainWindow.close();
    }
    return res;
  });

  ipcMain.handle('launcher:stop', (_, profileId) => launcher.stopGame(String(profileId)));
  ipcMain.handle('launcher:getRunning', () => launcher.getRunningProfiles());

  // Modrinth IPC
  ipcMain.handle('modrinth:search', (_, params) => modrinthManager.searchProjects(params || {}));
  ipcMain.handle('modrinth:project', (_, projectId) => modrinthManager.getProjectDetails(String(projectId)));
  ipcMain.handle('modrinth:install', async (_, payload) => {
    return await modrinthManager.installProject(payload, progress => {
      sendToRenderer('event:install-progress', progress);
    });
  });
  ipcMain.handle('modrinth:listInstalled', (_, { profileId, projectType }) =>
    modrinthManager.listInstalledContent(String(profileId), String(projectType || 'mod'))
  );
  ipcMain.handle('modrinth:toggleInstalled', (_, { profileId, fileName, projectType }) =>
    modrinthManager.toggleInstalledContent({
      profileId: String(profileId),
      fileName: String(fileName),
      projectType: String(projectType || 'mod')
    })
  );
  ipcMain.handle('modrinth:removeInstalled', (_, { profileId, fileName, projectType }) =>
    modrinthManager.removeInstalledContent({
      profileId: String(profileId),
      fileName: String(fileName),
      projectType: String(projectType || 'mod')
    })
  );

  // Accounts & Skins / Capes IPC
  ipcMain.handle('accounts:list', () => accountManager.listAccounts());
  ipcMain.handle('accounts:setActive', (_, accountId) => accountManager.setActiveAccount(String(accountId)));
  ipcMain.handle('accounts:addLocal', (_, username) => accountManager.addLocalAccount(String(username)));
  ipcMain.handle('accounts:remove', (_, accountId) => accountManager.removeAccount(String(accountId)));

  ipcMain.handle('accounts:loginMicrosoft', async () => {
    return new Promise((resolve, reject) => {
      const authWin = new BrowserWindow({
        width: 520,
        height: 680,
        parent: mainWindow || undefined,
        modal: true,
        title: 'Sign in with Microsoft — INEX CLIENT',
        backgroundColor: '#0b0b0f',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      const loginUrl = accountManager.getMicrosoftLoginUrl();
      let completed = false;

      const handleRedirect = async urlStr => {
        if (completed) return;
        if (urlStr.startsWith(MS_REDIRECT_URI)) {
          const parsed = new URL(urlStr);
          const code = parsed.searchParams.get('code');
          const err = parsed.searchParams.get('error_description') || parsed.searchParams.get('error');
          completed = true;
          authWin.close();
          if (err) {
            reject(new Error(`Microsoft sign-in cancelled or failed: ${err}`));
            return;
          }
          try {
            const updatedAccounts = await accountManager.completeMicrosoftOAuthCode(code);
            resolve(updatedAccounts);
          } catch (authErr) {
            reject(authErr);
          }
        }
      };

      authWin.webContents.on('will-redirect', (_, url) => handleRedirect(url));
      authWin.webContents.on('did-navigate', (_, url) => handleRedirect(url));
      authWin.on('closed', () => {
        if (!completed) {
          reject(new Error('Microsoft sign-in window was closed before completion.'));
        }
      });

      authWin.loadURL(loginUrl);
    });
  });

  ipcMain.handle('skins:addSlot', (_, name) => {
    const res = accountManager.addSkinSlot(name);
    syncCosmeticsToAllProfiles();
    return res;
  });
  ipcMain.handle('skins:updateSlot', (_, { slotId, updates }) => {
    const res = accountManager.updateSkinSlot(String(slotId), updates || {});
    syncCosmeticsToAllProfiles();
    return res;
  });
  ipcMain.handle('skins:deleteSlot', (_, slotId) => {
    const res = accountManager.deleteSkinSlot(String(slotId));
    syncCosmeticsToAllProfiles();
    return res;
  });

  // In-Game HUD Mods Management
  ipcMain.handle('hud:list', (_, profileId) => {
    const prof = profileId ? profileManager.getProfileById(profileId) : profileManager.getActiveProfile();
    return { dir: profileManager.getHudModsDir(), jars: profileManager.listHudJars(prof) };
  });

  ipcMain.handle('hud:uploadMod', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select In-Game HUD Mod (.jar) — INEX CLIENT',
      filters: [{ name: 'Minecraft Mod JAR', extensions: ['jar'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) {
      return { canceled: true };
    }
    const chosenFile = result.filePaths[0];
    const fileName = path.basename(chosenFile);
    const info = inspectHudJar(chosenFile);
    if (!info.kind) {
      return { canceled: false, rejected: true, reason: info.error };
    }
    const destDir = profileManager.getHudModsDir();
    fs.mkdirSync(destDir, { recursive: true });
    const destFile = path.join(destDir, fileName);
    fs.copyFileSync(chosenFile, destFile);

    const activeProf = profileManager.getActiveProfile();
    let compat = { ok: true, reason: '' };
    if (activeProf && activeProf.loader !== 'vanilla') {
      compat = checkHudCompat(info, activeProf.loader, activeProf.version);
      profileManager.attachDefaultClientMods(activeProf);
    }
    return { canceled: false, fileName, path: destFile, kind: info.kind, compatible: compat.ok, reason: compat.reason };
  });

  // Discord Rich Presence IPC
  ipcMain.handle('discord:status', () => discordRpcManager.getStatus());

  // Settings IPC
  ipcMain.handle('settings:get', () => settingsManager.getSettings());
  ipcMain.handle('settings:update', (_, partial) => {
    const updated = settingsManager.updateSettings(partial);
    if (partial.enableSkinSync !== undefined) {
      syncCosmeticsToAllProfiles();
    }
    if (partial.discordRpcEnabled !== undefined || partial.discordClientId !== undefined || partial.discordStatusText !== undefined) {
      if (updated.discordRpcEnabled) {
        discordRpcManager.start();
        discordRpcManager.setLauncherMenuPresence(profileManager.getActiveProfile());
      } else {
        discordRpcManager.stop();
      }
    }
    return updated;
  });
  ipcMain.handle('settings:reset', () => {
    const reset = settingsManager.resetSettings();
    discordRpcManager.start();
    return reset;
  });

  ipcMain.handle('settings:selectDirectory', async (_, currentPath) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Directory — INEX CLIENT',
      defaultPath: currentPath || settingsManager.getSettings().gameDataDir,
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths.length) {
      return { canceled: true };
    }
    return { canceled: false, path: result.filePaths[0] };
  });

  ipcMain.handle('settings:selectLogo', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Custom INEX Logo (PNG) — INEX CLIENT',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) {
      return { canceled: true };
    }
    const chosenFile = result.filePaths[0];
    const targetLogoPath = path.join(__dirname, 'src', 'inex-logo.png');
    const buf = fs.readFileSync(chosenFile);
    const ext = path.extname(chosenFile).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
    settingsManager.updateSettings({ customLogoDataUrl: dataUrl });
    try { fs.writeFileSync(targetLogoPath, buf); } catch (_) {}
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.setIcon(targetLogoPath);
      } catch (_) {}
    }
    return { canceled: false, dataUrl, path: chosenFile };
  });

  ipcMain.handle('settings:openDirectory', async (_, dirKey) => {
    const currentSettings = settingsManager.getSettings();
    const allowedKeys = {
      gameDataDir: currentSettings.gameDataDir,
      installDir: currentSettings.installDir,
      configDir: currentSettings.configDir,
      javaDir: currentSettings.javaDir,
      hudModsDir: profileManager.getHudModsDir()
    };
    const targetPath = allowedKeys[dirKey];
    if (!targetPath) {
      throw new Error(`Invalid directory key: ${dirKey}`);
    }
    fs.mkdirSync(targetPath, { recursive: true });
    await shell.openPath(targetPath);
    return { opened: true, path: targetPath };
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();
  discordRpcManager.start();
  appUpdater = initAppUpdater({ getWindow: () => mainWindow, sendToRenderer });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  discordRpcManager.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});