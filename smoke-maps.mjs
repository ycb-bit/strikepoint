// Verifies both new maps: bots spawn, navigate, rounds resolve without crashes.
import WebSocket from 'ws';

const URL = 'ws://localhost:3000/ws';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function testMap(mapName) {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    let id = null, joined = null, last = null, shots = 0, impacts = 0, hits = 0, kills = 0;
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', name: 'MapTest' })));
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.t === 'welcome') { id = m.id; ws.send(JSON.stringify({ t: 'create', bots: 6, map: mapName })); }
      else if (m.t === 'joined') joined = m;
      else if (m.t === 'state') {
        last = m;
        if (m.ev) for (const ev of m.ev) {
          if (ev.type === 'shot') shots++;
          if (ev.type === 'impact') impacts++;
          if (ev.type === 'hit') hits++;
          if (ev.type === 'death') kills++;
        }
      }
    });
    const t0 = Date.now();
    const iv = setInterval(() => {
      const done = Date.now() - t0 > 45000;
      const roundsDone = last && (last.sc[0] + last.sc[1]) >= 2;
      if (roundsDone || done) {
        clearInterval(iv);
        ws.close();
        resolve({
          mapName, joined: !!joined, mapServed: last ? last.mn : null,
          players: last ? last.ps.length : 0, rounds: last ? last.sc[0] + last.sc[1] : 0,
          shots, impacts, hits, kills, timedOut: done && !roundsDone,
        });
      }
    }, 1000);
  });
}

const failures = [];
for (const map of ['dust', 'compound']) {
  const r = await testMap(map);
  console.log(JSON.stringify(r));
  if (!r.joined || r.mapServed !== map || r.players < 7 || r.rounds < 1 || r.shots < 5) {
    failures.push(map);
  }
  await wait(500);
}
console.log(failures.length === 0 ? 'ALL MAPS PASS' : 'FAILED: ' + failures.join(', '));
process.exit(failures.length === 0 ? 0 : 1);
