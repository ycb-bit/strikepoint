// Strikepoint — touch controls for phones/tablets.
// A mergeable input provider: main.js asks it for look deltas and merged
// movement/action state, so the desktop pipeline stays untouched. Buttons
// overlay is injected lazily and only shown on coarse-pointer devices.

const isTouchDevice = () =>
  window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
export const TOUCH_ENABLED = isTouchDevice();

const state = {
  mx: 0, mz: 0, jump: false, fire: false, zoom: false,
  sprint: false, crouch: false, slidePulse: false, reload: false,
  lookDX: 0, lookDY: 0,
  interact: false,    // plant/defuse (E)
};

// ---------- joystick (left pad) ----------
const joy = { active: false, id: null, cx: 0, cy: 0, x: 0, y: 0 };
const JOY_R = 58;

// ---------- look (right half drag) ----------
const look = { id: null, lx: 0, ly: 0 };
let lookSensitivity = 1.0;
export function setTouchSens(s) { lookSensitivity = s; }

// ---------- overlay ----------
let overlay = null;
function el(id) { return document.getElementById(id); }

function injectOverlay() {
  if (el('touchUI')) return el('touchUI');
  const wrap = document.createElement('div');
  wrap.id = 'touchUI';
  wrap.innerHTML = `
    <div id="joyBase"><div id="joyKnob"></div></div>
    <div class="tbtn look-hint" id="lookHint">DRAG TO LOOK</div>
    <button class="tbtn big" id="tFire">●</button>
    <button class="tbtn" id="tJump">▲</button>
    <button class="tbtn" id="tCrouch">⌄</button>
    <button class="tbtn" id="tReload">↻</button>
    <button class="tbtn" id="tScope">⊕</button>
    <button class="tbtn" id="tUse">E</button>
    <button class="tbtn small" id="tSprint">RUN</button>
    <button class="tbtn small" id="tEmote">:)</button>`;
  document.body.appendChild(wrap);
  overlay = wrap;
  bind();
  return wrap;
}

function setBtn(id, label) {
  const b = el(id);
  if (b) b.textContent = label;
}

function bind() {
  const base = el('joyBase'), knob = el('joyKnob');
  const place = (t) => { base.style.left = t.clientX - 70 + 'px'; base.style.top = t.clientY - 70 + 'px'; };

  const showJoy = (t) => {
    joy.active = true; joy.id = t.identifier; joy.cx = t.clientX; joy.cy = t.clientY;
    joy.x = 0; joy.y = 0;
    base.classList.add('on'); place(t); knob.style.transform = 'translate(0px,0px)';
  };
  const moveJoy = (t) => {
    let dx = t.clientX - joy.cx, dy = t.clientY - joy.cy;
    const len = Math.hypot(dx, dy);
    if (len > JOY_R) { dx = dx / len * JOY_R; dy = dy / len * JOY_R; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    // deadzone
    const dead = 8;
    joy.x = Math.abs(dx) < dead ? 0 : dx / JOY_R;
    joy.y = Math.abs(dy) < dead ? 0 : dy / JOY_R;
  };
  const hideJoy = () => {
    joy.active = false; joy.id = null; joy.x = 0; joy.y = 0;
    base.classList.remove('on'); knob.style.transform = 'translate(0px,0px)';
  };

  document.addEventListener('touchstart', (e) => {
    if (!TOUCH_ENABLED || !overlay || overlay.classList.contains('hidden')) return;
    for (const t of e.changedTouches) {
      if (t.target && t.target.closest && t.target.closest('.tbtn, #chatInput, input, button')) continue;
      if (t.clientX < innerWidth * 0.4 && t.clientY > innerHeight * 0.3 && !joy.active) {
        showJoy(t); e.preventDefault();
      } else if (look.id === null) {
        look.id = t.identifier; look.lx = t.clientX; look.ly = t.clientY;
      }
    }
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (!TOUCH_ENABLED) return;
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) { moveJoy(t); e.preventDefault(); }
      else if (t.identifier === look.id) {
        state.lookDX += (t.clientX - look.lx) * 2.6 * lookSensitivity;
        state.lookDY += (t.clientY - look.ly) * 2.6 * lookSensitivity;
        look.lx = t.clientX; look.ly = t.clientY;
      }
    }
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) hideJoy();
      if (t.identifier === look.id) look.id = null;
    }
  };
  document.addEventListener('touchend', endTouch);
  document.addEventListener('touchcancel', endTouch);

  // buttons: press & hold semantics
  const hold = (id, on, off) => {
    const b = el(id);
    b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('press'); on(); }, { passive: false });
    const stop = (e) => { e.preventDefault(); b.classList.remove('press'); off && off(); };
    b.addEventListener('touchend', stop);
    b.addEventListener('touchcancel', stop);
  };
  hold('tFire', () => { state.fire = true; }, () => { state.fire = false; });
  hold('tJump', () => { state.jump = true; }, () => { state.jump = false; });
  hold('tSprint', () => { state.sprint = !state.sprint; el('tSprint').classList.toggle('press', state.sprint); });
  // crouch: tap while sprinting = slide (server-side edge via slidePulse)
  hold('tCrouch', () => {
    state.crouch = true;
    if (state.sprint) state.slidePulse = true;
    if (el('tSprint')?.classList.contains('press')) { state.sprint = false; el('tSprint').classList.remove('press'); }
  }, () => { state.crouch = false; });
  hold('tReload', () => { state.reload = true; }, () => { state.reload = false; });
  hold('tScope', () => { state.zoom = !state.zoom; el('tScope').classList.toggle('press', state.zoom); });
  hold('tUse', () => { state.interact = true; }, () => { state.interact = false; });
  el('tEmote').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); onEmoteButton && onEmoteButton(); }, { passive: false });
}

let onEmoteButton = null;
export function onEmotePressed(fn) { onEmoteButton = fn; }
const EMOTE_CYCLE = ['wave', 'point', 'salute', 'thumbs', 'taunt'];
let emoteIdx = 0;
export function nextEmote() { return EMOTE_CYCLE[emoteIdx++ % EMOTE_CYCLE.length]; }

// show/hide the overlay (in-game only)
export function setTouchVisible(v) {
  if (!TOUCH_ENABLED) return;
  if (!overlay) { if (v) injectOverlay(); else return; }
  overlay.classList.toggle('hidden', !v);
}

// orientation guard: overlay only makes sense in landscape
function checkOrientation() {
  if (!TOUCH_ENABLED || !overlay) return;
  const bad = innerHeight > innerWidth * 1.05;
  overlay.classList.toggle('portrait', bad);
}
addEventListener('resize', checkOrientation);

// merge touch state into the desktop input object each frame
export function applyTouch(input) {
  if (!TOUCH_ENABLED) return false;
  if (Math.abs(joy.x) > 0.01 || Math.abs(joy.y) > 0.01) {
    input.mx = joy.x;
    input.mz = -joy.y;
  }
  if (state.fire) input.fire = true;
  if (state.jump) input.jump = true;
  if (state.sprint) input.sprint = true;
  if (state.crouch) input.crouch = true;
  if (state.slidePulse) { input.slide = true; state.slidePulse = false; }
  input.zoom = state.zoom;   // overwrite (not OR) so the toggle can switch off
  return true;
}

// consume accumulated look delta (call once per frame)
export function takeLookDelta() {
  const d = { dx: state.lookDX, dy: state.lookDY };
  state.lookDX = 0; state.lookDY = 0;
  return d;
}

export function consumeInteract() {
  const v = state.interact;
  return v;
}

export function consumeReloadPulse() {
  if (state.reload) { state.reload = false; return true; }
  return false;
}
