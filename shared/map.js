// Strikepoint — shared map engine + layout registry.
// createMap(name, seed): deterministic colliders, spawns, sites, waypoint graph,
// circle collision, LOS, and ray-hit distance. Used by server sim AND client render.
// Everything is axis-aligned boxes/cylinders on a flat floor => tiny CPU + RAM.

const GRID_CELL = 2;
const MAX_RADIUS = 0.6;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------- layouts ----------------
// Each layout: { name, half, sky, build(add, rng), sites:{A,B}, spawns:{T,CT,yaw}, nodes, edges }
const LAYOUTS = {};

LAYOUTS.arena = {
  name: 'arena', half: 32, sky: 0x9db4c4,
  env: { skyTop: '#6f95b5', skyMid: '#a9c4d8', skyHor: '#d7e2e8', fog: 0xa9c4d8, sun: 0xfff2d9, sunI: 0.55, hemiSky: 0xdfeaf2, hemiGround: 0x54524c, hemiI: 0.85, floor: 0x6a7480, grid: 0x606a76, low: 0x77907e, skirt: 0x525c66, floorStyle: 'grid', wall: 0x8f9ba6, wallTop: 0xb8c2cb, crate: 0x9c7f56, crateAlt: 0x8a7150, crateDk: 0x76603f },
  build(add) {
    add(0, -32, 33, 1, 6); add(0, 32, 33, 1, 6); add(-32, 0, 1, 33, 6); add(32, 0, 1, 33, 6);
    add(-10, -30, 0.5, 2, 4); add(-10, -14, 0.5, 8, 4); add(-10, 19, 0.5, 13, 4);
    add(10, 30, 0.5, 2, 4); add(10, 14, 0.5, 8, 4); add(10, -19, 0.5, 13, 4);
    add(2.5, 0, 1.5, 1.5, 3); add(-2.5, 0, 1.5, 1.5, 3);
    add(-22, -22, 1, 1, 2); add(-20, -24, 1, 1, 2); add(-24, -19, 1, 1, 2); add(-17, -18, 1.5, 1.5, 1.1); add(-14, -24, 2, 0.5, 1.1);
    add(22, 22, 1, 1, 2); add(20, 24, 1, 1, 2); add(24, 19, 1, 1, 2); add(17, 18, 1.5, 1.5, 1.1); add(14, 24, 2, 0.5, 1.1);
    add(-6, 16, 1, 1, 2); add(6, -16, 1, 1, 2);
    for (const [bx, bz] of [[-27, -14], [27, 14], [-13, -27], [13, 27], [-16, -25], [16, 25]]) add(bx, bz, 0.42, 0.42, 1.15, 0, 'barrel');
    add(-10, 22.6, 0.55, 0.7, 0.62, 0, 'sandbag'); add(10, -22.6, 0.55, 0.7, 0.62, 0, 'sandbag');
    add(-10, 4.6, 0.55, 1.5, 0.62, 0, 'sandbag'); add(10, -4.6, 0.55, 1.5, 0.62, 0, 'sandbag');
    add(-25.4, -18, 1.1, 1.1, 2.1); add(-25.4, -15.6, 1.1, 1.1, 1.05);
    add(25.4, 18, 1.1, 1.1, 2.1); add(25.4, 15.6, 1.1, 1.1, 1.05);
    add(0, 0, 11, 0.35, 3.6, 3.0, 'beam'); add(0, 0, 0.35, 11, 3.6, 3.0, 'beam');
  },
  sites: { A: { x: -20, z: -21, r: 5 }, B: { x: 20, z: 21, r: 5 } },
  spawns: { T: { x: -24, z: 24 }, CT: { x: 24, z: -24 }, yawT: Math.PI * 0.75, yawCT: -Math.PI * 0.25 },
  nodes: [
    { x: -24, z: 24 }, { x: -24, z: 10 }, { x: -24, z: -4 }, { x: -10, z: 0 },
    { x: -20, z: -20 }, { x: -10, z: -25 }, { x: 0, z: -10 }, { x: 0, z: 10 },
    { x: -2, z: 26 }, { x: 24, z: 10 }, { x: 24, z: -4 }, { x: 10, z: 0 },
    { x: 20, z: 20 }, { x: 10, z: 25 }, { x: 24, z: -24 },
  ],
  edges: [[0, 1], [1, 2], [2, 3], [3, 4], [3, 6], [5, 4], [5, 6], [6, 7], [6, 11], [7, 11],
    [7, 8], [8, 0], [9, 10], [9, 12], [10, 11], [10, 14], [11, 12], [13, 12], [13, 7], [8, 13]],
};

