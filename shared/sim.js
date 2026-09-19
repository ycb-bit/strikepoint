// Strikepoint — authoritative round simulation.
// Owns game state, applies validated inputs, runs the round state machine,
// damage resolution, economy, and score. Server calls tick(); snapshots derive from it.
// Bots feed the same applyInput() path as humans — one code path for everyone.
// Modes: defuse (CS-style rounds + bomb) | tdm (team deathmatch) | ffa (free-for-all).

import { TICK_MS, ROUND, ECONOMY, WEAPONS, TEAM, PLAYER_EYE, PLAYER_HEIGHT, PLAYER_RADIUS,
         MOVE_SPEED, SPRINT_MULT, CROUCH_MULT, SLIDE_MULT, SLIDE_TIME, SLIDE_COOLDOWN, JUMP_VEL, GRAVITY,
         STAMINA_MAX, STAMINA_DRAIN, STAMINA_REGEN, STAMINA_MIN,
         RANGE_FACTOR, LEG_MULTIPLIER, TDM_KILL_LIMIT, FFA_KILL_LIMIT, DM_ROUND_TIME, RESPAWN_TIME } from './constants.js';
// per-room custom rules (set via createGame opts), falling back to defaults
export function rulesOf(g) { return g.rules || {}; }
import { createMap } from './map.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
// recoilAccum lives inside each game object — see createGame below

export function createGame(mapName = 'arena', seed = 1337, mode = 'defuse', rules = null) {
  const map = createMap(mapName, seed);
  const g = {
    map, mode,
    rules: rules || null,   // { killLimit, roundTime, respawnTime, friendlyFire }
    players: new Map(),   // id -> player
    bombs: new Map(),     // id -> bomb entity (defuse mode only)
    nextBombId: 1,
    phase: 'warmup',      // warmup | freeze | live | planted | roundEnd | matchEnd
    phaseEndsAt: 0,
    round: 0,
    score: [0, 0],        // [T, CT] — defuse: rounds won; tdm: team kills; ffa: unused
    killfeed: [],
    winner: null,         // matchEnd: team 0/1 (defuse/tdm) or player id (ffa)
    winnerName: null,
    losses: [1, 1],       // consecutive loss counters (defuse)
    roundEvents: [],
    bombTimer: 0,
    plantProgress: 0,
    defuseProgress: 0,
    planterId: null,
    defuserId: null,
    bombPos: null,
    bombSite: null,
    bombCarrier: null,    // player id (defuse only)
    dmEndsAt: 0,
    // per-game recoil: no cross-room leakage; decayed in tick()
    recoilAccum: new Map(),
    recoilDecayAt: 0,
  };
  return g;
}

export function addPlayer(g, id, name, opts = {}) {
  const p = {
    id, name,
    bot: !!opts.bot,
    team: opts.team ?? TEAM.T,
    alive: false,
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vy: 0,
    onGround: true,
    hp: 100, armor: 0, helmet: false,
    stamina: STAMINA_MAX, staminaLock: false,
    crouching: false, prevCrouch: false,
    money: ECONOMY.start,
    slotPref: 'secondary',
    kills: 0, deaths: 0,
    weapons: { primary: null, secondary: 'glock', melee: 'knife' },
    ammo: {},           // weapon -> { mag, reserve }
    input: { mx: 0, mz: 0, jump: false, fire: false, alt: false, sprint: false, slide: false, crouch: false },
    prevFire: false, prevSlide: false,
    fireCooldown: 0,
    reloadEndsAt: 0,
    lastShotAt: 0,
    activity: null,     // { type: 'plant'|'defuse', t }
    deathAt: 0,
    respawnAt: 0,
    plantDone: false,
    defuseDone: false,
    lastSeenTarget: null,
    // sprint/slide/crouch state
    slideT: 0, slideCd: 0, slideDirX: 0, slideDirZ: 0,
    loadout: { primary: null, secondary: null },
  };
  g.players.set(id, p);
  return p;
}

export function removePlayer(g, id) {
  const p = g.players.get(id);
  if (!p) return;
  if (g.bombCarrier === id) dropBomb(g, p);
  if (g.defuserId === id) { g.defuseProgress = 0; g.defuserId = null; }
  g.recoilAccum.delete(id);
  g.players.delete(id);
}

const alive = (g, team) => {
  let n = 0;
  for (const p of g.players.values()) if (p.alive && p.team === team) n++;
  return n;
};
const teamCount = (g, team) => {
  let n = 0;
  for (const p of g.players.values()) if (p.team === team) n++;
  return n;
};

