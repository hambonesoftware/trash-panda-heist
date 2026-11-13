// Meshes for the alley maze: the tenement wall, fire escapes, ladders, clotheslines and raidable trash cans.
import * as THREE from 'three';
import { M, RB, SP, CY, CO, ell, put, toon, glowMat } from './gfx.js';
import { ammoMesh } from './characters.js';
import { rand, rng } from './util.js';
import { ROPE_UP } from './config.js';
import { ropeSag } from './maze.js';

const IRON = 0x2a2838, IRON2 = 0x3d3b52;

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// One apartment block per meal, so every level climbs a different building: its own wall material,
// window shape and spacing, and trim colours.
export const APARTMENTS = [
  { name: 'Brownstone',  wall: 'brick', hue: [232, 262], sat: [16, 26], lum: [30, 38], mortar: '#2f2a44', win: 'square', step: 165,
    trim: 0x241c34, sill: 0x4a4160, cornice: 0x3a3350, base: 0x565a74 },
  { name: 'Rowhouse',    wall: 'brick', hue: [6, 22], sat: [42, 56], lum: [36, 46], mortar: '#6a4a3c', win: 'arched', step: 165, band: 0xe9dcc0,
    trim: 0xf2ead8, sill: 0xe9dcc0, cornice: 0xe9dcc0, base: 0x8a6a5a, shutter: 0x2f7a7a },
  { name: 'Modern block', wall: 'panel', win: 'ribbon', step: 220, band: 0x5fae7a, fins: 0x5fae7a,
    trim: 0x39424f, sill: 0xcfd6dd, cornice: 0x39424f, base: 0x6a727c },
  { name: 'Stone walk-up', wall: 'stone', win: 'tall', step: 165,
    trim: 0x5a4636, sill: 0xb9a384, cornice: 0x6a5240, base: 0x7a6a58 },
];

function wallTexture(S) {
  return canvasTex(2048, 880, (g, w, h) => {
    if (S.wall === 'brick') {
      g.fillStyle = S.mortar; g.fillRect(0, 0, w, h);
      const bw = 52, bh = 22;
      for (let r = 0; r * bh < h; r++) for (let c = -1; c * bw < w + bw; c++) {
        const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * bh;
        g.fillStyle = `hsl(${rand(S.hue[0], S.hue[1])}, ${rand(S.sat[0], S.sat[1])}%, ${rand(S.lum[0], S.lum[1])}%)`;
        g.fillRect(x + 2, y + 2, bw - 3, bh - 3);
        g.fillStyle = 'rgba(210,220,255,0.07)'; g.fillRect(x + 2, y + 2, bw - 3, 3);
      }
    } else if (S.wall === 'panel') {
      g.fillStyle = '#9aa3ab'; g.fillRect(0, 0, w, h);
      for (let r = 0; r < 6; r++) for (let c = 0; c < 16; c++) {
        g.fillStyle = `hsl(205, ${rand(6, 12)}%, ${rand(70, 76)}%)`;
        g.fillRect(c * 128 + 3, r * 160 + 3, 122, 154);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(c * 128 + 3, r * 160 + 3, 122, 4);
      }
    } else {
      g.fillStyle = '#5a4a3a'; g.fillRect(0, 0, w, h);
      const bw = 112, bh = 46;
      for (let r = 0; r * bh < h; r++) for (let c = -1; c * bw < w + bw; c++) {
        const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * bh;
        g.fillStyle = `hsl(${rand(34, 44)}, ${rand(22, 34)}%, ${rand(52, 62)}%)`;
        g.fillRect(x + 3, y + 3, bw - 5, bh - 5);
        g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + 3, y + 3, bw - 5, 4);
      }
    }
    const gr = g.createLinearGradient(0, h * 0.6, 0, h);
    gr.addColorStop(0, 'rgba(10,8,24,0)'); gr.addColorStop(1, 'rgba(10,8,24,0.5)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(10,8,24,0.14)'; g.fillRect(rand(0, w), rand(0, h * 0.4), rand(3, 9), rand(90, 380)); }
  });
}

