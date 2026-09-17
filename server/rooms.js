// Strikepoint — rooms & matchmaking.
// Public queue: waiting humans form a match (bots fill empty slots up to 10).
// Custom rooms: join codes, humans only (owner chooses bot count).
// A Room owns one game instance, its tick loop, and its WebSocket broadcast.

import { createGame, addPlayer, removePlayer, startMatch, tick, applyInput, buyWeapon, tryPlant, tryDefuse, stopActivity, startReload, setLoadout } from '../shared/sim.js';
import { botTick, clearBotState, botName } from './bots.js';
import { MAX_PLAYERS, TICK_MS, SNAPSHOT_MS, TEAM, GAME_MODES } from '../shared/constants.js';
import { MAP_NAMES } from '../shared/map.js';

const rooms = new Map();        // code -> Room
const queue = new Set();        // client handlers waiting for a public match
let nextRoomNum = 1;

const BOT_FILL_TARGET = 10;     // humans + bots per public match

function ammoText(p) {
  const wName = p.weapons.primary || p.weapons.secondary || 'knife';
  const am = p.ammo[wName];
  return am ? `${am.mag}/${am.reserve}` : '';
}

// cheap stable string hash (bot outfit variety)
function hashId(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function makeCode() {
  let c;
  do { c = String(1000 + Math.floor(Math.random() * 9000)); } while (rooms.has(c));
  return c;
}

function newGame(room) {
  const rules = room.rules || {};
  const g = createGame(room.mapName, room.seed, room.mode, rules);
  g.room = room;
  return g;
}

function balanceTeams(humanIds) {
  // alternate assignment, T first
  return humanIds.map((id, i) => (i % 2 === 0 ? TEAM.T : TEAM.CT));
}

export class Room {
  constructor({ code, kind, owner, botCount, mapName, mode, rules, onEmpty }) {
    this.eventQueue = [];
    this.mapName = mapName || null; // null = random pick
    this.mode = GAME_MODES.includes(mode) ? mode : 'defuse';
    this.rules = rules && typeof rules === 'object' ? {
      killLimit: Math.max(5, Math.min(200, (rules.killLimit | 0) || 0)) || undefined,
      roundTime: Math.max(60, Math.min(1800, (rules.roundTime | 0) || 0)) || undefined,
      respawnTime: Math.max(1, Math.min(15, (rules.respawnTime | 0) || 0)) || undefined,
      friendlyFire: !!rules.friendlyFire,
    } : null;
    this.code = code;
    this.kind = kind;              // 'public' | 'custom'
    this.owner = owner;            // client id (custom)
    this.botCount = botCount || 0; // custom rooms: explicit bots
    this.onEmpty = onEmpty || (() => {});
    this.seed = 1337 + nextRoomNum;
    this.clients = new Map();      // clientId -> { send(obj), name }
    this.game = newGame(this);
    this.timer = null;
    this.lastTick = Date.now();
    this.nextSnap = 0;
    this.botIds = [];
    this.matchStarted = false;
    this.destroyed = false;
  }

  humanCount() { return this.clients.size; }

  ensureBots() {
    const g = this.game;
    const counts = () => {
      const c = [0, 0];
      for (const p of g.players.values()) c[p.team]++;
      return c;
    };
    if (this.kind === 'public') {
      const target = Math.max(BOT_FILL_TARGET, this.clients.size + (this.clients.size % 2));
      const want = Math.min(target, MAX_PLAYERS);
      let i = this.botIds.length;
      while (g.players.size < want) {
        const c = counts();
        const team = c[TEAM.T] <= c[TEAM.CT] ? TEAM.T : TEAM.CT;
        const id = 'bot#' + this.code + '#' + (++i);
        addPlayer(g, id, botName(i), { bot: true, team });
        this.botIds.push(id);
      }
    } else {
      // custom: top up to owner-chosen bot count, spread across teams
      let i = this.botIds.length;
      while (this.botIds.length < this.botCount && g.players.size < MAX_PLAYERS) {
        const c = counts();
        const team = c[TEAM.T] <= c[TEAM.CT] ? TEAM.T : TEAM.CT;
        const id = 'bot#' + this.code + '#' + (++i);
        addPlayer(g, id, botName(i), { bot: true, team });
        this.botIds.push(id);
      }
    }
  }

  rebalanceToBots() {
    // when humans leave a public match, shrink bot team sizes to keep it sane
    const g = this.game;
    if (this.kind !== 'public') return;
    const humans = this.clients.size;
    if (humans === 0) return;
    // keep bots that are on teams, drop excess bots (prefer dropping from the bigger team)
    const totalWant = Math.max(humans + 2, BOT_FILL_TARGET);
    const excess = g.players.size - totalWant;
    if (excess <= 0) return;
    const counts = [0, 0];
    for (const p of g.players.values()) counts[p.team]++;
    const bots = [...g.players.values()].filter(p => p.bot);
    // sort bots by team size desc so we remove from the bigger side
    bots.sort((a, b) => counts[b.team] - counts[a.team]);
    for (let i = 0; i < excess && i < bots.length; i++) {
      const b = bots[i];
      removePlayer(g, b.id);
      clearBotState(b.id);
      this.botIds = this.botIds.filter(id => id !== b.id);
      counts[b.team]--;
    }
  }

  addHuman(client, name) {
    const clientId = client.id;
    this.clients.set(clientId, { send: client.send, sendRaw: client.sendRaw, name: name || client.name || 'Player', raw: client, skin: client.skin || 'default', wfin: client.wfin || 'stock', ncolor: client.ncolor || 'none', outfit: client.outfit || 'assault' });
    const g = this.game;
    // reconnect: if the sim still holds this player (seat held after a drop),
    // the same client id resumes it — clear the pending removal timer
    if (this.seatTimers && this.seatTimers.has(clientId)) {
      clearTimeout(this.seatTimers.get(clientId));
      this.seatTimers.delete(clientId);
      this.broadcast({ t: 'note', text: `${name || 'Player'} reconnected` });
    }
    if (!g.players.has(clientId)) {
      // pick the team with fewer players (prefer non-full)
      const counts = [0, 0];
      for (const p of g.players.values()) counts[p.team]++;
      const team = counts[TEAM.T] <= counts[TEAM.CT] ? TEAM.T : TEAM.CT;
      addPlayer(g, clientId, name || 'Player', { team });
    }
    this.ensureBots();
    this.rebalanceToBots(); // a join may have overshot the bot-fill target
    if (!this.matchStarted) {
      this.matchStarted = true;
      startMatch(g);
    }
    this.startLoop();
    // tell the client which room + their id (custom-room creator gets host powers)
    client.send({ t: 'joined', room: this.code, kind: this.kind, id: clientId, host: this.kind === 'custom' && this.owner === clientId });
    this.broadcastState();
  }

  // cosmetic re-announce (hello after an equip): nudge the next snapshot + chat ping
  announceCosmetics(clientId) {
    const c = this.clients.get(clientId);
    if (!c) return;
    this.nextSnap = 0;   // broadcast immediately with fresh wf/nc/of fields
  }

  // keep a disconnected human's slot (and body) for `ms` so a refresh can resume
  holdSeat(clientId, ms) {
    this.clients.delete(clientId);
    this.seatTimers = this.seatTimers || new Map();
    const g = this.game;
    if (!g.players.has(clientId)) return;
    const t = setTimeout(() => {
      this.seatTimers.delete(clientId);
      const p = g.players.get(clientId);
      if (p) { removePlayer(g, clientId); clearBotState(clientId); }
      this.rebalanceToBots();
      if (this.clients.size === 0) {
        if (this.kind === 'custom') {
          clearTimeout(this.closeTimer);
          this.closeTimer = setTimeout(() => this.destroy(), 60_000);
        } else this.destroy();
      } else this.broadcast({ t: 'note', text: 'A player left the match' });
    }, ms);
    this.seatTimers.set(clientId, t);
  }

  removeHuman(clientId) {
    this.clients.delete(clientId);
    const g = this.game;
    if (g.players.has(clientId)) {
      removePlayer(g, clientId);
      clearBotState(clientId);
    }
    this.rebalanceToBots();
    if (this.clients.size === 0) {
      if (this.kind === 'custom') {
        // keep custom rooms alive briefly for reconnects, then close
        clearTimeout(this.closeTimer);
        this.closeTimer = setTimeout(() => this.destroy(), 60_000);
      } else {
        this.destroy();
      }
    }
  }

  startLoop() {
    if (this.timer || this.destroyed) return;
    this.lastTick = Date.now();
    this.timer = setInterval(() => this.step(), TICK_MS);
  }

  step() {
    const g = this.game;
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;

    // bots
    for (const id of this.botIds) {
      const p = g.players.get(id);
      if (p && p.bot) botTick(g, p, dt);
    }
    this.applyHumanInputs(dt);
    tick(g, dt);
    // drain combat events AFTER tick (they're generated before/inside it)
    if (g.roundEvents.length) {
      this.eventQueue.push(...g.roundEvents);
      g.roundEvents.length = 0;
      if (this.eventQueue.length > 60) this.eventQueue.splice(0, this.eventQueue.length - 60);
    }

    // snapshot at SNAPSHOT_MS
    if (now >= this.nextSnap) {
      this.nextSnap = now + SNAPSHOT_MS;
      this.broadcastState();
    }
    if (g.phase === 'matchEnd' && now >= g.phaseEndsAt + 4000) {
      // restart a fresh match for whoever is still here
      startMatch(g);
    }
  }

  stateMsg(forId) {
    const g = this.game;
    const now = Date.now();
    void now; void forId; // (kept for per-player views later)
    const players = [];
    for (const p of g.players.values()) {
      players.push({
        id: p.id, n: p.name, b: p.bot ? 1 : 0, tm: p.team,
        x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
        ya: +p.yaw.toFixed(3), pi: +p.pitch.toFixed(3),
        hp: p.hp, ar: p.armor, k: p.kills, d: p.deaths, m: p.money,
        st: Math.round(p.stamina || 0), cr: p.crouching ? 1 : 0, sp: p.input && p.input.sprint ? 1 : 0,
        sk: !p.bot ? (this.clients.get(p.id)?.skin || 'default') : 'default',
        wf: !p.bot ? (this.clients.get(p.id)?.wfin || 'stock') : 'stock',
        nc: !p.bot ? (this.clients.get(p.id)?.ncolor || 'none') : 'none',
        of: !p.bot ? (this.clients.get(p.id)?.outfit || 'assault')
          : ['assault', 'scout', 'sas', 'ghost', 'raptor'][Math.abs(hashId(p.id)) % 5],   // bots wear varied gear
        al: p.alive ? 1 : 0, w: p.weapons.primary || p.weapons.secondary || 'knife',
        pw: p.weapons.primary || null, sw: p.weapons.secondary || null,
        am: ammoText(p),
        act: p.activity ? p.activity.type : null,
        sl: p.slideT > 0 ? 1 : 0,
      });
    }
    const msg = {
      t: 'state',
      sd: this.seed,
      mn: this.game.map.name,
      mo: g.mode,
      ph: g.phase, pe: g.phaseEndsAt, rd: g.round, sc: g.score,
      bc: g.bombCarrier, bp: g.bombPos ? { x: g.bombPos.x, z: g.bombPos.z } : null,
      db: g.droppedBombPos || null,
      bt: g.phase === 'planted' ? +g.bombTimer.toFixed(1) : null,
      pp: g.plantProgress, dp: g.defuseProgress,
      wi: g.winner, wn: g.winnerName || null,
      rules: this.rules || null,
      now: now,
      ps: players,
      ev: this.drainEvents(),
    };
    return msg;
  }

  drainEvents() {
    const out = this.eventQueue;
    this.eventQueue = [];
    return out;
  }

  broadcastState() {
    if (this.clients.size === 0) return;
    // one serialization for everyone
    const msg = JSON.stringify(this.stateMsg());
    for (const c of this.clients.values()) { try { c.sendRaw(msg); } catch {} }
  }

  broadcast(obj) {
    const msg = JSON.stringify(obj);
    for (const c of this.clients.values()) { try { c.sendRaw(msg); } catch {} }
  }

  kick(ownerId, targetId) {
    if (this.kind !== 'custom' || this.owner !== ownerId) return { ok: false };
    const rec = this.clients.get(targetId);
    if (!rec) return { ok: false };
    this.clients.delete(targetId);
    try { rec.raw.send({ t: 'kicked' }); } catch {}
    try { rec.raw.ws.close(); } catch {}
    this.removeHuman(targetId);
    this.broadcast({ t: 'note', text: `${rec.name} was kicked by the host` });
    return { ok: true };
  }

  handleAction(clientId, a) {
    const g = this.game;
    const p = g.players.get(clientId);
    if (!p) return;
    switch (a.k) {
      case 'buy': buyWeapon(g, p, a.w); break;
      case 'plant': tryPlant(g, p); break;
      case 'defuse': tryDefuse(g, p); break;
      case 'stopAct': stopActivity(g, p); break;
      case 'reload': startReload(g, p); break;
      case 'slot':
        if (['primary', 'secondary', 'melee'].includes(a.s)) p.slotPref = a.s;
        break;
      case 'input':
        // store latest input; applied on tick
        p.netInput = a.i;
        break;
      case 'loadout':
        setLoadout(g, p, a.primary, a.secondary);
        break;
      case 'report':
        console.log(`[report] room ${this.code} player ${clientId} (${p.name}): ${String(a.msg || '').slice(0, 300)}`);
        break;
      case 'emote':
        // gesture broadcast: wave / point / salute / thumbs / taunt
        if (['wave', 'point', 'salute', 'thumbs', 'taunt'].includes(a.e) && p.alive) {
          g.roundEvents.push({ type: 'emote', by: clientId, e: a.e, x: p.x, z: p.z });
        }
        break;
      case 'chat': {
        const text = String(a.text || '').slice(0, 200).replace(/[<>]/g, '');
        if (text.trim()) this.broadcast({ t: 'chat', from: p.name, text, sys: false });
        break;
      }
      case 'ready':
        if (this.kind === 'custom') {
          this.ready = this.ready || new Map();
          if (a.v) this.ready.set(clientId, true); else this.ready.delete(clientId);
          this.broadcast({ t: 'lobby', code: this.code, host: this.owner,
            players: [...this.clients.values()].map(c => ({
              id: c.id, name: c.name, bot: false, team: this.game.players.get(c.id)?.team ?? 0,
              ready: this.ready.has(c.id) ? 1 : 0,
              k: this.game.players.get(c.id)?.kills || 0, d: this.game.players.get(c.id)?.deaths || 0,
            })),
            bots: this.botIds.length, mapName: this.mapName, mode: this.mode });
        }
        break;
    }
  }

  applyHumanInputs(dt) {
    const g = this.game;
    for (const [cid, c] of this.clients) {
      const p = g.players.get(cid);
      if (!p) continue;
      if (p.netInput) applyInput(g, p, p.netInput, dt);
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    clearInterval(this.timer);
    this.timer = null;
    clearTimeout(this.closeTimer);
    if (this.seatTimers) for (const t of this.seatTimers.values()) clearTimeout(t);
    this.seatTimers = null;
    rooms.delete(this.code);
    for (const id of this.botIds) clearBotState(id);
    this.onEmpty(this.code);
  }
}

// ---- public matchmaking ----
let formTimer = null;
export function joinQueue(client) {
  queue.add(client);
  client.send({ t: 'queued', waiting: queue.size });
  // batch queuers for a few seconds so friends can land in the same match
  if (!formTimer) {
    formTimer = setTimeout(() => { formTimer = null; tryFormMatch(client && client.queuePref); }, 4000);
  }
}

export function leaveQueue(client) {
  queue.delete(client);
  if (queue.size === 0 && formTimer) { clearTimeout(formTimer); formTimer = null; }
}

function tryFormMatch(pref) {
  if (queue.size === 0) return;
  // form a match as soon as 1 human waits (bots fill the rest) — low wait time
  const humans = [...queue];
  queue.clear();
  const code = makeCode();
  const mapName = (pref && MAP_NAMES.includes(pref.map)) ? pref.map : MAP_NAMES[Math.floor(Math.random() * MAP_NAMES.length)];
  const mode = (pref && GAME_MODES.includes(pref.mode)) ? pref.mode : 'defuse';
  const room = new Room({
    code, kind: 'public', mapName, mode,
    onEmpty: (c) => console.log(`[rooms] public match ${c} closed`),
  });
  rooms.set(code, room);
  console.log(`[rooms] public match ${code} formed with ${humans.length} human(s) — map ${mapName}, mode ${mode}`);
  for (const h of humans) { h.queued = false; h.room = room; room.addHuman(h, h.name); }
}

// ---- custom rooms ----
export function createRoom(client, { bots, map, mode }) {
  const code = makeCode();
  const mapName = MAP_NAMES.includes(map) ? map : MAP_NAMES[Math.floor(Math.random() * MAP_NAMES.length)];
  const room = new Room({
    code, kind: 'custom', owner: client.id, mapName,
    mode: GAME_MODES.includes(mode) ? mode : 'defuse',
    botCount: Math.max(0, Math.min(18, bots | 0)),
    onEmpty: (c) => console.log(`[rooms] custom room ${c} closed`),
  });
  rooms.set(code, room);
  client.room = room;
  client.queued = false;
  client.send({ t: 'created', code });
  room.addHuman(client, client.name); // creator joins their own room
  return room;
}

export function joinRoom(client, code) {
  const room = rooms.get(String(code));
  if (!room) { client.send({ t: 'error', msg: 'Room not found' }); return; }
  if (room.humanCount() >= MAX_PLAYERS) { client.send({ t: 'error', msg: 'Room full (20)' }); return; }
  client.room = room;
  client.queued = false;
  room.addHuman(client, client.name);
}

export function roomList() {
  const out = [];
  for (const r of rooms.values()) {
    if (r.kind !== 'custom') continue;
    out.push({ code: r.code, humans: r.humanCount(), bots: r.botIds.length, mode: r.mode, map: r.mapName });
  }
  return out;
}

export function getRoom(code) { return rooms.get(String(code)) || null; }
export function allRooms() { return rooms; }

// ---- background GC (started only by the real server, not by tests) ----
export function startGc() {
  setInterval(() => {
    const now = Date.now();
    // 1) rooms with no humans: custom rooms already self-close via closeTimer;
    //    any room whose loop tick went stale (crashed/hung) gets force-closed.
    for (const r of [...rooms.values()]) {
      if (r.humanCount() === 0 && !r.closeTimer && r.kind === 'custom' && !r.destroyed) {
        clearTimeout(r.closeTimer);
        r.closeTimer = setTimeout(() => r.destroy(), 30_000);
      }
      if (!r.destroyed && r.timer && now - r.lastTick > 10_000) {
        console.log(`[gc] room ${r.code} tick stale — destroying`);
        r.destroy();
      }
    }
    // 2) people stuck in queue without a socket (dead ws edge case)
    for (const c of [...queue]) {
      try { if (c.ws.readyState !== 1) { queue.delete(c); } } catch { queue.delete(c); }
    }
    if (queue.size === 0 && formTimer) { clearTimeout(formTimer); formTimer = null; }
  }, 30_000).unref();
}
