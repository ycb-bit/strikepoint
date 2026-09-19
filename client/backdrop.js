// Strikepoint — animated 3D menu backdrop.
// A tiny second scene renders the SELECTED map from a slowly orbiting camera,
// with a few idle soldiers milling around. Drawn with the same renderer into
// the main canvas before the menu fades in — no extra WebGL context (RAM-safe).

import * as THREE from 'three';
import { createMap } from '../shared/map.js';
import { buildAvatar } from './viewmodel.js';
import { triggerEmote } from './emotes.js';

let renderer = null, scene = null, camera = null;
let meshes = [], bots = [], mapName = null, active = false, ang = 0;
let pendingMap = null, frames = 0, backdropBots = [];
let heroCenter = { x: 0, z: 0 };
let skyDome = null;

export function initBackdrop(realRenderer) {
  renderer = realRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
  const hemi = new THREE.HemisphereLight(0xdfeaf2, 0x54524c, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d9, 0.6);
  sun.position.set(30, 50, 20);
  scene.add(sun);
  backdropLights.hemi = hemi; backdropLights.sun = sun;
}
const backdropLights = { hemi: null, sun: null };

// per-map atmosphere: same data the in-game world uses (shared/map.js env)
const skyCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
if (skyCanvas) { skyCanvas.width = 2; skyCanvas.height = 128; }
const skyCtx = skyCanvas ? skyCanvas.getContext('2d') : null;
const skyTex = new THREE.CanvasTexture(skyCanvas);

function applyEnv(env) {
  const e = env || {};
  // sky gradient dome (big inverted sphere — the horizon shows behind the map)
  if (skyCtx) {
    const g = skyCtx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, e.skyTop || '#7fa8c9');
    g.addColorStop(0.55, e.skyMid || '#a9c4d8');
    g.addColorStop(1, e.skyHor || '#d7e2e8');
    skyCtx.fillStyle = g; skyCtx.fillRect(0, 0, 2, 128);
    skyTex.needsUpdate = true;
  }
  if (!skyDome) {
    skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(240, 16, 12),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
    );
    scene.add(skyDome);
  }
  scene.fog = new THREE.Fog(e.fog ?? 0xa9c4d8, 30, 160);
  backdropLights.hemi.color.setHex(e.hemiSky ?? 0xdfeaf2);
  backdropLights.hemi.groundColor.setHex(e.hemiGround ?? 0x54524c);
  backdropLights.hemi.intensity = e.hemiI ?? 0.85;
  backdropLights.sun.color.setHex(e.sun ?? 0xfff2d9);
  backdropLights.sun.intensity = e.sunI ?? 0.55;
}

export function setBackdropMap(name) {
  if (name === mapName) return;
  pendingMap = name;
}

