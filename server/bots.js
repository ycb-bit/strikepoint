// Strikepoint — server-side bot AI.
// Bots produce the same input struct as human clients and walk through applyInput(),
// so there is exactly one physics/damage path for everyone. Small waypoint graph
// navigation + LOS-based combat. Cheap on purpose: one think per second, per bot.

import { TEAM, WEAPONS, ROUND } from '../shared/constants.js';
import { applyInput, tryPlant, tryDefuse, stopActivity, buyWeapon, setLoadout } from '../shared/sim.js';

const BOT_NAMES = [
  'Vex', 'Moss', 'Havoc', 'Rook', 'Dusty', 'Onyx', 'Juno', 'Kilo',
  'Frost', 'Wren', 'Talon', 'Piper', 'Ash', 'Nova', 'Brick', 'Echo',
  'Flint', 'Ghost', 'Iris', 'Jinx', 'Colt', 'Raze', 'Sable', 'Lark',
  'Drax', 'Hex', 'Zara', 'Pike', 'Quinn', 'Thorn', 'Slate', 'Vale',
  'Cruz', 'Nyx', 'Rex', 'Viper', 'Blaze', 'Storm', 'Wolf', 'Dusk',
];

export function botName(i) {
  // avoid suffixed names like 'Vex2' by having enough names for all bots
  return BOT_NAMES[i % BOT_NAMES.length];
}

// personality-ish per-bot state
const botState = new Map();

function stateFor(id) {
  let s = botState.get(id);
  if (!s) {
    s = {
      path: [], pathI: 0, goal: null, goalKind: null,
      nextThink: 0, strafeDir: 1, strafeUntil: 0,
      reactUntil: 0, targetId: null, burstUntil: 0, pauseUntil: 0,
      aimYaw: 0, aimPitch: 0, repathAt: 0, wanderT: 0,
      lastX: 0, lastZ: 0, lastMoveCheck: 0,
    };
    botState.set(id, s);
  }
  return s;
}

export function clearBotState(id) { botState.delete(id); }

function pickObjective(g, p, s) {
  // DM modes: roam between hot spots (sites + mid)
  if (g.mode !== 'defuse') {
    const spots = [g.map.siteA, g.map.siteB, { x: 0, z: 0 }];
    const spot = spots[(Math.random() * spots.length) | 0];
    s.goal = { x: spot.x + (Math.random() * 10 - 5), z: spot.z + (Math.random() * 10 - 5) };
    s.goalKind = 'roam';
    s.path = null; s.pathI = 0;
    return;
  }
  // T with bomb: go to a site and plant. Other Ts escort/roam sites.
  // CTs: hold near the site Ts are likely to hit; after plant, defuse.
  const goingA = Math.random() < 0.5;
  if (p.team === TEAM.T) {
    if (g.phase === 'planted') {
      // guard the bomb
      s.goal = { x: g.bombPos.x + (Math.random() * 8 - 4), z: g.bombPos.z + (Math.random() * 8 - 4) };
      s.goalKind = 'guard';
    } else if (g.bombCarrier === p.id) {
      const site = goingA ? g.map.siteA : g.map.siteB;
      s.goal = { x: site.x + (Math.random() * 4 - 2), z: site.z + (Math.random() * 4 - 2) };
      s.goalKind = 'plant';
    } else {
      const site = goingA ? g.map.siteA : g.map.siteB;
      s.goal = { x: site.x + (Math.random() * 8 - 4), z: site.z + (Math.random() * 8 - 4) };
      s.goalKind = 'push';
    }
  } else {
    if (g.phase === 'planted' && g.bombPos) {
      s.goal = { x: g.bombPos.x + (Math.random() * 2 - 1), z: g.bombPos.z + (Math.random() * 2 - 1) };
      s.goalKind = 'defuse';
    } else {
      // split between sites / mid
      const roll = Math.random();
      const spot = roll < 0.4 ? g.map.siteA : roll < 0.8 ? g.map.siteB : { x: 0, z: 0 };
      s.goal = { x: spot.x + (Math.random() * 6 - 3), z: spot.z + (Math.random() * 6 - 3) };
      s.goalKind = 'hold';
    }
  }
  s.path = null;
  s.pathI = 0;
}

function findEnemy(g, p) {
  let best = null, bestD = Infinity;
  const ffa = g.mode === 'ffa';
  for (const q of g.players.values()) {
    if (!q.alive || q === p) continue;
    if (!ffa && q.team === p.team) continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d > 70) continue;
    // rough LOS from eyes
    if (!g.map.losClear(p.x, p.y + 1.62, p.z, q.x, q.y + 1.4, q.z)) continue;
    if (d < bestD) { bestD = d; best = q; }
  }
  return best;
}