export function startMatch(g) {
  g.round = 0;
  g.score = [0, 0];
  g.losses = [1, 1];
  g.winner = null;
  g.winnerName = null;
  g.killfeed.length = 0;
  for (const p of g.players.values()) { p.money = ECONOMY.start; p.kills = 0; p.deaths = 0; }
  if (g.mode === 'defuse') {
    startRound(g);
  } else {
    // dm modes: short freeze, then one long round
    g.round = 1;
    g.phase = 'freeze';
    g.phaseEndsAt = Date.now() + 3000;
    const roundMs = (rulesOf(g).roundTime || DM_ROUND_TIME) * 1000;
    g.dmEndsAt = Date.now() + 3000 + roundMs;
    for (const p of g.players.values()) { giveDefaultLoadout(g, p); spawnPlayer(g, p); }
    g.roundEvents.push({ type: 'note', text: g.mode === 'tdm' ? `TEAM DEATHMATCH — first to ${rulesOf(g).killLimit || TDM_KILL_LIMIT}` : `FREE-FOR-ALL — first to ${rulesOf(g).killLimit || FFA_KILL_LIMIT}` });
  }
}

function giveDefaultLoadout(g, p) {
  const dm = g.mode !== 'defuse';
  if (dm) {
    p.weapons.primary = p.loadout.primary || (p.team === TEAM.T ? 'ak' : 'm4');
    p.weapons.secondary = p.loadout.secondary || 'usp';
    p.armor = 100; p.helmet = true;
  } else {
    p.weapons.primary = null;
    p.weapons.secondary = p.team === TEAM.T ? 'glock' : 'usp';
    p.armor = 0; p.helmet = false;
  }
  p.weapons.melee = 'knife';
  p.slotPref = p.weapons.primary ? 'primary' : 'secondary';
  refillAmmo(p, 'glock'); refillAmmo(p, 'usp'); refillAmmo(p, 'knife');
  if (p.weapons.primary) refillAmmo(p, p.weapons.primary);
}

function refillAmmo(p, w) {
  const spec = WEAPONS[w];
  if (!spec || spec.ammo === Infinity) return;
  p.ammo[w] = { mag: spec.ammo, reserve: Infinity }; // unlimited reserves — mag reload still required
}

function spawnPlayer(g, p) {
  let spawns;
  if (g.mode === 'ffa') {
    spawns = Math.random() < 0.5 ? g.map.spawnsT : g.map.spawnsCT;
  } else {
    spawns = p.team === TEAM.T ? g.map.spawnsT : g.map.spawnsCT;
  }
  let idx = 0, best = -1;
  const list = [...g.players.values()];
  for (let i = 0; i < spawns.length; i++) {
    let minD = Infinity;
    for (const q of list) {
      if (q === p || !q.alive) continue;
      const d = dist2D(spawns[i].x, spawns[i].z, q.x, q.z);
      if (d < minD) minD = d;
    }
    if (minD > best) { best = minD; idx = i; }
  }
  const s = spawns[idx % spawns.length];
  p.x = s.x; p.z = s.z; p.y = 0; p.vy = 0; p.onGround = true;
  p.yaw = s.yaw; p.pitch = 0;
  p.hp = 100; p.alive = true;
  p.stamina = STAMINA_MAX; p.staminaLock = false; p.crouching = false; p.prevCrouch = false; p.prevSlide = false;
  p.activity = null; p.plantDone = false; p.defuseDone = false;
  p.fireCooldown = 0; p.reloadEndsAt = 0; p.respawnAt = 0;
  p.slideT = 0; p.slideCd = 0;
  if (!p.weapons.primary && !p.weapons.secondary) p.weapons.secondary = p.team === TEAM.T ? 'glock' : 'usp';
  if (p.weapons.secondary && !p.ammo[p.weapons.secondary]) refillAmmo(p, p.weapons.secondary);
  if (p.weapons.primary && !p.ammo[p.weapons.primary]) refillAmmo(p, p.weapons.primary);
  g.roundEvents.push({ type: 'respawn', id: p.id });
}

export function startRound(g) {
  g.round++;
  g.phase = 'freeze';
  g.phaseEndsAt = Date.now() + ROUND.freeze * 1000;
  g.roundEvents = [];
  g.plantProgress = 0; g.defuseProgress = 0;
  g.planterId = null; g.defuserId = null;
  g.bombPos = null; g.bombSite = null; g.bombTimer = 0;
  g.bombs.clear();
  g.nextBombId = 1;
  for (const p of g.players.values()) {
    giveDefaultLoadout(g, p);
    spawnPlayer(g, p);
  }
  // give bomb to a random alive T
  const ts = [...g.players.values()].filter(p => p.team === TEAM.T && p.alive);
  g.bombCarrier = ts.length ? ts[(Math.random() * ts.length) | 0].id : null;
}