// Window shapes. Each draws its frame and returns the opening: width, height, bottom edge (relative to the
// window's y) and mk(material), which builds the glass in local coordinates.
const plane = (w, h, mat, x = 0, y = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, 0); return m; };
const WINDOW = {
  square(group, S, x, y) {
    group.add(put(RB(84, 112, 12, S.trim, 2.2, 3), x, y, -72));
    group.add(put(RB(96, 8, 20, S.sill, 1.8, 2), x, y - 60, -64));
    return { pw: 70, ph: 98, bottom: -49, mk: mat => { const g = new THREE.Group(); g.add(plane(70, 98, mat)); return g; } };
  },
  arched(group, S, x, y) {
    group.add(put(RB(84, 80, 12, S.trim, 2.2, 3), x, y - 12, -72));
    const arch = CY(42, 42, 12, S.trim, 2.2, 28); arch.rotation.x = Math.PI / 2;
    group.add(put(arch, x, y + 28, -72));
    for (const s of [-1, 1]) group.add(put(RB(18, 104, 6, S.shutter, 1.6, 2), x + s * 56, y - 2, -68));
    group.add(put(RB(96, 8, 20, S.sill, 1.8, 2), x, y - 56, -64));
    return { pw: 70, ph: 100, bottom: -46, mk: mat => { const g = new THREE.Group(); g.add(plane(70, 68, mat, 0, -12)); const c = new THREE.Mesh(new THREE.CircleGeometry(35, 24), mat); c.position.set(0, 22, 0); g.add(c); return g; } };
  },
  ribbon(group, S, x, y) {
    group.add(put(RB(150, 84, 12, S.trim, 2.2, 3), x, y, -72));
    group.add(put(RB(160, 6, 18, S.sill, 1.6, 2), x, y - 46, -64));
    group.add(put(RB(6, 70, 3, S.trim, 1, 1), x, y, -64.4));
    return { pw: 136, ph: 70, bottom: -35, mk: mat => { const g = new THREE.Group(); g.add(plane(136, 70, mat)); return g; } };
  },
  tall(group, S, x, y) {
    group.add(put(RB(66, 132, 12, S.trim, 2.2, 3), x, y, -72));
    group.add(put(RB(90, 12, 18, S.sill, 1.8, 2), x, y + 72, -66));
    group.add(put(RB(84, 10, 20, S.sill, 1.8, 2), x, y - 68, -64));
    group.add(put(RB(52, 5, 3, S.trim, 1, 1), x, y + 10, -64.4));
    return { pw: 52, ph: 116, bottom: -58, mk: mat => { const g = new THREE.Group(); g.add(plane(52, 116, mat)); return g; } };
  },
};

function tenementWall(group, W, S) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1500, 800, 60), toon(0xffffff, { map: wallTexture(S), rim: 0.3 }));
  wall.position.set(-900, 400, -100);
  wall.receiveShadow = true;
  group.add(wall);
  group.add(put(RB(1530, 26, 84, S.cornice, 3, 4), -900, 806, -96));
  group.add(put(RB(1510, 18, 30, S.base, 2, 4), -900, 9, -62));
  // drainpipe at the corner
  group.add(put(CY(8, 8, 800, 0x565a74, 2, 14), -168, 400, -62));
  // building-specific trim
  if (S.band) for (const y of [268, 528]) group.add(put(RB(1500, 9, 10, S.band, 1.4, 2), -900, y, -69));
  if (S.fins) for (const x of [-1480, -1000, -520]) group.add(put(RB(12, 800, 14, S.fins, 1.6, 2), x, 400, -68));
  if (S.wall === 'stone') for (const x of [-1630, -170]) group.add(put(RB(26, 800, 30, S.sill, 1.6, 3), x, 400, -78));

  // windows: some lit, flickering TV glow in one
  const lit = canvasTex(96, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ffe2a0'); gr.addColorStop(1, '#ffad66');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(70,40,50,0.45)'; for (let y = 0; y < 50; y += 9) g.fillRect(0, y, w, 4);
    g.fillStyle = '#2a1d2a'; g.fillRect(44, 0, 8, h); g.fillRect(0, 60, w, 7);
  });
  const litMat = new THREE.MeshBasicMaterial({ map: lit, color: new THREE.Color(1.4, 1.25, 1.1), toneMapped: false });
  W.tvMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.8, 1.4), toneMapped: false });
  const dark = toon(0x1e2244, { rim: 0 });
  W.windowMats = [litMat];
  W.roomMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.2, 0.85), toneMapped: false });
  W.windows = [];
  let n = 0;
  for (const y of [150, 410, 670]) for (let x = -1560; x <= -240; x += S.step) {
    if (Math.abs(x + 168) < 40) continue;
    const kind = (n++ * 7 + (y > 400 ? 3 : 0)) % 5;
    const e = WINDOW[S.win](group, S, x, y);
    const pane = e.mk(kind === 0 || kind === 3 ? litMat : kind === 1 ? W.tvMat : dark);
    pane.position.set(x, y, -65.5);
    group.add(pane);
    W.windows.push({ x, y, pane, ...e });
  }
}

