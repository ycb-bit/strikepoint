// Strikepoint — first-person viewmodel weapons + third-person player models.
// Simple box-composed guns (one tiny geometry, per-gun scales). Muzzle flash,
// recoil kick, walk bob, reload dip, draw animation — all cheap transforms.

import * as THREE from 'three';
import { WEAPON_SKINS } from './shop.js';
import { outfitById } from '../shared/outfits.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const mat = (c) => new THREE.MeshBasicMaterial({ color: c });
const M = {
  black: mat(0x23262b), dark: mat(0x17191d), steel: mat(0x4a5058),
  wood: mat(0x7a5b38), grip: mat(0x2e2620), flash: mat(0xffd977),
  skin: mat(0xd9a06b), vest: mat(0x3a3f46),
};

// Per-weapon viewmodel parts. All guns point -Z (away from camera).
// [x, y, z, sx, sy, sz, material, isBarrel?]
// Detailed: receivers, handguards, mags, stocks, sights, rails — box-composed.
const GUN_DEFS = {
  knife: { len: 0.28, parts: [
    [0, -0.02, -0.10, 0.020, 0.05, 0.16, M.steel],        // blade
    [0, 0.012, -0.16, 0.012, 0.02, 0.05, M.flash],         // edge glint
    [0, -0.05, 0.03, 0.030, 0.045, 0.10, M.grip],          // handle
    [0, -0.028, -0.015, 0.052, 0.052, 0.02, M.dark],       // guard
  ] },
  glock: { len: 0.30, parts: [
    [0, 0.005, -0.10, 0.040, 0.062, 0.26, M.black],        // slide
    [0, -0.035, -0.09, 0.034, 0.030, 0.22, M.dark],        // frame
    [0, -0.085, 0.015, 0.034, 0.105, 0.05, M.grip],        // grip
    [0, -0.06, 0.055, 0.030, 0.045, 0.045, M.dark],        // beavertail
    [0, 0.042, -0.20, 0.010, 0.016, 0.010, M.steel],       // front sight
    [0, 0.042, 0.01, 0.030, 0.016, 0.010, M.steel],        // rear sight
    [0, -0.085, 0.015, 0.026, 0.05, 0.026, M.black],       // magwell
    [0, 0.008, -0.235, 0.020, 0.020, 0.05, M.dark, 1],     // muzzle
  ] },
  usp: { len: 0.32, parts: [
    [0, 0.005, -0.10, 0.040, 0.062, 0.28, M.dark],         // slide
    [0, -0.035, -0.10, 0.034, 0.030, 0.24, M.black],       // frame
    [0, -0.085, 0.015, 0.034, 0.105, 0.05, M.grip],        // grip
    [0, -0.028, -0.26, 0.046, 0.046, 0.09, M.black],       // threaded suppressor
    [0, 0.042, -0.22, 0.010, 0.016, 0.010, M.steel],
    [0, 0.042, 0.0, 0.030, 0.016, 0.010, M.steel],
  ] },
  deagle: { len: 0.36, parts: [
    [0, 0.008, -0.11, 0.050, 0.085, 0.30, M.steel],        // big slide
    [0, -0.03, -0.11, 0.026, 0.030, 0.24, M.dark],         // rib
    [0, -0.095, 0.02, 0.038, 0.115, 0.055, M.grip],
    [0, 0.055, -0.23, 0.012, 0.018, 0.012, M.steel],
    [0, 0.055, 0.01, 0.036, 0.018, 0.012, M.steel],
    [0, 0.010, -0.275, 0.026, 0.026, 0.07, M.dark, 1],     // muzzle brake
  ] },
  mp9: { len: 0.42, parts: [
    [0, 0.005, -0.12, 0.044, 0.080, 0.34, M.black],        // receiver
    [0, -0.10, 0.01, 0.034, 0.14, 0.05, M.grip],           // pistol grip
    [0, -0.09, -0.10, 0.030, 0.15, 0.045, M.dark],         // fore grip
    [0, -0.10, -0.055, 0.032, 0.12, 0.05, M.steel],        // mag
    [0, 0.052, -0.05, 0.014, 0.030, 0.20, M.dark],         // top rail
    [0, 0.075, -0.05, 0.020, 0.025, 0.06, M.steel],        // sight
    [0, -0.005, 0.12, 0.030, 0.05, 0.10, M.dark],          // folded stock
    [0, 0.010, -0.30, 0.020, 0.020, 0.06, M.dark, 1],
  ] },
  mp5: { len: 0.46, parts: [
    [0, 0.005, -0.13, 0.046, 0.085, 0.38, M.dark],         // receiver
    [0, -0.10, 0.0, 0.036, 0.14, 0.05, M.grip],
    [0, -0.055, -0.14, 0.034, 0.065, 0.14, M.black],       // slim handguard
    [0, -0.115, -0.05, 0.030, 0.115, 0.055, M.steel],      // curved mag hint
    [0, 0.055, -0.06, 0.014, 0.030, 0.24, M.dark],         // rail
    [0, 0.080, -0.07, 0.022, 0.028, 0.07, M.steel],
    [0, 0.0, 0.14, 0.034, 0.06, 0.12, M.grip],             // stock
    [0, 0.012, -0.33, 0.022, 0.022, 0.07, M.dark, 1],
  ] },
  ak: { len: 0.62, parts: [
    [0, 0.005, -0.16, 0.048, 0.085, 0.42, M.black],        // receiver
    [0, -0.02, -0.38, 0.038, 0.065, 0.24, M.wood],         // upper handguard (wood)
    [0, -0.05, -0.38, 0.034, 0.030, 0.24, M.dark],         // gas tube
    [0, -0.045, -0.10, 0.042, 0.045, 0.14, M.wood],        // lower handguard (wood)
    [0, -0.115, -0.06, 0.032, 0.115, 0.09, M.steel],       // curved mag
    [0, -0.10, 0.02, 0.036, 0.12, 0.05, M.grip],           // pistol grip
    [0, 0.0, 0.16, 0.038, 0.075, 0.20, M.wood],            // wooden stock
    [0, 0.062, -0.06, 0.012, 0.030, 0.16, M.dark],         // rear sight block
    [0, 0.048, -0.44, 0.014, 0.030, 0.05, M.steel],        // front sight
    [0, 0.010, -0.52, 0.018, 0.018, 0.10, M.dark, 1],      // barrel + slant brake
    [0, 0.018, -0.575, 0.022, 0.030, 0.03, M.dark],        // slant brake tip
  ] },
  dmr: { len: 0.70, parts: [
    [0, 0.0, -0.14, 0.046, 0.088, 0.48, M.black],          // receiver
    [0, -0.02, -0.42, 0.034, 0.055, 0.28, M.grip],          // tan handguard
    [0, -0.015, -0.60, 0.020, 0.020, 0.20, M.dark, 1],      // long barrel
    [0, 0.095, -0.08, 0.032, 0.032, 0.30, M.black],         // scope tube (lower than awp)
    [0, 0.095, 0.06, 0.038, 0.038, 0.05, M.black],          // objective
    [0, 0.095, -0.24, 0.034, 0.034, 0.05, M.black],         // eyepiece
    [0, 0.058, -0.02, 0.013, 0.036, 0.05, M.steel],         // mounts
    [0, 0.058, -0.16, 0.013, 0.036, 0.05, M.steel],
    [0, -0.10, -0.02, 0.030, 0.10, 0.07, M.steel],          // mag (FN-style)
    [0, -0.10, 0.03, 0.036, 0.12, 0.05, M.grip],            // grip
    [0, 0.0, 0.18, 0.036, 0.07, 0.22, M.grip],              // stock
    [0, -0.04, 0.24, 0.028, 0.042, 0.07, M.dark],           // cheek pad
  ] },
  m4: { len: 0.60, parts: [
    [0, 0.005, -0.16, 0.048, 0.085, 0.42, M.black],        // receiver
    [0, -0.045, -0.36, 0.036, 0.055, 0.22, M.dark],        // round handguard
    [0, -0.10, -0.05, 0.030, 0.11, 0.06, M.dark],          // straight mag
    [0, -0.10, 0.02, 0.036, 0.12, 0.05, M.grip],
    [0, 0.0, 0.15, 0.034, 0.065, 0.18, M.black],           // buffer stock
    [0, 0.062, -0.10, 0.014, 0.032, 0.30, M.dark],         // carry rail
    [0, 0.082, -0.24, 0.020, 0.028, 0.05, M.steel],        // front sight post
    [0, 0.082, -0.02, 0.024, 0.028, 0.05, M.steel],        // rear sight
    [0, 0.010, -0.50, 0.018, 0.018, 0.12, M.dark, 1],
  ] },
  awp: { len: 0.78, parts: [
    [0, 0.0, -0.20, 0.050, 0.095, 0.62, M.dark],           // long action/body
    [0, -0.055, -0.30, 0.040, 0.050, 0.34, M.black],       // barrel shroud
    [0, -0.02, -0.52, 0.022, 0.022, 0.22, M.dark, 1],      // long barrel
    [0, 0.10, -0.10, 0.034, 0.034, 0.34, M.black],         // scope tube
    [0, 0.10, 0.08, 0.040, 0.040, 0.05, M.black],          // scope objective
    [0, 0.10, -0.28, 0.036, 0.036, 0.05, M.black],         // scope eyepiece
    [0, 0.062, -0.03, 0.014, 0.038, 0.05, M.steel],        // scope mount
    [0, 0.062, -0.18, 0.014, 0.038, 0.05, M.steel],
    [0, -0.10, 0.0, 0.034, 0.10, 0.05, M.grip],
    [0, 0.0, 0.20, 0.040, 0.080, 0.20, M.black],           // stock
    [0, -0.045, 0.26, 0.030, 0.045, 0.08, M.grip],         // cheek pad
    [0, -0.115, -0.02, 0.028, 0.075, 0.10, M.steel],       // mag
  ] },
};