function buildFor(name) {
  for (const m of meshes) { scene.remove(m); m.geometry.dispose(); }
  meshes.length = 0;
  for (const b of bots) scene.remove(b.grp);
  bots.length = 0;
  mapName = name;
  const map = createMap(name, 1337);
  const env = map.env || {};
  lastEnv = env;
  applyEnv(env);   // sky dome + fog + per-map lights BEFORE geometry
  // materials straight from the map's own palette
  const matWall = new THREE.MeshLambertMaterial({ color: env.wall ?? 0x8f9ba6 });
  const matLow = new THREE.MeshLambertMaterial({ color: env.low ?? 0x77907e });
  const matCrate = new THREE.MeshLambertMaterial({ color: env.crate ?? 0x9c7f56 });
  const matCrateAlt = new THREE.MeshLambertMaterial({ color: env.crateAlt ?? 0x8a7150 });
  const matBarrel = new THREE.MeshLambertMaterial({ color: 0x8a4a3a });
  const matSand = new THREE.MeshLambertMaterial({ color: env.sandbag ?? 0x9a8f70 });
  for (const c of map.colliders) {
    if (c.kind === 'barrel') {
      const g = new THREE.CylinderGeometry(0.42, 0.42, c.y1, 8);
      g.translate(c.x, c.y1 / 2, c.z);
      const m = new THREE.Mesh(g, matBarrel); scene.add(m); meshes.push(m);
      continue;
    }
    const g = new THREE.BoxGeometry(c.hx * 2, c.y1 - c.y0, c.hz * 2);
    g.translate(c.x, (c.y0 + c.y1) / 2, c.z);
    let m2 = matWall;
    if (c.kind === 'sandbag') m2 = matSand;
    else if (c.y1 <= 1.2) m2 = matLow;
    else if (c.y1 < 3) m2 = ((c.x * 7 + c.z * 13) | 0) % 2 ? matCrate : matCrateAlt;
    const m = new THREE.Mesh(g, m2);
    scene.add(m); meshes.push(m);
  }
  const ground = new THREE.Mesh(new THREE.BoxGeometry(map.half * 2 + 2, 1, map.half * 2 + 2),
    new THREE.MeshLambertMaterial({ color: env.floor ?? 0x6a7480 }));
  ground.position.y = -0.5;
  scene.add(ground); meshes.push(ground);
  // a few idle soldiers wandering the plaza (near CT spawn, away from hero)
  const mats = [new THREE.MeshLambertMaterial({ color: 0xd29a4a, emissive: 0x40280a }),
                new THREE.MeshLambertMaterial({ color: 0x7fb3e8, emissive: 0x0c2c50 })];
  for (let i = 0; i < 6; i++) {
    const { grp } = buildAvatar(mats[i % 2]);
    grp.position.set(map.spawnsCT[0].x + (Math.random() - 0.5) * 14, 0, map.spawnsCT[0].z + (Math.random() - 0.5) * 14);
    grp.userData.wander = { a: Math.random() * Math.PI * 2, sp: 0.4 + Math.random() * 0.5 };
    scene.add(grp); bots.push(grp);
  }
  // cache leg bone refs for the wander animation
  backdropBots = bots.map(grp => ({ grp, legL: grp.bones.legL, legR: grp.bones.legR, kneeL: grp.bones.legLKnee, kneeR: grp.bones.legRKnee }));
  // hero stands at the T spawn (always clear ground on every map)
  if (hero) { hero.position.set(map.spawnsT[0].x, 0, map.spawnsT[0].z); heroCenter = { x: hero.position.x, z: hero.position.z }; }
  const half = map.half;
  return { half };
}// ---- depth-of-field, the RAM-safe way ----
// pass 1: render the whole scene (hero hidden) into a LOW-RES target -> soft bg
// pass 2: blur-composite it to screen (two small passes = smooth bokeh)
// pass 3: render the hero sharp at full res on top
// Cost: two 512-wide targets, no depth textures — a fraction of one SSAO pass.
let rtA = null, rtB = null, quadScene = null, quadCam = null, blurMat = null, compMat = null;
const RT_W = 800;   // was 512 — higher-res plate keeps the map recognizable behind the hero
let lastEnv = null, pendingEnv = null;
void compMat; void pendingEnv;

