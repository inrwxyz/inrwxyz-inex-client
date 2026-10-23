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
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'binary');
    const crcVal = crc32(Buffer.concat([t, data]));
    const c = Buffer.alloc(4); c.writeUInt32BE(crcVal >>> 0, 0);
    return Buffer.concat([len, t, data, c]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', idatData), makeChunk('IEND', Buffer.alloc(0))]);
}

class AccountManager {
  constructor(settingsManager) {
    this.settingsManager = settingsManager;
    const configDir = this.settingsManager.getSettings().configDir;
    this.accountsFile = path.join(configDir, 'accounts.json');
    this.tokensFile = path.join(configDir, 'auth_tokens.json');
    this.skinsDir = path.join(configDir, 'skins');
    try { fs.mkdirSync(this.skinsDir, { recursive: true }); } catch (_) {}

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
      { id: 'slot-1', name: 'Slot 1 — Crimson Phantom', model: 'slim', preset: 'crimson-phantom', capePreset: 'inex-crest', customSkinDataUrl: null, active: true },
      { id: 'slot-2', name: 'Slot 2 — Obsidian Knight', model: 'slim', preset: 'obsidian-knight', capePreset: 'inex-crest', customSkinDataUrl: null, active: false }
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
          });
          return {
            activeAccountId: parsed.activeAccountId || parsed.accounts[0].id,
            accounts: parsed.accounts
          };
        }
      }
    } catch (_) {}

    const initial = { activeAccountId: null, accounts: [] };
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
        activeSkinSlot: acc.activeSkinSlot || (acc.skinSlots && acc.skinSlots.length ? acc.skinSlots[0].id : 'slot-1'),
        hasCustomSkin: Boolean(acc.skinSlots && acc.skinSlots.some(s => s && s.customSkinDataUrl))
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

  setActiveAccount(accountId) {
    const found = this.state.accounts.find(a => a.id === accountId);
    if (!found) throw new Error(`Account not found: ${accountId}`);
    this.state.activeAccountId = found.id;
    this._save();
    this._lastCloudFingerprint = null;
    this.syncSkinToCloud();
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
      this._lastCloudFingerprint = null;
      this.syncSkinToCloud();
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
    this._lastCloudFingerprint = null;
    this.syncSkinToCloud();
    return this.listAccounts();
  }

  // ---- skin-cosmetics: restore a skin from Firebase / delete it forever (local accounts only) ----
  _cosmeticsUrl(username) {
    return 'https://inex-cosmetics-default-rtdb.firebaseio.com/cosmetics/' + encodeURIComponent(String(username).toLowerCase()) + '.json';
  }

  // Returns { skin(base64), model } or null (not found / offline / invalid). Never throws.
  async _fetchCloudSkin(username) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(this._cosmeticsUrl(username), { signal: controller.signal });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || typeof data.skin !== 'string' || !data.skin) return null;
      const buf = Buffer.from(data.skin, 'base64');
      if (buf.length < 8 || buf.length > 1024 * 1024 || buf.readUInt32BE(0) !== 0x89504e47) return null;
      return { skin: buf.toString('base64'), model: data.model === 'classic' ? 'classic' : 'slim' };
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async addLocalAccountRestoring(username) {
    const clean = String(username || '').trim();
    const alreadyThere = this.state.accounts.some(a => a.username.toLowerCase() === clean.toLowerCase() && a.type === 'local');
    let cloud = null;
    if (!alreadyThere && /^[a-zA-Z0-9_]{3,16}$/.test(clean) && this.settingsManager.getSettings().enableSkinSync !== false) {
      cloud = await this._fetchCloudSkin(clean);
    }
    const result = this.addLocalAccount(clean);
    if (cloud) {
      const acc = this.state.accounts.find(a => a.id === this.state.activeAccountId);
      const slot = acc && acc.skinSlots && acc.skinSlots[0];
      if (slot) {
        slot.customSkinDataUrl = 'data:image/png;base64,' + cloud.skin;
        slot.model = cloud.model;
        for (const s of acc.skinSlots) s.active = s.id === slot.id;
        acc.activeSkinSlot = slot.id;
        this._save();
        // Same data is already in the cloud, so skip the pointless re-upload.
        this._lastCloudFingerprint = crypto.createHash('sha1')
          .update(clean.toLowerCase() + '|' + cloud.model + '|' + cloud.skin).digest('hex');
        return this.listAccounts();
      }
    }
    return result;
  }

  async deleteAccountForever(accountId) {
    const acc = this.state.accounts.find(a => a.id === accountId);
    if (!acc) throw new Error('Account not found.');
    if (acc.type === 'local' && acc.username) {
      const failMsg = 'Could not reach the cloud, so nothing was deleted. Check your internet and try again.';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(this._cosmeticsUrl(acc.username), { method: 'DELETE', signal: controller.signal });
        if (!res.ok) throw new Error(failMsg);
      } catch (_) {
        throw new Error(failMsg);
      } finally {
        clearTimeout(timer);
      }
      this._lastCloudFingerprint = null;
    }
    return this.removeAccount(accountId);
  }

  removeAccount(accountId) {
    const idx = this.state.accounts.findIndex(a => a.id === accountId);
    if (idx === -1) throw new Error('Account not found.');
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
    if (!authCode) throw new Error('Microsoft authorization code was not provided.');

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
        RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT'
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
        RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT'
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
    if (existingIdx >= 0) this.state.accounts[existingIdx] = newAcc;
    else this.state.accounts.unshift(newAcc);

    this.state.activeAccountId = accId;
    this._save();
    this._lastCloudFingerprint = null;
    this.syncSkinToCloud();
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

    if (activeAcc.skinSlots.length >= 5) throw new Error('Maximum 5 skin slots per account.');
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

  updateSkinSlot(slotId, { name, model, preset, capePreset, customSkinDataUrl, active }) {
    const activeAcc = this.state.accounts.find(a => a.id === this.state.activeAccountId);
    if (!activeAcc) throw new Error('No active account found.');

    const slot = activeAcc.skinSlots.find(s => s.id === slotId);
    if (!slot) throw new Error('Skin slot not found.');

    if (name !== undefined && String(name).trim()) slot.name = String(name).trim();
    if (model === 'classic' || model === 'slim') slot.model = model;
    if (preset !== undefined) slot.preset = String(preset);
    if (capePreset !== undefined) slot.capePreset = String(capePreset);

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
    this._lastCloudFingerprint = null;
    this.syncSkinToCloud();
    return this.listAccounts();
  }

  deleteSkinSlot(slotId) {
    const activeAcc = this.state.accounts.find(a => a.id === this.state.activeAccountId);
    if (!activeAcc) throw new Error('No active account found.');
    if (activeAcc.skinSlots.length <= 1) throw new Error('Cannot delete the only skin slot.');

    const idx = activeAcc.skinSlots.findIndex(s => s.id === slotId);
    if (idx === -1) throw new Error('Skin slot not found.');
    const wasActive = activeAcc.skinSlots[idx].active;

    activeAcc.skinSlots.splice(idx, 1);
    if (wasActive && activeAcc.skinSlots.length > 0) {
      activeAcc.skinSlots[0].active = true;
      activeAcc.activeSkinSlot = activeAcc.skinSlots[0].id;
    }
    this._save();
    this._lastCloudFingerprint = null;
    this.syncSkinToCloud();
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
      if (x >= 40 && x < 48 && y >= 20 && y < 32) return [...pal.trim, 255];
      if (x >= 16 && x < 40 && y >= 32 && y < 48) {
        return [...pal.pants, 255];
      }
      if (x >= 16 && x < 40 && y >= 48 && y < 56) {
        return [...pal.shoes, 255];
      }
      return [0, 0, 0, 0];
    });
  }

  _generateCapePng(preset = 'inex-crest') {
    const colors = {
      'inex-crest': [226, 18, 68, 255],
      crimson: [226, 18, 68, 255],
      royal: [66, 108, 255, 255],
      ember: [242, 120, 43, 255],
      obsidian: [33, 37, 61, 255],
      default: [226, 18, 68, 255]
    };
    const color = colors[preset] || colors.default;
    return createPurePng(64, 64, (x, y) => {
      const inside = y > 8 && y < 56 && x > 10 && x < 54;
      if (!inside) return [0, 0, 0, 0];
      const cx = x - 32;
      const cy = y - 32;
      const shoulder = Math.abs(cx) < 16 && y > 10 && y < 56;
      const wing = (Math.abs(cx) < 20 && (cy > -12 && cy < 12)) || (Math.abs(cx) < 10 && y > 14 && y < 50);
      const alpha = shoulder || wing ? 255 : 0;
      const r = color[0];
      const g = color[1];
      const b = color[2];
      return alpha ? [r, g, b, 255] : [0, 0, 0, 0];
    });
  }

  _ensureLocalCosmeticsPack(gameDir, version) {
    const packRoot = path.join(gameDir, 'resourcepacks', 'INEX-Local-Cosmetics');
    fs.mkdirSync(packRoot, { recursive: true });
    fs.mkdirSync(path.join(packRoot, 'assets', 'minecraft', 'textures', 'entity', 'player', 'wide'), { recursive: true });
    fs.mkdirSync(path.join(packRoot, 'assets', 'minecraft', 'textures', 'entity', 'player', 'slim'), { recursive: true });

    const activeAcc = this.state.accounts.find(a => a.id === this.state.activeAccountId) || this.state.accounts[0] || null;
    const slot = activeAcc && activeAcc.skinSlots && activeAcc.skinSlots.length
      ? (activeAcc.skinSlots.find(s => s.id === activeAcc.activeSkinSlot) || activeAcc.skinSlots.find(s => s.active) || activeAcc.skinSlots[0])
      : { model: 'slim', preset: 'crimson-phantom', capePreset: 'inex-crest' };

    const skinPng = (slot.customSkinDataUrl && slot.customSkinDataUrl.startsWith('data:image/png;base64,'))
      ? Buffer.from(slot.customSkinDataUrl.split(',')[1], 'base64')
      : this._generatePresetSkinPng(slot.preset || 'crimson-phantom');
    const capePng = this._generateCapePng(slot.capePreset || 'inex-crest');
    const baseModel = String(slot.model || 'slim').toLowerCase() === 'classic' ? 'wide' : 'slim';

    const packMeta = {
      pack: {
        pack_format: version && /^1\.(?:20|21|22|23|24)/.test(String(version)) ? 15 : 12,
        description: 'INEX Local Cosmetics'
      }
    };

    fs.writeFileSync(path.join(packRoot, 'pack.mcmeta'), JSON.stringify(packMeta, null, 2), 'utf8');
    fs.writeFileSync(path.join(packRoot, 'assets', 'minecraft', 'textures', 'entity', 'player', baseModel === 'slim' ? 'slim' : 'wide', baseModel === 'slim' ? 'alex.png' : 'steve.png'), baseModel === 'slim' ? skinPng : skinPng);
    fs.writeFileSync(path.join(packRoot, 'assets', 'minecraft', 'textures', 'entity', 'player', 'wide', 'steve.png'), skinPng);
    fs.writeFileSync(path.join(packRoot, 'assets', 'minecraft', 'textures', 'entity', 'player', 'slim', 'alex.png'), skinPng);
    fs.writeFileSync(path.join(packRoot, 'assets', 'minecraft', 'textures', 'entity', 'player', 'cape.png'), capePng);

    const overrideJar = path.join(gameDir, 'inex-cosmetics-override.jar');
    const overrideFiles = {
      'assets/minecraft/textures/entity/player/wide/steve.png': skinPng,
      'assets/minecraft/textures/entity/player/slim/alex.png': skinPng,
      'assets/minecraft/textures/entity/player/cape.png': capePng,
      'pack.mcmeta': JSON.stringify(packMeta, null, 2)
    };
    fs.writeFileSync(overrideJar, createStoredZipBuffer(overrideFiles));

    const optionsPath = path.join(gameDir, 'options.txt');
    const hasPack = fs.existsSync(optionsPath) ? fs.readFileSync(optionsPath, 'utf8') : '';
    const packLine = 'resourcePacks:["file/INEX-Local-Cosmetics"]';
    const incompatibleLine = 'incompatibleResourcePacks:[]';
    let updated = hasPack;
    if (!updated.includes('file/INEX-Local-Cosmetics')) {
      updated = updated.trim() ? `${updated.trim()}\n${packLine}\n${incompatibleLine}` : `${packLine}\n${incompatibleLine}`;
    }
    fs.writeFileSync(optionsPath, updated, 'utf8');
  }

  applyLocalCosmeticsToGameDir(gameDir, version = null) {
    if (gameDir) this._removeLegacyCosmetics(gameDir);
    const settings = this.settingsManager.getSettings();
    if (gameDir) {
      fs.mkdirSync(gameDir, { recursive: true });
      fs.writeFileSync(
        path.join(gameDir, 'inex-cosmetics-settings.txt'),
        settings.enableSkinSync === false ? 'false' : 'true',
        'utf8'
      );
    }
    if (gameDir) this._removeNameplatePack(gameDir);
    if (gameDir) this._ensureLocalCosmeticsPack(gameDir, version);
    if (settings.enableSkinSync === false) {
      this.removeSkinFromCloud();
      return;
    }
    this.syncSkinToCloud();
  }

  _removeNameplatePack(gameDir) {
    fs.rmSync(path.join(gameDir, 'resourcepacks', 'INEX-Nameplate'), { recursive: true, force: true });
    const optionsPath = path.join(gameDir, 'options.txt');
    if (!fs.existsSync(optionsPath)) return;
    let lines;
    try {
      lines = fs.readFileSync(optionsPath, 'utf8').split(/\r?\n/);
    } catch (err) {
      throw new Error(`Could not read Minecraft resource-pack settings: ${err.message}`);
    }

    const packIds = new Set(['file/INEX-Nameplate', 'INEX-Nameplate']);
    let changed = false;
    const updatedLines = lines.map(line => {
      const separator = line.indexOf(':');
      if (separator < 0 || !['resourcePacks', 'incompatibleResourcePacks'].includes(line.slice(0, separator))) return line;
      let packs;
      try {
        packs = JSON.parse(line.slice(separator + 1));
      } catch (err) {
        throw new Error(`Could not parse Minecraft resource-pack settings: ${err.message}`);
      }
      if (!Array.isArray(packs)) return line;
      const filtered = packs.filter(item => !packIds.has(item));
      if (filtered.length === packs.length) return line;
      changed = true;
      return `${line.slice(0, separator + 1)}${JSON.stringify(filtered)}`;
    });

    if (!changed) return;
    try {
      fs.writeFileSync(optionsPath, updatedLines.join('\n'), 'utf8');
    } catch (err) {
      throw new Error(`Could not update Minecraft resource-pack settings: ${err.message}`);
    }
  }

  _removeLegacyCosmetics(gameDir) {
    const packId = 'file/INEX-Local-Cosmetics';
    const legacyPackId = 'INEX-Local-Cosmetics';
    try {
      fs.rmSync(path.join(gameDir, 'resourcepacks', 'INEX-Local-Cosmetics'), { recursive: true, force: true });
      fs.rmSync(path.join(gameDir, 'inex-cosmetics-override.jar'), { force: true });
      fs.rmSync(path.join(gameDir, 'inex-cosmetics-state.json'), { force: true });
    } catch (err) {
      console.error('[AccountManager] Could not remove legacy cosmetics files:', err.message);
    }
  }

  removeSkinFromCloud() {
    try {
      this._lastCloudFingerprint = null;
      const acc = this.getActiveAccount();
      if (!acc || !acc.username) return;
      const key = acc.username.toLowerCase();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      fetch(`https://inex-cosmetics-default-rtdb.firebaseio.com/cosmetics/${encodeURIComponent(key)}.json`, {
        method: 'DELETE',
        signal: controller.signal
      })
        .catch(() => {})
        .finally(() => clearTimeout(timer));
    } catch (_) {}
  }

  syncSkinToCloud() {
    try {
      const settings = this.settingsManager.getSettings();
      if (settings.enableSkinSync === false) {
        this.removeSkinFromCloud();
        return;
      }

      const acc = this.getActiveAccount();
      if (!acc || !acc.username) return;
      const slots = acc.skinSlots && acc.skinSlots.length ? acc.skinSlots : this._defaultSkinSlots();
      const slot = slots.find(s => s.id === acc.activeSkinSlot) || slots.find(s => s.active) || slots[0];
      if (!slot) return;

      // Default/preset skins are never uploaded (and never delete what is already in the cloud).
      if (!(slot.customSkinDataUrl && slot.customSkinDataUrl.startsWith('data:image/png;base64,'))) return;
      const skinBuf = Buffer.from(slot.customSkinDataUrl.split(',')[1], 'base64');

      const key = acc.username.toLowerCase();
      const payload = {
        updatedAt: Date.now(),
        model: slot.model || 'slim',
        skin: skinBuf.toString('base64')
      };
      const fingerprint = crypto.createHash('sha1').update(`${key}|${payload.model}|${payload.skin}`).digest('hex');
      if (this._lastCloudFingerprint === fingerprint) return;
      this._lastCloudFingerprint = fingerprint;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      fetch(`https://inex-cosmetics-default-rtdb.firebaseio.com/cosmetics/${encodeURIComponent(key)}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      })
        .catch(err => {
          this._lastCloudFingerprint = null;
          console.error('[INEX Cosmetics Sync]', err.message);
        })
        .finally(() => clearTimeout(timer));
    } catch (err) {
      console.error('[INEX Cosmetics Sync]', err.message);
    }
  }
}

module.exports = { AccountManager, MS_REDIRECT_URI, createPurePng };