// Strikepoint client — Three.js world, FPS controls, netcode, HUD.
// Low-RAM choices: static geometry merged into a handful of meshes, one shared
// material per color, MeshBasicMaterial only (no lights), one small canvas.

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createMap } from '../shared/map.js';
import { WEAPONS, TEAM, MAX_PLAYERS, PLAYER_EYE, MOVE_SPEED, PLAYER_RADIUS, PLAYER_HEIGHT, JUMP_VEL, GRAVITY, FFA_KILL_LIMIT, TDM_KILL_LIMIT, SLIDE_TIME, SLIDE_COOLDOWN, CROUCH_EYE, SNAPSHOT_MS } from '../shared/constants.js';
import { movePlayer, trySlide } from '../shared/sim.js';
import { WEAPONS as W } from '../shared/constants.js';
import { Net } from './net.js';
import { TOUCH_ENABLED, setTouchVisible, applyTouch, takeLookDelta, setTouchSens, consumeReloadPulse, onEmotePressed, nextEmote } from './touch.js';
import { buildViewmodel, buildAvatar, buildNameLabel, paintNameLabel, setAvatarWeapon, setViewmodelWeapon, setViewmodelFinish, applyAvatarFinish, VIEWMODEL, updateViewmodel, startReloadAnim, setViewmodelVisible, muzzleFlash } from './viewmodel.js';
import { createAnimator } from './avatarAnim.js';
import { initFx, spawnImpact, spawnBlood, spawnDamageNumber, updateFx } from './fx.js';
import { initHpBars, acquireHpBar, releaseHpBar, positionHpBar, clearHpBars } from './hpbar.js';
import { createMinimap } from './minimap.js';
import { triggerEmote, updateEmotes } from './emotes.js';
import { loadProfile, levelFor, rankName, recordMatch } from './profile.js';
import { SKINS, getSelectedSkin, setSelectedSkin, skinById, isSkinUnlocked, skinMaterials } from './skins.js';
import { OP_SKINS, WEAPON_SKINS, NAME_COLORS, owned, equipped, purchase, equip, earnMatchCredits, credits, ownedOutfits, equippedOutfit, equipOutfit, purchaseOutfit } from './shop.js';
import { OUTFITS } from '../shared/outfits.js';
const OUTFIT_LIST = Object.values(OUTFITS);
import { initBackdrop, setBackdropMap, setBackdropActive, renderBackdrop, setBackdropTeam, setBackdropSkin, setBackdropOutfit, emoteHero } from './backdrop.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const ui = {
  menu: $('menu'), buyMenu: $('buyMenu'), scoreboard: $('scoreboard'), hud: $('hud'),
  nameInput: $('nameInput'), btnQueue: $('btnQueue'), btnCreate: $('btnCreate'), btnJoin: $('btnJoin'),
  createBox: $('createBox'), joinBox: $('joinBox'), botCount: $('botCount'),
  btnDoCreate: $('btnDoCreate'), joinCode: $('joinCode'), btnDoJoin: $('btnDoJoin'),
  modeSelect: $('modeSelect'), mapPick: $('mapPick'), modeSelectC: $('modeSelectC'),
  btnSettings: $('btnSettings'), settingsBox: $('settingsBox'), mapSelect: $('mapSelect'),
  shopScreen: $('shopScreen'), shopItems: $('shopItems'), shopCredits: $('shopCredits'), btnShopClose: $('btnShopClose'),
  btnTutorial: $('btnTutorial'), tutorial: $('tutorial'), btnTutorialClose: $('btnTutorialClose'),
  btnReport: $('btnReport'), reportBox: $('reportBox'), reportText: $('reportText'),
  btnReportSend: $('btnReportSend'), btnReportCancel: $('btnReportCancel'), reportStatus: $('reportStatus'),
  loadoutMenu: $('loadoutMenu'), loPrimaries: $('loPrimaries'), loSecondaries: $('loSecondaries'),
  setSens: $('setSens'), sensVal: $('sensVal'), setFov: $('setFov'), fovVal: $('fovVal'),
  setVol: $('setVol'), volVal: $('volVal'), setTracers: $('setTracers'), setDmg: $('setDmg'),
  setFps: $('setFps'), fps: $('fps'),
  setAdsSens: $('setAdsSens'), adsSensVal: $('adsSensVal'), setInvertY: $('setInvertY'),
  setScale: $('setScale'), scaleVal: $('scaleVal'),
  setCrossSize: $('setCrossSize'), crossSizeVal: $('crossSizeVal'),
  setCrossThick: $('setCrossThick'), crossThickVal: $('crossThickVal'),
  setCrossColor: $('setCrossColor'), setCrossDot: $('setCrossDot'),
  setDmgSize: $('setDmgSize'), dmgSizeVal: $('dmgSizeVal'),
  setHpBars: $('setHpBars'), setKillfeed: $('setKillfeed'),
  btnResetSettings: $('btnResetSettings'),
  sbFfa: $('sbFfa'), sbFfaRows: $('sbFfaRows'),
  lobby: $('lobby'), lobbyCode: $('lobbyCode'), lobbyPlayers: $('lobbyPlayers'),
  lobbyMap: $('lobbyMap'), lobbyMode: $('lobbyMode'), lobbyCount: $('lobbyCount'),
  btnCopyCode: $('btnCopyCode'), btnLobbyStart: $('btnLobbyStart'), btnLobbyLeave: $('btnLobbyLeave'),
  browser: $('browser'), browserList: $('browserList'), btnBrowser: $('btnBrowser'),
  btnBrowserRefresh: $('btnBrowserRefresh'), btnBrowserClose: $('btnBrowserClose'),
  staminaFill: $('staminaFill'),
  ruleKillLimit: $('ruleKillLimit'), ruleRoundTime: $('ruleRoundTime'), ruleRespawn: $('ruleRespawn'), ruleFF: $('ruleFF'),
  status: $('status'), connDot: $('connDot'),
  buyList: $('buyList'), buyMoney: $('buyMoney'),
  sbRound: $('sbRound'), sbTeams: $('sbTeams'),
  crosshair: $('crosshair'),
  hudT: $('hudT'), hudCT: $('hudCT'), hudPhase: $('hudPhase'), timer: $('timer'),
  bombBar: $('bombBar'), bombFill: $('bombFill'), bombText: $('bombText'),
  killfeed: $('killfeed'), centerMsg: $('centerMsg'),
  minimap: $('minimap'), hitmark: $('hitmark'), hitDir: $('hitDir'),
  reloadBar: $('reloadBar'), reloadFill: $('reloadFill'), confirm: $('confirm'),
  chatLog: $('chatLog'), chatInput: $('chatInput'), btnChatSend: $('btnChatSend'), gameChatLog: $('gameChatLog'),
  btnLobbyReady: $('btnLobbyReady'), lobbyReadyCount: $('lobbyReadyCount'),
  podium: $('podium'), podTitle: $('podTitle'), podSub: $('podSub'), podTop3: $('podTop3'), podYou: $('podYou'), podXp: $('podXp'), btnPodMenu: $('btnPodMenu'),
  pcLevel: $('pcLevel'), pcRank: $('pcRank'), pcBar: $('pcBar'), pcFill: $('pcFill'), pcXp: $('pcXp'), pcKd: $('pcKd'), pcWins: $('pcWins'),
  playSel: $('playSel'),
  hp: $('hp'), ap: $('ap'), money: $('money'), wName: $('wName'),
  ammoMag: $('ammoMag'), ammoRes: $('ammoRes'),
  slot1: $('slot1'), slot2: $('slot2'), slot3: $('slot3'),
  scope: $('scope'),
};

// ---------- THREE setup (built once, reused) ----------
const BASE_FOV = 74;
// versatile settings (persisted)
const settings = Object.assign(
  { sensitivity: 1.0, fov: 74, volume: 0.8, showTracers: true, showDmg: true, showFps: false,
    adsSens: 0.5, invertY: false, renderScale: 1.0,
    crossLen: 10, crossThick: 2, crossColor: '#d9f0ff', crossDot: true,
    dmgSize: 1.75, hpBars: true, killfeed: true },
  JSON.parse(localStorage.getItem('sp_settings') || '{}')
);
function saveSettings() { localStorage.setItem('sp_settings', JSON.stringify(settings)); }
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
initBackdrop(renderer);
function applyRenderScale() {
  // small screens (phones) get a free perf boost automatically
  const autoScale = Math.min(innerWidth, innerHeight) < 500 ? 0.7 : 1;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * settings.renderScale * autoScale);
  renderer.setSize(innerWidth, innerHeight);
}
applyRenderScale();

const scene = new THREE.Scene();
// gradient sky (tiny canvas texture — no asset downloads)
const skyCv = document.createElement('canvas'); skyCv.width = 2; skyCv.height = 128;
const sctx = skyCv.getContext('2d');
const grad = sctx.createLinearGradient(0, 0, 0, 128);
grad.addColorStop(0, '#7fa8c9'); grad.addColorStop(0.55, '#a9c4d8'); grad.addColorStop(1, '#d7e2e8');
sctx.fillStyle = grad; sctx.fillRect(0, 0, 2, 128);
const skyTex = new THREE.CanvasTexture(skyCv); skyTex.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTex;
scene.fog = new THREE.Fog(0xa9c4d8, 60, 170);

// lighting: hemisphere sky + one sun — all Lambert materials react, no shadows (cheap)
const hemiLight = new THREE.HemisphereLight(0xdfeaf2, 0x54524c, 0.85);
scene.add(hemiLight);
const sun = new THREE.DirectionalLight(0xfff2d9, 0.55);
sun.position.set(30, 60, -20);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.05, 200);
camera.rotation.order = 'YXZ'; // CRITICAL: yaw->pitch order, otherwise looking around rolls the screen
const controls = new PointerLockControls(camera, document.body);

// separate scene for the first-person viewmodel (drawn on top, unaffected by world FOV zoom)
const vmScene = new THREE.Scene();
vmScene.add(new THREE.HemisphereLight(0xdfeaf2, 0x54524c, 1.25));
const vmCamera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 10);
buildViewmodel(vmScene);
initFx(scene);
initHpBars();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  vmCamera.aspect = innerWidth / innerHeight;
  vmCamera.updateProjectionMatrix();
  applyRenderScale();
});

// shared materials — Lambert for real lighting response, still just colors (no textures)
const lam = (c, opts = {}) => new THREE.MeshLambertMaterial({ color: c, ...opts });
const MAT = {
  floor:  lam(0x6a7480),
  gridLine: lam(0x606a76),
  wall:   lam(0x8f9ba6),
  wallTop: lam(0xb8c2cb),
  crate:  lam(0x9c7f56),
  crateAlt: lam(0x8a7150),
  crateDk:lam(0x76603f),
  skirt:  lam(0x525c66),
  low:    lam(0x77907e),
  siteA:  lam(0xb08a7d),
  siteB:  lam(0x7d94b0),
  t:      lam(0xd29a4a, { emissive: 0x40280a }),
  ct:     lam(0x7fb3e8, { emissive: 0x0c2c50 }),
  tDead:  lam(0x5c4a30),
  ctDead: lam(0x3f556e),
  gun:    lam(0x20242a),
  bomb:   lam(0xb03a2e),
  barrel: lam(0x8a4a3a),
  barrelTop: lam(0x6e3a2e),
  sandbag: lam(0x9a8f70),
  beam:   lam(0x4c5259),
  // per-map prop materials (recolored by applyEnv)
  asphalt: lam(0x3d434b),
  dash:    lam(0xd6d6c4),
  dust:    lam(0xb09a72),
  seam:    lam(0x58606a),
  carBody: lam(0x9a4a3e),
  carGlass: lam(0x282d33),
  container: lam(0x3f6f8a),
  containerDk: lam(0x2c5062),
  dumpster: lam(0x4a6b4f),
  pole:    lam(0x3a3f45),
  shelf:   lam(0x5f6a72),
  pallet:  lam(0x6b5a42),
  planter: lam(0x8a5a42),
  bush:    lam(0x4a7a3e),
  skin:   lam(0xd9a06b),
  vest:   lam(0x3a3f46),
  boots:  lam(0x2a2620),
};

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const sphGeo = new THREE.SphereGeometry(1, 8, 6);

