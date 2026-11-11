// Movement rules for the alley maze: floors, ladders and clotheslines.
// Pure logic (no three.js), shared by the raccoon, the guards, the autoplayer and the Node checks.
import { MAZE } from './config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function buildNav(maze = MAZE) {
  const floors = maze.floors.map(f => ({ ...f }));
  const byId = Object.fromEntries(floors.map(f => [f.id, f]));
  const floorAt = (x, h) => floors.find(f => Math.abs(f.h - h) < 2 && x >= f.x0 - 0.01 && x <= f.x1 + 0.01) || null;
  const floorBelow = (x, h) => {
    let best = null;
    for (const f of floors) if (f.h <= h + 1 && x >= f.x0 && x <= f.x1 && (!best || f.h > best.h)) best = f;
    return best;
  };
  const ladders = maze.ladders.map((l, i) => ({ ...l, i, bottom: floorAt(l.x, l.h0), top: floorAt(l.x, l.h1) }));
  const ropes = maze.ropes.map(r => ({ ...r }));
  return { floors, byId, ladders, ropes, floorAt, floorBelow };
}

// How far the clothesline sags below its ends at x.
export function ropeSag(r, x) {
  const t = clamp((x - r.x0) / (r.x1 - r.x0), 0, 1);
  return 56 * t * (1 - t);
}

export function newAgent(nav, x, floorId) {
  const floor = nav.byId[floorId];
  return { x, h: floor.h, mode: 'floor', floor, ladder: null, rope: null, vy: 0, face: 1, moving: false, climb: 0, blocked: false };
}

// One step of movement. inp: { mx: -1..1, my: -1..1 (up is +1) }.
// o: { run, climb, rope, grav, xMin, xMax, canRope, canFall }
export function stepAgent(nav, a, inp, dt, o) {
  a.moving = false; a.climb = 0; a.blocked = false;
  const mx = inp.mx || 0, my = inp.my || 0;

  if (a.mode === 'floor') {
    const f = a.floor;
    if (my) {
      const L = nav.ladders.find(l => Math.abs(l.x - a.x) < 18 && (my > 0 ? l.bottom === f : l.top === f));
      if (L) { a.mode = 'ladder'; a.ladder = L; a.x = L.x; a.h = f.h; a.floor = null; return; }
    }
    if (mx) {
      a.face = mx > 0 ? 1 : -1;
      const nx = clamp(a.x + mx * o.run * dt, o.xMin, o.xMax);
      a.moving = Math.abs(nx - a.x) > 1e-6;
      a.x = nx;
      if (nx < f.x0 || nx > f.x1) {
        const next = nav.floors.find(g => g !== f && Math.abs(g.h - f.h) < 2 && nx >= g.x0 && nx <= g.x1);
        const rope = !next && o.canRope && nav.ropes.find(r => Math.abs(r.h - f.h) < 2 && nx >= r.x0 && nx <= r.x1);
        if (next) a.floor = next;
        else if (rope) { a.mode = 'rope'; a.rope = rope; a.floor = null; }
        else if (o.canFall) { a.mode = 'fall'; a.vy = 0; a.floor = null; }
        else { a.x = clamp(nx, f.x0, f.x1); a.moving = false; a.blocked = true; }
      }
    }
    return;
  }

  if (a.mode === 'ladder') {
    const L = a.ladder;
    const onto = floor => { a.mode = 'floor'; a.floor = floor; a.h = floor.h; a.ladder = null; };
    if (my) {
      a.h += my * o.climb * dt; a.climb = my;
      if (a.h >= L.h1 && my > 0) return onto(L.top);
      if (a.h <= L.h0 && my < 0) return onto(L.bottom);
      a.h = clamp(a.h, L.h0, L.h1);
    } else if (mx) {
      a.face = mx > 0 ? 1 : -1;
      if (a.h - L.h0 < 14) return onto(L.bottom);
      if (L.h1 - a.h < 14) return onto(L.top);
      if (o.canFall) { a.mode = 'fall'; a.vy = 0; a.ladder = null; a.x += a.face * 22; }
    }
    return;
  }

  if (a.mode === 'rope') {
    const r = a.rope;
    if (my < 0) { a.mode = 'fall'; a.vy = 0; a.rope = null; return; }
    if (mx) {
      a.face = mx > 0 ? 1 : -1;
      a.x += mx * o.rope * dt; a.moving = true;
      if (a.x < r.x0 || a.x > r.x1) {
        const f = nav.floorAt(a.x, r.h);
        a.rope = null;
        if (f) { a.mode = 'floor'; a.floor = f; a.h = f.h; } else { a.mode = 'fall'; a.vy = 0; }
      }
    }
    return;
  }

  // falling
  a.vy -= o.grav * dt;
  const nh = a.h + a.vy * dt;
  if (mx) { a.face = mx > 0 ? 1 : -1; a.x = clamp(a.x + mx * o.run * 0.4 * dt, o.xMin, o.xMax); }
  if (o.canRope && my >= 0) {
    const r = nav.ropes.find(r => a.h > r.h + 0.5 && nh <= r.h && a.x >= r.x0 && a.x <= r.x1);
    if (r) { a.mode = 'rope'; a.rope = r; a.h = r.h; a.vy = 0; return; }
  }
  let land = null;
  for (const f of nav.floors) if (f.h <= a.h + 0.5 && f.h >= nh && a.x >= f.x0 && a.x <= f.x1 && (!land || f.h > land.h)) land = f;
  if (land) { a.mode = 'floor'; a.floor = land; a.h = land.h; a.vy = 0; a.landed = true; }
  else a.h = nh;
}