// big Dust2-style two-lane map: mid double-doors, long A, tunnels to B
LAYOUTS.dust = {
  name: 'dust', half: 56, sky: 0xa8b4c2,
  env: { skyTop: '#9c8a63', skyMid: '#cbb98f', skyHor: '#ecdcb2', fog: 0xd8c9a4, sun: 0xffe6b0, sunI: 0.62, hemiSky: 0xf2e4c2, hemiGround: 0x6b5a3e, hemiI: 0.8, floor: 0x9a8a66, low: 0x8d7c58, skirt: 0x5e5138, floorStyle: 'sand', wall: 0xb3a077, wallTop: 0xc9b892, crate: 0xa08a5c, crateAlt: 0x8f7a4e, crateDk: 0x7a6844, rock: 0x8f8060, sandbag: 0xb3a98c },
  build(add) {
    const H = 56, W = 5;
    add(0, -H, H + 1, 1, W); add(0, H, H + 1, 1, W); add(-H, 0, 1, H + 1, W); add(H, 0, 1, H + 1, W);
    // mid corridor walls with door gap at z=0
    add(-10, -10, 0.5, 8, W); add(-10, 10, 0.5, 8, W);
    add(10, -10, 0.5, 8, W); add(10, 10, 0.5, 8, W);
    add(-5, 0, 3, 0.4, W); add(5, 0, 3, 0.4, W); // mid doors
    // long A wall (x=26) with T entrance gap z=8..20
    add(26, -16, 0.5, 24, W); add(26, 34, 0.5, 14, W);
    // A site NE: crate cover
    add(38, -38, 2, 2, 2.2); add(44, -32, 2, 2, 1.1); add(50, -42, 2, 2, 2.2);
    add(32, -30, 1.5, 1.5, 1.1); add(46, -48, 1.2, 1.2, 2.1);
    add(38, -44, 0.42, 0.42, 1.15, 0, 'barrel'); add(33, -36, 0.42, 0.42, 1.15, 0, 'barrel');
    add(41, -34, 3, 0.5, 0.62, 0, 'sandbag');
    // tunnels corridor (x=-44..-36, z=-26..20) to B
    add(-44, -3, 0.5, 23, W); add(-36, -3, 0.5, 23, W);
    // B room (NW): east wall + south wall with tunnel entrance gap x=-46..-40
    add(-26, -43, 0.5, 13, W);
    add(-50, -26, 4, 0.5, W); add(-34, -26, 6, 0.5, W);
    add(-40, -40, 2, 2, 2.2); add(-46, -34, 2, 2, 1.1); add(-34, -46, 2, 2, 1.6);
    add(-48, -46, 1.2, 1.2, 2.1); add(-31, -40, 0.42, 0.42, 1.15, 0, 'barrel');
    add(-42, -32, 3, 0.5, 0.62, 0, 'sandbag');
    // CT-side cover between mid and sites
    add(14, -34, 1.5, 1.5, 1.1); add(-14, -30, 1.5, 1.5, 1.1);
    add(16, -46, 2, 0.5, 1.1); add(-16, -44, 2, 0.5, 1.1);
    // T side yards dressing
    add(18, 30, 1.5, 1.5, 1.1); add(-18, 32, 1.5, 1.5, 1.1);
    add(34, 22, 2, 2, 2.2); add(-34, 24, 2, 2, 2.2);
    for (const [bx, bz] of [[8, 30], [-8, 30], [30, 8], [-30, -8], [22, 44], [-22, 44]]) add(bx, bz, 0.42, 0.42, 1.15, 0, 'barrel');
    add(0, 40, 4, 0.5, 0.62, 0, 'sandbag'); add(0, -40, 4, 0.5, 0.62, 0, 'sandbag');
    // desert dressing: containers in the yards
    add(44, 24, 3, 1.2, 2.6, 0, 'container'); add(-14, 40, 1.2, 3, 2.6, 0, 'container');
    // overhead beams across mid + long
    add(0, 0, 12, 0.4, 3.8, 3.2, 'beam'); add(34, -12, 0.4, 14, 3.8, 3.2, 'beam');
  },
  sites: { A: { x: 40, z: -38, r: 6 }, B: { x: -40, z: -40, r: 6 } },
  spawns: { T: { x: 0, z: 46 }, CT: { x: 0, z: -46 }, yawT: Math.PI, yawCT: 0 },
  nodes: [
    { x: 0, z: 46 },    // 0 T spawn
    { x: 0, z: 26 },    // 1 mid S
    { x: 0, z: 0 },     // 2 doors
    { x: 0, z: -24 },   // 3 mid N
    { x: 0, z: -46 },   // 4 CT spawn
    { x: 20, z: 12 },   // 5 long gap W
    { x: 32, z: 12 },   // 6 long gap E
    { x: 42, z: 4 },    // 7 long
    { x: 38, z: -30 },  // 8 A approach
    { x: 40, z: -40 },  // 9 A site
    { x: 24, z: -44 },  // 10 CT->A
    { x: -40, z: 26 },  // 11 tunnels entrance
    { x: -40, z: 10 },  // 12 tunnels
    { x: -40, z: -18 }, // 13 tunnels end
    { x: -42, z: -30 }, // 14 B entrance
    { x: -40, z: -42 }, // 15 B site
    { x: 14, z: -22 },  // 16 mid->A connector
    { x: -14, z: 26 },  // 17 mid->tunnels connector
  ],
  edges: [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10],
    [10, 4], [10, 3], [3, 16], [16, 10], [0, 11], [11, 12], [12, 13], [13, 14], [14, 15],
    [13, 3], [1, 17], [17, 11]],
};