function ensureRtTargets() {
  if (rtA) return;
  const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
  rtA = new THREE.WebGLRenderTarget(RT_W, Math.round(RT_W * 0.56), opts);
  rtB = new THREE.WebGLRenderTarget(RT_W, Math.round(RT_W * 0.56), { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  quadScene = new THREE.Scene();
  quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  blurMat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2(1, 0) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform sampler2D tex; uniform vec2 dir;
      void main(){
        vec4 c = texture2D(tex, vUv) * 0.227;
        c += texture2D(tex, vUv + dir * 1.384) * 0.316;
        c += texture2D(tex, vUv - dir * 1.384) * 0.316;
        c += texture2D(tex, vUv + dir * 3.230) * 0.070;
        c += texture2D(tex, vUv - dir * 3.230) * 0.070;
        gl_FragColor = c;
      }`,
    depthTest: false, depthWrite: false,
  });
  compMat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform sampler2D tex; void main(){ gl_FragColor = texture2D(tex, vUv); }',
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat);
  quadScene.add(quad);
}

function blurToScreen() {
  // horizontal pass A->B, vertical pass B->screen
  const quad = quadScene.children[0];
  quad.material = blurMat;
  blurMat.uniforms.tex.value = rtA.texture;
  blurMat.uniforms.dir.value.set(1 / RT_W, 0);
  renderer.setRenderTarget(rtB);
  renderer.render(quadScene, quadCam);
  blurMat.uniforms.tex.value = rtB.texture;
  blurMat.uniforms.dir.value.set(0, 1 / (RT_W * 0.56));
  renderer.setRenderTarget(null);
  renderer.render(quadScene, quadCam);
}

// ---- idle emote scheduler (hero plays a random emote every ~12s) ----
let nextIdleEmote = 0;
const IDLE_EMOTES = ['wave', 'salute', 'thumbs', 'point', 'taunt'];

export function renderBackdrop(dt, w, h) {
  if (!renderer || !active) return;
  frames += 1; void frames;
  if (pendingMap) { const r = buildFor(pendingMap); pendingMap = null; if (r) { backdropHalf = r.half; } }
  if (!mapName) return;
  ensureRtTargets();
  ang += dt * 0.06;
  const half = backdropHalf || 32;
  // ---- inspect mode: user drag = turntable rotate, wheel = zoom.
  // Blends smoothly back to the cinematic auto-orbit after ~2.5s idle.
  const nowMs = performance.now();
  if (inspect.blend > 0.01 && nowMs - inspect.lastInput > 2500) inspect.on = false;
  inspect.blend += ((inspect.on ? 1 : 0) - inspect.blend) * Math.min(1, dt * 4);
  const b = inspect.blend;
  // Camera floats on a gentle figure-8 lissajous in addition to the main orbit
  const camDrift = Math.sin(nowMs / 9000) * 0.04;
  const az = (ang + camDrift) * (1 - b) + inspect.az * b;
  const el = (0.34 + Math.sin(nowMs / 7400) * 0.025) * (1 - b) + inspect.el * b;
  const r = (6.2 + Math.sin(nowMs / 5200) * 0.18) * (1 - b) + inspect.dist * b;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  camera.position.set(
    heroCenter.x + Math.cos(az) * Math.cos(el) * r,
    1.0 + Math.sin(el) * r,
    heroCenter.z + Math.sin(az) * Math.cos(el) * r
  );
  camera.lookAt(heroCenter.x, 1.0 + Math.sin(nowMs / 4800) * 0.06, heroCenter.z);
  // hero: faces the camera during the cinematic orbit; in inspect mode the
  // camera does the moving (turntable), so the pose stays world-fixed
  if (hero) {
    if (b < 0.5) {
      hero.rotation.y = Math.atan2(camera.position.x - hero.position.x, camera.position.z - hero.position.z) + Math.PI;
    }
    const t = nowMs / 1000;
    const ud = hero.userData;
    // --- breathing: torso up/down + subtle lean ---
    if (ud.torso) {
      ud.torso.position.y = 0.95 + Math.sin(t * 0.9) * 0.014;
      ud.torso.rotation.x = Math.sin(t * 0.85) * 0.008;
    }
    // --- head look-around (smooth, lazy) ---
    if (ud.head) {
      ud.head.rotation.y = Math.sin(t * 0.31) * 0.14;
      ud.head.rotation.x = Math.sin(t * 0.47) * 0.06;
    }
    // --- hip weight shift (side-to-side) ---
    if (ud.hips) {
      ud.hips.rotation.z = Math.sin(t * 0.75) * 0.025;
    }
    // --- arm sway (hanging arms swing slightly) ---
    if (ud.armL) ud.armL.rotation.z =  0.15 + Math.sin(t * 0.68) * 0.06;
    if (ud.armR) ud.armR.rotation.z = -0.15 - Math.sin(t * 0.68) * 0.06;
    // --- occasional idle emote (wave, salute, nod) ---
    if (!ud.emoting && nowMs > nextIdleEmote) {
      nextIdleEmote = nowMs + 10000 + Math.random() * 8000;
      triggerEmote(hero, IDLE_EMOTES[Math.floor(Math.random() * IDLE_EMOTES.length)]);
    }
  }

  // bots wander in lazy circles with synced leg swings
  for (const b of backdropBots) {
    const g = b.grp, wdt = g.userData.wander;
    wdt.a += dt * wdt.sp * 0.35;
    g.position.x += Math.cos(wdt.a) * wdt.sp * dt;
    g.position.z += Math.sin(wdt.a) * wdt.sp * dt;
    g.rotation.y = -wdt.a + Math.PI / 2;
    g.position.x = Math.max(-half + 4, Math.min(half - 4, g.position.x));
    g.position.z = Math.max(-half + 4, Math.min(half - 4, g.position.z));
    const sw = Math.sin(wdt.a * 8) * 0.5;
    if (b.legL) { b.legL.rotation.x = sw; b.legR.rotation.x = -sw; }
    if (b.kneeL) { b.kneeL.rotation.x = -Math.max(0, sw) * 0.8; b.kneeR.rotation.x = -Math.max(0, -sw) * 0.8; }
  }

  // PASS 1: world WITHOUT hero -> low-res target
  if (hero) hero.visible = false;
  const oldBg = scene.background;
  scene.background = null;
  renderer.setRenderTarget(rtA);
  renderer.setViewport(0, 0, RT_W, Math.round(RT_W * 0.56));
  renderer.render(scene, camera);

  // PASS 2: blur target -> full-screen composite (stretched upscale = extra soft)
  renderer.setViewport(0, 0, w, h);
  blurToScreen();

  // PASS 3: ONLY the hero, sharp, at full res over the blurred plate
  scene.background = null;
  scene.fog = null;
  for (const m of meshes) m.visible = false;
  for (const b of bots) b.visible = false;
  if (hero) hero.visible = true;
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(scene, camera);
  renderer.autoClear = true;
  for (const m of meshes) m.visible = true;
  for (const b of bots) b.visible = true;
  scene.background = oldBg;
  applyEnv(pendingEnv || lastEnv);   // restore fog for the next frame's pass 1
}

let backdropHalf = 32;

// ---- hero inspect mode (drag rotate + wheel zoom, blends with the auto-orbit)
const inspect = { on: false, az: 0, el: 0.34, dist: 4.4, blend: 0, lastInput: 0 };
export function beginInspect() {
  if (!hero) return;
  inspect.on = true;
  inspect.lastInput = performance.now();
  // start the turntable where the cinematic camera currently is (no jump)
  const dx = camera.position.x - hero.position.x, dz = camera.position.z - hero.position.z;
  inspect.az = Math.atan2(dz, dx) - Math.PI / 2;
  const dy = camera.position.y - 1.0;
  inspect.el = Math.atan2(dy, Math.hypot(dx, dz));
  inspect.dist = Math.hypot(dx, dy, dz);
}
export function inspectRotate(dxPixels, dyPixels) {
  if (!inspect.on) return;
  inspect.az -= dxPixels * 0.006;
  inspect.el = Math.max(-0.5, Math.min(0.9, inspect.el + dyPixels * 0.004));
  inspect.lastInput = performance.now();
}
export function inspectZoom(delta) {
  if (!inspect.on) return;
  inspect.dist = Math.max(2.2, Math.min(10, inspect.dist + delta));
  inspect.lastInput = performance.now();
}

// hero soldier: stands center-stage, faces the camera, breathing idle
let hero = null;
const heroMats = {
  t: new THREE.MeshLambertMaterial({ color: 0xd29a4a, emissive: 0x40280a }),
  ct: new THREE.MeshLambertMaterial({ color: 0x7fb3e8, emissive: 0x0c2c50 }),
};
export function setBackdropTeam(team) {
  if (!hero) return;
  const mat = team === 'ct' ? heroMats.ct : heroMats.t;
  // reset every cloth piece to the plain team material (a skin may be applied
  // later on top — this is the "back to basics" path)
  for (const c of hero.userData.cloth) c.material = mat;
  if (hero.userData.helmet) hero.userData.helmet.material = mat;
}
let heroSkinMats = null;
function applyHeroSkinMats() {
  if (!heroSkinMats) {
    heroSkinMats = {
      body: new THREE.MeshLambertMaterial({ color: 0xffffff }),
      accent: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    };
  }
  const u = hero.userData;
  u.body.material = heroSkinMats.body;
  u.helmet.material = heroSkinMats.body;
  u.vest.material = heroSkinMats.accent;
  if (u.legL && u.legL.children[0]) u.legL.children[0].material = heroSkinMats.accent;
  if (u.legR && u.legR.children[0]) u.legR.children[0].material = heroSkinMats.accent;
}
// apply a skin colorway to the lobby hero (colors arrive as hex ints)
export function setBackdropSkin(bodyHex, accentHex) {
  if (!hero) return;
  if (bodyHex == null) {
    // default: restore the hero team material on every cloth piece
    const mat = heroMats.t;
    for (const c of hero.userData.cloth) if (c.material !== heroMats.t) c.material = mat;
    if (hero.userData.helmet) hero.userData.helmet.material = mat;
    return;
  }
  applyHeroSkinMats();
  heroSkinMats.body.color.setHex(bodyHex);
  heroSkinMats.body.emissive.setHex(glowHex(bodyHex, 0.32));
  heroSkinMats.accent.color.setHex(accentHex);
  heroSkinMats.accent.emissive.setHex(glowHex(accentHex, 0.18));
  // paint cloth (identity check: anything still on the hero team mat)
  for (const c of hero.userData.cloth) if (c.material === heroMats.t) c.material = heroSkinMats.body;
  if (hero.userData.helmet && hero.userData.helmet.material === heroMats.t) hero.userData.helmet.material = heroSkinMats.body;
}
// per-channel glow so colorways read in dim map lighting
function glowHex(hex, k) {
  const r = Math.min(255, ((hex >> 16) & 255) * k) | 0;
  const g = Math.min(255, ((hex >> 8) & 255) * k) | 0;
  const b = Math.min(255, (hex & 255) * k) | 0;
  return (r << 16) | (g << 8) | b;
}
export function ensureHero() {
  if (hero) return;
  const { grp } = buildAvatar(heroMats.t, heroOutfit);
  grp.userData.outfit = heroOutfit;
  grp.position.set(0, 0, 0);
  scene.add(grp);
  hero = grp;
}
let heroOutfit = 'assault';   // outfit applied at hero build time (persists across rebuilds)
export function setBackdropActive(v) { active = v; if (v) ensureHero(); }
// lobby gestures: the hero plays the same arm animations as in-game avatars
export function emoteHero(kind) { if (hero) triggerEmote(hero, kind); }

// shop preview: repaint the hero's rifle (null = back to stock steel)
let heroGunMats = null;
export function setBackdropGunColor(hex) {
  if (!hero || !hero.userData.gun) return;
  const gun = hero.userData.gun;
  if (hex == null) { for (const part of gun.children) part.material = part.userData.stockMat || part.material; return; }
  if (!heroGunMats) heroGunMats = new THREE.MeshBasicMaterial({ color: 0xffffff });
  heroGunMats.color.setHex(hex);
  for (const part of gun.children) {
    if (!part.userData.stockMat) part.userData.stockMat = part.material;   // remember factory look
    part.material = heroGunMats;
  }
}

// outfit swap for the hero (structural clothing change -> rebuild the rig)
export function setBackdropOutfit(outfitId) {
  heroOutfit = outfitId;
  if (!hero || hero.userData.outfit === outfitId) return;
  const old = hero;
  const { grp } = buildAvatar(old.userData.body.material, outfitId);
  grp.position.copy(old.position);
  grp.rotation.copy(old.rotation);
  scene.add(grp);
  scene.remove(old);
  hero = grp;
  hero.userData.outfit = outfitId;
  hero.userData.emoting = false;
}