function addBox(x, y, z, sx, sy, sz, mat) {
  const m = new THREE.Mesh(boxGeo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  scene.add(m);
  return m;
}

let map = null;
const worldMeshes = [], siteMeshes = [];

// per-map atmosphere: repaint the sky gradient, fog, sun/hemisphere light and ground
// palette from the map's env spec — each map gets its own mood, shared engine
function applyEnv(env) {
  const e = env || {};
  const g2 = sctx.createLinearGradient(0, 0, 0, 128);
  g2.addColorStop(0, e.skyTop || '#7fa8c9');
  g2.addColorStop(0.55, e.skyMid || '#a9c4d8');
  g2.addColorStop(1, e.skyHor || '#d7e2e8');
  sctx.fillStyle = g2; sctx.fillRect(0, 0, 2, 128);
  skyTex.needsUpdate = true;
  hemiLight.color.setHex(e.hemiSky ?? 0xdfeaf2);
  hemiLight.groundColor.setHex(e.hemiGround ?? 0x54524c);
  hemiLight.intensity = e.hemiI ?? 0.85;
  sun.color.setHex(e.sun ?? 0xfff2d9);
  sun.intensity = e.sunI ?? 0.55;
  MAT.floor.color.setHex(e.floor ?? 0x6a7480);
  MAT.gridLine.color.setHex(e.grid ?? 0x606a76);
  MAT.low.color.setHex(e.low ?? 0x779070);
  MAT.skirt.color.setHex(e.skirt ?? 0x525c66);
  MAT.wall.color.setHex(e.wall ?? 0x8f9ba6);
  MAT.wallTop.color.setHex(e.wallTop ?? 0xb8c2cb);
  MAT.crate.color.setHex(e.crate ?? 0x9c7f56);
  MAT.crateAlt.color.setHex(e.crateAlt ?? 0x8a7150);
  MAT.crateDk.color.setHex(e.crateDk ?? 0x76603f);
  MAT.siteA.color.setHex(e.siteA ?? 0xb08a7d);
  MAT.siteB.color.setHex(e.siteB ?? 0x7d94b0);
  MAT.asphalt.color.setHex(e.asphalt ?? 0x3d434b);
  MAT.dash.color.setHex(e.dash ?? 0xd6d6c4);
  MAT.dust.color.setHex(e.dust ?? 0xb09a72);
  MAT.seam.color.setHex(e.seam ?? 0x58606a);
  MAT.carBody.color.setHex(e.car ?? 0x9a4a3e);
  MAT.carGlass.color.setHex(e.carDark ?? 0x282d33);
  MAT.container.color.setHex(e.container ?? 0x3f6f8a);
  MAT.containerDk.color.setHex(e.container ?? 0x3f6f8a).multiplyScalar(0.7);
  MAT.dumpster.color.setHex(e.dumpster ?? 0x4a6b4f);
  MAT.pole.color.setHex(e.pole ?? 0x3a3f45);
  MAT.shelf.color.setHex(e.shelf ?? 0x5f6a72);
  MAT.pallet.color.setHex(e.pallet ?? 0x6b5a42);
  MAT.sandbag.color.setHex(e.sandbag ?? 0x9a8f70);
  MAT.beam.color.setHex(e.pole ?? 0x4c5259);
}

// world built from the SAME deterministic map the server simulates against
function buildWorld(seed) {
  // clear previous world objects
  for (const m of worldMeshes) scene.remove(m);
  worldMeshes.length = 0;
  for (const s of siteMeshes) scene.remove(s);
  siteMeshes.length = 0;
  if (map) map = null;

  map = createMap(worldMapName || 'arena', seed);
  scene.background = skyTex;
  applyEnv(map.env);
  scene.fog = new THREE.Fog(map.env?.fog ?? map.sky ?? 0xa9c4d8, map.half * 1.6, map.half * 4.2);

  // --- PERFORMANCE: build every static box into ONE merged mesh per material.
  // ~350 draw calls -> ~8. This is the single biggest lag fix.
  const buckets = new Map(); // mat -> THREE.BoxGeometry[]
  const push = (mat, x, y, z, sx, sy, sz) => {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    geo.translate(x, y, z);
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push(geo);
  };

  // per-map ground: roads with lane dashes (city), ripples (dust), tiles (complex),
  // big seam slabs (warehouse), tactical grid (arena) — all merged, still cheap
  const env = map.env || {};
  const style = env.floorStyle || 'grid';
  push(MAT.floor, 0, -0.5, 0, map.half * 2 + 2, 1, map.half * 2 + 2); // ground slab
  if (style === 'road') {
    const rw = env.roadW || 11;
    for (const rx of (env.roadsV || [])) { push(MAT.asphalt, rx, 0.006, 0, rw, 0.012, map.half * 2); for (let z = -map.half; z <= map.half; z += 6) push(MAT.dash, rx, 0.014, z + 3, 0.22, 0.012, 2.4); }
    for (const rz of (env.roadsH || [])) { push(MAT.asphalt, 0, 0.006, rz, map.half * 2, 0.012, rw); for (let x = -map.half; x <= map.half; x += 6) push(MAT.dash, x + 3, 0.014, rz, 2.4, 0.012, 0.22); }
  } else if (style === 'sand') {
    for (let i = 0; i < 26; i++) {
      const a = (i * 2.399) % (Math.PI * 2), r = 4 + (i * 3.7) % (map.half - 6);
      push(MAT.dust, Math.cos(a) * r, 0.008, Math.sin(a) * r, 2.6 + (i % 3), 0.01, 1.1 + (i % 2));
    }
  } else if (style === 'tile') {
    const T = Math.ceil(map.half / 8);
    for (let i = -T; i <= T; i++) { push(MAT.seam, i * 8, 0.012, 0, 0.12, 0.012, map.half * 2); push(MAT.seam, 0, 0.012, i * 8, map.half * 2, 0.012, 0.12); }
  } else if (style === 'seams') {
    for (let z = -map.half; z <= map.half; z += 12) push(MAT.seam, 0, 0.012, z, map.half * 2, 0.012, 0.18);
    for (let x = -map.half; x <= map.half; x += 16) push(MAT.seam, x, 0.012, 0, 0.18, 0.012, map.half * 2);
  } else {
    const G = Math.ceil(map.half / 4);
    for (let i = -G; i <= G; i++) {
      push(MAT.gridLine, i * 4, 0.012, 0, 0.07, 0.012, map.half * 2);
      push(MAT.gridLine, 0, 0.012, i * 4, map.half * 2, 0.012, 0.07);
    }
  }
  for (const c of map.colliders) {
    // dark skirting at the base of tall walls (adds depth)
    if (c.y1 >= 3.5 && c.kind !== 'beam' && c.hx < 40) {
      push(MAT.skirt, c.x, 0.22, c.z, c.hx * 2 + 0.18, 0.44, c.hz * 2 + 0.18);
    }
    if (c.kind === 'barrel') {
      // real cylinders, merged into their own bucket
      const geo = new THREE.CylinderGeometry(0.42, 0.42, c.y1, 10);
      geo.translate(c.x, c.y1 / 2, c.z);
      if (!buckets.has(MAT.barrel)) buckets.set(MAT.barrel, []);
      buckets.get(MAT.barrel).push(geo);
      const cap = new THREE.CylinderGeometry(0.44, 0.44, 0.08, 10);
      cap.translate(c.x, c.y1 - 0.04, c.z);
      if (!buckets.has(MAT.barrelTop)) buckets.set(MAT.barrelTop, []);
      buckets.get(MAT.barrelTop).push(cap);
      continue;
    }
    // --- distinctive props: cars, lamps, dumpsters, containers, shelves, pallets, planters ---
    switch (c.kind) {
      case 'car': case 'carTop': {
        const body = c.kind === 'car';
        push(body ? MAT.carBody : MAT.carGlass, c.x, (c.y0 + c.y1) / 2, c.z, c.hx * 2, c.y1 - c.y0, c.hz * 2);
        continue;
      }
      case 'lamp': push(MAT.pole, c.x, c.y1 / 2, c.z, 0.16, c.y1, 0.16); continue;
      case 'lampHead': push(MAT.pole, c.x, (c.y0 + c.y1) / 2, c.z, c.hx * 2, 0.16, c.hz * 2); push(MAT.dash, c.x + c.hx + 0.4, c.y0 - 0.02, c.z, 0.8, 0.02, 0.3); continue;
      case 'dumpster': {
        push(MAT.dumpster, c.x, (c.y0 + c.y1) / 2 + 0.05, c.z, c.hx * 2, c.y1 - c.y0 - 0.1, c.hz * 2);
        push(MAT.dash, c.x, c.y1 + 0.03, c.z, c.hx * 2 - 0.1, 0.06, c.hz * 2 - 0.1); // pale lid
        continue;
      }
      case 'container': {
        push(MAT.container, c.x, (c.y0 + c.y1) / 2, c.z, c.hx * 2, c.y1 - c.y0, c.hz * 2);
        for (let o = -c.hx + 0.4; o <= c.hx - 0.4; o += 0.5) push(MAT.containerDk, c.x + o, (c.y0 + c.y1) / 2, c.z + c.hz + 0.01, 0.08, c.y1 - c.y0 - 0.1, 0.02);
        continue;
      }
      case 'shelf': {
        push(MAT.shelf, c.x, (c.y0 + c.y1) / 2, c.z, c.hx * 2, 0.1, c.hz * 2);
        for (let o = -c.hz; o <= c.hz; o += Math.max(0.3, c.hz)) push(MAT.pole, c.x - c.hx + 0.08, (c.y0 + c.y1) / 2, c.z + o, 0.1, c.y1, 0.1);
        push(MAT.crateDk, c.x, c.y1 + 0.18, c.z, c.hx * 2 * 0.7, 0.3, c.hz * 2 * 0.8); // top stock
        continue;
      }
      case 'pallet': {
        push(MAT.pallet, c.x, 0.08, c.z, c.hx * 2, 0.16, c.hz * 2);
        push(MAT.crateDk, c.x, 0.45, c.z, c.hx * 1.1, 0.5, c.hz * 1.1); // boxes on the pallet
        continue;
      }
      case 'planter': {
        push(MAT.planter, c.x, c.y1 / 2, c.z, c.hx * 2, c.y1, c.hz * 2);
        push(MAT.bush, c.x, c.y1 + 0.25, c.z, c.hx * 1.6, 0.55, c.hz * 1.6);
        continue;
      }
    }
    const site = map.inSite(c.x, c.z);
    const low = c.y1 <= 1.2;
    // deterministic crate shade variation (breaks up the monotone)
    const shade = ((c.x * 7 + c.z * 13) | 0) % 2 === 0;
    const mat = c.kind === 'beam' ? MAT.beam
      : c.kind === 'sandbag' ? MAT.sandbag
      : site === 'A' ? MAT.siteA : site === 'B' ? MAT.siteB : low ? MAT.low
      : shade ? MAT.crate : MAT.crateAlt;
    push(mat, c.x, (c.y0 + c.y1) / 2, c.z, c.hx * 2, c.y1 - c.y0, c.hz * 2);
    if (c.kind !== 'beam' && c.kind !== 'sandbag') {
      if (c.y1 >= 3.5) push(MAT.wallTop, c.x, c.y1 + 0.12, c.z, c.hx * 2 + 0.24, 0.24, c.hz * 2 + 0.24);
      else if (c.y1 >= 1.8) push(MAT.crateDk, c.x, c.y1 + 0.07, c.z, c.hx * 2 + 0.14, 0.14, c.hz * 2 + 0.14);
    }
  }
  // bomb site letters painted on the ground (merged into the same buckets)
  for (const [site, ch] of [[map.siteA, 'A'], [map.siteB, 'B']]) {
    const mat = site === map.siteA ? MAT.siteA : MAT.siteB;
    const u = site.r / 5; // scale letters with site radius
    const seg = (dx, dz, w, d) => push(mat, site.x + dx * u, 0.02, site.z + dz * u, w * u, 0.02, d * u);
    if (ch === 'A') {
      seg(-2.2, 2.2, 0.8, 5.4); seg(2.2, 2.2, 0.8, 5.4); seg(0, 0.2, 5.2, 0.8); seg(0, 2.8, 3.6, 0.8);
    } else {
      seg(-2.2, 0.2, 0.8, 5.2); seg(2.2, 0.2, 0.8, 5.2); seg(0, 0.2, 3.6, 0.8); seg(0, 2.4, 3.6, 0.8);
    }
  }
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.frustumCulled = false; // one big mesh: skip per-chunk culling overhead
    scene.add(mesh);
    worldMeshes.push(mesh);
  }
}

// ---------- player avatars (see viewmodel.js) ----------

