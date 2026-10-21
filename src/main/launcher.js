const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SERVER_ADDR_RE = /^[A-Za-z0-9.\-]+(:\d{1,5})?$/;

class MinecraftLauncher {
  constructor({ settingsManager, profileManager, versionManager, loaderManager, javaManager, accountManager, installer, discordRpcManager }) {
    this.settingsManager = settingsManager;
    this.profileManager = profileManager;
    this.versionManager = versionManager;
    this.loaderManager = loaderManager;
    this.javaManager = javaManager;
    this.accountManager = accountManager;
    this.installer = installer;
    this.discordRpcManager = discordRpcManager || null;

    this.runningProcesses = new Map();
  }

  isProfileRunning(profileId) {
    return this.runningProcesses.has(profileId);
  }

  getRunningProfiles() {
    return Array.from(this.runningProcesses.keys());
  }

  stopGame(profileId) {
    const proc = this.runningProcesses.get(profileId);
    if (!proc) {
      return { stopped: false, message: 'No active game process found for this profile.' };
    }
    try {
      proc.kill('SIGTERM');
      this.runningProcesses.delete(profileId);
      if (this.discordRpcManager) {
        this.discordRpcManager.setLauncherMenuPresence(this.profileManager.getActiveProfile());
      }
      return { stopped: true, profileId };
    } catch (err) {
      return { stopped: false, message: err.message };
    }
  }

  _findCosmeticsAgentJar() {
    const resourcesPath = process.resourcesPath || '';
    const candidates = [
      path.join(resourcesPath, 'app.asar.unpacked', 'src', 'main', 'agent', 'inex-cosmetics-agent.jar'),
      path.join(__dirname, 'agent', 'inex-cosmetics-agent.jar'),
      path.join(__dirname, 'inex-cosmetics-agent.jar'),
      path.join(__dirname, '..', 'inex-cosmetics-agent.jar'),
      path.join(__dirname, '..', '..', 'inex-cosmetics-agent.jar'),
      path.join(resourcesPath, 'inex-cosmetics-agent.jar'),
      path.join(resourcesPath, 'app.asar.unpacked', 'inex-cosmetics-agent.jar')
    ];
    for (const c of candidates) {
      try {
        if (c && fs.existsSync(c)) return c;
      } catch (_) {}
    }
    return null;
  }

  _isQuickPlaySupported(mcVersion) {
    const v = String(mcVersion || '').trim();
    const m = v.match(/^(\d+)\.(\d+)/);
    if (!m) return true;
    const major = Number(m[1]);
    const minor = Number(m[2]);
    if (major > 1) return true; // e.g. 26.3
    return major === 1 && minor >= 20;
  }

  buildLaunchArguments({ profile, mergedMeta, account, settings, javaMajor = 21, joinServer = null }) {
    const gameDataDir = settings.gameDataDir;
    const librariesDir = path.join(gameDataDir, 'libraries');
    const versionDir = path.join(gameDataDir, 'versions', profile.version);
    const nativesDir = path.join(versionDir, 'natives');
    const assetsDir = path.join(gameDataDir, 'assets');
    const assetIndexId = (mergedMeta.assetIndex && mergedMeta.assetIndex.id) || profile.version;
    const clientJarPath = path.join(versionDir, `${profile.version}.jar`);

    const { classpathEntries } = this.installer.collectRequiredLibraries(mergedMeta, 'windows');
    const cpSeparator = process.platform === 'win32' ? ';' : ':';

    const overrideJar = path.join(profile.gameDir, 'inex-cosmetics-override.jar');
    const orderedClasspath = [
      ...(fs.existsSync(overrideJar) ? [overrideJar] : []),
      ...classpathEntries,
      clientJarPath
    ];
    const fullClasspath = [...new Set(orderedClasspath)].join(cpSeparator);

    const ramMB = profile.ramMB || settings.defaultRamMB || 4096;
    const minRamMB = Math.min(1024, Math.floor(ramMB / 2));

    const extraJvm = (settings.jvmExtraArgs || '')
      .split(/\s+/)
      .map(s => s.trim())
      .filter(Boolean);

    const jvmArgs = [
      '-XX:+IgnoreUnrecognizedVMOptions',
      `-Xmx${ramMB}M`,
      `-Xms${minRamMB}M`
    ];

    if (javaMajor >= 21) {
      jvmArgs.push('--enable-native-access=ALL-UNNAMED');
    }

    for (const flag of extraJvm) {
      if (!jvmArgs.includes(flag)) {
        jvmArgs.push(flag);
      }
    }

    if (settings.enableSkinSync !== false) {
      const agentJar = this._findCosmeticsAgentJar();
      if (agentJar) {
        jvmArgs.push(
          `-javaagent:${agentJar}`,
          '-Dinex.skin.online=true',
          `-Dinex.skin.settingsFile=${path.join(profile.gameDir, 'inex-cosmetics-settings.txt')}`,
          `-Dinex.skin.self=${(account.username || '').toLowerCase()}`
        );
      }
    }

    const templateVars = {
      auth_player_name: account.username || 'Player',
      version_name: mergedMeta.id || profile.version,
      game_directory: profile.gameDir,
      assets_root: assetsDir,
      assets_index_name: assetIndexId,
      auth_uuid: account.uuid || '00000000-0000-0000-0000-000000000000',
      auth_access_token: account.accessToken || '0',
      clientid: 'inex-client',
      auth_xuid: account.xuid || '0',
      user_type: account.type === 'microsoft' ? 'msa' : 'legacy',
      auth_player_type: account.type === 'microsoft' ? 'msa' : 'legacy',
      auth_session: account.accessToken || '0',
      game_assets: assetsDir,
      user_properties: '{}',
      profile_name: profile.name || 'INEX',
      version_type: `INEX-${(profile.loader || 'vanilla').toUpperCase()}`,
      resolution_width: String(settings.windowWidth || 1280),
      resolution_height: String(settings.windowHeight || 720),
      natives_directory: nativesDir,
      launcher_name: 'INEX-CLIENT',
      launcher_version: '2.0.0',
      classpath: fullClasspath,
      library_directory: librariesDir,
      classpath_separator: cpSeparator
    };

    const replaceVars = str =>
      String(str).replace(/\$\{([^}]+)\}/g, (_, key) =>
        templateVars[key] !== undefined ? templateVars[key] : `\${${key}}`
      );