function endRound(g, winTeam, reason) {
  g.phase = 'roundEnd';
  g.phaseEndsAt = Date.now() + ROUND.end * 1000;
  g.score[winTeam]++;
  // economy
  const loseTeam = 1 - winTeam;
  g.losses[winTeam] = 0;
  g.losses[loseTeam] = Math.min(4, (g.losses[loseTeam] || 0) + 1);
  for (const p of g.players.values()) {
    if (p.team === winTeam) p.money += ECONOMY.win;
    else p.money += ECONOMY.loss + (g.losses[loseTeam] - 1) * ECONOMY.lossBonusStep;
    p.money = Math.min(16000, p.money);
  }
  g.roundEvents.push({ type: 'roundEnd', winTeam, reason });
  if (g.score[winTeam] >= 8) {
    g.phase = 'matchEnd';
    g.winner = winTeam;
    g.phaseEndsAt = Date.now() + ROUND.end * 1000;
  }
}

function endMatch(g, winTeam, winPlayerId) {
  g.phase = 'matchEnd';
  g.phaseEndsAt = Date.now() + ROUND.end * 1000;
  g.winner = winPlayerId != null ? winPlayerId : winTeam;
  const wp = winPlayerId != null ? g.players.get(winPlayerId) : null;
  g.winnerName = wp ? wp.name : (winTeam === TEAM.T ? 'TERRORISTS' : 'COUNTER-TERRORISTS');
  g.roundEvents.push({ type: 'dmEnd', winner: g.winner, winnerName: g.winnerName });
}

export function plantBomb(g, p, x, z) {
  const site = g.map.inSite(x, z);
  if (!site) return false;
  const id = g.nextBombId++;
  g.bombs.set(id, { id, x, z, y: 0.2 });
  g.bombPos = { x, z };
  g.bombSite = site;
  g.bombTimer = ROUND.bomb;
  g.phase = 'planted';
  g.planterId = p.id;
  p.money = Math.min(16000, p.money + ECONOMY.plant);
  // pay alive T teammates the plant bonus
  for (const q of g.players.values()) {
    if (q.id !== p.id && q.team === TEAM.T && q.alive) {
      q.money = Math.min(16000, q.money + ECONOMY.teamPlantBonus);
    }
  }
  g.roundEvents.push({ type: 'plant', x, z, site, by: p.id });
  return true;
}

function dropBomb(g, p) {
  if (g.bombCarrier !== p.id) return;
  g.bombCarrier = null;
  g.roundEvents.push({ type: 'bombDrop', x: p.x, z: p.z });
  // v1: nearest alive T auto-picks it up on touch in tick
  g.droppedBombPos = { x: p.x, z: p.z };
}

function explodeBomb(g) {
  const r = 10;
  for (const p of g.players.values()) {
    if (!p.alive) continue;
    const d = dist2D(p.x, p.z, g.bombPos.x, g.bombPos.z);
    if (d < r) {
      const dmg = Math.round(500 / (1 + d * d * 0.08));
      applyDamage(g, p, dmg, null, 'bomb');
    }
  }
  g.roundEvents.push({ type: 'explode', x: g.bombPos.x, z: g.bombPos.z });
  endRound(g, TEAM.T, 'bomb');
}

