// Strikepoint — operator skins.
// A skin is just a pair of colors (body + accent) plus a name. Applied as
// Lambert materials — same cost as team colors, zero extra RAM. Unlocks gate
// by profile level; selection persists in localStorage.

import { loadProfile, levelFor } from './profile.js';

export const SKINS = [
  { id: 'default',  name: 'Standard',   level: 1,  body: null,      accent: 0x3a3f46 }, // null = team color
  { id: 'arctic',   name: 'Arctic',     level: 2,  body: 0xd8dee6,  accent: 0x2e3a46 },
  { id: 'desert',   name: 'Desert Fox', level: 3,  body: 0xc2a15e,  accent: 0x5e4a26 },
  { id: 'olive',    name: 'Woodland',   level: 5,  body: 0x5a6b46,  accent: 0x2e3626 },
  { id: 'urban',    name: 'Urban Gray', level: 7,  body: 0x6d7681,  accent: 0x22262b },
  { id: 'crimson',  name: 'Crimson',    level: 10, body: 0x9a3226,  accent: 0x38100c },
];

const KEY = 'sp_skin';

export function getSelectedSkin() { return localStorage.getItem(KEY) || 'default'; }
export function setSelectedSkin(id) { localStorage.setItem(KEY, id); }

export function skinById(id) { return SKINS.find(s => s.id === id) || SKINS[0]; }

export function isSkinUnlocked(id) {
  const s = skinById(id);
  const pr = loadProfile();
  return levelFor(pr.xp).level >= s.level;
}

// build the two materials for an avatar wearing this skin on this team
const matCache = new Map();
export function skinMaterials(id, teamBodyMat) {
  const s = skinById(id);
  const key = s.id + ':' + (s.body === null ? 'team' + (teamBodyMat.uuid) : s.body);
  if (!matCache.has(key)) {
    matCache.set(key, {
      body: s.body === null ? teamBodyMat
        : new (teamBodyMat.constructor)({ color: s.body, emissive: (s.body >> 1) & 0x111111 }),
      accent: new (teamBodyMat.constructor)({ color: s.accent }),
    });
  }
  return matCache.get(key);
}