// ---------- game state ----------
let worldBuiltFor = -1;
let worldMapName = null;
let myId = null;
let inRoom = false;
let roomKind = null;
const worldPlayers = new Map();
const stateList = new Map();   // id -> latest state row (names for killfeed)
let phase = 'warmup', phaseEndsAt = 0, round = 0, score = [0, 0];
let bombCarrier = null, bombPos = null, droppedBombPos = null, bombTimer = null;
let plantProgress = 0, defuseProgress = 0, winner = null, winnerName = null;
let buyOpen = false, tabHeld = false, loOpen = false, lobbyOpen = false;
let gameMode = 'defuse';
let alive = false, myTeam = TEAM.T, myW = 'knife', myMoney = 800, myAmmoTxt = '';
let mySlots = { primary: null, secondary: 'glock', melee: 'knife' };
let reloadAnimUntil = 0, reloadDurMs = 2200;
let vmWeaponShown = null;
const input = { mx: 0, mz: 0, jump: false, fire: false, zoom: false, yaw: 0, pitch: 0, sprint: false, slide: false };
let sprintHeld = false, slideQueued = false, slideHoldUntil = 0, slideWasHeld = false;
let myHp = 100, myStamina = 100, staminaLocked = false, crouchHeld = false;
let crouched = false;
let roomCode = null, isHost = false;
let myLoadout = { primary: null, secondary: 'usp' };
let myRespawnAt = 0;

// fov / zoom state
let zooming = false;
let recoil = 0, recoilKick = 0, bobPhase = 0, bobAmt = 0;
let prevOnGround = true, lastFall = 0, landDip = 0, lastLandPlayed = 0;
let lastStepX = 0, lastStepZ = 0;
function landDipFresh() { const n = performance.now(); if (n - lastLandPlayed > 400) { lastLandPlayed = n; return true; } return false; }
let bombMesh = null;

// ---------- combat feedback: minimap / hitmarker / hit-direction / reload bar ----------
const minimap = createMinimap(ui.minimap);
let minimapDots = [];   // bomb / dropped-bomb dots

function showHitmarker(head) {
  ui.hitmark.classList.remove('pop', 'head');
  if (head) ui.hitmark.classList.add('head');
  void ui.hitmark.offsetWidth;               // restart CSS animation
  ui.hitmark.classList.add('pop');
}

let hitDirUntil = 0;
function showHitDir(fromX, fromZ) {
  // rotate a red arc around the crosshair toward the shooter (screen space)
  const ang = Math.atan2(fromX - local.x, fromZ - local.z); // world angle to shooter
  let rel = ang - (input.yaw ?? local.yaw);                 // relative to view
  rel = Math.atan2(Math.sin(rel), Math.cos(rel));           // wrap
  ui.hitDir.style.transform = `rotate(${-rel}rad)`;
  ui.hitDir.classList.add('show');
  hitDirUntil = performance.now() + 750;
}

function updateReloadBar() {
  const now = performance.now();
  const active = now < reloadAnimUntil;
  ui.reloadBar.classList.toggle('hidden', !active || !alive);
  if (active) {
    const total = reloadDurMs;
    const done = 1 - (reloadAnimUntil - now) / Math.max(1, total);
    ui.reloadFill.style.width = Math.max(0, Math.min(100, done * 100)) + '%';
  }
}

function showKillConfirm(head) {
  ui.confirm.textContent = head ? 'HEADSHOT KILL' : 'ELIMINATED';
  ui.confirm.classList.remove('pop');
  void ui.confirm.offsetWidth;
  ui.confirm.classList.add('pop');
}

// keep a small HUD pointer where MY OWN body is (helps touch players see the
// position their teammates see — useful when emoting)
function positionSelfName() {
  const el = document.getElementById('selfPtr');
  if (!el) return;
  const mine = inRoom ? worldPlayers.get(myId) : null;
  if (!mine || !mine.grp) { el.style.display = 'none'; return; }
  tmpV.set(mine.grp.position.x, mine.grp.position.y + 0.4, mine.grp.position.z).project(camera);
  if (tmpV.z > 1) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.left = ((tmpV.x * 0.5 + 0.5) * innerWidth) + 'px';
  el.style.top = ((-tmpV.y * 0.5 + 0.5) * innerHeight) + 'px';
}

// ---------- net ----------
const net = new Net(onMsg);
net.startSending();

function onMsg(m) {
  switch (m.t) {
    case 'welcome':
      ui.connDot.textContent = 'connected';
      ui.connDot.className = 'dot ok';
      myId = m.id;
      break;
    case 'hello-ok': break;
    case 'queued':
      ui.status.textContent = 'In queue… waiting for players (bots will fill)';
      break;
    case 'joined':
      inRoom = true;
      roomKind = m.kind;
      roomCode = m.room;
      isHost = !!(m.host);
      ui.menu.classList.add('hidden');
      ui.hud.classList.remove('hidden');
      if (m.kind === 'custom') showLobby();
      else if (!TOUCH_ENABLED) { try { controls.lock(); } catch {} }
      net.startSending();
      break;
    case 'created':
      ui.status.textContent = `Room ${m.code} created — share this code!`;
      break;
    case 'rooms':
      renderBrowser(m.rooms || []);
      break;
    case 'kicked':
      // back to menu
      inRoom = false; roomKind = null; roomCode = null; isHost = false;
      ui.hud.classList.add('hidden');
      ui.menu.classList.remove('hidden');
      ui.status.textContent = 'You were kicked from the room.';
      clearHpBars();
      break;
    case 'error':
      ui.status.textContent = m.msg;
      break;
    case 'state': applyState(m); break;
    case 'chat':
      addChat(ui.chatLog, m.from, m.text, m.sys);
      pushGameChat(m.from, m.text, m.sys);
      break;
    case 'lobby':
      if (lobbyOpen) {
        renderLobbyPlayers(m.players.map(p => ({ id: p.id, n: p.name, b: p.bot, tm: p.team, k: p.k, d: p.d, ready: p.ready })));
        const readyN = m.players.filter(p => p.ready).length;
        ui.lobbyReadyCount.textContent = `· ${readyN}/${m.players.length} ready`;
      }
      break;
    case 'disconnected':
      ui.connDot.textContent = 'disconnected';
      ui.connDot.className = 'dot err';
      break;
  }
}

// ---------- state application ----------
function applyState(m) {
  // rebuild when the map changes — NAME FIRST, then build (buildWorld reads worldMapName)
  if (m.sd !== worldBuiltFor || m.mn !== worldMapName) {
    const changedName = m.mn !== worldMapName;
    worldMapName = m.mn;
    buildWorld(m.sd);
    worldBuiltFor = m.sd;
    if (lobbyOpen) ui.lobbyMap.textContent = 'map: ' + (worldMapName || '—');
  }
  phase = m.ph; phaseEndsAt = m.pe; round = m.rd; score = m.sc;
  bombCarrier = m.bc; bombPos = m.bp; droppedBombPos = m.db; bombTimer = m.bt;
  plantProgress = m.pp; defuseProgress = m.dp; winner = m.wi; winnerName = m.wn;
  gameMode = m.mo || 'defuse';
  if (gameMode === 'defuse' && loOpen) toggleLoadout(false);

  const seen = new Set();
  const roomPlayers = [];
  for (const p of m.ps) {
    roomPlayers.push(p);
    if (p.id === myId) { myStamina = p.st ?? 100; }
    seen.add(p.id);      let wp = worldPlayers.get(p.id);
      if (!wp) {
        wp = {
          x: p.x, y: p.y, z: p.z, yaw: p.ya,
          lerpFrom: { x: p.x, y: p.y, z: p.z, yaw: p.ya }, lerpT: 1,
          sk: p.sk || 'default',
          of: p.of || 'assault',
          grp: null,
        };
        worldPlayers.set(p.id, wp);
        if (p.id !== myId) {
          const teamMat = p.tm === TEAM.T ? MAT.t : MAT.ct;
          const av = buildAvatar(teamMat, wp.of);
          const grp = av.grp;
          // apply the player's skin: cloth pieces take the colorway, gear stays gear
          const sm = skinMaterials(wp.sk, teamMat);
          if (sm) {
            for (const c of grp.userData.cloth) if (c.material === teamMat) c.material = sm.body;
            if (grp.userData.helmet && grp.userData.helmet.material === teamMat) grp.userData.helmet.material = sm.body;
            grp.userData.legL.children[0].material = sm.accent;
            grp.userData.legR.children[0].material = sm.accent;
            wp.skinBodyMat = sm.body;   // remembered: death/respawn must restore THIS, not plain team color
          }
        wp.animator = createAnimator(grp);
        // weapon finish (shop cosmetic)
        applyAvatarFinish(grp, p.wf || 'stock');
        wp.wf = p.wf || 'stock';
        if (p.n) {
          if (p.id === myId) {
            // my own avatar is invisible (first-person) but keeps its sprite:
            // we track it manually so the HUD can point at it (chat arrows etc.)
            const selfName = buildNameLabel(p.n);
            selfName.visible = false;
            grp.add(selfName);
          } else {
            grp.add(buildNameLabel(p.n));
          }
        }
        setAvatarWeapon(grp, p.w);
        scene.add(grp);
        wp.grp = grp;
      }
    }
    // interpolate from last snapshot
    wp.lerpFrom = { x: wp.x, y: wp.y, z: wp.z, yaw: wp.yaw };
    wp.lerpT = 0;
    if (p.id === myId) {
      // local prediction: server pos corrects gently
      const err = Math.hypot(p.x - local.x, p.z - local.z);
      if ((p.al === 1) !== alive) { local.x = p.x; local.y = p.y; local.z = p.z; }
      else if (err > 0.35) {
        local.x += (p.x - local.x) * 0.15;
        local.z += (p.z - local.z) * 0.15;
      }
      const wasAlive = alive;
      alive = p.al === 1;
      myTeam = p.tm; myW = p.w; myMoney = p.m; myHp = p.hp;
      // prediction correction: with local prediction the error stays tiny;
      // snap only on respawn/teleport, else soften
      if (err > 2.5) { local.x = p.x; local.z = p.z; local.y = p.y; }
      mySlots = { primary: p.pw, secondary: p.sw, melee: 'knife' };
      wp.k = p.k; wp.d = p.d; wp.n = p.n; wp.al = alive; wp.tm = p.tm;
      if (p.wf && p.wf !== wp.wf) { wp.wf = p.wf; applyAvatarFinish(wp.grp, p.wf); }
      ui.hp.textContent = p.hp;
      ui.ap.textContent = p.ar;
      ui.staminaFill.style.width = Math.max(0, Math.min(100, p.st ?? 100)) + '%';
      ui.staminaFill.classList.toggle('locked', !!(p.st <= 20));
      crouched = !!p.cr;
      ui.money.textContent = '$' + p.m;
      ui.wName.textContent = (WEAPONS[p.w] || WEAPONS.knife).name;
      const [mag, res] = (p.am || '').split('/');
      ui.ammoMag.textContent = mag ?? '';
      ui.ammoRes.textContent = res != null ? (res.trim() === 'Infinity' ? '∞' : '/ ' + res.trim()) : '';
      ui.ammoMag.classList.toggle('low', (mag | 0) > 0 && (mag | 0) <= 5);
      ui.ammoMag.classList.toggle('empty', (mag | 0) <= 0);
      if (vmWeaponShown !== p.w) {
        setViewmodelWeapon(p.w);
        vmWeaponShown = p.w;
        VIEWMODEL.drawT = 0;
      }
      if (!wasAlive && alive) {
        // (re)spawned: reset viewmodel + prediction drift
        VIEWMODEL.drawT = 0;
        reloadAnimUntil = 0;
        myRespawnAt = 0;
        local.slideT = 0; local.slideCd = 0;
        ui.money.textContent = '$' + p.m;
      }
      ui.slot1.textContent = mySlots.primary ? (WEAPONS[mySlots.primary]?.name || '') : '';
      ui.slot1.className = mySlots.primary && p.w === mySlots.primary ? 'active' : '';
      ui.slot2.textContent = mySlots.secondary ? (WEAPONS[mySlots.secondary]?.name || '') : '';
      ui.slot2.className = p.w === mySlots.secondary ? 'active' : '';
      ui.slot3.className = p.w === 'knife' ? 'active' : '';
    } else {
      wp.x = p.x; wp.y = p.y; wp.z = p.z; wp.yaw = p.ya;
      wp.al = p.al === 1; wp.tm = p.tm; wp.n = p.n; wp.act = p.act;
      wp.k = p.k; wp.d = p.d; wp.hp = p.hp; wp.sl = p.sl; wp.cr = p.cr; wp.sp = p.sp;
      if (wp.grp) {
        const isT = p.tm === TEAM.T;
        // dead = corpse tint; alive = the player's SKIN cloth if they have one
        const mat = !wp.al ? (isT ? MAT.tDead : MAT.ctDead) : (wp.skinBodyMat || (isT ? MAT.t : MAT.ct));
        wp.grp.userData.body.material = mat;
        wp.grp.userData.head.material = mat;
        wp.grp.visible = wp.al || errKeep(wp);
        wp.grp.rotation.y = wp.yaw;   // model faces -Z; sim forward is (-sin yaw, -cos yaw) — direct match
        if (wp.w !== p.w) { setAvatarWeapon(wp.grp, p.w); wp.w = p.w; }
        if (p.wf && p.wf !== wp.wf) { wp.wf = p.wf; applyAvatarFinish(wp.grp, p.wf); }
        if (p.of && p.of !== wp.of && wp.grp) {
          // outfit change mid-match: rebuild the avatar with the new clothing
          const isT = wp.tm === TEAM.T;
          const teamMat = isT ? MAT.t : MAT.ct;
          const sm = skinMaterials(wp.sk, teamMat);
          const av = buildAvatar(teamMat, p.of);
          const grp = av.grp;
          for (const c of grp.userData.cloth) if (c.material === teamMat) c.material = sm.body;
          if (grp.userData.helmet && grp.userData.helmet.material === teamMat) grp.userData.helmet.material = sm.body;
          grp.userData.legL.children[0].material = sm.accent;
          grp.userData.legR.children[0].material = sm.accent;
          applyAvatarFinish(grp, wp.wf || 'stock');
          if (wp.n) grp.add(buildNameLabel(wp.n));
          wp.animator = createAnimator(grp);
          scene.remove(wp.grp);
          scene.add(grp);
          wp.grp = grp;
          wp.of = p.of;
        }
        if (p.nc && p.nc !== wp.nc && wp.grp) {
          // name-color cosmetic: repaint this avatar's name label in place
          const sprite = wp.grp.children.find(c => c.isSprite);
          if (sprite && sprite.userData.text) {
            const nc = NAME_COLORS.find(c => c.id === p.nc);
            paintNameLabel(sprite.material.map.image, sprite.userData.text, nc ? nc.css : '#eef3f8');
            sprite.material.map.needsUpdate = true;
          }
          wp.nc = p.nc;
        }
      }
    }
  }
  for (const [id, wp] of worldPlayers) {
    if (!seen.has(id)) {
      if (wp.hpEl) { releaseHpBar(wp.hpEl); wp.hpEl = null; }
      if (wp.grp) { scene.remove(wp.grp); }
      worldPlayers.delete(id);
    }
  }

  // killfeed + center events
  for (const ev of m.ev || []) handleEvent(ev);

  // live lobby panel (custom rooms)
  if (lobbyOpen) renderLobbyPlayers(roomPlayers);

  updateHUD();
  maybeShowPodium();
}