const VM_BASE = new THREE.Vector3(0.26, -0.24, -0.5);

let vmRoot = null, vmGun = null, vmFlash = null;
let flashUntil = 0;

export const VIEWMODEL = { kick: 0, kickPitch: 0, bobT: 0, reloadT: 1, drawT: 1 };

export function buildViewmodel(scene) {
  vmRoot = new THREE.Group();
  vmGun = new THREE.Group();
  // hands
  const handL = new THREE.Mesh(BOX, M.skin); handL.scale.set(0.05, 0.05, 0.10); handL.position.set(-0.02, -0.06, -0.10); handL.userData.isHand = true;
  const handR = new THREE.Mesh(BOX, M.skin); handR.scale.set(0.05, 0.05, 0.10); handR.position.set(0.02, -0.07, 0.04); handR.userData.isHand = true;
  vmGun.add(handL, handR);
  // muzzle flash (hidden)
  vmFlash = new THREE.Mesh(BOX, M.flash);
  vmFlash.scale.set(0.09, 0.09, 0.12); vmFlash.visible = false;
  vmGun.add(vmFlash);
  vmRoot.add(vmGun);
  vmRoot.position.copy(VM_BASE);
  scene.add(vmRoot);
  setViewmodelWeapon('glock');
}

let currentGun = 'glock';
let reloadEndAt = 0;
export function setViewmodelWeapon(name) {
  if (!vmGun) return;
  // clear old parts (keep hands + flash: rebuild all, simpler)
  while (vmGun.children.length) {
    const c = vmGun.children.pop();
    // geometries are shared; dispose nothing
  }
  const handL = new THREE.Mesh(BOX, M.skin); handL.scale.set(0.05, 0.05, 0.10); handL.position.set(-0.02, -0.06, -0.10); handL.userData.isHand = true;
  const handR = new THREE.Mesh(BOX, M.skin); handR.scale.set(0.05, 0.05, 0.10); handR.position.set(0.02, -0.07, 0.04); handR.userData.isHand = true;
  vmGun.add(handL, handR);
  vmFlash = new THREE.Mesh(BOX, M.flash);
  vmFlash.scale.set(0.09, 0.09, 0.12); vmFlash.visible = false;
  vmGun.add(vmFlash);
  const def = GUN_DEFS[name] || GUN_DEFS.knife;
  vmMagMeshes = [];
  for (const [x, y, z, sx, sy, sz, m2, isBarrel] of def.parts) {
    const mesh = new THREE.Mesh(BOX, m2);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.userData.stockMat = m2;   // remember the factory finish (skin repaint restores it)
    vmGun.add(mesh);
    if (isBarrel) mesh.userData.isBarrel = true;
  }
  // tag mag meshes for the reload anim (parts roughly below the receiver, forward half)
  for (const mesh of vmGun.children) {
    if (mesh === vmFlash) continue;
    if (mesh.position.y < -0.06 && mesh.position.z > -0.25 && (mesh.userData.isBarrel !== true)) {
      mesh.userData.baseY = mesh.position.y;
      vmMagMeshes.push(mesh);
    }
  }
  vmGun.userData.barrelLen = def.len;
  currentGun = name;
  paintGun();
}