    if (mergedMeta.arguments && Array.isArray(mergedMeta.arguments.jvm)) {
      const rawJvmList = mergedMeta.arguments.jvm;
      for (let i = 0; i < rawJvmList.length; i++) {
        const entry = rawJvmList[i];
        if (typeof entry !== 'string') continue;
        if (entry === '-cp' || entry === '-classpath') {
          i++;
          continue;
        }
        if (entry.startsWith('-Djava.library.path=')) continue;
        const resolved = replaceVars(entry);
        if (!resolved.includes('${')) {
          jvmArgs.push(resolved);
        }
      }
    }

    jvmArgs.push(
      `-Djava.library.path=${nativesDir}`,
      `-Dorg.lwjgl.librarypath=${nativesDir}`,
      '-Dminecraft.launcher.brand=INEX-CLIENT',
      '-Dminecraft.launcher.version=2.0.0',
      '-cp',
      fullClasspath
    );

    const mainClass = mergedMeta.mainClass || 'net.minecraft.client.main.Main';

    let gameArgs = [];
    if (mergedMeta.minecraftArguments) {
      gameArgs = mergedMeta.minecraftArguments
        .split(/\s+/)
        .map(replaceVars);
    } else {
      gameArgs = [
        '--username', templateVars.auth_player_name,
        '--version', templateVars.version_name,
        '--gameDir', templateVars.game_directory,
        '--assetsDir', templateVars.assets_root,
        '--assetIndex', templateVars.assets_index_name,
        '--uuid', templateVars.auth_uuid,
        '--accessToken', templateVars.auth_access_token,
        '--userType', templateVars.user_type,
        '--versionType', templateVars.version_type
      ];

      if (mergedMeta.arguments && Array.isArray(mergedMeta.arguments.game)) {
        const extraTokens = mergedMeta.arguments.game
          .filter(a => typeof a === 'string')
          .map(a => replaceVars(a));
        gameArgs = this._mergeGameArgs(gameArgs, extraTokens);
      }
    }

    if (settings.fullscreen) {
      gameArgs.push('--fullscreen');
    } else {
      gameArgs.push('--width', String(settings.windowWidth || 1280));
      gameArgs.push('--height', String(settings.windowHeight || 720));
    }

    if (joinServer !== null && joinServer !== undefined && String(joinServer).trim() !== '') {
      const cleanAddr = String(joinServer).trim();
      if (!SERVER_ADDR_RE.test(cleanAddr)) {
        throw new Error(`Invalid server address: "${cleanAddr}"`);
      }
      const [host, portStr] = cleanAddr.split(':');
      const port = portStr || '25565';
      if (this._isQuickPlaySupported(profile.version)) {
        gameArgs.push('--quickPlayMultiplayer', `${host}:${port}`);
      } else {
        gameArgs.push('--server', host, '--port', String(port));
      }
    }

