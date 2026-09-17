import { createGame, addPlayer, startMatch, tick } from './shared/sim.js';
import { botTick } from './server/bots.js';

const mode = process.argv[2] || 'defuse';
const map = process.argv[3] || 'dust';
const g = createGame(map, 42, mode);
addPlayer(g, 'h1', 'Human', { team: 0 });
const botIds = [];
for (let i = 0; i < 8; i++) {
  const id = 'bot' + i;
  addPlayer(g, id, 'B' + i, { bot: true, team: i % 2 === 0 ? 0 : 1 });
  botIds.push(id);
}
startMatch(g);
// skip freeze instantly (dm modes need the phase flip too)
if (g.mode !== 'defuse') { g.phase = 'live'; g.phaseEndsAt = g.dmEndsAt; }
else { g.phase = 'live'; g.phaseEndsAt = Date.now() + 100 * 1000; }

let shots = 0, deaths = 0, plants = 0, kills0 = 0;
const t0 = Date.now();
let lastLog = 0;
while (Date.now() - t0 < 20000) {
  const dt = 1 / 30;
  for (const wasDead of botIds) {
    const p = g.players.get(wasDead);
    if (p && p.bot) botTick(g, p, dt);
  }
  tick(g, dt);
  shots += g.roundEvents.filter(e => e.type === 'shot').length;
  deaths += g.roundEvents.filter(e => e.type === 'death').length;
  if (mode === 'defuse') plants += g.roundEvents.filter(e => e.type === 'plant').length;
  if (Date.now() - lastLog > 10000) {
    lastLog = Date.now();
    const b1 = g.players.get('bot0');
    console.log(`phase=${g.phase} t=${Math.round((Date.now() - t0) / 1000)}s shots=${shots} deaths=${deaths} plants=${plants} bot0=(${b1.x.toFixed(1)},${b1.z.toFixed(1)})`);
  }
}
if (mode === 'ffa') {
  for (const p of g.players.values()) if (p.id === 'bot0') kills0 = p.kills;
}
console.log(`FINAL mode=${mode} phase=${g.phase} score=${g.score} shots=${shots} deaths=${deaths}${mode === 'defuse' ? ` plants=${plants}` : ''}${mode === 'ffa' ? ` bot0kills=${kills0}` : ''}`);
process.exit(0);