// ---- weapon finishes (shop cosmetics) ----
let activeFinish = 'stock', finMetal = null, finAccent = null;
export function setViewmodelFinish(id) {
  const f = WEAPON_SKINS.find(w => w.id === id) || WEAPON_SKINS[0];
  activeFinish = f.id;
  if (f.metal == null) { finMetal = null; finAccent = null; }
  else {
    finMetal = new THREE.MeshBasicMaterial({ color: f.metal });
    finAccent = new THREE.MeshBasicMaterial({ color: f.accent });
  }
  paintGun();
}
function paintGun() {
  if (!vmGun) return;
  for (const c of vmGun.children) {
    if (c === vmFlash || c.userData.isHand || !c.userData.stockMat) continue;
    if (!finMetal) { c.material = c.userData.stockMat; continue; }   // stock finish
    // barrels keep their dark steel; mags/grips go accent, everything else metal
    c.material = c.userData.isBarrel ? c.userData.stockMat
      : (c.position.y < -0.05 && Math.abs(c.position.x) < 0.06 ? finAccent : finMetal);
  }
}

// world-avatar gun finish: repaint the rifle parts of a third-person rig
const finishCache = new Map();
export function applyAvatarFinish(grp, finishId) {
  const f = WEAPON_SKINS.find(w => w.id === finishId);
  const gun = grp && grp.userData && grp.userData.gun;
  if (!gun) return;
  if (!f || f.metal == null) { for (const part of gun.children) part.material = M.black; return; }
  if (!finishCache.has(f.id)) finishCache.set(f.id, new THREE.MeshBasicMaterial({ color: f.metal }));
  const mat = finishCache.get(f.id);
  for (const part of gun.children) part.material = mat;
}

