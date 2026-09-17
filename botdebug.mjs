import { createGame, addPlayer, startMatch, tick } from './shared/sim.js';
import { botTick } from './server/bots.js';

const g = createGame('dust', 42);
addPlayer(g, 'h1', 'Human', { team: 0 });
const botIds = [];
for (let i = 0; i < 8; i++) {
  const id = 'bot' + i;
  addPlayer(g, id, 'B' + i, { bot: true, team: i % 2 === 0 ? 0 : 1 });
  botIds.push(id);
}
startMatch(g);
// skip freeze instantly
g.phase = 'live'; g.phaseEndsAt = Date.now() + 100 * 1000;

let losChecks = 0, losClearCount = 0, enemySeenTicks = 0;
const t0 = Date.now();
while (Date.now() - t0 < 20000) {
  const dt = 1 / 30;
  // measure LOS pairs once per 30 ticks
  if (losChecks === 0 || Date.now() - t0 > 5000) {
    for (const a of g.players.values()) {
      for (const b of g.players.values()) {
        if (a.team === b.team || !a.alive || !b.alive) continue;
        losChecks++;
        if (g.map.losClear(a.x, a.y + 1.62, a.z, b.x, b.y + 1.4, b.z)) losClearCount++;
      }
    }
  }
  for (const id of botIds) {
    const p = g.players.get(id);
    if (p && p.bot) botTick(g, p, dt);
  }
  tick(g, dt);
  if (g.roundEvents.some(e => e.type === 'shot')) enemySeenTicks++;
}
console.log('LOS pairs:', losChecks, 'clear:', losClearCount);
console.log('ticks with shots:', enemySeenTicks);
console.log('positions of first CT/T after 20s:');
for (const p of g.players.values()) {
  console.log(` ${p.name} team=${p.team} (${p.x.toFixed(1)},${p.z.toFixed(1)}) hp=${p.hp}`);
}
process.exit(0);