function applyDamage(g, victim, dmg, attackerId, cause, headshot = false) {
  if (!victim.alive) return;
  victim.hp -= dmg;
  g.roundEvents.push({ type: 'dmg', to: victim.id, by: attackerId, amount: dmg, headshot, cause });
  if (victim.hp <= 0) {
    victim.hp = 0;
    victim.alive = false;
    victim.deaths++;
    victim.deathAt = Date.now();
    if (g.bombCarrier === victim.id) dropBomb(g, victim);
    if (g.defuserId === victim.id) { g.defuseProgress = 0; g.defuserId = null; }
    const attacker = attackerId != null ? g.players.get(attackerId) : null;
    const dm = g.mode !== 'defuse';
    const ff = rulesOf(g).friendlyFire;
    if (attacker && attacker.id !== victim.id && (dm || ff || attacker.team !== victim.team)) {
      attacker.kills++;
      attacker.money = Math.min(16000, attacker.money + ECONOMY.kill);
      if (g.mode === 'tdm') {
        g.score[attacker.team]++;
        if (g.score[attacker.team] >= (rulesOf(g).killLimit || TDM_KILL_LIMIT)) {
          endMatch(g, attacker.team, null);
          return;
        }
      } else if (g.mode === 'ffa') {
        if (attacker.kills >= (rulesOf(g).killLimit || FFA_KILL_LIMIT)) {
          endMatch(g, null, attacker.id);
          return;
        }
      }
    }
    if (dm) victim.respawnAt = Date.now() + (rulesOf(g).respawnTime || RESPAWN_TIME) * 1000;
    g.killfeed.push({
      at: Date.now(), by: attackerId, to: victim.id,
      weapon: cause, headshot,
    });
    if (g.killfeed.length > 30) g.killfeed.splice(0, g.killfeed.length - 30);
    g.roundEvents.push({ type: 'death', id: victim.id, by: attackerId, cause, headshot });
    checkRoundWonByElimination(g);
  }
}

function checkRoundWonByElimination(g) {
  if (g.mode !== 'defuse') return; // dm modes respawn
  if (g.phase !== 'live' && g.phase !== 'planted' && g.phase !== 'freeze') return;
  const tAlive = alive(g, TEAM.T), ctAlive = alive(g, TEAM.CT);
  if (tAlive === 0 && ctAlive === 0) endRound(g, TEAM.CT, 'elimination');
  else if (tAlive === 0) {
    if (g.phase === 'planted') {
      // bomb still ticking — CTs must defuse; in v1 award on explode
      g.roundEvents.push({ type: 'note', text: 'T eliminated — bomb still armed' });
    } else endRound(g, TEAM.CT, 'elimination');
  } else if (ctAlive === 0 && g.phase !== 'planted') endRound(g, TEAM.T, 'elimination');
}

// movement + gravity + collision, shared by server sim AND client prediction
export function movePlayer(map, p, dt) {
  // camera-relative: mz=+1 forward, mx=+1 right
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  const mx = p.input.mx, mz = p.input.mz;
  p.slideCd = Math.max(0, p.slideCd - dt);

  // stamina sprint: fast but drains; when empty you must regen past STAMINA_MIN
  const wantSprint = p.input.sprint && mz > 0 && p.slideT <= 0 && !p.input.crouch;
  const sprinting = wantSprint && p.stamina > 0 && !p.staminaLock;
  if (sprinting) {
    p.stamina = Math.max(0, p.stamina - STAMINA_DRAIN * dt);
    if (p.stamina <= 0) p.staminaLock = true;
  } else {
    p.stamina = Math.min(STAMINA_MAX, p.stamina + STAMINA_REGEN * dt);
    if (p.staminaLock && p.stamina >= STAMINA_MIN) p.staminaLock = false;
  }
  p.crouching = !!p.input.crouch && p.slideT <= 0;

  let speed = MOVE_SPEED;
  if (p.crouching) speed *= CROUCH_MULT;
  else if (sprinting) speed *= SPRINT_MULT;

  let vx, vz;
  if (p.slideT > 0) {
    // slide: boosted glide along the slide direction, decaying
    p.slideT -= dt;
    const decay = 0.55 + 0.45 * Math.max(0, p.slideT / SLIDE_TIME);
    vx = p.slideDirX * speed * SLIDE_MULT * decay;
    vz = p.slideDirZ * speed * SLIDE_MULT * decay;
  } else {
    vx = (-sin * mz + cos * mx) * speed;
    vz = (-cos * mz - sin * mx) * speed;
  }
  if (p.input.jump && p.onGround) { p.vy = JUMP_VEL; p.onGround = false; p.slideT = 0; }
  p.vy -= GRAVITY * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }
  const lim = (map.half || 32) - 0.6;
  const nx = clamp(p.x + vx * dt, -lim, lim);
  const nz = clamp(p.z + vz * dt, -lim, lim);
  const res = map.resolveCircle(nx, nz, PLAYER_RADIUS, p.y, p.y + PLAYER_HEIGHT);
  p.x = res.x; p.z = res.z;
}

export function isSliding(p) { return p.slideT > 0; }
export function isSprinting(p) { return p.input.sprint && p.input.mz > 0 && p.slideT <= 0 && p.stamina > 0 && !p.staminaLock; }

