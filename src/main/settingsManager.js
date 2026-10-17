const fs = require('fs');
const path = require('path');
const os = require('os');

const DISCORD_CLIENT_ID = '1560619751607247011';
const DEFAULT_SKIN_DB_URL = 'https://inex-cosmetics-default-rtdb.firebaseio.com/cosmetics/';

class SettingsManager {
  constructor(baseDataDir) {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

    this.configDir = baseDataDir || path.join(appData, 'InexClient');
    this.settingsFile = path.join(this.configDir, 'settings.json');

    this.defaults = {
      fullscreen: false,
      windowWidth: 1280,
      windowHeight: 720,
      defaultRamMB: 4096,
      maxRamMB: this._detectSystemRamMB(),
      concurrentDownloads: 8,
      closeBehavior: 'keep-open',
      autoJavaProvision: true,
      showSnapshots: false,
      // Performance & Skin Sync Controls
      enableSkinSync: true,
      launcherAnimations: true,
      skinDatabaseUrl: DEFAULT_SKIN_DB_URL,
      // Discord Rich Presence
      discordRpcEnabled: true,
      discordClientId: DISCORD_CLIENT_ID,
      discordStatusText: 'INEX CLIENT',
      // Glassmorphism UI customization
      glassIntensity: 24,
      customLogoDataUrl: '',
      // Directories
      gameDataDir: path.join(appData, '.inexclient'),
      installDir: path.join(localAppData, 'InexClient'),
      configDir: this.configDir,
      javaDir: path.join(this.configDir, 'runtimes'),
      customJavaPath: '',
      activeHudJar: '',
      jvmExtraArgs: '-XX:+IgnoreUnrecognizedVMOptions -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M'
    };

    this.settings = this._load();
    this._ensureDirectories();
  }

  _detectSystemRamMB() {
    const totalBytes = os.totalmem();
    const totalMB = Math.floor(totalBytes / (1024 * 1024));
    return Math.max(16384, Math.min(65536, totalMB));
  }

  _ensureDirectories() {
    const dirs = [
      this.configDir,
      this.settings.gameDataDir,
      this.settings.installDir,
      this.settings.javaDir,
      path.join(this.settings.gameDataDir, 'versions'),
      path.join(this.settings.gameDataDir, 'libraries'),
      path.join(this.settings.gameDataDir, 'assets', 'indexes'),
      path.join(this.settings.gameDataDir, 'assets', 'objects'),
      path.join(this.settings.gameDataDir, 'profiles'),
      path.join(this.configDir, 'cache'),
      path.join(this.configDir, 'skins'),
      path.join(this.configDir, 'hud-mods')
    ];
    for (const dir of dirs) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (_) {}
    }
  }

  _load() {
    try {
      fs.mkdirSync(this.configDir, { recursive: true });
      if (fs.existsSync(this.settingsFile)) {
        const raw = fs.readFileSync(this.settingsFile, 'utf8');
        const parsed = JSON.parse(raw);
        const validated = this._validate({ ...this.defaults, ...parsed });
        this._saveToFile(validated);
        return validated;
      }
    } catch (err) {
      console.error('[SettingsManager] Failed to load settings, using defaults:', err.message);
    }
    const initial = { ...this.defaults };
    this._saveToFile(initial);
    return initial;
  }

  _validate(input) {
    const validated = { ...this.defaults, ...(input || {}) };

    validated.fullscreen = Boolean(input.fullscreen);

    const width = Number(input.windowWidth);
    validated.windowWidth = Number.isFinite(width) ? Math.max(640, Math.min(7680, Math.round(width))) : 1280;

    const height = Number(input.windowHeight);
    validated.windowHeight = Number.isFinite(height) ? Math.max(480, Math.min(4320, Math.round(height))) : 720;

    const ram = Number(input.defaultRamMB);
    validated.defaultRamMB = Number.isFinite(ram) ? Math.max(1024, Math.min(validated.maxRamMB, Math.round(ram / 256) * 256)) : 4096;

    const conc = Number(input.concurrentDownloads);
    validated.concurrentDownloads = Number.isFinite(conc) ? Math.max(1, Math.min(32, Math.round(conc))) : 8;

    const validBehaviors = ['keep-open', 'minimize', 'close'];
    validated.closeBehavior = validBehaviors.includes(input.closeBehavior) ? input.closeBehavior : 'keep-open';

    validated.autoJavaProvision = input.autoJavaProvision !== undefined ? Boolean(input.autoJavaProvision) : true;
    validated.showSnapshots = Boolean(input.showSnapshots);

    validated.enableSkinSync = input.enableSkinSync !== undefined ? Boolean(input.enableSkinSync) : true;
    validated.launcherAnimations = input.launcherAnimations !== undefined ? Boolean(input.launcherAnimations) : true;
    validated.skinDatabaseUrl = typeof input.skinDatabaseUrl === 'string' && input.skinDatabaseUrl.trim()
      ? input.skinDatabaseUrl.trim()
      : DEFAULT_SKIN_DB_URL;

    validated.discordRpcEnabled = input.discordRpcEnabled !== undefined ? Boolean(input.discordRpcEnabled) : true;
    validated.discordClientId = DISCORD_CLIENT_ID;
    validated.discordStatusText = typeof input.discordStatusText === 'string' && input.discordStatusText.trim()
      ? input.discordStatusText.trim()
      : this.defaults.discordStatusText;

    const glass = Number(input.glassIntensity);
    validated.glassIntensity = Number.isFinite(glass) ? Math.max(8, Math.min(40, Math.round(glass))) : 24;

    validated.customLogoDataUrl = typeof input.customLogoDataUrl === 'string' ? input.customLogoDataUrl : '';

    if (typeof input.gameDataDir === 'string' && input.gameDataDir.trim()) {
      validated.gameDataDir = path.resolve(input.gameDataDir.trim());
    }
    if (typeof input.installDir === 'string' && input.installDir.trim()) {
      validated.installDir = path.resolve(input.installDir.trim());
    }
    if (typeof input.configDir === 'string' && input.configDir.trim()) {
      validated.configDir = path.resolve(input.configDir.trim());
    }
    if (typeof input.javaDir === 'string' && input.javaDir.trim()) {
      validated.javaDir = path.resolve(input.javaDir.trim());
    }
    validated.customJavaPath = typeof input.customJavaPath === 'string' ? input.customJavaPath.trim() : '';
    validated.jvmExtraArgs = typeof input.jvmExtraArgs === 'string' ? input.jvmExtraArgs.trim() : this.defaults.jvmExtraArgs;

    validated.activeHudJar = typeof input.activeHudJar === 'string' ? input.activeHudJar.trim() : '';
    delete validated.hudConfig;

    return validated;
  }

  _saveToFile(data) {
    try {
      fs.mkdirSync(this.configDir, { recursive: true });
      const tmpFile = `${this.settingsFile}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpFile, this.settingsFile);
    } catch (err) {
      console.error('[SettingsManager] Failed to save settings:', err.message);
    }
  }

  getSettings() {
    return { ...this.settings };
  }

  updateSettings(partial) {
    if (!partial || typeof partial !== 'object') {
      throw new Error('Invalid settings payload');
    }
    this.settings = this._validate({ ...this.settings, ...partial });
    this._ensureDirectories();
    this._saveToFile(this.settings);
    return this.getSettings();
  }

  resetSettings() {
    this.settings = { ...this.defaults };
    this._ensureDirectories();
    this._saveToFile(this.settings);
    return this.getSettings();
  }
}

module.exports = { SettingsManager, DISCORD_CLIENT_ID, DEFAULT_SKIN_DB_URL };