    return {
      jvmArgs,
      mainClass,
      gameArgs,
      fullArgs: [...jvmArgs, mainClass, ...gameArgs]
    };
  }

  _mergeGameArgs(baseArgs, extraTokens) {
    const result = [...baseArgs];
    const existing = new Set(baseArgs.filter(a => String(a).startsWith('--')));
    for (let i = 0; i < extraTokens.length; i++) {
      const tok = extraTokens[i];
      if (!String(tok).startsWith('--')) continue;
      const next = extraTokens[i + 1];
      const hasValue = next !== undefined && !String(next).startsWith('--');
      if (hasValue) i++;
      if (existing.has(tok)) continue;
      if (hasValue && String(next).includes('${')) continue;
      if (tok.includes('${')) continue;
      existing.add(tok);
      result.push(tok);
      if (hasValue) result.push(next);
    }
    return result;
  }

  async launchProfile(profileId, { joinServer = null, onProgress = () => {}, onLog = () => {}, onExit = () => {} } = {}) {
    const profile = profileId ? this.profileManager.getProfileById(profileId) : this.profileManager.getActiveProfile();
    if (!profile) {
      throw new Error('No profile selected. Please create or select a profile first.');
    }

    if (joinServer !== null && joinServer !== undefined && String(joinServer).trim() !== '') {
      if (!SERVER_ADDR_RE.test(String(joinServer).trim())) {
        throw new Error('Invalid server address.');
      }
    }

    if (this.isProfileRunning(profile.id)) {
      throw new Error(`"${profile.name}" is already running.`);
    }

    const attachedHudJars = this.profileManager.attachDefaultClientMods(profile);
    if (attachedHudJars.length > 0) {
      onLog({
        profileId: profile.id,
        level: 'info',
        line: `[INEX HUD] Attached HUD mod(s): ${attachedHudJars.join(', ')}`
      });
    }
    for (const sk of (this.profileManager.lastHudSkipped || [])) {
      onLog({ profileId: profile.id, level: 'warn', line: `[INEX HUD] Skipped ${sk.fileName}: ${sk.reason}` });
    }

    if (!this.profileManager.verifyInstallationState(profile)) {
      onLog({
        profileId: profile.id,
        level: 'info',
        line: `[INEX] Verifying & installing ${profile.loader.toUpperCase()} runtime for "${profile.name}"...`
      });
      await this.installer.installProfile(profile.id, onProgress);
    }

    const gameDataDir = this.settingsManager.getSettings().gameDataDir;
    const versionDir = path.join(gameDataDir, 'versions', profile.version);
    const effectivePath = path.join(versionDir, `effective-${profile.loader || 'vanilla'}.json`);

    let mergedMeta = null;
    if (fs.existsSync(effectivePath)) {
      try {
        const candidate = JSON.parse(fs.readFileSync(effectivePath, 'utf8'));
        const freshEnough = profile.loader === 'vanilla' || (candidate._inexRev || 0) >= 4;
        if (freshEnough && this.loaderManager.isValidLoaderMainClass(profile.loader, candidate.mainClass)) {
          mergedMeta = candidate;
        }
      } catch (_) {}
    }

    if (!mergedMeta) {
      await this.installer.installProfile(profile.id, onProgress);
      const vanillaMeta = await this.versionManager.resolveVersionMetadata(profile.version);
      const loaderMeta = profile.loader !== 'vanilla'
        ? await this.loaderManager.resolveLoaderProfile(profile.version, profile.loader, profile.loaderVersion)
        : null;
      mergedMeta = this.loaderManager.mergeWithVanillaMetadata(vanillaMeta, loaderMeta);
      fs.writeFileSync(effectivePath, JSON.stringify(mergedMeta, null, 2), 'utf8');
    }

    if (!this.loaderManager.isValidLoaderMainClass(profile.loader, mergedMeta.mainClass)) {
      throw new Error(`Cannot launch: ${profile.loader.toUpperCase()} mainClass (${mergedMeta.mainClass}) is invalid for Minecraft ${profile.version}.`);
    }

    const requiredJava = this.versionManager.getRequiredJavaMajor(profile.version, mergedMeta);
    onLog({
      profileId: profile.id,
      level: 'info',
      line: `[INEX] Verifying Java ${requiredJava} runtime for Minecraft ${profile.version}...`
    });
    const javaResolution = await this.javaManager.ensureJavaForVersion(
      requiredJava,
      profile.javaRuntime,
      prog => {
        onProgress({
          profileId: profile.id,
          profileName: profile.name,
          stage: prog.stage,
          percent: prog.percent,
          detail: prog.detail
        });
      }
    );

    if (!javaResolution.found || !javaResolution.compatible) {
      throw new Error(
        `${javaResolution.message} Click "Bundle Portable Java" in Settings or enable Auto-Bundle Java.`
      );
    }

    fs.mkdirSync(profile.gameDir, { recursive: true });
    const settings = this.settingsManager.getSettings();

    try {
      this.accountManager.applyLocalCosmeticsToGameDir(profile.gameDir);
      if (settings.enableSkinSync === false) {
        onLog({
          profileId: profile.id,
          level: 'info',
          line: '[INEX COSMETICS] Skin Sync is OFF (Max FPS). Firebase & custom cosmetics disabled; using default skins.'
        });
      } else {
        onLog({
          profileId: profile.id,
          level: 'info',
          line: '[INEX COSMETICS] Skin synced to the INEX cosmetics database.'
        });
      }
    } catch (cosmErr) {
      onLog({
        profileId: profile.id,
        level: 'warn',
        line: `[INEX COSMETICS] Notice: ${cosmErr.message}`
      });
    }

    const account = this.accountManager.getActiveAccount() || {
      username: 'Player',
      uuid: '00000000-0000-0000-0000-000000000000',
      type: 'local',
      accessToken: '0'
    };

    const { fullArgs, mainClass } = this.buildLaunchArguments({
      profile,
      mergedMeta,
      account,
      settings,
      javaMajor: javaResolution.runtime.major,
      joinServer
    });

    try {
      const { classpathEntries } = this.installer.collectRequiredLibraries(mergedMeta, 'windows');
      const missing = classpathEntries.filter(p => !fs.existsSync(p));
      if (missing.length > 0) {
        onLog({ profileId: profile.id, level: 'warn', line: `[INEX] WARNING: ${missing.length} library file(s) missing on disk:` });
        for (const m of missing.slice(0, 8)) {
          onLog({ profileId: profile.id, level: 'warn', line: `[INEX]   missing -> ${m}` });
        }
      }
      if (profile.loader === 'forge') {
        const hasJopt = classpathEntries.some(p => /jopt-simple/i.test(p));
        onLog({ profileId: profile.id, level: hasJopt ? 'info' : 'warn', line: `[INEX] jopt-simple in classpath: ${hasJopt ? 'yes' : 'NO (Forge will crash)'}` });
      }
    } catch (_) {}

    onLog({
      profileId: profile.id,
      level: 'info',
      line: `[INEX] Launching Minecraft ${profile.version} (${profile.loader.toUpperCase()}) with Java ${javaResolution.runtime.major} (${javaResolution.runtime.version} @ ${javaResolution.runtime.path})...`
    });
    if (joinServer) {
      onLog({
        profileId: profile.id,
        level: 'info',
        line: `[INEX] Auto-joining server: ${joinServer}`
      });
    }

    const child = spawn(javaResolution.runtime.path, fullArgs, {
      cwd: profile.gameDir,
      windowsHide: false
    });

    this.runningProcesses.set(profile.id, child);
    this.profileManager.updateProfile(profile.id, { lastPlayed: new Date().toISOString() });

    if (this.discordRpcManager) {
      this.discordRpcManager.setPlayingGamePresence(profile, account);
    }

    child.stdout.on('data', chunk => {
      const lines = String(chunk).split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        onLog({ profileId: profile.id, level: 'info', line });
      }
    });

    child.stderr.on('data', chunk => {
      const lines = String(chunk).split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        onLog({ profileId: profile.id, level: 'error', line });
      }
    });

    child.on('error', err => {
      this.runningProcesses.delete(profile.id);
      if (this.discordRpcManager) {
        this.discordRpcManager.setLauncherMenuPresence(this.profileManager.getActiveProfile());
      }
      onLog({
        profileId: profile.id,
        level: 'error',
        line: `[INEX] Process spawn error: ${err.message}`
      });
      onExit({ profileId: profile.id, code: -1, error: err.message });
    });

    child.on('close', code => {
      this.runningProcesses.delete(profile.id);
      if (this.discordRpcManager) {
        this.discordRpcManager.setLauncherMenuPresence(this.profileManager.getActiveProfile());
      }
      onLog({
        profileId: profile.id,
        level: code === 0 ? 'info' : 'warn',
        line: `[INEX] Minecraft process exited with code ${code}`
      });
      onExit({ profileId: profile.id, code });
    });

    return {
      launched: true,
      pid: child.pid,
      profileId: profile.id,
      profileName: profile.name,
      joinServer: joinServer || null,
      java: javaResolution.runtime,
      account: {
        username: account.username,
        type: account.type
      }
    };
  }
}

module.exports = { MinecraftLauncher };