// Headless smoke test: queue 2 clients -> match forms with bots; 1 client creates a custom room.
import WebSocket from 'ws';

const URL = 'ws://localhost:3000/ws';
let failures = 0;
const ok = (cond, label) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + label); if (!cond) failures++; };

function client(name) {
  const ws = new WebSocket(URL);
  const c = { ws, name, id: null, joined: null, states: 0, lastState: null, errors: [] };
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', name })));
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'welcome') c.id = m.id;
    else if (m.t === 'joined') c.joined = m;
    else if (m.t === 'error') c.errors.push(m.msg);
    else if (m.t === 'state') { c.states++; c.lastState = m; }
  });
  return c;
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 8000, step = 150) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await wait(step); }
  return false;
};

const a = client('Alice');
const b = client('Bob');
await wait(400);
a.ws.send(JSON.stringify({ t: 'queue' }));
b.ws.send(JSON.stringify({ t: 'queue' }));

ok(await until(() => a.joined && b.joined), 'both queuers joined a match');
ok(await until(() => a.states > 5), 'receiving state snapshots');

const st = a.lastState;
const bots = st.ps.filter(p => p.b).length;
const humans = st.ps.filter(p => !p.b).length;
ok(humans === 2, `2 humans in match (got ${humans})`);
ok(bots >= 6 && bots <= 8, `bots filled to 10 total (got ${bots} bots)`);
ok(st.ps.length <= 20, `player cap <= 20 (got ${st.ps.length})`);
ok(st.ph === 'freeze' || st.ph === 'live', `match started, phase=${st.ph}`);
ok(st.sd != null, 'map seed transmitted');
ok(a.joined.kind === 'public', 'room kind public');

// send an input from Alice, expect her position to change over time
const before = st.ps.find(p => p.id === a.id);
a.ws.send(JSON.stringify({ t: 'action', a: { k: 'input', i: { mx: 1, mz: 1, jump: false, fire: false, yaw: 1.0, pitch: 0 } } }));
let after = null;
await until(() => {
  const cur = a.lastState.ps.find(p => p.id === a.id);
  if (cur && (Math.abs(cur.x - before.x) > 1 || Math.abs(cur.z - before.z) > 1)) { after = cur; return true; }
  a.ws.send(JSON.stringify({ t: 'action', a: { k: 'input', i: { mx: 1, mz: 1, jump: false, fire: false, yaw: 1.0, pitch: 0 } } }));
  return false;
}, 10000);
ok(!!after, 'input moved the player');

// custom room flow
const c = client('Carol');
await wait(400);
c.ws.send(JSON.stringify({ t: 'create', bots: 4 }));
ok(await until(() => c.joined && c.joined.kind === 'custom'), 'creator landed in custom room');
const code = c.joined.room;
ok(/^\d{4}$/.test(code), `join code issued: ${code}`);

const d = client('Dave');
await wait(300);
d.ws.send(JSON.stringify({ t: 'join', code }));
ok(await until(() => d.joined && d.joined.room === code), 'friend joined by code');
ok(await until(() => {
  const s = d.lastState;
  return s && s.ps.filter(p => p.b).length === 4;
}, 6000), 'custom room spawned exactly 4 bots');

// bad code rejected
const e = client('Eve');
await wait(300);
e.ws.send(JSON.stringify({ t: 'join', code: '9999' }));
ok(await until(() => e.errors.includes('Room not found'), 4000), 'bad code rejected');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
