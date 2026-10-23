'use strict';
/**
 * INEX CLIENT — Code Access (one-time code -> WebRTC P2P Remote Server Editor)
 *
 * Replaces the old accounts / friends / grants system.
 *  - Host picks a server and generates a short one-time code (8 chars, e.g. K7M2-9QXP).
 *  - The other person pastes the code. No Allow/Deny prompt: the code IS the permission.
 *  - First person to use the code wins; the code dies immediately (and after 15 minutes if unused).
 *  - While someone is connected nobody else can use a code and the host cannot generate a new one.
 *  - Firebase Realtime Database is used ONLY as a short-lived handshake relay under sessions/{CODE}.
 *    Everything after the DataChannel opens (commands, logs, files) goes directly peer-to-peer.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const cfg = require('./firebaseConfig');
const { isAllowed } = require('./cohostPolicy');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no I / O / 0 / 1
const CODE_LEN = 8;
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const SID_RE = /^[a-z0-9]{6,20}$/;
const CODE_TTL_MS = 15 * 60 * 1000;      // unused code lifetime
const CLAIM_TIMEOUT_MS = 45 * 1000;      // after a friend used the code, the P2P link must open within this
const HTTP_TIMEOUT_MS = 8000;

class CodeAccess extends EventEmitter {
  constructor({ settingsManager, fetchImpl, remoteExecutor, serverProvider } = {}) {
    super();
    this.fetch = fetchImpl || ((...a) => fetch(...a));
    this.remoteExecutor = remoteExecutor || null;
    this.serverProvider = serverProvider || null;
    let dir = null;
    try { dir = settingsManager && settingsManager.getSettings().configDir; } catch (_) { dir = null; }
    this.lastFile = dir ? path.join(dir, 'access-last.json') : null;
    this.pending = null;   // { code, serverId, exp, timer }
    this.session = null;   // { id, serverId, since, sid, opened, timer }
    this._creating = false;
  }

  setRemoteExecutor(fn) { this.remoteExecutor = fn; }
  setServerProvider(fn) { this.serverProvider = fn; }

  /* ---------------- helpers ---------------- */
  isConfigured() { return Boolean(cfg.databaseURL) && !/PASTE/i.test(cfg.databaseURL); }

  _need() {
    if (!this.isConfigured()) throw new Error('Handshake server is not configured (firebaseConfig.js).');
  }

  async _fb(method, p, body) {
    this._need();
    const url = `${String(cfg.databaseURL).replace(/\/+$/, '')}/${p}.json`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
    try {
      const res = await this.fetch(url, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal
      });
      if (res.status === 401 || res.status === 403) throw new Error('Handshake server refused the request (Firebase rules for sessions/ are not set).');
      if (!res.ok) throw new Error('Handshake server error ' + res.status + '.');
      const txt = await res.text();
      return txt ? JSON.parse(txt) : null;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('Handshake server timed out. Check your internet connection.');
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  _newCode() {
    let s = '';
    for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
    return s;
  }

  static normalize(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  _saveLast(code) {
    if (!this.lastFile) return;
    try {
      fs.mkdirSync(path.dirname(this.lastFile), { recursive: true });
      fs.writeFileSync(this.lastFile, JSON.stringify({ code }), 'utf8');
    } catch (_) {}
  }

  _clearLast() {
    if (!this.lastFile) return;
    try { fs.unlinkSync(this.lastFile); } catch (_) {}
  }

  /** Called once at startup: removes a leftover code if the launcher crashed last time. */
  autoStart() {
    if (!this.lastFile || !this.isConfigured()) return;
    let code = null;
    try { code = JSON.parse(fs.readFileSync(this.lastFile, 'utf8')).code; } catch (_) { return; }
    if (code && CODE_RE.test(code)) this._fb('DELETE', `sessions/${code}`).catch(() => {});
    this._clearLast();
  }

  async shutdown() {
    const jobs = [];
    if (this.pending) { clearTimeout(this.pending.timer); jobs.push(this._fb('DELETE', `sessions/${this.pending.code}`).catch(() => {})); this.pending = null; }
    if (this.session) { clearTimeout(this.session.timer); jobs.push(this._fb('DELETE', `sessions/${this.session.id}`).catch(() => {})); this.session = null; }
    this._clearLast();
    await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, 2500))]);
  }

  /* ---------------- status ---------------- */
  getStatus() {
    const phase = this.session ? 'connected' : (this.pending ? 'waiting' : 'idle');
    const src = this.session || this.pending || {};
    return {
      configured: this.isConfigured(),
      phase,
      code: this.pending ? this.pending.code : null,
      serverId: src.serverId || null,
      exp: this.pending ? this.pending.exp : null,
      since: this.session ? this.session.since : null
    };
  }

  _emitState() { this.emit('state', this.getStatus()); }

  /* ---------------- host: create / cancel / disconnect ---------------- */
  async createCode(serverId) {
    if (this._creating) throw new Error('Already generating a code. Please wait.');
    if (this.session) throw new Error('Someone is connected right now. Disconnect them first.');
    if (this.pending) return this.getStatus(); // one active code at a time, never a second one
    this._need();
    this._creating = true; // set BEFORE any await so a second tap can never start a second code
    try {
      if (this.serverProvider) {
        const list = (await this.serverProvider()) || [];
        if (!list.some(s => s.id === serverId)) throw new Error('That server was not found.');
      }
      let code = null;
      for (let i = 0; i < 4 && !code; i++) {
        const c = this._newCode();
        const existing = await this._fb('GET', `sessions/${c}/meta`);
        if (!existing) code = c;
      }
      if (!code) throw new Error('Could not create a free code. Try again.');
      const exp = Date.now() + CODE_TTL_MS;
      await this._fb('PUT', `sessions/${code}/meta`, { exp });
      if (this.session || this.pending) { // state changed while we were waiting on the network
        this._fb('DELETE', `sessions/${code}`).catch(() => {});
        return this.getStatus();
      }
      this.pending = { code, serverId, exp, timer: setTimeout(() => this._expire(code), CODE_TTL_MS) };
      this._saveLast(code);
      this._emitState();
      this.emit('p2p-expect', { code, exp });
      return this.getStatus();
    } finally {
      this._creating = false;
    }
  }

  _expire(code) {
    if (!this.pending || this.pending.code !== code) return;
    this._dropPending(true);
  }

  _dropPending(kick) {
    const p = this.pending;
    if (!p) return;
    clearTimeout(p.timer);
    this.pending = null;
    this._fb('DELETE', `sessions/${p.code}`).catch(() => {});
    this._clearLast();
    if (kick) this.emit('p2p-kick', { code: p.code });
    this._emitState();
  }

  async cancelCode() {
    this._dropPending(true);
    return this.getStatus();
  }

  _endSession(code, kick) {
    const s = this.session;
    if (!s || s.id !== code) return;
    clearTimeout(s.timer);
    this.session = null;
    this._fb('DELETE', `sessions/${code}`).catch(() => {});
    this._clearLast();
    if (kick) this.emit('p2p-kick', { code });
    this._emitState();
  }

  /** Host pressed Disconnect (or Cancel code). */
  async disconnect() {
    if (this.session) this._endSession(this.session.id, true);
    else this._dropPending(true);
    return this.getStatus();
  }

  /* ---------------- host: first offer claims the code ---------------- */
  async claim(code, sid) {
    code = CodeAccess.normalize(code);
    if (!this.pending || this.pending.code !== code) throw new Error('This code is not active.');
    if (!SID_RE.test(String(sid || ''))) throw new Error('Bad session id.');
    const p = this.pending;
    clearTimeout(p.timer);
    this.pending = null;
    const timer = setTimeout(() => {
      if (this.session && this.session.id === code && !this.session.opened) this._endSession(code, true);
    }, CLAIM_TIMEOUT_MS);
    this.session = { id: code, serverId: p.serverId, since: Date.now(), sid, opened: false, timer };
    // the code is dead for everybody else from this moment
    this._fb('DELETE', `sessions/${code}/meta`).catch(() => {});
    this._emitState();
    return { ok: true };
  }

  hostOpened(code) {
    code = CodeAccess.normalize(code);
    const s = this.session;
    if (!s || s.id !== code) return { ok: false };
    s.opened = true;
    clearTimeout(s.timer);
    s.timer = null;
    this._fb('DELETE', `sessions/${code}`).catch(() => {}); // handshake finished -> remove it from Firebase
    this._emitState();
    return { ok: true };
  }

  hostClosed(code) {
    this._endSession(CodeAccess.normalize(code), false);
    return { ok: true };
  }

  /* ---------------- friend: check the code ---------------- */
  async check(code) {
    code = CodeAccess.normalize(code);
    if (!CODE_RE.test(code)) throw new Error('The code has 8 letters/numbers, like K7M2-9QXP.');
    const meta = await this._fb('GET', `sessions/${code}/meta`);
    if (!meta || typeof meta.exp !== 'number' || meta.exp + 2 * 60 * 1000 < Date.now()) {
      throw new Error('Code is invalid, already used or expired. Ask the host for a new one.');
    }
    return { code };
  }

  /* ---------------- WebRTC handshake relay ---------------- */
  _assert(code, sid) {
    if (!CODE_RE.test(String(code || ''))) throw new Error('Bad code.');
    if (sid != null && !SID_RE.test(String(sid))) throw new Error('Bad session id.');
  }

  async signalSend(role, code, sid, data) {
    code = CodeAccess.normalize(code);
    this._assert(code, sid);
    if (!sid) throw new Error('Bad session id.');
    const box = role === 'host' ? 'toFriend' : 'toHost';
    if (role === 'host') {
      if (!(this.session && this.session.id === code)) throw new Error('This code is not in use.');
      if (this.session.sid !== sid && String(data) !== '{"k":"busy"}') throw new Error('This code is not in use.');
    }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await this._fb('PUT', `sessions/${code}/${box}/${sid}/${id}`, { d: String(data).slice(0, 19000), t: Date.now() });
    return true;
  }

  async signalPoll(role, code, sid) {
    code = CodeAccess.normalize(code);
    this._assert(code, role === 'host' ? null : sid);
    const out = [];
    const dels = [];
    const readBox = (sidKey, msgs) => {
      if (!msgs || typeof msgs !== 'object') return;
      const keys = Object.keys(msgs).sort((a, b) => ((msgs[a] && msgs[a].t) || 0) - ((msgs[b] && msgs[b].t) || 0));
      for (const k of keys) {
        const m = msgs[k];
        if (m && typeof m.d === 'string') out.push({ sid: sidKey, d: m.d });
        const base = role === 'host' ? 'toHost' : 'toFriend';
        dels.push(this._fb('DELETE', `sessions/${code}/${base}/${sidKey}/${k}`).catch(() => {}));
      }
    };
    if (role === 'host') {
      if (!(this.pending && this.pending.code === code) && !(this.session && this.session.id === code)) return [];
      const raw = await this._fb('GET', `sessions/${code}/toHost`);
      if (raw && typeof raw === 'object') {
        for (const s of Object.keys(raw)) { if (SID_RE.test(s)) readBox(s, raw[s]); }
      }
    } else {
      const raw = await this._fb('GET', `sessions/${code}/toFriend/${sid}`);
      readBox(sid, raw);
    }
    if (dels.length) await Promise.all(dels);
    return out;
  }

  async end(role, code, sid) {
    code = CodeAccess.normalize(code);
    if (!CODE_RE.test(code) || !SID_RE.test(String(sid || ''))) return false;
    if (role === 'friend') {
      await Promise.all([
        this._fb('DELETE', `sessions/${code}/toHost/${sid}`).catch(() => {}),
        this._fb('DELETE', `sessions/${code}/toFriend/${sid}`).catch(() => {})
      ]);
    }
    return true;
  }

  /* ---------------- host: permission check for every remote command ---------------- */
  async p2pExec(code, method, args) {
    code = CodeAccess.normalize(code);
    const s = this.session;
    if (!s || s.id !== code) throw new Error('This editor session is not active. Ask the host for a new code.');
    if (!isAllowed(method)) throw new Error(`"${method}" is not allowed over a code session.`);
    if (!this.remoteExecutor) throw new Error('Host is not ready.');
    const list = Array.isArray(args) ? args : [];
    if (method === 'listServers') {
      const all = (await this.remoteExecutor('listServers', [])) || [];
      return all.filter(sv => sv.id === s.serverId);
    }
    if (String(list[0] || '') !== s.serverId) throw new Error('This code only gives access to one server.');
    return this.remoteExecutor(method, list);
  }
}

module.exports = { CodeAccess };
