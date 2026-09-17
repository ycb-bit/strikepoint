// Strikepoint — enemy health bars above heads (DOM overlay projected from 3D).
// One pooled <div> per visible enemy; positioned each frame via camera projection.

import * as THREE from 'three';

const pool = [];       // { el, inUse, wp }
const tmpV = new THREE.Vector3();
let container = null;

export function initHpBars() {
  if (!container) {
    container = document.createElement('div');
    container.id = 'hpbars';
    document.body.appendChild(container);
  }
}

export function acquireHpBar(name, color) {
  initHpBars();
  let entry = pool.find(p => !p.inUse);
  if (!entry) {
    const el = document.createElement('div');
    el.className = 'hpbar';
    el.innerHTML = `<div class="nm"></div><div class="tr"><div class="fill"></div></div>`;
    container.appendChild(el);
    entry = { el, inUse: false };
    pool.push(entry);
  }
  entry.inUse = true;
  entry.el.style.display = 'block';
  entry.el.querySelector('.nm').textContent = name || '';
  entry.el.querySelector('.nm').style.color = color || '#eef3f8';
  return entry.el;
}

export function releaseHpBar(el) {
  const entry = pool.find(p => p.el === el);
  if (entry) { entry.inUse = false; entry.el.style.display = 'none'; }
}

// update one bar to an enemy's world position
export function positionHpBar(el, camera, worldPos, hpFrac, width = 64) {
  tmpV.copy(worldPos);
  tmpV.project(camera);
  if (tmpV.z > 1 || tmpV.x < -1.1 || tmpV.x > 1.1 || tmpV.y < -1.1 || tmpV.y > 1.1) {
    el.style.display = 'none';
    return false;
  }
  const x = (tmpV.x * 0.5 + 0.5) * innerWidth;
  const y = (-tmpV.y * 0.5 + 0.5) * innerHeight;
  const distFade = Math.max(0.45, 1 - tmpV.z * 0.4);
  el.style.display = 'block';
  el.style.left = (x - width / 2) + 'px';
  el.style.top = y + 'px';
  el.style.opacity = distFade;
  el.style.width = width + 'px';
  const fill = el.querySelector('.fill');
  fill.style.width = Math.max(0, Math.min(1, hpFrac)) * 100 + '%';
  fill.style.background = hpFrac > 0.6 ? '#5bd07a' : hpFrac > 0.3 ? '#e8a33d' : '#e05252';
  return true;
}

export function clearHpBars() {
  for (const p of pool) { p.inUse = false; p.el.style.display = 'none'; }
}
