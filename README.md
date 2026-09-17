# Strikepoint

A low-RAM, browser-based tactical FPS (CS-style bomb defusal) with multiplayer:
public matchmaking with bot fill, and private rooms with join codes.

Built with Three.js on the client and plain Node.js + `ws` on the server.
No textures, no audio assets, no database — everything is generated in code,
which keeps memory usage tiny (the whole client is a few hundred KB of JS).

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000 in your browser.

Play on your LAN: run the server and have friends open `http://<your-ip>:3000`.
Host it publicly on any Node host (Render, Railway, Fly.io, a VPS…):
set `PORT` if needed and `npm start`. WebSocket connects to the same host.

## Deploy to Render (free tier works)

1. Push this folder to a GitHub repo.
2. On render.com → **New → Web Service** → connect the repo.
3. Settings:
   - **Environment:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Health check path:** `/healthz`
4. Deploy. Render injects `PORT` — the server already reads it.

Notes for smooth handling on the free tier:
- **WebSocket + same port:** the game uses HTTP + `ws` on ONE port, which Render
  supports natively — no extra config.
- **Free instances sleep** after ~15 min idle. The first visitor after a sleep
  waits ~30–60s for spin-up (the menu's `connecting…` dot will just sit there,
  then connect — refresh if needed). A paid instance never sleeps.
- **RAM:** the whole game idles around 60–90 MB and ~2–6% CPU per active room
  (20 tick/s sim + 15 snapshots/s), well inside the free tier's 512 MB.
- **Persistence:** profiles are stored client-side (localStorage), so instance
  restarts lose nothing. Rooms rebuild when the first player joins.
- **Regions:** pick the region closest to most of your players (ping matters
  more than FPS for netcode feel).

## How to play

- **Find Match** — queues you into a public game. Bots fill empty slots up to
  10 players (5v5). The 20-player cap is enforced server-wide per room.
- **Create Room** — makes a private room with a 4-digit code; choose bot count.
  Share the code with friends (**Join Code**) to play together, human-only.
- First to **8 rounds** wins the match.
- T side: press **E** in a bomb site (A or B) to plant. CT side: press **E**
  near the planted bomb to defuse.
- **B** opens the buy menu during freeze time. Money comes from kills, wins,
  losses, plants and defuses.

### Controls

| Key | Action |
|---|---|
| WASD | Move |
| Mouse | Aim |
| Click | Fire |
| R | Reload |
| B | Buy menu (freeze time) |
| E | Plant / defuse |
| Tab | Scoreboard |
| Shift | (reserved: walk) |
| Esc | Close buy menu / release mouse |

## Architecture notes (the low-RAM part)

- **Server** (`server/`): one authoritative simulation per room at 30Hz,
  snapshots at 15Hz, only *changed* inputs are sent by clients.
  Bots share the exact same input path as humans.
- **Shared** (`shared/`): one deterministic map (axis-aligned boxes + spatial
  grid), used by the server for physics/LOS and by the client for rendering —
  no level data is ever transmitted.
- **Client** (`client/`): no lights, no shadows, no textures; a few shared
  materials; merged box world; sounds are synthesized with WebAudio.
