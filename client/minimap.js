// Strikepoint — tactical minimap.
// The map's walls are pre-rendered ONCE per map into an offscreen canvas (deterministic,
// same colliders the sim uses), then each frame we blit it + draw live dots.
// Cost: 1 canvas blit + N dots — no extra WebGL memory.

export function createMinimap(canvas) {
  const ctx = canvas.getContext('2d');
  let map = null, baked = null, size = 0, worldMapName = null, seedUsed = null;

  function bake(m) {
    map = m;
    size = canvas.width;
    const half = map.half;
    const s = size / (half * 2 + 4); // px per world unit
    const toX = (x) => size / 2 + x * s;
    const toZ = (z) => size / 2 + z * s;

    baked = document.createElement('canvas');
    baked.width = size; baked.height = size;
    const b = baked.getContext('2d');

    b.fillStyle = 'rgba(10, 14, 18, 0.72)';
    b.fillRect(0, 0, size, size);
    b.strokeStyle = 'rgba(120, 200, 255, 0.10)';
    b.lineWidth = 1;
    const G = Math.ceil(half / 8);
    for (let i = -G; i <= G; i++) {
      b.beginPath(); b.moveTo(toX(i * 8), 0); b.lineTo(toX(i * 8), size); b.stroke();
      b.beginPath(); b.moveTo(0, toZ(i * 8)); b.lineTo(size, toZ(i * 8)); b.stroke();
    }
    for (const c of map.colliders) {
      if (c.y1 < 1.4) { // low cover: dimmer fill
        b.fillStyle = 'rgba(140, 190, 235, 0.22)';
        b.fillRect(toX(c.x - c.hx), toZ(c.z - c.hz), c.hx * 2 * s, c.hz * 2 * s);
      } else {
        b.fillStyle = 'rgba(150, 205, 255, 0.5)';
        b.fillRect(toX(c.x - c.hx), toZ(c.z - c.hz), c.hx * 2 * s, c.hz * 2 * s);
        b.strokeStyle = 'rgba(190, 230, 255, 0.65)';
        b.strokeRect(toX(c.x - c.hx), toZ(c.z - c.hz), c.hx * 2 * s, c.hz * 2 * s);
      }
    }
    // site rings
    for (const [site, col] of [[map.siteA, 'rgba(230,150,120,0.8)'], [map.siteB, 'rgba(120,170,230,0.8)']]) {
      b.strokeStyle = col; b.lineWidth = 1.5;
      b.beginPath(); b.arc(toX(site.x), toZ(site.z), site.r * s, 0, Math.PI * 2); b.stroke();
      b.fillStyle = col; b.font = 'bold 10px monospace'; b.textAlign = 'center';
      b.fillText(site === map.siteA ? 'A' : 'B', toX(site.x), toZ(site.z) + 3);
    }
  }

  // players: Map id -> { x, z, tm, me, alive } ; extra dots: [{x,z,color,ring}]
  function draw(players, extraDots = [], yawMe = 0) {
    if (!baked) return;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(baked, 0, 0);
    const s = size / (map.half * 2 + 4);
    const toX = (x) => size / 2 + x * s;
    const toZ = (z) => size / 2 + z * s;

    for (const d of extraDots) {
      ctx.beginPath();
      ctx.arc(toX(d.x), toZ(d.z), d.ring ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = d.color || '#ffb14a';
      if (d.ring) { ctx.strokeStyle = d.color || '#ffb14a'; ctx.stroke(); } else ctx.fill();
    }
    for (const p of players.values()) {
      if (p.alive === false) continue;
      ctx.beginPath();
      ctx.arc(toX(p.x), toZ(p.z), p.me ? 4 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = p.me ? '#ffffff' : (p.tm === 0 ? '#e8a44a' : '#5aa2e8');
      ctx.fill();
      if (p.me) { // facing wedge (sim forward = (-sin yaw, -cos yaw))
        ctx.beginPath();
        ctx.moveTo(toX(p.x), toZ(p.z));
        ctx.lineTo(toX(p.x - Math.sin(yawMe) * 9), toZ(p.z - Math.cos(yawMe) * 9));
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.stroke();
      }
    }
  }

  function ensure(m, mapName, seed) {
    if (mapName !== worldMapName || seed !== seedUsed) {
      worldMapName = mapName; seedUsed = seed;
      bake(m);
    }
  }

  return { draw, ensure };
}