function fireEscape(scene, f, tint) {
  const w = f.x1 - f.x0, cx = (f.x0 + f.x1) / 2;
  const grate = canvasTex(256, 64, (g, cw, ch) => {
    g.fillStyle = '#34324a'; g.fillRect(0, 0, cw, ch);
    g.fillStyle = '#1b1a2b';
    for (let x = 4; x < cw; x += 16) g.fillRect(x, 6, 9, ch - 12);
    g.fillStyle = 'rgba(190,200,255,0.12)'; g.fillRect(0, 0, cw, 3);
  }, [w / 120, 1]);
  const slab = M(new THREE.BoxGeometry(w, 12, 112), toon(tint, { map: grate, rim: 0.5 }), 2.4);
  slab.receiveShadow = true;
  scene.add(put(slab, cx, f.h - 6, -8));
  scene.add(put(RB(w + 8, 7, 7, IRON2, 1.8, 2), cx, f.h - 3, 49));
  // back rail against the wall, and brackets underneath
  scene.add(put(RB(w, 5, 5, IRON, 1.6, 2), cx, f.h + 96, -60));
  scene.add(put(RB(w, 4, 4, IRON, 1.4, 2), cx, f.h + 52, -60));
  for (let x = f.x0 + 6; x <= f.x1 - 4; x += 46) scene.add(put(RB(4, 100, 4, IRON, 1.4, 1), x, f.h + 48, -60));
  for (let x = f.x0 + 40; x <= f.x1 - 30; x += 150) {
    const strut = RB(6, 96, 6, IRON, 1.6, 2);
    strut.rotation.x = 0.82;
    scene.add(put(strut, x, f.h - 44, -32));
  }
  // end posts double as clothesline anchors
  for (const x of [f.x0 + 3, f.x1 - 3]) scene.add(put(RB(7, ROPE_UP + 16, 7, IRON2, 1.8, 2), x, f.h + (ROPE_UP + 16) / 2, 40));
}

function ladder(scene, l) {
  const top = l.h1 + 104, len = top - l.h0;
  for (const sx of [-17, 17]) scene.add(put(RB(6, len, 6, IRON2, 1.8, 2), l.x + sx, l.h0 + len / 2, -44));
  for (let y = l.h0 + 20; y < top - 6; y += 26) scene.add(put(RB(36, 4.5, 4.5, 0x565a74, 1.4, 2), l.x, y, -44));
}