// keep corpses visible for 6s after death
const deathSeenAt = new Map();
function errKeep(wp) {
  if (wp.al) { deathSeenAt.delete(wp); return true; }
  if (!deathSeenAt.has(wp)) deathSeenAt.set(wp, performance.now());
  return performance.now() - deathSeenAt.get(wp) < 6000;
}

let centerMsgUntil = 0;
function handleEvent(ev) {
  switch (ev.type) {
    case 'shot': {
      if (ev.by === myId) {
        playSound('shot');
        muzzleFlash();
        VIEWMODEL.kick = 1;
        recoilKick = 0.012 + Math.random() * 0.006;
        recoil = Math.min(2.5, recoil + 1);
      } else {
        playSound('shot', ev.x, ev.z);
        if (settings.showTracers) spawnTracer(ev);
      }
      break;
    }
    case 'impact': {
      // approximate surface normal: reflect back toward shooter
      const ox = local.x, oz = local.z;
      let nx = ox - ev.x, ny = (local.y + PLAYER_EYE) - ev.y, nz = oz - ev.z;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      if (ev.x === ox && ev.z === oz) { nx = 0; ny = 1; nz = 0; }
      spawnImpact(ev.x, ev.y, ev.z, nx, ny, nz);
      break;
    }
    case 'hit': {
      if (ev.by === myId) {
        if (settings.showDmg) spawnDamageNumber(ev.x, ev.y, ev.z, ev.dmg, ev.head, settings.dmgSize);
        spawnBlood(ev.x, ev.y, ev.z, ev.head);
        hitmarkerUntil = performance.now() + 130;
        showHitmarker(ev.head);
        if (ev.head) playDing();
        else playHit();
      }
      if (ev.to === myId) {
        flashDamage();
        if (ev.sx != null) showHitDir(ev.sx, ev.sz);   // red arc toward the shooter
        playSound('hurt');
      }
      break;
    }
    case 'death': {
      const by = ev.by != null ? worldPlayers.get(ev.by) : null;
      const to = worldPlayers.get(ev.id);
      const nameOf = (wp) => wp ? (wp.n || wp.id) : 'someone';
      if (ev.id === myId) {
        showCenter(gameMode === 'defuse' ? 'You died' : 'You died — respawning…', 1500);
        if (gameMode !== 'defuse') myRespawnAt = Date.now() + 3000;
      }
      if (ev.by === myId) {
        showKillConfirm(ev.headshot);
        playSound('confirm');
      }
      addKillfeed(nameOf(by), nameOf(to), ev.cause, ev.headshot);
      break;
    }
    case 'plant': showCenter('Bomb planted — ' + ev.site, 2000); playSound('plant', ev.x, ev.z); break;
    case 'emote': {
      if (ev.by !== myId) {
        const wp = worldPlayers.get(ev.by);
        if (wp && wp.grp) triggerEmote(wp.grp, ev.e);
        playSound('emote', ev.x, ev.z);
      } else {
        // my echo: in the lobby my arms ARE visible (the hub hero) — play it there
        if (lobbyOpen) emoteHero(ev.e);
        playSound('emote');
      }
      break;
    }
    case 'defuse': showCenter('Bomb defused', 2000); break;
    case 'explode': showCenter('TERRORISTS WIN', 2400); playSound('explode', ev.x, ev.z); shake(0.5); break;
    case 'note': showCenter(ev.text || '', 2200); break;
    case 'roundEnd': {
      const names = ['TERRORISTS WIN', 'COUNTER-TERRORISTS WIN'];
      showCenter(names[ev.winTeam] + ` (${ev.reason})`, 2400);
      break;
    }
    case 'bombDrop': case 'bombPickup': break;
  }
}

// ---------- local player movement (client prediction) ----------
// We simulate our own movement every frame with the SAME code the server runs,
// and gently correct toward the authoritative position from snapshots.
const local = { x: 0, y: 0, z: 0, vy: 0, onGround: true, input: { mx: 0, mz: 0, jump: false, sprint: false }, yaw: 0,
  slideT: 0, slideCd: 0, slideDirX: 0, slideDirZ: 0 };
const menuOpen = () => buyOpen || loOpen || lobbyOpen;
const keys = {};
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') sprintHeld = true;
  if (e.code === 'Tab') { e.preventDefault(); tabHeld = true; renderScoreboard(); ui.scoreboard.classList.remove('hidden'); }
  if (e.code === 'KeyB' && gameMode === 'defuse') toggleBuy();
  if (e.code === 'KeyL') toggleLoadout();
  if (e.code === 'KeyR') { net.action({ k: 'reload' }); startReloadAnim(reloadDurFor(myW) * 1000); reloadAnimUntil = performance.now() + reloadDurFor(myW) * 1000; }
  if ((e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyC') && !crouchHeld) {
    crouchHeld = true;
    // slide is crouch-while-sprinting; the server handles the edge.
    // send a short slide pulse too, as a fallback path for bots/older states
    slideHoldUntil = performance.now() + 120;
  }
  if (e.code === 'KeyE') {
    if (phase === 'live' && myTeam === TEAM.T && bombCarrier === myId) net.action({ k: 'plant' });
    else if (phase === 'planted' && myTeam === TEAM.CT) net.action({ k: 'defuse' });
  }
  // weapon slots: 1 primary, 2 secondary, 3 knife
  if (e.code === 'Digit1' && mySlots.primary) net.action({ k: 'slot', s: 'primary' });
  if (e.code === 'Digit2' && mySlots.secondary) net.action({ k: 'slot', s: 'secondary' });
  if (e.code === 'Digit3') net.action({ k: 'slot', s: 'melee' });
  // emotes: F wave, G point, V salute, H taunt, B thumbs — also work in the lobby
  const typingSomewhere = document.activeElement &&
    (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
  if (!e.repeat && inRoom && !typingSomewhere) {
    if (lobbyOpen) {
      // in the lobby the buy menu can't be open, so every key is free
      const LOBBY_EMOTE = { KeyF: 'wave', KeyG: 'point', KeyV: 'salute', KeyH: 'taunt', KeyB: 'thumbs' };
      if (LOBBY_EMOTE[e.code]) net.action({ k: 'emote', e: LOBBY_EMOTE[e.code] });
    } else if (gameMode !== 'defuse' && alive && !menuOpen()) {
      const EMOTE_KEYS = { KeyF: 'wave', KeyG: 'point', KeyV: 'salute', KeyH: 'taunt' };
      if (EMOTE_KEYS[e.code]) net.action({ k: 'emote', e: EMOTE_KEYS[e.code] });
      if (e.code === 'KeyB') net.action({ k: 'emote', e: 'thumbs' });
    }
  }
  if (e.code === 'Escape') {
    if (buyOpen) toggleBuy(false);
    else if (loOpen) toggleLoadout(false);
    else if (!ui.settingsBox.classList.contains('hidden')) ui.settingsBox.classList.add('hidden');
  }
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') sprintHeld = false;
  if (e.code === 'Tab') { tabHeld = false; ui.scoreboard.classList.add('hidden'); }
  if (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyC') crouchHeld = false;
});

function reloadDurFor(w) { return ((WEAPONS[w] || WEAPONS.knife).reload || 2.2); }
// touch: while the RUN toggle is on and you push forward hard, treat as sprint
function joySprintBoost() { return !!(document.getElementById('tSprint')?.classList.contains('press')); }

let mouseDown = false;
addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    mouseDown = true;
    if (!TOUCH_ENABLED && inRoom && !controls.isLocked && !menuOpen()) { try { controls.lock(); } catch {} }
  }
  if (e.button === 2) zooming = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) zooming = false; });
addEventListener('contextmenu', (e) => e.preventDefault());

// invert-Y: intercept mousemove before PointerLockControls and flip the pitch delta
const _mlEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const PI_2 = Math.PI / 2;
document.addEventListener('mousemove', (e) => {
  if (!settings.invertY || !controls.isLocked) return;
  e.stopImmediatePropagation();
  _mlEuler.setFromQuaternion(camera.quaternion);
  _mlEuler.y -= (e.movementX || 0) * 0.002 * controls.pointerSpeed;
  _mlEuler.x -= (e.movementY || 0) * 0.002 * controls.pointerSpeed * -1;
  _mlEuler.x = Math.max(-PI_2 + 0.01, Math.min(PI_2 - 0.01, _mlEuler.x));
  camera.quaternion.setFromEuler(_mlEuler);
}, true);

