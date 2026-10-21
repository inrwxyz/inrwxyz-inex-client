/**
 * INEX CLIENT — Lobby View (Discord Voice Widget)
 * Shows one Discord voice channel (who is in it), the server's online count, and a Join button.
 * Data comes from the backend IPC 'discord:widget' (Discord's public widget.json).
 * Change CHANNEL_ID below to show a different voice channel.
 */
(function () {
  'use strict';
  const root = document.getElementById('lobbyRoot');
  if (!root) return;

  // ---- CONFIG ----
  const CHANNEL_ID = '1501950829626921020'; // GAMEING  (other options: 1501950608704274634 = WTF, 1555024718057447495 = Streaming)
  const FALLBACK_INVITE = 'https://discord.com/invite/DcQK9m58';
  const REFRESH_MS = 20000;

  const st = document.createElement('style');
  st.textContent = `
  #view-lobby > .section-header-row { display: none !important; }
  #lobbyRoot { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .lby-hero-frame {
    flex: 1; position: relative; border-radius: 22px; padding: 24px 28px;
    display: flex; flex-direction: column;
    background: radial-gradient(ellipse 75% 65% at 50% 45%, rgba(190, 18, 60, 0.16) 0%, rgba(10, 10, 15, 0.65) 100%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.5);
    min-height: 0; overflow: hidden;
  }
  .lby-top-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-shrink: 0; }
  .lby-top-title h2 { font-family: var(--font-display); font-size: 22px; font-weight: 900; letter-spacing: 0.06em; color: #fff; }
  .lby-online { font-size: 12px; font-weight: 700; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; }
  .lby-dot { width: 8px; height: 8px; border-radius: 50%; background: #23a55a; display: inline-block; }
  .lby-card {
    flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 18px 20px;
    border: 1px solid rgba(225, 29, 72, 0.28); border-radius: 18px; background: rgba(14, 10, 18, 0.55);
  }
  .lby-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0; }
  .lby-ch { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 800; color: #fff; min-width: 0; }
  .lby-ch small { color: var(--text-secondary); font-weight: 700; font-size: 12px; }
  .lby-join {
    border: 0; cursor: pointer; padding: 9px 18px; border-radius: 10px; font-weight: 800; font-size: 13px; color: #fff;
    background: linear-gradient(135deg, var(--crimson-500), var(--crimson-600)); box-shadow: 0 0 18px var(--crimson-glow);
  }
  .lby-join:hover { filter: brightness(1.12); }
  .lby-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
  .lby-user { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 10px; }
  .lby-user:hover { background: rgba(255, 255, 255, 0.05); }
  .lby-av { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; background: #1b1b26; flex-shrink: 0; }
  .lby-name { font-size: 14px; font-weight: 700; color: #e8e8f2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lby-empty { margin: auto; text-align: center; color: var(--text-secondary); font-size: 13px; line-height: 1.6; padding: 24px; }
  .lby-empty b { display: block; color: #fff; font-size: 15px; margin-bottom: 4px; }`;
  document.head.appendChild(st);

  root.innerHTML = `
    <div class="lby-hero-frame">
      <span class="frame-corner tl"></span>
      <span class="frame-corner br"></span>
      <div class="lby-top-title">
        <h2><span style="color:var(--crimson-500); margin-right:6px;">/</span>Lobby</h2>
        <span class="lby-online" id="lbyOnline"></span>
      </div>
      <div class="lby-card" id="lbyCard"><div class="lby-empty">Loading…</div></div>
    </div>`;

  const card = root.querySelector('#lbyCard');
  const onlineEl = root.querySelector('#lbyOnline');
  let inviteUrl = FALLBACK_INVITE;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function openInvite() {
    try {
      if (window.inexAPI && window.inexAPI.openExternal) return window.inexAPI.openExternal(inviteUrl);
    } catch (e) { /* fall through */ }
    window.open(inviteUrl, '_blank');
  }

  function showMessage(title, sub) {
    card.innerHTML = '';
    const box = el('div', 'lby-empty');
    box.appendChild(el('b', null, title));
    box.appendChild(document.createTextNode(sub || ''));
    card.appendChild(box);
  }

  function render(data) {
    inviteUrl = data.instant_invite || FALLBACK_INVITE;
    const channels = Array.isArray(data.channels) ? data.channels : [];
    const members = Array.isArray(data.members) ? data.members : [];
    const ch = channels.find(c => String(c.id) === CHANNEL_ID);
    const inVoice = members.filter(m => String(m.channel_id || '') === CHANNEL_ID);

    onlineEl.innerHTML = '';
    onlineEl.appendChild(el('span', 'lby-dot'));
    onlineEl.appendChild(document.createTextNode(`${Number(data.presence_count) || 0} online • ${data.name || 'Discord'}`));

    card.innerHTML = '';
    const head = el('div', 'lby-card-head');
    const chName = el('div', 'lby-ch');
    chName.appendChild(el('span', null, '🔊 ' + (ch ? ch.name : 'Voice channel')));
    chName.appendChild(el('small', null, `${inVoice.length} in voice`));
    const join = el('button', 'lby-join', 'Join on Discord');
    join.type = 'button';
    join.addEventListener('click', openInvite);
    head.appendChild(chName);
    head.appendChild(join);
    card.appendChild(head);

    const list = el('div', 'lby-list');
    if (!ch) {
      list.appendChild(el('div', 'lby-empty', 'This voice channel is not visible in the widget (it must be visible to @everyone).'));
    } else if (!inVoice.length) {
      const box = el('div', 'lby-empty');
      box.appendChild(el('b', null, 'Nobody in voice right now'));
      box.appendChild(document.createTextNode('Be the first to join.'));
      list.appendChild(box);
    } else {
      inVoice.forEach(m => {
        const row = el('div', 'lby-user');
        const img = el('img', 'lby-av');
        img.src = m.avatar_url || '';
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        row.appendChild(img);
        row.appendChild(el('span', 'lby-name', m.username || 'User'));
        list.appendChild(row);
      });
    }
    card.appendChild(list);
  }

  let busy = false;
  let last = 0;
  async function load() {
    if (busy) return;
    busy = true;
    try {
      if (!window.inexAPI || !window.inexAPI.getDiscordWidget) throw new Error('bridge');
      const res = await window.inexAPI.getDiscordWidget();
      last = Date.now();
      if (res && res.ok) render(res.data);
      else if (res && res.error === 'disabled') showMessage('Widget is off', 'Enable it in Discord: Server Settings → Engagement → Server Widget.');
      else showMessage('Could not load Discord', 'Will retry shortly.');
    } catch (e) {
      showMessage('Could not load Discord', 'Check your internet connection.');
    } finally {
      busy = false;
    }
  }

  // Only fetch while the Lobby tab is visible.
  let wasVisible = false;
  setInterval(() => {
    const visible = root.offsetParent !== null;
    if (visible && (!wasVisible || Date.now() - last > REFRESH_MS)) load();
    wasVisible = visible;
  }, 2000);
})();