function clothesline(scene, r) {
  const y0 = r.h + ROPE_UP, pts = [];
  for (let i = 0; i <= 24; i++) { const x = r.x0 + ((r.x1 - r.x0) * i) / 24; pts.push(new THREE.Vector3(x, y0 - ropeSag(r, x), 40)); }
  const line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 1.7, 6), toon(0xe9e2cf, { rim: 0.3 }));
  scene.add(line);
  // laundry near the two ends, clear of the middle where the raccoon swings
  const cols = [0xe86a5c, 0x6fb7e8, 0xf2c14e, 0xf4f1e8, 0x9d7be0];
  const wash = [];
  for (const t of [0.1, 0.2, 0.8, 0.9]) {
    const x = r.x0 + (r.x1 - r.x0) * t, y = y0 - ropeSag(r, x);
    const sock = rng() < 0.4;
    const m = RB(sock ? 10 : 34, sock ? 30 : 40, 2.5, cols[Math.floor(rng() * cols.length)], 1.5, 1);
    const piv = new THREE.Group();
    piv.position.set(x, y, 34);
    piv.add(put(m, 0, -(sock ? 16 : 21), 0));
    piv.userData.ph = rand(0, 6);
    scene.add(piv);
    wash.push(piv);
  }
  return wash;
}

// A raidable trash can. Full cans have the lid cocked with trash poking out; empty ones are shut.
function trashCan(scene, c, floor) {
  const g = new THREE.Group();
  const prof = [[0, 0], [27, 0], [28.5, 3], [29, 20], [30.5, 22], [29.4, 24.5], [30, 44], [31.5, 46], [30.4, 48.5], [31, 70], [33, 72.5], [33, 76], [0, 76]];
  g.add(M(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 28), toon(0x8d98b0, { rim: 0.6 }), 2.4));
  const lid = new THREE.Group();
  const lidProf = [[0, 0], [36, 0], [36, 4], [33, 6.5], [24, 10], [12, 12], [0, 12.5]];
  lid.add(M(new THREE.LatheGeometry(lidProf.map(([x, y]) => new THREE.Vector2(x, y)), 28), toon(0xa2acc2, { rim: 0.4 }), 2.4));
  lid.add(put(M(new THREE.TorusGeometry(7, 2, 8, 14, Math.PI), 0x7f8aa2, 1.4), 0, 12, 0));
  lid.position.set(0, 76, 0);
  g.add(lid);
  const peek = new THREE.Group();
  peek.position.set(0, 80, 0);
  g.add(peek);
  // eyes that show when the raccoon is hiding inside
  const eyes = new THREE.Group();
  const eyeMat = glowMat(0xfff6c8, 2.2);
  for (const sx of [-8, 8]) eyes.add(put(new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), eyeMat), sx, 0, 0));
  eyes.position.set(0, 81, 27);
  eyes.visible = false;
  g.add(eyes);
  g.position.set(c.x, floor.h, -14);
  scene.add(g);

  const can = { x: c.x, floor, loot: [], full: c.loot.slice(), refill: 0, group: g, lid, eyes, shake: 0, hideAmt: 0 };
  can.show = () => {
    while (peek.children.length) peek.remove(peek.children[0]);
    can.loot.slice(0, 2).forEach((type, i) => {
      const m = ammoMesh(type);
      m.scale.setScalar(0.62);
      m.position.set(i ? 9 : -7, i ? 2 : 6, i ? -4 : 5);
      m.rotation.z = i ? -0.5 : 0.4;
      peek.add(m);
    });
  };
  can.update = (dt, t) => {
    can.shake = Math.max(0, can.shake - dt * 3);
    const open = can.loot.length ? 0.5 : 0, hide = can.hideAmt;
    const want = Math.max(open, hide * 0.22) + Math.sin(t * 30) * can.shake * 0.25;
    lid.rotation.z += (want - lid.rotation.z) * Math.min(1, dt * 12);
    lid.position.set(-lid.rotation.z * 26, 76 + lid.rotation.z * 16 + hide * 7, 0);
    g.rotation.z = Math.sin(t * 34) * can.shake * 0.05;
    eyes.visible = hide > 0.6;
  };
  can.show();
  return can;
}

