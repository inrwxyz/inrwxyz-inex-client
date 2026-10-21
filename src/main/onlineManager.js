'use strict';
/**
 * INEX CLIENT — Online Manager (Accounts + Friends + Per-Server Access + P2P Handshake ONLY)
 * - Zero background presence / heartbeat / lobby polling (saves 100% of idle Firebase bandwidth)
 * - Editor request rules:
 *     * Host prompt lasts 10 seconds
 *     * If host does not answer in 10s -> 10 minute cooldown
 *     * If host clicks Deny -> 1 hour cooldown
 */
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const cfg = require('./firebaseConfig');
const { isAllowed } = require('./cohostPolicy');

const AUTH = 'https://identitytoolkit.googleapis.com/v1/accounts';
const TOKEN = 'https://securetoken.googleapis.com/v1/token';
const NAME_RE = /^[a-zA-Z0-9_]{3,16}$/;
const SID_RE = /^[A-Za-z0-9_-]{1,60}$/;

const EDITOR_SESSION_MS = 12 * 60 * 60 * 1000;
const HOST_PROMPT_TIMEOUT_MS = 10 * 1000;      // 10 seconds to Allow / Deny
const TIMEOUT_COOLDOWN_MS = 10 * 60 * 1000;    // 10 minutes if no answer
const DENY_COOLDOWN_MS = 60 * 60 * 1000;       // 1 hour if denied

const AUTH_ERRORS = {
  EMAIL_EXISTS: 'That username is already claimed. Log in with its password instead.',
  INVALID_LOGIN_CREDENTIALS: 'Wrong username or password.',
  INVALID_PASSWORD: 'Wrong username or password.',
  EMAIL_NOT_FOUND: 'This username has no online password yet.',
  WEAK_PASSWORD: 'Password must be at least 6 characters.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Wait a bit and try again.',
  OPERATION_NOT_ALLOWED: 'Email/Password sign-in is not enabled in the Firebase project.',
  API_KEY_INVALID: 'Firebase API key is invalid. Check firebaseConfig.js.',
  USER_DISABLED: 'This online account is disabled.',
  CONFIGURATION_NOT_FOUND: 'Firebase Authentication is not set up. In Firebase Console open Authentication, press Get started, then enable Email/Password.',
  ADMIN_ONLY_OPERATION: 'Firebase Authentication is not set up. In Firebase Console open Authentication and press Get started.'
};

class OnlineManager extends EventEmitter {
  constructor({ settingsManager, accountManager, fetchImpl, remoteExecutor } = {}) {
    super();
    this.accountManager = accountManager;
    this.fetch = fetchImpl || ((...a) => fetch(...a));
    this.remoteExecutor = remoteExecutor || null;
    const dir = settingsManager.getSettings().configDir;
    this.file = path.join(dir, 'online.json');
    this.sessions = this._load();
    this.cache = {};
    this.etags = new Map();
    this.nameCache = new Map();
    this.remotePollTimer = null;
    this.handledReqIds = new Map();
    this.approvedEditorSessions = new Map(); // callerUid -> { exp, serverId }
    this.callerCooldowns = new Map();        // callerUid -> { until, reason } (host-side enforcement)
    this.grantCache = new Map();             // friendUid -> { accepted, servers:Set, names:Map }
    this.serverProvider = null;
    this.rtcBusy = false;
    this.pendingEditorPrompts = new Map();   // reqId -> { resolve }
  }

  setRemoteExecutor(fn) {
    this.remoteExecutor = fn;
  }
  setServerProvider(fn) {
    this.serverProvider = fn;
  }

  respondEditorSession(reqId, allowed) {
    const entry = this.pendingEditorPrompts.get(reqId);
    if (entry) {
      this.pendingEditorPrompts.delete(reqId);
      entry.resolve(allowed ? 'allowed' : 'denied');
    }
    return { ok: true };
  }