function readInput(dt) {
  if (!controls.isLocked || menuOpen()) {
    // touch devices have no pointer lock — keep reading while in a room
    if (!(TOUCH_ENABLED && inRoom) || menuOpen()) {
      input.mx = 0; input.mz = 0; input.jump = false; input.fire = false; input.zoom = false;
      input.sprint = false; input.slide = false; input.crouch = false;
      net.pushInput({ ...input });
      return;
    }
  }
  const fwd = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const right = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  input.mx = right; input.mz = fwd;
  input.jump = !!keys['Space'];
  input.fire = mouseDown;
  input.zoom = zooming;
  input.sprint = sprintHeld && fwd > 0;
  input.crouch = crouchHeld;   // hold to crouch; tap while sprinting = slide
  // slide: pulse the flag for ~120ms so the server registers the edge
  input.slide = performance.now() < slideHoldUntil;
  // ---- touch merge: joystick/buttons fold into the same input object
  if (TOUCH_ENABLED) {
    applyTouch(input);
    input.sprint = input.sprint || (input.mz > 0.55 && joySprintBoost());
    zooming = !!input.zoom;   // touch scope toggle drives the camera FOV
    if (consumeReloadPulse()) { net.action({ k: 'reload' }); startReloadAnim(reloadDurFor(myW) * 1000); reloadAnimUntil = performance.now() + reloadDurFor(myW) * 1000; }
    // look drag: same euler path the invert-Y handler uses
    const { dx, dy } = takeLookDelta();
    if (dx || dy) {
      _mlEuler.setFromQuaternion(camera.quaternion);
      _mlEuler.y -= dx * 0.0022 * settings.sensitivity;
      _mlEuler.x -= dy * 0.0022 * settings.sensitivity * (settings.invertY ? -1 : 1);
      _mlEuler.x = Math.max(-PI_2 + 0.01, Math.min(PI_2 - 0.01, _mlEuler.x));
      camera.quaternion.setFromEuler(_mlEuler);
    }
  }
  const d = camera.getWorldDirection(new THREE.Vector3());
  input.yaw = Math.atan2(-d.x, -d.z);
  input.pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
  // --- PREDICTION: advance our own position immediately (same physics as server).
  // Skip during frozen phases — the server refuses movement there too.
  if (alive && map && phase !== 'freeze' && phase !== 'roundEnd' && phase !== 'matchEnd') {
    local.yaw = input.yaw;
    local.input.mx = input.mx; local.input.mz = input.mz; local.input.jump = input.jump;
    local.input.sprint = input.sprint; local.input.crouch = input.crouch;
    // local slide edge for prediction
    if (input.slide && !local.prevSlide) {
      local.prevSlide = true;
      // replicate trySlide locally for prediction
      const sin = Math.sin(local.yaw), cos = Math.cos(local.yaw);
      const vx = -sin * input.mz + cos * input.mx, vz = -cos * input.mz - sin * input.mx;
      const l = Math.hypot(vx, vz) || 1;
      if (local.slideT <= 0 && local.slideCd <= 0 && local.onGround) {
        local.slideDirX = vx / l; local.slideDirZ = vz / l;
        local.slideT = SLIDE_TIME;
        local.slideCd = SLIDE_TIME + SLIDE_COOLDOWN;
      }
    } else if (!input.slide) local.prevSlide = false;
    movePlayer(map, local, dt);
  }
  net.pushInput({ ...input });
}

// ---------- rendering loop ----------
const tmpV = new THREE.Vector3();
let lastFrame = performance.now();

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  if (inRoom && ui.menu.classList.contains('hidden')) readInput(dt);

  // ADS zoom: lerped FOV + sensitivity drop (AWP gets a big scope)
  // sprint gives a small FOV punch for a feeling of speed
  const scopedW = WEAPONS[myW]?.scopeFov;
  const sprintFov = input.sprint && (input.mx || input.mz) ? 6 : 0;
  const targetFov = zooming ? (scopedW || 52) : settings.fov + sprintFov;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
  camera.updateProjectionMatrix();
  controls.pointerSpeed = (zooming ? settings.adsSens : 1) * settings.sensitivity;
  const awpScope = zooming && !!scopedW;
  ui.scope.style.display = awpScope ? 'block' : 'none';
  ui.crosshair.style.display = (awpScope || !alive) ? 'none' : 'block';

  // camera follows local player + recoil pitch + bob
  bobPhase += dt * (input.mx || input.mz ? 9 : 0);
  bobAmt += ((input.mx || input.mz ? 1 : 0) - bobAmt) * Math.min(1, dt * 8);
  recoil = Math.max(0, recoil - dt * 30);
  const bobY = Math.sin(bobPhase * 2) * 0.03 * bobAmt;
  const bobX = Math.cos(bobPhase) * 0.02 * bobAmt;
  // landing dip: brief camera drop scaled by fall speed
  if (local.onGround && !prevOnGround && lastFall > 6) landDip = Math.min(0.16, lastFall * 0.012);
  prevOnGround = local.onGround;
  lastFall = Math.max(0, -local.vy);
  landDip = Math.max(0, landDip - dt * 0.9);
  if (prevOnGround && lastFall > 6 && landDipFresh()) { playSound('land'); }
  const eyeNow = crouched ? CROUCH_EYE : PLAYER_EYE;
  camera.position.set(local.x + bobX, local.y + eyeNow + bobY + recoil * 0.01 - landDip * (1 + Math.sin(landDip * 40)), local.z);
  if (recoilKick) { camera.rotateX(recoilKick); recoilKick = 0; } // local-space pitch: never mixes with yaw
  // slide lean: tilt the camera a few degrees while sliding
  const slideRoll = (local.slideT > 0 && alive) ? -0.07 : 0;
  camera.rotation.z += (slideRoll - camera.rotation.z) * Math.min(1, dt * 10);

  const movingNow = !!(input.mx || input.mz);
  if (alive && local.onGround && movingNow) {
    stepDist += (input.sprint ? 1.55 : input.crouch ? 0.55 : 1) * Math.hypot(local.x - lastStepX, local.z - lastStepZ);
    lastStepX = local.x; lastStepZ = local.z;
    if (stepDist > 2.4) { stepDist = 0; playSound('step'); }
  } else { lastStepX = local.x; lastStepZ = local.z; }

  // viewmodel animation
  const moving = !!(input.mx || input.mz);
  updateViewmodel(dt, { moving, sprinting: input.sprint, zooming: zooming && !awpScope, phase });
  setViewmodelVisible(inRoom && alive && !(zooming && (WEAPONS[myW]?.scopeFov)));
  updateFx(dt);

  // enemy HP bars (settings-toggleable)
  if (settings.hpBars && inRoom && alive) {
    const camPos = camera.position;
    for (const [id, wp] of worldPlayers) {
      if (!wp.grp) continue;
      const isEnemy = gameMode === 'ffa' ? id !== myId : wp.tm !== myTeam;
      if (id === myId || !wp.al || !isEnemy) { if (wp.hpEl) { releaseHpBar(wp.hpEl); wp.hpEl = null; } continue; }
      if (!wp.hpEl) wp.hpEl = acquireHpBar(wp.n || id, wp.tm === TEAM.T ? '#d29a4a' : '#7fb3e8');
      const head = tmpV.set(wp.grp.position.x, wp.grp.position.y + 2.05, wp.grp.position.z);
      positionHpBar(wp.hpEl, camera, head, Math.max(0, (wp.hp ?? 100) / 100), 60);
    }
  } else {
    for (const [, wp] of worldPlayers) if (wp.hpEl) { releaseHpBar(wp.hpEl); wp.hpEl = null; }
  }    // interpolate avatars
    for (const [id, wp] of worldPlayers) {
    if (!wp.grp) continue;
    // interpolation tuned to the snapshot rate: snapshots arrive every
    // SNAPSHOT_MS, so the blend toward each new sample should take about that
    // long (+ a little buffer for network jitter). The old fixed ~100ms ramp
    // finished early, making players visibly stall between snapshots.
    wp.lerpT = Math.min(1, wp.lerpT + dt * (1000 / SNAPSHOT_MS));
    const t = wp.lerpT;
    const ease = t * t * (3 - 2 * t);   // smoothstep: fast start, soft landing
    wp.grp.position.set(
      wp.lerpFrom.x + (wp.x - wp.lerpFrom.x) * ease,
      wp.lerpFrom.y + (wp.y - wp.lerpFrom.y) * ease,
      wp.lerpFrom.z + (wp.z - wp.lerpFrom.z) * ease
    );
    const moved2 = (wp.x - wp.px) ** 2 + (wp.z - wp.pz) ** 2;
    wp.px = wp.x; wp.pz = wp.z;
    // yaw also steps with snapshots — ease it too, otherwise heads snap-snapping
    // (shortest arc so a yaw wrap from 3.1 to -3.1 doesn't spin the long way)
    let dyaw = wp.yaw - (wp.yawShown ?? wp.yaw);
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    wp.yawShown = (wp.yawShown ?? wp.yaw) + dyaw * ease;
    wp.grp.rotation.y = wp.yawShown;   // no +PI: visor/barrel already point -Z
    // --- death animation: ease-out fall with a little bounce, instead of a stiff tip-over
    if (wp.al) { wp.deadT = null; wp.grp.rotation.z = 0; }
    else {
      if (wp.deadT == null) { wp.deadT = 0; wp.deadDir = ((wp.x * 31 + wp.z * 17) | 0) % 2 ? 1 : -1; }
      wp.deadT += dt;
      const p = Math.min(1, wp.deadT / 0.55);
      const ease = 1 - (1 - p) * (1 - p);
      const bounce = Math.abs(Math.sin(p * Math.PI * 1.5)) * (1 - p) * 0.2;
      wp.grp.rotation.z = ease * (Math.PI / 2) * wp.deadDir;
      wp.grp.position.y += bounce - ease * 0.3; // settle onto the floor
    }
    // --- smoothed speed estimate over a 150ms window (snapshot stepping made
    // the old per-frame estimate spike to 0 between snapshots, freezing anims)
    wp.accD = (wp.accD || 0) + Math.sqrt(moved2);
    wp.accT = (wp.accT || 0) + dt;
    if (wp.accT >= 0.15) { wp.speed = wp.accD / wp.accT; wp.accD = 0; wp.accT = 0; }
    const speed = wp.speed || 0;
    // remote footsteps (distance-attenuated, globally throttled)
    if (wp.al && speed > 0.5) {
      wp.stepD = (wp.stepD || 0) + speed * dt;
      if (wp.stepD > 2.4) {
        wp.stepD = 0;
        const n = performance.now();
        if (n - lastStepSnd > 90) { lastStepSnd = n; playSound('step', wp.x, wp.z); }
      }
    }
    if (wp.animator) {
      wp.animator.set({
        dt,
        speed: wp.al ? speed : 0,
        sliding: !!wp.sl && wp.al,
        crouching: !!wp.cr && wp.al,
        dead: !wp.al,
      });
    }
  }

  // bomb model at position
  updateBombMesh();

  updateEmotes(dt, camera);

  // minimap (1 canvas blit + dots)
  if (inRoom && map) {
    minimap.ensure(map, worldMapName, worldBuiltFor);
    const dots = [];
    if (phase === 'planted' && bombPos) dots.push({ x: bombPos.x, z: bombPos.z, color: '#ff4030', ring: true });
    else if (phase === 'live' && droppedBombPos) dots.push({ x: droppedBombPos.x, z: droppedBombPos.z, color: '#ffb14a' });
    const mmPlayers = new Map();
    for (const [id, wp] of worldPlayers) {
      if (id === myId) continue;
      mmPlayers.set(id, { x: wp.x, z: wp.z, tm: wp.tm, alive: wp.al });
    }
    mmPlayers.set(myId, { x: local.x, z: local.z, tm: myTeam, me: true, alive });
    minimap.draw(mmPlayers, dots, input.yaw ?? local.yaw);
  }

  renderer.render(scene, camera);
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(vmScene, vmCamera);
  renderer.autoClear = true;
  positionSelfName();

  // menu backdrop: orbit the selected map while the menu is up
  const menuUp = !ui.menu.classList.contains('hidden');
  setBackdropActive(menuUp && !inRoom);
  if (menuUp && !inRoom) {
    const sel = ui.mapPick?.value || ui.mapSelect?.value || '';
    setBackdropMap(sel || 'arena');
    renderBackdrop(dt, innerWidth, innerHeight);
  }

  // touch overlay: visible in-game only (not menus/lobby)
  setTouchVisible(TOUCH_ENABLED && inRoom && !lobbyOpen && menuUp === false);
}
frame();

// ---------- bomb mesh ----------
function updateBombMesh() {
  const showDropped = droppedBombPos && phase === 'live';
  const showPlanted = phase === 'planted' && bombPos;
  const pos = showDropped ? droppedBombPos : showPlanted ? bombPos : null;
  if (pos) {
    if (!bombMesh) {
      bombMesh = new THREE.Mesh(boxGeo, MAT.bomb);
      bombMesh.scale.set(0.35, 0.25, 0.2);
      scene.add(bombMesh);
    }
    bombMesh.visible = true;
    bombMesh.position.set(pos.x, 0.15, pos.z);
    bombMesh.rotation.y += 0.02;
  } else if (bombMesh) bombMesh.visible = false;
}

// ---------- effects: tracers, hitmarkers, shake ----------
const tracers = [];
function spawnTracer(ev) {
  const dx = -Math.sin(ev.yaw) * Math.cos(ev.pitch);
  const dy = Math.sin(ev.pitch);
  const dz = -Math.cos(ev.yaw) * Math.cos(ev.pitch);
  const len = 18;
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(ev.x, ev.y, ev.z),
    new THREE.Vector3(ev.x + dx * len, ev.y + dy * len, ev.z + dz * len),
  ]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85 }));
  scene.add(line);
  tracers.push({ line, until: performance.now() + 70 });
  setTimeout(() => {
    scene.remove(line);
    geo.dispose();
    line.material.dispose();
    const i = tracers.findIndex(t => t.line === line);
    if (i >= 0) tracers.splice(i, 1);
  }, 70);
}

