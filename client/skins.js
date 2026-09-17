// Strikepoint — operator skins.
// A skin is just a pair of colors (body + accent) plus a name. Applied as
// Lambert materials — same cost as team colors, zero extra RAM. Unlocks gate
// by profile level; selection persists in localStorage.

import { loadProfile, levelFor } from './profile.js';
import { OP_SKINS, owned } from './shop.js';

// The full catalog = legacy level-unlocks + shop skins (shop.js is the source
// of truth; keep this array for the level-gated freebies).
export const SKINS = [
  { id: 'default',  name: 'Standard',   level: 1,  body: null,      accent: 0x3a3f46 }, // null = team color
  { id: 'arctic',   name: 'Arctic',     level: 2,  body: 0xe8eef6,  accent: 0x27435c },
  { id: 'desert',   name: 'Desert Fox', level: 3,  body: 0xd9b36a,  accent: 0x6b4e1f },
  { id: 'olive',    name: 'Woodland',   level: 5,  body: 0x74875a,  accent: 0x33402a },
  { id: 'urban',    name: 'Urban Gray', level: 7,  body: 0x8b95a1,  accent: 0x2b323b },
  { id: 'crimson',  name: 'Crimson',    level: 10, body: 0xd23c2a,  accent: 0x4a120c },
];

// per-channel glow so colors read even in dim map lighting
function glow(hex, k) {
  const r = Math.min(255, ((hex >> 16) & 255) * k) | 0;
  const g = Math.min(255, ((hex >> 8) & 255) * k) | 0;
  const b = Math.min(255, (hex & 255) * k) | 0;
  return (r << 16) | (g << 8) | b;
}

const KEY = 'sp_skin';

export function getSelectedSkin() { return localStorage.getItem(KEY) || 'default'; }
export function setSelectedSkin(id) { localStorage.setItem(KEY, id); }

export function skinById(id) {
  return SKINS.find(s => s.id === id) || OP_SKINS.find(s => s.id === id) || SKINS[0];
}

// unlocked = free level unlock OR owned from the shop
export function isSkinUnlocked(id) {
  const s = skinById(id);
  if (!s) return false;
  if (s.level && s.level > 1) return levelFor(loadProfile().xp).level >= s.level;
  return owned().skins.includes(id);
}

// build the two materials for an avatar wearing this skin on this team
const matCache = new Map();
export function skinMaterials(id, teamBodyMat) {
  const s = skinById(id);
  const key = s.id + ':' + (s.body === null ? 'team' + (teamBodyMat.uuid) : s.body);
  if (!matCache.has(key)) {
    matCache.set(key, {
      body: s.body === null ? teamBodyMat
        : new (teamBodyMat.constructor)({ color: s.body, emissive: glow(s.body, 0.30) }),
      accent: new (teamBodyMat.constructor)({ color: s.accent, emissive: glow(s.accent, 0.18) }),
    });
  }
  const sm = matCache.get(key);
  return { ...sm, outfit: s.id };   // .outfit carries the matching outfit id (Arctic skin -> Arctic Ops clothes)
}
