// Strikepoint — character outfits (shared by client + server).
// An OUTFIT is the structural clothing variant (which pieces the avatar gets);
// a skin/colorway is just the paint on top. Cosmetics only — zero gameplay
// difference (same hitbox, same speed).

export const OUTFITS = {
  assault:  { name: 'Assault',   tag: '🪖', desc: 'Ballistic helmet + plate carrier',      free: true },
  scout:    { name: 'Scout',     tag: '🧢', desc: 'Cap, headset, light chest rig',         level: 3 },
  officer:  { name: 'Officer',   tag: '🎖️', desc: 'Beret, high-collar jacket',             price: 600 },
  ghost:    { name: 'Ghost',     tag: '🥷', desc: 'Ski mask + hood, minimal gear',         price: 900 },
  sas:      { name: 'SAS',       tag: '😷', desc: 'Gas mask + respirator rig',             price: 1000 },
  raptor:   { name: 'Raptor',    tag: '🥽', desc: 'Goggles, jaw guard, ghillie shoulders', price: 1200 },
  juggernaut:{ name: 'Juggernaut',tag: '🛡️', desc: 'Full visor helmet, heavy plating',      price: 1500 },
  arctic:   { name: 'Arctic Ops',tag: '🧣', desc: 'Winter coat, scarf, snow goggles',      price: 800 },
};

export const OUTFIT_IDS = Object.keys(OUTFITS);

export function outfitById(id) { return OUTFITS[id] || OUTFITS.assault; }
export function isOutfitUnlocked(id, level, ownedList) {
  const o = outfitById(id);
  if (o.free) return true;
  if (o.level) return level >= o.level;
  if (o.price) return (ownedList || []).includes(id);
  return false;
}
