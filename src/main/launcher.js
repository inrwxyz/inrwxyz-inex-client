const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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

  _supportsSkinAgent(version) {
    const v = String(version || '').trim();
    if (/^2[6-9]w/i.test(v)) return true;
    const major = parseInt(v.split('.')[0], 10);
    return Number.isFinite(major) && major >= 26;
  }

  _prepareSkinAgent(settings) {
    try {
      const name = 'inex-cosmetics-agent.jar';
      const target = path.join(settings.configDir, 'agent', name);
      const candidates = [
        path.join(__dirname, 'agent', name),
        path.join(__dirname, '..', 'agent', name),
        path.join(__dirname, name),
        path.join(__dirname, '..', name)
      ];
      const src = candidates.find(p => fs.existsSync(p));
      if (src) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(src, target);
      }
      return fs.existsSync(target) ? target : null;
    } catch (_) {
      return null;
    }
  }

  buildLaunchArguments({ profile, mergedMeta, account, settings, javaMajor = 21 }) {
    const gameDataDir = settings.gameDataDir;
    const librariesDir = path.join(gameDataDir, 'libraries');
    const versionDir = path.join(gameDataDir, 'versions', profile.version);
    const nativesDir = path.join(versionDir, 'natives');
    const assetsDir = path.join(gameDataDir, 'assets');
    const assetIndexId = (mergedMeta.assetIndex && mergedMeta.assetIndex.id) || profile.version;
    const clientJarPath = path.join(versionDir, `${profile.version}.jar`);

    const { classpathEntries } = this.installer.collectRequiredLibraries(mergedMeta, 'windows');
    const cpSeparator = process.platform === 'win32' ? ';' : ':';

    const isSkinSyncEnabled = settings.enableSkinSync !== false;

    // Only include cosmeticsOverrideJar if Skin Sync is ON and it exists (for older <26 versions)
    const cosmeticsOverrideJar = (isSkinSyncEnabled && profile.gameDir)
      ? path.join(profile.gameDir, 'inex-cosmetics-override.jar')
      : null;
    const hasCosmeticsOverride = Boolean(cosmeticsOverrideJar && fs.existsSync(cosmeticsOverrideJar));

    const orderedClasspath = [
      ...(hasCosmeticsOverride ? [cosmeticsOverrideJar] : []),
      ...classpathEntries,
      clientJarPath
    ];
    const fullClasspath = [...new Set(orderedClasspath)].join(cpSeparator);

    const ramMB = profile.ramMB || settings.defaultRamMB || 4096;
    const minRamMB = Math.min(2048, Math.max(1024, Math.floor(ramMB / 2)));

    // High-FPS optimized JVM arguments (prevents GC pauses & stutters)
    const jvmArgs = [
      '-XX:+IgnoreUnrecognizedVMOptions',
      '-XX:+UnlockExperimentalVMOptions',
      `-Xmx${ramMB}M`,
      `-Xms${minRamMB}M`,
      '-XX:+UseG1GC',
      '-XX:+ParallelRefProcEnabled',
      '-XX:MaxGCPauseMillis=37',
      '-XX:+DisableExplicitGC',
      '-XX:+AlwaysPreTouch',
      '-XX:G1NewSizePercent=20',
      '-XX:G1ReservePercent=20',
      '-XX:G1HeapRegionSize=32M',
      '-XX:G1MixedGCCountTarget=4',
      '-XX:InitiatingHeapOccupancyPercent=15',
      '-XX:G1MixedGCLiveThresholdPercent=90',
      '-Dsun.rmi.dgc.server.gcInterval=2147483646'
    ];

    // STRICT CHECK: ONLY attach Java Skin Agent when Skin Sync is ON!
    // When OFF, zero agent is attached -> 100% disconnected from Firebase, default skins for everyone, MAX FPS!
    if (isSkinSyncEnabled && this._supportsSkinAgent(profile.version)) {
      const agentJar = this._prepareSkinAgent(settings);
      if (agentJar) {
        const activeSlot = this.accountManager.getActiveSkinSlot ? this.accountManager.getActiveSkinSlot() : { model: 'slim' };
        const localSkinFile = path.join(profile.gameDir, 'inex-local-skin.png');
        const dbUrl = settings.skinDatabaseUrl || 'https://inex-cosmetics-default-rtdb.firebaseio.com/cosmetics/';

        jvmArgs.push(
          '-Dinex.skin.online=true',
          `-Dinex.skin.self=${String(account.username || 'Player').toLowerCase()}`,
          `-Dinex.skin.selfFile=${localSkinFile}`,
          `-Dinex.skin.selfModel=${activeSlot.model || 'slim'}`,
          `-Dinex.skin.db=${dbUrl}`,
          `-javaagent:${agentJar}`
        );
      }
    }

    if (javaMajor >= 21) {
      jvmArgs.push('--enable-native-access=ALL-UNNAMED');
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
        // Skip duplicate GC flags from Mojang manifest so our optimized GC flags take priority
        if (entry.startsWith('-XX:+UseG1GC') || entry.startsWith('-XX:MaxGCPauseMillis') || entry.startsWith('-XX:G1')) continue;
        const resolved = replaceVars(entry);
        if (!resolved.includes('${') && !jvmArgs.includes(resolved)) {
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
      gameArgs = mergedMeta.minecraftArguments.split(/\s+/).map(replaceVars);
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

  async launchProfile(profileId, { onProgress = () => {}, onLog = () => {}, onExit = () => {} } = {}) {
    const profile = this.profileManager.getProfileById(profileId);
    if (!profile) {
      throw new Error('No profile selected. Please create or select a profile first.');
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
      throw new Error(`Cannot launch: ${profile.loader.toUpperCase()} mainClass (${mergedMeta.mainClass}) is invalid for Minecraft${profile.version}.`);
    }

    const requiredJava = this.versionManager.getRequiredJavaMajor(profile.version, mergedMeta);
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
    const isSkinSyncEnabled = settings.enableSkinSync !== false;

    try {
      this.accountManager.applyLocalCosmeticsToGameDir(profile.gameDir, profile.version);
      onLog({
        profileId: profile.id,
        level: 'info',
        line: isSkinSyncEnabled
          ? '[INEX SKIN] Online Skin Sync ENABLED (Firebase Cloud & Skin Agent Active).'
          : '[INEX FPS BOOST] Skin Sync is OFF — Firebase & Skin Agent 100% disabled for Max FPS!'
      });
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

    const { fullArgs } = this.buildLaunchArguments({
      profile,
      mergedMeta,
      account,
      settings,
      javaMajor: javaResolution.runtime.major
    });

    onLog({
      profileId: profile.id,
      level: 'info',
      line: `[INEX] Launching Minecraft ${profile.version} (${profile.loader.toUpperCase()}) with Java${javaResolution.runtime.major}...`
    });

    const child = spawn(javaResolution.runtime.path, fullArgs, {
      cwd: profile.gameDir,
      windowsHide: false
    });

    this.runningProcesses.set(profile.id, child);
    this.profileManager.updateProfile(profile.id, { lastPlayed: new Date().toISOString() });

    if (this.discordRpcManager) {
      this.discordRpcManager.setPlayingGamePresence(profile, account);
    }

    // Throttled log buffer so heavy Minecraft console output never lags Electron IPC or the CPU
    let logQueue = [];
    let logTimer = null;
    const flushLogs = () => {
      logTimer = null;
      if (logQueue.length === 0) return;
      const batch = logQueue.splice(0, 15);
      logQueue = [];
      for (const item of batch) {
        onLog(item);
      }
    };

    const queueLog = (level, chunk) => {
      const lines = String(chunk).split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        logQueue.push({ profileId: profile.id, level, line });
      }
      if (!logTimer) {
        logTimer = setTimeout(flushLogs, 200);
      }
    };

    child.stdout.on('data', chunk => queueLog('info', chunk));
    child.stderr.on('data', chunk => queueLog('error', chunk));

    child.on('error', err => {
      if (logTimer) clearTimeout(logTimer);
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
      if (logTimer) clearTimeout(logTimer);
      flushLogs();
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
      java: javaResolution.runtime,
      account: {
        username: account.username,
        type: account.type
      }
    };
  }
}

module.exports = { MinecraftLauncher };