// Where an agent "is" for someone trying to reach it: a floor and an x on it.
export function standingSpot(nav, a) {
  if (a.mode === 'floor') return { x: a.x, floor: a.floor };
  if (a.mode === 'ladder') {
    const L = a.ladder;
    return { x: L.x, floor: a.h - L.h0 < L.h1 - a.h ? L.bottom : L.top };
  }
  const f = nav.floorBelow(a.x, a.h) || nav.byId.g;
  return { x: clamp(a.x, f.x0, f.x1), floor: f };
}

// Shortest walk-and-climb route (no ropes, no drops). Returns the steering for this instant and the total cost.
export function route(nav, a, target) {
  if (a.mode === 'fall') return { mx: 0, my: 0, cost: Infinity };
  if (a.mode === 'rope') return { mx: a.face, my: 0, cost: Infinity };
  const CLIMB = 1.4;
  // node 0 = start, node 1 = goal, then two per ladder (bottom, top)
  const nodes = [{ x: a.x, floor: a.floor }, { x: target.x, floor: target.floor }];
  for (const L of nav.ladders) { nodes.push({ x: L.x, floor: L.bottom, L, end: 0 }); nodes.push({ x: L.x, floor: L.top, L, end: 1 }); }
  const n = nodes.length;
  const edge = (i, j) => {
    const p = nodes[i], q = nodes[j];
    if (i === 0 && a.mode === 'ladder') {
      if (q.L !== a.ladder) return Infinity;
      return Math.abs(a.h - (q.end ? q.L.h1 : q.L.h0)) * CLIMB;
    }
    if (j === 0) return Infinity;
    if (p.L && q.L && p.L === q.L && p.end !== q.end) return (p.L.h1 - p.L.h0) * CLIMB;
    if (p.floor && p.floor === q.floor) return Math.abs(p.x - q.x);
    return Infinity;
  };
  const dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  dist[0] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      const w = edge(u, v);
      if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
  }
  if (dist[1] === Infinity) return { mx: 0, my: 0, cost: Infinity };
  let step = 1;
  while (prev[step] > 0) step = prev[step];
  // skip zero-length hops (already standing at a ladder end)
  const first = nodes[step];
  const out = { mx: 0, my: 0, cost: dist[1] };
  if (a.mode === 'ladder') { out.my = first.end ? 1 : -1; return out; }
  const dx = first.x - a.x;
  if (Math.abs(dx) > 7) { out.mx = dx > 0 ? 1 : -1; return out; }
  if (first.L && step !== 1) {
    // at the ladder: which way does the route leave it?
    let nxt = 1;
    while (prev[nxt] !== step && prev[nxt] > 0) nxt = prev[nxt];
    const far = nodes[nxt];
    if (far.L === first.L && far.end !== first.end) out.my = first.end ? -1 : 1;
    else if (nxt !== step) { const d2 = far.x - a.x; if (Math.abs(d2) > 7) out.mx = d2 > 0 ? 1 : -1; }
  }
  return out;
}