// neo-city: two crossing streets, plaza with a glass tower lobby (walk-in), parking
// garage (walk-in, low ceiling), alley cuts, rooftop accents. Dense cover everywhere.
LAYOUTS.city = {
  name: 'city', half: 60, sky: 0x8fa3b8,
  env: { skyTop: '#4e6377', skyMid: '#8ba0b2', skyHor: '#c2cdd6', fog: 0x9fb0be, sun: 0xdfe8f0, sunI: 0.42, hemiSky: 0xbcd0dd, hemiGround: 0x43484e, hemiI: 0.75, floor: 0x59636e, low: 0x5f7a5a, skirt: 0x3f474f, floorStyle: 'road', roadsV: [-30, 30], roadsH: [-28, 28], roadW: 11, asphalt: 0x3d434b, dash: 0xd6d6c4, wall: 0x7f8b96, wallTop: 0x99a4ae, crate: 0x6f7d88, crateAlt: 0x5f6c76, crateDk: 0x4e5a64, car: 0x9a4a3e, carDark: 0x282d33, container: 0x3f6f8a, dumpster: 0x4a6b4f, pole: 0x3a3f45, shelf: 0x72808a, planter: 0x8a5a42, sandbag: 0x8f9a86 },
  build(add) {
    const H = 60, W = 6;
    // perimeter
    add(0, -H, H + 1, 1, W); add(0, H, H + 1, 1, W); add(-H, 0, 1, H + 1, W); add(H, 0, 1, H + 1, W);
    // street plan: vertical streets at x=-30 and x=30, horizontal at z=-28 and z=28
    // street cross-section: two sidewalks (raised slabs, walkable over? no — keep flat)
    // --- NW block (x<-6, z<-6): tower + garage ---
    add(-20, -20, 9, 9, W);                    // tower core
    add(-20, -9.2, 6, 0.5, W); add(-27, -9.2, 2.5, 0.5, W);   // tower lobby south wall w/ door gap
    add(-8.8, -20, 0.5, 6, W); add(-8.8, -28, 0.5, 3, W);     // lobby east wall w/ gap
    add(-33, -40, 8, 0.5, W); add(-13, -40, 8, 0.5, W);       // garage north wall (gap x -25..-21)
    add(-38, -31, 0.5, 8.5, W); add(-13, -31, 0.5, 8.5, W);   // garage side walls (gap x -22..-29?)
    add(-26, -35, 3, 3, 1.4);                  // garage car
    add(-17, -35, 3, 3, 1.4);                  // garage car 2
    add(-30, -43, 2, 1, 1.1);                  // garage crate
    // --- NE block (x>6, z<-6): apartment row with alley ---
    add(18, -18, 4, 10, W); add(27, -18, 4, 10, W);           // two apartments
    add(22.5, -18, 0.5, 10, W);                              // alley divider (alley x 22.9..27)
    add(40, -20, 5, 12, W);                                  // far apartment
    add(12, -32, 4, 1, 2.2); add(14, -40, 1.5, 1.5, 1.1);    // street cover
    add(33, -34, 2, 2, 2.2); add(45, -34, 2, 2, 1.1);        // NE corner yard
    // --- SW block (x<-6, z>6): market plaza ---
    add(-18, 18, 5, 5, W);                     // market hall (solid)
    add(-30, 12, 0.5, 4, W); add(-30, 24, 0.5, 4, W);        // west stalls walls
    add(-38, 18, 2, 2, 1.6); add(-24, 26, 2, 2, 1.6);        // crates
    add(-44, 30, 3, 1, 2.2); add(-34, 40, 2, 2, 2.2);        // SW corner cover
    // --- SE block (x>6, z>6): offices + courtyard ---
    add(18, 18, 5, 5, W);                      // office block
    add(30, 14, 0.5, 5, W); add(30, 26, 0.5, 5, W);          // courtyard walls w/ center gap
    add(38, 20, 3, 3, W);                      // inner office
    add(44, 32, 2, 2, 1.6); add(36, 38, 2, 2, 1.6);
    // plaza center cover
    add(0, 0, 2, 2, 2.2); add(-6, 6, 1.5, 1.5, 1.1); add(6, -6, 1.5, 1.5, 1.1);
    add(0, 14, 3, 0.5, 0.62, 0, 'sandbag'); add(0, -14, 3, 0.5, 0.62, 0, 'sandbag');
    for (const [bx, bz] of [[-10, -2], [10, 2], [-2, 10], [2, -10], [-46, -8], [46, 8], [-8, 46], [8, -46]])
      add(bx, bz, 0.42, 0.42, 1.15, 0, 'barrel');
    add(-14, 0, 0.5, 6, W); add(14, 0, 0.5, 6, W);           // center street dividers
    // --- street life: parked cars, lamps, planters, dumpsters, containers ---
    const car = (x, z, vert) => {
      if (vert) { add(x, z, 1.0, 2.2, 0.85, 0, 'car'); add(x, z, 0.8, 1.05, 1.35, 0.85, 'carTop'); }
      else { add(x, z, 2.2, 1.0, 0.85, 0, 'car'); add(x, z, 1.05, 0.8, 1.35, 0.85, 'carTop'); }
    };
    car(-30, -12, true); car(-30, 18, true); car(-30, -34, true);
    car(-12, -28, false); car(12, 28, false); car(-42, 28, false); car(42, 0, false);
    const lamp = (x, z) => { add(x, z, 0.12, 0.12, 4.6, 0, 'lamp'); add(x, z, 0.7, 0.2, 4.5, 4.2, 'lampHead'); };
    lamp(-30, -28); lamp(36, -28); lamp(-30, 28); lamp(36, 28); lamp(0, 8); lamp(0, -8); lamp(-14, 28); lamp(14, -28);
    add(8, 8, 1.3, 1.3, 0.72, 0, 'planter'); add(-8, -8, 1.3, 1.3, 0.72, 0, 'planter');
    add(25, -6, 1.1, 2.2, 1.3, 0, 'dumpster'); add(-46, 8, 2.2, 1.1, 1.3, 0, 'dumpster');
    add(48, 40, 3, 1.2, 2.6, 0, 'container'); add(-48, -40, 3, 1.2, 2.6, 0, 'container');
    add(48, -40, 1.2, 3, 2.6, 0, 'container');
  },
  sites: { A: { x: -20, z: -20, r: 7 }, B: { x: 30, z: 30, r: 7 } },
  spawns: { T: { x: -8, z: 46 }, CT: { x: 8, z: -46 }, yawT: Math.PI, yawCT: 0 },
  nodes: [
    { x: -8, z: 46 },   // 0 T spawn
    { x: -8, z: 28 },   // 1 S street
    { x: -8, z: 8 },    // 2 plaza S
    { x: 0, z: 0 },     // 3 plaza center
    { x: 8, z: -8 },    // 4 plaza N
    { x: 8, z: -28 },   // 5 N street
    { x: 8, z: -46 },   // 6 CT spawn
    { x: -30, z: 8 },   // 7 W street
    { x: -30, z: -8 },  // 8
    { x: -20, z: -20 }, // 9 tower A site
    { x: -24, z: -35 }, // 10 garage
    { x: -20, z: -46 }, // 11 NW corner
    { x: 18, z: -28 },  // 12 apartments front
    { x: 30, z: -8 },   // 13 E street
    { x: 18, z: 8 },    // 14 courtyard
    { x: 30, z: 30 },   // 15 courtyard B site
    { x: -18, z: 28 },  // 16 market
    { x: -30, z: 40 },  // 17 SW corner
    { x: 30, z: 12 },   // 18 courtyard gate
    { x: 46, z: 0 },    // 19 E avenue
  ],
  edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [1, 16], [16, 17], [7, 8], [8, 9],
    [9, 10], [10, 11], [8, 11], [1, 7], [2, 7], [5, 12], [12, 5], [5, 13], [13, 4], [13, 18],
    [18, 14], [14, 15], [4, 14], [3, 19], [13, 19], [19, 6], [17, 2]],
},

