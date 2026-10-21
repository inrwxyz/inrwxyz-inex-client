/**
 * INEX CLIENT — Friend Server Access (per server) + Remote Server Editor over WebRTC P2P
 * - Zero online/offline presence checks (saves Firebase bandwidth)
 * - Host gets a 10-second Allow / Deny popup when a friend clicks "Open editor"
 * - If Host clicks Deny -> 1 hour cooldown for that friend
 * - If Host does not respond within 10s -> 10 minute cooldown for that friend
 */
(function () {
  'use strict';
  const api = window.inexAPI || {};
  const sec = document.getElementById('view-server');
  if (!sec) return;
  const $ = (r, s) => r.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = e => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  const ico = (name, cls = 'ico-xs') => `<svg class="ico ${cls}"><use href="#i-${name}"/></svg>`;
  function el(t, c, h) { const e = document.createElement(t); if (c) e.className = c; if (h) e.innerHTML = h; return e; }

  const P2P = window.inexP2P;
  const srvNames = list => (list || []).map(x => x.name).join(', ');
  const COOLDOWN_STORAGE_KEY = 'inex_editor_cooldowns_v1';

  function loadCooldowns() {
    try { return JSON.parse(localStorage.getItem(COOLDOWN_STORAGE_KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function saveCooldown(hostUid, until, reason) {
    const map = loadCooldowns();
    map[hostUid] = { until: Number(until) || 0, reason: reason || 'timeout' };
    try { localStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(map)); } catch (_) {}
  }
  function getCooldown(hostUid) {
    const map = loadCooldowns();
    const entry = map[hostUid];
    if (!entry || !entry.until || Date.now() >= entry.until) return null;
    return entry;
  }
  function fmtRemaining(ms) {
    const totalSec = Math.max(1, Math.ceil(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
  }

  const PROP_GROUPS = [
    {
      title: 'Gameplay',
      fields: [
        { key: 'gamemode', label: 'Default gamemode', type: 'select', options: ['survival', 'creative', 'adventure', 'spectator'] },
        { key: 'difficulty', label: 'Difficulty', type: 'select', options: ['peaceful', 'easy', 'normal', 'hard'] },
        { key: 'pvp', label: 'PvP Combat', type: 'bool' },
        { key: 'hardcore', label: 'Hardcore mode', type: 'bool', hint: 'Only applies when a NEW world is created.' },
        { key: 'allow-flight', label: 'Allow flight', type: 'bool' },
        { key: 'allow-nether', label: 'Nether dimension', type: 'bool' },
        { key: 'allow-end', label: 'End dimension', type: 'bool' },
        { key: 'spawn-monsters', label: 'Spawn monsters', type: 'bool' },
        { key: 'enable-command-block', label: 'Command blocks', type: 'bool' },
        { key: 'spawn-animals', label: 'Spawn animals', type: 'bool' },
        { key: 'spawn-npcs', label: 'Spawn villagers (NPCs)', type: 'bool' },
        { key: 'generate-structures', label: 'Generate structures', type: 'bool' },
        { key: 'force-gamemode', label: 'Force default gamemode on join', type: 'bool' }
      ]
    },
    {
      title: 'General',
      fields: [
        { key: 'motd', label: 'Server description (MOTD)', type: 'text', wide: true },
        { key: 'max-players', label: 'Max players', type: 'number', min: 1, max: 1000 },
        { key: 'server-port', label: 'Port', type: 'number', min: 1024, max: 65535 },
        { key: 'level-seed', label: 'World seed', type: 'text' },
        { key: 'view-distance', label: 'View distance (chunks)', type: 'number', min: 3, max: 32 },
        { key: 'simulation-distance', label: 'Simulation distance (chunks)', type: 'number', min: 3, max: 32 },
        { key: 'spawn-protection', label: 'Spawn protection radius', type: 'number', min: 0, max: 1000 }
      ]
    },
    {
      title: 'Access & Security',
      fields: [
        { key: 'online-mode', label: 'Online mode (premium only)', type: 'bool', hint: 'Keep OFF so local/offline INEX accounts can join.' },
        { key: 'white-list', label: 'Whitelist enabled', type: 'bool' },
        { key: 'enforce-whitelist', label: 'Kick non-whitelisted players live', type: 'bool' },
        { key: 'enforce-secure-profile', label: 'Require signed chat (secure profile)', type: 'bool' },
        { key: 'enable-status', label: 'Show server in multiplayer list', type: 'bool' },
        { key: 'hide-online-players', label: 'Hide online player list', type: 'bool' },
        { key: 'op-permission-level', label: 'OP permission level', type: 'select', options: ['1', '2', '3', '4'] }
      ]
    }
  ];

  const BOOL_DEFAULTS = {
    pvp: 'true', hardcore: 'false', 'allow-flight': 'false', 'allow-nether': 'true', 'allow-end': 'true',
    'spawn-monsters': 'true', 'enable-command-block': 'true', 'online-mode': 'false', 'white-list': 'false',
    'spawn-animals': 'true', 'spawn-npcs': 'true', 'generate-structures': 'true', 'force-gamemode': 'false',
    'enforce-whitelist': 'false', 'enforce-secure-profile': 'false', 'enable-status': 'true',
    'hide-online-players': 'false', 'view-distance': '10', 'simulation-distance': '10',
    'spawn-protection': '16', 'op-permission-level': '4'
  };

  const st = document.createElement('style');
  st.textContent = `
  #view-server{position:relative}
  #cxHubBar{display:none;position:absolute;top:14px;right:22px;gap:8px;z-index:6}
  #view-server[data-srv-mode="hub"] #cxHubBar{display:flex}
  .cx-wrap{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .cx-badge{display:inline-block;min-width:16px;padding:0 5px;margin-left:6px;border-radius:9px;background:var(--crimson-500,#e11d48);color:#fff;font-size:11px;text-align:center}
  #cxOv{position:fixed;inset:0;background:rgba(0,0,0,.76);z-index:10000;display:flex;align-items:center;justify-content:center;padding:14px;backdrop-filter:blur(8px)}
  #cxOv .cx-box{width:540px;max-width:100%;max-height:90vh;overflow:auto;padding:18px 20px;border-radius:18px;background:#100e18;border:1px solid rgba(225,29,72,.45);box-shadow:0 22px 64px rgba(0,0,0,.7)}
  #cxOv .cx-box.wide{width:min(1040px, 96vw);height:min(88vh, 760px);display:flex;flex-direction:column;padding:16px 18px}
  #cxOv .cx-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:10px;flex-shrink:0}
  #cxOv h3{margin:0;font-size:13.5px;letter-spacing:.08em}
  #cxOv .cx-x{background:none;border:0;color:#aaa;font-size:18px;cursor:pointer}
  .cx-sec{font-size:10px;letter-spacing:.1em;color:var(--text-muted,#8a8a99);margin:10px 2px 6px;font-weight:800}
  .cx-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 10px;border-radius:11px;background:rgba(255,255,255,.04);margin-bottom:6px;border:1px solid rgba(255,255,255,.06)}
  .cx-row .i{flex:1;min-width:120px}.cx-row .i b{display:block;font-size:13px}.cx-row .i span{font-size:11px;color:var(--text-muted,#8a8a99)}
  .cx-row select{background:rgba(255,255,255,.06);color:inherit;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:4px 6px;font-size:11px;max-width:100%}
  .cx-empty{font-size:12px;color:var(--text-muted,#8a8a99);padding:12px 4px}
  .cx-hint{font-size:11px;color:var(--text-muted,#8a8a99);margin-top:8px;line-height:1.45}
  #lbyToasts { position: fixed; right: 18px; bottom: 18px; display: grid; gap: 8px; z-index: 9999; width: 320px; max-width: calc(100% - 32px); }
  .lby-toast { background: #12101a; border: 1px solid var(--crimson-500, #e11d48); border-radius: 12px; padding: 12px 14px; box-shadow: 0 8px 28px rgba(0,0,0,.65); font-size: 13px; }

  /* Compact Remote Editor overrides */
  .rm-stats-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:10px;flex-shrink:0}
  .rm-stats-row .srv-stat{padding:8px 12px}
  .rm-tabs{display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:8px;flex-wrap:wrap}
  .rm-body{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding-right:4px}
  .rm-log{flex:1;min-height:220px;background:rgba(4,4,8,.85);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px 12px;font:11.5px/1.5 Consolas,monospace;color:#cfcfe0;overflow:auto;white-space:pre-wrap;user-select:text}
  .rm-files-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
  .rm-files-grid .profile-card{padding:10px 12px;border-radius:12px;gap:8px}
  .rm-body .srv-props-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
  .rm-body .srv-prop-bool{padding:7px 11px}
  .rm-body .modrinth-item-card{padding:10px 13px}`;
  document.head.appendChild(st);

  function toast(html, ms) {
    let box = document.getElementById('lbyToasts');
    if (!box) { box = el('div'); box.id = 'lbyToasts'; document.body.appendChild(box); }
    const t = el('div', 'lby-toast', html); box.appendChild(t);
    if (ms !== 0) setTimeout(() => t.remove(), ms || 3500);
    return t;
  }
  const fail = e => toast('<b>' + esc(clean(e)) + '</b>', 4500);

  // Listen for live Editor Access Requests on the Host's launcher (10-second timer!)
  if (api.onEditorAccessRequest) {
    api.onEditorAccessRequest(req => {
      if (!req || !req.reqId) return;
      let remSec = Math.ceil((Number(req.timeoutMs) || 10000) / 1000);
      const t = toast(
        `<b>🔔 ${esc(req.callerName || 'A friend')}</b> wants to open the editor of <b>${esc(req.serverName || 'your server')}</b> (<span class="req-cd">${remSec}s</span>).<div style="display:flex;gap:8px;margin-top:9px;"></div>`,
        0
      );
      const cdSpan = $(t, '.req-cd');
      const row = $(t, 'div');
      const allowBtn = el('button', 'btn btn-sm btn-crimson', 'Allow'); allowBtn.type = 'button';
      const denyBtn = el('button', 'btn btn-sm glass-btn', 'Deny (1h block)'); denyBtn.type = 'button';

      const iv = setInterval(() => {
        remSec -= 1;
        if (remSec <= 0) {
          clearInterval(iv);
          t.remove();
        } else if (cdSpan) {
          cdSpan.textContent = `${remSec}s`;
        }
      }, 1000);

      allowBtn.onclick = async () => {
        clearInterval(iv);
        t.remove();
        try { await api.respondEditorAccess(req.reqId, true); toast(`Allowed <b>${esc(req.callerName)}</b> to edit <b>${esc(req.serverName || 'your server')}</b>.`); } catch (_) {}
      };
      denyBtn.onclick = async () => {
        clearInterval(iv);
        t.remove();
        try { await api.respondEditorAccess(req.reqId, false); toast(`Denied <b>${esc(req.callerName)}</b> (blocked for 1 hour).`); } catch (_) {}
      };
      row.appendChild(allowBtn);
      row.appendChild(denyBtn);
    });
  }

  const hdr = $(sec, '.section-header-row'), newBtn = document.getElementById('srvNewBtn');
  const b1 = el('button', 'btn glass-btn', '👥 Friend servers<span class="cx-badge" style="display:none">0</span>'); b1.type = 'button';
  const b2 = el('button', 'btn glass-btn', '🔑 Give access'); b2.type = 'button';
  if (hdr && newBtn) { const w = el('div', 'cx-wrap'); hdr.insertBefore(w, newBtn); w.appendChild(b1); w.appendChild(b2); w.appendChild(newBtn); }
  else if (hdr) { hdr.appendChild(b1); hdr.appendChild(b2); }

  const hub = el('div'); hub.id = 'cxHubBar';
  const h1 = el('button', 'btn glass-btn', '👥 Friend servers<span class="cx-badge" style="display:none">0</span>'); h1.type = 'button';
  const h2 = el('button', 'btn glass-btn', '🔑 Give access'); h2.type = 'button';
  hub.appendChild(h1); hub.appendChild(h2); sec.appendChild(hub);

  let ov = null, view = null, rmTimer = null, cdInterval = null, editorHost = null, stateOff = null;
  function endEditorLink() {
    if (stateOff) { stateOff(); stateOff = null; }
    if (editorHost && P2P) { P2P.close(editorHost).catch(() => {}); }
    editorHost = null;
  }
  function close() {
    if (rmTimer) { clearInterval(rmTimer); rmTimer = null; }
    if (cdInterval) { clearInterval(cdInterval); cdInterval = null; }
    endEditorLink();
    if (ov) { ov.remove(); ov = null; view = null; }
  }
  function open(kind) {
    close(); view = kind;
    ov = el('div'); ov.id = 'cxOv';
    ov.innerHTML = `<div class="cx-box"><div class="cx-top"><h3 id="cxModalTitle">${kind === 'mine' ? 'FRIEND SERVERS' : 'GIVE SERVER ACCESS'}</h3><button type="button" class="cx-x">✕</button></div><div id="cxBody" style="flex:1;min-height:0;display:flex;flex-direction:column;"><div class="cx-empty">Loading…</div></div></div>`;
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    document.body.appendChild(ov); $(ov, '.cx-x').onclick = close;
    load();
  }
  b1.onclick = h1.onclick = () => gate(() => open('mine'));
  b2.onclick = h2.onclick = () => gate(() => open('give'));

  async function gate(fn) {
    try {
      const s = await api.onlineStatus();
      if (!s.configured) return toast('<b>Online is not configured (firebaseConfig.js).</b>');
      if (!s.unlocked) return toast('<b>Set an online password first.</b> Accounts tab → 🌐 Online button.', 5000);
      fn();
    } catch (e) { fail(e); }
  }

  async function load() {
    if (rmTimer) { clearInterval(rmTimer); rmTimer = null; }
    if (cdInterval) { clearInterval(cdInterval); cdInterval = null; }
    endEditorLink();
    const box = ov && $(ov, '.cx-box');
    if (box) box.classList.remove('wide');
    const titleEl = ov && $(ov, '#cxModalTitle');
    if (titleEl) titleEl.textContent = view === 'mine' ? 'FRIEND SERVERS' : 'GIVE SERVER ACCESS';
    const body = ov && $(ov, '#cxBody'); if (!body) return;
    try {
      if (view === 'mine') {
        const [inv, fr] = await Promise.all([api.cohostInvites(), api.friendsList()]);
        if (!ov) return; renderMine(body, inv, fr); setBadge(inv.length);
      } else {
        const [fr, gr, mine] = await Promise.all([api.friendsList(), api.cohostList(), api.listServers()]);
        if (!ov) return; renderGive(body, fr, gr, mine || []);
      }
    } catch (e) { body.innerHTML = '<div class="cx-empty">' + esc(clean(e)) + '</div>'; }
  }

  function startMineCooldownTicker(body) {
    if (cdInterval) clearInterval(cdInterval);
    const tick = () => {
      const btns = body.querySelectorAll('button[data-host-uid]');
      let any = false;
      btns.forEach(btn => {
        const hostUid = btn.getAttribute('data-host-uid');
        const cd = getCooldown(hostUid);
        if (cd) {
          any = true;
          btn.disabled = true;
          btn.textContent = `Wait ${fmtRemaining(cd.until - Date.now())}`;
        } else if (btn.disabled) {
          btn.disabled = false;
          btn.textContent = 'Open editor';
        }
      });
      if (!any && cdInterval) {
        clearInterval(cdInterval);
        cdInterval = null;
      }
    };
    tick();
    cdInterval = setInterval(tick, 1000);
  }

  function renderMine(body, inv, fr) {
    body.innerHTML = '';
    body.appendChild(el('div', 'cx-sec', 'INVITES (' + inv.length + ')'));
    if (!inv.length) body.appendChild(el('div', 'cx-empty', 'No pending invites.'));
    inv.forEach(i => {
      const r = el('div', 'cx-row', `<div class="i"><b>${esc(i.name)}</b><span>shares <b style="display:inline">${esc(srvNames(i.servers))}</b> with you</span></div>`);
      const a = el('button', 'btn btn-sm btn-crimson', 'Accept'); a.type = 'button';
      a.onclick = async () => { try { await api.cohostAccept(i.uid); toast('Access from ' + esc(i.name) + ' accepted'); load(); } catch (e) { fail(e); } };
      const d = el('button', 'btn btn-sm glass-btn', 'Deny'); d.type = 'button';
      d.onclick = async () => { try { await api.cohostDecline(i.uid); load(); } catch (e) { fail(e); } };
      r.appendChild(a); r.appendChild(d); body.appendChild(r);
    });
    const list = fr.filter(f => f.access && f.access.servers && f.access.servers.length);
    const total = list.reduce((n, f) => n + f.access.servers.length, 0);
    body.appendChild(el('div', 'cx-sec', 'SERVERS I CAN MANAGE (' + total + ')'));
    if (!list.length) body.appendChild(el('div', 'cx-empty', 'No friend has given you server access yet.'));
    list.forEach(f => {
      f.access.servers.forEach(sv => {
        const r = el('div', 'cx-row', `<div class="i"><b>${esc(sv.name)}</b><span>${esc(f.name)}'s server</span></div>`);
        const cd = getCooldown(f.uid);
        const o = el('button', 'btn btn-sm btn-crimson', cd ? `Wait ${fmtRemaining(cd.until - Date.now())}` : 'Open editor');
        o.type = 'button';
        o.setAttribute('data-host-uid', f.uid);
        o.disabled = Boolean(cd);
        o.onclick = () => {
          const activeCd = getCooldown(f.uid);
          if (activeCd) return;
          openRemoteEditor(f, sv);
        };
        r.appendChild(o); body.appendChild(r);
      });
      const lv = el('button', 'btn btn-sm glass-btn', 'Leave ' + esc(f.name) + "'s servers"); lv.type = 'button';
      lv.onclick = async () => { if (!confirm('Give up your access to ' + f.name + "'s servers?")) return; try { await api.cohostLeave(f.uid); load(); } catch (e) { fail(e); } };
      const w = el('div', 'cx-row', ''); w.style.background = 'transparent'; w.style.border = '0'; w.style.padding = '0 2px 6px'; w.appendChild(lv); body.appendChild(w);
    });
    body.appendChild(el('div', 'cx-hint', 'Clicking Open editor sends a 10s prompt to the server owner. If denied, a 1-hour cooldown applies; if unanswered, a 10-minute cooldown applies.'));
    startMineCooldownTicker(body);
  }

  /* ==================== COMPACT FULL REMOTE SERVER EDITOR ==================== */
  async function openRemoteEditor(friend, server) {
    if (cdInterval) { clearInterval(cdInterval); cdInterval = null; }
    const box = ov && $(ov, '.cx-box');
    const body = ov && $(ov, '#cxBody');
    const titleEl = ov && $(ov, '#cxModalTitle');
    if (!box || !body) return;
    box.classList.add('wide');
    if (titleEl) titleEl.textContent = `${String(server.name).toUpperCase()} · ${friend.name.toUpperCase()}'S SERVER`;

    const canMod = true;
    const rcall = (method, args) => P2P.call(friend.uid, method, args);
    let linkState = 'connecting';
    let allServers = [];
    let srvId = server.id;
    let srvInfo = null;
    let activeTab = 'console';
    let currentRelDir = '';
    let addonsQuery = '';
    let addonsInstalled = [];

    let waitSec = 10;
    body.innerHTML = `<div class="cx-empty">Waiting for <b>${esc(friend.name)}</b> to approve your request (<span id="rmWaitCd">10s</span>)…</div>`;
    const waitIv = setInterval(() => {
      waitSec = Math.max(0, waitSec - 1);
      const sp = $(body, '#rmWaitCd');
      if (sp) sp.textContent = `${waitSec}s`;
    }, 1000);

    try {
      if (!P2P) throw new Error('P2P module did not load (p2p-link.js).');
      editorHost = friend.uid;
      stateOff = P2P.onState(ev => {
        if (ev.hostUid !== friend.uid) return;
        linkState = ev.state;
        const lb = $(body, '#rmLinkBadge');
        if (lb) paintLinkBadge(lb);
      });
      await P2P.connect(friend.uid, server.id);
      clearInterval(waitIv);
      allServers = (await rcall('listServers', [])) || [];
      srvInfo = allServers.find(s => s.id === srvId) || allServers[0];
      if (!srvInfo) throw new Error('The host no longer has this server.');
      srvId = srvInfo.id;
    } catch (e) {
      clearInterval(waitIv);
      endEditorLink();
      const rawMsg = clean(e);
      const m = /^COOLDOWN_(DENIED|TIMEOUT):(\d+):(.*)$/.exec(rawMsg);
      if (m) {
        const reason = m[1] === 'DENIED' ? 'denied' : 'timeout';
        const until = Number(m[2]) || (Date.now() + (reason === 'denied' ? 3600000 : 600000));
        saveCooldown(friend.uid, until, reason);
        toast('<b>' + esc(m[3]) + '</b>', 5000);
        load();
        return;
      }
      body.innerHTML = `<div class="cx-empty">${esc(rawMsg)}</div><button type="button" class="btn btn-sm glass-btn" id="rmBackBtn">← Back</button>`;
      $(body, '#rmBackBtn').onclick = load;
      return;
    }

    function paintShell() {
      const srvSelectHtml = `${srvInfo.logo ? `<img src="${esc(srvInfo.logo)}" alt="" style="width:30px;height:30px;border-radius:7px;image-rendering:pixelated;" />` : ''}<strong style="font-size:16px;color:#fff;">${esc(srvInfo.name)}</strong>`;

      const pCount = Array.isArray(srvInfo.players) ? srvInfo.players.length : 0;
      const pubIp = (friend.hosting && friend.hosting.serverId === srvId && friend.hosting.ip) || 'Ask host for IP';
      const addonLabel = srvInfo.loader === 'fabric' ? 'Fabric Mods' : 'Plugins & Mods';

      body.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap;flex-shrink:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-sm glass-btn" id="rmBack" style="border-color:rgba(225,29,72,.45);color:#fff;">${ico('back')}Back</button>
            ${srvSelectHtml}
            <span class="srv-badge">${esc(srvInfo.loader)} ${esc(srvInfo.version)}</span>
            <span class="srv-status ${esc(srvInfo.status)}" id="rmStatusBadge">${esc(srvInfo.status)}</span>
            <span class="srv-badge" id="rmLinkBadge"></span>
          </div>
          <div style="display:flex;gap:6px;align-items:center;" id="rmHeaderActions">
            ${canMod ? `
              <button type="button" class="btn btn-sm btn-crimson" id="rmStart">${ico('play')}Start</button>
              <button type="button" class="btn btn-sm glass-btn" id="rmRestart">${ico('refresh')}Restart</button>
              <button type="button" class="btn btn-sm btn-danger" id="rmStop">${ico('power')}Stop</button>
            ` : ''}
          </div>
        </div>

        <div class="rm-stats-row">
          <div class="srv-stat">
            <span>SERVER ADDRESS</span>
            <strong>${esc(pubIp)}</strong>
          </div>
          <div class="srv-stat">
            <span>PLAYERS ONLINE</span>
            <strong id="rmPlayersCountStat">${srvInfo.status === 'online' ? `${pCount} /${srvInfo.maxPlayers || 20} Online` : `0 / ${srvInfo.maxPlayers || 20} (Offline)`}</strong>
          </div>
        </div>

        <div class="rm-tabs">
          <button type="button" class="type-pill-btn ${activeTab === 'console' ? 'active' : ''}" data-rmtab="console">${ico('terminal')}Console</button>
          <button type="button" class="type-pill-btn ${activeTab === 'players' ? 'active' : ''}" data-rmtab="players">${ico('user')}Players</button>
          <button type="button" class="type-pill-btn ${activeTab === 'addons' ? 'active' : ''}" data-rmtab="addons">${ico('cube')}${esc(addonLabel)}</button>
          <button type="button" class="type-pill-btn ${activeTab === 'files' ? 'active' : ''}" data-rmtab="files">${ico('folder')}Files &amp; Editor</button>
          <button type="button" class="type-pill-btn ${activeTab === 'properties' ? 'active' : ''}" data-rmtab="properties">${ico('sliders')}Properties</button>
        </div>

        <div class="rm-body" id="rmTabBody"></div>`;

      $(body, '#rmBack').onclick = load;
      paintLinkBadge($(body, '#rmLinkBadge'));
      if (canMod) {
        $(body, '#rmStart').onclick = () => runPower('startServer');
        $(body, '#rmRestart').onclick = () => runPower('restartServer');
        $(body, '#rmStop').onclick = () => runPower('stopServer');
      }
      body.querySelectorAll('[data-rmtab]').forEach(b => {
        b.onclick = () => {
          activeTab = b.getAttribute('data-rmtab');
          paintShell();
        };
      });
      renderTab();
    }

    function paintLinkBadge(b) {
      if (!b) return;
      const map = {
        open: ['● P2P connected', 'var(--success,#22c55e)'],
        connecting: ['● Connecting…', 'var(--warning,#f59e0b)'],
        reconnecting: ['● Reconnecting…', 'var(--warning,#f59e0b)'],
        closed: ['● Disconnected', '#f87171']
      };
      const m = map[linkState] || map.connecting;
      b.textContent = m[0]; b.style.color = m[1];
    }

    async function runPower(method) {
      try {
        toast(`Sending ${method.replace('Server', '')} command…`);
        srvInfo = await rcall(method, [srvId]) || srvInfo;
        updateTopBadges();
      } catch (e) { fail(e); }
    }

    function updateTopBadges() {
      const sb = $(body, '#rmStatusBadge');
      if (sb && srvInfo) {
        sb.className = `srv-status ${srvInfo.status}`;
        sb.textContent = srvInfo.status;
      }
      const pl = $(body, '#rmPlayersCountStat');
      if (pl && srvInfo) {
        const c = Array.isArray(srvInfo.players) ? srvInfo.players.length : 0;
        pl.textContent = srvInfo.status === 'online' ? `${c} / ${srvInfo.maxPlayers || 20} Online` : `0 / ${srvInfo.maxPlayers || 20} (Offline)`;
      }
    }

    async function renderTab() {
      if (rmTimer) { clearInterval(rmTimer); rmTimer = null; }
      const tb = $(body, '#rmTabBody');
      if (!tb) return;

      if (activeTab === 'console') return renderRemoteConsole(tb);
      if (activeTab === 'players') return renderRemotePlayers(tb);
      if (activeTab === 'addons') return renderRemoteAddons(tb);
      if (activeTab === 'files') return renderRemoteFiles(tb);
      if (activeTab === 'properties') return renderRemoteProperties(tb);
    }

    /* ---- 1. REMOTE CONSOLE ---- */
    async function renderRemoteConsole(tb) {
      tb.innerHTML = `
        <div class="rm-log" id="rmLogBox">Loading console logs…</div>
        ${canMod ? `
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <input class="inex-input glass-input" id="rmCmdIn" placeholder="Type a server command (without /), e.g. op PlayerName, gamemode creative…" style="flex:1;" />
          <button type="button" class="btn btn-sm btn-crimson" id="rmCmdSend">${ico('next')}Send Command</button>
        </div>` : ''}`;

      const fetchLogs = async () => {
        try {
          const [lines, latestSrv] = await Promise.all([
            rcall('getServerLog', [srvId]),
            rcall('getServer', [srvId])
          ]);
          if (latestSrv) {
            srvInfo = latestSrv;
            updateTopBadges();
          }
          const lb = $(body, '#rmLogBox');
          if (lb && Array.isArray(lines)) {
            const nearBottom = lb.scrollHeight - lb.scrollTop - lb.clientHeight < 60;
            lb.textContent = lines.length ? lines.join('\n') : 'Console logs appear here once the server starts.';
            if (nearBottom) lb.scrollTop = lb.scrollHeight;
          }
        } catch (_) {}
      };
      await fetchLogs();
      rmTimer = setInterval(fetchLogs, 4000);

      if (canMod) {
        const send = async () => {
          const inp = $(body, '#rmCmdIn');
          const cmd = (inp.value || '').trim().replace(/^\/+/, '');
          if (!cmd) return;
          inp.value = '';
          try {
            await rcall('sendServerCommand', [srvId, cmd]);
            setTimeout(fetchLogs, 450);
          } catch (e) { fail(e); }
        };
        $(body, '#rmCmdSend').onclick = send;
        $(body, '#rmCmdIn').onkeydown = e => { if (e.key === 'Enter') send(); };
      }
    }

    /* ---- 2. REMOTE PLAYERS ---- */
    function playerRow(name, { badge = '', sub = '', buttons = [] } = {}) {
      return `
        <div class="srv-prow">
          <div class="srv-pavatar">${esc(name.replace(/^\./, '').charAt(0).toUpperCase() || '?')}</div>
          <div class="srv-ptext">
            <strong>${esc(name)}</strong>
            ${badge ? `<span class="srv-pbadge">${esc(badge)}</span>` : ''}
            ${sub ? `<small>${esc(sub)}</small>` : ''}
          </div>
          ${canMod ? `
          <div class="srv-pbtns">
            ${buttons.map(b => `<button type="button" class="btn btn-sm ${b.primary ? 'btn-crimson' : 'glass-btn'}${b.danger ? ' srv-pdanger' : ''}" data-pa="${b.act}" data-pn="${esc(name)}" ${b.disabled ? 'disabled' : ''}>${esc(b.label)}</button>`).join('')}
          </div>` : ''}
        </div>`;
    }

    function playerSection(title, count, rows, empty, extraRight = '') {
      return `
        <div class="srv-psection" style="background:rgba(16,14,22,0.55);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:10px 12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <div class="settings-group-label" style="margin:0;">${esc(title.toUpperCase())}${count != null ? ` (${count})` : ''}</div>
            ${extraRight}
          </div>
          ${rows.length ? `<div style="display:flex;flex-direction:column;gap:6px;">${rows.join('')}</div>` : `<div class="srv-pempty">${esc(empty)}</div>`}
        </div>`;
    }

    async function renderRemotePlayers(tb) {
      tb.innerHTML = `<div class="cx-empty">Loading players…</div>`;
      try {
        const data = await rcall('getServerPlayers', [srvId]);
        if (!tb.isConnected || activeTab !== 'players') return;
        const on = Boolean(data && data.running);

        const onlineRows = ((data && data.online) || []).map(n => {
          const isOp = ((data && data.ops) || []).some(o => o.name.toLowerCase() === n.toLowerCase());
          const isWl = ((data && data.whitelist) || []).some(w => w.name.toLowerCase() === n.toLowerCase());
          return playerRow(n, {
            badge: isOp ? 'OP' : 'ONLINE',
            sub: isWl ? 'Whitelisted player' : 'Connected to server',
            buttons: [
              { act: isOp ? 'deop' : 'op', label: isOp ? 'Remove OP' : 'Make OP' },
              ...(!isWl ? [{ act: 'whitelist-add', label: '+ Whitelist' }] : []),
              { act: 'kick', label: 'Kick', danger: true },
              { act: 'ban', label: 'Ban', danger: true }
            ]
          });
        });

        const opsRows = ((data && data.ops) || []).map(o => playerRow(o.name, {
          badge: 'OPERATOR',
          sub: `Permission Level ${o.level || 4}`,
          buttons: [{ act: 'deop', label: 'Remove OP', danger: true }]
        }));

        const whiteRows = ((data && data.whitelist) || []).map(w => playerRow(w.name, {
          badge: 'WHITELISTED',
          buttons: [{ act: 'whitelist-remove', label: 'Remove', danger: true }]
        }));

        const bannedRows = ((data && data.banned) || []).map(b => playerRow(b.name, {
          badge: 'BANNED',
          sub: b.reason || 'Banned by operator',
          buttons: [{ act: 'pardon', label: 'Unban Player', primary: true }]
        }));

        const onlineLower = new Set(((data && data.online) || []).map(n => n.toLowerCase()));
        const recentRows = ((data && data.recent) || []).filter(n => !onlineLower.has(n.toLowerCase())).slice(0, 10).map(n => {
          const isOp = ((data && data.ops) || []).some(o => o.name.toLowerCase() === n.toLowerCase());
          return playerRow(n, {
            sub: 'Previously joined this server',
            buttons: [
              { act: isOp ? 'deop' : 'op', label: isOp ? 'Remove OP' : 'Make OP' },
              { act: 'whitelist-add', label: '+ Whitelist' },
              { act: 'ban', label: 'Ban', danger: true }
            ]
          });
        });

        const wlToggleHtml = canMod ? `
          <div style="display:inline-flex;align-items:center;gap:8px;font-size:11.5px;color:var(--text-secondary);">
            <span>Whitelist ${data.whitelistEnabled ? 'ON' : 'OFF'}</span>
            <label class="switch"><input type="checkbox" id="rmWhitelistToggle" ${data.whitelistEnabled ? 'checked' : ''}/><span class="slider-toggle"></span></label>
          </div>` : '';

        const refreshBtnHtml = `<button type="button" class="btn btn-sm glass-btn" id="rmRefreshPlayersBtn">${ico('refresh')}Sync Online List</button>`;

        tb.innerHTML = `
          ${canMod ? `
          <div class="srv-net-card" style="padding:10px 12px;">
            <div class="settings-group-label">QUICK PLAYER ACTION (TYPE USERNAME TO OP, WHITELIST, KICK OR BAN)</div>
            <div class="srv-padd" style="margin-top:4px;">
              <input type="text" class="inex-input glass-input" id="rmPName" maxlength="32" placeholder="Player username (e.g. Steve)" autocomplete="off" />
              <input type="text" class="inex-input glass-input" id="rmPReason" maxlength="100" placeholder="Optional reason for Kick / Ban" autocomplete="off" />
              <div class="srv-pbtns">
                <button type="button" class="btn btn-sm glass-btn" data-pa="op" data-pn="*">Make OP</button>
                <button type="button" class="btn btn-sm glass-btn" data-pa="deop" data-pn="*">Remove OP</button>
                <button type="button" class="btn btn-sm glass-btn" data-pa="whitelist-add" data-pn="*">+ Whitelist</button>
                <button type="button" class="btn btn-sm glass-btn srv-pdanger" data-pa="kick" data-pn="*" ${on ? '' : 'disabled'}>Kick</button>
                <button type="button" class="btn btn-sm glass-btn srv-pdanger" data-pa="ban" data-pn="*">Ban</button>
                <button type="button" class="btn btn-sm glass-btn" data-pa="pardon" data-pn="*">Unban</button>
              </div>
            </div>
          </div>` : ''}

          ${playerSection('Online Players Right Now', ((data && data.online) || []).length, onlineRows, on ? 'No players are currently online on the server.' : 'Server is offline. Start the server to see live online players.', refreshBtnHtml)}
          ${playerSection('Server Operators (OP)', ((data && data.ops) || []).length, opsRows, 'No operators added yet.')}
          ${playerSection('Whitelist', ((data && data.whitelist) || []).length, whiteRows, 'Whitelist is empty.', wlToggleHtml)}
          ${playerSection('Banned Players', ((data && data.banned) || []).length, bannedRows, 'No players are banned.')}
          ${recentRows.length ? playerSection('Recent Players History', recentRows.length, recentRows, '') : ''}`;

        const wlToggle = $(tb, '#rmWhitelistToggle');
        if (wlToggle) {
          wlToggle.onchange = async () => {
            try {
              await rcall('serverPlayerAction', [srvId, wlToggle.checked ? 'whitelist-on' : 'whitelist-off', '', '']);
              toast(`Whitelist turned ${wlToggle.checked ? 'ON' : 'OFF'}.`);
              setTimeout(() => renderRemotePlayers(tb), 400);
            } catch (e) { fail(e); }
          };
        }

        const refBtn = $(tb, '#rmRefreshPlayersBtn');
        if (refBtn) {
          refBtn.onclick = async () => {
            try {
              await rcall('serverPlayerAction', [srvId, 'refresh-list', '', '']);
              setTimeout(() => renderRemotePlayers(tb), 450);
            } catch (_) {}
          };
        }

        tb.querySelectorAll('[data-pa]').forEach(btn => {
          btn.onclick = async () => {
            const act = btn.getAttribute('data-pa');
            let name = btn.getAttribute('data-pn');
            if (name === '*') name = (($(tb, '#rmPName') && $(tb, '#rmPName').value) || '').trim();
            if (!name) return toast('Enter a player username first.');
            const reason = ($(tb, '#rmPReason') && $(tb, '#rmPReason').value) || '';
            btn.disabled = true;
            try {
              await rcall('serverPlayerAction', [srvId, act, name, reason]);
              toast(`Applied "${act}" to ${esc(name)}.`);
              setTimeout(() => renderRemotePlayers(tb), 700);
            } catch (e) {
              btn.disabled = false;
              fail(e);
            }
          };
        });
      } catch (e) {
        tb.innerHTML = `<div class="cx-empty">${esc(clean(e))}</div>`;
      }
    }

    /* ---- 3. REMOTE PLUGINS & MODS (installed only) ---- */
    async function renderRemoteAddons(tb) {
      if (srvInfo.loader === 'vanilla') {
        tb.innerHTML = `
          <div class="vanilla-notice-banner visible" style="display:flex;">
            ${ico('warn', 'ico-sm')}
            <span><strong>Vanilla Server.</strong> Vanilla servers cannot load plugins or mods.</span>
          </div>`;
        return;
      }
      const isPluginSrv = srvInfo.loader === 'paper' || srvInfo.loader === 'purpur';
      const typeLabel = isPluginSrv ? 'Plugins' : 'Fabric Mods';
      tb.innerHTML = `
        <div class="content-subtoolbar" style="margin-bottom:4px;">
          <div class="mode-switch-tabs">
            <span class="btn btn-sm btn-crimson" style="pointer-events:none;">Installed ${esc(typeLabel)} (<span id="rmAddonInstalledCount">${addonsInstalled.length}</span>)</span>
          </div>
          <div class="content-search" style="max-width:360px;">
            <div class="search-input-wrap" style="flex:1;">
              ${ico('search', 'ico-sm')}
              <input type="text" class="inex-input glass-input" id="rmAddonsSearch" placeholder="Filter installed ${esc(typeLabel.toLowerCase())}…" value="${esc(addonsQuery)}" style="padding-top:6px;padding-bottom:6px;" />
            </div>
            <button type="button" class="btn btn-sm glass-btn" id="rmAddonsRefreshBtn" title="Refresh">${ico('refresh')}</button>
          </div>
        </div>
        <div class="modrinth-list" id="rmAddonsList"></div>`;
      $(tb, '#rmAddonsSearch').oninput = e => { addonsQuery = e.target.value; paintRemoteAddonsInstalled(tb); };
      $(tb, '#rmAddonsRefreshBtn').onclick = () => loadRemoteAddonsInstalled(tb).then(() => paintRemoteAddonsInstalled(tb));
      await loadRemoteAddonsInstalled(tb);
      paintRemoteAddonsInstalled(tb);
    }

    async function loadRemoteAddonsInstalled(tb) {
      try {
        addonsInstalled = (await rcall('listServerAddons', [srvId])) || [];
      } catch (_) { addonsInstalled = []; }
      const cEl = $(tb, '#rmAddonInstalledCount');
      if (cEl) cEl.textContent = String(addonsInstalled.length);
    }

    function paintRemoteAddonsInstalled(tb) {
      const listEl = $(tb, '#rmAddonsList');
      if (!listEl) return;
      const q = (addonsQuery || '').toLowerCase().trim();
      const filtered = addonsInstalled.filter(item => !q || (item.title || '').toLowerCase().includes(q) || (item.fileName || '').toLowerCase().includes(q));
      if (!filtered.length) {
        listEl.innerHTML = `<div style="padding:28px;text-align:center;color:var(--text-muted);">No plugins or mods installed on this server. Only the server owner can install new ones.</div>`;
        return;
      }
      listEl.innerHTML = filtered.map(item => `
        <div class="modrinth-item-card">
          <div class="modrinth-item-left">
            <div class="mod-icon">${item.iconUrl ? `<img src="${esc(item.iconUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;" />` : esc((item.title || 'M').slice(0, 2).toUpperCase())}</div>
            <div class="mod-details">
              <div class="mod-title-row">
                <span class="mod-title">${esc(item.title || item.fileName)}</span>
                <span class="mod-author">${esc(item.fileName)}</span>
              </div>
              <div class="mod-desc" style="color:${item.enabled ? 'var(--success)' : 'var(--warning)'};font-weight:600;">
                ${item.enabled ? 'Enabled • Active on server' : 'Disabled'}
              </div>
            </div>
          </div>
          <div class="modrinth-item-actions">
            <button type="button" class="btn btn-sm glass-btn" data-raddon-toggle="${esc(item.fileName)}">${item.enabled ? 'Disable' : 'Enable'}</button>
            <button type="button" class="btn btn-sm srv-pdanger" data-raddon-remove="${esc(item.fileName)}">${ico('trash')}Remove</button>
          </div>
        </div>`).join('');

      listEl.querySelectorAll('[data-raddon-toggle]').forEach(b => {
        b.onclick = async () => {
          try {
            await rcall('toggleServerAddon', [srvId, b.getAttribute('data-raddon-toggle')]);
            await loadRemoteAddonsInstalled(tb);
            paintRemoteAddonsInstalled(tb);
          } catch (e) { fail(e); }
        };
      });
      listEl.querySelectorAll('[data-raddon-remove]').forEach(b => {
        b.onclick = async () => {
          if (!confirm('Remove ' + b.getAttribute('data-raddon-remove') + ' from the host server?')) return;
          try {
            await rcall('removeServerAddon', [srvId, b.getAttribute('data-raddon-remove')]);
            await loadRemoteAddonsInstalled(tb);
            paintRemoteAddonsInstalled(tb);
          } catch (e) { fail(e); }
        };
      });
    }

    /* ---- 4. REMOTE FILES & EDITOR ---- */
    async function renderRemoteFiles(tb, editRelPath = null) {
      if (editRelPath) {
        tb.innerHTML = `<div class="cx-empty">Reading ${esc(editRelPath)}…</div>`;
        try {
          const f = await rcall('readServerFile', [srvId, editRelPath]);
          tb.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid var(--border-subtle);">
              <div style="display:flex;align-items:center;gap:8px;">
                ${ico('edit', 'ico-sm')}
                <strong style="font-family:Consolas,monospace;font-size:13px;color:#fff;">${esc(f.relPath)}</strong>
              </div>
              <div style="display:flex;gap:8px;">
                <button type="button" class="btn btn-sm glass-btn" id="rmFileBack">${ico('back')}Back to Files</button>
                ${canMod ? `<button type="button" class="btn btn-sm btn-crimson" id="rmFileSave">${ico('check')}Save Changes</button>` : ''}
              </div>
            </div>
            <textarea class="inex-input glass-input" id="rmFileText" ${canMod ? '' : 'readonly'} style="flex:1;min-height:280px;font:12.5px/1.55 Consolas,'Cascadia Mono',monospace;white-space:pre;resize:none;"></textarea>`;
          $(tb, '#rmFileText').value = f.content || '';
          $(tb, '#rmFileBack').onclick = () => renderRemoteFiles(tb, null);
          if (canMod && $(tb, '#rmFileSave')) {
            $(tb, '#rmFileSave').onclick = async () => {
              try {
                await rcall('writeServerFile', [srvId, editRelPath, $(tb, '#rmFileText').value]);
                toast(`Saved <b>${esc(editRelPath)}</b>`);
              } catch (e) { fail(e); }
            };
          }
        } catch (e) {
          fail(e);
          renderRemoteFiles(tb, null);
        }
        return;
      }

      tb.innerHTML = `<div class="cx-empty">Loading server files…</div>`;
      try {
        const res = await rcall('listServerFiles', [srvId, currentRelDir]);
        const entries = (res && res.entries) || [];
        const parts = res && res.relDir ? res.relDir.split('/') : [];

        tb.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;" id="rmFilesBc"></div>
            ${canMod ? `<button type="button" class="btn btn-sm glass-btn" id="rmNewFileBtn">${ico('plus')}New Config / File</button>` : ''}
          </div>
          <div class="rm-files-grid" id="rmFilesGrid"></div>`;

        const bc = $(tb, '#rmFilesBc');
        bc.innerHTML = `<button type="button" class="btn btn-sm glass-btn" data-rfdir="">root</button>` + parts.map((p, i) => {
          const sub = parts.slice(0, i + 1).join('/');
          return `<span style="color:var(--text-muted);">/</span><button type="button" class="btn btn-sm glass-btn" data-rfdir="${esc(sub)}">${esc(p)}</button>`;
        }).join('');
        bc.querySelectorAll('[data-rfdir]').forEach(b => {
          b.onclick = () => { currentRelDir = b.getAttribute('data-rfdir'); renderRemoteFiles(tb, null); };
        });

        if (canMod && $(tb, '#rmNewFileBtn')) {
          $(tb, '#rmNewFileBtn').onclick = async () => {
            const name = prompt('Enter new file name (e.g. config.yml or notes.txt):');
            if (!name || !name.trim()) return;
            const rel = currentRelDir ? `${currentRelDir}/${name.trim()}` : name.trim();
            try {
              await rcall('writeServerFile', [srvId, rel, '']);
              renderRemoteFiles(tb, rel);
            } catch (e) { fail(e); }
          };
        }

        const grid = $(tb, '#rmFilesGrid');
        if (!entries.length) {
          grid.innerHTML = `<div class="cx-empty">This folder is empty.</div>`;
          return;
        }
        grid.innerHTML = entries.map(e => `
          <div class="profile-card" style="cursor:pointer;" data-rfpath="${esc(e.relPath)}" data-rfdir="${e.isDirectory ? '1' : '0'}" data-rfedit="${e.editable ? '1' : '0'}">
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="profile-avatar" style="width:34px;height:34px;border-radius:8px;">${ico(e.isDirectory ? 'folder' : 'edit')}</div>
              <div class="profile-info">
                <div class="profile-name" style="font-size:13px;">${esc(e.name)}</div>
                <div class="profile-meta-line">${e.isDirectory ? 'Folder • Click to open' : `${(e.size / 1024).toFixed(1)} KB${e.editable ? ' • Click to edit' : ''}`}</div>
              </div>
            </div>
          </div>`).join('');

        grid.querySelectorAll('[data-rfpath]').forEach(card => {
          card.onclick = () => {
            const p = card.getAttribute('data-rfpath');
            const isDir = card.getAttribute('data-rfdir') === '1';
            const editable = card.getAttribute('data-rfedit') === '1';
            if (isDir) { currentRelDir = p; renderRemoteFiles(tb, null); return; }
            if (!editable) return toast('Binary or large files (.jar / world data) cannot be text-edited.');
            renderRemoteFiles(tb, p);
          };
        });
      } catch (e) {
        tb.innerHTML = `<div class="cx-empty">${esc(clean(e))}</div>`;
      }
    }

    /* ---- 5. REMOTE PROPERTIES ---- */
    function propField(f, value) {
      const id = `rmp-${f.key}`;
      if (f.type === 'bool') {
        return `<div class="srv-prop srv-prop-bool">
          <div class="srv-prop-text"><label for="${id}">${esc(f.label)}</label>${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div>
          <label class="switch"><input type="checkbox" id="${id}" data-rmkey="${esc(f.key)}" data-rmtype="bool"${String(value) === 'true' ? ' checked' : ''}${canMod ? '' : ' disabled'}/><span class="slider-toggle"></span></label>
        </div>`;
      }
      let input;
      if (f.type === 'select') {
        input = `<select class="inex-select glass-input" id="${id}" data-rmkey="${esc(f.key)}" data-rmtype="select"${canMod ? '' : ' disabled'}>${f.options.map(o => `<option value="${esc(o)}"${String(value) === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      } else if (f.type === 'number') {
        input = `<input type="number" class="inex-input glass-input" id="${id}" data-rmkey="${esc(f.key)}" data-rmtype="number" min="${f.min}" max="${f.max}" value="${esc(value)}"${canMod ? '' : ' disabled'}/>`;
      } else {
        input = `<input type="text" class="inex-input glass-input" id="${id}" data-rmkey="${esc(f.key)}" data-rmtype="text" value="${esc(value)}" spellcheck="false"${canMod ? '' : ' disabled'}/>`;
      }
      return `<div class="srv-prop${f.wide ? ' wide' : ''}"><label class="field-label" for="${id}">${esc(f.label)}</label>${input}</div>`;
    }

    async function renderRemoteProperties(tb) {
      tb.innerHTML = `<div class="cx-empty">Loading server.properties…</div>`;
      try {
        const res = await rcall('getServerProperties', [srvId]);
        const vals = (res && res.values) || {};
        const defs = (res && res.defaults) || {};
        const initial = {};
        PROP_GROUPS.forEach(g => g.fields.forEach(f => {
          initial[f.key] = vals[f.key] !== undefined ? String(vals[f.key]) : (defs[f.key] !== undefined ? String(defs[f.key]) : (BOOL_DEFAULTS[f.key] || ''));
        }));

        tb.innerHTML = `
          <div class="srv-props" style="overflow:visible;">
            ${PROP_GROUPS.map(g => `
              <div class="srv-props-group">
                <div class="settings-group-label">${esc(g.title.toUpperCase())}</div>
                <div class="srv-props-grid">
                  ${g.fields.map(f => propField(f, initial[f.key])).join('')}
                </div>
              </div>`).join('')}
            ${canMod ? `
            <div class="srv-props-save">
              <span class="srv-props-note">Gamemode, PvP, Difficulty &amp; Whitelist apply <strong>LIVE</strong> in-game immediately!</span>
              <button type="button" class="btn btn-sm btn-crimson" id="rmSavePropsBtn">${ico('check')}Save Properties</button>
            </div>` : ''}
          </div>`;

        if (!canMod) return;

        const collectAndSave = async () => {
          const updates = {};
          tb.querySelectorAll('[data-rmkey]').forEach(inp => {
            const k = inp.getAttribute('data-rmkey');
            const t = inp.getAttribute('data-rmtype');
            const v = t === 'bool' ? (inp.checked ? 'true' : 'false') : String(inp.value).trim();
            if (t === 'number' && v === '') return;
            updates[k] = v;
          });
          try {
            await rcall('setServerProperties', [srvId, updates]);
            toast('Settings Saved & Applied on Host Server!');
          } catch (e) { fail(e); }
        };

        tb.querySelectorAll('.srv-prop-bool').forEach(card => {
          const input = card.querySelector('input[type="checkbox"]');
          if (!input) return;
          card.onclick = e => {
            if (e.target.closest('label.switch') || e.target.tagName === 'LABEL') return;
            input.checked = !input.checked;
            input.dispatchEvent(new Event('change'));
          };
          input.onchange = () => collectAndSave();
        });

        tb.querySelectorAll('select.inex-select').forEach(sel => {
          sel.onchange = () => collectAndSave();
        });

        const saveBtn = $(tb, '#rmSavePropsBtn');
        if (saveBtn) saveBtn.onclick = () => collectAndSave();
      } catch (e) {
        tb.innerHTML = `<div class="cx-empty">${esc(clean(e))}</div>`;
      }
    }

    paintShell();
  }

  function renderGive(body, fr, gr, myServers) {
    body.innerHTML = '';
    const G = {}; gr.forEach(g => { G[g.uid] = g; });
    body.appendChild(el('div', 'cx-sec', 'WHO HAS ACCESS TO MY SERVERS (' + gr.length + ')'));
    if (!gr.length) body.appendChild(el('div', 'cx-empty', 'Nobody yet.'));
    gr.forEach(g => {
      const r = el('div', 'cx-row', `<div class="i"><b>${esc(g.name)}${g.accepted ? '' : ' · <span style="color:var(--warning,#f59e0b)">invite pending</span>'}</b><span>${esc(srvNames(g.servers) || '—')}</span></div>`);
      const x = el('button', 'btn btn-sm glass-btn', 'Remove'); x.type = 'button';
      x.onclick = async () => { try { await api.cohostRevoke(g.uid); toast('Access removed for ' + esc(g.name)); load(); } catch (e) { fail(e); } };
      r.appendChild(x); body.appendChild(r);
    });
    body.appendChild(el('div', 'cx-sec', 'CHOOSE SERVERS + FRIEND'));
    if (!myServers.length) { body.appendChild(el('div', 'cx-empty', 'Create a server first. Then you can share it with friends.')); return; }
    if (!fr.length) { body.appendChild(el('div', 'cx-empty', 'No friends yet. Add friends in the Accounts tab (👥 Friends button) first.')); return; }
    fr.forEach(f => {
      const have = new Set(((G[f.uid] && G[f.uid].servers) || []).map(x => x.id));
      const r = el('div', 'cx-row', `<div class="i"><b>${esc(f.name)}</b><span>Select server(s) below</span></div>`);
      const boxes = el('div', '', '');
      boxes.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;flex-basis:100%;';
      myServers.forEach(sv => {
        const lab = el('label', '', `<input type="checkbox" data-sid="${esc(sv.id)}" ${have.has(sv.id) ? 'checked' : ''}/> ${esc(sv.name)}`);
        lab.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:11.5px;padding:3px 8px;border-radius:8px;background:rgba(255,255,255,.06);cursor:pointer;';
        boxes.appendChild(lab);
      });
      const b = el('button', 'btn btn-sm btn-crimson', G[f.uid] ? 'Update access' : 'Send invite'); b.type = 'button';
      b.onclick = async () => {
        const ids = Array.from(boxes.querySelectorAll('input:checked')).map(i => i.getAttribute('data-sid'));
        if (!ids.length) return toast('<b>Tick at least one server to share.</b>');
        try {
          const res = await api.cohostInvite(f.uid, ids);
          toast(res && res.accepted ? 'Access updated for ' + esc(f.name) : 'Invite sent to ' + esc(f.name));
          load();
        } catch (e) { fail(e); }
      };
      r.appendChild(b); r.appendChild(boxes); body.appendChild(r);
    });
    body.appendChild(el('div', 'cx-hint', 'Friends can do everything on the servers you tick except delete them. Whenever a friend clicks Open editor, you get a 10s Allow / Deny notification.'));
  }

  function setBadge(n) { document.querySelectorAll('.cx-badge').forEach(b => { b.textContent = n; b.style.display = n ? 'inline-block' : 'none'; }); }
  async function checkInvitesOnce() {
    if (document.hidden) return;
    try {
      const s = await api.onlineStatus(); if (!s.unlocked) { setBadge(0); return; }
      const inv = await api.cohostInvites(); setBadge(inv.length);
    } catch (_) {}
  }
  document.querySelectorAll('.nav-btn[data-nav="server"]').forEach(b => b.addEventListener('click', () => setTimeout(checkInvitesOnce, 150)));
  document.addEventListener('inex-online-changed', () => setTimeout(checkInvitesOnce, 300));
  checkInvitesOnce();
})();