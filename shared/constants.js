// Strikepoint — tuning constants shared by client and server.

export const TICK_MS = 33;         // server sim step
export const SNAPSHOT_MS = 66;     // network snapshot rate
export const WORLD_HALF = 32;

export const PLAYER_HEIGHT = 1.7;
export const PLAYER_EYE = 1.62;
export const PLAYER_RADIUS = 0.45;
export const MOVE_SPEED = 5.2;
export const SPRINT_MULT = 1.8;    // sprint is FAST now — but costs stamina
export const CROUCH_MULT = 0.55;   // crouch walk speed
export const SLIDE_MULT = 2.3;     // slide burst speed
export const SLIDE_TIME = 0.85;    // s
export const SLIDE_COOLDOWN = 1.2; // s between slides
export const STAMINA_MAX = 100;
export const STAMINA_DRAIN = 26;   // per second while sprinting (~3.8s full sprint)
export const STAMINA_REGEN = 16;   // per second while not sprinting
export const STAMINA_MIN = 20;     // must regen above this to sprint again
export const CROUCH_HEIGHT = 1.2;
export const CROUCH_EYE = 1.05;
export const PLAYER_EYE_CROUCH = CROUCH_EYE;
export const JUMP_VEL = 6.2;
export const GRAVITY = 18;

export const MAX_PLAYERS = 20;

export const ROUND = {
  freeze: 6,      // s
  live: 100,      // s (defuse round)
  bomb: 40,       // s
  plant: 3.2,     // s to plant
  defuse: 5,      // s to defuse (no kit in v1)
  end: 5,         // s of round-end slowdown
};

// game modes
export const GAME_MODES = ['defuse', 'tdm', 'ffa'];
export const TDM_KILL_LIMIT = 40;   // default; per-room rules can override
export const FFA_KILL_LIMIT = 30;
export const DM_ROUND_TIME = 420;  // s per tdm/ffa match (default)
export const RESPAWN_TIME = 3;     // s (tdm/ffa)

export const ECONOMY = {
  start: 800,
  win: 3250,
  loss: 1400,
  lossBonusStep: 500,   // +500 per consecutive loss up to +2000
  lossBonusMax: 2000,
  kill: 300,
  plant: 800,           // to planter
  teamPlantBonus: 800,  // to T team even if they lose
  defuse: 300,
};

export const BOMB_RADIUS = 3;

export const TEAM = { T: 0, CT: 1 };

export const WEAPONS = {
  knife:    { name: 'Knife',    slot: 'melee', price: 0,   dmg: 55,  hs: 1.8, rpm: 110, range: 2.2, spread: 0.004, ammo: Infinity, reload: 0,   auto: true,  penet: 0 },
  glock:    { name: 'Glock',    slot: 'secondary', price: 200, dmg: 28, hs: 2.6, rpm: 400, range: 60, spread: 0.011, ammo: 20, reserve: 60, reload: 2.0, auto: false, penet: 0.35 },
  usp:      { name: 'USP-S',    slot: 'secondary', price: 200, dmg: 33, hs: 2.8, rpm: 352, range: 60, spread: 0.010, ammo: 12, reserve: 36, reload: 2.1, auto: false, penet: 0.4 },
  deagle:   { name: 'Deagle',   slot: 'secondary', price: 700, dmg: 58, hs: 2.4, rpm: 267, range: 70, spread: 0.014, ammo: 7,  reserve: 21, reload: 2.3, auto: false, penet: 0.8 },
  mp9:      { name: 'MP9',      slot: 'primary', price: 1250, dmg: 26, hs: 2.2, rpm: 857, range: 45, spread: 0.018, ammo: 30, reserve: 90, reload: 2.1, auto: true, penet: 0.4 },
  mp5:      { name: 'MP5-SD',   slot: 'primary', price: 1500, dmg: 27, hs: 2.2, rpm: 750, range: 50, spread: 0.016, ammo: 30, reserve: 90, reload: 2.3, auto: true, penet: 0.5 },
  ak:       { name: 'AK-47',    slot: 'primary', price: 2700, dmg: 36, hs: 2.6, rpm: 600, range: 90, spread: 0.013, ammo: 30, reserve: 90, reload: 2.5, auto: true, penet: 0.775 },
  m4:       { name: 'M4A4',     slot: 'primary', price: 3100, dmg: 33, hs: 2.5, rpm: 666, range: 90, spread: 0.012, ammo: 30, reserve: 90, reload: 3.0, auto: true, penet: 0.7 },
  awp:      { name: 'AWP',      slot: 'primary', price: 4750, dmg: 99,  hs: 2.4, rpm: 41,  range: 120, spread: 0.001, ammo: 5,  reserve: 15, reload: 3.6, auto: false, penet: 0.97, scopeFov: 20 },
  dmr:      { name: 'SCAR-DMR', slot: 'primary', price: 3400, dmg: 70,  hs: 2.2, rpm: 170, range: 110, spread: 0.005, ammo: 10, reserve: 40, reload: 2.9, auto: false, penet: 0.85, scopeFov: 32 },
};

export const ARMOR_PRICE = 650;

// damage falloff (per meter) kept simple: dmg * rangeFactor^distance
export const RANGE_FACTOR = 0.9985;
export const LEG_MULTIPLIER = 0.75;