let hitmarkerUntil = 0;
let lastStepSnd = 0;
let stepDist = 0;
function spawnHitmarker() { hitmarkerUntil = performance.now() + 120; }
let flashUntil = 0;
function flashDamage() { flashUntil = performance.now() + 200; }
let shakeT = 0;
function shake(s) { shakeT = Math.max(shakeT, s); }

// ---------- HUD ----------
function updateHUD() {
  if (gameMode === 'ffa') {
    // FFA: my kills vs current leader
    let leaderK = 0, leaderName = '';
    for (const [id, wp] of worldPlayers) {
      if ((wp.k || 0) > leaderK) { leaderK = wp.k || 0; leaderName = wp.n || id; }
    }
    const me = worldPlayers.get(myId);
    ui.hudT.textContent = me ? (me.k || 0) : 0;
    ui.hudCT.textContent = leaderK;
    ui.hudPhase.textContent = phase === 'matchEnd'
      ? (winner === myId ? 'VICTORY' : `${winnerName || 'someone'} wins`)
      : `FFA · you vs ${leaderName || '—'}`;
  } else if (gameMode === 'tdm') {
    ui.hudT.textContent = score[0];
    ui.hudCT.textContent = score[1];
    ui.hudPhase.textContent = phase === 'matchEnd'
      ? (winner === myTeam ? 'VICTORY' : 'DEFEAT')
      : `TDM · first to ${TDM_KILL_LIMIT}`;
  } else {
    ui.hudT.textContent = score[0];
    ui.hudCT.textContent = score[1];
    ui.hudPhase.textContent =
      phase === 'freeze' ? 'FREEZE — press B to buy' :
      phase === 'live' ? (bombCarrier === myId ? 'YOU HAVE THE BOMB' : '') :
      phase === 'planted' ? 'BOMB PLANTED' :
      phase === 'roundEnd' ? 'round over' :
      phase === 'matchEnd' ? (winner === myTeam ? 'VICTORY' : 'DEFEAT') : 'warmup';
  }

  const remain = Math.max(0, (phaseEndsAt - Date.now()) / 1000);
  if (phase === 'planted') {
    ui.timer.textContent = `💣 ${Math.ceil(bombTimer ?? 0)}s`;
    ui.timer.style.color = '#e05252';
  } else if (phase === 'freeze') {
    ui.timer.textContent = `${Math.ceil(remain)}s`;
    ui.timer.style.color = '#e8a33d';
  } else {
    const mm = Math.floor(remain / 60), ss = Math.floor(remain % 60);
    ui.timer.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
    ui.timer.style.color = '';
  }

  // plant/defuse bar (defuse mode only)
  const prog = gameMode === 'defuse' ? Math.max(plantProgress, defuseProgress) : 0;
  if (prog > 0 && prog < 1) {
    ui.bombBar.classList.remove('hidden');
    ui.bombFill.style.width = (prog * 100) + '%';
    ui.bombText.textContent = plantProgress > 0 ? 'PLANTING…' : 'DEFUSING…';
  } else ui.bombBar.classList.add('hidden');

  // respawn countdown in tdm/ffa
  if (gameMode !== 'defuse' && !alive && myRespawnAt) {
    const secs = (myRespawnAt - Date.now()) / 1000;
    if (secs > 0) ui.hudPhase.textContent = `respawning in ${Math.ceil(secs)}s — press L for loadout`;
  }
}

function showCenter(text, ms) {
  ui.centerMsg.textContent = text;
  ui.centerMsg.style.opacity = 1;
  centerMsgUntil = performance.now() + ms;
}

function nameColorCss(id) {
  if (!id || id === 'none') return '';
  const nc = NAME_COLORS.find(c => c.id === id);
  return nc ? nc.css : '';
}
function addKillfeed(by, to, weapon, headshot) {
  const div = document.createElement('div');
  // name colors (cosmetic) — plain text otherwise (no HTML injection)
  const byC = by === (worldPlayers.get(myId)?.n) ? equipped().name : '';
  const toC = to === (worldPlayers.get(myId)?.n) ? equipped().name : '';
  div.textContent = `${by} ${headshot ? '☠' : '→'} ${to} (${weapon})`;
  if (byC || toC) {
    const s = document.createElement('span');
    s.textContent = div.textContent;
    s.style.color = nameColorCss(byC || toC);
    div.textContent = '';
    div.appendChild(s);
  }
  ui.killfeed.prepend(div);
  while (ui.killfeed.children.length > 5) ui.killfeed.lastChild.remove();
  setTimeout(() => div.remove(), 6000);
}

// ---------- buy menu ----------
const BUY_ITEMS = ['glock', 'usp', 'deagle', 'mp9', 'mp5', 'ak', 'm4', 'dmr', 'awp', 'armor'];
function toggleBuy(force) {
  const want = force !== undefined ? force : !buyOpen;
  if (want && phase !== 'freeze') { showCenter('Buy time is during freeze only', 1200); return; }
  if (want && !alive) return;
  buyOpen = want;
  ui.buyMenu.classList.toggle('hidden', !buyOpen);
  if (buyOpen) { renderBuy(); if (controls.isLocked) controls.unlock(); }
  else if (inRoom && !loOpen) controls.lock();
}
function renderBuy() {
  ui.buyMoney.textContent = '$' + myMoney;
  ui.buyList.innerHTML = '';
  for (const key of BUY_ITEMS) {
    const isArmor = key === 'armor';
    const spec = isArmor ? { name: 'Kevlar + Helmet', price: 650 } : WEAPONS[key];
    const div = document.createElement('div');
    div.className = 'buy-item' + (myMoney < spec.price ? ' cant' : '');
    div.innerHTML = `<span>${spec.name}</span><span class="price">$${spec.price}</span>`;
    div.onclick = () => {
      net.action({ k: 'buy', w: key });
      setTimeout(renderBuy, 120);
    };
    ui.buyList.appendChild(div);
  }
}

// ---------- lobby (custom rooms) ----------
function showLobby() {
  lobbyOpen = true;
  ui.lobby.classList.remove('hidden');
  ui.lobbyCode.textContent = roomCode || '----';
  ui.lobbyMap.textContent = 'map: ' + (worldMapName || '—');
  ui.lobbyMode.textContent = 'mode: ' + gameMode;
}
function hideLobby() {
  lobbyOpen = false;
  ui.lobby.classList.add('hidden');
  try { controls.lock(); } catch {}
}
function renderLobbyPlayers(list) {
  ui.lobbyCount.textContent = `${list.length}/20`;
  const rows = list.map(p => {
    const me = p.id === myId;
    const kickBtn = (isHost && !me && !p.b)
      ? `<button data-kick="${p.id}">kick</button>` : '';
    return `<div class="lob-row ${me ? 'me' : ''}">
      <span>${p.n || p.id}</span>
      ${p.b ? '<span class="tag">BOT</span>' : '<span class="tag">HUMAN</span>'}
      ${p.b ? '' : (p.ready ? '<span class="tag ready">✓ ready</span>' : '<span class="tag">not ready</span>')}
      <span class="tag">${p.tm === 0 ? 'T' : 'CT'} · ${p.k || 0}k/${p.d || 0}d</span>
      <span class="spacer"></span>${kickBtn}</div>`;
  }).join('');
  ui.lobbyPlayers.innerHTML = rows;
  for (const btn of ui.lobbyPlayers.querySelectorAll('[data-kick]')) {
    btn.onclick = () => net.kick(btn.dataset.kick);
  }
}
ui.btnCopyCode.onclick = () => {
  navigator.clipboard?.writeText(roomCode || '').then(() => {
    ui.btnCopyCode.textContent = 'copied!';
    setTimeout(() => { ui.btnCopyCode.textContent = 'copy'; }, 1200);
  }).catch(() => {});
};
ui.btnLobbyStart.onclick = hideLobby;
ui.btnLobbyLeave.onclick = () => location.reload();

// ---------- server browser ----------
ui.btnBrowser.onclick = () => { ui.browser.classList.remove('hidden'); net.listRooms(); };
ui.btnBrowserRefresh.onclick = () => net.listRooms();
ui.btnBrowserClose.onclick = () => ui.browser.classList.add('hidden');
function renderBrowser(rooms) {
  if (!rooms.length) { ui.browserList.innerHTML = '<div class="srv-empty">No custom rooms yet — create one!</div>'; return; }
  ui.browserList.innerHTML = rooms.map(r =>
    `<div class="srv-row"><span class="code">${r.code}</span>
      <span>${r.map}</span><span>${r.mode}</span>
      <span class="tag">${r.humans} human · ${r.bots} bots</span>
      <span class="spacer"></span><button data-join="${r.code}">Join</button></div>`).join('');
  for (const btn of ui.browserList.querySelectorAll('[data-join]')) {
    btn.onclick = () => { ensureName(); net.joinRoom(btn.dataset.join); ui.browser.classList.add('hidden'); };
  }
}

// ---------- loadout menu (tdm/ffa) ----------
const LO_PRIMARIES = ['mp9', 'mp5', 'ak', 'm4', 'dmr', 'awp'];
const LO_SECONDARIES = ['glock', 'usp', 'deagle'];
function toggleLoadout(force) {
  const want = force !== undefined ? force : !loOpen;
  if (want && gameMode === 'defuse') { showCenter('Loadout is TDM/FFA only — use B to buy', 1600); return; }
  if (want && !inRoom) return;
  loOpen = want;
  ui.loadoutMenu.classList.toggle('hidden', !loOpen);
  if (loOpen) { renderLoadout(); if (controls.isLocked) controls.unlock(); }
  else if (inRoom && !buyOpen) { try { controls.lock(); } catch {} }
}
function renderLoadout() {
  const mk = (keys, cur) => {
    let h = '';
    for (const k of keys) {
      const spec = WEAPONS[k];
      h += `<div class="lo-item ${cur === k ? 'sel' : ''}" data-w="${k}">
        <span>${spec.name}</span><span class="price">${spec.dmg} dmg · ${spec.rpm} rpm</span></div>`;
    }
    return h;
  };
  ui.loPrimaries.innerHTML = mk(LO_PRIMARIES, myLoadout.primary);
  ui.loSecondaries.innerHTML = mk(LO_SECONDARIES, myLoadout.secondary);
  for (const el of ui.loPrimaries.children) el.onclick = () => pickLoadout('primary', el.dataset.w);
  for (const el of ui.loSecondaries.children) el.onclick = () => pickLoadout('secondary', el.dataset.w);
}
function pickLoadout(slot, w) {
  if (slot === 'primary') myLoadout.primary = w;
  else myLoadout.secondary = w;
  net.loadout(myLoadout.primary, myLoadout.secondary);
  renderLoadout();
  showCenter('Loadout saved — applies on respawn', 1400);
}

// ---------- scoreboard ----------
function renderScoreboard() {
  if (gameMode === 'ffa') {
    ui.sbRound.textContent = `— first to ${FFA_KILL_LIMIT}`;
    ui.sbFfa.classList.remove('hidden');
    ui.sbTeams.style.display = 'none';
    const rows = [...worldPlayers.entries()]
      .map(([id, wp]) => ({ id, wp, me: id === myId }))
      .sort((a, b) => (b.wp.k || 0) - (a.wp.k || 0))
      .map(({ id, wp, me }) =>
        `<div class="sb-row ${wp.al ? '' : 'dead'} ${me ? 'me' : ''}">
           <span>${wp.n || id}</span><span>${wp.k || 0} / ${wp.d || 0}</span></div>`).join('');
    ui.sbFfaRows.innerHTML = rows;
    return;
  }
  ui.sbFfa.classList.add('hidden');
  ui.sbTeams.style.display = '';
  ui.sbRound.textContent = gameMode === 'tdm' ? `— first to ${TDM_KILL_LIMIT}` : `— round ${round}`;
  const teams = [[], []];
  for (const [id, wp] of worldPlayers) {
    teams[wp.tm || 0].push({ id, wp, me: id === myId });
  }
  const html = (list, cls, name) => {
    const rows = list.sort((a, b) => (b.wp.k || 0) - (a.wp.k || 0)).map(({ id, wp, me }) =>
      `<div class="sb-row ${wp.al ? '' : 'dead'} ${me ? 'me' : ''}">
         <span>${wp.n || id}</span><span>${wp.k || 0} / ${wp.d || 0}</span>
       </div>`).join('');
    return `<div class="sb-team ${cls}"><h3>${name} (${score[cls === 't' ? 0 : 1]})</h3>${rows}</div>`;
  };
  ui.sbTeams.innerHTML = html(teams[0], 't', 'TERRORISTS') + html(teams[1], 'ct', 'COUNTER-TERRORISTS');
}

