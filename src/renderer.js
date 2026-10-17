/**
 * INEX CLIENT - Renderer Application Controller (V2)
 */
(function () {
  'use strict';

  const PRESET_VERSION_CARDS = [
    {
      id: '26.3',
      title: '26.3',
      subtitle: 'The Next Dimension',
      badge: 'LATEST',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
    },
    {
      id: '26.2',
      title: '26.2',
      subtitle: 'Garden & Deep Trials',
      badge: 'STABLE',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>'
    },
    {
      id: '1.21.4',
      title: '1.21.4',
      subtitle: 'The Garden Awakens',
      badge: 'LTS',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
    },
    {
      id: '1.21.1',
      title: '1.21.1',
      subtitle: 'Tricky Trials',
      badge: 'POPULAR',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
    },
    {
      id: '1.20.4',
      title: '1.20.4',
      subtitle: 'Trails & Tales',
      badge: 'MODDED',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>'
    },
    {
      id: '1.19.4',
      title: '1.19.4',
      subtitle: 'The Wild Update',
      badge: 'LEGACY',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>'
    },
    {
      id: '1.16.5',
      title: '1.16.5',
      subtitle: 'Nether Update',
      badge: 'FORGE',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>'
    },
    {
      id: '1.8.9',
      title: '1.8.9',
      subtitle: 'Bountiful PvP',
      badge: 'PVP',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/></svg>'
    }
  ];

  function ensureCyberSlotStyles() {
    if (document.getElementById('inex-cyber-slot-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'inex-cyber-slot-styles';
    styleEl.textContent = [
      '@keyframes cyberSlotPop {',
      '  0% { opacity: 0; transform: translateY(8px) scale(0.98); }',
      '  100% { opacity: 1; transform: translateY(0) scale(1); }',
      '}',
      '@keyframes cyberSpinSlow {',
      '  0% { transform: rotate(0deg); }',
      '  100% { transform: rotate(360deg); }',
      '}',
      '@keyframes cyberCorePulse {',
      '  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 4px rgba(225, 29, 72, 0.7)); }',
      '  50% { transform: scale(1.16); filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.9)); }',
      '}',
      '.cyber-sync-pill {',
      '  display: inline-flex; align-items: center; gap: 10px; padding: 5px 12px 5px 8px;',
      '  border-radius: 11px;',
      '  background: linear-gradient(135deg, rgba(16, 185, 129, 0.14) 0%, rgba(16, 16, 28, 0.88) 100%);',
      '  border: 1px solid rgba(16, 185, 129, 0.42);',
      '  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.18), 0 0 18px rgba(16, 185, 129, 0.16);',
      '  transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);',
      '}',
      '.cyber-sync-pill.sync-off {',
      '  background: linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(18, 16, 24, 0.88) 100%);',
      '  border-color: rgba(245, 158, 11, 0.45);',
      '  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.12), 0 0 16px rgba(245, 158, 11, 0.14);',
      '}',
      '.cyber-sync-icon-wrap {',
      '  width: 30px; height: 30px; border-radius: 8px;',
      '  background: rgba(16, 185, 129, 0.18); border: 1px solid rgba(16, 185, 129, 0.45);',
      '  display: flex; align-items: center; justify-content: center; color: #34d399; transition: all 0.25s ease;',
      '}',
      '.cyber-sync-pill.sync-off .cyber-sync-icon-wrap {',
      '  background: rgba(245, 158, 11, 0.18); border-color: rgba(245, 158, 11, 0.48); color: #fbbf24;',
      '}',
      '.sync-radar-svg { width: 18px; height: 18px; }',
      '.sync-ring-outer { transform-origin: 12px 12px; animation: cyberSpinSlow 5s linear infinite; }',
      '.sync-core-bolt { transform-origin: 12px 12px; animation: cyberCorePulse 2s ease-in-out infinite; }',
      '.cyber-sync-pill.sync-off .sync-ring-outer { animation: none; opacity: 0.45; }',
      '.cyber-sync-meta { display: flex; flex-direction: column; line-height: 1.15; }',
      '.cyber-sync-title { font-size: 9px; font-weight: 800; letter-spacing: 0.09em; color: var(--text-secondary); }',
      '.cyber-sync-status { font-size: 10.5px; font-weight: 900; letter-spacing: 0.05em; color: #34d399; }',
      '.cyber-sync-pill.sync-off .cyber-sync-status { color: #fbbf24; }',
      '.cyber-fx-icon-box .fx-orbit-ring { transform-origin: 12px 12px; animation: cyberSpinSlow 6s linear infinite; }',
      '.cyber-fx-icon-box .fx-core-star { transform-origin: 12px 12px; animation: cyberCorePulse 2.2s ease-in-out infinite; }',
      '.discord-status-badge.badge-off {',
      '  background: rgba(245, 158, 11, 0.16) !important;',
      '  border-color: rgba(245, 158, 11, 0.45) !important;',
      '  color: #fbbf24 !important;',
      '}',
      'body.no-animations *, body.no-animations *::before, body.no-animations *::after {',
      '  animation: none !important; transition: none !important;',
      '}',
      'body.no-animations .ambient-glass-orb, body.no-animations .holo-scanline {',
      '  display: none !important;',
      '}',
      '.cyber-slot-card {',
      '  position: relative;',
      '  background: linear-gradient(135deg, rgba(24, 16, 28, 0.78) 0%, rgba(10, 10, 18, 0.92) 100%) !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '  border-left: 3px solid rgba(225, 29, 72, 0.55) !important;',
      '  border-radius: 12px !important; padding: 15px 16px !important;',
      '  display: flex !important; flex-direction: column !important; gap: 13px !important;',
      '  backdrop-filter: blur(22px) saturate(190%) !important;',
      '  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.16), 0 10px 26px rgba(0, 0, 0, 0.48) !important;',
      '  transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1) !important;',
      '  animation: cyberSlotPop 0.28s cubic-bezier(0.22, 1, 0.36, 1); overflow: hidden;',
      '}',
      '.cyber-slot-card:hover {',
      '  transform: translateY(-2px); border-color: rgba(225, 29, 72, 0.42) !important;',
      '  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.24), 0 14px 32px rgba(225, 29, 72, 0.18) !important;',
      '}',
      '.cyber-slot-card.active {',
      '  border-left: 3px solid #10b981 !important; border-color: rgba(16, 185, 129, 0.38) !important;',
      '  background: linear-gradient(135deg, rgba(16, 185, 129, 0.10) 0%, rgba(225, 29, 72, 0.06) 45%, rgba(10, 12, 18, 0.94) 100%) !important;',
      '  box-shadow: inset 0 1px 1.5px rgba(255, 255, 255, 0.22), 0 0 24px rgba(16, 185, 129, 0.14), 0 12px 28px rgba(0, 0, 0, 0.55) !important;',
      '}',
      '.cyber-slot-actions { display: flex; align-items: center; gap: 10px; width: 100%; }',
      '.cyber-btn {',
      '  position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px;',
      '  padding: 9px 14px; border-radius: 9px; font-family: "Inter", "Segoe UI", sans-serif;',
      '  font-size: 11.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em;',
      '  color: #f5f5f8 !important;',
      '  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(22, 22, 34, 0.78) 100%) !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.15) !important;',
      '  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.18), 0 4px 14px rgba(0, 0, 0, 0.35);',
      '  backdrop-filter: blur(16px); cursor: pointer; overflow: hidden;',
      '  transition: all 0.22s cubic-bezier(0.22, 1, 0.36, 1);',
      '}',
      '.cyber-btn svg {',
      '  width: 14px; height: 14px; color: #fb7185;',
      '  filter: drop-shadow(0 0 5px rgba(225, 29, 72, 0.55));',
      '  transition: transform 0.26s ease, color 0.22s ease; flex-shrink: 0;',
      '}',
      '.cyber-btn::before {',
      '  content: ""; position: absolute; top: 0; left: -120%; width: 65%; height: 100%;',
      '  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.22), transparent);',
      '  transform: skewX(-22deg); transition: left 0.45s ease; pointer-events: none;',
      '}',
      '.cyber-btn:hover::before { left: 140%; }',
      '.cyber-btn:hover {',
      '  transform: translateY(-2px); color: #ffffff !important;',
      '  border-color: rgba(251, 113, 133, 0.55) !important;',
      '  background: linear-gradient(135deg, rgba(225, 29, 72, 0.26) 0%, rgba(28, 20, 36, 0.92) 100%) !important;',
      '  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.32), 0 6px 20px rgba(225, 29, 72, 0.35);',
      '}',
      '.cyber-btn:hover svg { color: #ffffff; transform: scale(1.14) rotate(-6deg); }',
      '.cyber-btn:active { transform: translateY(0) scale(0.98); }',
      '.cyber-btn-primary {',
      '  background: linear-gradient(145deg, #e11d48 0%, #9f1239 100%) !important;',
      '  border-color: rgba(255, 160, 180, 0.55) !important; color: #ffffff !important;',
      '  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.35), 0 0 18px rgba(225, 29, 72, 0.45);',
      '}',
      '.cyber-btn-primary svg { color: #ffffff; filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.6)); }',
      '.cyber-btn-primary:hover {',
      '  background: linear-gradient(145deg, #f43f5e 0%, #be123c 100%) !important;',
      '  border-color: #ffffff !important;',
      '  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.45), 0 0 24px rgba(225, 29, 72, 0.7);',
      '}',
      '.cyber-btn-active-state {',
      '  background: linear-gradient(135deg, rgba(16, 185, 129, 0.22) 0%, rgba(6, 78, 59, 0.75) 100%) !important;',
      '  border-color: rgba(52, 211, 153, 0.55) !important; color: #34d399 !important;',
      '  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.2), 0 0 16px rgba(16, 185, 129, 0.28);',
      '}',
      '.cyber-btn-active-state svg { color: #34d399 !important; filter: drop-shadow(0 0 6px rgba(16, 185, 129, 0.7)); }',
      '.cyber-btn-danger {',
      '  background: linear-gradient(135deg, rgba(239, 68, 68, 0.14) 0%, rgba(28, 14, 20, 0.82) 100%) !important;',
      '  border-color: rgba(239, 68, 68, 0.38) !important; color: #fca5a5 !important; padding: 9px 12px !important;',
      '}',
      '.cyber-btn-danger svg { color: #f87171; }',
      '.cyber-btn-danger:hover {',
      '  background: linear-gradient(135deg, #ef4444 0%, #991b1b 100%) !important;',
      '  border-color: #ffffff !important; color: #ffffff !important;',
      '  box-shadow: 0 0 20px rgba(239, 68, 68, 0.65);',
      '}',
      '.cyber-btn-danger:hover svg { color: #ffffff; transform: scale(1.15) rotate(8deg); }',
      '.cyber-status-pill {',
      '  display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px;',
      '  font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;',
      '  background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.45);',
      '  color: #34d399; box-shadow: 0 0 12px rgba(16, 185, 129, 0.25);',
      '}'
    ].join('\n');
    document.head.appendChild(styleEl);
  }

  function createBrowserFallbackAPI() {
    const safeStorageGet = (key, fallback) => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (_) {
        return fallback;
      }
    };
    const safeStorageSet = (key, val) => {
      try {
        localStorage.setItem(key, JSON.stringify(val));
      } catch (_) {}
    };

    let settings = safeStorageGet('inex_settings_v2', {
      fullscreen: false,
      windowWidth: 1280,
      windowHeight: 720,
      defaultRamMB: 4096,
      maxRamMB: 16384,
      concurrentDownloads: 8,
      closeBehavior: 'keep-open',
      showSnapshots: false,
      enableSkinSync: true,
      launcherAnimations: true,
      discordRpcEnabled: true,
      discordClientId: '1295418092481925120',
      discordStatusText: 'INEX CLIENT - Windows Edition',
      glassIntensity: 24,
      customLogoDataUrl: '',
      gameDataDir: 'C:\\Users\\Player\\AppData\\Roaming\\.inexclient',
      installDir: 'C:\\Users\\Player\\AppData\\Local\\InexClient',
      configDir: 'C:\\Users\\Player\\AppData\\Roaming\\InexClient',
      javaDir: 'C:\\Users\\Player\\AppData\\Roaming\\InexClient\\runtimes'
    });

    let profilesState = safeStorageGet('inex_profiles_v2', { activeProfileId: null, profiles: [] });
    let accountsState = safeStorageGet('inex_accounts_v2', {
      activeAccountId: 'local-inexorion',
      accounts: [
        {
          id: 'local-inexorion',
          username: 'inexorion',
          uuid: '9b4a17e2-4c1f-3a88-9210-7b65d81e4a01',
          type: 'local',
          authenticatedOnline: false,
          addedAt: '2026-10-15T10:00:00.000Z',
          activeSkinSlot: 'slot-1',
          skinSlots: [
            { id: 'slot-1', name: 'Slot 1 - Crimson Phantom', model: 'slim', preset: 'crimson-phantom', customSkinDataUrl: null, active: true }
          ]
        }
      ]
    });
    let installedByProfile = safeStorageGet('inex_installed_content_v2', {});

    const progressListeners = [];
    const logListeners = [];
    const exitListeners = [];
    const runningSet = new Set();
    let activeTimer = null;

    const emitProgress = p => progressListeners.forEach(fn => fn(p));
    const emitExit = e => exitListeners.forEach(fn => fn(e));

    const defaultVersions = [
      { id: '26.3', type: 'release', requiredJava: 21 },
      { id: '26.2', type: 'release', requiredJava: 21 },
      { id: '1.21.4', type: 'release', requiredJava: 21 },
      { id: '1.21.1', type: 'release', requiredJava: 21 },
      { id: '1.20.4', type: 'release', requiredJava: 17 },
      { id: '1.19.4', type: 'release', requiredJava: 17 },
      { id: '1.16.5', type: 'release', requiredJava: 8 },
      { id: '1.8.9', type: 'release', requiredJava: 8 }
    ];
    const getActiveFallbackAccount = () =>
      accountsState.accounts.find(a => a.id === accountsState.activeAccountId) || accountsState.accounts[0];

    return {
      isElectron: false,
      minimizeWindow: async () => {},
      maximizeWindow: async () => {},
      closeWindow: async () => {},
      getBootstrapState: async () => ({
        settings,
        profilesState,
        accountsState: {
          activeAccountId: accountsState.activeAccountId,
          accounts: accountsState.accounts.map(acc => ({
            id: acc.id,
            username: acc.username,
            uuid: acc.uuid,
            type: acc.type,
            authenticatedOnline: Boolean(acc.authenticatedOnline),
            addedAt: acc.addedAt,
            activeSkinSlot: acc.activeSkinSlot || (acc.skinSlots && acc.skinSlots.length ? acc.skinSlots[0].id : 'slot-1')
          })),
          skinSlots: getActiveFallbackAccount() ? getActiveFallbackAccount().skinSlots : []
        },
        javaRuntimes: [{ path: 'C:\\Java\\bin\\java.exe', version: '21.0.5', major: 21, arch: 'x64' }],
        versionsData: {
          latest: { release: '26.3' },
          versions: defaultVersions.filter(v => settings.showSnapshots || v.type === 'release')
        },
        runningProfileIds: Array.from(runningSet),
        discordStatus: {
          enabled: settings.discordRpcEnabled,
          connected: true,
          statusText: settings.discordRpcEnabled ? 'Connected to Discord' : 'Disabled'
        }
      }),
      listProfiles: async () => profilesState,
      setActiveProfile: async id => {
        profilesState.activeProfileId = id;
        safeStorageSet('inex_profiles_v2', profilesState);
        return profilesState;
      },
      createProfile: async payload => {
        const id = 'inex-' + Date.now();
        const newProf = {
          id,
          name: payload.name || (payload.version + '-' + payload.loader),
          version: payload.version || '26.2',
          loader: payload.loader || 'fabric',
          loaderVersion: payload.loaderVersion || 'latest',
          javaRuntime: payload.javaRuntime || 'auto',
          ramMB: Number(payload.ramMB) || 4096,
          gameDir: settings.gameDataDir + '\\profiles\\' + id,
          installed: false,
          defaultHudAttached: true,
          contentCounts: { mods: 0, resourcepacks: 0, shaderpacks: 0, datapacks: 0 }
        };
        profilesState.profiles.unshift(newProf);
        profilesState.activeProfileId = id;
        installedByProfile[id] = { mod: [], resourcepack: [], shader: [], datapack: [] };
        safeStorageSet('inex_profiles_v2', profilesState);
        safeStorageSet('inex_installed_content_v2', installedByProfile);
        return { profile: newProf, state: profilesState };
      },
      updateProfile: async (id, updates) => {
        const p = profilesState.profiles.find(x => x.id === id);
        if (p) Object.assign(p, updates);
        safeStorageSet('inex_profiles_v2', profilesState);
        return { profile: p, state: profilesState };
      },
      deleteProfile: async id => {
        profilesState.profiles = profilesState.profiles.filter(x => x.id !== id);
        if (profilesState.activeProfileId === id) {
          profilesState.activeProfileId = profilesState.profiles[0] ? profilesState.profiles[0].id : null;
        }
        safeStorageSet('inex_profiles_v2', profilesState);
        return profilesState;
      },
      openProfileFolder: async () => ({ opened: true, path: settings.gameDataDir }),
      listVersions: async () => ({ latest: { release: '26.3' }, versions: defaultVersions }),
      getSupportedLoaders: async () => ({
        vanilla: { supported: true, versions: [{ version: 'official', label: 'Official' }] },
        fabric: { supported: true, versions: [{ version: '0.16.10', label: '0.16.10' }] },
        forge: { supported: true, versions: [{ version: 'latest', label: 'latest' }] }
      }),
      detectJavaRuntimes: async () => [],
      bundlePortableJava: async () => ({ bundled: {}, runtimes: [] }),
      cancelInstallation: async () => {
        if (activeTimer) {
          clearInterval(activeTimer);
          activeTimer = null;
        }
        return { cancelled: true };
      },
      installProfile: async pId =>
        new Promise(r => {
          let i = 0;
          activeTimer = setInterval(() => {
            if (i >= 3) {
              clearInterval(activeTimer);
              activeTimer = null;
              const p = profilesState.profiles.find(x => x.id === pId);
              if (p) p.installed = true;
              safeStorageSet('inex_profiles_v2', profilesState);
              r({ success: true, profile: p });
              return;
            }
            i++;
            emitProgress({ stage: 'Testing', percent: i * 33, detail: 'Installing...' });
          }, 300);
        }),
      launchProfile: async pId => {
        runningSet.add(pId);
        return { launched: true, pid: 14820 };
      },
      stopProfile: async pId => {
        runningSet.delete(pId);
        emitExit({ profileId: pId, code: 0 });
        return { stopped: true, profileId: pId };
      },
      getRunningProfiles: async () => Array.from(runningSet),
      searchModrinth: async () => ({ hits: [], totalHits: 0, offset: 0, limit: 15 }),
      getModrinthProject: async id => ({ id, title: id, body: 'Project details' }),
      installModrinthContent: async () => ({ installed: true }),
      listInstalledContent: async (pId, pt = 'mod') => (installedByProfile[pId] && installedByProfile[pId][pt]) || [],
      toggleInstalledContent: async () => ({ items: [] }),
      removeInstalledContent: async () => ({ removed: true, items: [] }),
      listAccounts: async () => {
        const acc = getActiveFallbackAccount();
        return {
          activeAccountId: accountsState.activeAccountId,
          accounts: accountsState.accounts,
          skinSlots: acc ? acc.skinSlots : []
        };
      },
      setActiveAccount: async id => {
        accountsState.activeAccountId = id;
        safeStorageSet('inex_accounts_v2', accountsState);
        return window.inexAPI.listAccounts();
      },
      addLocalAccount: async user => {
        const id = 'local-' + user.toLowerCase();
        accountsState.accounts.unshift({
          id,
          username: user,
          type: 'local',
          activeSkinSlot: 'slot-1',
          skinSlots: [{ id: 'slot-1', name: 'Slot 1', model: 'slim', active: true }]
        });
        accountsState.activeAccountId = id;
        safeStorageSet('inex_accounts_v2', accountsState);
        return window.inexAPI.listAccounts();
      },
      loginMicrosoftAccount: async () => {
        throw new Error('Requires desktop app.');
      },
      removeAccount: async id => {
        accountsState.accounts = accountsState.accounts.filter(a => a.id !== id);
        accountsState.activeAccountId = accountsState.accounts[0] ? accountsState.accounts[0].id : null;
        return window.inexAPI.listAccounts();
      },
      addSkinSlot: async name => {
        const acc = getActiveFallbackAccount();
        acc.skinSlots.push({ id: 'slot-' + Date.now(), name: name || 'New Slot', model: 'slim', active: false });
        return window.inexAPI.listAccounts();
      },
      updateSkinSlot: async (sId, ups) => {
        const acc = getActiveFallbackAccount();
        const s = acc.skinSlots.find(x => x.id === sId);
        if (s) {
          Object.assign(s, ups);
          if (ups.active) {
            acc.skinSlots.forEach(x => {
              x.active = x.id === sId;
            });
            acc.activeSkinSlot = sId;
          }
        }
        return window.inexAPI.listAccounts();
      },
      deleteSkinSlot: async sId => {
        const acc = getActiveFallbackAccount();
        acc.skinSlots = acc.skinSlots.filter(x => x.id !== sId);
        if (!acc.skinSlots.some(x => x.active)) acc.skinSlots[0].active = true;
        return window.inexAPI.listAccounts();
      },
      getDiscordStatus: async () => ({ enabled: true, connected: true, statusText: 'Disabled' }),
      getSettings: async () => settings,
      updateSettings: async p => {
        settings = Object.assign({}, settings, p);
        safeStorageSet('inex_settings_v2', settings);
        return settings;
      },
      resetSettings: async () => {
        localStorage.removeItem('inex_settings_v2');
        return settings;
      },
      selectDirectoryDialog: async cp => ({ canceled: false, path: cp }),
      selectCustomLogo: async () => ({ canceled: true }),
      openDirectoryInExplorer: async () => ({ opened: true }),
      onInstallProgress: fn => {
        progressListeners.push(fn);
        return () => {};
      },
      onGameLog: fn => {
        logListeners.push(fn);
        return () => {};
      },
      onGameExit: fn => {
        exitListeners.push(fn);
        return () => {};
      }
    };
  }

  const api = window.inexAPI || createBrowserFallbackAPI();
  if (!window.inexAPI) window.inexAPI = api;

  const state = {
    activeTab: 'home',
    settings: {},
    profiles: [],
    activeProfileId: null,
    accounts: [],
    activeAccountId: null,
    skinSlots: [],
    versions: [],
    javaRuntimes: [],
    runningProfileIds: new Set(),
    discordStatus: null,
    advancedSetupOpen: false,
    pendingDeleteProfileId: null,
    contentType: 'mod',
    contentMode: 'browse',
    modrinthHits: [],
    modrinthTotal: 0,
    modrinthOffset: 0,
    modrinthLimit: 15,
    installedItems: [],
    selectedProjectForModal: null,
    pendingUploadSlotId: null
  };

  const $ = id => document.getElementById(id);

  function updateToggleBadgesUI() {
    const syncOn = state.settings.enableSkinSync !== false;
    const animOn = state.settings.launcherAnimations !== false;

    if ($('settingSkinSyncToggle')) {
      $('settingSkinSyncToggle').checked = syncOn;
    }
    if ($('skinSyncPillWrap')) {
      $('skinSyncPillWrap').classList.toggle('sync-off', !syncOn);
    }
    if ($('skinSyncStatusBadge')) {
      $('skinSyncStatusBadge').textContent = syncOn ? 'ONLINE \u2022 CLOUD' : 'OFF \u2022 MAX FPS';
    }

    if ($('settingAnimationsToggle')) {
      $('settingAnimationsToggle').checked = animOn;
    }
    if ($('animationStatusBadge')) {
      $('animationStatusBadge').textContent = animOn ? 'ACTIVE \u2022 CYBER FX' : 'OFF \u2022 0% GPU';
      $('animationStatusBadge').classList.toggle('badge-off', !animOn);
    }
  }

  function applyAppearanceSettings() {
    const blurPx = Number(state.settings.glassIntensity) || 24;
    document.documentElement.style.setProperty('--glass-blur', blurPx + 'px');

    const animEnabled = state.settings.launcherAnimations !== false;
    document.body.classList.toggle('no-animations', !animEnabled);
    updateToggleBadgesUI();

    const embeddedLogo = window.INEX_DEFAULT_LOGO || '';
    const customLogo = state.settings.customLogoDataUrl || '';
    document.querySelectorAll('.custom-logo-target').forEach(img => {
      img.onerror = () => {
        if (embeddedLogo && img.getAttribute('src') !== embeddedLogo) {
          img.onerror = null;
          img.src = embeddedLogo;
        }
      };
      img.src = customLogo || 'inex-logo.png';
    });
  }

  function showToast(message, type = 'info') {
    const container = $('toastContainer');
    if (!container) return;
    const item = document.createElement('div');
    item.className = 'toast-item';
    if (type === 'error') item.style.borderLeftColor = '#ef4444';
    else if (type === 'success') item.style.borderLeftColor = '#10b981';
    else if (type === 'warning') item.style.borderLeftColor = '#f59e0b';
    item.textContent = message;
    container.appendChild(item);
    setTimeout(() => item.remove(), 3800);
  }

  function appendConsoleLog(line, level = 'info') {
    const box = $('logConsoleOutput');
    if (!box) return;
    const div = document.createElement('div');
    div.style.marginBottom = '4px';
    if (level === 'error') div.style.color = '#f87171';
    else if (level === 'warn') div.style.color = '#fbbf24';
    else if (level === 'debug') div.style.color = '#9ca3af';
    div.textContent = '[' + new Date().toLocaleTimeString() + '] ' + line;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function formatCompactNumber(num) {
    const n = Number(num) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  function getActiveProfile() {
    return state.profiles.find(p => p.id === state.activeProfileId) || state.profiles[0] || null;
  }

  function getActiveAccount() {
    return state.accounts.find(a => a.id === state.activeAccountId) || state.accounts[0] || null;
  }

  function openProfileContentBrowser(contentType = 'mod') {
    const prof = getActiveProfile();
    if (!prof) {
      showToast('Create a profile first to manage mods, resource packs, and shaders!', 'info');
      switchNavigation('profiles');
      openCreateProfileForm();
      return;
    }
    state.contentType = contentType;
    state.activeTab = 'content';
    document.body.setAttribute('data-active-tab', 'content');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-nav') === 'profiles'));
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    $('view-content').classList.add('active');
    refreshContentBrowser();
  }

  function switchNavigation(targetNav) {
    state.activeTab = targetNav;
    document.body.setAttribute('data-active-tab', targetNav);
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-nav') === targetNav));
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));

    if (targetNav === 'home') {
      $('view-home').classList.add('active');
      renderHomeView();
    } else if (targetNav === 'profiles') {
      $('view-profiles').classList.add('active');
      $('profilesListSubView').style.display = 'block';
      $('createProfileSubView').style.display = 'none';
      renderProfilesView();
    } else if (targetNav === 'accounts') {
      $('view-accounts').classList.add('active');
      $('addAccountSubView').style.display = 'none';
      if ($('accountsMainView')) $('accountsMainView').style.display = 'flex';
      renderAccountsView();
    } else if (targetNav === 'settings') {
      $('view-settings').classList.add('active');
      renderSettingsView();
    }
  }

  function renderHeaderBar() {
    const prof = getActiveProfile();
    const dot = $('headerProfileDot');
    if (prof) {
      $('headerProfileName').textContent = prof.name;
      dot.className = 'pill-status-dot' + (prof.installed ? '' : ' local');
    } else {
      $('headerProfileName').textContent = 'No Profile (Create)';
      dot.className = 'pill-status-dot local';
    }

    const acc = getActiveAccount();
    if (acc) {
      $('headerAccountName').textContent = acc.username;
      $('headerAccountType').textContent = acc.type === 'microsoft' ? 'MINECRAFT (MSA)' : 'MINECRAFT (LOCAL)';
      $('headerAccountAvatar').innerHTML = renderMiniFaceSvg(acc.username);
    } else {
      $('headerAccountName').textContent = 'No Account';
      $('headerAccountType').textContent = 'CLICK TO ADD';
      $('headerAccountAvatar').innerHTML = '<span style="font-size:16px; font-weight:700; color:#ff2a54;">+</span>';
    }
  }

  function renderMiniFaceSvg(seedStr) {
    const colors = ['#e11d48', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'];
    const idx = String(seedStr || 'A').charCodeAt(0) % colors.length;
    const accent = colors[idx];
    return (
      '<svg width="100%" height="100%" viewBox="0 0 40 40">' +
      '<rect width="40" height="40" fill="#0d0d12"/>' +
      '<path d="M5,5 L15,5 L15,10 L5,10 Z" fill="' + accent + '" opacity="0.3"/>' +
      '<path d="M25,5 L35,5 L35,10 L25,10 Z" fill="' + accent + '" opacity="0.3"/>' +
      '<rect x="8" y="16" width="6" height="4" fill="' + accent + '"/>' +
      '<rect x="26" y="16" width="6" height="4" fill="' + accent + '"/>' +
      '<path d="M12,28 L28,28 L26,32 L14,32 Z" fill="#fff" opacity="0.8"/>' +
      '<line x1="0" y1="20" x2="40" y2="20" stroke="' + accent + '" stroke-width="1" opacity="0.5"/>' +
      '</svg>'
    );
  }

  function renderHomeView() {
    renderHeaderBar();
    const prof = getActiveProfile();
    const splitBox = $('launchSplitBox');
    const dropdown = $('homeProfileDropdown');
    const row = $('homeQuickProfilesRow');

    dropdown.innerHTML = '';
    row.innerHTML = '';

    if (!prof) {
      splitBox.classList.remove('running');
      $('homeVersionBadge').textContent = 'No Profile Created';
      $('homeLoaderBadge').textContent = 'Fabric / Forge / Vanilla';
      $('homeRamBadge').textContent = ((state.settings.defaultRamMB || 4096) / 1024).toFixed(1) + ' GB Default';
      $('homeInstallBadge').textContent = 'Create Profile to Start';
      $('mainPlayTitle').textContent = '+ CREATE PROFILE';
      $('mainPlaySub').textContent = 'No profile created yet \u2022 Click to create';
      $('mainPlayHint').textContent = 'Supports Fabric, Forge & Vanilla';

      const emptyItem = document.createElement('div');
      emptyItem.className = 'dropdown-item';
      emptyItem.innerHTML = '<div style="font-weight:700; font-size:13px;">+ Create Your First Profile</div>';
      emptyItem.addEventListener('click', () => {
        dropdown.classList.remove('open');
        switchNavigation('profiles');
        openCreateProfileForm();
      });
      dropdown.appendChild(emptyItem);

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'quick-profile-pill';
      addBtn.innerHTML = '<span style="font-weight:700; width:100%; text-align:center;">+ Create New Profile</span>';
      addBtn.addEventListener('click', () => {
        switchNavigation('profiles');
        openCreateProfileForm();
      });
      row.appendChild(addBtn);
      return;
    }

    const loaderLabel = prof.loader ? prof.loader.charAt(0).toUpperCase() + prof.loader.slice(1) : 'Vanilla';
    const isRunning = state.runningProfileIds.has(prof.id);

    $('homeVersionBadge').textContent = 'Minecraft ' + prof.version;
    $('homeLoaderBadge').textContent = loaderLabel + ' (' + (prof.loaderVersion || 'latest') + ')';
    $('homeRamBadge').textContent = (prof.ramMB / 1024).toFixed(1) + ' GB RAM';
    $('homeInstallBadge').textContent = isRunning ? 'Game Running' : prof.installed ? 'Ready to Launch' : 'Will Install on Launch';

    splitBox.classList.toggle('running', isRunning);

    $('mainPlayTitle').textContent = isRunning ? 'STOP GAME' : 'LAUNCH GAME';
    $('mainPlaySub').textContent = prof.name + ' \u2022 ' + loaderLabel + ' ' + prof.version;
    $('mainPlayHint').textContent = isRunning ? 'Click to terminate active game process' : 'Ready \u2022 Auto-Java';

    state.profiles.forEach(p => {
      const item = document.createElement('div');
      item.className = 'dropdown-item' + (p.id === prof.id ? ' active' : '');
      const lName = p.loader.charAt(0).toUpperCase() + p.loader.slice(1);
      const statusColor = p.installed ? 'var(--success)' : 'var(--crimson-400)';
      const statusText = p.installed ? 'Ready' : 'Install';
      item.innerHTML =
        '<div><div style="font-weight:700; font-size:13px;">' + p.name + '</div>' +
        '<div style="font-size:11px; color:var(--text-secondary);">' + lName + ' ' + p.version + ' \u2022 ' + (p.ramMB / 1024).toFixed(1) + ' GB</div></div>' +
        '<span style="font-size:11px; color:' + statusColor + '; font-weight:700;">' + statusText + '</span>';
      item.addEventListener('click', async () => {
        dropdown.classList.remove('open');
        const updated = await api.setActiveProfile(p.id);
        state.profiles = updated.profiles;
        state.activeProfileId = updated.activeProfileId;
        renderHomeView();
      });
      dropdown.appendChild(item);
    });

    state.profiles.slice(0, 2).forEach(p => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'quick-profile-pill' + (p.id === prof.id ? ' active' : '');
      const lName = p.loader.charAt(0).toUpperCase() + p.loader.slice(1);
      pill.innerHTML =
        '<div class="quick-pill-icon">' + p.name.slice(0, 2).toUpperCase() + '</div>' +
        '<div style="text-align:left; flex:1;"><div style="font-size:12.5px; font-weight:700;">' + p.name + '</div>' +
        '<div style="font-size:11px; color:var(--text-secondary);">' + lName + ' ' + p.version + '</div></div>' +
        '<span style="font-size:11px; color:var(--text-muted);">&#9654;</span>';
      pill.addEventListener('click', async () => {
        const updated = await api.setActiveProfile(p.id);
        state.profiles = updated.profiles;
        state.activeProfileId = updated.activeProfileId;
        renderHomeView();
      });
      row.appendChild(pill);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'quick-profile-pill';
    addBtn.innerHTML = '<span style="font-weight:700; width:100%; text-align:center;">+ Add a Profile</span>';
    addBtn.addEventListener('click', () => {
      switchNavigation('profiles');
      openCreateProfileForm();
    });
    row.appendChild(addBtn);

    const modsBtn = document.createElement('button');
    modsBtn.type = 'button';
    modsBtn.className = 'quick-profile-pill';
    modsBtn.innerHTML = '<span style="font-weight:700; width:100%; text-align:center;">&#9881; Profile Mods &amp; Packs</span>';
    modsBtn.addEventListener('click', () => {
      openProfileContentBrowser('mod');
    });
    row.appendChild(modsBtn);
  }

  function renderProfilesView() {
    renderHeaderBar();
    const grid = $('profilesGridContainer');
    if (!grid) return;

    const query = String($('profileSearchInput').value || '').toLowerCase().trim();
    const sortBy = $('profileSortSelect').value;

    const list = state.profiles
      .filter(p => !query || p.name.toLowerCase().includes(query) || p.version.toLowerCase().includes(query) || p.loader.toLowerCase().includes(query))
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'recent') return String(b.lastPlayed || '').localeCompare(String(a.lastPlayed || ''));
        return String(b.version).localeCompare(String(a.version));
      });

    grid.innerHTML = '';

    list.forEach(p => {
      const isSelected = p.id === state.activeProfileId;
      const lName = p.loader.charAt(0).toUpperCase() + p.loader.slice(1);
      const card = document.createElement('div');
      card.className = 'profile-card' + (isSelected ? ' active' : '');

      const vanillaPrefix = p.loader === 'vanilla' ? '<span style="color:#fbbf24; font-weight:700;">Vanilla (No Mods)</span> &bull; ' : '';
      const installedColor = p.installed ? 'var(--success)' : 'var(--crimson-400)';
      const installedText = p.installed ? 'Installed' : 'Not Installed';
      const checkBadge = isSelected ? '<div class="active-check-badge" title="Active Profile">&#10003;</div>' : '';

      card.innerHTML =
        '<div class="profile-card-top">' +
          '<div class="profile-avatar">' + p.name.slice(0, 2).toUpperCase() + '</div>' +
          '<div class="profile-info">' +
            '<div class="profile-name">' + p.name + '</div>' +
            '<div class="profile-meta-line">' + vanillaPrefix + 'INEX Client + ' + lName + ' ' + p.version + '</div>' +
            '<div class="profile-sub-badge">' +
              '<span>' + (p.ramMB / 1024).toFixed(1) + ' GB RAM</span>' +
              '<span>&bull;</span>' +
              '<span style="color:' + installedColor + '; font-weight:600;">' + installedText + '</span>' +
            '</div>' +
          '</div>' +
          checkBadge +
        '</div>' +
        '<div class="profile-card-actions">' +
          '<button type="button" class="btn btn-sm btn-crimson" data-action="play">&#9654; Play</button>' +
          '<button type="button" class="btn btn-sm glass-btn" data-action="mods">Mods</button>' +
          '<button type="button" class="btn btn-sm glass-btn" data-action="modpacks">Modpacks</button>' +
          '<button type="button" class="btn btn-sm glass-btn" data-action="resourcepacks">Packs</button>' +
          '<button type="button" class="btn btn-sm glass-btn" data-action="shaders">Shaders</button>' +
          '<button type="button" class="btn btn-sm glass-btn" data-action="edit" title="Edit Profile">Edit</button>' +
          '<button type="button" class="btn btn-sm glass-btn" data-action="folder" title="Open Game Folder">Folder</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-action="delete" title="Delete Profile">&#10005;</button>' +
        '</div>';

      card.querySelector('.profile-card-top').addEventListener('click', async () => {
        const updated = await api.setActiveProfile(p.id);
        state.profiles = updated.profiles;
        state.activeProfileId = updated.activeProfileId;
        renderProfilesView();
      });
      card.querySelector('[data-action="play"]').addEventListener('click', async () => {
        const updated = await api.setActiveProfile(p.id);
        state.profiles = updated.profiles;
        state.activeProfileId = updated.activeProfileId;
        switchNavigation('home');
        triggerPlayOrStop();
      });
      card.querySelector('[data-action="mods"]').addEventListener('click', async () => {
        const updated = await api.setActiveProfile(p.id);
        state.profiles = updated.profiles;
        state.activeProfileId = updated.activeProfileId;
        openProfileContentBrowser('mod');
      });
      card.querySelector('[data-action="modpacks"]').addEventListener('click', async () => {
        const updated = await api.setActiveProfile(p.id);
        state.profiles = updated.profiles;
        state.activeProfileId = updated.activeProfileId;
        openProfileContentBrowser('modpack');
      });
      card.querySelector('[data-action="resourcepacks"]').addEventListener('click', async () => {
        const updated = await api.setActiveProfile(p.id);
        state.profiles = updated.profiles;
        state.activeProfileId = updated.activeProfileId;
        openProfileContentBrowser('resourcepack');
      });
      card.querySelector('[data-action="shaders"]').addEventListener('click', async () => {
        const updated = await api.setActiveProfile(p.id);
        state.profiles = updated.profiles;
        state.activeProfileId = updated.activeProfileId;
        openProfileContentBrowser('shader');
      });
      card.querySelector('[data-action="edit"]').addEventListener('click', () => {
        openCreateProfileForm(p);
      });
      card.querySelector('[data-action="folder"]').addEventListener('click', async () => {
        const res = await api.openProfileFolder(p.id);
        showToast('Opened profile directory: ' + res.path);
      });
      card.querySelector('[data-action="delete"]').addEventListener('click', () => {
        state.pendingDeleteProfileId = p.id;
        $('deleteConfirmMessage').textContent = 'Delete profile "' + p.name + '" (' + lName + ' ' + p.version + ')?';
        $('deleteConfirmModalBackdrop').classList.add('open');
      });

      grid.appendChild(card);
    });

    const createTile = document.createElement('button');
    createTile.type = 'button';
    createTile.className = 'add-card-tile';
    createTile.innerHTML = '<span style="font-size:26px; font-weight:400;">+</span><span>CREATE PROFILE</span>';
    createTile.addEventListener('click', () => openCreateProfileForm());
    grid.appendChild(createTile);
  }

  async function openCreateProfileForm(editingProfile = null) {
    $('profilesListSubView').style.display = 'none';
    $('createProfileSubView').style.display = 'flex';

    const vSelect = $('profileVersionSelect');
    vSelect.innerHTML = '';
    state.versions.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent =
        v.type === 'snapshot'
          ? v.id + ' (Snapshot)'
          : v.type === 'old_beta'
          ? v.id + ' (Old Beta)'
          : v.type === 'old_alpha'
          ? v.id + ' (Old Alpha)'
          : v.id;
      vSelect.appendChild(opt);
    });

    const jSelect = $('profileJavaSelect');
    jSelect.innerHTML = '<option value="auto">Auto-Detect / Bundle (Recommended)</option>';
    state.javaRuntimes.forEach(rt => {
      const opt = document.createElement('option');
      opt.value = rt.path;
      opt.textContent = 'Java ' + rt.major + ' (' + rt.version + ') - ' + rt.arch;
      jSelect.appendChild(opt);
    });

    if (editingProfile) {
      $('profileModalTitle').textContent = 'Edit Profile - ' + editingProfile.name;
      $('formModeLabel').textContent = 'EDIT PROFILE';
      $('editingProfileIdInput').value = editingProfile.id;
      $('profileNameInput').value = editingProfile.name;
      vSelect.value = editingProfile.version;
      $('profileLoaderSelect').value = editingProfile.loader;
      if ($('profileHudEnabledInput')) $('profileHudEnabledInput').checked = editingProfile.hudEnabled !== false;
      $('profileRamSlider').value = editingProfile.ramMB;
      $('profileRamValueLabel').textContent = (editingProfile.ramMB / 1024).toFixed(1) + ' GB';
      $('saveProfileSubmitBtn').textContent = 'Save ' + editingProfile.version + ' Profile';
    } else {
      const firstRelease = state.versions.find(v => v.type === 'release') || state.versions[0];
      const defaultVer = firstRelease ? firstRelease.id : '26.2';
      $('profileModalTitle').textContent = 'Create Profile';
      $('formModeLabel').textContent = 'CREATE PROFILE';
      $('editingProfileIdInput').value = '';
      vSelect.value = defaultVer;
      $('profileLoaderSelect').value = 'fabric';
      if ($('profileHudEnabledInput')) $('profileHudEnabledInput').checked = true;
      $('profileNameInput').value = defaultVer + '-Fabric';
      const defRam = state.settings.defaultRamMB || 4096;
      $('profileRamSlider').value = defRam;
      $('profileRamValueLabel').textContent = (defRam / 1024).toFixed(1) + ' GB';
      $('saveProfileSubmitBtn').textContent = 'Create ' + defaultVer + ' Profile';
    }

    renderVersionPostersGrid(vSelect.value);
    await refreshSupportedLoadersForForm(vSelect.value);
    checkVanillaLoaderUi();
  }

  function checkVanillaLoaderUi() {
    const loader = $('profileLoaderSelect').value;
    const isVanilla = loader === 'vanilla';
    if ($('vanillaFormNoticePill')) $('vanillaFormNoticePill').style.display = isVanilla ? 'block' : 'none';
    if ($('formBrowseModpacksBtn')) $('formBrowseModpacksBtn').style.display = isVanilla ? 'none' : 'inline-flex';
    if ($('profileHudField')) $('profileHudField').style.display = isVanilla ? 'none' : 'flex';
  }

  function renderVersionPostersGrid(selectedVersion) {
    const grid = $('versionPostersGrid');
    if (!grid) return;
    grid.innerHTML = '';

    PRESET_VERSION_CARDS.forEach(card => {
      const div = document.createElement('div');
      div.className = 'inex-version-tile' + (card.id === selectedVersion ? ' selected' : '');
      div.innerHTML =
        '<div class="inex-vt-icon-box">' + card.iconSvg + '</div>' +
        '<div class="inex-vt-info">' +
          '<span class="inex-vt-title">' + card.id + '</span>' +
          '<span class="inex-vt-sub">' + card.subtitle + '</span>' +
        '</div>' +
        '<span class="inex-vt-badge">' + card.badge + '</span>';
      div.addEventListener('click', async () => {
        const vSelect = $('profileVersionSelect');
        if (!Array.from(vSelect.options).some(o => o.value === card.id)) {
          const opt = document.createElement('option');
          opt.value = card.id;
          opt.textContent = card.id;
          vSelect.appendChild(opt);
        }
        vSelect.value = card.id;
        renderVersionPostersGrid(card.id);
        await refreshSupportedLoadersForForm(card.id);
        updateAutoProfileName();
      });
      grid.appendChild(div);
    });
  }

  async function refreshSupportedLoadersForForm(mcVersion) {
    const loaderSelect = $('profileLoaderSelect');
    const loaderVerSelect = $('profileLoaderVersionSelect');

    try {
      const matrix = await api.getSupportedLoaders(mcVersion);
      Array.from(loaderSelect.options).forEach(opt => {
        const val = opt.value;
        const loaderInfo = matrix[val];
        const isSupported = Boolean(loaderInfo && loaderInfo.supported);
        opt.disabled = !isSupported;
        const baseName = val === 'neoforge' ? 'NeoForge' : val.charAt(0).toUpperCase() + val.slice(1);
        if (!isSupported) {
          opt.textContent = baseName + ' (Not Available for ' + mcVersion + ')';
        } else {
          opt.textContent =
            val === 'fabric'
              ? 'Fabric (Default & Recommended)'
              : val === 'vanilla'
              ? 'Vanilla (Official - No Mods)'
              : baseName;
        }
      });

      if (loaderSelect.selectedOptions[0] && loaderSelect.selectedOptions[0].disabled) {
        const prevLoader = loaderSelect.value;
        loaderSelect.value = matrix.fabric && matrix.fabric.supported ? 'fabric' : 'vanilla';
        try {
          showToast(prevLoader + ' is not available for ' + mcVersion + '. Switched to ' + loaderSelect.value + '.', 'warning');
        } catch (_) {}
      }

      const activeLoader = loaderSelect.value;
      const activeLoaderInfo = matrix[activeLoader] || matrix.vanilla || { versions: [{ version: 'latest', label: 'latest' }] };
      loaderVerSelect.innerHTML = '';
      (activeLoaderInfo.versions || [{ version: 'latest', label: 'latest' }]).forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.version;
        opt.textContent = v.label || v.version;
        loaderVerSelect.appendChild(opt);
      });
    } catch (_) {}

    const vObj = state.versions.find(v => v.id === mcVersion);
    const reqJava = vObj ? vObj.requiredJava : 21;
    $('javaRequirementHint').textContent =
      'Minecraft ' + mcVersion + ' uses Java ' + reqJava + '. INEX CLIENT automatically detects or bundles Portable Java ' + reqJava + ' on launch.';
  }

  function updateAutoProfileName() {
    if ($('editingProfileIdInput').value) return;
    const ver = $('profileVersionSelect').value;
    const loader = $('profileLoaderSelect').value;
    const lName = loader.charAt(0).toUpperCase() + loader.slice(1);
    $('profileNameInput').value = ver + '-' + lName;
    $('saveProfileSubmitBtn').textContent = 'Create ' + ver + ' Profile';
  }

  async function refreshContentBrowser() {
    renderHeaderBar();
    const prof = getActiveProfile();
    if (!prof) {
      switchNavigation('profiles');
      return;
    }

    const lName = prof.loader.charAt(0).toUpperCase() + prof.loader.slice(1);
    $('contentProfileBadgeIcon').textContent = prof.name.slice(0, 2).toUpperCase();
    $('contentProfileBadgeName').textContent = prof.name;
    $('contentProfileBadgeMeta').textContent = prof.version + ' \u2022 ' + lName;

    const targetSelect = $('contentTargetProfileSelect');
    targetSelect.innerHTML = '';
    state.profiles.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + ' (' + p.version + ')';
      if (p.id === prof.id) opt.selected = true;
      targetSelect.appendChild(opt);
    });

    document.querySelectorAll('.type-pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-content-type') === state.contentType);
    });

    const isVanilla = prof.loader === 'vanilla';
    if ($('targetVersionLockLabel')) $('targetVersionLockLabel').textContent = prof.version + ' (' + lName + ')';
    if ($('targetVersionLockedPill')) $('targetVersionLockedPill').style.display = 'inline-flex';
    if ($('vanillaNoticeBanner')) {
      $('vanillaNoticeBanner').classList.toggle('visible', isVanilla && (state.contentType === 'mod' || state.contentType === 'modpack'));
    }
    $('modpackNoticeBanner').classList.toggle('visible', !isVanilla && state.contentType === 'modpack');

    const typeLabels = {
      mod: 'mods',
      modpack: 'modpacks',
      resourcepack: 'resource packs',
      shader: 'shaders',
      datapack: 'data packs'
    };
    $('modrinthSearchInput').placeholder = 'Search compatible ' + (typeLabels[state.contentType] || 'projects') + ' for ' + prof.name + '...';

    state.installedItems = await api.listInstalledContent(prof.id, state.contentType);
    $('installedCountSpan').textContent = String(state.installedItems.length);

    $('modeBrowseBtn').className = 'btn btn-sm' + (state.contentMode === 'browse' ? ' btn-crimson' : ' glass-btn');
    $('modeInstalledBtn').className = 'btn btn-sm' + (state.contentMode === 'installed' ? ' btn-crimson' : ' glass-btn');

    if (state.contentMode === 'installed') {
      $('modrinthPaginationBar').style.display = 'none';
      renderInstalledContentList();
    } else {
      $('modrinthPaginationBar').style.display = 'flex';
      await executeModrinthSearch();
    }
  }

  async function executeModrinthSearch() {
    const prof = getActiveProfile();
    if (!prof) return;

    const container = $('modrinthResultsContainer');
    container.innerHTML = '<div style="padding:32px; text-align:center; color:var(--text-secondary);">Searching compatible content for Minecraft ' + prof.version + ' (' + prof.loader + ')...</div>';

    try {
      const res = await api.searchModrinth({
        query: $('modrinthSearchInput').value,
        projectType: state.contentType,
        profileId: prof.id,
        offset: state.modrinthOffset,
        limit: state.modrinthLimit,
        sortIndex: $('modrinthSortSelect').value
      });

      state.modrinthHits = res.hits || [];
      state.modrinthTotal = res.totalHits || state.modrinthHits.length;
      renderModrinthHits();
    } catch (err) {
      container.innerHTML = '<div style="padding:32px; text-align:center; color:#f87171;">Failed to query content: ' + err.message + '</div>';
    }
  }

  function renderModrinthHits() {
    const prof = getActiveProfile();
    const isVanilla = prof && prof.loader === 'vanilla';
    const container = $('modrinthResultsContainer');
    container.innerHTML = '';

    if (!state.modrinthHits.length) {
      container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-muted);">No compatible projects found for this filter.</div>';
      $('modrinthPageSummary').textContent = '0 results';
      return;
    }

    const start = state.modrinthOffset + 1;
    const end = Math.min(state.modrinthOffset + state.modrinthHits.length, state.modrinthTotal);
    $('modrinthPageSummary').textContent = 'Showing ' + start + '-' + end + ' of ' + formatCompactNumber(state.modrinthTotal) + ' compatible projects';

    state.modrinthHits.forEach(hit => {
      const card = document.createElement('div');
      card.className = 'modrinth-item-card';
      const iconHtml = hit.iconUrl
        ? '<img src="' + hit.iconUrl + '" alt="" class="mod-icon" />'
        : '<div class="mod-icon">' + (hit.title || 'M').slice(0, 2).toUpperCase() + '</div>';
      const tagsHtml = (hit.categories || []).slice(0, 4).map(c => '<span class="mod-tag">' + c + '</span>').join('');

      let installBtnHtml = '';
      if (isVanilla && (state.contentType === 'mod' || state.contentType === 'modpack')) {
        installBtnHtml = '<button type="button" class="btn btn-sm glass-btn" data-action="install" disabled title="Vanilla profile cannot install mods or modpacks">&#128683; Vanilla Locked</button>';
      } else {
        const btnCls = hit.installed ? 'glass-btn' : 'btn-crimson';
        const disAttr = hit.installed ? 'disabled' : '';
        const btnTxt = hit.installed ? '&#10003; Installed' : '&darr; Install';
        installBtnHtml = '<button type="button" class="btn btn-sm ' + btnCls + '" data-action="install" ' + disAttr + '>' + btnTxt + '</button>';
      }

      card.innerHTML =
        '<div class="modrinth-item-left">' +
          iconHtml +
          '<div class="mod-details">' +
            '<div class="mod-title-row"><span class="mod-title">' + hit.title + '</span><span class="mod-author">by ' + hit.author + '</span><span class="mod-tag" style="color:var(--crimson-400);">' + formatCompactNumber(hit.downloads) + ' downloads</span></div>' +
            '<div class="mod-desc">' + hit.description + '</div><div class="mod-tags">' + tagsHtml + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="modrinth-item-actions">' +
          '<button type="button" class="btn btn-sm glass-btn" data-action="details">Details</button>' +
          installBtnHtml +
        '</div>';

      card.querySelector('[data-action="details"]').addEventListener('click', async () => {
        state.selectedProjectForModal = hit;
        $('detailModalTitle').textContent = hit.title + ' - by ' + hit.author;
        $('detailModalBody').innerHTML = '<p style="margin-bottom:10px;">' + hit.description + '</p><p style="color:var(--text-muted);">Loading project metadata...</p>';
        $('detailModalInstallBtn').disabled = Boolean(hit.installed);
        $('detailModalInstallBtn').textContent = hit.installed ? 'Already Installed' : 'Install into ' + getActiveProfile().name;
        $('projectDetailsModalBackdrop').classList.add('open');

        try {
          const full = await api.getModrinthProject(hit.projectId);
          const cleanBody = String(full.body || '').replace(/[#*\x60]/g, '').slice(0, 1200);
          const licenseId = (full.license && full.license.id) || 'Standard';
          $('detailModalBody').innerHTML =
            '<div style="margin-bottom:12px;">' +
              '<strong>Downloads:</strong> ' + formatCompactNumber(hit.downloads) + ' &bull; ' +
              '<strong>Followers:</strong> ' + formatCompactNumber(hit.follows) + ' &bull; ' +
              '<strong>License:</strong> ' + licenseId +
            '</div>' +
            '<p style="margin-bottom:12px; color:#fff;">' + hit.description + '</p>' +
            '<div style="font-size:12px; color:var(--text-secondary); white-space:pre-wrap;">' + cleanBody + '</div>';
        } catch (_) {}
      });

      card.querySelector('[data-action="install"]').addEventListener('click', async e => {
        const btn = e.currentTarget;
        await handleInstallModrinthHit(hit, btn);
      });

      container.appendChild(card);
    });
  }

  async function handleInstallModrinthHit(hit, btnElement) {
    const prof = getActiveProfile();
    if (!prof) return;
    if (btnElement) {
      btnElement.disabled = true;
      btnElement.textContent = 'Installing...';
    }

    try {
      const res = await api.installModrinthContent({
        profileId: prof.id,
        projectId: hit.projectId,
        projectType: state.contentType,
        title: hit.title,
        author: hit.author,
        iconUrl: hit.iconUrl
      });
      hit.installed = true;
      if (btnElement) {
        btnElement.className = 'btn btn-sm glass-btn';
        btnElement.innerHTML = '&#10003; Installed';
      }
      const refreshedProfiles = await api.listProfiles();
      state.profiles = refreshedProfiles.profiles;
      state.installedItems = await api.listInstalledContent(prof.id, state.contentType);
      $('installedCountSpan').textContent = String(state.installedItems.length);
      showToast(
        res.isModpack
          ? 'Installed Modpack "' + hit.title + '" (' + res.filesInstalled + ' files) into ' + prof.name
          : 'Installed "' + hit.title + '" (' + res.fileName + ') into ' + prof.name,
        'success'
      );
    } catch (err) {
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.innerHTML = '&darr; Install';
      }
      showToast(err.message, 'error');
    }
  }

  function renderInstalledContentList() {
    const container = $('modrinthResultsContainer');
    container.innerHTML = '';
    if (!state.installedItems.length) {
      container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-muted);">No ' + state.contentType + 's installed in this profile yet. Switch to "Browse Content" to install.</div>';
      return;
    }
    const prof = getActiveProfile();
    state.installedItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'modrinth-item-card';
      const verExtra = item.versionNumber ? ' \u2022 Version ' + item.versionNumber : '';
      card.innerHTML =
        '<div class="modrinth-item-left"><div class="mod-icon">' + (item.title || 'M').slice(0, 2).toUpperCase() + '</div>' +
        '<div class="mod-details"><div class="mod-title-row"><span class="mod-title">' + item.title + '</span><span class="mod-author">' + item.fileName + '</span></div>' +
        '<div class="mod-desc">Status: ' + (item.enabled ? 'Enabled' : 'Disabled') + verExtra + '</div></div></div>' +
        '<div class="modrinth-item-actions"><button type="button" class="btn btn-sm glass-btn" data-action="toggle">' + (item.enabled ? 'Disable' : 'Enable') + '</button>' +
        '<button type="button" class="btn btn-sm btn-danger" data-action="remove">Remove</button></div>';
      card.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
        const res = await api.toggleInstalledContent(prof.id, item.fileName, state.contentType);
        state.installedItems = res.items;
        renderInstalledContentList();
      });
      card.querySelector('[data-action="remove"]').addEventListener('click', async () => {
        const res = await api.removeInstalledContent(prof.id, item.fileName, state.contentType);
        state.installedItems = res.items;
        $('installedCountSpan').textContent = String(state.installedItems.length);
        renderInstalledContentList();
        showToast('Removed ' + item.fileName);
      });
      container.appendChild(card);
    });
  }

  function renderAccountsView() {
    renderHeaderBar();
    updateToggleBadgesUI();
    const listContainer = $('inexAccountBadgesList');
    if (!listContainer) return;

    const q = String($('accountSearchInput').value || '').toLowerCase().trim();
    listContainer.innerHTML = '';

    const filtered = state.accounts.filter(a => !q || a.username.toLowerCase().includes(q));

    if (filtered.length === 0) {
      listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:12px;">No identities found.</div>';
    }

    filtered.forEach(acc => {
      const isSelected = acc.id === state.activeAccountId;
      const badge = document.createElement('div');
      badge.className = 'cyber-id-badge' + (isSelected ? ' active' : '');
      const accTypeLabel = acc.type === 'microsoft' ? 'MSA (VERIFIED)' : 'LOCAL (OFFLINE)';
      badge.innerHTML =
        '<div class="cyber-id-left">' +
          '<div class="cyber-id-avatar">' + renderMiniFaceSvg(acc.username) + '</div>' +
          '<div>' +
            '<div class="cyber-id-name">' + acc.username + '</div>' +
            '<div class="cyber-id-meta">' + accTypeLabel + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="inex-id-actions">' +
          '<button type="button" class="text-link-btn" data-action="remove" title="Remove" style="color:var(--text-muted); font-size:22px; line-height:1;">&times;</button>' +
        '</div>';

      badge.addEventListener('click', async e => {
        if (e.target.tagName.toLowerCase() === 'button') return;
        const updated = await api.setActiveAccount(acc.id);
        state.accounts = updated.accounts;
        state.activeAccountId = updated.activeAccountId;
        state.skinSlots = updated.skinSlots;
        renderAccountsView();
      });

      badge.querySelector('[data-action="remove"]').addEventListener('click', async e => {
        e.stopPropagation();
        try {
          const updated = await api.removeAccount(acc.id);
          state.accounts = updated.accounts;
          state.activeAccountId = updated.activeAccountId;
          state.skinSlots = updated.skinSlots;
          renderAccountsView();
          showToast('Removed account ' + acc.username);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      listContainer.appendChild(badge);
    });

    renderSkinSlots();
    drawMinecraftSkinPreview();
  }

  function renderSkinSlots() {
    ensureCyberSlotStyles();
    const container = $('skinSlotsContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!state.skinSlots || state.skinSlots.length === 0) {
      container.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:12px;">No slots available.</div>';
      return;
    }

    state.skinSlots.forEach(slot => {
      const card = document.createElement('div');
      card.className = 'cyber-slot-card' + (slot.active ? ' active' : '');
      const modelLabel = slot.model === 'slim' ? 'SLIM (ALEX)' : 'CLASSIC (STEVE)';
      const presetHtml = slot.customSkinDataUrl
        ? '<span style="color:var(--success);">CUSTOM UPLOAD</span>'
        : 'PRESET: ' + (slot.preset || 'CRIMSON-PHANTOM');
      const shortModel = slot.model === 'slim' ? 'SLIM' : 'CLASSIC';

      const equippedPillHtml = slot.active
        ? '<span class="cyber-status-pill">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' +
            'Equipped' +
          '</span>'
        : '';

      const applyBtnClass = slot.active ? 'cyber-btn-active-state' : 'cyber-btn-primary';
      const applyBtnInner = slot.active
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg><span>Active</span>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><span>Apply</span>';

      card.innerHTML =
        '<div style="display:flex; align-items:center; justify-content:space-between;">' +
          '<div style="display:flex; align-items:center; gap:12px;">' +
            '<div class="cyber-id-avatar" style="width:38px; height:38px; border-radius:8px;">' + renderMiniFaceSvg(slot.name) + '</div>' +
            '<div>' +
              '<div style="font-family:Consolas, monospace; font-weight:900; font-size:14px; color:#fff; letter-spacing:0.8px;">' + slot.name + '</div>' +
              '<div style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-secondary); margin-top:3px;">' +
                presetHtml + ' &nbsp;|&nbsp; MODEL: <span style="color:#fff;">' + shortModel + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          equippedPillHtml +
        '</div>' +
        '<div class="cyber-slot-actions">' +
          '<button type="button" class="cyber-btn" style="flex:1.15;" data-action="upload">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">' +
              '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
              '<polyline points="17 8 12 3 7 8"/>' +
              '<line x1="12" y1="3" x2="12" y2="15"/>' +
            '</svg>' +
            '<span>Upload PNG</span>' +
          '</button>' +
          '<button type="button" class="cyber-btn" style="flex:1.25;" data-action="model">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">' +
              '<polygon points="12 2 2 7 12 12 22 7 12 2"/>' +
              '<polyline points="2 17 12 22 22 17"/>' +
              '<polyline points="2 12 12 17 22 12"/>' +
            '</svg>' +
            '<span>' + modelLabel + '</span>' +
          '</button>' +
          '<button type="button" class="cyber-btn ' + applyBtnClass + '" style="min-width:105px;" data-action="apply">' +
            applyBtnInner +
          '</button>' +
          '<button type="button" class="cyber-btn cyber-btn-danger" data-action="delete" title="Delete Slot">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">' +
              '<polyline points="3 6 5 6 21 6"/>' +
              '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
              '<line x1="10" y1="11" x2="10" y2="17"/>' +
              '<line x1="14" y1="11" x2="14" y2="17"/>' +
            '</svg>' +
          '</button>' +
        '</div>';

      card.querySelector('[data-action="upload"]').addEventListener('click', () => {
        state.pendingUploadSlotId = slot.id;
        $('skinFileUploadInput').click();
      });

      card.querySelector('[data-action="model"]').addEventListener('click', async () => {
        const nextModel = slot.model === 'slim' ? 'classic' : 'slim';
        const updated = await api.updateSkinSlot(slot.id, { model: nextModel });
        state.skinSlots = updated.skinSlots;
        renderSkinSlots();
        drawMinecraftSkinPreview();
      });

      card.querySelector('[data-action="apply"]').addEventListener('click', async () => {
        const updated = await api.updateSkinSlot(slot.id, { active: true });
        state.skinSlots = updated.skinSlots;
        renderSkinSlots();
        drawMinecraftSkinPreview();
        showToast('Applied skin "' + slot.name + '"', 'success');
      });

      card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        try {
          const updated = await api.deleteSkinSlot(slot.id);
          state.skinSlots = updated.skinSlots;
          renderSkinSlots();
          drawMinecraftSkinPreview();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      container.appendChild(card);
    });
  }

  const skinImageCache = new Map();

  function getCachedImage(dataUrl) {
    if (!dataUrl) return null;
    if (skinImageCache.has(dataUrl)) {
      return skinImageCache.get(dataUrl);
    }
    const img = new Image();
    img.onload = () => {
      drawMinecraftSkinPreview();
    };
    img.src = dataUrl;
    skinImageCache.set(dataUrl, img);
    return img;
  }

  const DEFAULT_SKIN_PALETTES = {
    'crimson-phantom': { hair: '#0c0c10', skin: '#f3d8c7', eyes: '#e11d48', coat: '#181822', trim: '#e11d48', pants: '#0e0e14', shoes: '#be123c' },
    'obsidian-knight': { hair: '#111827', skin: '#e5c1a7', eyes: '#38bdf8', coat: '#1e1b4b', trim: '#6366f1', pants: '#0f172a', shoes: '#312e81' },
    'ash-valkyrie': { hair: '#f4f4f6', skin: '#f5d0c5', eyes: '#f43f5e', coat: '#27272a', trim: '#fb7185', pants: '#18181b', shoes: '#9f1239' },
    'blood-monarch': { hair: '#450a0a', skin: '#ecc5b0', eyes: '#fbbf24', coat: '#7f1d1d', trim: '#f59e0b', pants: '#1c1917', shoes: '#450a0a' }
  };
  const defaultSkinCache = {};

  function getDefaultSkinCanvas(presetId) {
    const key = DEFAULT_SKIN_PALETTES[presetId] ? presetId : 'crimson-phantom';
    if (defaultSkinCache[key]) return defaultSkinCache[key];
    const pal = DEFAULT_SKIN_PALETTES[key];
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    const R = (col, x, y, w, h) => {
      g.fillStyle = col;
      g.fillRect(x, y, w, h);
    };

    R(pal.skin, 8, 8, 8, 8);
    R(pal.hair, 8, 8, 8, 2);
    R(pal.hair, 8, 10, 1, 2);
    R(pal.hair, 15, 10, 1, 2);
    R('#ffffff', 9, 12, 2, 1);
    R(pal.eyes, 10, 12, 1, 1);
    R('#ffffff', 13, 12, 2, 1);
    R(pal.eyes, 13, 12, 1, 1);
    R('rgba(120,60,60,0.55)', 11, 14, 2, 1);
    R(pal.coat, 20, 20, 8, 12);
    R(pal.trim, 23, 20, 2, 12);
    R(pal.trim, 20, 29, 8, 1);
    [[44, 20], [36, 52]].forEach(pair => {
      const x = pair[0], y = pair[1];
      R(pal.coat, x, y, 4, 9);
      R(pal.trim, x, y + 8, 4, 1);
      R(pal.skin, x, y + 9, 4, 3);
    });
    [[4, 20], [20, 52]].forEach(pair => {
      const x = pair[0], y = pair[1];
      R(pal.pants, x, y, 4, 10);
      R(pal.shoes, x, y + 10, 4, 2);
    });

    R(pal.hair, 24, 8, 8, 8);
    R(pal.coat, 32, 20, 8, 12);
    [[52, 20], [44, 52]].forEach(pair => {
      const x = pair[0], y = pair[1];
      R(pal.coat, x, y, 4, 9);
      R(pal.trim, x, y + 8, 4, 1);
      R(pal.skin, x, y + 9, 4, 3);
    });
    [[12, 20], [28, 52]].forEach(pair => {
      const x = pair[0], y = pair[1];
      R(pal.pants, x, y, 4, 10);
      R(pal.shoes, x, y + 10, 4, 2);
    });

    defaultSkinCache[key] = c;
    return c;
  }

  function drawMinecraftSkinPreview() {
    const canvas = $('skinCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;

    if (!state.skinSlots || state.skinSlots.length === 0) return;

    const activeSlot = state.skinSlots.find(s => s.active) || state.skinSlots[0];

    let tex = null;
    if (activeSlot.customSkinDataUrl) {
      const img = getCachedImage(activeSlot.customSkinDataUrl);
      if (img && img.complete && img.naturalWidth >= 64) tex = img;
    }
    if (!tex) tex = getDefaultSkinCanvas(activeSlot.preset);

    const isSlim = activeSlot.model === 'slim';
    const tw = tex.width || tex.naturalWidth;
    const th = tex.height || tex.naturalHeight;
    const k = tw / 64;
    const legacy = th * 2 === tw;

    const S = 7;
    const armPx = isSlim ? 3 : 4;

    const cxFront = W * 0.30;
    const cxBack = W * 0.70;
    const topY = 28;

    const drawPart = (sx, sy, sw, sh, px, py, flip = false) => {
      ctx.save();
      if (flip) {
        ctx.translate(px + sw * S, py);
        ctx.scale(-1, 1);
        ctx.drawImage(tex, sx * k, sy * k, sw * k, sh * k, 0, 0, sw * S, sh * S);
      } else {
        ctx.drawImage(tex, sx * k, sy * k, sw * k, sh * k, px, py, sw * S, sh * S);
      }
      ctx.restore();
    };

    ctx.fillStyle = 'rgba(225, 29, 72, 0.2)';
    ctx.beginPath();
    ctx.ellipse(cxFront, topY + 32 * S + 6, 34, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    const hXF = cxFront - 4 * S;
    const bXF = cxFront - 4 * S, bYF = topY + 8 * S;
    const raXF = cxFront - 4 * S - armPx * S, raYF = topY + 8 * S;
    const laXF = cxFront + 4 * S, laYF = topY + 8 * S;
    const rlXF = cxFront - 4 * S, rlYF = topY + 20 * S;
    const llXF = cxFront, llYF = topY + 20 * S;

    drawPart(8, 8, 8, 8, hXF, topY, false);
    drawPart(20, 20, 8, 12, bXF, bYF, false);
    drawPart(44, 20, armPx, 12, raXF, raYF, false);
    if (legacy) {
      drawPart(44, 20, armPx, 12, laXF, laYF, true);
      drawPart(4, 20, 4, 12, llXF, llYF, true);
    } else {
      drawPart(36, 52, armPx, 12, laXF, laYF, false);
      drawPart(20, 52, 4, 12, llXF, llYF, false);
    }
    drawPart(4, 20, 4, 12, rlXF, rlYF, false);

    drawPart(40, 8, 8, 8, hXF, topY, false);
    if (!legacy) {
      drawPart(20, 36, 8, 12, bXF, bYF, false);
      drawPart(44, 36, armPx, 12, raXF, raYF, false);
      drawPart(52, 52, armPx, 12, laXF, laYF, false);
      drawPart(4, 36, 4, 12, rlXF, rlYF, false);
      drawPart(4, 52, 4, 12, llXF, llYF, false);
    }

    ctx.fillStyle = 'rgba(225, 29, 72, 0.2)';
    ctx.beginPath();
    ctx.ellipse(cxBack, topY + 32 * S + 6, 34, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    const hXB = cxBack - 4 * S;
    const bXB = cxBack - 4 * S, bYB = topY + 8 * S;
    const laXB = cxBack - 4 * S - armPx * S, laYB = topY + 8 * S;
    const raXB = cxBack + 4 * S, raYB = topY + 8 * S;
    const llXB = cxBack - 4 * S, llYB = topY + 20 * S;
    const rlXB = cxBack, rlYB = topY + 20 * S;

    const rightArmBackX = isSlim ? 51 : 52;
    const leftArmBackX = isSlim ? 43 : 44;

    drawPart(24, 8, 8, 8, hXB, topY, false);
    drawPart(32, 20, 8, 12, bXB, bYB, false);

    if (legacy) drawPart(rightArmBackX, 20, armPx, 12, laXB, laYB, true);
    else drawPart(leftArmBackX, 52, armPx, 12, laXB, laYB, false);

    drawPart(rightArmBackX, 20, armPx, 12, raXB, raYB, false);

    if (legacy) drawPart(12, 20, 4, 12, llXB, llYB, true);
    else drawPart(28, 52, 4, 12, llXB, llYB, false);

    drawPart(12, 20, 4, 12, rlXB, rlYB, false);

    drawPart(56, 8, 8, 8, hXB, topY, false);
    if (!legacy) {
      const rightSleeveBackX = isSlim ? 51 : 52;
      const leftSleeveBackX = isSlim ? 59 : 60;

      drawPart(32, 36, 8, 12, bXB, bYB, false);
      drawPart(leftSleeveBackX, 52, armPx, 12, laXB, laYB, false);
      drawPart(rightSleeveBackX, 36, armPx, 12, raXB, raYB, false);
      drawPart(12, 52, 4, 12, llXB, llYB, false);
      drawPart(12, 36, 4, 12, rlXB, rlYB, false);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W * 0.5, 24);
    ctx.lineTo(W * 0.5, H - 42);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '800 11px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FRONT VIEW', cxFront, H - 16);
    ctx.fillText('BACK VIEW', cxBack, H - 16);
  }

  async function renderHudModList() {
    const el = $('hudModListText');
    const sel = $('hudJarSelect');
    if (el) el.textContent = '';
    try {
      const prof = getActiveProfile();
      const res = api.listHudMods ? await api.listHudMods(prof ? prof.id : null) : { jars: [] };
      const jars = (res && res.jars) || [];
      const saved = (state.settings && state.settings.activeHudJar) || '';

      if (sel) {
        sel.innerHTML = '';
        const add = (value, label) => {
          const o = document.createElement('option');
          o.value = value;
          o.textContent = label;
          sel.appendChild(o);
        };
        add('', 'Auto (all supported HUD jars)');
        add('__none__', 'None (HUD off)');
        jars.forEach(j => add(j.fileName, j.fileName + (j.supported ? '' : '  (not supported by active profile)')));
        if (saved && saved !== '__none__' && !jars.some(j => j.fileName === saved)) add(saved, saved + '  (file missing)');
        sel.value = saved;
      }

      if (el) {
        if (!jars.length) {
          el.textContent = 'No HUD jar found yet. Drop your .jar into the HUD Mods folder, or press Upload.';
        } else {
          jars.forEach(j => {
            const row = document.createElement('div');
            row.textContent =
              (j.supported ? '\u2713 ' : '\u2717 ') + j.fileName + ' - ' +
              (j.supported ? 'works with the active profile' : j.reason || 'not supported by the active profile');
            el.appendChild(row);
          });
        }
      }
    } catch (_) {}
  }

  async function renderSettingsView() {
    const s = state.settings;
    if (!s) return;

    updateToggleBadgesUI();

    $('settingDiscordToggle').checked = s.discordRpcEnabled !== false;
    if ($('settingDiscordStatusInput')) $('settingDiscordStatusInput').value = s.discordStatusText || 'INEX CLIENT - Windows Edition';
    $('settingGlassSlider').value = s.glassIntensity || 24;
    $('settingGlassValueLabel').textContent = (s.glassIntensity || 24) + 'px';

    $('settingFullscreenToggle').checked = Boolean(s.fullscreen);
    $('settingWindowWidthInput').value = s.windowWidth || 1280;
    $('settingWindowHeightInput').value = s.windowHeight || 720;
    $('settingGameDataDirText').textContent = s.gameDataDir || '';
    $('settingInstallDirText').textContent = s.installDir || '';
    $('settingConfigDirText').textContent = s.configDir || '';
    if ($('settingJavaDirText')) $('settingJavaDirText').textContent = s.javaDir || '';
    $('settingDefaultRamSlider').value = s.defaultRamMB || 4096;
    $('settingDefaultRamLabel').textContent = ((s.defaultRamMB || 4096) / 1024).toFixed(1) + ' GB';
    if ($('settingConcurrentInput')) $('settingConcurrentInput').value = s.concurrentDownloads || 8;
    $('settingCloseBehaviorSelect').value = s.closeBehavior || 'keep-open';
    if ($('settingSnapshotsToggle')) $('settingSnapshotsToggle').checked = Boolean(s.showSnapshots);

    if (state.javaRuntimes && state.javaRuntimes.length > 0) {
      $('detectedJavaSummaryText').textContent =
        'Detected Runtimes: ' + state.javaRuntimes.map(r => 'Java ' + r.major + ' (' + r.version + ')').join(', ');
    }

    try {
      const dStatus = await api.getDiscordStatus();
      if (dStatus) {
        $('discordStatusBadge').textContent = dStatus.statusText || (dStatus.enabled ? 'Active' : 'Disabled');
      }
    } catch (_) {}

    renderHudModList();
  }

  async function triggerPlayOrStop() {
    const acc = getActiveAccount();
    if (!acc) {
      showToast('Please add an account in the Accounts tab before launching!', 'error');
      switchNavigation('accounts');
      return;
    }

    const prof = getActiveProfile();
    if (!prof) {
      switchNavigation('profiles');
      openCreateProfileForm();
      return;
    }

    if (state.runningProfileIds.has(prof.id)) {
      await api.stopProfile(prof.id);
      state.runningProfileIds.delete(prof.id);
      renderHomeView();
      showToast('Stopped ' + prof.name);
      return;
    }

    try {
      $('installProgressDrawer').classList.add('visible');
      $('progressStageText').textContent = 'Preparing ' + prof.name + '...';
      $('progressPercentText').textContent = '5%';
      $('progressBarFill').style.width = '5%';
      $('progressDetailText').textContent = 'Validating profile, Java runtime, and game files...';

      const res = await api.launchProfile(prof.id);
      if (res && res.launched) {
        state.runningProfileIds.add(prof.id);
        const refreshed = await api.listProfiles();
        state.profiles = refreshed.profiles;
        renderHomeView();
        showToast('Launched ' + prof.name + ' (PID ' + res.pid + ')', 'success');
      }
    } catch (err) {
      appendConsoleLog('[LAUNCH ERROR] ' + err.message, 'error');
      showToast(err.message, 'error');
    } finally {
      setTimeout(() => {
        $('installProgressDrawer').classList.remove('visible');
      }, 1200);
    }
  }

  function bindEvents() {
    $('winMinBtn').addEventListener('click', () => api.minimizeWindow());
    $('winMaxBtn').addEventListener('click', () => api.maximizeWindow());
    $('winCloseBtn').addEventListener('click', () => api.closeWindow());

    $('headerProfilePill').addEventListener('click', () => switchNavigation('profiles'));
    $('headerAccountPill').addEventListener('click', () => switchNavigation('accounts'));

    $('openLogsBtn').addEventListener('click', () => {
      $('logsModalBackdrop').classList.add('open');
    });
    $('closeLogsModalBtn').addEventListener('click', () => {
      $('logsModalBackdrop').classList.remove('open');
    });
    $('clearLogsBtn').addEventListener('click', () => {
      $('logConsoleOutput').innerHTML = '';
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        switchNavigation(btn.getAttribute('data-nav'));
      });
    });

    $('mainPlayBtn').addEventListener('click', () => triggerPlayOrStop());
    $('launchDropdownBtn').addEventListener('click', e => {
      e.stopPropagation();
      $('homeProfileDropdown').classList.toggle('open');
    });
    document.addEventListener('click', () => {
      $('homeProfileDropdown').classList.remove('open');
    });

    $('cancelInstallBtn').addEventListener('click', async () => {
      const prof = getActiveProfile();
      if (prof) {
        await api.cancelInstallation(prof.id);
        $('installProgressDrawer').classList.remove('visible');
        showToast('Installation cancelled.');
      }
    });

    $('profileSearchInput').addEventListener('input', () => renderProfilesView());
    $('profileSortSelect').addEventListener('change', () => renderProfilesView());
    $('openCreateProfileBtn').addEventListener('click', () => openCreateProfileForm());
    $('closeCreateProfileBtn').addEventListener('click', () => {
      $('createProfileSubView').style.display = 'none';
      $('profilesListSubView').style.display = 'block';
    });
    $('cancelProfileFormBtn').addEventListener('click', () => {
      $('createProfileSubView').style.display = 'none';
      $('profilesListSubView').style.display = 'block';
    });

    $('formBrowseModpacksBtn').addEventListener('click', () => {
      openProfileContentBrowser('modpack');
    });

    $('toggleAdvancedSetupBtn').addEventListener('click', () => {
      state.advancedSetupOpen = !state.advancedSetupOpen;
      $('advancedProfileFields').style.display = state.advancedSetupOpen ? 'flex' : 'none';
      $('toggleAdvancedSetupBtn').classList.toggle('active', state.advancedSetupOpen);
      const labelSpan = $('toggleAdvancedSetupText');
      if (labelSpan) {
        labelSpan.textContent = state.advancedSetupOpen ? 'Hide advanced' : 'Advanced setup';
      }
    });

    $('profileVersionSelect').addEventListener('change', async e => {
      const ver = e.target.value;
      renderVersionPostersGrid(ver);
      await refreshSupportedLoadersForForm(ver);
      updateAutoProfileName();
    });

    $('profileLoaderSelect').addEventListener('change', async () => {
      await refreshSupportedLoadersForForm($('profileVersionSelect').value);
      checkVanillaLoaderUi();
      updateAutoProfileName();
    });

    $('profileRamSlider').addEventListener('input', e => {
      const mb = Number(e.target.value);
      $('profileRamValueLabel').textContent = (mb / 1024).toFixed(1) + ' GB';
    });

    $('refreshManifestBtn').addEventListener('click', async () => {
      const data = await api.listVersions({ forceRefresh: true, includeSnapshots: state.settings.showSnapshots });
      state.versions = data.versions || [];
      showToast('Refreshed official Mojang version manifest (' + state.versions.length + ' versions).', 'success');
      openCreateProfileForm();
    });

    $('saveProfileSubmitBtn').addEventListener('click', async () => {
      const editId = $('editingProfileIdInput').value;
      const payload = {
        name: $('profileNameInput').value,
        version: $('profileVersionSelect').value,
        loader: $('profileLoaderSelect').value,
        loaderVersion: $('profileLoaderVersionSelect').value || 'latest',
        javaRuntime: $('profileJavaSelect').value || 'auto',
        ramMB: Number($('profileRamSlider').value),
        hudEnabled: $('profileHudEnabledInput') ? $('profileHudEnabledInput').checked : true
      };

      const loaderOpt = $('profileLoaderSelect').selectedOptions[0];
      if (loaderOpt && loaderOpt.disabled) {
        showToast(payload.loader.toUpperCase() + ' is not available for Minecraft ' + payload.version + '. Please select an available loader or change the version.', 'error');
        return;
      }

      try {
        if (editId) {
          const res = await api.updateProfile(editId, payload);
          state.profiles = res.state.profiles;
          state.activeProfileId = res.state.activeProfileId;
          showToast('Updated profile "' + res.profile.name + '"', 'success');
        } else {
          const res = await api.createProfile(payload);
          state.profiles = res.state.profiles;
          state.activeProfileId = res.state.activeProfileId;
          showToast('Created profile "' + res.profile.name + '"', 'success');
        }
        $('createProfileSubView').style.display = 'none';
        $('profilesListSubView').style.display = 'block';
        renderProfilesView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    $('cancelDeleteProfileBtn').addEventListener('click', () => {
      $('deleteConfirmModalBackdrop').classList.remove('open');
    });
    $('confirmDeleteProfileBtn').addEventListener('click', async () => {
      if (!state.pendingDeleteProfileId) return;
      try {
        const updated = await api.deleteProfile(state.pendingDeleteProfileId);
        state.profiles = updated.profiles;
        state.activeProfileId = updated.activeProfileId;
        $('deleteConfirmModalBackdrop').classList.remove('open');
        renderProfilesView();
        showToast('Profile deleted.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    $('contentTargetProfileSelect').addEventListener('change', async e => {
      const updated = await api.setActiveProfile(e.target.value);
      state.profiles = updated.profiles;
      state.activeProfileId = updated.activeProfileId;
      state.modrinthOffset = 0;
      refreshContentBrowser();
    });

    document.querySelectorAll('.type-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.contentType = btn.getAttribute('data-content-type');
        state.modrinthOffset = 0;
        refreshContentBrowser();
      });
    });

    $('backToProfilesFromContentBtn').addEventListener('click', () => switchNavigation('profiles'));

    $('modeBrowseBtn').addEventListener('click', () => {
      state.contentMode = 'browse';
      refreshContentBrowser();
    });
    $('modeInstalledBtn').addEventListener('click', () => {
      state.contentMode = 'installed';
      refreshContentBrowser();
    });

    let searchDebounce = null;
    $('modrinthSearchInput').addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        state.modrinthOffset = 0;
        if (state.contentMode === 'browse') executeModrinthSearch();
      }, 280);
    });

    $('modrinthSortSelect').addEventListener('change', () => {
      state.modrinthOffset = 0;
      executeModrinthSearch();
    });

    $('modrinthRefreshBtn').addEventListener('click', () => executeModrinthSearch());

    $('modrinthPrevPageBtn').addEventListener('click', () => {
      if (state.modrinthOffset >= state.modrinthLimit) {
        state.modrinthOffset -= state.modrinthLimit;
        executeModrinthSearch();
      }
    });
    $('modrinthNextPageBtn').addEventListener('click', () => {
      if (state.modrinthOffset + state.modrinthLimit < state.modrinthTotal) {
        state.modrinthOffset += state.modrinthLimit;
        executeModrinthSearch();
      }
    });

    $('closeProjectDetailsBtn').addEventListener('click', () => {
      $('projectDetailsModalBackdrop').classList.remove('open');
    });
    $('detailModalInstallBtn').addEventListener('click', async () => {
      if (!state.selectedProjectForModal) return;
      await handleInstallModrinthHit(state.selectedProjectForModal, $('detailModalInstallBtn'));
      $('projectDetailsModalBackdrop').classList.remove('open');
      renderModrinthHits();
    });

    $('accountSearchInput').addEventListener('input', () => renderAccountsView());
    $('openAddAccountBtn').addEventListener('click', () => {
      if ($('accountsMainView')) $('accountsMainView').style.display = 'none';
      $('addAccountSubView').style.display = 'flex';
    });
    $('closeAddAccountBtn').addEventListener('click', () => {
      $('addAccountSubView').style.display = 'none';
      if ($('accountsMainView')) $('accountsMainView').style.display = 'flex';
    });

    $('selectMsAccountTile').addEventListener('click', () => {
      $('selectMsAccountTile').classList.add('selected');
      $('selectLocalAccountTile').classList.remove('selected');
      $('msAccountFormPanel').style.display = 'flex';
      $('localAccountFormPanel').style.display = 'none';
    });
    $('selectLocalAccountTile').addEventListener('click', () => {
      $('selectLocalAccountTile').classList.add('selected');
      $('selectMsAccountTile').classList.remove('selected');
      $('localAccountFormPanel').style.display = 'flex';
      $('msAccountFormPanel').style.display = 'none';
    });

    $('signInMicrosoftBtn').addEventListener('click', async () => {
      try {
        const updated = await api.loginMicrosoftAccount();
        state.accounts = updated.accounts;
        state.activeAccountId = updated.activeAccountId;
        state.skinSlots = updated.skinSlots;
        $('addAccountSubView').style.display = 'none';
        if ($('accountsMainView')) $('accountsMainView').style.display = 'flex';
        renderAccountsView();
        showToast('Signed in with Microsoft!', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    $('createLocalAccountBtn').addEventListener('click', async () => {
      try {
        const updated = await api.addLocalAccount($('localUsernameInput').value);
        state.accounts = updated.accounts;
        state.activeAccountId = updated.activeAccountId;
        state.skinSlots = updated.skinSlots;
        $('localUsernameInput').value = '';
        $('addAccountSubView').style.display = 'none';
        if ($('accountsMainView')) $('accountsMainView').style.display = 'flex';
        renderAccountsView();
        showToast('Added Local Account!', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    $('addSkinSlotBtn').addEventListener('click', async () => {
      const updated = await api.addSkinSlot();
      state.skinSlots = updated.skinSlots;
      renderSkinSlots();
      showToast('Added new skin slot.');
    });

    $('skinFileUploadInput').addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file || !state.pendingUploadSlotId) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const updated = await api.updateSkinSlot(state.pendingUploadSlotId, {
            customSkinDataUrl: String(reader.result),
            active: true
          });
          state.skinSlots = updated.skinSlots;
          renderSkinSlots();
          drawMinecraftSkinPreview();
          showToast('Uploaded PNG skin (' + file.name + ')', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
      reader.readAsDataURL(file);
    });

    const saveSettingsField = async partial => {
      try {
        state.settings = await api.updateSettings(partial);
        applyAppearanceSettings();
        renderSettingsView();
        showToast('Settings saved.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };

    if ($('settingSkinSyncToggle')) {
      $('settingSkinSyncToggle').addEventListener('change', async e => {
        const enabled = e.target.checked;
        state.settings = await api.updateSettings({ enableSkinSync: enabled });
        applyAppearanceSettings();
        showToast(
          enabled
            ? 'Online Skin Sync ON: Everyone with INEX sees each others skins!'
            : 'Online Skin Sync OFF: Local Self-Skin Only (Max FPS Cracked Mode).',
          enabled ? 'success' : 'warning'
        );
      });
    }

    if ($('settingAnimationsToggle')) {
      $('settingAnimationsToggle').addEventListener('change', async e => {
        const enabled = e.target.checked;
        state.settings = await api.updateSettings({ launcherAnimations: enabled });
        applyAppearanceSettings();
        showToast(
          enabled
            ? 'Launcher Cyber Animations ENABLED.'
            : 'Launcher Animations OFF (0% Background GPU Mode).',
          enabled ? 'success' : 'warning'
        );
      });
    }

    $('settingDiscordToggle').addEventListener('change', e =>
      saveSettingsField({ discordRpcEnabled: e.target.checked })
    );
    if ($('settingDiscordStatusInput')) {
      $('settingDiscordStatusInput').addEventListener('change', e =>
        saveSettingsField({ discordStatusText: e.target.value })
      );
    }
    $('settingGlassSlider').addEventListener('input', e => {
      const px = Number(e.target.value);
      $('settingGlassValueLabel').textContent = px + 'px';
      document.documentElement.style.setProperty('--glass-blur', px + 'px');
    });
    $('settingGlassSlider').addEventListener('change', e =>
      saveSettingsField({ glassIntensity: Number(e.target.value) })
    );

    if ($('selectCustomLogoBtn')) {
      $('selectCustomLogoBtn').addEventListener('click', async () => {
        if (!api.selectCustomLogo) return;
        const res = await api.selectCustomLogo();
        if (res && !res.canceled && res.dataUrl) {
          state.settings.customLogoDataUrl = res.dataUrl;
          applyAppearanceSettings();
          showToast('Updated INEX brand logo across the launcher!', 'success');
        }
      });
    }

    const handleBundleJavaClick = async major => {
      try {
        showToast('Downloading & bundling Portable Java ' + major + '...', 'info');
        const res = await api.bundlePortableJava(major);
        if (res && res.runtimes) {
          state.javaRuntimes = res.runtimes;
        }
        renderSettingsView();
        showToast('Bundled Portable Java ' + major + ' into InexClient/runtimes!', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };

    $('bundleJava21Btn').addEventListener('click', () => handleBundleJavaClick(21));
    $('bundleJava17Btn').addEventListener('click', () => handleBundleJavaClick(17));
    $('bundleJava8Btn').addEventListener('click', () => handleBundleJavaClick(8));

    $('settingFullscreenToggle').addEventListener('change', e => saveSettingsField({ fullscreen: e.target.checked }));
    $('settingWindowWidthInput').addEventListener('change', e => saveSettingsField({ windowWidth: Number(e.target.value) }));
    $('settingWindowHeightInput').addEventListener('change', e => saveSettingsField({ windowHeight: Number(e.target.value) }));
    $('settingDefaultRamSlider').addEventListener('input', e => {
      $('settingDefaultRamLabel').textContent = (Number(e.target.value) / 1024).toFixed(1) + ' GB';
    });
    $('settingDefaultRamSlider').addEventListener('change', e => saveSettingsField({ defaultRamMB: Number(e.target.value) }));
    if ($('settingConcurrentInput')) {
      $('settingConcurrentInput').addEventListener('change', e => saveSettingsField({ concurrentDownloads: Number(e.target.value) }));
    }
    $('settingCloseBehaviorSelect').addEventListener('change', e => saveSettingsField({ closeBehavior: e.target.value }));
    if ($('settingSnapshotsToggle')) {
      $('settingSnapshotsToggle').addEventListener('change', async e => {
        await saveSettingsField({ showSnapshots: e.target.checked });
        const vData = await api.listVersions({ includeSnapshots: e.target.checked });
        state.versions = vData.versions || [];
      });
    }

    $('changeGameDataDirBtn').addEventListener('click', async () => {
      const res = await api.selectDirectoryDialog(state.settings.gameDataDir);
      if (!res.canceled && res.path) {
        await saveSettingsField({ gameDataDir: res.path });
      }
    });

    document.querySelectorAll('[data-open-dir]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.getAttribute('data-open-dir');
        const res = await api.openDirectoryInExplorer(key);
        showToast('Opened folder: ' + res.path);
      });
    });

    $('resetSettingsBtn').addEventListener('click', async () => {
      state.settings = await api.resetSettings();
      applyAppearanceSettings();
      renderSettingsView();
      showToast('Settings restored to defaults.');
    });

    if ($('hudJarSelect')) {
      $('hudJarSelect').addEventListener('change', async e => {
        await saveSettingsField({ activeHudJar: e.target.value });
        showToast(e.target.value === '__none__' ? 'HUD jar: off' : e.target.value ? 'HUD jar: ' + e.target.value : 'HUD jar: auto (all supported)');
      });
    }

    if ($('uploadHudJarBtn')) {
      $('uploadHudJarBtn').addEventListener('click', async () => {
        try {
          const res = await api.uploadHudMod();
          if (res && res.rejected) {
            showToast('Not a valid mod jar: ' + res.reason, 'error');
          } else if (res && !res.canceled && res.fileName) {
            if (res.compatible === false) {
              showToast('Saved ' + res.fileName + ', but the active profile is not supported: ' + res.reason, 'info');
            } else {
              showToast('HUD mod added: ' + res.fileName, 'success');
            }
            renderHudModList();
          }
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    api.onInstallProgress(data => {
      const drawer = $('installProgressDrawer');
      drawer.classList.add('visible');
      $('progressStageText').textContent = data.stage || 'Installing...';
      $('progressPercentText').textContent = (data.percent || 0) + '%';
      $('progressBarFill').style.width = (data.percent || 0) + '%';
      $('progressDetailText').textContent = data.detail || '';
    });

    api.onGameLog(entry => {
      appendConsoleLog(entry.line, entry.level);
    });

    api.onGameExit(info => {
      state.runningProfileIds.delete(info.profileId);
      renderHomeView();
      showToast('Minecraft exited (code ' + info.code + ')');
    });
  }

  async function initApp() {
    ensureCyberSlotStyles();
    bindEvents();
    try {
      const boot = await api.getBootstrapState();
      state.settings = boot.settings || {};
      state.profiles = (boot.profilesState && boot.profilesState.profiles) || [];
      state.activeProfileId = (boot.profilesState && boot.profilesState.activeProfileId) || (state.profiles[0] && state.profiles[0].id) || null;
      state.accounts = (boot.accountsState && boot.accountsState.accounts) || [];
      state.activeAccountId = (boot.accountsState && boot.accountsState.activeAccountId) || (state.accounts[0] && state.accounts[0].id);

      const initialActiveAcc = state.accounts.find(a => a.id === state.activeAccountId) || state.accounts[0];
      state.skinSlots = (initialActiveAcc && initialActiveAcc.skinSlots) || (boot.accountsState && boot.accountsState.skinSlots) || [];

      state.javaRuntimes = boot.javaRuntimes || [];
      state.versions = (boot.versionsData && boot.versionsData.versions) || [];
      state.runningProfileIds = new Set(boot.runningProfileIds || []);
      state.discordStatus = boot.discordStatus || null;

      applyAppearanceSettings();
      appendConsoleLog('[INEX] Launcher initialized. Auto-Java Bundler, Default HUD Hook & Discord Rich Presence ready.');
      renderHomeView();
    } catch (err) {
      appendConsoleLog('[BOOT ERROR] ' + err.message, 'error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();