  /* ---------------- storage ---------------- */
  _load() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')).sessions || {}; } catch (_) { return {}; }
  }
  _save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify({ sessions: this.sessions }, null, 2), 'utf8');
    } catch (_) {}
  }

  /* ---------------- http + ETag cache ---------------- */
  isConfigured() { return Boolean(cfg.apiKey) && !/^PASTE/i.test(cfg.apiKey); }
  _need() { if (!this.isConfigured()) throw new Error('Online features are not configured yet (firebaseConfig.js).'); }

  async _http(url, { method = 'GET', body, form, useEtag = false } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const headers = form
        ? { 'Content-Type': 'application/x-www-form-urlencoded' }
        : (body !== undefined ? { 'Content-Type': 'application/json' } : {});

      const cacheKey = url.split('?')[0];
      if (method === 'GET' && useEtag) {
        headers['X-Firebase-ETag'] = 'true';
        const prev = this.etags.get(cacheKey);
        if (prev && prev.etag) headers['If-None-Match'] = prev.etag;
      }

      const res = await this.fetch(url, {
        method,
        signal: ctrl.signal,
        headers,
        body: form ? form : (body !== undefined ? JSON.stringify(body) : undefined)
      });

      if (res.status === 304 && method === 'GET' && useEtag) {
        const prev = this.etags.get(cacheKey);
        return prev ? prev.data : null;
      }

      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) {}
      if (!res.ok) {
        const raw = data && data.error ? (data.error.message || data.error) : `HTTP ${res.status}`;
        const err = new Error(String(raw));
        err.status = res.status;
        throw err;
      }

      if (method === 'GET' && useEtag && res.headers && typeof res.headers.get === 'function') {
        const etag = res.headers.get('etag');
        if (etag) this.etags.set(cacheKey, { etag, data });
      } else if (method !== 'GET') {
        this.etags.delete(cacheKey);
      }

      return data;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('Online service timed out. Check your internet.');
      if (e instanceof TypeError) throw new Error('Could not reach the online service. Check your internet.');
      throw e;
    } finally { clearTimeout(timer); }
  }

  _authErr(e) {
    const key = String(e && e.message || '').split(' ')[0];
    return new Error(AUTH_ERRORS[key] || (e && e.message) || 'Online sign-in failed.');
  }
  _authCall(endpoint, body) {
    return this._http(`${AUTH}:${endpoint}?key=${encodeURIComponent(cfg.apiKey)}`, { method: 'POST', body });
  }
  _emailFor(name) { return `${String(name).toLowerCase()}@inex.app`; }

  /* ---------------- sessions / tokens ---------------- */
  _active() {
    const acc = this.accountManager.getActiveAccount();
    if (!acc) throw new Error('No active account.');
    return acc;
  }
  _locked() { return new Error('LOCKED: Set a password for this account in Accounts → Online first.'); }
  _ctx() {
    const acc = this._active();
    const s = this.sessions[acc.id];
    if (!s) throw this._locked();
    return { acc, s };
  }
  _setSession(accountId, data) { this.sessions[accountId] = data; this._save(); }
  _drop(accountId) { delete this.sessions[accountId]; delete this.cache[accountId]; this._save(); }

  async _token(accountId) {
    const s = this.sessions[accountId];
    if (!s) throw this._locked();
    const c = this.cache[accountId];
    if (c && c.exp > Date.now() + 60000) return c.idToken;
    try {
      const r = await this._http(`${TOKEN}?key=${encodeURIComponent(cfg.apiKey)}`, {
        method: 'POST', form: `grant_type=refresh_token&refresh_token=${encodeURIComponentSafe(s.refreshToken)}`
      });
      this.cache[accountId] = { idToken: r.id_token, exp: Date.now() + Number(r.expires_in || 3600) * 1000 };
      if (r.refresh_token && r.refresh_token !== s.refreshToken) { s.refreshToken = r.refresh_token; this._save(); }
      return r.id_token;
    } catch (e) {
      if (/TOKEN_EXPIRED|INVALID_REFRESH_TOKEN|USER_NOT_FOUND|USER_DISABLED/.test(e.message)) {
        this._drop(accountId);
        throw new Error('Online session expired. Log in again with your password.');
      }
      throw e;
    }
  }

  async _db(accountId, method, p, body, useEtag = false) {
    const tok = await this._token(accountId);
    try {
      return await this._http(`${cfg.databaseURL}/${p}.json?auth=${encodeURIComponent(tok)}`, {
        method,
        body,
        useEtag: method === 'GET' && useEtag
      });
    } catch (e) {
      if (e.status === 401 || e.status === 403 || /permission denied/i.test(e.message)) throw new Error('Not allowed (permission denied).');
      throw e;
    }
  }
  _get(acc, p, useEtag = true) { return this._db(acc, 'GET', p, undefined, useEtag); }
  _put(acc, p, v) { return this._db(acc, 'PUT', p, v); }
  _del(acc, p) { return this._db(acc, 'DELETE', p); }
  _safeGet(acc, p, useEtag = true) { return this._get(acc, p, useEtag).catch(() => null); }

  async _userName(accId, uid) {
    if (this.nameCache.has(uid)) return this.nameCache.get(uid);
    const u = await this._safeGet(accId, `users/${uid}`);
    if (u && u.name) {
      this.nameCache.set(uid, u.name);
      return u.name;
    }
    return 'Unknown';
  }

  /* ---------------- account: optional password ---------------- */
  getStatus() {
    let acc = null;
    try { acc = this._active(); } catch (_) {}
    const s = acc ? this.sessions[acc.id] : null;
    return {
      configured: this.isConfigured(),
      accountName: acc ? acc.username : '',
      hasPassword: Boolean(s),
      unlocked: Boolean(s) && this.isConfigured(),
      uid: s ? s.uid : null
    };
  }

  _checkPassword(pw) {
    const p = String(pw || '');
    if (p.length < 6) throw new Error('Password must be at least 6 characters.');
    if (p.length > 64) throw new Error('Password is too long (max 64).');
    return p;
  }

  async claim(password) {
    this._need();
    const acc = this._active();
    if (this.sessions[acc.id]) throw new Error('This account already has an online password.');
    if (!NAME_RE.test(acc.username)) throw new Error('Username must be 3-16 letters, numbers or underscores.');
    const pw = this._checkPassword(password);
    let r;
    try { r = await this._authCall('signUp', { email: this._emailFor(acc.username), password: pw, returnSecureToken: true }); }
    catch (e) { throw this._authErr(e); }
    this._setSession(acc.id, { uid: r.localId, username: acc.username, refreshToken: r.refreshToken });
    this.cache[acc.id] = { idToken: r.idToken, exp: Date.now() + Number(r.expiresIn || 3600) * 1000 };
    const undo = async () => { try { await this._authCall('delete', { idToken: r.idToken }); } catch (_) {} this._drop(acc.id); };
    let taken = null;
    try { taken = await this._get(acc.id, `usernames/${acc.username.toLowerCase()}`, false); }
    catch (e) { await undo(); throw new Error('Online database refused the request. Publish database.rules.json in Firebase Console. (' + e.message + ')'); }
    if (taken && taken !== r.localId) { await undo(); throw new Error('That username is already taken online. Pick another account name.'); }
    try {
      await this._put(acc.id, `usernames/${acc.username.toLowerCase()}`, r.localId);
      await this._put(acc.id, `users/${r.localId}`, { name: acc.username, createdAt: Date.now() });
      this.nameCache.set(r.localId, acc.username);
    } catch (e) {
      await undo();
      throw new Error('Could not save your online profile: ' + e.message + ' (check database rules are published).');
    }
    this._startRemotePoll();
    return this.getStatus();
  }

  async login(password) {
    this._need();
    const acc = this._active();
    let r;
    try { r = await this._authCall('signInWithPassword', { email: this._emailFor(acc.username), password: String(password || ''), returnSecureToken: true }); }
    catch (e) { throw this._authErr(e); }
    this._setSession(acc.id, { uid: r.localId, username: acc.username, refreshToken: r.refreshToken });
    this.cache[acc.id] = { idToken: r.idToken, exp: Date.now() + Number(r.expiresIn || 3600) * 1000 };
    const u = await this._safeGet(acc.id, `users/${r.localId}`, false);
    if (!u) await this._put(acc.id, `users/${r.localId}`, { name: acc.username, createdAt: Date.now() }).catch(() => {});
    this.nameCache.set(r.localId, acc.username);
    this._startRemotePoll();
    return this.getStatus();
  }

  async loginAs(username, password) {
    this._need();
    const typed = String(username || '').trim();
    if (!NAME_RE.test(typed)) throw new Error('Enter a valid username (3-16 letters, numbers or _).');
    let r;
    try { r = await this._authCall('signInWithPassword', { email: this._emailFor(typed), password: String(password || ''), returnSecureToken: true }); }
    catch (e) { throw this._authErr(e); }
    let name = typed;
    try {
      const u = await this._http(`${cfg.databaseURL}/users/${r.localId}.json?auth=${encodeURIComponent(r.idToken)}`);
      if (u && NAME_RE.test(String(u.name || ''))) name = u.name;
    } catch (_) {}
    this.accountManager.addLocalAccount(name);
    const acc = this._active();
    this._setSession(acc.id, { uid: r.localId, username: name, refreshToken: r.refreshToken });
    this.cache[acc.id] = { idToken: r.idToken, exp: Date.now() + Number(r.expiresIn || 3600) * 1000 };
    const u2 = await this._safeGet(acc.id, `users/${r.localId}`, false);
    if (!u2) await this._put(acc.id, `users/${r.localId}`, { name, createdAt: Date.now() }).catch(() => {});
    this.nameCache.set(r.localId, name);
    this._startRemotePoll();
    return this.getStatus();
  }

  async deleteOnline(password) {
    this._need();
    const { acc, s } = this._ctx();
    let r;
    try { r = await this._authCall('signInWithPassword', { email: this._emailFor(acc.username), password: String(password || ''), returnSecureToken: true }); }
    catch (e) { throw this._authErr(e); }
    this.cache[acc.id] = { idToken: r.idToken, exp: Date.now() + Number(r.expiresIn || 3600) * 1000 };
    const me = s.uid, soft = p => this._del(acc.id, p).catch(() => {});
    this._stopRemotePoll();
    const friends = Object.keys((await this._safeGet(acc.id, `friends/${me}`, false)) || {});
    for (const f of friends) {
      await soft(`coHosts/${me}/${f}`); await soft(`coHosts/${f}/${me}`);
      await soft(`coInvites/${f}/${me}`); await soft(`coInvites/${me}/${f}`);
      await soft(`rtc/${f}/${me}`); await soft(`rtc/${me}/${f}`);
      await soft(`friends/${f}/${me}`); await soft(`friends/${me}/${f}`);
    }
    for (const node of ['requests', 'coInvites', 'coHosts', 'rtc']) {
      const rest = Object.keys((await this._safeGet(acc.id, `${node}/${me}`, false)) || {});
      for (const k of rest) await soft(`${node}/${me}/${k}`);
    }
    try {
      await this._del(acc.id, `users/${me}`);
      await this._del(acc.id, `usernames/${acc.username.toLowerCase()}`);
    } catch (e) { throw new Error('Could not free the username: ' + e.message + ' (publish the latest database.rules.json, then try again).'); }
    try { await this._authCall('delete', { idToken: r.idToken }); } catch (e) { throw this._authErr(e); }
    this._drop(acc.id);
    return this.getStatus();
  }

  async logout() {
    const acc = this._active();
    this._stopRemotePoll();
    this._drop(acc.id);
    return this.getStatus();
  }

  async changePassword(oldPw, newPw) {
    this._need();
    const { acc, s } = this._ctx();
    const next = this._checkPassword(newPw);
    let r;
    try { r = await this._authCall('signInWithPassword', { email: this._emailFor(acc.username), password: String(oldPw || ''), returnSecureToken: true }); }
    catch (e) { throw this._authErr(e); }
    try { r = await this._authCall('update', { idToken: r.idToken, password: next, returnSecureToken: true }); }
    catch (e) { throw this._authErr(e); }
    this._setSession(acc.id, { ...s, refreshToken: r.refreshToken });
    this.cache[acc.id] = { idToken: r.idToken, exp: Date.now() + Number(r.expiresIn || 3600) * 1000 };
    return this.getStatus();
  }

  /* ---------------- friends (NO online/offline presence checks) ---------------- */
  async listFriends() {
    const { acc, s } = this._ctx();
    const ids = Object.keys((await this._get(acc.id, `friends/${s.uid}`)) || {});
    const out = await Promise.all(ids.map(async uid => {
      const [name, a] = await Promise.all([
        this._userName(acc.id, uid),
        this._safeGet(acc.id, `coHosts/${uid}/${s.uid}`)
      ]);
      return {
        uid,
        name,
        access: a && a.accepted === true && a.servers
          ? { servers: Object.keys(a.servers).map(id => ({ id, name: String((a.servers[id] && a.servers[id].n) || id) })) }
          : null
      };
    }));
    return out.sort((x, y) => x.name.localeCompare(y.name));
  }

  async listRequests() {
    const { acc, s } = this._ctx();
    const r = (await this._get(acc.id, `requests/${s.uid}`)) || {};
    return Object.keys(r).map(uid => ({ uid, name: r[uid].name, ts: r[uid].ts }));
  }

  async sendRequest(name) {
    const { acc, s } = this._ctx();
    const clean = String(name || '').trim();
    if (!NAME_RE.test(clean)) throw new Error('Enter a valid player name (3-16 letters/numbers/_).');
    const target = await this._get(acc.id, `usernames/${clean.toLowerCase()}`, false);
    if (!target) throw new Error(`No online player named "${clean}". They must set a password first.`);
    if (target === s.uid) throw new Error('That is you.');
    const mine = (await this._safeGet(acc.id, `friends/${s.uid}`, false)) || {};
    if (mine[target]) throw new Error('Already friends.');
    const incoming = await this._safeGet(acc.id, `requests/${s.uid}/${target}`, false);
    if (incoming) { await this.acceptRequest(target); return { accepted: true }; }
    await this._put(acc.id, `requests/${target}/${s.uid}`, { name: acc.username, ts: Date.now() });
    return { sent: true };
  }

  async acceptRequest(fromUid) {
    const { acc, s } = this._ctx();
    const req = await this._get(acc.id, `requests/${s.uid}/${fromUid}`, false);
    if (!req) throw new Error('Request no longer exists.');
    await this._put(acc.id, `friends/${s.uid}/${fromUid}`, true);
    await this._put(acc.id, `friends/${fromUid}/${s.uid}`, true);
    await this._del(acc.id, `requests/${s.uid}/${fromUid}`);
    return true;
  }

  async declineRequest(fromUid) {
    const { acc, s } = this._ctx();
    await this._del(acc.id, `requests/${s.uid}/${fromUid}`);
    return true;
  }

  async removeFriend(uid) {
    const { acc, s } = this._ctx();
    this.approvedEditorSessions.delete(uid);
    this.grantCache.delete(uid);
    this.emit('p2p-kick', { friendUid: uid });
    await this._del(acc.id, `coHosts/${s.uid}/${uid}`).catch(() => {});
    await this._del(acc.id, `coInvites/${uid}/${s.uid}`).catch(() => {});
    await this._del(acc.id, `rtc/${s.uid}/${uid}`).catch(() => {});
    await this._del(acc.id, `friends/${s.uid}/${uid}`);
    await this._del(acc.id, `friends/${uid}/${s.uid}`).catch(() => {});
    return true;
  }

  autoStart() {
    if (this.isConfigured() && Object.keys(this.sessions).length) {
      try { this._ctx(); this._startRemotePoll(); } catch (_) {}
    }
  }
  async shutdown() {
    this._stopRemotePoll();
  }

  /* ---------------- per-server friend access (grants & invites) ---------------- */
  _namesOf(servers) {
    return Object.keys(servers || {}).map(id => ({ id, name: String((servers[id] && servers[id].n) || id) }));
  }

  async sendAccessInvite(friendUid, serverIds) {
    const { acc, s } = this._ctx();
    const ids = Array.isArray(serverIds) ? serverIds.map(String).filter(id => SID_RE.test(id)) : [];
    const mine = (await this._safeGet(acc.id, `friends/${s.uid}`, false)) || {};
    if (!mine[friendUid]) throw new Error('You can only give access to friends.');
    const all = this.serverProvider ? (this.serverProvider() || []) : [];
    const servers = {};
    for (const id of ids) {
      const sv = all.find(x => x.id === id);
      if (sv) servers[id] = { n: String(sv.name || id).slice(0, 40) };
    }
    if (!Object.keys(servers).length) throw new Error('Pick at least one server to share.');
    const prev = await this._safeGet(acc.id, `coHosts/${s.uid}/${friendUid}`, false);
    const accepted = Boolean(prev && prev.accepted === true);
    await this._put(acc.id, `coHosts/${s.uid}/${friendUid}`, { servers, accepted, ts: Date.now() });
    this.grantCache.set(friendUid, { accepted, servers: new Set(Object.keys(servers)), names: new Map(Object.keys(servers).map(id => [id, servers[id].n])) });
    if (!accepted) {
      await this._put(acc.id, `coInvites/${friendUid}/${s.uid}`, { name: acc.username, servers, ts: Date.now() });
    }
    return { accepted };
  }

  async revokeAccess(friendUid) {
    const { acc, s } = this._ctx();
    this.approvedEditorSessions.delete(friendUid);
    this.grantCache.delete(friendUid);
    this.emit('p2p-kick', { friendUid });
    await this._del(acc.id, `coHosts/${s.uid}/${friendUid}`);
    await this._del(acc.id, `coInvites/${friendUid}/${s.uid}`).catch(() => {});
    await this._del(acc.id, `rtc/${s.uid}/${friendUid}`).catch(() => {});
    return true;
  }

  async listGrants() {
    const { acc, s } = this._ctx();
    const g = (await this._get(acc.id, `coHosts/${s.uid}`, false)) || {};
    return Promise.all(Object.keys(g).map(async uid => {
      const name = await this._userName(acc.id, uid);
      return { uid, name, accepted: g[uid].accepted === true, servers: this._namesOf(g[uid].servers) };
    }));
  }

  async listAccessInvites() {
    const { acc, s } = this._ctx();
    const r = (await this._get(acc.id, `coInvites/${s.uid}`)) || {};
    return Object.keys(r)
      .filter(uid => r[uid] && r[uid].servers)
      .map(uid => ({ uid, name: r[uid].name || 'Unknown', servers: this._namesOf(r[uid].servers), ts: r[uid].ts || 0 }));
  }

  async acceptAccessInvite(hostUid) {
    const { acc, s } = this._ctx();
    const inv = await this._get(acc.id, `coInvites/${s.uid}/${hostUid}`, false);
    if (!inv || !inv.servers) throw new Error('Invite no longer exists.');
    const mine = (await this._safeGet(acc.id, `friends/${s.uid}`, false)) || {};
    if (!mine[hostUid]) throw new Error('You are not friends anymore.');
    await this._put(acc.id, `coHosts/${hostUid}/${s.uid}/accepted`, true);
    await this._del(acc.id, `coInvites/${s.uid}/${hostUid}`);
    return { servers: this._namesOf(inv.servers) };
  }

  async declineAccessInvite(hostUid) {
    const { acc, s } = this._ctx();
    await this._del(acc.id, `coInvites/${s.uid}/${hostUid}`);
    await this._del(acc.id, `coHosts/${hostUid}/${s.uid}`).catch(() => {});
    return true;
  }

  async leaveAccess(hostUid) {
    const { acc, s } = this._ctx();
    await this._del(acc.id, `coHosts/${hostUid}/${s.uid}`);
    await this._del(acc.id, `rtc/${hostUid}/${s.uid}`).catch(() => {});
    return true;
  }

  async _loadGrant(accId, hostUid, friendUid) {
    const [g, mine] = await Promise.all([
      this._safeGet(accId, `coHosts/${hostUid}/${friendUid}`, false),
      this._safeGet(accId, `friends/${hostUid}`, false)
    ]);
    if (!g || g.accepted !== true || !g.servers || !mine || !mine[friendUid]) {
      this.grantCache.delete(friendUid);
      return null;
    }
    const grant = {
      accepted: true,
      servers: new Set(Object.keys(g.servers).filter(id => SID_RE.test(id))),
      names: new Map(Object.keys(g.servers).map(id => [id, String((g.servers[id] && g.servers[id].n) || id)]))
    };
    this.grantCache.set(friendUid, grant);
    return grant;
  }

  /* ---------------- REMOTE SERVER EDITOR (10s Host Prompt, 10m Timeout Cooldown, 1h Deny Cooldown) ---------------- */
  _startRemotePoll() {
    if (this.remotePollTimer) return;
    this.remotePollTimer = setInterval(() => this._pollRtcInbox(), 3500);
    if (this.remotePollTimer.unref) this.remotePollTimer.unref();
  }
  _stopRemotePoll() {
    if (this.remotePollTimer) {
      clearInterval(this.remotePollTimer);
      this.remotePollTimer = null;
    }
  }

  async _askHostApproval(accId, callerUid, serverId, serverName, reqId) {
    const callerName = await this._userName(accId, callerUid);
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.pendingEditorPrompts.delete(reqId);
        resolve('timeout');
      }, HOST_PROMPT_TIMEOUT_MS);
      this.pendingEditorPrompts.set(reqId, {
        resolve: status => {
          clearTimeout(timer);
          resolve(status); // 'allowed' | 'denied'
        }
      });
      this.emit('editor-access-request', {
        reqId,
        callerUid,
        callerName,
        serverId,
        serverName,
        timeoutMs: HOST_PROMPT_TIMEOUT_MS
      });
    });
  }

  _respond(accId, hostUid, callerUid, id, ok, error) {
    const body = ok
      ? { id, ok: true, ts: Date.now() }
      : { id, ok: false, error: String(error || 'Denied.').slice(0, 200), ts: Date.now() };
    return this._put(accId, `rtc/${hostUid}/${callerUid}/res`, body).catch(() => {});
  }

  async _pollRtcInbox() {
    if (this.rtcBusy || !this.isConfigured()) return;
    let ctx;
    try { ctx = this._ctx(); } catch (_) { return; }
    const { acc, s } = ctx;
    this.rtcBusy = true;
    try {
      const inbox = await this._safeGet(acc.id, `rtc/${s.uid}`, true);
      if (!inbox || typeof inbox !== 'object') return;
      for (const callerUid of Object.keys(inbox)) {
        const slot = inbox[callerUid];
        if (!slot || !slot.req || !slot.req.id) continue;
        const req = slot.req;
        if (slot.res && slot.res.id === req.id) continue;
        if (this.handledReqIds.get(callerUid) === req.id) continue;
        this.handledReqIds.set(callerUid, req.id);
        this._handleEditorRequest(acc, s, callerUid, req).catch(() => {});
      }
    } catch (_) {
    } finally {
      this.rtcBusy = false;
    }
  }

  async _handleEditorRequest(acc, s, callerUid, req) {
    const serverId = String(req.serverId || '');
    const grant = SID_RE.test(serverId) ? await this._loadGrant(acc.id, s.uid, callerUid) : null;
    if (!grant || !grant.servers.has(serverId)) {
      return this._respond(acc.id, s.uid, callerUid, req.id, false, 'You do not have access to this server.');
    }

    // Check active cooldown on host side
    const cd = this.callerCooldowns.get(callerUid);
    if (cd && Date.now() < cd.until) {
      const remMin = Math.max(1, Math.ceil((cd.until - Date.now()) / 60000));
      const code = cd.reason === 'denied' ? 'COOLDOWN_DENIED' : 'COOLDOWN_TIMEOUT';
      return this._respond(acc.id, s.uid, callerUid, req.id, false, `${code}:${cd.until}:Wait ${remMin} min before requesting again.`);
    }

    const prev = this.approvedEditorSessions.get(callerUid);
    const auto = req.reconnect === true && prev && prev.serverId === serverId && Date.now() < prev.exp;
    let decision = auto ? 'allowed' : 'timeout';
    if (!auto) {
      decision = await this._askHostApproval(acc.id, callerUid, serverId, grant.names.get(serverId) || serverId, req.id);
    }

    if (decision === 'denied') {
      this.approvedEditorSessions.delete(callerUid);
      const until = Date.now() + DENY_COOLDOWN_MS;
      this.callerCooldowns.set(callerUid, { until, reason: 'denied' });
      return this._respond(acc.id, s.uid, callerUid, req.id, false, `COOLDOWN_DENIED:${until}:Host denied your request. You can request again in 1 hour.`);
    }

    if (decision !== 'allowed') {
      this.approvedEditorSessions.delete(callerUid);
      const until = Date.now() + TIMEOUT_COOLDOWN_MS;
      this.callerCooldowns.set(callerUid, { until, reason: 'timeout' });
      return this._respond(acc.id, s.uid, callerUid, req.id, false, `COOLDOWN_TIMEOUT:${until}:Host did not respond within 10s. You can request again in 10 minutes.`);
    }

    this.callerCooldowns.delete(callerUid);
    this.approvedEditorSessions.set(callerUid, { exp: Date.now() + EDITOR_SESSION_MS, serverId });
    await this._respond(acc.id, s.uid, callerUid, req.id, true);
    this.emit('p2p-expect', { friendUid: callerUid, auto: Boolean(auto) });
  }

  // Friend side: ask the host for permission (waits up to 12.5 seconds for the 10s host prompt)
  async p2pRequest(hostUid, serverId, reconnect) {
    const { acc, s } = this._ctx();
    if (!hostUid || !SID_RE.test(String(serverId || ''))) throw new Error('Missing host or server.');
    const reqId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this._del(acc.id, `rtc/${hostUid}/${s.uid}`).catch(() => {});
    await this._put(acc.id, `rtc/${hostUid}/${s.uid}/req`, {
      id: reqId, name: acc.username, serverId: String(serverId), reconnect: Boolean(reconnect), ts: Date.now()
    });
    const deadline = Date.now() + 12500;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 700));
      const res = await this._safeGet(acc.id, `rtc/${hostUid}/${s.uid}/res`, false);
      if (res && res.id === reqId) {
        if (!res.ok) throw new Error(res.error || 'The host denied your request.');
        return { ok: true };
      }
    }
    await this._del(acc.id, `rtc/${hostUid}/${s.uid}`).catch(() => {});
    const until = Date.now() + TIMEOUT_COOLDOWN_MS;
    throw new Error(`COOLDOWN_TIMEOUT:${until}:Host did not respond within 10s. You can request again in 10 minutes.`);
  }

  _rtcPair(role, otherUid, me) {
    return role === 'host' ? { host: me, friend: otherUid } : { host: otherUid, friend: me };
  }

  async p2pSignalSend(role, otherUid, data) {
    const { acc, s } = this._ctx();
    const { host, friend } = this._rtcPair(role, otherUid, s.uid);
    const box = role === 'host' ? 'toFriend' : 'toHost';
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this._put(acc.id, `rtc/${host}/${friend}/${box}/${id}`, { data: String(data).slice(0, 19000), ts: Date.now() });
    return true;
  }

  async p2pSignalPoll(role, otherUid) {
    const { acc, s } = this._ctx();
    const { host, friend } = this._rtcPair(role, otherUid, s.uid);
    const box = role === 'host' ? 'toHost' : 'toFriend';
    const raw = await this._safeGet(acc.id, `rtc/${host}/${friend}/${box}`, false);
    if (!raw || typeof raw !== 'object') return [];
    const keys = Object.keys(raw);
    if (!keys.length) return [];
    await Promise.all(keys.map(k => this._del(acc.id, `rtc/${host}/${friend}/${box}/${k}`).catch(() => {})));
    return keys
      .map(k => raw[k])
      .filter(x => x && typeof x.data === 'string')
      .sort((a, b) => (a.ts || 0) - (b.ts || 0))
      .map(x => x.data);
  }

  async p2pEnd(role, otherUid) {
    const { acc, s } = this._ctx();
    const { host, friend } = this._rtcPair(role, otherUid, s.uid);
    if (role === 'host') this.approvedEditorSessions.delete(otherUid);
    await this._del(acc.id, `rtc/${host}/${friend}`).catch(() => {});
    return true;
  }

  async p2pExec(friendUid, method, args) {
    const ap = this.approvedEditorSessions.get(friendUid);
    if (!ap || Date.now() > ap.exp) throw new Error('Editor session is not approved or expired. Re-open the editor.');
    const grant = this.grantCache.get(friendUid);
    if (!grant || !grant.accepted || !grant.servers.has(ap.serverId)) throw new Error('Your access to this server was removed.');
    if (!isAllowed(method)) throw new Error(`"${method}" is not allowed for friends.`);
    if (!this.remoteExecutor) throw new Error('Host is not ready.');
    const list = Array.isArray(args) ? args : [];
    if (method === 'listServers') {
      const all = (await this.remoteExecutor('listServers', [])) || [];
      return all.filter(sv => sv.id === ap.serverId);
    }
    if (String(list[0] || '') !== ap.serverId) throw new Error('This editor session is only approved for one server.');
    return this.remoteExecutor(method, list);
  }
}

function encodeURIComponentSafe(v) {
  return encodeURIComponent(String(v || ''));
}

module.exports = { OnlineManager };