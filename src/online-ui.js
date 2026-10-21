/**
 * INEX CLIENT — Online & Friends UI in the Holographic Skin Studio header (Accounts tab).
 * - Resizes all 4 header controls (👥 Friends, 🌐 Online, SKIN SYNC, + New Skin Slot) to the exact same compact height
 * - Friends popup: Search/Add friend, Accept/Deny requests, Friends list + Remove (NO online/offline status or background polling)
 */
(function () {
  'use strict';
  const api = window.inexAPI || {};
  const sec = document.getElementById('view-accounts');
  if (!sec) return;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = e => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  let last = null, busy = false, overlay = null, mode = 'online'; // 'online' | 'friends'
  let friendsList = [], reqList = [];

  window.inexOnline = {
    clean,
    status: () => api.onlineStatus(),
    changed: () => document.dispatchEvent(new CustomEvent('inex-online-changed')),
    open: () => openModal('online'),
    openFriends: () => openModal('friends')
  };

  const st = document.createElement('style');
  st.textContent = `
  /* Uniform compact height (32px) for all 4 controls in Holographic Skin Studio header */
  #view-accounts .studio-controls {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  }
  #view-accounts .studio-controls > .btn,
  #view-accounts .studio-controls > .skin-sync-pill {
    height: 32px !important;
    min-height: 32px !important;
    padding: 0 11px !important;
    font-size: 11.5px !important;
    border-radius: 9px !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 7px !important;
    box-sizing: border-box !important;
  }
  #view-accounts .studio-controls .sync-bolt-icon {
    width: 18px !important; height: 18px !important;
  }
  #view-accounts .studio-controls .sync-text-col {
    display: flex !important; flex-direction: row !important; align-items: center !important; gap: 5px !important; line-height: 1 !important;
  }
  #view-accounts .studio-controls .sync-label { font-size: 10px !important; }
  #view-accounts .studio-controls .sync-sub { font-size: 10px !important; }
  #view-accounts .studio-controls .switch {
    width: 34px !important; height: 18px !important;
  }
  #view-accounts .studio-controls .slider-toggle:before {
    width: 12px !important; height: 12px !important; left: 3px !important; bottom: 3px !important;
  }
  #view-accounts .studio-controls .switch input:checked + .slider-toggle:before {
    transform: translateX(16px) !important;
  }

  #onlineBtn.on { border-color: var(--success,#22c55e); color: var(--success,#22c55e); }
  #friendsHdrBtn .fr-badge {
    display: none; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px;
    background: var(--crimson-500,#e11d48); color: #fff; font-size: 10px; font-weight: 800;
    align-items: center; justify-content: center;
  }
  #friendsHdrBtn .fr-badge.show { display: inline-flex; }

  #onlineOv { position: fixed; inset: 0; background: rgba(0,0,0,.68); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(5px); }
  #onlineOv .oc-box { width: 460px; max-width: 100%; max-height: 88vh; overflow: auto; padding: 20px; border-radius: 18px; background: #12101a; border: 1px solid rgba(225,29,72,.4); box-shadow: 0 20px 60px rgba(0,0,0,.65); display: flex; flex-direction: column; }
  #onlineOv .oc-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  #onlineOv h3 { margin: 0; font-size: 13.5px; letter-spacing: .08em; }
  #onlineOv .oc-x { background: none; border: 0; color: #aaa; font-size: 18px; cursor: pointer; }
  #onlineOv .oc-note { font-size: 12px; color: var(--text-muted,#8a8a99); margin: 0 0 12px; line-height: 1.5; }
  #onlineOv .oc-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
  #onlineOv .oc-row input { flex: 1; min-width: 140px; }
  #onlineOv .oc-ok { color: var(--success,#22c55e); font-weight: 600; font-size: 13px; }
  #onlineOv .oc-err { color: var(--crimson-400,#fb7185); font-size: 12px; min-height: 16px; margin-top: 4px; word-break: break-word; }
  #onlineOv .oc-warn { font-size: 11px; color: var(--text-muted,#8a8a99); margin-top: 6px; }
  #onlineOv .oc-pw { position: relative; flex: 1; min-width: 140px; display: flex; }
  #onlineOv .oc-pw input { width: 100%; padding-right: 38px; }
  #onlineOv .oc-eye { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: none; border: 0; cursor: pointer; font-size: 15px; opacity: .7; padding: 2px 4px; }
  #onlineOv .oc-eye:hover { opacity: 1; }
  #onlineOv .oc-hr { border: 0; border-top: 1px solid rgba(255,255,255,.08); margin: 14px 0; }
  #onlineOv .oc-danger { color: #fb7185; }
  #onlineOv .oc-del { background: rgba(239,68,68,.18); border: 1px solid rgba(239,68,68,.55); color: #fecaca; }
  #onlineOv .fr-sec { font-size: 10.5px; font-weight: 800; letter-spacing: .1em; color: var(--text-muted,#8a8a99); margin: 10px 2px 6px; text-transform: uppercase; }
  #onlineOv .fr-list { display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto; padding-right: 2px; }
  #onlineOv .fr-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 11px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.07); }
  #onlineOv .fr-item.rq { background: rgba(225,29,72,.1); border-color: rgba(225,29,72,.35); }
  #onlineOv .fr-item canvas { width: 30px; height: 30px; border-radius: 7px; image-rendering: pixelated; flex-shrink: 0; }
  #onlineOv .fr-item .nm { flex: 1; font-size: 13px; font-weight: 700; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #onlineOv .fr-item .sub { font-size: 11px; color: var(--text-muted,#8a8a99); font-weight: 500; margin-left: 6px; }`;
  document.head.appendChild(st);

  // Pixel head helper for Friends list
  const SK = ['#e0a37a', '#c68642', '#f1c27d', '#8d5524', '#ffdbac'], HR = ['#2b1b0e', '#d0173b', '#4a2fbd', '#e6c229', '#1f1f1f'];
  function drawHead(c, name) {
    let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const i = h % 5; c.width = c.height = 8; const x = c.getContext('2d');
    x.fillStyle = SK[i]; x.fillRect(0, 0, 8, 8); x.fillStyle = HR[(i * 2 + 1) % 5];
    x.fillRect(0, 0, 8, 2); x.fillRect(0, 2, 1, 2); x.fillRect(7, 2, 1, 2);
    x.fillStyle = '#fff'; x.fillRect(1, 4, 2, 1); x.fillRect(5, 4, 2, 1);
    x.fillStyle = '#222'; x.fillRect(2, 4, 1, 1); x.fillRect(5, 4, 1, 1); x.fillStyle = '#a0522d'; x.fillRect(3, 6, 2, 1);
  }

  // Insert "👥 Friends" and "🌐 Online" buttons at the left of .studio-controls
  const ctl = sec.querySelector('.studio-controls');
  const friendsBtn = document.createElement('button');
  friendsBtn.type = 'button';
  friendsBtn.id = 'friendsHdrBtn';
  friendsBtn.className = 'btn btn-sm glass-btn';
  friendsBtn.innerHTML = '👥 Friends <span class="fr-badge" id="frReqBadge">0</span>';
  friendsBtn.onclick = () => openModal('friends');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'onlineBtn';
  btn.className = 'btn btn-sm glass-btn';
  btn.textContent = '🌐 Online';
  btn.onclick = () => openModal('online');

  if (ctl) {
    ctl.insertBefore(btn, ctl.firstChild);
    ctl.insertBefore(friendsBtn, btn);
  } else {
    sec.prepend(btn);
    sec.prepend(friendsBtn);
  }

  function updateBtn() {
    const s = last;
    btn.classList.toggle('on', Boolean(s && s.hasPassword));
    btn.textContent = !s ? '🌐 Online' : (s.hasPassword ? '✓ Online' : '🌐 Online · Set up');
    const b = document.getElementById('frReqBadge');
    if (b) {
      b.textContent = String(reqList.length);
      b.classList.toggle('show', reqList.length > 0);
    }
  }

  function closeModal() { if (overlay) { overlay.remove(); overlay = null; } }
  function openModal(targetMode = 'online') {
    mode = targetMode;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'onlineOv';
      overlay.innerHTML = '<div class="oc-box"><div class="oc-top"><h3 id="ocTitle">ONLINE</h3><button type="button" class="oc-x" id="ocClose">✕</button></div><div id="ocBody"></div></div>';
      overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeModal(); });
      document.body.appendChild(overlay);
      overlay.querySelector('#ocClose').onclick = closeModal;
    }
    refresh();
  }

  const bodyEl = () => overlay && overlay.querySelector('#ocBody');
  const val = id => ((bodyEl() || document).querySelector('#' + id) || {}).value || '';
  function setErr(m) { const b = bodyEl(); const e = b && b.querySelector('.oc-err'); if (e) e.textContent = m || ''; }

  async function run(fn) {
    if (busy) return; busy = true; setErr('Please wait…');
    try { await fn(); await refresh(); window.inexOnline.changed(); }
    catch (e) { setErr(clean(e)); }
    finally { busy = false; }
  }

  const pwf = (id, ph) => `<div class="oc-pw"><input class="inex-input glass-input" id="${id}" type="password" placeholder="${ph}" autocomplete="off"><button type="button" class="oc-eye" data-eye="${id}" title="Show / hide">👁</button></div>`;
  function wireEyes(body) {
    body.querySelectorAll('[data-eye]').forEach(b => {
      b.onclick = () => { const i = body.querySelector('#' + b.getAttribute('data-eye')); if (!i) return; const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = show ? '🙈' : '👁'; };
    });
  }
  function loginBlock() {
    return `<hr class="oc-hr"><p class="oc-note"><b>Log in with username + password</b> (account made on another PC). It will be added to your Identities list.</p>
      <div class="oc-row"><input class="inex-input glass-input" id="ocUser" placeholder="Username" maxlength="16" autocomplete="off">${pwf('ocUPw', 'Password')}</div>
      <div class="oc-row"><button type="button" class="btn btn-sm btn-crimson" id="ocLogin">Log in</button></div>`;
  }
  function wireLogin(body) {
    const go = body.querySelector('#ocLogin'); if (!go) return;
    go.onclick = () => run(async () => {
      await api.onlineLoginAs(val('ocUser'), val('ocUPw'));
      if (window.inexRefreshAccounts) await window.inexRefreshAccounts();
    });
    const pw = body.querySelector('#ocUPw'); if (pw) pw.onkeydown = e => { if (e.key === 'Enter') go.click(); };
  }

  function renderFriendsModal(body) {
    const t = overlay && overlay.querySelector('#ocTitle');
    if (t) t.textContent = 'FRIENDS (SERVER ACCESS)';
    const s = last;
    if (!s || !s.configured) {
      body.innerHTML = '<p class="oc-note">Online service is not configured (firebaseConfig.js).</p>';
      return;
    }
    if (!s.unlocked) {
      body.innerHTML = `
        <p class="oc-note">Set a password for <b>${esc(s.accountName)}</b> first to add friends and share server access.</p>
        <button type="button" class="btn btn-sm btn-crimson" id="frGoOnlineBtn">Set up Online Password</button>`;
      body.querySelector('#frGoOnlineBtn').onclick = () => { mode = 'online'; render(); };
      return;
    }

    body.innerHTML = `
      <p class="oc-note">Add friends by username so you can grant or receive <b>Server Editor</b> access in the Servers tab.</p>
      <div class="oc-row">
        <input class="inex-input glass-input" id="frSearchIn" placeholder="Search friends or type username to add…" maxlength="16" autocomplete="off" />
        <button type="button" class="btn btn-sm btn-crimson" id="frAddBtn">+ Add</button>
      </div>
      <div class="oc-err"></div>
      <div id="frReqWrap"></div>
      <div class="fr-sec">FRIENDS (<span id="frCountSpan">${friendsList.length}</span>)</div>
      <div class="fr-list" id="frListBox"></div>`;

    const paintList = () => {
      const q = (val('frSearchIn') || '').trim().toLowerCase();
      const reqWrap = body.querySelector('#frReqWrap');
      reqWrap.innerHTML = '';
      if (!q && reqList.length) {
        const secEl = document.createElement('div');
        secEl.className = 'fr-sec';
        secEl.textContent = `FRIEND REQUESTS (${reqList.length})`;
        reqWrap.appendChild(secEl);
        reqList.forEach(r => {
          const item = document.createElement('div');
          item.className = 'fr-item rq';
          const cv = document.createElement('canvas'); drawHead(cv, r.name);
          item.appendChild(cv);
          const nm = document.createElement('div');
          nm.className = 'nm';
          nm.innerHTML = `${esc(r.name)}<span class="sub">wants to be friends</span>`;
          item.appendChild(nm);
          const accBtn = document.createElement('button');
          accBtn.type = 'button'; accBtn.className = 'btn btn-sm btn-crimson'; accBtn.textContent = 'Accept';
          accBtn.onclick = () => run(async () => { await api.friendsAccept(r.uid); });
          const decBtn = document.createElement('button');
          decBtn.type = 'button'; decBtn.className = 'btn btn-sm glass-btn'; decBtn.textContent = 'Deny';
          decBtn.onclick = () => run(async () => { await api.friendsDecline(r.uid); });
          item.appendChild(accBtn);
          item.appendChild(decBtn);
          reqWrap.appendChild(item);
        });
      }

      const listBox = body.querySelector('#frListBox');
      listBox.innerHTML = '';
      const filtered = friendsList.filter(f => !q || f.name.toLowerCase().includes(q));
      const cnt = body.querySelector('#frCountSpan');
      if (cnt) cnt.textContent = String(filtered.length);

      if (!filtered.length) {
        listBox.innerHTML = `<div class="oc-note" style="padding:8px 2px;">${q ? 'No matching friend found. Press <b>+ Add</b> to send a friend request.' : 'No friends added yet. Type a player username above and press <b>+ Add</b>.'}</div>`;
        return;
      }

      filtered.forEach(f => {
        const item = document.createElement('div');
        item.className = 'fr-item';
        const cv = document.createElement('canvas'); drawHead(cv, f.name);
        item.appendChild(cv);
        const nm = document.createElement('div');
        nm.className = 'nm';
        nm.textContent = f.name;
        item.appendChild(nm);
        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'btn btn-sm glass-btn'; rm.textContent = '✕'; rm.title = 'Remove friend';
        rm.onclick = () => {
          if (!confirm(`Remove ${f.name} from your friends?`)) return;
          run(async () => { await api.friendsRemove(f.uid); });
        };
        item.appendChild(rm);
        listBox.appendChild(item);
      });
    };

    const inp = body.querySelector('#frSearchIn');
    const addBtn = body.querySelector('#frAddBtn');
    inp.oninput = paintList;
    inp.onkeydown = e => { if (e.key === 'Enter') addBtn.click(); };
    addBtn.onclick = () => {
      const target = val('frSearchIn').trim();
      if (!target) { setErr('Type a player username first.'); return; }
      run(async () => {
        const res = await api.friendsSend(target);
        inp.value = '';
        setErr(res && res.accepted ? `You are now friends with ${target}!` : `Friend request sent to ${target}.`);
      });
    };

    paintList();
  }

  function render() {
    updateBtn();
    const body = bodyEl(); if (!body) return;
    if (mode === 'friends') {
      renderFriendsModal(body);
      return;
    }
    const t = overlay && overlay.querySelector('#ocTitle');
    if (t) t.textContent = 'ONLINE ACCOUNT (PASSWORD)';
    const s = last;
    if (!s) { body.innerHTML = '<p class="oc-note">Loading…</p>'; return; }
    if (!s.configured) { body.innerHTML = '<p class="oc-note">Online service is not configured. Add your Firebase config in <b>firebaseConfig.js</b>. Local play and skins work without it.</p>'; return; }
    if (s.hasPassword) {
      body.innerHTML = `
        <p class="oc-note"><span class="oc-ok">✓ Online as ${esc(s.accountName)}</span><br>Friends and server access are unlocked.</p>
        <div class="oc-row">${pwf('ocOld', 'Current password')}${pwf('ocNew', 'New password')}</div>
        <div class="oc-row"><button type="button" class="btn btn-sm glass-btn" id="ocChange">Change password</button><button type="button" class="btn btn-sm glass-btn" id="ocOut">Log out of online</button></div>
        <div class="oc-err"></div>
        ${loginBlock()}
        <hr class="oc-hr">
        <p class="oc-note oc-danger"><b>Delete online account</b> (permanent). Frees the username <b>${esc(s.accountName)}</b> and removes your friends list, requests and server access. Your local account, profiles and skins stay.</p>
        <div class="oc-row">${pwf('ocDelPw', 'Password to confirm')}<button type="button" class="btn btn-sm oc-del" id="ocDel">Delete forever</button></div>`;
      body.querySelector('#ocChange').onclick = () => run(async () => { await api.onlineChangePassword(val('ocOld'), val('ocNew')); });
      body.querySelector('#ocOut').onclick = () => run(async () => { await api.onlineLogout(); });
      body.querySelector('#ocDel').onclick = () => {
        if (!confirm('Delete the online account "' + s.accountName + '" PERMANENTLY?\nFriends, requests and server access are removed. This cannot be undone.')) return;
        run(async () => { await api.onlineDelete(val('ocDelPw')); });
      };
      wireEyes(body); wireLogin(body);
      return;
    }
    body.innerHTML = `
      <p class="oc-note">Optional. Playing, profiles and skins never need a password. Set one for <b>${esc(s.accountName)}</b> only if you want <b>Friends and server access</b>.</p>
      <div class="oc-row">${pwf('ocPw', 'Choose a password (6+ characters)')}<button type="button" class="btn btn-sm btn-crimson" id="ocGo">Set password</button></div>
      <div class="oc-err"></div>
      <div class="oc-warn">There is no email, so a forgotten password cannot be reset. Write it down.</div>
      ${loginBlock()}`;
    body.querySelector('#ocGo').onclick = () => run(async () => { await api.onlineClaim(val('ocPw')); });
    body.querySelector('#ocPw').onkeydown = e => { if (e.key === 'Enter') body.querySelector('#ocGo').click(); };
    wireEyes(body); wireLogin(body);
  }

  async function refresh() {
    try {
      last = await api.onlineStatus();
      if (last && last.unlocked) {
        const [f, r] = await Promise.all([api.friendsList(), api.friendsRequests()]);
        friendsList = f || [];
        reqList = r || [];
      } else {
        friendsList = [];
        reqList = [];
      }
    } catch (_) {
      last = null;
    }
    render();
  }

  document.querySelectorAll('.nav-btn[data-nav="accounts"]').forEach(b => b.addEventListener('click', () => setTimeout(refresh, 100)));
  refresh();
})();