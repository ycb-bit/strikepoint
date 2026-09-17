// Strikepoint — emotes & gestures (v2, torso-space rig).
// An emote poses the avatar's arm(s) relative to their CURRENT animated pose
// (additive on top of the procedural animator, which pauses arm control via
// grp.userData.emoting). Shows a bobbing emoji bubble over the head.

import * as THREE from 'three';

const DUR = { wave: 2.2, point: 1.6, salute: 1.5, thumbs: 1.4, taunt: 1.8 };
const ICON = { wave: '👋', point: '👉', salute: '🫡', thumbs: '👍', taunt: '😏' };

const active = new Map(); // grp -> emote state
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

function qX(a) { return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a); }
function qZ(a) { return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a); }

function makeBubble(text) {
  const el = document.createElement('div');
  el.className = 'emote-bubble';
  el.textContent = text;
  // body (not #hud): bubbles must also work in the lobby, where #hud is hidden
  document.body.appendChild(el);
  return el;
}

export function triggerEmote(grp, kind) {
  if (!grp || !grp.bones || !DUR[kind]) return;
  const b = grp.bones;
  active.set(grp, {
    kind, t: 0, dur: DUR[kind],
    baseR: b.armR.quaternion.clone(),   // pose at emote start (additive on top)
    baseL: b.armL.quaternion.clone(),
    bubble: ICON[kind] ? makeBubble(ICON[kind]) : null,
  });
  grp.userData.emoting = true;
}

export function updateEmotes(dt, camera) {
  const done = [];
  for (const [grp, s] of active) {
    s.t += dt;
    const b = grp.bones;
    if (s.t >= s.dur || !grp.parent || !b) { done.push(grp); continue; }
    const pump = Math.sin(s.t * 9);
    // additive: start from the captured pose, apply the gesture on top
    b.armR.quaternion.copy(s.baseR);
    b.armL.quaternion.copy(s.baseL);
    switch (s.kind) {
      case 'wave':   // arm up beside the head, hand pumping
        b.armR.quaternion.multiply(qZ(-2.4)).multiply(qX(pump * 0.45));
        break;
      case 'point':  // arm straight forward
        b.armR.quaternion.multiply(qX(-1.15));
        break;
      case 'salute': // hand to brow
        b.armR.quaternion.multiply(qZ(-2.1)).multiply(qX(-0.55));
        break;
      case 'thumbs': // forearm up, fist forward
        b.armR.quaternion.multiply(qX(-0.7)).multiply(qZ(-0.5));
        break;
      case 'taunt':  // left arm up high, slight torso roll
        b.armL.quaternion.multiply(qX(-2.3));
        if (b.torso) b.torso.rotation.z += 0.15;
        break;
    }
    // project the bubble above the head
    if (s.bubble && camera) {
      _v.set(grp.position.x, grp.position.y + 2.3, grp.position.z).project(camera);
      if (_v.z < 1 && Math.abs(_v.x) < 1.1) {
        s.bubble.style.display = 'block';
        s.bubble.style.left = ((_v.x * 0.5 + 0.5) * innerWidth) + 'px';
        s.bubble.style.top = ((-_v.y * 0.5 + 0.5) * innerHeight) + 'px';
      } else s.bubble.style.display = 'none';
    }
  }
  for (const grp of done) {
    const s = active.get(grp);
    if (s) { if (s.bubble) s.bubble.remove(); grp.userData.emoting = false; }
    active.delete(grp);
  }
}