// indoor complex: many rooms + corridors, tight CQB — the opposite of a warehouse
LAYOUTS.complex = {
  name: 'complex', half: 44, sky: 0x8a97a6,
  env: { skyTop: '#2c3238', skyMid: '#4b545e', skyHor: '#6d7883', fog: 0x525c66, sun: 0xd8dee6, sunI: 0.3, hemiSky: 0x8b98a5, hemiGround: 0x2e3238, hemiI: 0.6, floor: 0x4c545e, low: 0x5d6a70, skirt: 0x33383e, floorStyle: 'tile', wall: 0x5a626c, wallTop: 0x6e7880, crate: 0x4a5560, crateAlt: 0x404a54, crateDk: 0x36404a, pallet: 0x6b5a42, container: 0x54636e, pole: 0x2e343a, shelf: 0x6a7884, sandbag: 0x7a8288 },
  build(add) {
    const H = 44, W = 6;
    add(0, -H, H + 1, 1, W); add(0, H, H + 1, 1, W); add(-H, 0, 1, H + 1, W); add(H, 0, 1, H + 1, W);
    // main E-W corridor at z=0 (walls with door gaps at x=±14, ±30)
    add(-22, -3, 8, 0.5, W); add(22, -3, 8, 0.5, W);
    add(-22, 3, 8, 0.5, W); add(22, 3, 8, 0.5, W);
    add(-30, 3, 4, 0.5, W); add(-30, -3, 4, 0.5, W);
    add(30, 3, 4, 0.5, W); add(30, -3, 4, 0.5, W);
    add(0, -3, 5, 0.5, W); add(0, 3, 5, 0.5, W);              // center double door
    // N rooms: big hall (x -12..12, z -12..-34) with pillar cover + two small rooms
    add(-12, -23, 0.5, 11, W); add(12, -23, 0.5, 11, W);      // hall side walls
    add(-6, -12, 6, 0.5, W); add(6, -12, 6, 0.5, W);          // hall south wall, gap center x -2..2
    add(0, -23, 1.5, 1.5, W);                                  // hall pillar
    add(-18, -28, 4, 0.5, W); add(-26, -22, 0.5, 5, W);       // NW room
    add(18, -28, 4, 0.5, W); add(26, -22, 0.5, 5, W);         // NE room
    add(-22, -36, 3, 3, 1.6); add(22, -36, 3, 3, 1.6);        // room crates
    // S rooms: mirrored
    add(-12, 23, 0.5, 11, W); add(12, 23, 0.5, 11, W);
    add(-6, 12, 6, 0.5, W); add(6, 12, 6, 0.5, W);
    add(0, 23, 1.5, 1.5, W);
    add(-18, 28, 4, 0.5, W); add(-26, 22, 0.5, 5, W);
    add(18, 28, 4, 0.5, W); add(26, 22, 0.5, 5, W);
    add(-22, 36, 3, 3, 1.6); add(22, 36, 3, 3, 1.6);
    // corners: stairwell nooks with cover
    add(-36, -36, 2, 2, 2.2); add(-36, 36, 2, 2, 2.2); add(36, -36, 2, 2, 2.2); add(36, 36, 2, 2, 2.2);
    add(-38, 0, 2, 1, 1.1); add(38, 0, 2, 1, 1.1);
    for (const [bx, bz] of [[-34, -14], [34, -14], [-34, 14], [34, 14], [-8, -18], [8, 18]])
      add(bx, bz, 0.42, 0.42, 1.15, 0, 'barrel');
    add(-10, 0, 1.2, 0.5, 1.1); add(10, 0, 1.2, 0.5, 1.1);     // corridor cover
    add(0, -18, 2, 0.5, 0.62, 0, 'sandbag'); add(0, 18, 2, 0.5, 0.62, 0, 'sandbag');
    // interior dressing: shelving racks, pallets, bins
    add(-7, -28, 3.5, 0.7, 2.2, 0, 'shelf'); add(7, -28, 3.5, 0.7, 2.2, 0, 'shelf');
    add(-7, 28, 3.5, 0.7, 2.2, 0, 'shelf'); add(7, 28, 3.5, 0.7, 2.2, 0, 'shelf');
    add(-8, -16, 1.2, 1.2, 0.35, 0, 'pallet'); add(8, 16, 1.2, 1.2, 0.35, 0, 'pallet');
    add(-4, 10, 1.2, 1.2, 0.35, 0, 'pallet'); add(4, -10, 1.2, 1.2, 0.35, 0, 'pallet');
    add(-32, -6, 2.4, 1.1, 1.3, 0, 'dumpster'); add(32, 6, 2.4, 1.1, 1.3, 0, 'dumpster');
  },
  sites: { A: { x: 0, z: -23, r: 6.5 }, B: { x: 0, z: 23, r: 6.5 } },
  spawns: { T: { x: -38, z: 0 }, CT: { x: 38, z: 0 }, yawT: -Math.PI / 2, yawCT: Math.PI / 2 },
  nodes: [
    { x: -38, z: 0 },   // 0 T spawn
    { x: -30, z: 0 },   // 1 W corridor door
    { x: -14, z: 0 },   // 2
    { x: 0, z: 0 },     // 3 center door
    { x: 14, z: 0 },    // 4
    { x: 30, z: 0 },    // 5 E door
    { x: 38, z: 0 },    // 6 CT spawn
    { x: 0, z: -8 },    // 7 hall S entrance
    { x: 0, z: -23 },   // 8 A site hall
    { x: 0, z: -34 },   // 9 hall N
    { x: -22, z: -28 }, // 10 NW room
    { x: 22, z: -28 },  // 11 NE room
    { x: 0, z: 8 },     // 12 S hall entrance
    { x: 0, z: 23 },    // 13 B site
    { x: 0, z: 34 },    // 14 S hall N-end
    { x: -22, z: 28 },  // 15 SW room
    { x: 22, z: 28 },   // 16 SE room
    { x: -34, z: -14 }, // 17 NW connector
    { x: 34, z: -14 },  // 18 NE connector
    { x: -34, z: 14 },  // 19 SW connector
    { x: 34, z: 14 },   // 20 SE connector
  ],
  edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [2, 7], [7, 8], [8, 9], [9, 10], [9, 11],
    [10, 17], [17, 1], [11, 18], [18, 5], [1, 17], [5, 18], [2, 19], [19, 12], [12, 13], [13, 14],
    [14, 15], [14, 16], [15, 19], [16, 20], [20, 5], [4, 20], [12, 4]],
},

