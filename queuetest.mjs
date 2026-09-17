// reproduce the public matchmaking flow exactly as the browser does
import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3000/ws');
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now()-t0)/1000).toFixed(1)}s]`, m);
let gotJoined = false;
ws.on('open', () => { log('open'); ws.send(JSON.stringify({ t: 'hello', name: 'QueueTest', sk: 'default', wf: 'stock', nc: 'none', of: 'assault' })); setTimeout(() => { log('sending queue'); ws.send(JSON.stringify({ t: 'queue', map: '', mode: 'tdm' })); }, 300); });
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.t === 'welcome') return;
  log('msg: ' + m.t + (m.t === 'state' ? ` phase=${m.ph} players=${m.ps?.length}` : m.t === 'error' ? ' ERROR=' + m.msg : ''));
  if (m.t === 'joined') { gotJoined = true; log('*** MATCH JOINED ***'); }
});
ws.on('close', () => log('closed'));
ws.on('error', (e) => log('ws error: ' + e.message));
setTimeout(() => { log(gotJoined ? 'RESULT: PASS' : 'RESULT: FAIL — never joined'); process.exit(gotJoined ? 0 : 1); }, 9000);