// A neighbour who pops their head out of a window now and then to drop a bit of trash in the can below.
// Friendly: they never throw anything at the raccoon.
const SKINS = [0xf2c9a5, 0xc98e63, 0x8a5a3c, 0xe8b894];
const LOOKS = [
  { shirt: 0xd97aa0, hair: 0x3a2e40, kind: 'curlers' },
  { shirt: 0x6aa6d9, hair: 0x6b4a2f, kind: 'cap' },
  { shirt: 0xe9c25a, hair: 0xd8d2c8, kind: 'glasses' },
  { shirt: 0x7ac08a, hair: 0x2a2230, kind: 'bandana' },
];
let residentCount = 0;
function buildResident(def, floor, W, group) {
  const look = LOOKS[residentCount % LOOKS.length], skin = SKINS[residentCount % SKINS.length];
  residentCount++;
  const wy = floor.h + 150;
  let win = null;
  for (const w of W.windows) if (w.y === wy && !(wy === 410 && Math.abs(w.x + 1420) < 80) && (!win || Math.abs(w.x - def.x) < Math.abs(win.x - def.x))) win = w;
  const room = win.mk(W.roomMat);
  room.position.set(win.x, wy, -65.2);
  room.visible = false;
  group.add(room);

  const fig = new THREE.Group();
  const s = Math.min(1, win.ph / 96);
  fig.position.set(win.x, wy + win.bottom, -58);
  fig.visible = false;
  fig.add(put(RB(56, 40, 26, look.shirt, 1.8, 10), 0, 20, 0));
  fig.add(put(CY(7, 8, 10, skin, 1.8, 12), 0, 43, 0));
  const head = new THREE.Group();
  head.position.set(0, 60, 0);
  fig.add(head);
  head.add(ell(19, 1, 1.08, 0.95, skin, 1.8));
  head.add(put(ell(20, 1, 0.85, 1, look.hair, 1.6), 0, 5, -3));
  head.add(put(ell(3.5, 1, 1, 1.2, 0xe9977a, 1.4), 0, -3, 18));
  head.add(put(RB(8, 2, 2, 0x7a2a2a, 0, 1), 0, -9, 17.5));
  for (const sx of [-1, 1]) {
    head.add(put(SP(2.4, 0x15121b, 0), sx * 7, 2, 17));
    head.add(put(RB(7, 2, 2, look.hair, 0, 1), sx * 7, 8, 17));
    head.add(put(ell(3.4, 1.2, 0.7, 0.5, 0xf08a8a, 0), sx * 12, -4, 15));
  }
  if (look.kind === 'curlers') for (const x of [-9, 0, 9]) { const c = CY(4, 4, 13, 0xf08aa8, 1.2, 10); c.rotation.z = Math.PI / 2; head.add(put(c, x, 19, 2)); }
  if (look.kind === 'glasses') for (const sx of [-1, 1]) head.add(put(M(new THREE.TorusGeometry(5.5, 1, 6, 16), 0x2a2a2a, 1), sx * 7.5, 2, 18.5));
  if (look.kind === 'cap') { head.add(put(ell(20, 1, 0.6, 1, 0xd9473a, 1.6), 0, 11, 0)); head.add(put(RB(24, 3, 16, 0xd9473a, 1, 1), 0, 9, 17)); }
  if (look.kind === 'bandana') head.add(put(CY(19.6, 19.6, 7, 0xe8503a, 1.4, 18), 0, 10, 0));

  const arms = [];
  for (const sx of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(sx * 28, 34, 6);
    a.add(put(CY(6.5, 6, 30, look.shirt, 1.6, 10), 0, -15, 0));
    a.add(put(SP(6.5, skin, 1.6), 0, -33, 0));
    a.rotation.x = -1.15; a.rotation.z = sx * 0.08;
    fig.add(a);
    arms.push(a);
  }
  const held = new THREE.Group();
  held.position.set(0, -38, 4);
  arms[1].add(held);
  group.add(fig);

  const r = {
    def, floor, state: 'idle', timer: 0, x: win.x, winY: wy, outer: fig, head, arm: arms[1], held, bag: null, win, room,
    // 0 = ducked inside, 1 = fully out (a little overshoot reads as popping up)
    pop(k) {
      const e = k < 1 ? 1 - Math.pow(1 - k, 3) : 1;
      fig.scale.setScalar(Math.max(0.001, s * (e + 0.12 * Math.sin(Math.min(1, k) * Math.PI))));
    },
    hold(obj) {
      if (r.bag) { held.remove(r.bag); r.bag = null; }
      if (obj) { obj.scale.setScalar(0.5); held.add(obj); r.bag = obj; }
    },
    setOut(on) { fig.visible = on; room.visible = on; win.pane.visible = !on; },
  };
  return r;
}