// ---------- hit/kill sounds ----------
function playHit() {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(190, t + 0.07);
    g.gain.setValueAtTime(0.18 * settings.volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + 0.09);
  } catch {}
}
function playDing() {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(1180, t);
    o.frequency.exponentialRampToValueAtTime(890, t + 0.16);
    g.gain.setValueAtTime(0.3 * settings.volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + 0.24);
  } catch {}
}

// ---------- sound (tiny, synthesized — zero assets) ----------
let AC = null;
function playSound(kind, x, z) {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    const t = AC.currentTime;
    const dist = x != null ? Math.hypot(x - local.x, z - local.z) : 0;
    const vol = (x != null ? Math.max(0.02, 0.5 - dist / 70) : 0.4) * settings.volume;
    const o = AC.createOscillator(), g = AC.createGain();
    o.connect(g); g.connect(AC.destination);
    if (kind === 'shot') {
      o.type = 'square'; o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.08);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      o.start(t); o.stop(t + 0.1);
    } else if (kind === 'explode') {
      o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
      g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      o.start(t); o.stop(t + 0.75);
    } else if (kind === 'step') {
      o.type = 'triangle'; o.frequency.setValueAtTime(95 + Math.random() * 40, t);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.05);
      g.gain.setValueAtTime(vol * 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      o.start(t); o.stop(t + 0.08);
    } else if (kind === 'emote') {
      o.type = 'sine'; o.frequency.setValueAtTime(760, t);
      o.frequency.setValueAtTime(1020, t + 0.06);
      g.gain.setValueAtTime(0.08 * settings.volume, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.start(t); o.stop(t + 0.15);
    } else if (kind === 'hurt') {
      o.type = 'sawtooth'; o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
      g.gain.setValueAtTime(0.16 * settings.volume, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.start(t); o.stop(t + 0.15);
    } else if (kind === 'confirm') {
      o.type = 'sine'; o.frequency.setValueAtTime(540, t);
      o.frequency.setValueAtTime(720, t + 0.07);
      g.gain.setValueAtTime(0.14 * settings.volume, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.start(t); o.stop(t + 0.24);
    } else if (kind === 'land') {
      o.type = 'triangle'; o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.09);
      g.gain.setValueAtTime(0.12 * settings.volume, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      o.start(t); o.stop(t + 0.12);
    } else if (kind === 'plant') {
      o.type = 'sine'; o.frequency.setValueAtTime(880, t);
      o.frequency.setValueAtTime(660, t + 0.12);
      g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.start(t); o.stop(t + 0.32);
    }
  } catch {}
}

// ---------- overlay updates (damage flash, hitmarker, hit-dir, reload) ----------
setInterval(() => {
  const now = performance.now();
  if (now < centerMsgUntil) ui.centerMsg.style.opacity = 1;
  else if (ui.centerMsg.style.opacity !== '0') ui.centerMsg.style.opacity = 0;
  ui.crosshair.style.color = now < hitmarkerUntil ? '#ff4d4d' : settings.crossColor;
  ui.crosshair.classList.toggle('hm', now < hitmarkerUntil);
  renderer.domElement.style.filter = now < flashUntil ? 'brightness(1.35) saturate(0.5)' : '';
  if (now >= hitDirUntil) ui.hitDir.classList.remove('show');
  updateReloadBar();
  if (tabHeld) renderScoreboard();
}, 1000 / 20);

// fps counter
let fpsFrames = 0, fpsLast = performance.now();
setInterval(() => {
  fpsFrames++;
  const now = performance.now();
  if (now - fpsLast >= 500) {
    ui.fps.textContent = Math.round(fpsFrames * 1000 / (now - fpsLast)) + ' fps';
    fpsFrames = 0; fpsLast = now;
  }
}, 100);

// ---------- menu wiring ----------
function ensureName() {
  const n = ui.nameInput.value.trim() || 'Player';
  localStorage.setItem('sp_name', n);
  net.hello(n);
  return n;
}
ui.nameInput.value = localStorage.getItem('sp_name') || '';
ui.nameInput.addEventListener('input', () => {
  const hn = document.getElementById('heroName');
  if (hn) hn.textContent = (ui.nameInput.value.trim() || 'OPERATOR').toUpperCase();
});

ui.btnQueue.onclick = () => {
  ensureName();
  syncTiles();  // tiles are the source of truth -> hidden selects
  net.queue(true, { map: ui.mapPick.value || undefined, mode: ui.modeSelect.value });
  ui.status.textContent = 'Searching…';
};
// hero skin follows the selected side (defuse shows your team look)
function heroTeam() { return selMode === 'defuse' ? 't' : 't'; }
const _origSync = syncTiles;
syncTiles = function () { _origSync(); setBackdropTeam(heroTeam()); };

// settings wiring
function applySettings() {
  const cs = document.documentElement.style;
  cs.setProperty('--len', settings.crossLen + 'px');
  cs.setProperty('--thick', settings.crossThick + 'px');
  cs.setProperty('--gap', Math.max(3, Math.round(settings.crossLen * 0.45)) + 'px');
  document.querySelectorAll('#crosshair .ch').forEach(el => { el.style.background = settings.crossColor; });
  ui.crosshair.querySelector('.dot').style.display = settings.crossDot ? 'block' : 'none';
  ui.killfeed.style.display = settings.killfeed ? '' : 'none';
  applyRenderScale();
}
function syncSettingsUI() {
  ui.setSens.value = settings.sensitivity; ui.sensVal.textContent = (+settings.sensitivity).toFixed(2);
  ui.setFov.value = settings.fov; ui.fovVal.textContent = settings.fov;
  ui.setVol.value = settings.volume; ui.volVal.textContent = (+settings.volume).toFixed(2);
  ui.setTracers.checked = settings.showTracers;
  ui.setDmg.checked = settings.showDmg;
  ui.setFps.checked = settings.showFps;
  ui.fps.classList.toggle('hidden', !settings.showFps);
  ui.setAdsSens.value = settings.adsSens; ui.adsSensVal.textContent = (+settings.adsSens).toFixed(2);
  ui.setInvertY.checked = settings.invertY;
  ui.setScale.value = settings.renderScale; ui.scaleVal.textContent = (+settings.renderScale).toFixed(2);
  ui.setCrossSize.value = settings.crossLen; ui.crossSizeVal.textContent = settings.crossLen;
  ui.setCrossThick.value = settings.crossThick; ui.crossThickVal.textContent = settings.crossThick;
  ui.setCrossColor.value = settings.crossColor;
  ui.setCrossDot.checked = settings.crossDot;
  ui.setDmgSize.value = settings.dmgSize; ui.dmgSizeVal.textContent = (+settings.dmgSize).toFixed(2) + '×';
  ui.setHpBars.checked = settings.hpBars;
  ui.setKillfeed.checked = settings.killfeed;
  applySettings();
}
ui.btnSettings.onclick = () => { ui.settingsBox.classList.toggle('hidden'); };
ui.setSens.oninput = () => { settings.sensitivity = +ui.setSens.value; ui.sensVal.textContent = settings.sensitivity.toFixed(2); saveSettings(); setTouchSens(settings.sensitivity); };
ui.setFov.oninput = () => { settings.fov = +ui.setFov.value; ui.fovVal.textContent = settings.fov; saveSettings(); };
ui.setVol.oninput = () => { settings.volume = +ui.setVol.value; ui.volVal.textContent = settings.volume.toFixed(2); saveSettings(); };
ui.setTracers.onchange = () => { settings.showTracers = ui.setTracers.checked; saveSettings(); };
ui.setDmg.onchange = () => { settings.showDmg = ui.setDmg.checked; saveSettings(); };
ui.setFps.onchange = () => { settings.showFps = ui.setFps.checked; ui.fps.classList.toggle('hidden', !settings.showFps); saveSettings(); };
ui.setAdsSens.oninput = () => { settings.adsSens = +ui.setAdsSens.value; ui.adsSensVal.textContent = settings.adsSens.toFixed(2); saveSettings(); };
ui.setInvertY.onchange = () => { settings.invertY = ui.setInvertY.checked; saveSettings(); };
ui.setScale.oninput = () => { settings.renderScale = +ui.setScale.value; ui.scaleVal.textContent = settings.renderScale.toFixed(2); saveSettings(); applySettings(); };
ui.setCrossSize.oninput = () => { settings.crossLen = +ui.setCrossSize.value; ui.crossSizeVal.textContent = settings.crossLen; saveSettings(); applySettings(); };
ui.setCrossThick.oninput = () => { settings.crossThick = +ui.setCrossThick.value; ui.crossThickVal.textContent = settings.crossThick; saveSettings(); applySettings(); };
ui.setCrossColor.oninput = () => { settings.crossColor = ui.setCrossColor.value; saveSettings(); applySettings(); };
ui.setCrossDot.onchange = () => { settings.crossDot = ui.setCrossDot.checked; saveSettings(); applySettings(); };
ui.setDmgSize.oninput = () => { settings.dmgSize = +ui.setDmgSize.value; ui.dmgSizeVal.textContent = settings.dmgSize.toFixed(2) + '×'; saveSettings(); };
ui.setHpBars.onchange = () => { settings.hpBars = ui.setHpBars.checked; saveSettings(); if (!settings.hpBars) clearHpBars(); };
ui.setKillfeed.onchange = () => { settings.killfeed = ui.setKillfeed.checked; saveSettings(); applySettings(); };
ui.btnResetSettings.onclick = () => {
  localStorage.removeItem('sp_settings');
  Object.assign(settings, { sensitivity: 1.0, fov: 74, volume: 0.8, showTracers: true, showDmg: true, showFps: false,
    adsSens: 0.5, invertY: false, renderScale: 1.0, crossLen: 10, crossThick: 2, crossColor: '#d9f0ff', crossDot: true,
    dmgSize: 1.75, hpBars: true, killfeed: true });
  syncSettingsUI(); saveSettings();
};
syncSettingsUI();
ui.btnCreate.onclick = () => { ui.createBox.classList.toggle('hidden'); ui.joinBox.classList.add('hidden'); };
ui.btnJoin.onclick = () => { ui.joinBox.classList.toggle('hidden'); ui.createBox.classList.add('hidden'); };
ui.btnDoCreate.onclick = () => {
  ensureName();
  const rules = {
    killLimit: parseInt(ui.ruleKillLimit.value || '0', 10) || 0,
    roundTime: (parseInt(ui.ruleRoundTime.value || '0', 10) || 0) * 60,
    respawnTime: parseInt(ui.ruleRespawn.value || '3', 10),
    friendlyFire: ui.ruleFF.checked,
  };
  net.createRoom(parseInt(ui.botCount.value || '8', 10), ui.mapSelect.value, ui.modeSelectC.value, rules);
};
ui.btnDoJoin.onclick = () => {
  const code = ui.joinCode.value.trim();
  if (!code) return;
  ensureName();
  net.joinRoom(code);
};

// ---------- tutorial ----------
ui.btnTutorial.onclick = () => { ui.tutorial.classList.remove('hidden'); };
ui.btnTutorialClose.onclick = () => {
  ui.tutorial.classList.add('hidden');
  localStorage.setItem('sp_seen_tutorial', '1');
};
if (!localStorage.getItem('sp_seen_tutorial')) ui.tutorial.classList.remove('hidden');

// ---------- report ----------
ui.btnReport.onclick = () => {
  ui.reportBox.classList.remove('hidden');
  ui.reportStatus.textContent = '';
  ui.reportText.value = '';
};
ui.btnReportCancel.onclick = () => ui.reportBox.classList.add('hidden');
ui.btnReportSend.onclick = () => {
  const txt = ui.reportText.value.trim();
  if (!txt) { ui.reportStatus.textContent = 'Type a short description first.'; return; }
  net.report(txt);
  ui.reportStatus.textContent = '✓ Sent — thank you! The developers will see this in the server log.';
  setTimeout(() => ui.reportBox.classList.add('hidden'), 1400);
};

// ---------- profile card ----------
function renderProfileCard() {
  const pr = loadProfile();
  const lv = levelFor(pr.xp);
  ui.pcLevel.textContent = lv.level;
  ui.pcRank.textContent = rankName(lv.level);
  ui.pcFill.style.width = Math.round((lv.into / lv.need) * 100) + '%';
  ui.pcXp.textContent = `${lv.into} / ${lv.need} XP · ${pr.matches} matches`;
  const kd = pr.deaths ? (pr.kills / pr.deaths).toFixed(2) : pr.kills.toFixed(0);
  ui.pcKd.innerHTML = `<b>${kd}</b> K/D`;
  ui.pcWins.textContent = `${pr.wins} wins`;
}
renderProfileCard();

// ---------- Fortnite-style mode/map tiles ----------
let selMode = localStorage.getItem('sp_mode') || 'defuse';
let selMap = localStorage.getItem('sp_map') || '';
function syncTiles() {
  for (const t of document.querySelectorAll('#modeTiles .mode-tile')) t.classList.toggle('sel', t.dataset.mode === selMode);
  for (const t of document.querySelectorAll('#mapTiles .map-tile')) t.classList.toggle('sel', t.dataset.map === selMap);
  ui.modeSelect.value = selMode;
  ui.mapPick.value = selMap;
  ui.playSel.textContent = `${selMode.toUpperCase()} · ${selMap ? selMap.toUpperCase() : 'ANY'}`;
  const hn = document.getElementById('heroName');
  if (hn) hn.textContent = (localStorage.getItem('sp_name') || 'OPERATOR').toUpperCase();
  localStorage.setItem('sp_mode', selMode);
  localStorage.setItem('sp_map', selMap);
}
for (const t of document.querySelectorAll('#modeTiles .mode-tile')) {
  t.onclick = () => { selMode = t.dataset.mode; syncTiles(); };
}
for (const t of document.querySelectorAll('#mapTiles .map-tile')) {
  t.onclick = () => { selMap = t.dataset.map; syncTiles(); };
}
syncTiles();

// ---------- operator skin picker (hero rail; shop skins included) ----------
function renderSkinRow() {
  const row = document.getElementById('skinRow');
  if (!row) return;
  const sel = getSelectedSkin();
  const hexOf = (n) => '#' + (n == null ? 0x3a3f46 : n).toString(16).padStart(6, '0');
  const list = [...SKINS, ...OP_SKINS.filter(s => !SKINS.some(k => k.id === s.id))];
  row.innerHTML = list.map(s => {
    const unlocked = isSkinUnlocked(s.id);
    const lock = unlocked ? '' : (s.level > 1 ? `<span class="lv">Lv ${s.level}</span>` : '<span class="lv">⚡</span>');
    return `<div class="skin-chip ${sel === s.id ? 'sel' : ''} ${unlocked ? '' : 'locked'}"
      data-skin="${s.id}" title="${s.name}${unlocked ? '' : (s.level > 1 ? ' — unlock at level ' + s.level : ' — buy in the shop (' + s.price + ' ⚡)')}"
      style="background: linear-gradient(135deg, ${hexOf(s.body)} 55%, ${hexOf(s.accent)} 55%)">${lock}</div>`;
  }).join('');
  for (const chip of row.querySelectorAll('.skin-chip')) {
    chip.onclick = () => {
      const id = chip.dataset.skin;
      if (!isSkinUnlocked(id)) { toggleShop(true); return; }   // locked -> open the shop
      setSelectedSkin(id);
      applySkinToHero();
      renderSkinRow();
      net.hello(localStorage.getItem('sp_name') || 'Player');   // re-announce skin
    };
  }
}
function applySkinToHero() {
  const s = skinById(getSelectedSkin());
  setBackdropSkin(s.body, s.accent);
  setBackdropOutfit(s.outfit || 'assault');   // Arctic skin wears Arctic Ops clothes, etc.
}
renderSkinRow();
applySkinToHero();
setViewmodelFinish(equipped().weapon);   // shop weapon finish on the viewmodel

// touch: emote button cycles gestures; sensitivity follows the slider
onEmotePressed(() => { net.action({ k: 'emote', e: nextEmote() }); });
setTouchSens(settings.sensitivity);

// ---------- shop (cosmetics marketplace) ----------
function renderShop() {
  if (!ui.shopItems) return;
  const own = owned(), eq = equipped(), creds = credits();
  ui.shopCredits.textContent = creds + ' ⚡';
  const card = (kind, item, ownedIt, equippedIt) => {
    const hex = (n) => '#' + (n == null ? 0x3a3f46 : n).toString(16).padStart(6, '0');
    let swatch;
    if (kind === 'weapon') swatch = `background: linear-gradient(135deg, ${hex(item.metal)} 55%, ${hex(item.accent)} 55%)`;
    else if (kind === 'skin') swatch = `background: linear-gradient(135deg, ${hex(item.body)} 55%, ${hex(item.accent)} 55%)`;
    else swatch = `background: ${item.css || '#dde3ea'}`;
    const label = equippedIt ? '<b class="own eq">✓ EQUIPPED</b>'
      : ownedIt ? '<b class="own" data-kind="' + kind + '" data-id="' + item.id + '" data-act="equip">OWNED — EQUIP</b>'
      : '<b class="buy" data-kind="' + kind + '" data-id="' + item.id + '" data-act="buy">' + item.price + ' ⚡</b>';
    return `<div class="shop-card ${equippedIt ? 'eq' : ''}">
      <div class="sw" style="${swatch}"></div>
      <span class="sn">${item.name}</span>${label}</div>`;
  };
  const outfitRow = (o) => {
    const unlocked = o.free || (o.level ? levelFor(loadProfile().xp).level >= o.level : false) || ownedOutfits().includes(o.id || Object.keys(OUTFITS).find(k => OUTFITS[k] === o));
    const oid = Object.keys(OUTFITS).find(k => OUTFITS[k] === o);
    const equippedIt = equippedOutfit() === oid;
    const ownedIt = o.free || ownedOutfits().includes(oid);
    const label = equippedIt ? '<b class="own eq">✓ EQUIPPED</b>'
      : ownedIt ? `<b class="own" data-kind="outfit" data-id="${oid}" data-act="equipOutfit">OWNED — EQUIP</b>`
      : o.level ? `<b class="own" style="color:#ffd9a0">Lv ${o.level} FREE</b>`
      : `<b class="buy" data-kind="outfit" data-id="${oid}" data-act="buyOutfit">${o.price} ⚡</b>`;
    return `<div class="shop-card ${equippedIt ? 'eq' : ''}">
      <div class="sw outfit-sw" style="font-size:22px; display:flex; align-items:center; justify-content:center">${o.tag}</div>
      <span class="sn">${o.name}</span>
      <span class="sd">${o.desc}</span>${label}</div>`;
  };
  ui.shopItems.innerHTML =
    '<h4 class="lo-h">OUTFITS</h4>' +
    OUTFIT_LIST.map(outfitRow).join('') +
    '<h4 class="lo-h">OPERATOR SKINS</h4>' +
    OP_SKINS.map(s => card('skin', s, own.skins.includes(s.id), eq.skin === s.id)).join('') +
    '<h4 class="lo-h">WEAPON FINISHES</h4>' +
    WEAPON_SKINS.map(w => card('weapon', w, own.weapons.includes(w.id), eq.weapon === w.id)).join('') +
    '<h4 class="lo-h">NAME COLORS</h4>' +
    NAME_COLORS.map(n => card('name', n, own.names.includes(n.id), eq.name === n.id)).join('');
  for (const b of ui.shopItems.querySelectorAll('[data-act]')) {
    b.onclick = () => {
      const { kind, id, act } = b.dataset;
      if (act === 'buy') {
        const r = purchase(kind, id);
        if (!r.ok) { b.textContent = r.why; b.classList.add('deny'); setTimeout(() => renderShop(), 1200); return; }
      } else if (act === 'buyOutfit') {
        const r = purchaseOutfit(id);
        if (!r.ok) { b.textContent = r.why; b.classList.add('deny'); setTimeout(() => renderShop(), 1200); return; }
      } else if (act === 'equipOutfit') equipOutfit(id);
      else equip(kind, id);
      applyShopCosmetics();
      renderShop();
    };
  }
}
function applyShopCosmetics() {
  const eq = equipped();
  // operator skin -> hero + skin row + broadcast (only if it changed)
  if (eq.skin !== getSelectedSkin()) {
    setSelectedSkin(eq.skin);
    applySkinToHero();
    renderSkinRow();
    net.hello(localStorage.getItem('sp_name') || 'Player');
  }
  // weapon finish -> viewmodel now; server learns via the next hello
  setViewmodelFinish(eq.weapon);
  myWeaponFinish = eq.weapon;
  // outfit (structural clothing) — hero + broadcast
  equipOutfit(eq.outfit);
  setBackdropOutfit(eq.outfit);
  // name color is applied when the server echoes it back in state (p.nc)
}
let myWeaponFinish = 'stock';
function toggleShop(force) {
  const want = force !== undefined ? force : ui.shopScreen.classList.contains('hidden');
  ui.shopScreen.classList.toggle('hidden', !want);
  if (want) renderShop();
}
ui.btnShopClose.onclick = () => toggleShop(false);
const _btnShop = document.getElementById('btnShop'); if (_btnShop) _btnShop.onclick = () => toggleShop(true);

// ---------- lobby ready + chat ----------
let iAmReady = false;
ui.btnLobbyReady.onclick = () => {
  iAmReady = !iAmReady;
  ui.btnLobbyReady.classList.toggle('on', iAmReady);
  ui.btnLobbyReady.textContent = iAmReady ? '✓ Ready' : 'Ready up';
  net.setReady(iAmReady);
};
function sendChat() {
  const v = ui.chatInput.value.trim();
  if (!v) return;
  net.chat(v);
  ui.chatInput.value = '';
}
ui.btnChatSend.onclick = sendChat;
ui.chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); sendChat(); } });
function addChat(el, from, text, sys) {
  // chat history lives per-room: a stale log from your last match would
  // otherwise still be sitting there when you join the next one
  if (el !== ui.gameChatLog) el.innerHTML = '';
  const d = document.createElement('div');
  d.innerHTML = sys ? `<span class="c-sys">${text}</span>` : `<span class="c-from">${from}:</span> ${text}`;
  el.appendChild(d);
  while (el.children.length > 8) el.firstChild.remove();
}
// in-game chat: recent messages fade; Y opens a quick input reusing the lobby box pattern
let gameChatUntil = 0;
function pushGameChat(from, text, sys) {
  addChat(ui.gameChatLog, from, text, sys);
  gameChatUntil = performance.now() + 6000;
  ui.gameChatLog.parentElement.style.opacity = 1;
}
setInterval(() => {
  if (performance.now() > gameChatUntil) ui.gameChatLog.parentElement.style.opacity = 0;
}, 500);