export function trySlide(p) {
  // slide: only from a sprint (or with sprint momentum), costs a stamina chunk
  if (p.slideT > 0 || p.slideCd > 0 || !p.onGround) return false;
  if (p.stamina < 15) return false;
  p.stamina = Math.max(0, p.stamina - 20);
  const mx = p.input.mx, mz = p.input.mz;
  let dx, dz;
  if (mx !== 0 || mz !== 0) {
    // use current input direction (world space)
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    const vx = -sin * mz + cos * mx, vz = -cos * mz - sin * mx;
    const l = Math.hypot(vx, vz) || 1;
    dx = vx / l; dz = vz / l;
  } else {
    dx = -Math.sin(p.yaw); dz = -Math.cos(p.yaw);
  }
  p.slideDirX = dx; p.slideDirZ = dz;
  p.slideT = SLIDE_TIME;
  p.slideCd = SLIDE_TIME + SLIDE_COOLDOWN;
  return true;
}

// validated per-tick input for one player
export function applyInput(g, p, inp, dt) {
  const now = Date.now();
  if (!p.alive) {
    if (g.mode !== 'defuse' && p.respawnAt && now >= p.respawnAt &&
        (g.phase === 'live' || g.phase === 'freeze')) {
      giveDefaultLoadout(g, p);
      spawnPlayer(g, p);
    }
    return;
  }
  const frozen = g.phase === 'freeze' || g.phase === 'roundEnd' || g.phase === 'matchEnd';
  p.input.fire = !!inp.fire;
  if (frozen) { p.input.mx = 0; p.input.mz = 0; p.input.jump = false; p.input.sprint = false; p.input.slide = false; }
  else {
    p.input.mx = clamp(+inp.mx || 0, -1, 1);
    p.input.mz = clamp(+inp.mz || 0, -1, 1);
    p.input.jump = !!inp.jump;
    p.input.zoom = !!inp.zoom;
    p.input.sprint = !!inp.sprint;
    p.input.crouch = !!inp.crouch;
    // crouch-triggered slide: pressing crouch while sprinting slides instead
    const crouchEdge = !!inp.crouch && !p.prevCrouch;
    p.prevCrouch = !!inp.crouch;
    if (crouchEdge) {
      const wasSprinting = isSprinting(p);
      const moving = p.input.mz > 0 || p.input.mx !== 0;
      if (wasSprinting || (moving && p.slideT <= 0 && p.slideCd <= 0 && p.stamina >= 15 && p.input.sprint)) trySlide(p);
    }
    // explicit slide action also works (server-side edge for bots)
    const slideEdge = !!inp.slide && !p.prevSlide;
    p.prevSlide = !!inp.slide;
    if (slideEdge) trySlide(p);
  }
  if (Number.isFinite(inp.yaw)) p.yaw = inp.yaw % (Math.PI * 2);
  if (Number.isFinite(inp.pitch)) p.pitch = clamp(inp.pitch, -1.5, 1.5);

  movePlayer(g.map, p, dt);

  // shooting (semi-auto fires on press edge; auto/knife fire while held)
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  // reload completion — tick-driven, no setTimeout needed
  if (p.reloadEndsAt && now >= p.reloadEndsAt) {
    const rWName = currentWeapon(p);
    const rSpec = WEAPONS[rWName];
    if (rSpec && rSpec.ammo !== Infinity) {
      const am = p.ammo[rWName];
      if (am) {
        const need = rSpec.ammo - am.mag;
        const take = am.reserve === Infinity ? need : Math.min(need, am.reserve);
        am.mag += take;
        if (am.reserve !== Infinity) am.reserve -= take;
      }
    }
    p.reloadEndsAt = 0;
  }
  const wName = currentWeapon(p);
  const auto = WEAPONS[wName] ? WEAPONS[wName].auto !== false : true;
  const wantFire = auto ? p.input.fire : (p.input.fire && !p.prevFire);
  p.prevFire = p.input.fire;
  if (wantFire && !frozen && p.fireCooldown === 0 && !p.reloadEndsAt && !p.activity) {
    fireWeapon(g, p);
  }

  // plant / defuse progress (defuse mode only)
  if (p.activity) {
    const dur = p.activity.type === 'plant' ? ROUND.plant : ROUND.defuse;
    if ((p.input.mx !== 0 || p.input.mz !== 0 || p.input.jump) && p.activity.type === 'plant') p.activity = null;
    else if (p.activity.type === 'plant' && !g.map.inSite(p.x, p.z)) p.activity = null;
    else {
      p.activity.t = (p.activity.t || 0) + dt;
      if (p.activity.type === 'plant') {
        g.plantProgress = clamp(p.activity.t / dur, 0, 1);
        if (g.plantProgress >= 1) {
          p.activity = null; p.plantDone = true;
          plantBomb(g, p, p.x, p.z);
        }
      } else {
        g.defuseProgress = clamp(p.activity.t / dur, 0, 1);
        if (g.defuseProgress >= 1) {
          p.activity = null; p.defuseDone = true;
          p.money = Math.min(16000, p.money + ECONOMY.defuse);
          g.roundEvents.push({ type: 'defuse', by: p.id });
          endRound(g, TEAM.CT, 'defuse');
        }
      }
    }
  }

  // bomb pickup (dropped carrier) — defuse mode only
  if (g.mode === 'defuse' && g.droppedBombPos && p.team === TEAM.T && p.alive &&
      dist2D(p.x, p.z, g.droppedBombPos.x, g.droppedBombPos.z) < 1.2) {
    g.bombCarrier = p.id;
    g.droppedBombPos = null;
    g.roundEvents.push({ type: 'bombPickup', by: p.id });
  }
}