function aimAt(p, q, dt, s) {
  // turn toward target with limited angular speed (feels human, cheap)
  const dx = q.x - p.x, dz = q.z - p.z;
  const wantYaw = Math.atan2(-dx, -dz);
  const dy = (q.y + 1.3) - (p.y + 1.62);
  const dist = Math.hypot(dx, dz);
  const wantPitch = Math.atan2(dy, dist);
  const turn = 7 * dt; // radians per tick max
  let dyaw = wantYaw - p.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  p.yaw += Math.max(-turn, Math.min(turn, dyaw));
  p.pitch += Math.max(-turn, Math.min(turn, wantPitch - p.pitch));
  return Math.abs(dyaw) < 0.12;
}

function moveAlongPath(g, p, s, dt, out) {
  if (!s.path || s.pathI >= s.path.length) return false;
  const node = s.path[s.pathI];
  if (!node || node.x == null) { s.path = null; s.goal = null; return false; }
  const dx = node.x - p.x, dz = node.z - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 1.2) { s.pathI++; return moveAlongPath(g, p, s, dt, out); }
  // face movement dir loosely while walking (unless aiming at enemy)
  const wantYaw = Math.atan2(-dx, -dz);
  let dyaw = wantYaw - p.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  p.yaw += Math.max(-6 * dt, Math.min(6 * dt, dyaw));
  p.pitch *= 0.9;
  // local frame: forward = (-sin, -cos), right = (cos, -sin)
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  const fwdAmt = (dx * -sin + dz * -cos) / d;
  const rightAmt = (dx * cos + dz * -sin) / d;
  out.mx = Math.max(-1, Math.min(1, rightAmt * 1.4));
  out.mz = Math.max(-1, Math.min(1, fwdAmt * 1.4));
  return true;
}

function dmLoadout(g, p) {
  // dm modes: pick a rifle at spawn only — NOT every tick (would full-reload mag mid-fight)
  if (g.mode === 'defuse') return;
  // only apply if not yet alive (first spawn or dead waiting to respawn)
  if (p.alive) return;
  if (!p.loadout.primary || Math.random() < 0.15) {
    const pick = ['ak', 'm4', 'mp5', 'dmr', 'awp'][(Math.random() * 5) | 0];
    setLoadout(g, p, pick, 'usp');
  }
}

function buyPhase(g, p) {
  if (g.phase !== 'freeze' || g.mode !== 'defuse') return;
  const rich = p.money;
  const isT = p.team === TEAM.T;
  // rifle economy: buy rifle + armor if possible
  if (rich >= (isT ? 2700 : 3100) + 650) {
    buyWeapon(g, p, isT ? 'ak' : 'm4');
    buyWeapon(g, p, 'armor');
  } else if (rich >= 1250 + 650) {
    buyWeapon(g, p, 'mp9');
    buyWeapon(g, p, 'armor');
  } else if (rich >= 700 && p.armor <= 0) {
    // eco: upgrade pistol or grab armor alone if affordable
    if (rich >= 700 + 650) { buyWeapon(g, p, 'deagle'); buyWeapon(g, p, 'armor'); }
    else if (rich >= 650) buyWeapon(g, p, 'armor');
    else if (rich >= 700) buyWeapon(g, p, 'deagle');
  }
}