export function muzzleFlash() {
  if (!vmFlash) return;
  vmFlash.visible = true;
  flashUntil = performance.now() + 45;
  // position flash at barrel tip
  const len = vmGun.userData.barrelLen || 0.3;
  vmFlash.position.set(0, 0.008, -len - 0.03);
}

export function updateViewmodel(dt, opts) {
  if (!vmRoot) return;
  const { moving, speed, zooming, phase, reloadDurMs } = opts;
  const now = performance.now();
  const reloading = now < reloadEndAt;
  VIEWMODEL.bobT += dt * (moving ? 9 : 2.2);
  const bobX = Math.sin(VIEWMODEL.bobT) * (moving ? 0.012 : 0.003);
  const bobY = Math.abs(Math.cos(VIEWMODEL.bobT)) * (moving ? 0.010 : 0.002);
  VIEWMODEL.kick = Math.max(0, VIEWMODEL.kick - dt * 6);
  VIEWMODEL.kickPitch = Math.max(0, VIEWMODEL.kickPitch - dt * 8);
  if (VIEWMODEL.drawT < 1) VIEWMODEL.drawT = Math.min(1, VIEWMODEL.drawT + dt * 4);

  // reload animation phases (of total duration D): tilt-in 0-15%, mag-out 15-45%,
  // mag-in 45-75%, tap+rise 75-100%
  let rl = { dip: 0, tiltZ: 0, tiltX: 0, yaw: 0, mag: 1 };
  if (reloading) {
    const D = Math.max(400, reloadDurMs || (reloadEndAt - reloadStartAt));
    const t = 1 - (reloadEndAt - now) / D;
    VIEWMODEL.reloadT = t;
    if (t < 0.15) {
      const k = t / 0.15;
      rl.dip = k * 0.09; rl.tiltZ = k * 0.55; rl.tiltX = k * 0.22; rl.mag = 1;
    } else if (t < 0.45) {
      const k = (t - 0.15) / 0.3;
      rl.dip = 0.09 + k * 0.04; rl.tiltZ = 0.55; rl.tiltX = 0.22;
      rl.mag = 1 - k; rl.yaw = k * 0.3;
    } else if (t < 0.75) {
      const k = (t - 0.45) / 0.3;
      rl.dip = 0.13; rl.tiltZ = 0.55; rl.tiltX = 0.22;
      rl.mag = 0; rl.yaw = 0.3 - k * 0.3;
    } else {
      const k = (t - 0.75) / 0.25;
      rl.dip = 0.13 * (1 - k); rl.tiltZ = 0.55 * (1 - k); rl.tiltX = 0.22 * (1 - k);
      rl.mag = k;
    }
  } else {
    VIEWMODEL.reloadT = 1;
  }
  // magazine mesh visibility during reload (mag pops out/in)
  for (const m of vmMagMeshes) m.visible = rl.mag > 0.02;
  if (vmMagMeshes.length) {
    const drop = (1 - Math.abs(0.5 - rl.mag) * 2) * 0.14;
    for (const m of vmMagMeshes) m.position.y = m.userData.baseY - drop * (rl.mag < 0.5 ? 1 : 0.4);
  }

  const zoomF = zooming ? 1 : 0;
  const drawDip = (1 - VIEWMODEL.drawT) * 0.35;
  const sprintSway = opts.sprinting ? Math.sin(VIEWMODEL.bobT * 1.3) * 0.05 : 0;

  vmRoot.position.set(
    VM_BASE.x * (1 - zoomF * 0.75) + bobX * (1 - zoomF * 0.6) + sprintSway,
    VM_BASE.y * (1 - zoomF * 0.55) + bobY * (1 - zoomF * 0.6) - rl.dip - drawDip - sprintSway * 0.4,
    VM_BASE.z + VIEWMODEL.kick * 0.06 + (zooming ? 0.04 : 0)
  );
  vmGun.rotation.x = VIEWMODEL.kick * 0.10 + rl.tiltX;
  vmGun.rotation.z = bobX * 0.6 + rl.tiltZ;
  vmGun.rotation.y = rl.yaw;
  if (now > flashUntil) vmFlash.visible = false;
}