export function tryPlant(g, p) {
  if (g.mode !== 'defuse') return false;
  if (p.team !== TEAM.T || !p.alive || g.phase !== 'live') return false;
  if (g.bombCarrier !== p.id || !g.map.inSite(p.x, p.z)) return false;
  if (p.activity) return false;
  p.activity = { type: 'plant', t: 0 };
  return true;
}

export function tryDefuse(g, p) {
  if (g.mode !== 'defuse') return false;
  if (p.team !== TEAM.CT || !p.alive || g.phase !== 'planted') return false;
  if (dist2D(p.x, p.z, g.bombPos.x, g.bombPos.z) > 1.6) return false;
  if (p.activity) return false;
  p.activity = { type: 'defuse', t: 0 };
  g.defuserId = p.id;
  return true;
}

export function stopActivity(g, p) {
  if (!p.activity) return;
  if (p.activity.type === 'plant') g.plantProgress = 0;
  if (p.activity.type === 'defuse') { g.defuseProgress = 0; g.defuserId = null; }
  p.activity = null;
}

function currentWeapon(p) {
  if (p.slotPref === 'melee') return 'knife';
  if (p.slotPref === 'secondary' && p.weapons.secondary) return p.weapons.secondary;
  if (p.weapons.primary) return p.weapons.primary;
  if (p.weapons.secondary) return p.weapons.secondary;
  return 'knife';
}

function fireWeapon(g, p) {
  const wName = currentWeapon(p);
  const spec = WEAPONS[wName];
  p.fireCooldown = 60 / spec.rpm;
  if (wName === 'knife') {
    // melee: short raycast
    const hit = raycastPlayers(g, p, spec.range);
    if (hit) {
      const dmg = Math.round(spec.dmg * (hit.head ? spec.hs : 1));
      applyDamage(g, hit.player, dmg, p.id, 'knife', hit.head);
    }
    g.roundEvents.push({ type: 'shot', by: p.id, weapon: 'knife', x: p.x, y: p.y + PLAYER_EYE, z: p.z, yaw: p.yaw, pitch: p.pitch });
    return;
  }
  const am = p.ammo[wName];
  if (!am || am.mag <= 0) { startReload(g, p); return; }
  am.mag--;

  const originY = p.y + PLAYER_EYE;
  // recoil: sustained fire blooms inaccuracy
  const now = Date.now();
  const spraying = now - p.lastShotAt < 300;
  let spread = spec.spread * (p.onGround ? 1 : 2.2) * (spraying ? 1 + Math.min(1.6, recoilAccum.get(p.id) || 0) : 1);
  if (p.input.zoom) spread *= 0.45;              // ADS tightens spread
  if (p.input.sprint && p.input.mz > 0) spread *= 1.6;   // sprinting is inaccurate
  if (p.slideT > 0) spread *= 1.35;                       // sliding slightly inaccurate
  if (wName === 'awp' && !p.input.zoom) spread *= 6;      // awp noscope penalty
  const yaw = p.yaw + (Math.random() - 0.5) * spread * 2;
  const pitch = p.pitch + (Math.random() - 0.5) * spread * 2;
  p.lastShotAt = now;
  recoilAccum.set(p.id, Math.min(1.6, (recoilAccum.get(p.id) || 0) + 0.22));
  g.roundEvents.push({ type: 'shot', by: p.id, weapon: wName, x: p.x, y: originY, z: p.z, yaw, pitch });

  const dx = -Math.sin(yaw) * Math.cos(pitch);
  const dy = Math.sin(pitch);
  const dz = -Math.cos(yaw) * Math.cos(pitch);
  const hit = raycastPlayers(g, p, spec.range, yaw, pitch);
  if (hit) {
    let dmg = spec.dmg * Math.pow(RANGE_FACTOR, hit.dist);
    if (hit.head) dmg *= spec.hs;
    else if (hit.leg) dmg *= LEG_MULTIPLIER;
    if (hit.player.armor > 0 && !hit.head) dmg *= 0.7;
    if (hit.player.armor > 0) hit.player.armor = Math.max(0, hit.player.armor - Math.round(dmg * 0.5));
    applyDamage(g, hit.player, Math.round(dmg), p.id, wName, hit.head);
    g.roundEvents.push({
      type: 'hit', by: p.id, to: hit.player.id, weapon: wName,
      x: p.x + dx * hit.dist, y: p.y + PLAYER_EYE + dy * hit.dist, z: p.z + dz * hit.dist,
      head: hit.head, dmg: Math.round(dmg),
      sx: p.x, sz: p.z,  // shooter ground pos — client uses it for the hit-direction indicator
    });
  } else {
    const wallT = g.map.rayHitDist(p.x, originY, p.z, dx, dy, dz, spec.range);
    if (wallT != null) {
      g.roundEvents.push({
        type: 'impact', weapon: wName,
        x: p.x + dx * wallT, y: originY + dy * wallT, z: p.z + dz * wallT,
      });
    }
  }
}

