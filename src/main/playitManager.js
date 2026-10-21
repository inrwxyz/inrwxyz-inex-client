/**
 * INEX Automatic Public Tunnel Manager (Zero-Login Direct Tunnel + Playit.gg)
 * - Generates a local SSH keypair automatically using Windows OpenSSH (ssh-keygen) so
 *   a.pinggy.io / serveo.net authenticate in 2 seconds with ZERO login and ZERO popups!
 * - Also supports existing Playit.gg keys if present on the system, without ever forcing a login popup.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { EventEmitter } = require('events');
const { BoreManager } = require('./boreManager');

const API = 'https://api.playit.gg';
const UA = 'INEX-Client-Launcher/1.0 (playit)';
const RELEASE_BASE = 'https://github.com/playit-cloud/playit-agent/releases/latest/download';

function agentAsset() {
  const arch = os.arch();
  if (process.platform === 'win32') return { file: 'playit-windows-x86_64-signed.exe', local: 'playit.exe' };
  if (process.platform === 'darwin') return { file: arch === 'arm64' ? 'playit-darwin-aarch64' : 'playit-darwin-intel', local: 'playit' };
  return { file: arch === 'arm64' ? 'playit-linux-aarch64' : 'playit-linux-amd64', local: 'playit' };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

class PlayitManager extends EventEmitter {
  constructor({ settingsManager }) {
    super();
    this.settingsManager = settingsManager;
    this.proc = null;
    this.directProcs = new Map(); // serverId -> child_process
    this.users = new Set();
    this.busy = null;
    this.gen = new Map(); // serverId -> counter, bumped by release() so a late share() can't resurrect a stopped tunnel
    this.bore = new BoreManager({ settingsManager });
    this.bore.on('exit', ({ serverId }) => {
      if (this.users.has(serverId)) {
        this._set({ status: 'error', message: 'bore.pub tunnel disconnected. Click Refresh Tunnel to reconnect.' });
      }
    });
    this.linkToken = 0;
    this.state = { status: 'off', message: '', claimUrl: '', tunnels: {} };
  }

  get baseDir() {
    return path.join(this.settingsManager.getSettings().gameDataDir, 'servers', '.playit');
  }

  get globalKeyFile() {
    return path.join(this.settingsManager.getSettings().configDir, 'playit-account.json');
  }

  get agentPath() {
    return path.join(this.baseDir, agentAsset().local);
  }

  get keyFile() {
    return path.join(this.baseDir, 'account.json');
  }

  get sshKeyPath() {
    return path.join(this.baseDir, 'inex_tunnel_ed25519');
  }

  _discoverSystemPlayitKey() {
    const jsonFiles = [this.keyFile, this.globalKeyFile];
    for (const jf of jsonFiles) {
      try {
        if (fs.existsSync(jf)) {
          const parsed = JSON.parse(fs.readFileSync(jf, 'utf8'));
          if (parsed && parsed.secretKey && String(parsed.secretKey).trim().length >= 16) {
            return String(parsed.secretKey).trim();
          }
        }
      } catch (_) {}
    }

    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const tomlPaths = [
      path.join(localAppData, 'playit_gg', 'playit.toml'),
      path.join(appData, 'playit_gg', 'playit.toml'),
      path.join(localAppData, 'playit', 'playit.toml'),
      path.join(appData, 'playit', 'playit.toml'),
      path.join(os.homedir(), '.config', 'playit_gg', 'playit.toml')
    ];

    for (const tf of tomlPaths) {
      try {
        if (fs.existsSync(tf)) {
          const raw = fs.readFileSync(tf, 'utf8');
          const m = raw.match(/secret_key\s*=\s*["']?([A-Za-z0-9_-]{16,})["']?/i);
          if (m && m[1]) {
            this._writeKey(m[1]);
            return m[1];
          }
        }
      } catch (_) {}
    }
    return null;
  }

  _readKey() {
    return this._discoverSystemPlayitKey();
  }

  _writeKey(secretKey) {
    if (!secretKey) return;
    try {
      fs.mkdirSync(this.baseDir, { recursive: true });
      fs.writeFileSync(this.keyFile, JSON.stringify({ secretKey }), 'utf8');
    } catch (_) {}
    try {
      fs.mkdirSync(path.dirname(this.globalKeyFile), { recursive: true });
      fs.writeFileSync(this.globalKeyFile, JSON.stringify({ secretKey }), 'utf8');
    } catch (_) {}
  }

  isLinked() {
    return !!this._readKey();
  }

  unlink() {
    this.stopAll();
    try { fs.unlinkSync(this.keyFile); } catch (_) {}
    try { fs.unlinkSync(this.globalKeyFile); } catch (_) {}
    this._set({ status: 'off', message: '', claimUrl: '', tunnels: {} });
    return { unlinked: true };
  }

  cancelLink() {
    this.linkToken++; // aborts a running link() poll loop
    this._set({ status: 'off', message: '', claimUrl: '' });
    return { cancelled: true };
  }

  getState() {
    return { ...this.state, linked: this.isLinked(), sharing: Array.from(this.users) };
  }

  _set(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('state', this.getState());
  }

  // ---------- Zero-Login Direct SSH Key & Tunnel Engine ----------
  _ensureSshKey() {
    fs.mkdirSync(this.baseDir, { recursive: true });
    if (fs.existsSync(this.sshKeyPath)) return this.sshKeyPath;

    const keygenBin = process.platform === 'win32' && fs.existsSync('C:\\Windows\\System32\\OpenSSH\\ssh-keygen.exe')
      ? 'C:\\Windows\\System32\\OpenSSH\\ssh-keygen.exe'
      : 'ssh-keygen';

    try {
      execFileSync(keygenBin, ['-t', 'ed25519', '-f', this.sshKeyPath, '-N', '', '-q'], {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 6000
      });
      if (process.platform !== 'win32') {
        try { fs.chmodSync(this.sshKeyPath, 0o600); } catch (_) {}
      }
      return fs.existsSync(this.sshKeyPath) ? this.sshKeyPath : null;
    } catch (_) {
      return null;
    }
  }

  _stopDirectTunnel(serverId) {
    const p = this.directProcs.get(serverId);
    if (p) {
      this.directProcs.delete(serverId);
      try { p.removeAllListeners(); p.kill(); } catch (_) {}
    }
  }

  _trySingleSshProvider(serverId, { port, bedrockPort, provider }) {
    const sshBin = process.platform === 'win32' && fs.existsSync('C:\\Windows\\System32\\OpenSSH\\ssh.exe')
      ? 'C:\\Windows\\System32\\OpenSSH\\ssh.exe'
      : 'ssh';
    const keyPath = this._ensureSshKey();
    const nullFile = process.platform === 'win32' ? 'NUL' : '/dev/null';

    const args = [];
    if (keyPath) args.push('-i', keyPath);
    if (provider === 'pinggy') {
      args.push(
        '-p', '443',
        '-o', 'StrictHostKeyChecking=no',
        '-o', `UserKnownHostsFile=${nullFile}`,
        '-o', 'ServerAliveInterval=25',
        '-o', 'ConnectTimeout=10',
        '-T',
        `-R0:127.0.0.1:${port}`,
        'tcp@a.pinggy.io'
      );
    } else {
      args.push(
        '-o', 'StrictHostKeyChecking=no',
        '-o', `UserKnownHostsFile=${nullFile}`,
        '-o', 'ServerAliveInterval=25',
        '-o', 'ConnectTimeout=10',
        '-T',
        `-R0:127.0.0.1:${port}`,
        'serveo.net'
      );
    }

    return new Promise(resolve => {
      let proc;
      try {
        proc = spawn(sshBin, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (_) {
        resolve(null);
        return;
      }

      let resolved = false;
      let output = '';
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { proc.kill(); } catch (_) {}
          resolve(null);
        }
      }, 12000);

      const checkOutput = chunk => {
        output += chunk.toString('utf8');
        const clean = output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

        // Match Pinggy TCP URL (e.g. tcp://rnpob-103-...a.free.pinggy.link:41289)
        const pinggyMatch =
          clean.match(/tcp:\/\/([a-zA-Z0-9.-]+\.pinggy\.link):(\d+)/i) ||
          clean.match(/([a-zA-Z0-9.-]+\.pinggy\.link):(\d+)/i);

        // Match Serveo TCP URL (e.g. Forwarding TCP connections from serveo.net:54321)
        const serveoMatch =
          clean.match(/Forwarding TCP connections from\s+([a-zA-Z0-9.-]+):(\d+)/i);

        const match = pinggyMatch || serveoMatch;
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timer);
          const host = match[1];
          const pubPort = parseInt(match[2], 10);
          this.directProcs.set(serverId, proc);

          proc.on('exit', () => {
            if (this.directProcs.get(serverId) === proc) {
              this.directProcs.delete(serverId);
              if (this.users.has(serverId)) {
                this._set({ status: 'error', message: 'Public tunnel disconnected. Click Refresh Tunnel to reconnect.' });
              }
            }
          });

          const res = {
            java: { host, port: pubPort, display: `${host}:${pubPort}` }
          };
          if (bedrockPort) {
            res.bedrock = { host, port: bedrockPort, display: `${host}:${bedrockPort}` };
          }
          resolve(res);
        }
      };

      proc.stdout.on('data', checkOutput);
      proc.stderr.on('data', checkOutput);
      proc.on('error', () => {
        if (!resolved) { resolved = true; clearTimeout(timer); resolve(null); }
      });
      proc.on('exit', () => {
        if (!resolved) { resolved = true; clearTimeout(timer); resolve(null); }
      });
    });
  }

  async _startDirectAutoTunnel(serverId, { port, bedrockPort }) {
    this._stopDirectTunnel(serverId);
    // Try Pinggy first (Port 443 TCP, works through all firewalls with SSH key)
    let res = await this._trySingleSshProvider(serverId, { port, bedrockPort, provider: 'pinggy' });
    if (res && res.java) return res;
    // Fallback to Serveo TCP tunnel
    res = await this._trySingleSshProvider(serverId, { port, bedrockPort, provider: 'serveo' });
    return res;
  }

  // ---------- Playit.gg API (Used if Playit secretKey already exists on PC) ----------
  async _call(route, body, secretKey) {
    const headers = { 'Content-Type': 'application/json', 'User-Agent': UA };
    if (secretKey) headers.Authorization = `Agent-Key ${secretKey}`;
    const res = await fetch(`${API}${route}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    const json = await res.json();
    if (json && json.status === 'success') return json.data;
    throw new Error('Playit API error');
  }

  async _ensureAgent() {
    if (fs.existsSync(this.agentPath) && fs.statSync(this.agentPath).size > 1_000_000) return;
    fs.mkdirSync(this.baseDir, { recursive: true });
    const asset = agentAsset();
    const url = `${RELEASE_BASE}/${asset.file}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const tmp = `${this.agentPath}.part`;
    const out = fs.createWriteStream(tmp);
    for await (const chunk of res.body) {
      if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
    }
    await new Promise((resolve, reject) => { out.end(err => (err ? reject(err) : resolve())); });
    fs.renameSync(tmp, this.agentPath);
  }

  _addressOf(tunnel, kind) {
    const host = tunnel.custom_domain || tunnel.assigned_domain;
    const port = tunnel.port && tunnel.port.from;
    const hostOnly = kind === 'java' && /\.joinmc\.link$/i.test(host || '');
    return { host, port, display: hostOnly ? host : `${host}:${port}` };
  }

  async _ensurePlayitTunnel(secretKey, run, { kind, localPort }) {
    const type = kind === 'java' ? 'minecraft-java' : 'minecraft-bedrock';
    const proto = kind === 'java' ? 'tcp' : 'udp';
    const find = data => (data.tunnels || []).find(t =>
      (t.local_port === localPort || t.tunnel_type === type) &&
      t.tunnel_type === type &&
      !t.disabled &&
      (t.custom_domain || t.assigned_domain)
    );
    let existing = find(run);
    if (existing) return existing;

    const pending = (run.pending || []).find(t => t.tunnel_type === type);
    if (!pending) {
      await this._call('/tunnels/create', {
        name: `INEX ${kind}${localPort}`,
        tunnel_type: type,
        port_type: proto,
        port_count: 1,
        origin: { type: 'agent', data: { agent_id: run.agent_id, local_ip: '127.0.0.1', local_port: localPort } },
        enabled: true,
        alloc: { type: 'region', details: { region: 'smart-global' } },
        firewall_id: null
      }, secretKey);
    }
    for (let i = 0; i < 15; i++) {
      await sleep(1200);
      const data = await this._call('/agents/rundata', {}, secretKey);
      existing = find(data);
      if (existing) return existing;
    }
    throw new Error('Playit tunnel timeout');
  }

  async _startPlayitAgent(secretKey) {
    if (this.proc) return;
    const proc = spawn(this.agentPath, ['--secret', secretKey, '--stdout'], {
      cwd: this.baseDir,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      env: { ...process.env, SECRET_KEY: secretKey }
    });
    this.proc = proc;
    proc.on('exit', () => { this.proc = null; });
  }

  _stopPlayitAgent() {
    if (!this.proc) return;
    const p = this.proc;
    this.proc = null;
    try { p.removeAllListeners(); p.kill(); } catch (_) {}
  }


  // ---------- One-time link (makes the tunnel address PERMANENT) ----------
  // Runs ONLY when the user clicks "Make address permanent". Never opens by itself.
  // NOTE: the Playit claim page requires a (free) Playit login, there is no guest option.
  // The secret key is saved once; after that every start/stop reuses the same tunnel + address.
  async link(openUrl) {
    if (this._readKey()) return { ok: true, already: true };
    const token = ++this.linkToken;
    const code = require('crypto').randomBytes(5).toString('hex');
    const claimUrl = `https://playit.gg/claim/${code}`;
    const asString = d => (typeof d === 'string' ? d : (d && (d.status || d.state || Object.keys(d)[0])) || '');
    try {
      await this._call('/claim/setup', { code, agent_type: 'self-managed', version: 'inex-launcher' });
    } catch (e) {
      this._set({ status: 'error', message: 'Could not start Playit link. Check your internet and try again.', claimUrl: '' });
      return { ok: false, error: e.message };
    }
    this._set({ status: 'linking', message: 'Log in to Playit in the browser and approve.', claimUrl });
    try { if (typeof openUrl === 'function') openUrl(claimUrl); } catch (_) {}

    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      if (token !== this.linkToken) return { ok: false, cancelled: true };
      await sleep(3000);
      let st = '';
      try { st = asString(await this._call('/claim/setup', { code, agent_type: 'self-managed', version: 'inex-launcher' })); } catch (_) { continue; }
      if (/UserRejected/i.test(st)) {
        this._set({ status: 'error', message: 'Playit link was rejected.', claimUrl: '' });
        return { ok: false, error: 'rejected' };
      }
      if (/UserAccepted/i.test(st)) {
        try {
          const ex = await this._call('/claim/exchange', { code });
          const key = ex && (ex.secret_key || ex.secretKey);
          if (!key) throw new Error('no key');
          this._writeKey(String(key).trim());
          this._set({ status: 'off', message: '', claimUrl: '' });
          return { ok: true };
        } catch (e) {
          this._set({ status: 'error', message: 'Playit approved, but key exchange failed. Try again.', claimUrl: '' });
          return { ok: false, error: e.message };
        }
      }
    }
    this._set({ status: 'error', message: 'Playit link timed out. Try again.', claimUrl: '' });
    return { ok: false, error: 'timeout' };
  }

  // ---------- Public Share API ----------
  async share(serverId, opts = {}) {
    if (this.busy) await this.busy.catch(() => {});
    const token = (this.gen.get(serverId) || 0) + 1;
    this.gen.set(serverId, token);
    const job = this._share(serverId, opts);
    this.busy = job;
    try {
      const res = await job;
      if (this.gen.get(serverId) !== token) {
        // Released (or restarted) while we were connecting: drop whatever this run created.
        if (this.gen.get(serverId) > token) {
          this.release(serverId);
        }
        return { ok: false, cancelled: true };
      }
      return res;
    } finally { if (this.busy === job) this.busy = null; }
  }

  // bore.pub for Java (no login). Bedrock (UDP) still comes from Playit when an account is linked.
  async _shareViaBore(serverId, { port, bedrockPort }) {
    this._set({ status: 'starting', message: 'Connecting to bore.pub...', claimUrl: '' });
    let java;
    try {
      java = await this.bore.start(serverId, port);
    } catch (e) {
      this._set({ status: 'error', message: `bore.pub failed: ${e && e.message ? e.message : e}`, claimUrl: '' });
      return { ok: false, error: e && e.message };
    }
    const result = { java };
    const key = bedrockPort ? this._readKey() : null;
    if (key) {
      try {
        await this._ensureAgent();
        const run = await this._call('/agents/rundata', {}, key);
        if (run && run.agent_id) {
          const bedrock = await this._ensurePlayitTunnel(key, run, { kind: 'bedrock', localPort: bedrockPort });
          result.bedrock = this._addressOf(bedrock, 'bedrock');
          await this._startPlayitAgent(key);
        }
      } catch (_) {}
    }
    this.users.add(serverId);
    this._set({ status: 'running', message: '', claimUrl: '', tunnels: { ...this.state.tunnels, [serverId]: result } });
    return { ok: true, ...result };
  }

  async _share(serverId, { port, bedrockPort, javaTunnel }) {
    if (javaTunnel === 'bore') return this._shareViaBore(serverId, { port, bedrockPort });
    this.bore.stop(serverId);
    this._set({ status: 'starting', message: 'Auto-generating public server IP & tunnel...', claimUrl: '' });

    // 1. If a Playit.gg secretKey is already present on the PC, use Playit.gg directly (no popup)
    const existingPlayitKey = this._readKey();
    if (existingPlayitKey) {
      try {
        await this._ensureAgent();
        const run = await this._call('/agents/rundata', {}, existingPlayitKey);
        if (run && run.agent_id) {
          const result = {};
          const java = await this._ensurePlayitTunnel(existingPlayitKey, run, { kind: 'java', localPort: port });
          result.java = this._addressOf(java, 'java');
          if (bedrockPort) {
            try {
              const fresh = await this._call('/agents/rundata', {}, existingPlayitKey);
              const bedrock = await this._ensurePlayitTunnel(existingPlayitKey, fresh, { kind: 'bedrock', localPort: bedrockPort });
              result.bedrock = this._addressOf(bedrock, 'bedrock');
            } catch (_) {
              result.bedrock = { host: result.java.host, port: bedrockPort, display: `${result.java.host}:${bedrockPort}` };
            }
          }
          this.users.add(serverId);
          await this._startPlayitAgent(existingPlayitKey);
          this._set({ status: 'running', message: '', claimUrl: '', tunnels: { ...this.state.tunnels, [serverId]: result } });
          return { ok: true, ...result };
        }
      } catch (e) {
        this._lastPlayitError = e && e.message;
      }
    }

    // 2. Zero-login temporary tunnel. Address changes on every restart (free relay limitation).
    //    Link a Playit account once to get a fixed address.
    const direct = await this._startDirectAutoTunnel(serverId, { port, bedrockPort });
    if (direct && direct.java) {
      direct.temporary = true;
      delete direct.bedrock; // SSH relays are TCP only: Bedrock (UDP) needs the permanent Playit tunnel
      this.users.add(serverId);
      this._set({ status: 'running', message: 'Temporary address (changes on restart).', claimUrl: '', tunnels: { ...this.state.tunnels, [serverId]: direct } });
      return { ok: true, ...direct };
    }

    this._set({
      status: 'error',
      message: 'Could not reach public tunnel server. Check your internet connection and click Refresh Tunnel.',
      claimUrl: ''
    });
    return { ok: false, error: 'Could not establish public tunnel.' };
  }

  release(serverId) {
    this.gen.set(serverId, (this.gen.get(serverId) || 0) + 1);
    this.users.delete(serverId);
    this._stopDirectTunnel(serverId);
    this.bore.stop(serverId);
    const tunnels = { ...this.state.tunnels };
    delete tunnels[serverId];
    if (!this.users.size) {
      this._stopPlayitAgent();
      this._set({ status: 'off', message: '', claimUrl: '', tunnels });
    } else {
      this._set({ tunnels });
    }
  }

  stopAll() {
    for (const id of this.directProcs.keys()) {
      this._stopDirectTunnel(id);
    }
    this.bore.stopAll();
    this.users.clear();
    this._stopPlayitAgent();
    this.state = { ...this.state, status: 'off', tunnels: {} };
  }
}

module.exports = { PlayitManager };