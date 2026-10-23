/**
 * INEX CLIENT — P2P Link (WebRTC DataChannel) for one-time-code Server Access
 * Firebase is used ONLY for the WebRTC handshake (offer / answer / ICE) under sessions/{CODE}.
 * As soon as the DataChannel is open, every command / log / file goes directly peer-to-peer.
 *
 * window.inexP2P.connect(code)          joiner: use the code + open the P2P link (one attempt at a time)
 * window.inexP2P.call(code, method, a)  joiner: run a command on the host over P2P
 * window.inexP2P.close(code)            joiner: close the editor link
 * window.inexP2P.onState(cb)            cb({ hostUid: code, state })  state: connecting | open | closed
 * Host side is automatic (listens for the "p2p-expect" event when the host generates a code).
 */
(function () {
  'use strict';
  const api = window.inexAPI || {};
  const RTC_CFG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };
  const CHUNK = 12000;
  const CALL_TIMEOUT_MS = 20000;
  const POLL_MS = 600;            // while a handshake is running
  const WAIT_POLL_MS = 1000;      // host waiting for somebody to use the code
  const HANDSHAKE_MS = 25000;
  const DISCONNECT_GRACE_MS = 12000;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rid = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toLowerCase();
  const normCode = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const friendLinks = new Map(); // code -> link   (I joined with a code)
  const hostLinks = new Map();   // code -> link   (my own code)
  const listeners = new Set();
  const emit = (code, state) => listeners.forEach(cb => { try { cb({ hostUid: code, state }); } catch (_) {} });
  let connecting = false;

  /* ---------- framing: JSON message -> chunks -> JSON message ---------- */
  async function sendMsg(link, obj) {
    const dc = link.dc;
    if (!dc || dc.readyState !== 'open') throw new Error('P2P link is not open.');
    const json = JSON.stringify(obj);
    const id = rid();
    const n = Math.max(1, Math.ceil(json.length / CHUNK));
    for (let i = 0; i < n; i++) {
      while (dc.bufferedAmount > 1024 * 1024) {
        if (dc.readyState !== 'open') throw new Error('P2P link closed.');
        await sleep(15);
      }
      dc.send(JSON.stringify({ i: id, n, s: i, d: json.slice(i * CHUNK, (i + 1) * CHUNK) }));
    }
  }

  function onRaw(link, raw, handler) {
    let f;
    try { f = JSON.parse(raw); } catch (_) { return; }
    if (!f || typeof f.i !== 'string') return;
    let b = link.buf.get(f.i);
    if (!b) { b = { n: f.n, parts: [], got: 0 }; link.buf.set(f.i, b); }
    if (b.parts[f.s] === undefined) { b.parts[f.s] = f.d; b.got++; }
    if (b.got >= b.n) {
      link.buf.delete(f.i);
      let msg;
      try { msg = JSON.parse(b.parts.join('')); } catch (_) { return; }
      handler(msg);
    }
  }

  function newPc(link, onIce) {
    const pc = new RTCPeerConnection(RTC_CFG);
    link.pc = pc;
    link.pendingIce = [];
    link.remoteSet = false;
    pc.onicecandidate = e => { if (e.candidate) onIce(e.candidate.toJSON ? e.candidate.toJSON() : e.candidate); };
    return pc;
  }

  async function addIce(link, cand) {
    if (!link.remoteSet) { link.pendingIce.push(cand); return; }
    try { await link.pc.addIceCandidate(cand); } catch (_) {}
  }
  async function flushIce(link) {
    link.remoteSet = true;
    const list = link.pendingIce.splice(0);
    for (const c of list) { try { await link.pc.addIceCandidate(c); } catch (_) {} }
  }

  function destroy(link) {
    link.dead = true;
    if (link.discTimer) { clearTimeout(link.discTimer); link.discTimer = null; }
    try { if (link.dc) { link.dc.onclose = null; link.dc.close(); } } catch (_) {}
    try { if (link.pc) { link.pc.onconnectionstatechange = null; link.pc.close(); } } catch (_) {}
    link.pending.forEach(p => { clearTimeout(p.timer); p.reject(new Error('P2P link closed.')); });
    link.pending.clear();
  }

  /* ================= JOINER SIDE (uses a code) ================= */
  async function handshakeAsJoiner(link) {
    const { code, sid } = link;
    const pc = newPc(link, c => { api.p2pSignalSend('friend', code, sid, JSON.stringify({ k: 'ice', c })).catch(() => {}); });
    const dc = pc.createDataChannel('inex', { ordered: true });
    link.dc = dc;
    let opened = false;
    const openP = new Promise(resolve => { dc.onopen = () => { opened = true; resolve(); }; });
    dc.onmessage = e => onRaw(link, e.data, msg => handleJoinerMsg(link, msg));
    dc.onclose = () => { if (!link.dead) linkLost(link); };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState) && !link.dead) linkLost(link);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await api.p2pSignalSend('friend', code, sid, JSON.stringify({ k: 'offer', sdp: pc.localDescription.sdp }));

    const deadline = Date.now() + HANDSHAKE_MS;
    while (!opened && !link.dead && Date.now() < deadline) {
      let list = [];
      try { list = await api.p2pSignalPoll('friend', code, sid); } catch (_) {}
      for (const it of list) {
        let m; try { m = JSON.parse(it.d); } catch (_) { continue; }
        if (m.k === 'busy') throw new Error('Someone else used this code first. Ask the host for a new code.');
        if (m.k === 'answer' && !link.remoteSet) {
          await pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
          await flushIce(link);
        } else if (m.k === 'ice' && m.c) await addIce(link, m.c);
      }
      if (opened) break;
      await Promise.race([openP, sleep(POLL_MS)]);
    }
    if (!opened) throw new Error('Could not connect. The code may be used or expired, or the host is offline / network blocked.');
  }

  function handleJoinerMsg(link, msg) {
    if (!msg) return;
    if (msg.t === 'bye') { // host disconnected us
      link.keep = false;
      linkLost(link);
      return;
    }
    if (msg.t === 'res') {
      const p = link.pending.get(msg.id);
      if (!p) return;
      link.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.d === undefined ? null : msg.d);
      else p.reject(new Error(msg.e || 'Host rejected the request.'));
    }
  }

  // A code is one-time: when the link drops there is NO silent reconnect. Ask the host for a new code.
  function linkLost(link) {
    if (link.lost) return;
    link.lost = true;
    link.pending.forEach(p => { clearTimeout(p.timer); p.reject(new Error('P2P connection lost.')); });
    link.pending.clear();
    emit(link.code, 'closed');
  }

  async function connect(codeIn) {
    if (connecting) throw new Error('Already connecting. Please wait.');
    const code = normCode(codeIn);
    connecting = true;
    let link = null;
    try {
      const old = friendLinks.get(code);
      if (old && !old.dead && !old.lost && old.dc && old.dc.readyState === 'open') throw new Error('You are already connected with this code.');
      if (old) { destroy(old); friendLinks.delete(code); }
      emit(code, 'connecting');
      await api.accessCheck(code); // throws a friendly error if the code is wrong / used / expired
      link = { code, sid: rid(), pending: new Map(), buf: new Map(), dead: false, lost: false };
      friendLinks.set(code, link);
      await handshakeAsJoiner(link);
      emit(code, 'open');
      return true;
    } catch (e) {
      if (link) {
        destroy(link);
        friendLinks.delete(code);
        api.p2pEnd('friend', code, link.sid).catch(() => {});
      }
      emit(code, 'closed');
      throw e;
    } finally {
      connecting = false;
    }
  }

  function call(code, method, args) {
    const link = friendLinks.get(code);
    if (!link || link.dead || link.lost || !link.dc || link.dc.readyState !== 'open') {
      return Promise.reject(new Error('Not connected to the host.'));
    }
    return new Promise((resolve, reject) => {
      const id = rid();
      const timer = setTimeout(() => { link.pending.delete(id); reject(new Error('Host did not answer in time.')); }, CALL_TIMEOUT_MS);
      link.pending.set(id, { resolve, reject, timer });
      sendMsg(link, { t: 'req', id, m: String(method), a: Array.isArray(args) ? args : [] }).catch(err => {
        link.pending.delete(id); clearTimeout(timer); reject(err);
      });
    });
  }

  async function close(code) {
    const link = friendLinks.get(code);
    if (!link) return;
    try { await sendMsg(link, { t: 'bye' }); } catch (_) {}
    destroy(link);
    friendLinks.delete(code);
    api.p2pEnd('friend', code, link.sid).catch(() => {});
    emit(code, 'closed');
  }

  /* ================= HOST SIDE (my own code) ================= */
  function hostGone(code, link) {
    if (link.dead) return;
    destroy(link);
    if (hostLinks.get(code) === link) hostLinks.delete(code);
    api.p2pHostClosed(code).catch(() => {});   // frees the "someone is connected" lock
  }

  async function waitForJoiner(code, exp) {
    const old = hostLinks.get(code);
    if (old) { destroy(old); hostLinks.delete(code); }
    const link = { uid: code, pending: new Map(), buf: new Map(), dead: false, sid: null };
    hostLinks.set(code, link);
    let locked = null;
    let lockedAt = 0;
    let opened = false;
    const early = new Map(); // sid -> [ice] that arrived before the offer
    const busySent = new Set();

    const pc = newPc(link, c => {
      if (link.sid) api.p2pSignalSend('host', code, link.sid, JSON.stringify({ k: 'ice', c })).catch(() => {});
    });
    pc.ondatachannel = e => {
      const dc = e.channel;
      link.dc = dc;
      dc.onopen = () => { opened = true; api.p2pHostOpened(code).catch(() => {}); };
      dc.onmessage = ev => onRaw(link, ev.data, msg => handleHostMsg(code, link, msg));
      dc.onclose = () => hostGone(code, link);
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (['failed', 'closed'].includes(st)) { hostGone(code, link); return; }
      if (st === 'disconnected') {
        if (!link.discTimer) link.discTimer = setTimeout(() => { if (pc.connectionState === 'disconnected') hostGone(code, link); }, DISCONNECT_GRACE_MS);
      } else if (link.discTimer) { clearTimeout(link.discTimer); link.discTimer = null; }
    };

    while (!link.dead && !opened) {
      const now = Date.now();
      if (!locked && exp && now > exp + 3000) break;                          // code expired unused
      if (locked && now > lockedAt + HANDSHAKE_MS + 10000) break;             // joiner never finished
      let list = [];
      try { list = await api.p2pSignalPoll('host', code, null); } catch (_) {}
      for (const it of list) {
        if (link.dead) break;
        let m; try { m = JSON.parse(it.d); } catch (_) { continue; }
        if (!locked) {
          if (m.k === 'offer') {
            try { await api.p2pClaim(code, it.sid); } catch (_) { link.dead = true; break; } // first offer wins; code dies now
            locked = it.sid; link.sid = it.sid; lockedAt = Date.now();
            (early.get(it.sid) || []).forEach(c => link.pendingIce.push(c));
            await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
            await flushIce(link);
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            await api.p2pSignalSend('host', code, link.sid, JSON.stringify({ k: 'answer', sdp: pc.localDescription.sdp }));
          } else if (m.k === 'ice' && m.c) {
            if (!early.has(it.sid)) early.set(it.sid, []);
            early.get(it.sid).push(m.c);
          }
        } else if (it.sid === locked && m.k === 'ice' && m.c) {
          await addIce(link, m.c);
        } else if (it.sid !== locked && m.k === 'offer' && !busySent.has(it.sid)) {
          busySent.add(it.sid); // somebody else was too late: tell them right away instead of letting them wait
          api.p2pSignalSend('host', code, it.sid, '{"k":"busy"}').catch(() => {});
        }
      }
      if (link.dead || opened) break;
      await sleep(locked ? POLL_MS : WAIT_POLL_MS);
    }
    if (!opened && !link.dead) {
      destroy(link);
      if (hostLinks.get(code) === link) hostLinks.delete(code);
      if (locked) api.p2pHostClosed(code).catch(() => {});
    }
  }

  async function handleHostMsg(code, link, msg) {
    if (!msg) return;
    if (msg.t === 'bye') { hostGone(code, link); return; }
    if (msg.t !== 'req') return;
    let out;
    try {
      // Permission check (active session + this server + allowed method) happens in the main process.
      const data = await api.p2pExec(code, msg.m, msg.a);
      out = { t: 'res', id: msg.id, ok: true, d: data === undefined ? null : data };
    } catch (e) {
      const m = String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      out = { t: 'res', id: msg.id, ok: false, e: m.slice(0, 300) };
    }
    try { await sendMsg(link, out); } catch (_) {}
  }

  if (api.onP2PExpect) api.onP2PExpect(d => { if (d && d.code) waitForJoiner(d.code, d.exp).catch(() => {}); });
  if (api.onP2PKick) api.onP2PKick(async d => {
    const l = d && hostLinks.get(d.code);
    if (!l) return;
    hostLinks.delete(d.code);
    try { await sendMsg(l, { t: 'bye' }); await sleep(150); } catch (_) {}
    destroy(l);
  });
  window.addEventListener('beforeunload', () => {
    friendLinks.forEach(l => { try { sendMsg(l, { t: 'bye' }); } catch (_) {} });
  });

  window.inexP2P = {
    connect,
    call,
    close,
    isOpen: code => { const l = friendLinks.get(code); return Boolean(l && l.dc && l.dc.readyState === 'open'); },
    onState: cb => { listeners.add(cb); return () => listeners.delete(cb); }
  };
})();
