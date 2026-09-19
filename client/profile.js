// Strikepoint — persistent local profile (XP / level / stats).
// Pure localStorage; ~0 cost. XP curve: level N costs 100*N xp.

const KEY = 'sp_profile_v1';

const DEFAULTS = { xp: 0, kills: 0, deaths: 0, wins: 0, matches: 0, hs: 0, name: null };

export function loadProfile() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
  catch { return { ...DEFAULTS }; }
}

// Give new players 5000 starter credits so they can immediately try the store.
// The flag `starterGranted` prevents double-granting on subsequent loads.
export function ensureStarterCredits() {
  const p = loadProfile();
  if (!p.starterGranted) {
    p.credits = (p.credits || 0) + 5000;
    p.starterGranted = true;
    saveProfile(p);
  }
}

export function saveProfile(p) { localStorage.setItem(KEY, JSON.stringify(p)); }

export function levelFor(xp) {
  // level starts at 1; each level needs 100*level xp (1->100, 2->200, ...)
  let lvl = 1, rem = xp;
  while (rem >= lvl * 100) { rem -= lvl * 100; lvl++; }
  return { level: lvl, into: rem, need: lvl * 100 };
}

export function rankName(level) {
  const ranks = [
    'Recruit', 'Private', 'Corporal', 'Sergeant', 'Staff Sgt.',
    'Gunnery Sgt.', 'Lieutenant', 'Captain', 'Major', 'Colonel',
    'Commander', 'General', 'Legend',
  ];
  return ranks[Math.min(ranks.length - 1, Math.floor((level - 1) / 2))];
}

// apply one match's results; returns { leveledUp, from, to, gained }
export function recordMatch(kills, deaths, won, headshots) {
  const p = loadProfile();
  const before = levelFor(p.xp).level;
  p.kills += kills; p.deaths += deaths; p.hs += headshots;
  p.matches += 1;
  if (won) p.wins += 1;
  p.xp += Math.max(5, kills * 25 + headshots * 10 + (won ? 150 : 40));
  saveProfile(p);
  const after = levelFor(p.xp).level;
  return { leveledUp: after > before, from: before, to: after, gained: p.xp };
}