// find first player hit by camera ray (players approximated as 3 boxes)
function raycastPlayers(g, shooter, range, yaw = shooter.yaw, pitch = shooter.pitch) {
  const ox = shooter.x, oy = shooter.y + PLAYER_EYE, oz = shooter.z;
  const dx = -Math.sin(yaw) * Math.cos(pitch);
  const dy = Math.sin(pitch);
  const dz = -Math.cos(yaw) * Math.cos(pitch);
  let best = null;
  const ffa = g.mode === 'ffa';
  const ff = rulesOf(g).friendlyFire;
  for (const q of g.players.values()) {
    if (q === shooter || !q.alive) continue;
    if (!ffa && !ff && q.team === shooter.team) continue; // no friendly fire unless ff enabled
    const hit = rayVsPlayerBox(ox, oy, oz, dx, dy, dz, q, range);
    if (hit && (!best || hit.dist < best.dist)) best = hit;
  }
  // wall check: if a wall blocks before the player hit point, no damage
  if (best) {
    const hx = ox + dx * best.dist, hy = oy + dy * best.dist, hz = oz + dz * best.dist;
    if (!g.map.losClear(ox, oy, oz, hx, hy, hz)) return null;
  }
  return best;
}

function rayVsPlayerBox(ox, oy, oz, dx, dy, dz, q, range) {
  // body box: x/z radius 0.35, y: 0..1.35 ; head box: radius 0.22, y: 1.35..1.75
  const tryBox = (hx, hz, y0, y1) => {
    let tmin = 0, tmax = range;
    const boxes = [
      [ox, dx, q.x - hx, q.x + hx],
      [oy, dy, q.y + y0, q.y + y1],
      [oz, dz, q.z - hz, q.z + hz],
    ];
    for (const [o, d, lo, hi] of boxes) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; }
      else {
        let t1 = (lo - o) / d, t2 = (hi - o) / d;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return null;
      }
    }
    return tmin;
  };
  const tHead = tryBox(0.22, 0.22, 1.35, 1.75);
  if (tHead != null) return { player: q, dist: tHead, head: true, leg: false };
  const tBody = tryBox(0.35, 0.35, 0.0, 1.35);
  if (tBody != null) {
    // determine leg zone by where the ray actually hits on the body (y: 0..0.75)
    const hitY = oy + dy * tBody - q.y;
    return { player: q, dist: tBody, head: false, leg: hitY <= 0.75 };
  }
  return null;
}

export function startReload(g, p) {
  const wName = currentWeapon(p);
  const spec = WEAPONS[wName];
  if (!spec || spec.ammo === Infinity || p.reloadEndsAt) return;
  const am = p.ammo[wName];
  if (!am || am.mag >= spec.ammo) return; // unlimited reserve: reload whenever mag is not full
  p.reloadEndsAt = Date.now() + spec.reload * 1000;
  g.roundEvents.push({ type: 'reload', by: p.id, weapon: wName });
  // completion is driven by the reloadEndsAt check in applyInput — no setTimeout needed
}