// produce one frame of bot input and apply it
export function botTick(g, p, dt) {
  const s = stateFor(p.id);
  const out = { mx: 0, mz: 0, jump: false, fire: false, yaw: p.yaw, pitch: p.pitch, sprint: false, slide: false };

  dmLoadout(g, p);
  buyPhase(g, p);

  const enemy = findEnemy(g, p);

  if (g.phase === 'freeze') {
    // stand still, look mid
    out.yaw = p.team === TEAM.T ? Math.PI * 0.75 : -Math.PI * 0.25;
    applyInput(g, p, out, dt);
    return;
  }

  if (enemy) {
    const aimed = aimAt(p, enemy, dt, s);
    const dist = Math.hypot(enemy.x - p.x, enemy.z - p.z);
    const wName = p.weapons.primary || p.weapons.secondary || 'knife';
    const spec = WEAPONS[wName] || WEAPONS.knife;
    // fire when roughly aimed; small reaction delay
    if (s.reactUntil === 0) s.reactUntil = Date.now() + 120 + Math.random() * 180;
    const canShoot = aimed && Date.now() >= s.reactUntil;
    if (canShoot) {
      if (wName === 'knife') out.fire = dist < 2;
      else out.fire = spec.auto ? true : (Date.now() >= (s.semiNext || 0)) && ((s.semiNext = Date.now() + 90 + Math.random() * 160) > 0);
    } else {
      out.fire = false;
      s.reactUntil = s.reactUntil || Date.now() + 150;
    }
    // AWP: zoom when at range (gives accuracy bonus)
    out.zoom = (wName === 'awp' || wName === 'dmr') && dist > 12;
    // combat movement: strafe + close distance with rifles, keep awp range
    if (Date.now() > s.strafeUntil) {
      s.strafeDir = Math.random() < 0.5 ? -1 : 1;
      s.strafeUntil = Date.now() + 300 + Math.random() * 400;
    }
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    const wantDist = wName === 'awp' ? 18 : wName === 'dmr' ? 15 : wName === 'knife' ? 1.5 : 8;
    const approach = dist > wantDist ? 1 : dist < wantDist * 0.6 ? -0.6 : 0;
    out.mx = Math.max(-1, Math.min(1, cos * s.strafeDir * 0.8 + (-sin) * approach));
    out.mz = Math.max(-1, Math.min(1, -sin * s.strafeDir * 0.8 + (-cos) * approach));
    // crouch while holding/defending; stand when closing distance
    out.crouch = approach <= 0 && Math.random() < 0.4;
    // bomb duties override movement
    if (p.activity) { out.mx = 0; out.mz = 0; out.fire = false; }
    applyInput(g, p, out, dt);
    if (!enemy.alive) { s.targetId = null; s.reactUntil = 0; }
    return;
  }

  // no enemy visible
  s.reactUntil = 0;

  if (g.mode !== 'defuse') {
    // dm: navigate / roam; occasionally sprint
    if (!s.goal) pickObjective(g, p, s);
    if (!s.path || Date.now() > s.repathAt) {
      const startNode = g.map.nearestNode(p.x, p.z);
      const goalNode = g.map.nearestNode(s.goal.x, s.goal.z);
      s.path = g.map.pathBetween(startNode, goalNode).map(i => g.map.nodes[i]);
      s.path.push({ x: s.goal.x, z: s.goal.z });
      s.pathI = 0;
      s.repathAt = Date.now() + 4000;
    }
    const walking = moveAlongPath(g, p, s, dt, out);
    out.sprint = walking && Math.random() < 0.85;
    // stuck detection (same as defuse branch): wall-hugging bots repick a goal
    if (Date.now() - (s.lastMoveCheck || 0) > 1500) {
      const moved = Math.hypot(p.x - (s.lastX ?? p.x), p.z - (s.lastZ ?? p.z));
      if (walking && moved < 0.25) { s.goal = null; s.path = null; s.repathAt = 0; }
      s.lastX = p.x; s.lastZ = p.z; s.lastMoveCheck = Date.now();
    }
    if (!walking) pickObjective(g, p, s);
    applyInput(g, p, out, dt);
    return;
  }

  // bomb duties first (defuse mode)
  if (p.team === TEAM.T && g.bombCarrier === p.id && g.phase === 'live' && g.map.inSite(p.x, p.z)) {
    stopActivity(g, p);
    tryPlant(g, p);
  }
  if (p.team === TEAM.CT && g.phase === 'planted' && g.bombPos &&
      Math.hypot(p.x - g.bombPos.x, p.z - g.bombPos.z) < 1.5) {
    stopActivity(g, p);
    tryDefuse(g, p);
  }

  if (p.activity) {
    // stand still while planting/defusing
    applyInput(g, p, out, dt);
    return;
  }

  // pick objective if none
  if (!s.goal) pickObjective(g, p, s);

  // navigate
  if (!s.path || Date.now() > s.repathAt) {
    if (!s.goal) pickObjective(g, p, s);
    const startNode = g.map.nearestNode(p.x, p.z);
    const goalNode = g.map.nearestNode(s.goal.x, s.goal.z);
    s.path = g.map.pathBetween(startNode, goalNode).map(i => g.map.nodes[i]);
    // finish with exact goal point
    s.path.push({ x: s.goal.x, z: s.goal.z });
    s.pathI = 0;
    s.repathAt = Date.now() + 4000;
  }
  const walking = moveAlongPath(g, p, s, dt, out);

  // stuck detection: if trying to walk but barely moved, repick goal
  if (walking) {
    if (Date.now() - s.lastMoveCheck > 1500) {
      const moved = Math.hypot(p.x - s.lastX, p.z - s.lastZ);
      if (moved < 0.25) { s.goal = null; s.path = null; }
      s.lastX = p.x; s.lastZ = p.z; s.lastMoveCheck = Date.now();
    }
  } else {
    s.lastX = p.x; s.lastZ = p.z; s.lastMoveCheck = Date.now();
  }

  if (!walking) {
    // reached goal
    if (s.goalKind === 'hold' || s.goalKind === 'guard') {
      // scan around slowly
      s.wanderT += dt;
      out.yaw = p.yaw + Math.sin(s.wanderT * 0.7) * 0.02;
    } else {
      pickObjective(g, p, s);
    }
  }

  applyInput(g, p, out, dt);
}
