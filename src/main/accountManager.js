const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { createStoredZipBuffer } = require('./zipUtils');

const MS_CLIENT_ID = '00000000402b5328';
const MS_REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';

function createPurePng(width, height, getPixel) {
  const rowSize = width * 4 + 1;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = getPixel(x, y);
      raw[pxOffset] = r;
      raw[pxOffset + 1] = g;
      raw[pxOffset + 2] = b;
      raw[pxOffset + 3] = a !== undefined ? a : 255;
    }
  }
  const idatData = zlib.deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const crcTable = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[i] = c;
  }
  function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ (-1));
  }
  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'binary');
    const crcVal = crc32(Buffer.concat([t, data]));
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crcVal >>> 0, 0);
    return Buffer.concat([len, t, data, c]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', idatData), makeChunk('IEND', Buffer.alloc(0))]);
}

function agentSupportsVersion(version) {
  const v = String(version || '').trim();
  if (/^2[6-9]w/i.test(v)) return true;
  const major = parseInt(v.split('.')[0], 10);
  return Number.isFinite(major) && major >= 26;
}

class AccountManager {
  constructor(settingsManager) {
    this.settingsManager = settingsManager;
    const configDir = this.settingsManager.getSettings().configDir;
    this.accountsFile = path.join(configDir, 'accounts.json');
    this.tokensFile = path.join(configDir, 'auth_tokens.json');
    this.skinsDir = path.join(configDir, 'skins');
    try {
      fs.mkdirSync(this.skinsDir, { recursive: true });
    } catch (_) {}

    this.state = this._load();
    this.tokens = this._loadTokens();
  }