// warehouse district: interior site + yard site (industrial)
LAYOUTS.compound = {
  name: 'compound', half: 48, sky: 0x9aa8b0,
  env: { skyTop: '#5f5c6e', skyMid: '#a89a92', skyHor: '#d8bd96', fog: 0xb5a896, sun: 0xffd9a0, sunI: 0.5, hemiSky: 0xd8cfc0, hemiGround: 0x4e463c, hemiI: 0.78, floor: 0x6d6a60, low: 0x7d7668, skirt: 0x45423a, floorStyle: 'seams', wall: 0x7d8288, wallTop: 0x94999e, crate: 0x8a6f4d, crateAlt: 0x79634a, crateDk: 0x64523c, pallet: 0x7a6850, container: 0x8a4a3a, dumpster: 0x3f5a6b, pole: 0x4a423a, shelf: 0x707a82, sandbag: 0x9a9074 },
  build(add) {
    const H = 48, W = 5;
    add(0, -H, H + 1, 1, W); add(0, H, H + 1, 1, W); add(-H, 0, 1, H + 1, W); add(H, 0, 1, H + 1, W);
    // warehouse shell (x -20..20, z -16..16) with door gaps
    add(-12, -16, 8, 0.5, W); add(12, -16, 8, 0.5, W);          // north wall, gap x -4..4
    add(-6, 16, 14, 0.5, W); add(16, 16, 4, 0.5, W);            // south wall, gap x 8..12
    add(20, -10, 0.5, 6, W); add(20, 10, 0.5, 6, W);            // east wall, gap z -4..4
    add(-20, -10, 0.5, 6, W); add(-20, 10, 0.5, 6, W);          // west wall, gap z -4..4
    // interior
    add(0, 0, 2, 2, 2); add(-8, -6, 1.5, 1.5, 1.1); add(8, 6, 1.5, 1.5, 1.1);
    add(10, -8, 2, 2, 1.6); add(-10, 8, 2, 2, 1.6);
    add(0, -10, 0.42, 0.42, 1.15, 0, 'barrel'); add(-4, 10, 0.42, 0.42, 1.15, 0, 'barrel');
    // yard cover
    add(-30, 0, 3, 1, 2.2); add(30, 0, 3, 1, 2.2);
    add(0, 26, 6, 1, 2); add(0, -26, 6, 1, 2);
    add(-34, 22, 1.5, 1.5, 1.1); add(34, -22, 1.5, 1.5, 1.1);
    // B site yard SE
    add(30, 30, 2, 2, 2.2); add(38, 36, 2, 2, 1.1); add(36, 26, 0.42, 0.42, 1.15, 0, 'barrel');
    add(30, 38, 2, 0.5, 0.62, 0, 'sandbag');
    for (const [bx, bz] of [[-36, -30], [36, 12], [-14, 30], [14, -30]]) add(bx, bz, 0.42, 0.42, 1.15, 0, 'barrel');
    add(10, 26, 3, 0.5, 0.62, 0, 'sandbag'); add(-10, -26, 3, 0.5, 0.62, 0, 'sandbag');
    // industrial dressing: containers, pallets, dumpsters
    add(-34, -14, 3, 1.2, 2.6, 0, 'container'); add(42, 20, 1.2, 3, 2.6, 0, 'container');
    add(-12, 26, 1.2, 1.2, 0.35, 0, 'pallet'); add(12, -26, 1.2, 1.2, 0.35, 0, 'pallet');
    add(-40, 40, 2.4, 1.1, 1.3, 0, 'dumpster'); add(40, -40, 2.4, 1.1, 1.3, 0, 'dumpster');
  },
  sites: { A: { x: 0, z: 0, r: 6 }, B: { x: 34, z: 33, r: 6 } },
  spawns: { T: { x: 0, z: 40 }, CT: { x: 0, z: -40 }, yawT: Math.PI, yawCT: 0 },
  nodes: [
    { x: 0, z: 40 },    // 0 T spawn
    { x: 10, z: 20 },   // 1 S door approach
    { x: 8, z: 8 },     // 2 inside S
    { x: 0, z: 0 },     // 3 center (A site)
    { x: -8, z: -8 },   // 4 inside N
    { x: -10, z: -20 }, // 5 N door approach
    { x: 0, z: -40 },   // 6 CT spawn
    { x: -30, z: 0 },   // 7 west yard
    { x: -24, z: 0 },   // 8 W gap
    { x: 30, z: 0 },    // 9 east yard
    { x: 24, z: 0 },    // 10 E gap
    { x: 20, z: 30 },   // 11 B approach
    { x: 34, z: 33 },   // 12 B site
    { x: 30, z: -20 },  // 13 CT east yard
  ],
  edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [0, 11], [11, 12], [6, 13], [13, 12],
    [0, 13], [13, 9], [9, 10], [10, 2], [7, 8], [8, 3], [9, 12], [1, 11], [6, 5]],
};

