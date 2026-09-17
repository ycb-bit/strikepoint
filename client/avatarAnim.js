// Strikepoint — avatar animation, procedural driver.
// Legs are driven by DISTANCE TRAVELED (stride phase advances with real speed),
// so feet plant where they should — no moonwalking. Knees bend, the torso
// bobs/leans, and crouch/slide are full-body poses. Procedural = ~0 cost and
// perfectly synced to the sim, unlike fixed-rate keyframe clips.

const ID_Q = null; // (kept for readability)

function createAnimator(grp) {
  const b = grp.bones;
  let phase = 0;        // stride phase (radians), advances with distance
  let t = 0;            // wall-clock for idle sway
  let runF = 0;         // smoothed 0..1 walk->run blend
  let crouchF = 0;      // smoothed crouch blend
  let slideF = 0;       // smoothed slide blend

  return {
    /**
     * s = { dt, speed, sliding, crouching, dead }
     */
    set(s) {
      const dt = s.dt || 0.016;
      if (s.dead) return;                       // corpse: keep last pose, body tumbles as a unit
      const speed = s.speed || 0;
      t += dt;

      // smooth state blends (no pops)
      const targetRun = Math.min(1, Math.max(0, (speed - 4.8) / 2.4));
      runF += (targetRun - runF) * Math.min(1, dt * 8);
      crouchF += ((s.crouching ? 1 : 0) - crouchF) * Math.min(1, dt * 10);
      slideF += ((s.sliding ? 1 : 0) - slideF) * Math.min(1, dt * 12);

      const emoting = !!grp.userData.emoting;   // emotes own the arms while active
      const moveF = Math.min(1, speed / 3.2);   // overall movement blend

      // ---- SLIDE pose (full body) ----
      if (slideF > 0.02) {
        b.legL.rotation.x = 1.15 * slideF;                 // front leg extended
        b.legR.rotation.x = -0.3 * slideF;                 // trailing leg folded under
        b.legLKnee.rotation.x = -0.35 * slideF;
        b.legRKnee.rotation.x = -1.05 * slideF;
        b.torso.rotation.x = 0.4 * slideF;                 // lean back (top tips backward)
        b.torso.position.y = 0.95 - 0.42 * slideF;         // drop low
        if (!emoting) {
          b.armL.rotation.x = -0.9 * slideF;
          b.armR.rotation.x = -0.9 * slideF;               // arms up for balance
        }
        if (slideF > 0.98) return;
      }

      // ---- CROUCH pose / crouch-walk ----
      if (crouchF > 0.02) {
        // stride in crouch is short and quick
        const strideLen = 1.0;
        if (speed > 0.3) phase += (speed * dt / strideLen) * Math.PI * 2;
        const sw = Math.sin(phase);
        const stepA = Math.min(1, speed / 2.4) * 0.4;      // small crouch steps
        b.legL.rotation.x = lerp(b.legL.rotation.x, 0.9 + sw * stepA, slideF === 0 ? 1 : 1 - slideF);
        b.legR.rotation.x = lerp(b.legR.rotation.x, 0.9 - sw * stepA, slideF === 0 ? 1 : 1 - slideF);
        b.legLKnee.rotation.x = lerp(b.legLKnee.rotation.x, -1.35 + Math.max(0, -sw) * stepA * 1.4, 1);
        b.legRKnee.rotation.x = lerp(b.legRKnee.rotation.x, -1.35 + Math.max(0, sw) * stepA * 1.4, 1);
        b.torso.rotation.x = lerp(b.torso.rotation.x, -0.12, 1 - slideF);  // slight forward hunch
        b.torso.position.y = lerp(b.torso.position.y, 0.95 - 0.30 + Math.abs(Math.cos(phase)) * 0.012, 1 - slideF);
        if (!emoting) {
          b.armL.rotation.x = -0.45;
          b.armR.rotation.x = -0.45;
        }
        if (crouchF > 0.98) return;
      }

      // ---- STAND / WALK / RUN ----
      const blendIn = Math.max(1 - slideF, 0) * Math.max(1 - crouchF, 0);
      if (blendIn > 0.02) {
        const strideLen = 1.45 + runF * 0.85;              // run covers more ground per stride
        if (speed > 0.3) phase += (speed * dt / strideLen) * Math.PI * 2;
        const sw = Math.sin(phase), cw = Math.cos(phase);

        // hips swing; knees bend during the forward swing (heel-up), straight at plant
        const hipA = (0.5 * (1 - runF) + 0.85 * runF) * moveF;
        const kneeA = 0.22 + runF * 0.95;
        const kL = -kneeA * Math.max(0, cw);
        const kR = -kneeA * Math.max(0, -cw);
        b.legL.rotation.x = b.legL.rotation.x * (1 - blendIn) + (sw * hipA) * blendIn;
        b.legR.rotation.x = b.legR.rotation.x * (1 - blendIn) + (-sw * hipA) * blendIn;
        b.legLKnee.rotation.x = b.legLKnee.rotation.x * (1 - blendIn) + kL * blendIn;
        b.legRKnee.rotation.x = b.legRKnee.rotation.x * (1 - blendIn) + kR * blendIn;

        // torso: bob (2 per cycle), forward lean with speed, slight roll sway
        const bob = Math.abs(cw) * (0.02 + runF * 0.045);
        b.torso.position.y = b.torso.position.y * (1 - blendIn) + (0.95 + bob - runF * 0.03) * blendIn;
        b.torso.rotation.x = b.torso.rotation.x * (1 - blendIn) + (-runF * 0.20 - moveF * 0.04) * blendIn;
        b.torso.rotation.z = (Math.sin(phase) * 0.035 * moveF) * blendIn;

        // arms counter-swing gently (kept small — hands hold the rifle)
        if (!emoting) {
          const armA = 0.16 * (1 - runF) + 0.5 * runF;
          b.armL.rotation.x = b.armL.rotation.x * (1 - blendIn) + (-sw * armA - 0.12 * moveF) * blendIn;
          b.armR.rotation.x = b.armR.rotation.x * (1 - blendIn) + (sw * armA - 0.12 * moveF) * blendIn;
        }
      }

      // ---- IDLE breathing (always applied under everything) ----
      if (moveF < 0.05 && slideF < 0.05 && crouchF < 0.05) {
        b.torso.position.y = 0.95 + Math.sin(t * 1.7) * 0.009;
        b.torso.rotation.z *= 0.9;
        if (!emoting) {
          b.armL.rotation.x = Math.sin(t * 1.7) * 0.02;
          b.armR.rotation.x = Math.sin(t * 1.7 + 1) * 0.02;
          b.legL.rotation.x *= 0.9; b.legR.rotation.x *= 0.9;
          b.legLKnee.rotation.x *= 0.9; b.legRKnee.rotation.x *= 0.9;
        }
      }
    },
  };
}

function lerp(a, k, t) { return a + (k - a) * Math.max(0, Math.min(1, t)); }

export { createAnimator };