  generateOfflineUuid(username) {
    const md5Bytes = crypto.createHash('md5').update(`OfflinePlayer:${username}`, 'utf8').digest();
    md5Bytes[6] = (md5Bytes[6] & 0x0f) | 0x30;
    md5Bytes[8] = (md5Bytes[8] & 0x3f) | 0x80;
    const hex = md5Bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  _defaultSkinSlots() {
    return [
      {
        id: 'slot-1',
        name: 'Slot 1 — Crimson Phantom',
        model: 'slim',
        preset: 'crimson-phantom',
        customSkinDataUrl: null,
        active: true
      },
      {
        id: 'slot-2',
        name: 'Slot 2 — Obsidian Knight',
        model: 'classic',
        preset: 'obsidian-knight',
        customSkinDataUrl: null,
        active: false
      }
    ];
  }

  _load() {
    try {
      if (fs.existsSync(this.accountsFile)) {
        const parsed = JSON.parse(fs.readFileSync(this.accountsFile, 'utf8'));
        if (parsed && Array.isArray(parsed.accounts) && parsed.accounts.length > 0) {
          const globalSlots = parsed.skinSlots || this._defaultSkinSlots();

          parsed.accounts.forEach(acc => {
            if (!acc.skinSlots || !Array.isArray(acc.skinSlots) || acc.skinSlots.length === 0) {
              acc.skinSlots = JSON.parse(JSON.stringify(globalSlots));
            }
            if (!acc.activeSkinSlot) {
              acc.activeSkinSlot = acc.skinSlots[0].id;
            }
            acc.skinSlots.forEach(s => {
              delete s.capePreset;
              delete s.customCapeDataUrl;
            });
          });

          return {
            activeAccountId: parsed.activeAccountId || parsed.accounts[0].id,
            accounts: parsed.accounts
          };
        }
      }
    } catch (_) {}

    const initial = {
      activeAccountId: null,
      accounts: []
    };
    this._save(initial);
    return initial;
  }

  _loadTokens() {
    try {
      if (fs.existsSync(this.tokensFile)) {
        return JSON.parse(fs.readFileSync(this.tokensFile, 'utf8'));
      }
    } catch (_) {}
    return {};
  }

  _saveTokens() {
    try {
      fs.writeFileSync(this.tokensFile, JSON.stringify(this.tokens, null, 2), { mode: 0o600 });
    } catch (_) {}
  }

  _save(state = this.state) {
    try {
      fs.mkdirSync(path.dirname(this.accountsFile), { recursive: true });
      const tmp = `${this.accountsFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
      fs.renameSync(tmp, this.accountsFile);
    } catch (_) {}
  }

  listAccounts() {
    const activeAcc = this.state.accounts.find(a => a.id === this.state.activeAccountId) || this.state.accounts[0];
    const activeSkinSlots = activeAcc && activeAcc.skinSlots ? activeAcc.skinSlots.map(s => ({ ...s })) : [];

    return {
      activeAccountId: this.state.activeAccountId,
      accounts: this.state.accounts.map(acc => ({
        id: acc.id,
        username: acc.username,
        uuid: acc.uuid,
        type: acc.type,
        authenticatedOnline: Boolean(acc.authenticatedOnline),
        addedAt: acc.addedAt,
        activeSkinSlot: acc.activeSkinSlot || (acc.skinSlots && acc.skinSlots.length ? acc.skinSlots[0].id : 'slot-1')
      })),
      skinSlots: activeSkinSlots
    };
  }

  getActiveAccount() {
    const acc = this.state.accounts.find(a => a.id === this.state.activeAccountId) || this.state.accounts[0] || null;
    if (!acc) return null;
    const tokenEntry = this.tokens[acc.id] || {};
    return {
      ...acc,
      accessToken: acc.type === 'microsoft' && tokenEntry.mcAccessToken ? tokenEntry.mcAccessToken : '0'
    };
  }

  getActiveSkinSlot() {
    const activeAcc = this.getActiveAccount();
    const activeSlotId = activeAcc ? activeAcc.activeSkinSlot : 'slot-1';
    const slots = activeAcc && activeAcc.skinSlots ? activeAcc.skinSlots : this._defaultSkinSlots();
    return (
      slots.find(s => s.id === activeSlotId) ||
      slots.find(s => s.active) ||
      slots[0] || { id: 'slot-1', model: 'slim', preset: 'crimson-phantom' }
    );
  }

  setActiveAccount(accountId) {
    const found = this.state.accounts.find(a => a.id === accountId);
    if (!found) {
      throw new Error(`Account not found: ${accountId}`);
    }
    this.state.activeAccountId = found.id;
    this._save();
    return this.listAccounts();
  }

  addLocalAccount(username) {
    const clean = String(username || '').trim();
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(clean)) {
      throw new Error('Minecraft usernames must be 3–16 characters and contain only letters, numbers, or underscores.');
    }

    const existing = this.state.accounts.find(a => a.username.toLowerCase() === clean.toLowerCase() && a.type === 'local');
    if (existing) {
      this.state.activeAccountId = existing.id;
      this._save();
      return this.listAccounts();
    }

    const newAcc = {
      id: `local-${clean.toLowerCase()}-${crypto.randomBytes(2).toString('hex')}`,
      username: clean,
      uuid: this.generateOfflineUuid(clean),
      type: 'local',
      authenticatedOnline: false,
      addedAt: new Date().toISOString(),
      activeSkinSlot: 'slot-1',
      skinSlots: this._defaultSkinSlots()
    };

    this.state.accounts.unshift(newAcc);
    this.state.activeAccountId = newAcc.id;
    this._save();
    return this.listAccounts();
  }

  removeAccount(accountId) {
    const idx = this.state.accounts.findIndex(a => a.id === accountId);
    if (idx === -1) {
      throw new Error('Account not found.');
    }
    const removed = this.state.accounts.splice(idx, 1)[0];
    delete this.tokens[removed.id];
    this._saveTokens();

    if (this.state.activeAccountId === removed.id) {
      this.state.activeAccountId = this.state.accounts.length > 0 ? this.state.accounts[0].id : null;
    }
    this._save();
    return this.listAccounts();
  }

  async completeMicrosoftOAuthCode(authCode) {
    if (!authCode) {
      throw new Error('Microsoft authorization code was not provided.');
    }

    const tokenRes = await fetch('https://login.live.com/oauth20_token.srf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MS_CLIENT_ID,
        code: authCode,
        grant_type: 'authorization_code',
        redirect_uri: MS_REDIRECT_URI,
        scope: 'service::user.auth.xboxlive.com::MBI_SSL'
      })
    });
    if (!tokenRes.ok) throw new Error(`Microsoft OAuth token exchange failed (HTTP ${tokenRes.status})`);
    const msTokenData = await tokenRes.json();

    const xblRes = await fetch('https://user.auth.xboxlive.com/user/authenticate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: msTokenData.access_token },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT'
      })
    });
    if (!xblRes.ok) throw new Error(`Xbox Live authentication failed (HTTP ${xblRes.status})`);
    const xblData = await xblRes.json();
    const xblToken = xblData.Token;
    const userHash = xblData.DisplayClaims.xui[0].uhs;

    const xstsRes = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT'
      })
    });
    if (!xstsRes.ok) throw new Error(`XSTS authorization failed (HTTP ${xstsRes.status})`);
    const xstsData = await xstsRes.json();
    const xstsToken = xstsData.Token;

    const mcAuthRes = await fetch('https://api.minecraftservices.com/authentication/login_with_xbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityToken: `XBL3.0 x=${userHash};${xstsToken}` })
    });
    if (!mcAuthRes.ok) throw new Error(`Minecraft Services authentication failed (HTTP ${mcAuthRes.status})`);
    const mcAuthData = await mcAuthRes.json();
    const mcAccessToken = mcAuthData.access_token;

    const profileRes = await fetch('https://api.minecraftservices.com/minecraft/profile', {
      headers: { Authorization: `Bearer ${mcAccessToken}` }
    });
    if (!profileRes.ok) throw new Error('This Microsoft account does not own Minecraft: Java Edition.');
    const mcProfile = await profileRes.json();
    const formattedUuid = mcProfile.id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

    const accId = `msa-${mcProfile.id}`;
    const newAcc = {
      id: accId,
      username: mcProfile.name,
      uuid: formattedUuid,
      type: 'microsoft',
      authenticatedOnline: true,
      addedAt: new Date().toISOString(),
      activeSkinSlot: 'slot-1',
      skinSlots: this._defaultSkinSlots()
    };

    this.tokens[accId] = {
      mcAccessToken,
      refreshToken: msTokenData.refresh_token || null,
      updatedAt: new Date().toISOString()
    };
    this._saveTokens();

    const existingIdx = this.state.accounts.findIndex(a => a.id === accId);
    if (existingIdx >= 0) {
      this.state.accounts[existingIdx] = newAcc;
    } else {
      this.state.accounts.unshift(newAcc);
    }
    this.state.activeAccountId = accId;
    this._save();

    return this.listAccounts();
  }

  getMicrosoftLoginUrl() {
    const params = new URLSearchParams({
      client_id: MS_CLIENT_ID,
      response_type: 'code',
      redirect_uri: MS_REDIRECT_URI,
      scope: 'service::user.auth.xboxlive.com::MBI_SSL',
      prompt: 'select_account'
    });
    return `https://login.live.com/oauth20_authorize.srf?${params.toString()}`;
  }

  addSkinSlot(name) {
    const activeAcc = this.state.accounts.find(a => a.id === this.state.activeAccountId);
    if (!activeAcc) throw new Error('No active account found.');

    const slotNum = activeAcc.skinSlots.length + 1;
    const presets = ['crimson-phantom', 'obsidian-knight', 'ash-valkyrie', 'blood-monarch'];
    const newSlot = {
      id: `slot-${Date.now()}`,
      name: String(name || `Slot ${slotNum}`).trim(),
      model: 'slim',
      preset: presets[(slotNum - 1) % presets.length],
      customSkinDataUrl: null,
      active: false
    };

    activeAcc.skinSlots.push(newSlot);
    this._save();
    return this.listAccounts();
  }

  updateSkinSlot(slotId, { name, model, preset, customSkinDataUrl, active }) {
    const activeAcc = this.state.accounts.find(a => a.id === this.state.activeAccountId);
    if (!activeAcc) throw new Error('No active account found.');

    const slot = activeAcc.skinSlots.find(s => s.id === slotId);
    if (!slot) throw new Error('Skin slot not found.');

    if (name !== undefined && String(name).trim()) slot.name = String(name).trim();
    if (model === 'classic' || model === 'slim') slot.model = model;
    if (preset !== undefined) slot.preset = String(preset);

    if (customSkinDataUrl !== undefined) {
      if (customSkinDataUrl && !String(customSkinDataUrl).startsWith('data:image/png;base64,')) {
        throw new Error('Skin texture must be a valid PNG image.');
      }
      slot.customSkinDataUrl = customSkinDataUrl;
    }

    if (active) {
      for (const s of activeAcc.skinSlots) {
        s.active = s.id === slotId;
      }
      activeAcc.activeSkinSlot = slotId;
    }

    this._save();
    return this.listAccounts();
  }

  deleteSkinSlot(slotId) {
    const activeAcc = this.state.accounts.find(a => a.id === this.state.activeAccountId);
    if (!activeAcc) throw new Error('No active account found.');

    if (activeAcc.skinSlots.length <= 1) {
      throw new Error('Cannot delete the only skin slot.');
    }
    const idx = activeAcc.skinSlots.findIndex(s => s.id === slotId);
    if (idx === -1) throw new Error('Skin slot not found.');
    const wasActive = activeAcc.skinSlots[idx].active;

    activeAcc.skinSlots.splice(idx, 1);

    if (wasActive && activeAcc.skinSlots.length > 0) {
      activeAcc.skinSlots[0].active = true;
      activeAcc.activeSkinSlot = activeAcc.skinSlots[0].id;
    }
    this._save();
    return this.listAccounts();
  }

  _generatePresetSkinPng(preset) {
    const palettes = {
      'crimson-phantom': {
        skin: [243, 216, 199], hair: [12, 12, 16], eyes: [225, 29, 72],
        coat: [24, 24, 34], trim: [225, 29, 72], pants: [14, 14, 20], shoes: [190, 18, 60]
      },
      'obsidian-knight': {
        skin: [229, 193, 167], hair: [17, 24, 39], eyes: [56, 189, 248],
        coat: [30, 27, 75], trim: [99, 102, 241], pants: [15, 23, 42], shoes: [49, 46, 129]
      },
      'ash-valkyrie': {
        skin: [245, 208, 197], hair: [244, 244, 246], eyes: [244, 63, 94],
        coat: [39, 39, 42], trim: [251, 113, 133], pants: [24, 24, 27], shoes: [159, 18, 57]
      },
      'blood-monarch': {
        skin: [236, 197, 176], hair: [69, 10, 10], eyes: [251, 191, 36],
        coat: [127, 29, 29], trim: [245, 158, 11], pants: [28, 25, 23], shoes: [69, 10, 10]
      }
    };
    const pal = palettes[preset] || palettes['crimson-phantom'];

    return createPurePng(64, 64, (x, y) => {
      if (x >= 8 && x < 16 && y >= 8 && y < 16) {
        if (y < 10) return [...pal.hair, 255];
        if (y >= 12 && y <= 13 && (x === 9 || x === 14)) return [...pal.eyes, 255];
        return [...pal.skin, 255];
      }
      if (x < 32 && y < 16) return [...pal.hair, 255];
      if (x >= 20 && x < 28 && y >= 20 && y < 32) {
        if (x === 23 || x === 24 || y === 31) return [...pal.trim, 255];
        return [...pal.coat, 255];
      }
      if (x >= 16 && x < 40 && y >= 16 && y < 32) return [...pal.coat, 255];
      if (x >= 40 && x < 56 && y >= 16 && y < 32) {
        if (y >= 28) return [...pal.skin, 255];
        return [...pal.coat, 255];
      }
      if (x < 16 && y >= 16 && y < 32) {
        if (y >= 28) return [...pal.shoes, 255];
        return [...pal.pants, 255];
      }
      if (y >= 32 && y < 48) return [...pal.pants, 255];
      return [0, 0, 0, 0];
    });
  }

  _cleanCosmeticPackFromOptions(gameDir) {
    try {
      const optionsFile = path.join(gameDir, 'options.txt');
      if (!fs.existsSync(optionsFile)) return;
      let optText = fs.readFileSync(optionsFile, 'utf8');
      const cleaned = optText
        .replace(/,"file\/INEX-Local-Cosmetics"/g, '')
        .replace(/"file\/INEX-Local-Cosmetics",?/g, '')
        .replace(/,"INEX-Local-Cosmetics"/g, '')
        .replace(/"INEX-Local-Cosmetics",?/g, '');
      if (cleaned !== optText) {
        fs.writeFileSync(optionsFile, cleaned, 'utf8');
      }
    } catch (_) {}
  }

  applyLocalCosmeticsToGameDir(gameDir, mcVersion = '1.21.4') {
    if (!gameDir) return;
    const settings = this.settingsManager.getSettings();
    const isSkinSyncEnabled = settings.enableSkinSync !== false;

    const packDir = path.join(gameDir, 'resourcepacks', 'INEX-Local-Cosmetics');
    const overrideJarPath = path.join(gameDir, 'inex-cosmetics-override.jar');
    const localSkinFile = path.join(gameDir, 'inex-local-skin.png');

    // IF SKIN SYNC IS OFF -> 100% CLEANUP & BYPASS FIREBASE FOR MAXIMUM FPS!
    if (!isSkinSyncEnabled) {
      try { if (fs.existsSync(overrideJarPath)) fs.unlinkSync(overrideJarPath); } catch (_) {}
      try { if (fs.existsSync(packDir)) fs.rmSync(packDir, { recursive: true, force: true }); } catch (_) {}
      try { if (fs.existsSync(localSkinFile)) fs.unlinkSync(localSkinFile); } catch (_) {}
      this._cleanCosmeticPackFromOptions(gameDir);
      return;
    }

    const activeAcc = this.getActiveAccount();
    const username = activeAcc ? activeAcc.username : 'Player';
    const slot = this.getActiveSkinSlot();

    try {
      fs.mkdirSync(gameDir, { recursive: true });

      let skinBuf = null;
      if (slot.customSkinDataUrl && slot.customSkinDataUrl.startsWith('data:image/png;base64,')) {
        skinBuf = Buffer.from(slot.customSkinDataUrl.split(',')[1], 'base64');
      } else {
        skinBuf = this._generatePresetSkinPng(slot.preset || 'crimson-phantom', slot.model === 'slim');
      }

      if (skinBuf) {
        fs.writeFileSync(localSkinFile, skinBuf);
      }

      // Online Cloud Sync (ONLY when enableSkinSync is ON)
      if (username && username !== 'Player') {
        const baseDb = String(settings.skinDatabaseUrl || 'https://inex-cosmetics-default-rtdb.firebaseio.com/cosmetics/').replace(/\/+$/, '');
        const dbUrl = `${baseDb}/${encodeURIComponent(username.toLowerCase())}.json`;

        const payload = {
          updatedAt: Date.now(),
          model: slot.model || 'slim'
        };
        if (skinBuf) payload.skin = skinBuf.toString('base64');

        fetch(dbUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(err => {
          console.error('[Firebase Sync Error]', err.message);
        });
      }

      // For 26.x+, the Java Agent handles per-player skins, so remove legacy resource pack overrides
      if (agentSupportsVersion(mcVersion)) {
        try { if (fs.existsSync(overrideJarPath)) fs.unlinkSync(overrideJarPath); } catch (_) {}
        try { if (fs.existsSync(packDir)) fs.rmSync(packDir, { recursive: true, force: true }); } catch (_) {}
        this._cleanCosmeticPackFromOptions(gameDir);
      } else if (skinBuf) {
        const entityDir = path.join(packDir, 'assets', 'minecraft', 'textures', 'entity');
        const slimDir = path.join(entityDir, 'player', 'slim');
        const wideDir = path.join(entityDir, 'player', 'wide');
        fs.mkdirSync(slimDir, { recursive: true });
        fs.mkdirSync(wideDir, { recursive: true });

        const mcmetaStr = JSON.stringify({
          pack: {
            pack_format: 46,
            supported_formats: { min_inclusive: 1, max_inclusive: 999 },
            description: `INEX CLIENT Cosmetics (${username})`
          }
        }, null, 2);
        fs.writeFileSync(path.join(packDir, 'pack.mcmeta'), mcmetaStr, 'utf8');

        const overrideFiles = { 'pack.mcmeta': Buffer.from(mcmetaStr, 'utf8') };
        const defaultPlayerNames = ['steve.png', 'alex.png', 'ari.png', 'efe.png', 'kai.png', 'makena.png', 'noor.png', 'sunny.png', 'zuri.png'];
        for (const name of defaultPlayerNames) {
          fs.writeFileSync(path.join(wideDir, name), skinBuf);
          fs.writeFileSync(path.join(slimDir, name), skinBuf);
          overrideFiles[`assets/minecraft/textures/entity/player/wide/${name}`] = skinBuf;
          overrideFiles[`assets/minecraft/textures/entity/player/slim/${name}`] = skinBuf;
        }
        fs.writeFileSync(path.join(entityDir, 'steve.png'), skinBuf);
        fs.writeFileSync(path.join(entityDir, 'alex.png'), skinBuf);
        overrideFiles['assets/minecraft/textures/entity/steve.png'] = skinBuf;
        overrideFiles['assets/minecraft/textures/entity/alex.png'] = skinBuf;
        fs.writeFileSync(overrideJarPath, createStoredZipBuffer(overrideFiles));
      }
    } catch (err) {
      console.error('[AccountManager] Failed to apply local cosmetics:', err.message);
    }
  }
}

module.exports = { AccountManager, MS_REDIRECT_URI, createPurePng };