export const MAP_NAMES = Object.keys(LAYOUTS);
export const DEFAULT_MAP = 'arena';

export function createMap(mapName = DEFAULT_MAP, seed = 1337) {
  const L = LAYOUTS[mapName] || LAYOUTS[DEFAULT_MAP];
  const half = L.half;
  const colliders = [];
  const add = (x, z, hx, hz, y1, y0 = 0, kind = null) => colliders.push({ x, z, hx, hz, y0, y1, kind });

  L.build(add, mulberry32(seed));

  // seeded scatter crates kept clear of waypoints/spawns/sites
  const rng = mulberry32(seed);
  const siteR = Math.max(L.sites.A.r, L.sites.B.r);
  let placed = 0, guard = 0;
  while (placed < 10 && guard++ < 400) {
    const x = (rng() * 2 - 1) * (half - 4);
    const z = (rng() * 2 - 1) * (half - 4);
    if (Math.hypot(x - L.spawns.T.x, z - L.spawns.T.z) < 7) continue;
    if (Math.hypot(x - L.spawns.CT.x, z - L.spawns.CT.z) < 7) continue;
    if (Math.hypot(x - L.sites.A.x, z - L.sites.A.z) < siteR + 2) continue;
    if (Math.hypot(x - L.sites.B.x, z - L.sites.B.z) < siteR + 2) continue;
    if (colliders.some(c => Math.abs(x - c.x) < c.hx + 1.6 && Math.abs(z - c.z) < c.hz + 1.6)) continue;
    if (L.nodes.some(n => Math.abs(x - n.x) < 2.2 && Math.abs(z - n.z) < 2.2)) continue;
    add(x, z, 1, 1, 2);
    placed++;
  }

  const nodes = L.nodes, adj = nodes.map(() => []);
  for (const [a, b] of L.edges) { adj[a].push(b); adj[b].push(a); }

  function nearestNode(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function pathBetween(a, b) {
    const s = nearestNode(nodes[a].x, nodes[a].z);
    const t = nearestNode(nodes[b].x, nodes[b].z);
    if (s === t) return [t];
    const prev = new Int8Array(nodes.length).fill(-1);
    const q = [s]; prev[s] = s;
    while (q.length) {
      const cur = q.shift();
      if (cur === t) break;
      for (const n of adj[cur]) if (prev[n] === -1) { prev[n] = cur; q.push(n); }
    }
    if (prev[t] === -1) return [t];
    const out = [t]; let c = t;
    while (c !== s) { c = prev[c]; out.push(c); }
    return out.reverse();
  }

  // spatial grid
  const GRID_DIM = Math.ceil((half * 2) / GRID_CELL);
  const grid = new Array(GRID_DIM * GRID_DIM);
  const cellOf = (v) => Math.max(0, Math.min(GRID_DIM - 1, Math.floor((v + half) / GRID_CELL)));
  colliders.forEach((c, idx) => {
    const x0 = cellOf(c.x - c.hx - MAX_RADIUS), x1 = cellOf(c.x + c.hx + MAX_RADIUS);
    const z0 = cellOf(c.z - c.hz - MAX_RADIUS), z1 = cellOf(c.z + c.hz + MAX_RADIUS);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const k = gz * GRID_DIM + gx;
      (grid[k] || (grid[k] = [])).push(idx);
    }
  });
  const scratch = []; let stampId = 0;
  const stamps = new Array(colliders.length).fill(-1);
  function collidersNear(x, z) {
    scratch.length = 0; stampId++;
    const gx = cellOf(x), gz = cellOf(z);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const cx = gx + dx, cz = gz + dz;
      if (cx < 0 || cz < 0 || cx >= GRID_DIM || cz >= GRID_DIM) continue;
      const cell = grid[cz * GRID_DIM + cx];
      if (!cell) continue;
      for (const idx of cell) if (stamps[idx] !== stampId) { stamps[idx] = stampId; scratch.push(colliders[idx]); }
    }
    return scratch;
  }

  function resolveCircle(x, z, r, feetY = 0, topY = 1.8) {
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      const near = collidersNear(x, z);
      for (const c of near) {
        if (c.y0 >= topY || c.y1 <= feetY + 0.2) continue;
        const nx = Math.max(c.x - c.hx, Math.min(x, c.x + c.hx));
        const nz = Math.max(c.z - c.hz, Math.min(z, c.z + c.hz));
        let dx = x - nx, dz = z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2), push = (r - d) / d;
          x += dx * push; z += dz * push;
        } else {
          const px = (c.hx + r) - Math.abs(x - c.x);
          const pz = (c.hz + r) - Math.abs(z - c.z);
          if (px < pz) x += (x >= c.x ? px : -px);
          else z += (z >= c.z ? pz : -pz);
        }
        moved = true;
      }
      if (!moved) break;
    }
    return { x, z };
  }

  // slab test vs one collider; returns entry t or null
  function slab(c, x1, y1, z1, dx, dy, dz, maxT) {
    let tmin = 0, tmax = maxT;
    const axes = [
      [x1, dx, c.x - c.hx, c.x + c.hx],
      [y1, dy, c.y0, c.y1],
      [z1, dz, c.z - c.hz, c.z + c.hz],
    ];
    for (const [o, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; }
      else {
        let t1 = (lo - o) / d, t2 = (hi - o) / d;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return null;
      }
    }
    return tmin;
  }

  function segBlocked(x1, y1, z1, x2, y2, z2) {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const maxT = 1;
    for (const c of colliders) if (slab(c, x1, y1, z1, dx, dy, dz, maxT) != null) return true;
    return false;
  }

  // nearest wall hit along a ray; returns distance or null
  function rayHitDist(x1, y1, z1, dx, dy, dz, maxT) {
    let best = null;
    for (const c of colliders) {
      const t = slab(c, x1, y1, z1, dx, dy, dz, maxT);
      if (t != null && t > 0.02 && (best == null || t < best)) best = t;
    }
    return best;
  }

  const losClear = (x1, y1, z1, x2, y2, z2) => !segBlocked(x1, y1, z1, x2, y2, z2);

  // spawn points: ring candidates around the layout spawn, VALIDATED against collision
  // (fixes spawning inside walls on the bigger maps) — up to 20 per team
  function makeSpawns(base, yaw) {
    const out = [];
    const cand = [[0, 0]];
    for (let r = 2; r <= 16; r += 2) {
      const n = Math.max(6, Math.round((2 * Math.PI * r) / 2.2));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r * 0.7;
        cand.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
    }
    for (const [dx, dz] of cand) {
      if (out.length >= 20) break;
      const wx = base.x + dx, wz = base.z + dz;
      if (Math.abs(wx) > half - 1.2 || Math.abs(wz) > half - 1.2) continue;
      const res = resolveCircle(wx, wz, 0.45, 0, 1.7);
      // if the solver had to push far, the point was buried in a wall — skip it
      if (Math.hypot(res.x - wx, res.z - wz) > 0.35) continue;
      let inside = false;
      for (const c of colliders) {
        if (c.kind === 'beam') continue;
        if (c.y1 > 1.2 && Math.abs(res.x - c.x) < c.hx + 0.44 && Math.abs(res.z - c.z) < c.hz + 0.44) { inside = true; break; }
      }
      if (inside) continue;
      if (out.some(s => Math.hypot(s.x - res.x, s.z - res.z) < 1.6)) continue;
      out.push({ x: +res.x.toFixed(2), z: +res.z.toFixed(2), yaw });
    }
    // guaranteed fallback: the raw layout spawn pushed out of geometry
    if (out.length === 0) {
      const res = resolveCircle(base.x, base.z, 0.45, 0, 1.7);
      out.push({ x: +res.x.toFixed(2), z: +res.z.toFixed(2), yaw });
    }
    return out;
  }
  const spawnsT = makeSpawns(L.spawns.T, L.spawns.yawT);
  const spawnsCT = makeSpawns(L.spawns.CT, L.spawns.yawCT);

  return {
    name: L.name, half, sky: L.sky, env: L.env || null, colliders, spawnsT, spawnsCT,
    siteA: L.sites.A, siteB: L.sites.B,
    nodes, adj, nearestNode, pathBetween,
    collidersNear, resolveCircle, losClear, rayHitDist,
    inSite(x, z) {
      if (Math.hypot(x - L.sites.A.x, z - L.sites.A.z) < L.sites.A.r) return 'A';
      if (Math.hypot(x - L.sites.B.x, z - L.sites.B.z) < L.sites.B.r) return 'B';
      return null;
    },
  };
}
