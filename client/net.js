// Strikepoint client — WebSocket networking + input batching.
// Sends input at ~30Hz (batched), receives snapshots (~15Hz), applies interpolation.

export class Net {
  constructor(onMsg) {
    this.onMsg = onMsg;
    this.connected = false;
    this.id = null;
    this.pendingInput = { mx: 0, mz: 0, jump: false, fire: false, zoom: false, yaw: 0, pitch: 0, sprint: false, slide: false, crouch: false };
    this.queueTimer = null;
    this.ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    this.ws.onopen = () => { this.connected = true; };
    this.ws.onclose = () => { this.connected = false; this.onMsg({ t: 'disconnected' }); };
    this.ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') { this.id = m.id; this.onMsg(m); return; }
      this.onMsg(m);
    };
  }

  hello(name) { this.send({ t: 'hello', name, sk: localStorage.getItem('sp_skin') || 'default' }); }

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
    this.queueTimer = setInterval(() => {
      if (!this.connected) return;
      const i = this.pendingInput, l = this.lastSent;
      // only send when something changed (idle players cost ~nothing)
      if (i.mx !== l.mx || i.mz !== l.mz || i.jump !== l.jump || i.fire !== l.fire || i.zoom !== l.zoom || i.sprint !== l.sprint || i.slide !== l.slide || i.crouch !== l.crouch ||
          Math.abs(i.yaw - l.yaw) > 0.001 || Math.abs(i.pitch - l.pitch) > 0.001) {
        this.send({ t: 'action', a: { k: 'input', i } });
        this.lastSent = { ...i };
      }
    }, 33);
  }

  stopSending() {
    clearInterval(this.queueTimer);
    this.queueTimer = null;
  }

  send(obj) { if (this.connected && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
}