export function buyWeapon(g, p, what) {
  if (g.mode === 'defuse') {
    if (g.phase !== 'freeze') return { ok: false, err: 'buy time over' };
    if (!p.alive) return { ok: false, err: 'dead' };
  }
  if (what === 'armor') {
    if (p.money < 650) return { ok: false, err: 'no money' };
    p.money -= 650; p.armor = 100; p.helmet = true;
    return { ok: true };
  }
  const spec = WEAPONS[what];
  if (!spec || what === 'knife' || spec.price === 0) return { ok: false, err: 'unknown' };
  if (g.mode === 'defuse') {
    if (p.money < spec.price) return { ok: false, err: 'no money' };
    if (p.weapons[spec.slot] === what) return { ok: true };
    p.money -= spec.price;
  }
  p.weapons[spec.slot] = what;
  p.ammo[what] = { mag: spec.ammo, reserve: Infinity };
  p.slotPref = spec.slot;
  return { ok: true };
}

// dm loadout select (tdm/ffa): pick primary + secondary, applies on next spawn
export function setLoadout(g, p, primary, secondary) {
  if (g.mode === 'defuse') return { ok: false, err: 'loadout is for tdm/ffa' };
  if (primary != null) {
    const spec = WEAPONS[primary];
    if (!spec || spec.slot !== 'primary') return { ok: false, err: 'bad primary' };
    p.loadout.primary = primary;
    // only apply immediately when dead — don't reset ammo mid-fight
    if (!p.alive) {
      p.weapons.primary = primary;
      p.ammo[primary] = { mag: spec.ammo, reserve: Infinity };
    }
    p.slotPref = 'primary';
  }
  if (secondary != null) {
    const spec = WEAPONS[secondary];
    if (!spec || spec.slot !== 'secondary') return { ok: false, err: 'bad secondary' };
    p.loadout.secondary = secondary;
    if (!p.alive) {
      p.weapons.secondary = secondary;
      p.ammo[secondary] = { mag: spec.ammo, reserve: Infinity };
    }
  }
  return { ok: true };
}

// one simulation step
// NOTE: does NOT clear roundEvents — the caller drains them after tick
// (events are generated in applyInput/botTick BEFORE tick runs in the same step).
export function tick(g, dt) {
  const now = Date.now();

  // decay per-game recoil accumulators (~150ms cadence)
  if (now >= g.recoilDecayAt) {
    g.recoilDecayAt = now + 150;
    for (const [k, v] of g.recoilAccum) {
      const next = Math.max(0, v - 0.55);
      if (next === 0) g.recoilAccum.delete(k);
      else g.recoilAccum.set(k, next);
    }
  }

  // dm respawns
  if (g.mode !== 'defuse') {
    for (const p of g.players.values()) {
      if (!p.alive && p.respawnAt && now >= p.respawnAt &&
          (g.phase === 'live' || g.phase === 'freeze')) {
        giveDefaultLoadout(g, p);
        spawnPlayer(g, p);
      }
    }
  }

  // phase transitions
  if (g.phase === 'freeze' && now >= g.phaseEndsAt) {
    g.phase = 'live';
    g.phaseEndsAt = g.mode === 'defuse' ? now + ROUND.live * 1000 : g.dmEndsAt;
  } else if (g.phase === 'live' && now >= g.phaseEndsAt) {
    if (g.mode === 'defuse') endRound(g, TEAM.CT, 'time');
    else {
      // dm time up: highest score wins
      if (g.mode === 'tdm') {
        const win = g.score[0] === g.score[1] ? null : (g.score[0] > g.score[1] ? TEAM.T : TEAM.CT);
        endMatch(g, win ?? TEAM.CT, null);
      } else {
        let best = null;
        for (const p of g.players.values()) if (!best || p.kills > best.kills) best = p;
        endMatch(g, null, best ? best.id : null);
      }
    }
  } else if (g.phase === 'planted') {
    g.bombTimer -= dt;
    if (g.bombTimer <= 0) explodeBomb(g);
  } else if (g.phase === 'roundEnd' && now >= g.phaseEndsAt) {
    // only start a new round if we haven't already escalated to matchEnd
    if (g.winner == null) startRound(g);
  }

  // inputs already applied by server per player before tick (applyInput per player)
  // bomb dropped pickup handled in applyInput

  // if all CTs dead but bomb planted, Ts win immediately
  if (g.mode === 'defuse' && g.phase === 'planted' && alive(g, TEAM.CT) === 0) {
    endRound(g, TEAM.T, 'bomb');
  }
}
