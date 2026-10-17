const { contextBridge, ipcRenderer } = require('electron');

/**
 * Restricted Preload API for INEX CLIENT.
 * Keeps contextIsolation enabled and nodeIntegration disabled.
 */
contextBridge.exposeInMainWorld('inexAPI', {
  isElectron: true,

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // Initial Bootstrap State
  getBootstrapState: () => ipcRenderer.invoke('app:bootstrap'),

  // Profiles
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  setActiveProfile: id => ipcRenderer.invoke('profiles:setActive', id),
  createProfile: payload => ipcRenderer.invoke('profiles:create', payload),
  updateProfile: (id, updates) => ipcRenderer.invoke('profiles:update', { id, updates }),
  deleteProfile: id => ipcRenderer.invoke('profiles:delete', id),
  openProfileFolder: id => ipcRenderer.invoke('profiles:openFolder', id),

  // Versions, Loaders & Java
  listVersions: opts => ipcRenderer.invoke('versions:list', opts),
  getSupportedLoaders: mcVersion => ipcRenderer.invoke('loaders:getSupported', mcVersion),
  detectJavaRuntimes: () => ipcRenderer.invoke('java:detect'),
  bundlePortableJava: targetMajor => ipcRenderer.invoke('java:bundle', targetMajor),

  // Installation & Launching
  installProfile: profileId => ipcRenderer.invoke('installer:install', profileId),
  cancelInstallation: profileId => ipcRenderer.invoke('installer:cancel', profileId),
  launchProfile: profileId => ipcRenderer.invoke('launcher:launch', profileId),
  stopProfile: profileId => ipcRenderer.invoke('launcher:stop', profileId),
  getRunningProfiles: () => ipcRenderer.invoke('launcher:getRunning'),

  // Modrinth Content Browser & Management
  searchModrinth: params => ipcRenderer.invoke('modrinth:search', params),
  getModrinthProject: projectId => ipcRenderer.invoke('modrinth:project', projectId),
  installModrinthContent: payload => ipcRenderer.invoke('modrinth:install', payload),
  listInstalledContent: (profileId, projectType) =>
    ipcRenderer.invoke('modrinth:listInstalled', { profileId, projectType }),
  toggleInstalledContent: (profileId, fileName, projectType) =>
    ipcRenderer.invoke('modrinth:toggleInstalled', { profileId, fileName, projectType }),
  removeInstalledContent: (profileId, fileName, projectType) =>
    ipcRenderer.invoke('modrinth:removeInstalled', { profileId, fileName, projectType }),

  // Accounts & Skins / Capes
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  setActiveAccount: accountId => ipcRenderer.invoke('accounts:setActive', accountId),
  addLocalAccount: username => ipcRenderer.invoke('accounts:addLocal', username),
  loginMicrosoftAccount: () => ipcRenderer.invoke('accounts:loginMicrosoft'),
  removeAccount: accountId => ipcRenderer.invoke('accounts:remove', accountId),
  addSkinSlot: name => ipcRenderer.invoke('skins:addSlot', name),
  updateSkinSlot: (slotId, updates) => ipcRenderer.invoke('skins:updateSlot', { slotId, updates }),
  deleteSkinSlot: slotId => ipcRenderer.invoke('skins:deleteSlot', slotId),

  // In-Game HUD Mods Management
  uploadHudMod: () => ipcRenderer.invoke('hud:uploadMod'),
  listHudMods: profileId => ipcRenderer.invoke('hud:list', profileId),

  // Discord Rich Presence
  getDiscordStatus: () => ipcRenderer.invoke('discord:status'),

  // Settings & Directories
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: partial => ipcRenderer.invoke('settings:update', partial),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  selectDirectoryDialog: currentPath => ipcRenderer.invoke('settings:selectDirectory', currentPath),
  selectCustomLogo: () => ipcRenderer.invoke('settings:selectLogo'),
  openDirectoryInExplorer: dirKey => ipcRenderer.invoke('settings:openDirectory', dirKey),

  // Real-time Backend Event Listeners
  onInstallProgress: callback => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('event:install-progress', handler);
    return () => ipcRenderer.removeListener('event:install-progress', handler);
  },
  onGameLog: callback => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('event:game-log', handler);
    return () => ipcRenderer.removeListener('event:game-log', handler);
  },
  onGameExit: callback => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('event:game-exit', handler);
    return () => ipcRenderer.removeListener('event:game-exit', handler);
  }
});
