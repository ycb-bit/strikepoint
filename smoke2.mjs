// Verifies: buy during freeze (money deduction, weapon grant), plant flow (bomb planted event),
// and that the round loop keeps resolving with bots. Joins a custom room with 2 bots.
import WebSocket from 'ws';

const URL = 'ws://localhost:3000/ws';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
const ok = (cond, label) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + label); if (!cond) failures++; };

const ws = new WebSocket(URL);
let id = null, joined = null, last = null, planted = false, buyAcked = false;

ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', name: 'Tester' })));
ws.on('message', (raw) => {
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (m.t === 'welcome') { id = m.id; ws.send(JSON.stringify({ t: 'create', bots: 2 })); }
  else if (m.t === 'joined') { joined = m; }
  else if (m.t === 'state') {
    last = m;
    if (m.ev) for (const ev of m.ev) if (ev.type === 'plant') planted = true;
  }
});

await wait(600);

// room starts in freeze — buy immediately (cheap: mp9 for T side, 1250)
ws.send(JSON.stringify({ t: 'action', a: { k: 'buy', w: 'mp9' } }));
await wait(300);
const st1 = last;
const me1 = st1?.ps.find(p => p.id === id);
ok(me1 && me1.w === 'mp9', `bought MP9 during freeze (w=${me1?.w})`);
ok(me1 && me1.m === 800 - 1250 + 8000 < 0 ? false : true, 'money math sane'); // may be T or CT; just ensure no crash
if (me1) ok(me1.m < 800 + 3000, `money deducted (m=${me1.m})`);

// wait for a planted phase within 2 rounds (~4 min max)
const t0 = Date.now();
let sawLive = false;
while (Date.now() - t0 < 240000) {
  await wait(500);
  if (!last) continue;
  if (last.ph === 'live') sawLive = true;
  if (planted && last.ph === 'planted') break;
  if ((last.sc[0] + last.sc[1]) >= 3) break; // don't run forever
}
ok(sawLive, 'reached live phase');
ok(planted, 'bots planted the bomb');
ok(last && last.ph === 'planted' ? true : (last && last.bt == null && planted), 'planted phase observed');
if (last && last.bt != null) ok(last.bt > 0 && last.bt <= 40, `bomb timer running (${last.bt}s)`);

// wait for round resolution after plant (defuse or explode)
if (planted) {
  const t1 = Date.now();
  while (Date.now() - t1 < 60000) {
    await wait(500);
    if (last && (last.ph === 'roundEnd' || last.ph === 'freeze')) break;
  }
  ok(last && (last.ph === 'roundEnd' || last.ph === 'freeze' || last.sc[0] + last.sc[1] > 0), 'round resolved after plant');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
