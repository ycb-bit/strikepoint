// Strikepoint — impact & hit feedback FX.
// Bullet impacts (sparks + puff), wall decals (ring buffer), blood puffs on players,
// floating damage numbers, hitmarker/headshot feedback. All pooled & auto-disposed.

import * as THREE from 'three';

const shared = {
  sparks: null, smoke: null, blood: null,
  sparkGeo: null, smokeGeo: null, bloodGeo: null,
  decalGeo: null, decalMatA: null, decalMatB: null,
  dmgSpriteMat: null,
  scene: null,
};

export function initFx(scene) {
  shared.scene = scene;
  shared.sparkGeo = new THREE.SphereGeometry(0.03, 4, 3);
  shared.smokeGeo = new THREE.SphereGeometry(0.09, 5, 4);
  shared.bloodGeo = new THREE.SphereGeometry(0.05, 5, 4);
  shared.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  shared.smokeMat = new THREE.MeshBasicMaterial({ color: 0xb9b2a6, transparent: true, opacity: 0.75 });
  shared.bloodMat = new THREE.MeshBasicMaterial({ color: 0x8f1d1d });
  shared.decalGeo = new THREE.CircleGeometry(0.055, 8);
  shared.decalMatA = new THREE.MeshBasicMaterial({ color: 0x2c2822, transparent: true, opacity: 0.85 });
  shared.decalMatB = new THREE.MeshBasicMaterial({ color: 0x3a3f45, transparent: true, opacity: 0.8 });
  // damage-number sprite texture (digits drawn on demand)
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 48;
  shared.dmgCanvas = cv; shared.dmgCtx = cv.getContext('2d');
}

const live = [];       // transient particles: { mesh, vx,vy,vz, born, life, kind }
const DECAL_MAX = 90;
const decals = [];     // { mesh } ring buffer

export function spawnImpact(x, y, z, nx, ny, nz) {
  const s = shared;
  if (!s.scene) return;
  // 5 sparks bouncing away from the surface
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(s.sparkGeo, s.sparkMat);
    m.position.set(x, y, z);
    s.scene.add(m);
    live.push({
      mesh: m, kind: 'spark', born: performance.now(), life: 260 + Math.random() * 160,
      vx: nx * 2 + (Math.random() - 0.5) * 3, vy: ny * 2 + Math.random() * 2.6, vz: nz * 2 + (Math.random() - 0.5) * 3,
    });
  }
  // smoke puff drifting up
  const puff = new THREE.Mesh(s.smokeGeo, s.smokeMat.clone());
  puff.position.set(x + nx * 0.08, y + ny * 0.08, z + nz * 0.08);
  s.scene.add(puff);
  live.push({ mesh: puff, kind: 'smoke', born: performance.now(), life: 420, vx: nx * 0.4, vy: 0.7, vz: nz * 0.4 });
  // decal stuck to the surface (estimate normal plane)
  const dm = new THREE.Mesh(s.decalGeo, Math.random() < 0.5 ? s.decalMatA : s.decalMatB);
  dm.position.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012);
  dm.lookAt(x + nx, y + ny, z + nz);
  dm.rotation.z = Math.random() * Math.PI * 2;
  const sc = 0.7 + Math.random() * 0.7;
  dm.scale.set(sc, sc, 1);
  s.scene.add(dm);
  decals.push({ mesh: dm });
  if (decals.length > DECAL_MAX) {
    const old = decals.shift();
    s.scene.remove(old.mesh);
  }
}

export function spawnBlood(x, y, z, big = false) {
  const s = shared;
  if (!s.scene) return;
  const n = big ? 9 : 5;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(s.bloodGeo, s.bloodMat);
    m.position.set(x, y, z);
    m.scale.setScalar(big ? 1.4 : 1);
    s.scene.add(m);
    live.push({
      mesh: m, kind: 'blood', born: performance.now(), life: 340 + Math.random() * 200,
      vx: (Math.random() - 0.5) * 2.4, vy: Math.random() * 1.8, vz: (Math.random() - 0.5) * 2.4,
    });
  }
}

export function spawnDamageNumber(x, y, z, amount, headshot, sizeMult = 1.75) {
  const s = shared;
  if (!s.scene) return;
  const px = Math.round(64 * sizeMult);
  const cv = document.createElement('canvas'); cv.width = px * 2; cv.height = px;
  const ctx = cv.getContext('2d');
  ctx.font = `bold ${Math.round(px * 0.62)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.fillStyle = headshot ? '#ff5252' : '#ffd977';
  ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = Math.max(4, px * 0.09);
  ctx.lineJoin = 'round';
  const text = headshot ? String(amount) + '!' : String(amount);
  ctx.strokeText(text, cv.width / 2, cv.height * 0.72);
  ctx.fillText(text, cv.width / 2, cv.height * 0.72);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  const h = 0.30 * sizeMult;
  sp.scale.set(h * 2, h, 1);
  sp.position.set(x, y + 0.25 + sizeMult * 0.1, z);
  s.scene.add(sp);
  live.push({ mesh: sp, kind: 'dmg', born: performance.now(), life: 850, vx: 0, vy: 1.3, vz: 0, sprite: true });
}

export function updateFx(dt) {
  const now = performance.now();
  for (let i = live.length - 1; i >= 0; i--) {
    const p = live[i];
    const age = now - p.born;
    if (age > p.life) {
      shared.scene.remove(p.mesh);
      if (p.sprite) { p.mesh.material.map.dispose(); p.mesh.material.dispose(); }
      else if (p.kind === 'smoke') p.mesh.material.dispose();
      live.splice(i, 1);
      continue;
    }
    const t = age / p.life;
    if (p.kind === 'spark') {
      p.vy -= 9 * dt;
      p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
      p.mesh.scale.setScalar(Math.max(0.05, 1 - t));
    } else if (p.kind === 'smoke') {
      p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
      p.mesh.scale.setScalar(1 + t * 2.2);
      p.mesh.material.opacity = 0.75 * (1 - t);
    } else if (p.kind === 'blood') {
      p.vy -= 7 * dt;
      p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
      p.mesh.scale.setScalar(Math.max(0.1, (1 - t)));
    } else if (p.kind === 'dmg') {
      p.mesh.position.y += p.vy * dt;
      p.mesh.material.opacity = 1 - t;
    }
  }
}
