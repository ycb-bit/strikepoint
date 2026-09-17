// Strikepoint — credits economy + cosmetic shop catalog.
// Credits are earned ONLY by playing. Cosmetics only — nothing here touches
// gameplay (damage/speed/hitboxes). All purchases flow through purchase(),
// so the local trust model can later graduate to server validation.

import { loadProfile, saveProfile } from './profile.js';

// ---------- catalog ----------
// Operator skins: body + accent colors (also used for the preview swatch).
// level = free unlock by level; price = shop item (credit cost).
export const OP_SKINS = [
  { id: 'default',  name: 'Standard',   level: 1,  price: 0,    body: null,      accent: 0x3a3f46 },
  { id: 'arctic',   name: 'Arctic',     level: 0,  price: 400,  body: 0xe8eef6,  accent: 0x27435c },
  { id: 'desert',   name: 'Desert Fox', level: 0,  price: 600,  body: 0xd9b36a,  accent: 0x6b4e1f },
  { id: 'olive',    name: 'Woodland',   level: 0,  price: 600,  body: 0x74875a,  accent: 0x33402a },
  { id: 'urban',    name: 'Urban Gray', level: 0,  price: 800,  body: 0x8b95a1,  accent: 0x2b323b },
  { id: 'crimson',  name: 'Crimson',    level: 0,  price: 1200, body: 0xd23c2a,  accent: 0x4a120c },
  { id: 'royal',    name: 'Royal Blue', level: 0,  price: 1200, body: 0x2e5fd4,  accent: 0x12224e },
  { id: 'toxic',    name: 'Toxic',      level: 0,  price: 1500, body: 0x86d42e,  accent: 0x243a0d },
];

// Weapon finishes: per-weapon colorways. apply = 'all' or a specific weapon id.
// Colors: primary metal, secondary/accent, optional emissive glow factor.
export const WEAPON_SKINS = [
  { id: 'stock',    name: 'Stock',       price: 0,   apply: 'all', metal: null,      accent: null },
  { id: 'gold',     name: 'Gold',        price: 800, apply: 'all', metal: 0xd8a83a, accent: 0x7a5c14, glow: 0.35 },
  { id: 'tiger',    name: 'Tiger',       price: 500, apply: 'all', metal: 0xe09a2a, accent: 0x1c1712, glow: 0.18 },
  { id: 'carbon',   name: 'Carbon',      price: 400, apply: 'all', metal: 0x23262b, accent: 0x4a5058, glow: 0 },
  { id: 'arcticw',  name: 'Winter',      price: 400, apply: 'all', metal: 0xdde6ee, accent: 0x8fa3b5, glow: 0.2 },
  { id: 'redline',  name: 'Redline',     price: 650, apply: 'all', metal: 0xb02020, accent: 0x1c1712, glow: 0.25 },
];

// Name colors for killfeed/lobby/scoreboard.
export const NAME_COLORS = [
  { id: 'none',    name: 'Default', price: 0 },
  { id: 'amber',   name: 'Amber',   price: 500, css: '#ffb14a' },
  { id: 'mint',    name: 'Mint',    price: 500, css: '#5adfa8' },
  { id: 'sky',     name: 'Sky',     price: 500, css: '#6cc4ff' },
  { id: 'rose',    name: 'Rose',    price: 750, css: '#ff6c9d' },
];

export function itemById(kind, id) {
  const list = kind === 'skin' ? OP_SKINS : kind === 'weapon' ? WEAPON_SKINS : NAME_COLORS;
  return list.find(i => i.id === id) || null;
}

// ---------- owned inventory + loadout (persisted in profile) ----------
export function owned() {
  const p = loadProfile();
  return { skins: p.ownedSkins || ['default'], weapons: p.ownedWeapons || ['stock'], names: p.ownedNames || ['none'] };
}

export function equipped() {
  const p = loadProfile();
  return { skin: p.eqSkin || 'default', weapon: p.eqWeapon || 'stock', name: p.eqName || 'none' };
}

export function equip(kind, id) {
  const p = loadProfile();
  if (kind === 'skin') p.eqSkin = id;
  else if (kind === 'weapon') p.eqWeapon = id;
  else p.eqName = id;
  saveProfile(p);
}

function grant(list, id) { if (!list.includes(id)) list.push(id); }

// one purchase gate — later this becomes a server call (SHOP-DESIGN.md §3)
export function purchase(kind, id) {
  const item = itemById(kind, id);
  if (!item) return { ok: false, why: 'No such item' };
  const p = loadProfile();
  const list = kind === 'skin' ? (p.ownedSkins = p.ownedSkins || ['default'])
    : kind === 'weapon' ? (p.ownedWeapons = p.ownedWeapons || ['stock'])
    : (p.ownedNames = p.ownedNames || ['none']);
  if (list.includes(id)) return { ok: false, why: 'Already owned' };
  if ((p.credits || 0) < item.price) return { ok: false, why: `Need ${item.price - (p.credits || 0)} more ⚡` };
  p.credits -= item.price;
  grant(list, id);
  saveProfile(p);
  return { ok: true };
}

// ---------- earning ----------
const DAILY_CAP = 500;
const dayKey = () => new Date().toISOString().slice(0, 10);

// credits for one match: 25 base + 5/kill + 50 win; daily-capped
export function earnMatchCredits(kills, won) {
  const p = loadProfile();
  const today = dayKey();
  if (p.creditDay !== today) { p.creditDay = today; p.creditsToday = 0; }
  const gross = 25 + kills * 5 + (won ? 50 : 0);
  const room = Math.max(0, DAILY_CAP - (p.creditsToday || 0));
  const got = Math.min(gross, room);
  p.creditsToday = (p.creditsToday || 0) + got;
  p.credits = (p.credits || 0) + got;
  saveProfile(p);
  return { got, capped: got < gross };
}

export function credits() { return loadProfile().credits || 0; }
