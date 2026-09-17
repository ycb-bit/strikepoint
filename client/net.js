// Strikepoint client — WebSocket networking + input batching.
// Sends input at ~45Hz (batched, change-driven), receives snapshots (~15-20Hz).
// Robust for sleepy hosts (Render free tier): outbound messages sent while the
// socket is connecting are buffered and flushed on open; drops auto-reconnect
// with backoff and re-announce hello/queue so matchmaking can't get silently
// stuck when the connection blips mid-queue.

export class Net {
  constructor(onMsg) {
    this.onMsg = onMsg;
    this.connected = false;
    this.id = null;
    this.pendingInput = { mx: 0, mz: 0, jump: false, fire: false, zoom: false, yaw: 0, pitch: 0, sprint: false, slide: false, crouch: false };
    this.queueTimer = null;
    this.pingTimer = null;
    this.retries = 0;
    this.userClosed = false;
    this.pending = [];          // outbound buffer while the socket is connecting
    this.connect();
  }

  connect() {
    this.ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    this.ws.onopen = () => {
      const first = this.retries === 0;
      this.connected = true;
      this.retries = 0;
      // flush anything sent while connecting (queue/create/join can't be lost now)
      const p = this.pending; this.pending = [];
      for (const o of p) this.send(o);
      if (!first) this.onMsg({ t: 'ws-open' });   // reconnect: let the app resync
    };
    this.ws.onclose = () => {
      if (this.userClosed) return;
      this.connected = false;
      this.onMsg({ t: 'disconnected' });
      // auto-reconnect with backoff (500ms -> 5s)
      this.retries++;
      setTimeout(() => this.connect(), Math.min(5000, 400 * this.retries));
    };
    this.ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') { this.id = m.id; this.onMsg(m); return; }
      if (m.t === 'pong') { this.onPong(m.ts); return; }
      this.onMsg(m);
    };
  }

  hello(name) {
    let wf = 'stock', nc = 'none', of = 'assault';
    try {
      const p = JSON.parse(localStorage.getItem('sp_profile_v1') || '{}');
      wf = p.eqWeapon || 'stock'; nc = p.eqName || 'none'; of = p.eqOutfit || 'assault';
    } catch {}
    this.send({ t: 'hello', name, sk: localStorage.getItem('sp_skin') || 'default', wf, nc, of });
  }

  queue(on = true, pref) { this.send({ t: on ? 'queue' : 'unqueue', ...pref }); }
  createRoom(bots, map, mode, rules) { this.send({ t: 'create', bots, map, mode, rules }); }
  joinRoom(code) { this.send({ t: 'join', code }); }
  action(a) { this.send({ t: 'action', a }); }
  loadout(primary, secondary) { this.action({ k: 'loadout', primary, secondary }); }
  report(msg) { this.send({ t: 'report', msg }); }
  kick(id) { this.send({ t: 'kick', id }); }
  chat(text) { this.send({ t: 'action', a: { k: 'chat', text } }); }
  setReady(v) { this.send({ t: 'action', a: { k: 'ready', v: !!v } }); }
  listRooms() { this.send({ t: 'listRooms' }); }

  // batch local input; called every frame by the game loop
  pushInput(inp) { this.pendingInput = inp; }

  startSending() {
    if (this.queueTimer) return;
    this.lastSent = { mx: 9, mz: 9, jump: 9, fire: 9, zoom: 9, yaw: 9, pitch: 9, sprint: 9, slide: 9, crouch: 9 };
    // RTT probe: one tiny ping every 2s -> pong echo -> this.rtt (ms)
    this.pingTimer = setInterval(() => {
      if (!this.connected) return;
      this.send({ t: 'ping', ts: performance.now() });
    }, 2000);
    this.queueTimer = setInterval(() => {
      if (!this.connected) return;
      const i = this.pendingInput, l = this.lastSent;
      // only send when something changed (idle players cost ~nothing)
      if (i.mx !== l.mx || i.mz !== l.mz || i.jump !== l.jump || i.fire !== l.fire || i.zoom !== l.zoom || i.sprint !== l.sprint || i.slide !== l.slide || i.crouch !== l.crouch ||
          Math.abs(i.yaw - l.yaw) > 0.001 || Math.abs(i.pitch - l.pitch) > 0.001) {
        this.send({ t: 'action', a: { k: 'input', i } });
        this.lastSent = { ...i };
      }
    }, 22);
  }

  stopSending() {
    clearInterval(this.queueTimer);
    clearInterval(this.pingTimer);
    this.queueTimer = null;
    this.pingTimer = null;
  }

  onPong(ts) {
    if (typeof ts !== 'number' || !ts) return;
    this.rtt = Math.round(performance.now() - ts);
    if (this.onRtt) this.onRtt(this.rtt);
  }

  send(obj) {
    if (this.connected && this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
    else if (this.ws && this.ws.readyState === 0 && this.pending.length < 50) this.pending.push(obj);   // still connecting: buffer
    // readyState 3 (closed): drop — reconnect will resync
  }
}
