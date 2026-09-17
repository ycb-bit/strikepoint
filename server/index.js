// Strikepoint — game server: static files + WebSocket protocol.
// Node-only (ws). Serves the client from ./client, runs rooms & matchmaking.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { joinQueue, leaveQueue, createRoom, joinRoom, roomList, allRooms, startGc } from './rooms.js';
import { MAX_PLAYERS } from '../shared/constants.js';
import { OUTFIT_IDS } from '../shared/outfits.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// never let one bad tick kill the whole match server
process.on('uncaughtException', (e) => console.error('[uncaught]', e));
process.on('unhandledRejection', (e) => console.error('[unhandled]', e));

const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/healthz') {   // Render health check
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (url === '/') url = '/index.html';
  // serve /node_modules/* and /shared/* from the project root
  const baseDir = (url.startsWith('/node_modules/') || url.startsWith('/shared/')) ? ROOT : CLIENT_DIR;
  const fp = path.normalize(path.join(baseDir, url));
  if (!fp.startsWith(baseDir)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });

const clients = new Map(); // ws -> client info

wss.on('connection', (ws, req) => {
  // basic DoS hygiene: cap simultaneous sockets per remote IP
  const ip = (req && req.socket && req.socket.remoteAddress) || '?';
  const now = Date.now();
  for (const [k, v] of connLog) if (now - v > 60_000) connLog.delete(k);
  const seen = connLog.get(ip) || { n: 0, first: now };
  if (seen.n >= 12 && now - seen.first < 60_000) { try { ws.close(); } catch {} return; }
  seen.n++; connLog.set(ip, seen);

  const client = {
    ws, id: 'u' + Math.random().toString(36).slice(2, 10),
    name: null,
    room: null,
    queued: false,
    tokens: new Set(),        // resumes seen for this connection
    alive: true,              // for ws-level liveness probing
    send(obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); },
    sendRaw(str) { if (ws.readyState === 1) ws.send(str); },
  };
  clients.set(ws, client);

  ws.on('message', (raw) => {
    // guard: JSON object, size cap, and a per-connection rate limit
    if (typeof raw !== 'string' && !(raw instanceof ArrayBuffer) && !ArrayBuffer.isView(raw)) return;
    if (raw.length > 4096) { try { ws.close(); } catch {} return; }   // abusive size
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    const n = nowMs();
    if (n - (client.lastMsgAt || 0) < 15) return;   // >66 msg/s from one client: drop
    client.lastMsgAt = n;
    try { route(client, m); } catch (e) { console.error('route error', e); }
  });

  ws.on('close', () => {
    clients.delete(ws);
    if (client.queued) { leaveQueue(client); client.queued = false; }
    if (client.room) {
      // mid-round disconnect: hold the player's slot for a short reconnect
      // window instead of deleting them instantly
      const room = client.room;
      client.room = null;
      room.holdSeat(client.id, 30_000);
    }
  });

  client.send({ t: 'welcome', id: client.id, maxPlayers: MAX_PLAYERS });
});
const connLog = new Map();
const nowMs = () => Date.now();

function route(client, m) {
  switch (m.t) {
    case 'hello':
      client.name = String(m.name || '').slice(0, 16) || 'Player';
      client.skin = String(m.sk || 'default').slice(0, 16);
      client.wfin = String(m.wf || 'stock').slice(0, 16);   // weapon finish (cosmetic)
      client.ncolor = String(m.nc || 'none').slice(0, 16);  // name color (cosmetic)
      client.outfit = OUTFIT_IDS.includes(m.of) ? m.of : 'assault';  // clothing variant
      client.send({ t: 'hello-ok', name: client.name });
      // announce cosmetics to the current room so mid-match equips apply live
      if (client.room && client.room.announceCosmetics) client.room.announceCosmetics(client.id);
      break;

    case 'queue': {
      if (client.room) return;
      client.queued = true;
      client.queuePref = { map: m.map, mode: m.mode };
      joinQueue(client);
      break;
    }

    case 'unqueue':
      if (client.queued) { leaveQueue(client); client.queued = false; }
      break;

    case 'create':
      if (client.room || client.queued) return;
      createRoom(client, { bots: m.bots | 0, map: m.map, mode: m.mode, rules: m.rules }); // joins the room too
      break;

    case 'join':
      if (client.room || client.queued) return;
      joinRoom(client, m.code);
      break;

    case 'action':
      if (client.room) client.room.handleAction(client.id, m.a);
      break;

    case 'kick':
      if (client.room) client.room.kick(client.id, m.id);
      break;

    case 'listRooms':
      client.send({ t: 'rooms', rooms: roomList() });
      break;

    case 'report':
      console.log(`[report] from ${client.id} (${client.name || 'unnamed'}): ${String(m.msg || '').slice(0, 300)}`);
      client.send({ t: 'report-ok' });
      break;

    case 'ping': client.send({ t: 'pong', ts: typeof m.ts === 'number' ? m.ts : 0 }); break;   // RTT echo
  }
}

server.listen(PORT, () => {
  console.log(`[strikepoint] listening on http://localhost:${PORT}  (ws at /ws)`);
  startGc();
});