let reloadStartAt = 0;
let vmMagMeshes = [];
export function startReloadAnim(durMs = 2200) {
  reloadStartAt = performance.now();
  reloadEndAt = reloadStartAt + durMs;
}

// ---------- third-person avatars ----------
// Rig v2 — round body parts, no box-people: sphere head + rounded torso,
// two-segment arms with elbows, two-segment legs. Head/arms/gun are
// parented to the TORSO so crouch/slide move the whole upper body.
//
// OUTFITS: each outfit swaps the STRUCTURE of the clothing (headwear, vest
// type, packs, coats, masks). teamMat colors the cloth pieces; gear keeps
// its own materials. userData.cloth / userData.headwear let skins recolor
// cloth without touching gear (identity check: material === teamMat).
export function buildAvatar(teamMat, outfitId) {
  const grp = new THREE.Group();
  const outfit = outfitById(outfitId);
  const oid = outfit.id;
  // torso group = everything above the hips
  const torso = new THREE.Group(); torso.position.y = 0.95;
  // rounded torso: broad shoulders tapering down + shoulder domes
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.25, 0.46, 12), teamMat); body.position.y = 0.03; body.name = 'torso';
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.30, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), teamMat);
  cap.scale.set(1, 0.4, 1); cap.position.y = 0.24;   // FLAT shoulder dome, not a balloon
  const belt = new THREE.Mesh(BOX, M.boots); belt.position.y = -0.25; belt.scale.set(0.50, 0.09, 0.44);
  // head: proper size, clear of the torso dome (head r=0.16 sits at y=0.58)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), M.skin); head.position.y = 0.58;

  const headwear = [], cloth = [];
  cloth.push(body, cap);
  let vest = null, pack = null;
  let helmet = head;

  // ---- per-outfit gear ----
  if (oid === 'assault') {
    // ballistic helmet sized to the (now larger) head + open front-plate carrier
    helmet = new THREE.Mesh(new THREE.SphereGeometry(0.185, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), teamMat);
    helmet.position.y = 0.60; helmet.scale.set(1, 0.85, 1.08);
    const visor = new THREE.Mesh(BOX, M.gun); visor.position.set(0, 0.565, -0.14); visor.scale.set(0.22, 0.08, 0.05);
    headwear.push(helmet, visor);
    // carrier: FLAT panel with magazine pouches — sides and back stay open so
    // the body silhouette reads through (the old 0.4 cube hid everything)
    const plate = new THREE.Mesh(BOX, M.vest); plate.position.set(0, 0.08, -0.24); plate.scale.set(0.40, 0.40, 0.10);
    const pouch1 = new THREE.Mesh(BOX, M.grip); pouch1.position.set(-0.09, -0.04, -0.30); pouch1.scale.set(0.11, 0.12, 0.06);
    const pouch2 = new THREE.Mesh(BOX, M.grip); pouch2.position.set(0.09, -0.04, -0.30); pouch2.scale.set(0.11, 0.12, 0.06);
    vest = plate;
    headwear.push(pouch1, pouch2);
    pack = new THREE.Mesh(BOX, M.grip); pack.position.set(0, 0.07, 0.26); pack.scale.set(0.34, 0.40, 0.12);
  } else if (oid === 'scout') {
    // baseball cap + headset + light chest rig
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.07, 12), teamMat); capTop.position.y = 0.60;
    const brim = new THREE.Mesh(BOX, teamMat); brim.position.set(0, 0.585, -0.17); brim.scale.set(0.24, 0.02, 0.16);
    const bandL = new THREE.Mesh(BOX, M.gun); bandL.position.set(-0.16, 0.50, 0.02); bandL.scale.set(0.02, 0.10, 0.06);
    const bandR = new THREE.Mesh(BOX, M.gun); bandR.position.set(0.16, 0.50, 0.02); bandR.scale.set(0.02, 0.10, 0.06);
    headwear.push(capTop, brim, bandL, bandR);
    const rig = new THREE.Mesh(BOX, M.vest); rig.position.set(0, 0.10, 0.04); rig.scale.set(0.34, 0.26, 0.36);
    headwear.push(rig);
  } else if (oid === 'officer') {
    // tilted beret + high-collar jacket (torso flare) + shoulder boards
    const beret = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), teamMat);
    beret.position.y = 0.55; beret.scale.set(1.05, 0.55, 1.05); beret.rotation.z = 0.18;
    const stem = new THREE.Mesh(BOX, M.gun); stem.position.set(0.02, 0.615, 0.04); stem.scale.set(0.05, 0.03, 0.05);
    const boardL = new THREE.Mesh(BOX, M.gun); boardL.position.set(-0.26, 0.30, 0); boardL.scale.set(0.10, 0.04, 0.20);
    const boardR = new THREE.Mesh(BOX, M.gun); boardR.position.set(0.26, 0.30, 0); boardR.scale.set(0.10, 0.04, 0.20);
    headwear.push(beret, stem, boardL, boardR);
    const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.28, 0.40, 12), teamMat); jacket.position.y = 0.06;
    const collar = new THREE.Mesh(BOX, teamMat); collar.position.set(0, 0.30, 0.10); collar.scale.set(0.30, 0.08, 0.10);
    cloth.push(jacket, collar);
  } else if (oid === 'ghost') {
    // full balaclava (cloth-colored face) + hood + minimal webbing
    head.material = teamMat;
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), teamMat);
    hood.position.y = 0.50; hood.scale.set(1.15, 0.9, 1.2);
    headwear.push(hood);
    const webbing = new THREE.Mesh(BOX, M.gun); webbing.position.set(0, 0.12, 0.10); webbing.scale.set(0.44, 0.06, 0.30);
    headwear.push(webbing);
  } else if (oid === 'sas') {
    // gas mask (goggle discs + filter) + respirator harness
    const mask = new THREE.Mesh(BOX, M.gun); mask.position.set(0, 0.50, -0.12); mask.scale.set(0.26, 0.20, 0.14);
    const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 8), M.gun);
    filter.position.set(0, 0.46, -0.22); filter.rotation.x = Math.PI / 2;
    const gogL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), M.flash);
    gogL.position.set(-0.07, 0.515, -0.13); gogL.rotation.x = Math.PI / 2;
    const gogR = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), M.flash);
    gogR.position.set(0.07, 0.515, -0.13); gogR.rotation.x = Math.PI / 2;
    headwear.push(mask, filter, gogL, gogR);
    helmet = mask;                                  // mask covers the head
    vest = new THREE.Mesh(BOX, M.vest); vest.position.set(0, 0.08, 0.02); vest.scale.set(0.42, 0.34, 0.40);
    pack = new THREE.Mesh(BOX, M.grip); pack.position.set(0, 0.05, 0.24); pack.scale.set(0.30, 0.34, 0.12);
  } else if (oid === 'raptor') {
    // goggles + jaw guard + ghillie shoulder pads
    const strap = new THREE.Mesh(BOX, M.gun); strap.position.set(0, 0.55, -0.02); strap.scale.set(0.34, 0.05, 0.30);
    const gogL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 10), M.flash);
    gogL.position.set(-0.07, 0.51, -0.135); gogL.rotation.x = Math.PI / 2;
    const gogR = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 10), M.flash);
    gogR.position.set(0.07, 0.51, -0.135); gogR.rotation.x = Math.PI / 2;
    const jaw = new THREE.Mesh(BOX, M.gun); jaw.position.set(0, 0.44, -0.10); jaw.scale.set(0.24, 0.10, 0.12);
    headwear.push(strap, gogL, gogR, jaw);
    const padL = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 6), teamMat); padL.position.set(-0.30, 0.24, 0); padL.scale.set(1, 0.7, 1);
    const padR = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 6), teamMat); padR.position.set(0.30, 0.24, 0); padR.scale.set(1, 0.7, 1);
    headwear.push(padL, padR);
    vest = new THREE.Mesh(BOX, M.vest); vest.position.set(0, 0.08, 0.02); vest.scale.set(0.38, 0.34, 0.38);
  } else if (oid === 'juggernaut') {
    // full-visor heavy helmet + bomb-suit plating
    helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), teamMat);
    helmet.position.y = 0.52;
    const vplate = new THREE.Mesh(BOX, M.gun); vplate.position.set(0, 0.51, -0.15); vplate.scale.set(0.28, 0.20, 0.04);
    headwear.push(helmet, vplate);
    const chestP = new THREE.Mesh(BOX, M.vest); chestP.position.set(0, 0.08, -0.16); chestP.scale.set(0.44, 0.44, 0.10);
    const backP = new THREE.Mesh(BOX, M.vest); backP.position.set(0, 0.08, 0.18); backP.scale.set(0.44, 0.44, 0.10);
    const groin = new THREE.Mesh(BOX, M.vest); groin.position.set(0, -0.22, 0); groin.scale.set(0.42, 0.16, 0.34);
    vest = chestP; pack = backP;
    torso.userData = torso.userData || {};          // (plating added below)
    cloth.push(groin);
  } else if (oid === 'arctic') {
    // puffy winter coat + scarf + snow goggles on the bare head
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.48, 12), teamMat); coat.position.y = 0.04;
    const SCARF = new THREE.MeshBasicMaterial({ color: 0x8a2f2f });
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 14), SCARF);
    scarf.position.y = 0.36; scarf.rotation.x = Math.PI / 2;
    const tail = new THREE.Mesh(BOX, SCARF); tail.position.set(0.08, 0.22, 0.14); tail.scale.set(0.10, 0.24, 0.05);
    cloth.push(coat, scarf, tail);
    const gband = new THREE.Mesh(BOX, M.gun); gband.position.set(0, 0.55, -0.02); gband.scale.set(0.34, 0.05, 0.30);
    const ggogL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), M.flash);
    ggogL.position.set(-0.07, 0.55, -0.13); ggogL.rotation.x = Math.PI / 2;
    const ggogR = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), M.flash);
    ggogR.position.set(0.07, 0.55, -0.13); ggogR.rotation.x = Math.PI / 2;
    headwear.push(gband, ggogL, ggogR);
  }

  if (vest) headwear.push(vest);   // gear pieces tracked for potential recolor
  if (pack) headwear.push(pack);
  // arms: shoulder pivot -> upper arm -> ELBOW pivot -> forearm + hand
  const mkArm = (x) => {
    const shoulder = new THREE.Group(); shoulder.position.set(x, 0.22, 0);
    const upper = new THREE.Mesh(BOX, teamMat); upper.position.set(0, -0.12, -0.04); upper.scale.set(0.13, 0.30, 0.15);
    const elbow = new THREE.Group(); elbow.position.set(0, -0.24, -0.08);
    const fore = new THREE.Mesh(BOX, teamMat); fore.position.set(0, -0.03, -0.14); fore.scale.set(0.11, 0.12, 0.30);
    const hand = new THREE.Mesh(BOX, M.skin); hand.position.set(0, -0.03, -0.28); hand.scale.set(0.10, 0.10, 0.12);
    elbow.add(fore, hand); shoulder.add(upper, elbow);
    // tuck: angle the forearm inward so both hands meet on the rifle grip
    // (hands end up at ~(±0.09, -0.05, -0.29) — measured through the chain),
    // and pull the shoulders slightly in — arms no longer stick out wide
    elbow.rotation.y = x < 0 ? -0.75 : 0.75;
    shoulder.rotation.z = x < 0 ? 0.15 : -0.15;
    shoulder.userData.elbow = elbow;
    shoulder.name = x < 0 ? 'armL' : 'armR';
    return shoulder;
  };
  const armL = mkArm(-0.32), armR = mkArm(0.32);
  // rifle in both hands (in torso space) — receiver passes through the
  // tucked hands at (±0.09, −0.05, −0.29): a real two-hand rifle grip
  const gun = new THREE.Group(); gun.position.set(0, -0.02, -0.30);
  const receiver = new THREE.Mesh(BOX, M.black); receiver.scale.set(0.07, 0.11, 0.55);
  const mag = new THREE.Mesh(BOX, M.dark); mag.position.set(0, -0.10, 0.05); mag.scale.set(0.05, 0.14, 0.09);
  const barrel = new THREE.Mesh(BOX, M.dark); barrel.position.set(0, 0.01, -0.42); barrel.scale.set(0.035, 0.035, 0.30);
  const stock = new THREE.Mesh(BOX, M.grip); stock.position.set(0, -0.02, 0.30); stock.scale.set(0.05, 0.10, 0.18);
  gun.add(receiver, mag, barrel, stock);
  const extraCloth = cloth.filter(c => c !== body && c !== cap);
  torso.add(body, cap, belt, head, armL, armR, gun, ...headwear, ...extraCloth);
  // legs: hip pivot -> thigh -> KNEE pivot -> shin + boot
  const mkLeg = (x) => {
    const hip = new THREE.Group(); hip.position.set(x, 0.62, 0);
    const thigh = new THREE.Mesh(BOX, teamMat); thigh.position.y = -0.21; thigh.scale.set(0.20, 0.42, 0.24);
    const knee = new THREE.Group(); knee.position.y = -0.42;
    const shin = new THREE.Mesh(BOX, teamMat); shin.position.y = -0.17; shin.scale.set(0.17, 0.34, 0.20);
    const boot = new THREE.Mesh(BOX, M.boots); boot.position.set(0, -0.33, 0.04); boot.scale.set(0.20, 0.13, 0.30);
    knee.add(shin, boot); hip.add(thigh, knee);
    hip.userData.knee = knee;
    return hip;
  };
  const legL = mkLeg(-0.15), legR = mkLeg(0.15);
  grp.add(torso, legL, legR);
  grp.bones = {
    torso, legL, legR, armL, armR,
    legLKnee: legL.userData.knee, legRKnee: legR.userData.knee,
  };
  grp.userData = { body, head, helmet, vest, legL, legR, armL, armR, gun, torso, headwear, cloth };
  return { grp };
}

export function setAvatarWeapon(grp, weaponName) {
  const gun = grp.userData.gun;
  const long = weaponName === 'awp' ? 1.35 : ['ak', 'm4', 'mp5', 'mp9', 'dmr'].includes(weaponName) ? 1.1 : 0.55;
  gun.scale.set(1, 1, long);
  gun.visible = weaponName !== 'knife';
}

export function buildNameLabel(text) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  paintNameLabel(cv, text, '#eef3f8');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.scale.set(1.9, 0.48, 1);
  sp.position.y = 2.05;
  sp.userData.text = text;   // kept so name-color cosmetics can repaint it
  return sp;
}

// draw (or redraw) a name onto a 256x64 label canvas — shared by build + recolor
export function paintNameLabel(cv, text, color) {
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.font = 'bold 34px system-ui';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(8,10,14,0.55)';
  const w = Math.min(250, ctx.measureText(text).width + 28);
  ctx.beginPath();
  ctx.roundRect((256 - w) / 2, 8, w, 48, 10);
  ctx.fill();
  ctx.fillStyle = color || '#eef3f8';
  ctx.fillText(text, 128, 44);
}

export function setViewmodelVisible(v) { if (vmRoot) vmRoot.visible = v; }
