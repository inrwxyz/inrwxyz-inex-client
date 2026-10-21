/**
 * INEX CLIENT — P2P Link (WebRTC DataChannel) for Friend Server Access
 * Firebase is used ONLY for: the "open editor" request + the WebRTC handshake (offer / answer / ICE).
 * As soon as the DataChannel is open, every command / log / file goes directly peer-to-peer.
 * If the connection drops, only a new handshake goes through Firebase again (no new Allow prompt while the editor is open).
 *
 * window.inexP2P.connect(hostUid, serverId)   friend: ask host + open the P2P link
 * window.inexP2P.call(hostUid, method, args)  friend: run a command on the host over P2P
 * window.inexP2P.close(hostUid)               friend: close the editor link
 * window.inexP2P.onState(cb)                  cb({ hostUid, state })  state: connecting | open | reconnecting | closed
 * Host side is automatic (listens for the "p2p-expect" event from the main process).
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
  const POLL_MS = 600;
  const HANDSHAKE_MS = 25000;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const friendLinks = new Map(); // hostUid -> link   (I am the friend)
  const hostLinks = new Map();   // friendUid -> link (I am the host)
  const listeners = new Set();
  const emit = (hostUid, state) => listeners.forEach(cb => { try { cb({ hostUid, state }); } catch (_) {} });

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
    try { if (link.dc) { link.dc.onclose = null; link.dc.close(); } } catch (_) {}
    try { if (link.pc) { link.pc.onconnectionstatechange = null; link.pc.close(); } } catch (_) {}
    link.pending.forEach(p => { clearTimeout(p.timer); p.reject(new Error('P2P link closed.')); });
    link.pending.clear();
  }

  /* ================= FRIEND SIDE ================= */
  async function handshakeAsFriend(link) {
    const hostUid = link.uid;
    const pc = newPc(link, c => { api.p2pSignalSend('friend', hostUid, JSON.stringify({ k: 'ice', c })).catch(() => {}); });
    const dc = pc.createDataChannel('inex', { ordered: true });
    link.dc = dc;
    let opened = false;
    const openP = new Promise((resolve, reject) => {
      dc.onopen = () => { opened = true; resolve(); };
      link.failOpen = reject;
    });
    dc.onmessage = e => onRaw(link, e.data, msg => handleFriendMsg(link, msg));
    dc.onclose = () => { if (!link.dead) linkLost(link); };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState) && !link.dead) linkLost(link);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await api.p2pSignalSend('friend', hostUid, JSON.stringify({ k: 'offer', sdp: pc.localDescription.sdp }));

    const deadline = Date.now() + HANDSHAKE_MS;
    while (!opened && !link.dead && Date.now() < deadline) {
      let list = [];
      try { list = await api.p2pSignalPoll('friend', hostUid); } catch (_) {}
      for (const raw of list) {
        let m; try { m = JSON.parse(raw); } catch (_) { continue; }
        if (m.k === 'answer' && !link.remoteSet) {
          await pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
          await flushIce(link);
        } else if (m.k === 'ice' && m.c) await addIce(link, m.c);
      }
      if (opened) break;
      await Promise.race([openP.catch(() => {}), sleep(POLL_MS)]);
    }
    if (!opened) throw new Error('Could not open a direct P2P connection to the host (network blocked?).');
  }

  function handleFriendMsg(link, msg) {
    if (msg && msg.t === 'res') {
      const p = link.pending.get(msg.id);
      if (!p) return;
      link.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.d === undefined ? null : msg.d);
      else p.reject(new Error(msg.e || 'Host rejected the request.'));
    }
  }

  async function linkLost(link) {
    if (link.dead || link.lost) return;
    link.lost = true;
    link.pending.forEach(p => { clearTimeout(p.timer); p.reject(new Error('P2P connection lost.')); });
    link.pending.clear();
    if (!link.keep) { emit(link.uid, 'closed'); return; }
    emit(link.uid, 'reconnecting');
    // Firebase is used again ONLY for a fresh handshake (host auto-accepts while the editor stays open).
    for (let attempt = 0; attempt < 4 && !link.dead && link.keep; attempt++) {
      try {
        await sleep(1200 * (attempt + 1));
        if (link.dead) return;
        try { link.dc && (link.dc.onclose = null); link.pc && link.pc.close(); } catch (_) {}
        link.lost = false;
        await api.p2pRequest(link.uid, link.serverId, true);
        await handshakeAsFriend(link);
        emit(link.uid, 'open');
        return;
      } catch (_) { link.lost = true; }
    }
    if (!link.dead) { link.lost = true; emit(link.uid, 'closed'); }
  }

  async function connect(hostUid, serverId) {
    const old = friendLinks.get(hostUid);
    if (old) { old.keep = false; destroy(old); friendLinks.delete(hostUid); }
    const link = { uid: hostUid, serverId, pending: new Map(), buf: new Map(), keep: true, dead: false, lost: false };
    friendLinks.set(hostUid, link);
    emit(hostUid, 'connecting');
    try {
      await api.p2pRequest(hostUid, serverId, false);      // Firebase: request -> host sees Allow / Deny
      await handshakeAsFriend(link);                       // Firebase: offer / answer / ICE only
      emit(hostUid, 'open');
      return true;
    } catch (e) {
      link.keep = false;
      destroy(link);
      friendLinks.delete(hostUid);
      api.p2pEnd('friend', hostUid).catch(() => {});
      emit(hostUid, 'closed');
      throw e;
    }
  }

  function call(hostUid, method, args) {
    const link = friendLinks.get(hostUid);
    if (!link || link.dead || !link.dc || link.dc.readyState !== 'open') {
      return Promise.reject(new Error(link && link.keep ? 'Reconnecting to the host… try again in a moment.' : 'Not connected to the host.'));
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

  async function close(hostUid) {
    const link = friendLinks.get(hostUid);
    if (!link) return;
    link.keep = false;
    try { await sendMsg(link, { t: 'bye' }); } catch (_) {}
    destroy(link);
    friendLinks.delete(hostUid);
    api.p2pEnd('friend', hostUid).catch(() => {});
    emit(hostUid, 'closed');
  }

  /* ================= HOST SIDE ================= */
  async function acceptFromFriend(friendUid) {
    const old = hostLinks.get(friendUid);
    if (old) { destroy(old); hostLinks.delete(friendUid); }
    const link = { uid: friendUid, pending: new Map(), buf: new Map(), dead: false };
    hostLinks.set(friendUid, link);
    const pc = newPc(link, c => { api.p2pSignalSend('host', friendUid, JSON.stringify({ k: 'ice', c })).catch(() => {}); });
    let opened = false;
    pc.ondatachannel = e => {
      const dc = e.channel;
      link.dc = dc;
      dc.onopen = () => { opened = true; };
      dc.onmessage = ev => onRaw(link, ev.data, msg => handleHostMsg(link, msg));
      dc.onclose = () => { if (!link.dead) { destroy(link); if (hostLinks.get(friendUid) === link) hostLinks.delete(friendUid); } };
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState) && !link.dead) {
        destroy(link); if (hostLinks.get(friendUid) === link) hostLinks.delete(friendUid);
      }
    };
    const deadline = Date.now() + HANDSHAKE_MS + 10000;
    while (!opened && !link.dead && Date.now() < deadline) {
      let list = [];
      try { list = await api.p2pSignalPoll('host', friendUid); } catch (_) {}
      for (const raw of list) {
        let m; try { m = JSON.parse(raw); } catch (_) { continue; }
        if (m.k === 'offer' && !link.remoteSet) {
          await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
          await flushIce(link);
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          await api.p2pSignalSend('host', friendUid, JSON.stringify({ k: 'answer', sdp: pc.localDescription.sdp }));
        } else if (m.k === 'ice' && m.c) await addIce(link, m.c);
      }
      if (opened) break;
      await sleep(POLL_MS);
    }
    if (!opened && !link.dead) { destroy(link); if (hostLinks.get(friendUid) === link) hostLinks.delete(friendUid); }
  }

  async function handleHostMsg(link, msg) {
    if (!msg) return;
    if (msg.t === 'bye') {
      api.p2pEnd('host', link.uid).catch(() => {});
      destroy(link);
      if (hostLinks.get(link.uid) === link) hostLinks.delete(link.uid);
      return;
    }
    if (msg.t !== 'req') return;
    let out;
    try {
      // Permission check (approved session + this server + allowed method) happens in the main process.
      const data = await api.p2pExec(link.uid, msg.m, msg.a);
      out = { t: 'res', id: msg.id, ok: true, d: data === undefined ? null : data };
    } catch (e) {
      const m = String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      out = { t: 'res', id: msg.id, ok: false, e: m.slice(0, 300) };
    }
    try { await sendMsg(link, out); } catch (_) {}
  }

  if (api.onP2PExpect) api.onP2PExpect(d => { if (d && d.friendUid) acceptFromFriend(d.friendUid).catch(() => {}); });
  if (api.onP2PKick) api.onP2PKick(d => {
    const l = d && hostLinks.get(d.friendUid);
    if (l) { destroy(l); hostLinks.delete(d.friendUid); }
  });
  window.addEventListener('beforeunload', () => {
    friendLinks.forEach(l => { l.keep = false; try { sendMsg(l, { t: 'bye' }); } catch (_) {} });
  });

  window.inexP2P = {
    connect,
    call,
    close,
    isOpen: hostUid => { const l = friendLinks.get(hostUid); return Boolean(l && l.dc && l.dc.readyState === 'open'); },
    onState: cb => { listeners.add(cb); return () => listeners.delete(cb); }
  };
})();