export function buildMaze(scene, nav, mazeCfg, style = 0) {
  const group = new THREE.Group();
  const W = { cans: [], wash: [], lamps: [], residents: [], group };
  tenementWall(group, W, APARTMENTS[style]);
  const tints = { A: 0xd0d6ee, B: 0xe8d6c4, C: 0xd0d6ee, D: 0xe8d6c4 };
  for (const f of nav.floors) if (f.id !== 'g') fireEscape(group, f, tints[f.id] || 0xffffff);
  for (const l of nav.ladders) ladder(group, l);
  for (const r of nav.ropes) W.wash.push(...clothesline(group, r));
  for (const c of mazeCfg.cans) W.cans.push(trashCan(group, c, nav.byId[c.floor]));

  // Two warm wall lamps so the maze reads at night.
  for (const x of [-1240, -520]) {
    group.add(put(RB(10, 10, 46, IRON, 1.6, 2), x, 236, -52));
    group.add(put(CO(22, 18, IRON, 1.8, 16), x, 226, -30));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(8, 12, 10), glowMat(0xffd9a0, 2.6));
    group.add(put(bulb, x, 216, -30));
    const light = new THREE.PointLight(0xffc88a, 420, 1000, 1);
    light.position.set(x, 210, 60);
    group.add(light);
    W.lamps.push({ light, bulb });
  }

  // props: a few flower boxes and an AC unit give the floors some life
  for (const [x, h] of [[-1400, 260], [-640, 260], [-1000, 520], [-460, 520]]) {
    group.add(put(RB(70, 16, 20, 0x7a4b34, 1.8, 3), x, h + 104, -62));
    for (let i = -1; i <= 1; i++) group.add(put(ell(11, 1, 0.9, 1, i ? 0x4f9a5c : 0xe86a8c, 1.5), x + i * 20, h + 118, -62));
  }
  group.add(put(RB(90, 60, 44, 0x8f96ac, 2.2, 6), -1420, 430, -50));

  for (const def of mazeCfg.residents || []) {
    W.residents.push(buildResident(def, nav.byId[def.floor], W, group));
  }

  scene.add(group);
  W.update = (dt, t) => {
    for (const p of W.wash) p.rotation.z = Math.sin(t * 1.7 + p.userData.ph) * 0.12;
    for (const c of W.cans) c.update(dt, t);
    const f = 0.75 + 0.25 * Math.sin(t * 9) * Math.sin(t * 2.3);
    W.tvMat.color.setRGB(0.4 * f, 0.7 * f, 1.3 * f);
  };
  return W;
}

// A ripped-open trash bag: a slick that sends a guard sprawling.
export function slickMesh() {
  const g = new THREE.Group();
  const pud = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x1b2a22, transparent: true, opacity: 0.85 }));
  pud.rotation.x = -Math.PI / 2;
  pud.scale.set(40, 22, 1);
  pud.position.y = 1.2;
  g.add(pud);
  g.add(put(ell(13, 1.2, 0.5, 1, 0x3f4558, 1.6), -6, 6, 4));
  g.add(put(ell(6, 1.6, 0.5, 1, 0xf2c14e, 1.2), 14, 4, -6));
  g.add(put(ell(5, 1, 0.5, 1.4, 0x9fe36b, 1.2), -20, 3.5, -8));
  return g;
}

// The sack on the raccoon's back grows with what he is carrying.
export function sackMesh() {
  const g = new THREE.Group();
  const bag = ell(15, 1, 1.15, 0.95, 0xb89a62, 2);
  g.add(bag);
  g.add(put(CO(6, 10, 0xb89a62, 1.6, 10), 0, 19, 0));
  g.add(put(M(new THREE.TorusGeometry(5, 1.5, 6, 12), 0x6b3f25, 1.2), 0, 15, 0));
  g.visible = false;
  return g;
}