// ---------- match-end podium ----------
let podiumShown = false;
function maybeShowPodium() {
  if (phase !== 'matchEnd' || podiumShown || !inRoom) return;
  podiumShown = true;
  const isFfa = gameMode === 'ffa';
  const won = isFfa ? winner === myId : winner === myTeam;
  ui.podTitle.textContent = won ? 'VICTORY' : 'DEFEAT';
  ui.podTitle.className = won ? 'win' : 'lose';
  ui.podSub.textContent = isFfa
    ? `${winnerName || 'someone'} takes the free-for-all`
    : `${winner === 0 ? 'Terrorists' : 'Counter-Terrorists'} win the match`;
  // top-3 by kills
  const rows = [...worldPlayers.values()].sort((a, b) => (b.k || 0) - (a.k || 0)).slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];
  ui.podTop3.innerHTML = rows.map((wp, i) =>
    `<div class="pod-card"><div class="medal">${medals[i]}</div><div class="pn">${wp.n || '?'}</div>
     <div class="ps">${wp.k || 0} kills · ${wp.d || 0} deaths</div></div>`).join('');
  // personal stats + XP
  const me = worldPlayers.get(myId) || { k: 0, d: 0 };
  const myHs = (myHsCount || 0);
  const res = recordMatch(me.k || 0, me.d || 0, won, myHs);
  const cr = earnMatchCredits(me.k || 0, won);   // shop currency
  ui.podYou.innerHTML = `You: <b>${me.k || 0} kills</b> · ${me.d || 0} deaths · ${myHs} headshots`;
  ui.podXp.innerHTML = `+${res.gained} XP` + (res.leveledUp ? ` — <span class="lvl">LEVEL UP! ${res.from} → ${res.to}</span>` : '')
    + ` · <span class="lvl">+${cr.got} ⚡</span>` + (cr.capped ? ' <small>(daily cap reached)</small>' : '');
  ui.podium.classList.remove('hidden');
  renderProfileCard();
  renderSkinRow();   // new level may unlock skins
  playSound(won ? 'confirm' : 'hurt');
}
ui.btnPodMenu.onclick = () => {
  ui.podium.classList.add('hidden');
  location.reload();
};
// count my headshots for the podium
let myHsCount = 0;
const _origHandleEvent = handleEvent;
handleEvent = function (ev) {
  if (ev.type === 'hit' && ev.by === myId && ev.head) myHsCount++;
  if (ev.type === 'dmEnd' || (ev.type === 'roundEnd' && phase === 'matchEnd')) { /* podium triggers via phase check */ }
  _origHandleEvent(ev);
};
