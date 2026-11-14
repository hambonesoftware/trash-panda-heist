import * as THREE from 'three';
import { createView, toon } from './gfx.js';
import { buildWorld } from './world.js';
import { buildRaccoon, buildWorker, buildBand, boxMesh, ammoMesh } from './characters.js';
import { buildNav, newAgent, stepAgent, route, standingSpot, ropeSag } from './maze.js';
import { buildMaze, slickMesh, sackMesh } from './mazeart.js';
import { ik2 } from './rig.js';
import { initAudio, sfx, toggleMute, isMuted } from './audio.js';
import { rand, lerp, clamp, damp, smooth, angleDamp, seedRandom } from './util.js';
import {
  G, STEP, STEP_MS, GRAV, AIR, RS, CAN_X, RAC_X, ZONE, DUMP_TOP, DOOR_X, DOCK_Y, DOCK_Z, STAND_X,
  MAX_PULL, MIN_PULL, POWER, SPEC, AMMO, LEVELS, MAZES, THEMES, ROAM, PERCH_X, ROPE_UP,
} from './config.js';
import { makeBot } from './bot.js';
import { artReady, loadArt } from './art.js';

const { Engine, Bodies, Body, Events, Composite, Query } = window.Matter;
const $ = id => document.getElementById(id);
const TEST = /[?&](test|debug)\b/.test(location.search);
const TOUCH = window.matchMedia && matchMedia('(pointer: coarse)').matches;
const HIDE_HOW = TOUCH ? 'Hold the HIDE button' : 'Hold SPACE (or the HIDE button)';

const canvas = $('game'), wrap = $('wrap'), hideBtn = $('hideBtn'), overlay = $('overlay');
const raidBtn = $('raidBtn'), trapBtn = $('trapBtn'), stickEl = $('stick'), knobEl = $('knob');
const view = createView(canvas);
const { scene, camera } = view;
await loadArt();
const world = buildWorld(scene, view);
// Every complex (one per meal) gets its own apartment block, fire escape, cans, guards and window neighbours,
// all built up front so switching levels is an instant swap with no rebuild hitch. Only the
// active complex's group stays in the scene graph -- the rest are detached (not just hidden)
// so three.js never has to walk three buildings' worth of idle geometry every frame.
const navs = MAZES.map(m => buildNav(m));
const mazeArts = navs.map((nv, i) => buildMaze(scene, nv, MAZES[i], i));
mazeArts.forEach((m, i) => { m.group.visible = true; if (i !== 0) scene.remove(m.group); });
let activeMazeIdx = 0;
let nav = navs[0];
let maze = mazeArts[0];

// ---------- characters ----------
const rac = buildRaccoon();
scene.add(rac.outer);
const STAND = new THREE.Vector3(RAC_X, 0, 24);
const HIDE_POS = new THREE.Vector3(CAN_X + 4, 66, 0);
rac.outer.position.copy(STAND);
rac.outer.scale.setScalar(RS);
rac.outer.updateMatrixWorld(true);
const forkW = rac.sling.fork.getWorldPosition(new THREE.Vector3());
const LAUNCH = { x: forkW.x, wy: forkW.y, z: forkW.z };
const REST = { x: LAUNCH.x - 6, wy: LAUNCH.wy - 22 };
const POUCH_MIN_X = CAN_X + 59 + 28;
const band = buildBand(scene);
const ATTACK_TARGET = { x: RAC_X + 4, y: 100, z: 34 };

const wk = Object.assign(buildWorker(), {
  state: 'idle', timer: 0, x: DOOR_X, z: -300, face: Math.PI / 2, faceTo: Math.PI / 2, alert: 0, cool: 0, col: 0,
  type: 'box', door: 0, carrying: false, react: null, reactT: 0, released: false, lobbed: false, watching: false,
});
scene.add(wk.outer);
wk.outer.visible = false;

const rc = { mode: 'stand', modeT: 0, hide: 0, invuln: 0, aimW: 0, tailA: 0, tailV: 0, blink: 2, lastX: RAC_X, splashed: false, releaseT: 0, offX: 0, ropePh: 0 };

// ---------- the maze: raccoon on foot, guards, cans ----------
const ra = newAgent(nav, RAC_X, 'g');
const RAC_MOVE = { run: ROAM.run, climb: ROAM.climb, rope: ROAM.rope, grav: ROAM.grav, xMin: ROAM.xMin, xMax: 336, canRope: true, canFall: true };
const sackM = sackMesh();
rac.sackAnchor.add(sackM);
const GUARD_LOOK = { SHIRT: 0x3d4f9c, APRON: 0x23283d, CAP: 0x1c2140 };
const guardSets = MAZES.map((m, mi) => m.guards.map((def, i) => {
  const g = Object.assign(buildWorker(GUARD_LOOK), { def, i, a: newAgent(navs[mi], def.x, def.floor), state: 'patrol', t: 0, dur: 0, dir: i % 2 ? -1 : 1, last: null, lost: 0, active: false, faceY: 0 });
  g.outer.scale.setScalar(0.86);
  g.outer.visible = false;
  if (mi === 0) scene.add(g.outer);
  return g;
}));
let guards = guardSets[0];
let residents = mazeArts[0].residents;
const slicks = [];
const stashPile = new THREE.Group();
stashPile.position.set(232, 0, 44);
scene.add(stashPile);
const peel = { on: false, x: 0, mesh: ammoMesh('banana') };
peel.mesh.visible = false;
scene.add(peel.mesh);

// ---------- physics ----------
const engine = Engine.create();
engine.positionIterations = 8;
engine.velocityIterations = 6;
Composite.add(engine.world, [
  Bodies.rectangle(700, G + 50, 5000, 100, { isStatic: true, friction: 0.9 }),
  Bodies.rectangle(1060, G - 80, 290, 160, { isStatic: true, friction: 0.9 }),
  Bodies.rectangle(1480, G - 400, 60, 1400, { isStatic: true }),
  Bodies.rectangle(CAN_X, G - 77, 120, 155, { isStatic: true }),
]);
const STATICS = [
  { minX: 915, maxX: 1205, minY: G - 160, maxY: G },
  { minX: CAN_X - 60, maxX: CAN_X + 60, minY: G - 155, maxY: G },
];

// ---------- state ----------
let state = 'menu', pausedFrom = null, levelIdx = 0, level = LEVELS[0];
let time = 0, levelTime = 0, hearts = 3, throws = 0, ammoIdx = 0, ammoOverride = null;
let throwCool = 0, clearT = 0, endT = 0, shake = 0, frames = 0, running = true;
let hideKey = false, hideBtnDown = false, aim = null, spottedLatch = false, taught = 0, lastStretch = 0;
let where = 'perch', day = 1, dayK = 1, hourNow = 0, stash = [], sack = [], inCan = null, rumCan = null, rumT = 0, trapCool = 0, botMove = null, chased = false;
// a beat of catch immunity right after a level loads, since the far-left spawn sits close to a
// patrol's turnaround point; unlike rc.invuln (hit flinch) this never blinks the raccoon out of view.
let spawnGrace = 0;
const keys = { l: false, r: false, u: false, d: false };
const stick = { id: null, ox: 0, oy: 0, mx: 0, my: 0 };
const boxes = [], projs = [], flying = [], parts = [], killQueue = [];
const pouch = { x: REST.x, wy: REST.wy, vx: 0, vy: 0 };
const cam = { D: 3000, off: 0, zoom: 1, up: 0, aspect: 1.78 };
let closeUp = null;

const hideHeld = () => hideKey || hideBtnDown || (where === 'perch' && keys.d);
const curAmmo = () => ammoOverride || stash[0] || null;
const nextAmmo = () => ammoOverride || stash[1] || null;
const pullAmount = () => Math.hypot(pouch.x - REST.x, pouch.wy - REST.wy);
const pullFrac = () => Math.min(1, pullAmount() / MAX_PULL);
const canAim = () => state === 'play' && where === 'perch' && !!curAmmo() && rac.outer.visible && rc.hide < 0.05 && throwCool <= 0 && !hideHeld() && Math.abs(rc.offX) < 6 && (rc.mode === 'stand' || rc.mode === 'release');

// ---------- meshes for aim preview / held ammo / trail ----------
const dotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.55, 1.3), toneMapped: false });
const dots = [];
for (let i = 0; i < 22; i++) {
  const d = new THREE.Mesh(new THREE.SphereGeometry(i % 3 ? 3.5 : 5, 10, 8), dotMat);
  d.visible = false;
  scene.add(d);
  dots.push(d);
}
const trailMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 });
const trail = [];
for (let i = 0; i < 50; i++) {
  const d = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 6), trailMat);
  d.visible = false;
  scene.add(d);
  trail.push(d);
}
let trailIdx = 0, trailTick = 0, trailProj = null;
let held = null, heldType = '';
function setHeld() {
  const type = curAmmo() || '';
  if (type === heldType) return;
  if (held) scene.remove(held);
  held = type ? ammoMesh(type) : null;
  heldType = type;
  if (held) scene.add(held);
}
function showStash() {
  while (stashPile.children.length) stashPile.remove(stashPile.children[0]);
  stash.slice(1, 13).forEach((type, i) => {
    const m = ammoMesh(type);
    m.scale.setScalar(0.7);
    m.position.set(-(i % 4) * 26 + (Math.floor(i / 4) % 2) * 12, 12 + Math.floor(i / 4) * 20, (i % 3) * 9 - 9);
    m.rotation.z = (i * 1.7) % 1.2 - 0.6;
    stashPile.add(m);
  });
  setHeld();
}

// ---------- bodies ----------
function addBox(type, x, bottom) {
  const s = SPEC[type];
  const body = Bodies.rectangle(x, bottom - s.h / 2, s.w, s.h, { density: s.density, friction: 0.85, restitution: 0.02 });
  const { g, skin } = boxMesh(type);
  const o = { kind: 'box', type, body, mesh: g, skin, hp: s.hp, max: s.hp, dead: false, worn: false };
  body.gameObj = o;
  Composite.add(engine.world, body);
  scene.add(g);
  boxes.push(o);
  return o;
}

function spawnProj(type, x, y, vx, vy, z = 0, split = false) {
  const a = AMMO[type];
  const body = Bodies.circle(x, y, a.r, { density: a.density, restitution: 0.25, friction: 0.7, frictionAir: AIR });
  Body.setVelocity(body, { x: vx, y: vy });
  Body.setAngularVelocity(body, 0.18);
  const o = { kind: 'proj', type, body, mesh: ammoMesh(type), age: 0, hitAt: 0, still: 0, split, punch: null, z };
  body.gameObj = o;
  Composite.add(engine.world, body);
  scene.add(o.mesh);
  projs.push(o);
  return o;
}

function removeObj(list, o) {
  Composite.remove(engine.world, o.body);
  scene.remove(o.mesh);
  if (o.worn && o.skin && !o.skin.isMesh) {
    o.skin.traverse(mesh => {
      if (mesh.userData.ownsMaterial) mesh.material.dispose();
    });
  }
  const i = list.indexOf(o);
  if (i >= 0) list.splice(i, 1);
}

const partGeo = new THREE.BoxGeometry(1, 1, 1);
const partMats = new Map();
function burst(x, y, z, n, color, speed, size, grav = 900, rnd = rand) {
  let mat = partMats.get(color);
  if (!mat) { mat = new THREE.MeshToonMaterial({ color }); partMats.set(color, mat); }
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(partGeo, mat);
    const a = rnd(0, Math.PI * 2), sp = rnd(0.3, 1) * speed;
    m.position.set(x + rnd(-10, 10), y + rnd(-10, 10), z + rnd(-10, 10));
    scene.add(m);
    parts.push({ m, vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp + speed * 0.3, vz: rnd(-0.5, 0.5) * speed, life: rnd(0.5, 0.9), size: rnd(0.6, 1.2) * size, grav, spin: rnd(-9, 9) });
  }
}

function buzz(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* unsupported */ } } }

function hit(self, other, rel, vOther) {
  const o = self.gameObj;
  if (!o || o.kind !== 'box' || o.dead) return;
  const mass = other.isStatic ? self.mass : Math.min(other.mass, 12);
  o.hp -= (rel - 3) * mass;
  if (o.hp <= 0) {
    o.dead = true;
    killQueue.push(o);
    const p = other.gameObj;
    if (p && p.kind === 'proj') { const k = AMMO[p.type].pierce || 0.55; p.punch = { x: vOther.x * k, y: vOther.y * k }; }
  } else if (!o.worn && o.hp < o.max * 0.55) {
    o.worn = true;
    if (o.skin.isMesh) o.skin.material = toon(SPEC[o.type].hurt);
    else o.skin.traverse(mesh => {
      if (mesh.isMesh) {
        mesh.material = mesh.material.clone();
        mesh.material.color.multiplyScalar(.65);
        mesh.userData.ownsMaterial = true;
      }
    });
  }
}

Events.on(engine, 'collisionStart', ev => {
  for (const p of ev.pairs) {
    const a = p.bodyA, b = p.bodyB;
    for (const body of [a, b]) {
      const o = body.gameObj;
      if (o && o.kind === 'proj' && !o.hitAt) o.hitAt = time;
    }
    if (levelTime < 0.6) continue;
    const va = { x: a.velocity.x, y: a.velocity.y }, vb = { x: b.velocity.x, y: b.velocity.y };
    const rel = Math.hypot(va.x - vb.x, va.y - vb.y);
    if (rel < 3) continue;
    hit(a, b, rel, vb);
    hit(b, a, rel, va);
    sfx.thud(rel);
  }
});

function afterStep() {
  for (const o of killQueue) {
    const p = o.body.position, s = SPEC[o.type];
    burst(p.x, G - p.y, 0, 9, s.color, 260, 13);
    burst(p.x, G - p.y, 0, 4, 0xead6a6, 200, 9);
    removeObj(boxes, o);
    sfx.smash();
    shake = Math.max(shake, 5);
    buzz(15);
  }
  killQueue.length = 0;
  for (const o of projs) if (o.punch) { Body.setVelocity(o.body, o.punch); o.punch = null; }
}

// ---------- level flow ----------
function clearLevel() {
  for (const o of boxes.slice()) removeObj(boxes, o);
  for (const o of projs.slice()) removeObj(projs, o);
  for (const f of flying) scene.remove(f.mesh);
  for (const p of parts) scene.remove(p.m);
  flying.length = parts.length = killQueue.length = 0;
  for (const d of trail) d.visible = false;
}

// Switches which complex (fire escape, cans, guards, residents) is live. Safe to call repeatedly
// with the same index: it just re-arms the residents' sporadic timers.
function activateMaze(i) {
  if (activeMazeIdx !== i) {
    scene.remove(mazeArts[activeMazeIdx].group);
    scene.add(mazeArts[i].group);
    for (const g of guards) { g.active = false; g.outer.visible = false; scene.remove(g.outer); }
    for (const g of guardSets[i]) scene.add(g.outer);
    activeMazeIdx = i;
  }
  nav = navs[i];
  maze = mazeArts[i];
  guards = guardSets[i];
  residents = maze.residents;
  world.setComplex(i);
  for (const r of residents) {
    Object.assign(r, { state: 'idle', timer: resRand(r.def.every[0], r.def.every[1]), can: null, loot: null });
    r.hold(null);
    r.setOut(false);
  }
}

function loadLevel(i) {
  levelIdx = i;
  level = LEVELS[i];
  activateMaze(i);
  clearLevel();
  for (const [x, ...types] of level.cols) {
    let y = x >= 915 ? DUMP_TOP : G;
    for (const t of types) { addBox(t, x, y); y -= SPEC[t].h; }
  }
  hearts = 3; throws = 0; ammoIdx = 0; ammoOverride = null; throwCool = 0; clearT = 0; endT = 0; levelTime = 0; aim = null;
  dayK = 1 + 0.12 * (day - 1);
  // he starts each meal empty-sacked at the far end of the alley, not idle at the dumpster, so
  // the first thing to do is run the maze for trash before the slingshot is even an option.
  where = 'roam'; stash = []; sack = []; inCan = null; rumCan = null; rumT = 0; trapCool = 0; chased = false; botMove = null;
  hourNow = level.hour; world.setTime(hourNow);
  Object.assign(ra, newAgent(nav, ROAM.xMin + 40, 'g'));
  for (const s of slicks) scene.remove(s.mesh);
  slicks.length = 0;
  peel.on = false; peel.mesh.visible = false;
  for (const c of maze.cans) { c.loot = c.full.slice(); c.refill = 0; c.hideAmt = 0; c.show(); }
  guards.forEach((g, n) => {
    g.active = n < level.guards;
    g.outer.visible = g.active;
    Object.assign(g, { a: newAgent(nav, g.def.x, g.def.floor), state: 'patrol', t: 0, last: null, lost: 0, dir: n % 2 ? -1 : 1, blind: 0, stuck: 0 });
    g.rig.play('walk', 0);
  });
  showStash();
  spawnGrace = ROAM.stun;
  Object.assign(rc, { mode: 'stand', modeT: 0, hide: 0, invuln: 0, aimW: 0, splashed: false, offX: 0 });
  Object.assign(pouch, { x: REST.x, wy: REST.wy, vx: 0, vy: 0 });
  rac.outer.visible = true;
  rac.outer.position.set(ra.x, ra.h, 24);
  rac.outer.rotation.set(0, 0, 0);
  rac.outer.scale.setScalar(RS);
  rac.root.rotation.set(0, -0.3, 0);
  rac.rig.play('idle', 0.1);
  Object.assign(wk, { state: 'idle', timer: level.first, alert: 0, cool: 0, door: 0, react: null, carrying: false, watching: false });
  setCarry(null); setGrab(null);
  wk.outer.visible = false;
}

function startLevel(i) {
  loadLevel(i);
  state = 'play';
  pausedFrom = null;
  hideOverlay();
}

function setPaused(on) {
  if (on && (state === 'play' || state === 'winning')) {
    pausedFrom = state;
    state = 'paused';
    aim = null;
    showOverlay('<h1>Paused</h1><p>The night crew is waiting.</p><div class="row"><button data-act="resume">Resume</button><button class="alt" data-act="retry">Restart level</button></div>');
  } else if (!on && state === 'paused') {
    state = pausedFrom || 'play';
    pausedFrom = null;
    hideOverlay();
  }
  $('pauseBtn').setAttribute('aria-pressed', state === 'paused' ? 'true' : 'false');
}

// ---------- input ----------
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -LAUNCH.z), ndc = new THREE.Vector2(), hitPt = new THREE.Vector3();
function toWorld(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(plane, hitPt) ? { x: hitPt.x, y: hitPt.y } : null;
}

function constrainPouch(dx, dy) {
  let x = REST.x + dx, y = REST.wy + dy;
  let vx = x - LAUNCH.x, vy = y - LAUNCH.wy;
  const len = Math.hypot(vx, vy);
  if (len > MAX_PULL) { vx *= MAX_PULL / len; vy *= MAX_PULL / len; }
  x = Math.max(POUCH_MIN_X, Math.min(LAUNCH.x - 4, LAUNCH.x + vx));
  y = Math.max(26, LAUNCH.wy + vy);
  return { x, wy: y };
}
const launchVelocity = p => ({ x: (LAUNCH.x - p.x) * POWER, y: -(LAUNCH.wy - p.wy) * POWER });

function splitFish(o) {
  const v = o.body.velocity, p = o.body.position;
  o.split = true;
  for (const a of [-0.17, 0.17]) {
    const c = Math.cos(a), s = Math.sin(a);
    spawnProj('fish', p.x, p.y, v.x * c - v.y * s, v.x * s + v.y * c, 0, true);
  }
  burst(p.x, G - p.y, 0, 5, 0xf3eede, 120, 6, 0);
  sfx.split();
}
const liveFish = () => projs.find(o => o.type === 'fish' && !o.split && !o.hitAt);

function fire() {
  const p = { x: pouch.x, wy: pouch.wy }, v = launchVelocity(p);
  spawnProj(curAmmo(), p.x, G - p.wy, v.x, v.y, LAUNCH.z);
  if (!ammoOverride) stash.shift();
  throws++; ammoIdx++; throwCool = 0.5; taught |= 1;
  pouch.vx = (LAUNCH.x - p.x) * 16; pouch.vy = (LAUNCH.wy - p.wy) * 16;
  rc.mode = 'release'; rc.modeT = 0; rc.releaseT = 0;
  rac.rig.play('release', 0.04, 1, true);
  for (const d of trail) d.visible = false;
  trailIdx = 0; trailTick = 0; trailProj = projs[projs.length - 1];
  showStash();
  sfx.snap();
  buzz(10);
}

function setStick(e) {
  const R = 46, dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, len = Math.hypot(dx, dy) || 1, k = Math.min(1, len / R);
  stick.mx = (dx / len) * k; stick.my = (-dy / len) * k;
  knobEl.style.transform = `translate(${(dx / len) * k * R}px, ${(dy / len) * k * R}px)`;
}
function endStick() {
  stick.id = null; stick.mx = stick.my = 0;
  stickEl.classList.remove('on');
}
canvas.addEventListener('pointerdown', e => {
  initAudio();
  if (state !== 'play') return;
  if (where === 'roam') {
    // anywhere on the screen becomes a thumbstick while the raccoon is on foot
    if (stick.id !== null) return;
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.mx = stick.my = 0;
    const r = wrap.getBoundingClientRect();
    stickEl.style.left = (e.clientX - r.left) + 'px'; stickEl.style.top = (e.clientY - r.top) + 'px';
    knobEl.style.transform = 'translate(0px, 0px)';
    stickEl.classList.add('on');
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    e.preventDefault();
    return;
  }
  const fish = liveFish();
  if (fish) { splitFish(fish); return; }
  if (!canAim()) return;
  const p = toWorld(e);
  if (!p) return;
  const r = canvas.getBoundingClientRect();
  const leftSide = e.clientX - r.left < r.width * 0.55;
  const near = Math.hypot(p.x - pouch.x, p.y - pouch.wy) < 160;
  if (!leftSide && !near) return;
  // Drag is measured in screen pixels at the resting camera scale, so camera pans can't add pull.
  const perPx = (2 * (cam.D - LAUNCH.z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / r.height;
  aim = { id: e.pointerId, cx: e.clientX, cy: e.clientY, perPx };
  Object.assign(pouch, { x: REST.x, wy: REST.wy, vx: 0, vy: 0 });
  lastStretch = 0;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
  e.preventDefault();
});
canvas.addEventListener('pointermove', e => {
  if (stick.id !== null && e.pointerId === stick.id) { setStick(e); return; }
  if (!aim || e.pointerId !== aim.id) return;
  const c = constrainPouch((e.clientX - aim.cx) * aim.perPx, -(e.clientY - aim.cy) * aim.perPx);
  pouch.x = c.x; pouch.wy = c.wy; pouch.vx = pouch.vy = 0;
  const k = Math.floor((pullFrac()) * 5);
  if (k > lastStretch) sfx.stretch(k / 5);
  lastStretch = k;
});
function endAim(e) {
  if (stick.id !== null && e.pointerId === stick.id) { endStick(); return; }
  if (!aim || e.pointerId !== aim.id) return;
  const ok = e.type === 'pointerup' && state === 'play' && pullAmount() >= MIN_PULL && canAim();
  aim = null;
  if (ok) fire();
  else { pouch.vx = pouch.vy = 0; }
}
canvas.addEventListener('pointerup', endAim);
canvas.addEventListener('pointercancel', endAim);
canvas.addEventListener('contextmenu', e => e.preventDefault());

const MOVE_KEYS = { KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd' };
const TRAP_KEYS = new Set(['KeyE', 'KeyX', 'KeyF']);
window.addEventListener('keydown', e => {
  if (e.code === 'Space') { hideKey = true; e.preventDefault(); return; }
  if (MOVE_KEYS[e.code]) { keys[MOVE_KEYS[e.code]] = true; e.preventDefault(); return; }
  if (e.repeat) return;
  if (TRAP_KEYS.has(e.code)) dropSlick();
  else if (e.code === 'KeyR' && state !== 'menu') startLevel(levelIdx);
  else if (e.code === 'KeyM') toggleSound();
  else if (e.code === 'KeyP' || e.code === 'Escape') setPaused(state !== 'paused');
  else if (e.code === 'Enter' && overlay.classList.contains('show')) {
    const b = overlay.querySelector('button[data-act]');
    if (b) { e.preventDefault(); b.click(); }
  }
});
window.addEventListener('keyup', e => {
  if (e.code === 'Space') hideKey = false;
  if (MOVE_KEYS[e.code]) keys[MOVE_KEYS[e.code]] = false;
});
window.addEventListener('blur', () => { hideKey = false; hideBtnDown = false; keys.l = keys.r = keys.u = keys.d = false; endStick(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && !TEST) setPaused(true); });

hideBtn.addEventListener('pointerdown', e => {
  initAudio();
  hideBtnDown = true;
  try { hideBtn.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
  e.preventDefault();
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) hideBtn.addEventListener(ev, () => { hideBtnDown = false; });
hideBtn.addEventListener('contextmenu', e => e.preventDefault());
raidBtn.addEventListener('click', () => { initAudio(); goRoam(); });
trapBtn.addEventListener('pointerdown', e => { initAudio(); dropSlick(); e.preventDefault(); });
for (const b of [raidBtn, trapBtn]) b.addEventListener('contextmenu', e => e.preventDefault());

function toggleSound() {
  initAudio();
  const m = toggleMute();
  const b = $('muteBtn');
  b.setAttribute('aria-pressed', m ? 'true' : 'false');
  b.setAttribute('aria-label', m ? 'Sound off' : 'Sound on');
  b.classList.toggle('off', m);
}
$('muteBtn').addEventListener('click', toggleSound);
$('restartBtn').addEventListener('click', () => { initAudio(); if (state !== 'menu') startLevel(levelIdx); });
$('pauseBtn').addEventListener('click', () => { initAudio(); setPaused(state !== 'paused'); });
const fsBtn = $('fsBtn');
if (document.fullscreenEnabled) {
  fsBtn.hidden = false;
  fsBtn.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen();
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (err) { /* user agent refused */ }
  });
}
overlay.addEventListener('click', e => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  initAudio();
  const act = btn.dataset.act;
  if (act === 'play') { day = 1; startLevel(0); }
  else if (act === 'retry') startLevel(levelIdx);
  else if (act === 'next') {
    if (levelIdx + 1 >= LEVELS.length) day++;
    startLevel((levelIdx + 1) % LEVELS.length);
  }
  else if (act === 'resume') setPaused(false);
});

// ---------- overlays ----------
function showOverlay(html) {
  overlay.innerHTML = '<div class="panel">' + html + '</div>';
  overlay.classList.add('show');
}
function hideOverlay() { overlay.classList.remove('show'); }
function showMenu() {
  showOverlay(
    '<h1>Trash Panda Heist</h1>' +
    '<p>A meal waits in the dumpster every six hours, but the crew keeps stacking boxes around it.</p>' +
    '<p><b>Raid the trash cans</b> up the fire escapes: ' + (TOUCH ? 'tap RAID, then drag anywhere to run and climb' : 'A/D run, W/S climb, or click RAID') + '. Stand still at a can to dig. Everything goes in your sack.</p>' +
    '<p><b>Haul it back to the slingshot</b>, pull back and let go to smash the boxes.</p>' +
    '<p><b>' + HIDE_HOW + '</b> to duck into a can when someone is coming. ' + (TOUCH ? 'TRAP' : 'E') + ' rips a bag open to trip a guard. Guards cannot follow you along the clotheslines.</p>' +
    '<div class="row"><button data-act="play">Play</button></div>');
}
const clock = h => { const hh = ((Math.floor(h) % 24) + 24) % 24, m = Math.floor((h % 1) * 60); return (hh % 12 || 12) + ':' + String(m).padStart(2, '0') + (hh < 12 ? ' AM' : ' PM'); };
function showWin() {
  const stars = throws <= level.par ? 3 : throws <= level.par + 5 ? 2 : 1;
  const last = levelIdx === LEVELS.length - 1;
  const nxt = LEVELS[(levelIdx + 1) % LEVELS.length];
  showOverlay(
    '<h1>' + level.name + ' eaten!</h1>' +
    '<div class="stars">' + [1, 2, 3].map(n => '<span class="' + (n <= stars ? '' : 'off') + '">&#9733;</span>').join('') + '</div>' +
    '<p>' + throws + ' throws (3 stars at ' + level.par + ' or fewer) &middot; ' + Math.round(levelTime) + ' seconds &middot; ' + hearts + ' of 3 hearts left</p>' +
    '<p>Six hours later it is <b>' + clock(nxt.hour) + '</b>' + (last ? ' on day ' + (day + 1) + ', and the crew is faster.' : '.') + ' Time for ' + nxt.name.toLowerCase() + '.</p>' +
    '<div class="row"><button data-act="next">Run to ' + nxt.name.toLowerCase() + '</button><button class="alt" data-act="retry">Replay</button></div>');
}
function showLose() {
  showOverlay(
    '<h1>Busted!</h1>' +
    '<p>The crew chased the raccoon off on day ' + day + '. Duck into a can when someone is coming, and trip guards with a ripped bag.</p>' +
    '<div class="row"><button data-act="retry">Try again</button></div>');
}

// ---------- box placement and worker ----------
function blockers() {
  let n = 0;
  for (const o of boxes) {
    const p = o.body.position;
    if (!o.dead && p.x > ZONE.x0 && p.x < ZONE.x1 && p.y > ZONE.top) n++;
  }
  return n;
}
function columnTop(cx) {
  let top = cx >= 915 ? DUMP_TOP : G;
  for (const o of boxes) if (!o.dead && Math.abs(o.body.position.x - cx) < 40) top = Math.min(top, o.body.bounds.min.y);
  return top;
}
function pickColumn() {
  const tops = level.cols.map(c => ({ x: c[0], top: columnTop(c[0]) })).filter(c => c.top > G - 420);
  if (!tops.length) return level.cols[0][0];
  const lowest = Math.max(...tops.map(c => c.top));
  const pool = tops.filter(c => c.top >= lowest - 30);
  return pool[Math.floor(rand(0, pool.length))].x;
}

function attachBox(anchor, type) {
  while (anchor.children.length) anchor.remove(anchor.children[0]);
  if (type) {
    const m = boxMesh(type).g;
    m.scale.setScalar(1 / wk.outer.scale.x);
    anchor.add(m);
  }
}
function setCarry(type) { attachBox(wk.carry, type); wk.carrying = !!type; }
function setGrab(type) { attachBox(wk.grab, type); wk.grabType = type; }

function fly(type, from, to, dur, arc, kind, extra) {
  const mesh = (extra && extra.mesh) || boxMesh(type).g;
  scene.add(mesh);
  flying.push({ mesh, type, from, to, dur, arc, kind, t: 0, extra });
}

function landPlaced(f) {
  const s = SPEC[f.type], all = Composite.allBodies(engine.world);
  let bottom = columnTop(f.to.x) - 14;
  for (let i = 0; i < 8; i++) {
    const region = { min: { x: f.to.x - s.w / 2 + 2, y: bottom - s.h }, max: { x: f.to.x + s.w / 2 - 2, y: bottom - 1 } };
    if (!Query.region(all, region).length) break;
    bottom -= 30;
  }
  addBox(f.type, f.to.x, bottom);
}

function hurtRaccoon() {
  hearts--;
  rc.invuln = where === 'roam' ? 2.4 : 1.5;
  shake = 16;
  aim = null;
  burst(rac.outer.position.x, rac.outer.position.y + 90, 30, 10, 0xd49d5e, 280, 12);
  sfx.hurt();
  buzz([40, 30, 60]);
  rc.mode = 'hit'; rc.modeT = 0;
  rac.rig.play('hit', 0.05, 1, true);
  if (hearts <= 0) { state = 'lost'; endT = 0; sfx.lose(); }
}

function landAttack() {
  if (state !== 'play') return;
  if (rc.hide < 0.6 && rc.invuln <= 0) hurtRaccoon();
  else {
    burst(CAN_X, 160, 30, 7, 0xd49d5e, 220, 10);
    sfx.clang();
    world.canLid.rotation.z = 0.35;
    taught |= 2;
  }
}

// A resident's trash landing in a can: the can gets one more piece of loot.
function residentLand(f) {
  if (state !== 'play') return;
  const e = f.extra;
  e.can.loot.push(e.lootType);
  e.can.show();
  burst(e.can.x, e.can.floor.h + 92, 0, 5, 0xdfe3ee, 150, 6, 900, resRand);
  sfx.thud(5);
}

function updateFlying(dt) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i];
    f.t += dt / f.dur;
    const k = Math.min(1, f.t);
    f.mesh.position.set(lerp(f.from.x, f.to.x, k), lerp(f.from.y, f.to.y, k) + Math.sin(k * Math.PI) * f.arc, lerp(f.from.z, f.to.z, k));
    f.mesh.rotation.z += dt * (f.kind === 'attack' ? 9 : 3);
    if (k >= 1) {
      scene.remove(f.mesh);
      flying.splice(i, 1);
      if (f.kind === 'attack') landAttack();
      else if (f.kind === 'residentDump') residentLand(f);
      else if (state === 'play') landPlaced(f);
    }
  }
}

const FACE_LEFT = Math.PI + 0.35, FACE_RIGHT = -0.35, FACE_OUT = -Math.PI / 2, FACE_IN = Math.PI / 2;
const _v = new THREE.Vector3();

// The neighbours use a random stream of their own, so how often they pop out never changes what the guards,
// the stocker or the seeded trial games do.
let resSeed = 20251112;
const resRand = (a, b) => { resSeed = (Math.imul(resSeed, 1664525) + 1013904223) >>> 0; return a + (resSeed / 4294967296) * (b - a); };
// ---------- balcony residents ----------
// Neighbours pop their heads out of their windows every so often and drop a bit of trash into the nearest
// can on their floor. They are friendly: nothing they do can hurt the raccoon.
const RES = { rise: 0.4, look: 0.55, wind: 0.3, toss: 0.16, linger: 0.8, sink: 0.35 };
const RES_NEXT = { rise: 'look', look: 'wind', wind: 'toss', toss: 'linger', linger: 'sink' };
// Neighbours drop their trash down into the cans out in the alley, never the ones up on the fire escapes: those
// stay the hard-to-reach stash. Prefer an empty can, and skip one the raccoon is rummaging in right now.
function residentCan(r) {
  const busy = c => where === 'roam' && ra.floor === c.floor && Math.abs(ra.x - c.x) < 170;
  const cans = maze.cans.filter(c => c.floor.h === 0 && !busy(c));
  const d = c => Math.abs(c.x - r.x) + (c.loot.length ? 400 : 0);
  return cans.sort((a, b) => d(a) - d(b))[0];
}
function updateResidents(dt) {
  if (state !== 'play') return;
  for (const r of residents) {
    if (r.state === 'idle') {
      r.timer -= dt;
      if (r.timer > 0) continue;
      const can = residentCan(r);
      if (!can) { r.timer = resRand(2, 4); continue; }
      r.can = can;
      r.loot = can.full[Math.floor(resRand(0, can.full.length))] || 'can';
      r.hold(ammoMesh(r.loot));
      r.arm.rotation.x = -1.15; r.head.rotation.y = 0;
      r.setOut(true); r.pop(0);
      r.state = 'rise'; r.timer = RES.rise; sfx.door();
      continue;
    }
    r.timer -= dt;
    const k = 1 - Math.max(0, r.timer) / RES[r.state];
    const side = Math.sign(r.can.x - r.x) || 1;
    if (r.state === 'rise') { r.pop(k); r.head.rotation.y = 0.2 * Math.sin(k * 7); }
    else if (r.state === 'look') r.head.rotation.y = lerp(0, 0.55 * side, Math.min(1, k * 2.5));
    else if (r.state === 'wind') r.arm.rotation.x = lerp(-1.15, 0.7, k);
    else if (r.state === 'toss') r.arm.rotation.x = lerp(0.7, -1.9, k);
    else if (r.state === 'linger') {
      r.arm.rotation.x = lerp(-1.9, -1.15, Math.min(1, k * 3));
      // glance at the raccoon if he is on their floor, otherwise watch the can
      const near = where === 'roam' && ra.floor === r.floor;
      r.head.rotation.y = near ? Math.max(-0.6, Math.min(0.6, (ra.x - r.x) / 260)) : 0.55 * side;
    } else if (r.state === 'sink') { r.pop(Math.max(0.001, 1 - k)); r.head.rotation.y *= 0.9; }
    if (r.timer > 0) continue;
    if (r.state === 'toss') {
      const type = r.loot, mesh = r.bag;
      r.hold(null);
      fly('small', { x: r.x + 26, y: r.winY - 8, z: -50 }, { x: r.can.x, y: r.can.floor.h + 90, z: -14 }, 0.5 + (r.winY - 90) / 1500, 30, 'residentDump', { can: r.can, lootType: type, mesh: ammoMesh(type) });
    }
    const next = RES_NEXT[r.state];
    if (next) { r.state = next; r.timer = RES[next]; }
    else { r.state = 'idle'; r.setOut(false); r.timer = resRand(r.def.every[0], r.def.every[1]); }
  }
}

// ---------- on foot in the maze ----------
function moveInput() {
  if (botMove) return botMove;
  let mx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), my = (keys.u ? 1 : 0) - (keys.d ? 1 : 0);
  if (stick.id !== null) {
    if (Math.abs(stick.mx) > 0.38) mx = Math.sign(stick.mx);
    if (Math.abs(stick.my) > 0.5) my = Math.sign(stick.my);
  }
  return { mx, my };
}

function goRoam() {
  if (state !== 'play' || where !== 'perch' || rc.hide > 0.05 || rc.mode === 'hit') return false;
  where = 'roam';
  aim = null;
  Object.assign(ra, newAgent(nav, RAC_X - 24, 'g'));
  ra.face = -1;
  rc.mode = 'stand';
  taught |= 4;
  return true;
}

function enterPerch() {
  where = 'perch';
  rc.offX = ra.x - STAND.x;
  rc.mode = 'stand'; rc.modeT = 0;
  inCan = null; rumCan = null; rumT = 0;
  endStick();
  if (sack.length) {
    stash.push(...sack);
    burst(250, 40, 40, 8, 0xf2c14e, 200, 9);
    sack = [];
    sfx.bank();
    taught |= 8;
  }
  showStash();
}

function nearCan(reach) {
  if (ra.mode !== 'floor') return null;
  let best = null;
  for (const c of maze.cans) if (c.floor === ra.floor && Math.abs(c.x - ra.x) < reach && (!best || Math.abs(c.x - ra.x) < Math.abs(best.x - ra.x))) best = c;
  return best;
}

// Rip a trash bag open at your feet. The next guard to step in it goes down.
function dropSlick() {
  if (state !== 'play' || where !== 'roam' || ra.mode !== 'floor' || inCan || trapCool > 0) return false;
  const mesh = slickMesh();
  mesh.position.set(ra.x, ra.h, 10);
  scene.add(mesh);
  slicks.push({ x: ra.x, floor: ra.floor, life: ROAM.trapLife, mesh });
  trapCool = ROAM.trapCool;
  burst(ra.x, ra.h + 20, 20, 6, 0x3f4558, 160, 8);
  sfx.rip();
  taught |= 16;
  return true;
}

function makeNoise(x, floor) {
  for (const g of guards) {
    if (!g.active || (g.state !== 'patrol' && g.state !== 'search')) continue;
    if (Math.abs(g.a.x - x) + Math.abs(g.a.h - floor.h) > ROAM.noise) continue;
    g.state = 'investigate'; g.t = 0; g.last = { x, floor };
  }
}

function updateRoam(dt) {
  const inp = state === 'play' && rc.mode !== 'hit' ? moveInput() : { mx: 0, my: 0 };
  const wantHide = hideHeld() && state === 'play';
  if (inCan && !wantHide) { inCan.shake = 0.6; inCan = null; }
  else if (!inCan && wantHide && ra.mode === 'floor') {
    const c = nearCan(60);
    if (c) { inCan = c; c.shake = 1; ra.x = c.x; rumCan = null; rumT = 0; sfx.duck(); taught |= 2; }
  }
  if (inCan) return;

  stepAgent(nav, ra, inp, dt, RAC_MOVE);
  if (ra.landed) { ra.landed = false; sfx.thud(7); burst(ra.x, ra.h + 4, 24, 4, 0x8a8fa8, 110, 6, 300); }

  // stand still beside a can to dig through it; every piece goes in the sack
  const c = !inp.mx && !inp.my ? nearCan(38) : null;
  if (c && c.loot.length && state === 'play') {
    if (rumCan !== c) { rumCan = c; rumT = 0; }
    rumT += dt; c.shake = Math.max(c.shake, 0.7);
    if (rumT >= ROAM.rummage) {
      rumT = 0;
      const type = c.loot.shift();
      sack.push(type);
      c.show();
      if (!c.loot.length) c.refill = ROAM.refill / dayK;
      burst(c.x, c.floor.h + 92, 0, 4, 0xdfe3ee, 150, 6);
      sfx.grab();
      buzz(8);
      makeNoise(c.x, c.floor);
    }
  } else { rumCan = null; rumT = 0; }

  if (ra.mode === 'floor' && ra.floor.id === 'g' && ra.x >= PERCH_X && state === 'play') enterPerch();
}

function guardSees(g) {
  if (where !== 'roam' || inCan || state !== 'play' || g.blind > 0 || ra.x > ROAM.safeX) return false;
  const dx = ra.x - g.a.x, dh = ra.h - g.a.h;
  if (Math.hypot(dx, dh) < 190) return true;
  return Math.abs(dh) < 60 && Math.abs(dx) < 540 && (Math.sign(dx) === g.a.face || Math.abs(dx) < 150);
}

function caught(g) {
  if (sack.length) { burst(ra.x, ra.h + 70, 24, 12, 0xb89a62, 300, 10); sack = []; }
  hurtRaccoon();
  g.state = 'gloat'; g.t = 0; g.dur = 1.5;
  g.rig.play('grabbed', 0.08, 1, true);
}

function updateGuards(dt) {
  const playing = state === 'play';
  const gs = level.guardSpeed * dayK;
  let anyChase = false;
  for (const g of guards) {
    if (!g.active) continue;
    const a = g.a;
    g.t += dt;
    g.blind = Math.max(0, (g.blind || 0) - dt);
    let inp = { mx: 0, my: 0 }, speed = 96 * gs, clip = 'idle', clipSpeed = 1;
    if (g.state === 'stun' || g.state === 'gloat') {
      clip = null;
      if (g.t >= g.dur) { g.state = 'search'; g.t = 0; }
    } else if (playing) {
      const sees = guardSees(g);
      if (sees) {
        if (g.state !== 'chase') { g.state = 'chase'; if (!chased) sfx.spotted(); }
        g.last = standingSpot(nav, ra); g.lost = 0;
      }
      if (g.state === 'chase') {
        anyChase = true;
        speed = 218 * gs; clip = 'run';
        if (!sees) { g.lost += dt; if (g.lost > 2.6) { g.state = 'search'; g.t = 0; } }
        inp = route(nav, a, g.last);
        if (!sees && a.mode === 'floor' && a.floor === g.last.floor && Math.abs(a.x - g.last.x) < 12) { g.state = 'search'; g.t = 0; }
      } else if (g.state === 'investigate') {
        speed = 150 * gs; clip = 'walk'; clipSpeed = 1.4;
        inp = route(nav, a, g.last);
        if ((a.mode === 'floor' && a.floor === g.last.floor && Math.abs(a.x - g.last.x) < 14) || g.t > 9) { g.state = 'search'; g.t = 0; }
      } else if (g.state === 'search') {
        if (g.t > 1.5) g.state = 'patrol';
      } else {
        clip = 'walk';
        const home = nav.byId[g.def.floor];
        if (a.mode === 'floor' && a.floor === home) {
          if (a.x <= g.def.x0) g.dir = 1;
          if (a.x >= g.def.x1) g.dir = -1;
          inp = { mx: g.dir, my: 0 };
        } else inp = route(nav, a, { x: g.def.x, floor: home });
      }
      stepAgent(nav, a, inp, dt, { run: speed, climb: 150 * gs, rope: 0, grav: ROAM.grav, xMin: ROAM.xMin, xMax: ROAM.guardMaxX, canRope: false, canFall: false });
      if (a.blocked && g.state === 'patrol') g.dir *= -1;
      // can see him but cannot get to him (end of the beat, or he is out on a clothesline): give up and look around
      g.stuck = g.state === 'chase' && !a.moving && a.mode === 'floor' ? (g.stuck || 0) + dt : 0;
      if (g.stuck > ROAM.giveUp) { g.state = 'search'; g.t = 0; g.stuck = 0; g.blind = ROAM.blind; }
      if (a.mode === 'ladder') { clip = 'climb'; clipSpeed = a.climb ? 1 : 0; }
      else if (!a.moving && clip !== 'idle') clip = 'idle';

      if (a.mode === 'floor') {
        // wider than a guard's reach, so standing on your own slick is safe
        const i = slicks.findIndex(s => s.floor === a.floor && Math.abs(s.x - a.x) < 46);
        if (i >= 0) {
          scene.remove(slicks[i].mesh); slicks.splice(i, 1);
          g.state = 'stun'; g.t = 0; g.dur = ROAM.stun;
          g.rig.play('slip', 0.06, 1, true);
          burst(a.x, a.h + 30, 10, 8, 0x3f4558, 220, 9);
          sfx.slip(); shake = Math.max(shake, 4);
          clip = null;
        }
      }
      if (g.state === 'chase' && where === 'roam' && !inCan && rc.invuln <= 0 && spawnGrace <= 0 && Math.abs(ra.x - a.x) < 38 && Math.abs(ra.h - a.h) < 80) { caught(g); clip = null; }
    }
    if (clip) g.rig.play(clip, 0.18, clipSpeed);
    if (state !== 'paused') g.rig.update(dt);
    const want = a.mode === 'ladder' ? FACE_IN : a.face > 0 ? FACE_RIGHT : FACE_LEFT;
    g.faceY = angleDamp(g.faceY, want, 10, dt);
    g.root.rotation.y = g.faceY;
    g.outer.position.set(a.x, a.h, a.mode === 'ladder' ? -18 : 2);
    const hot = g.state === 'chase', curious = g.state === 'investigate' || g.state === 'search';
    g.bang.visible = hot || curious;
    g.bang.scale.setScalar(hot ? 1.3 : 0.9);
    g.bang.lookAt(camera.position.x, g.bang.getWorldPosition(_v).y, camera.position.z);
    g.bangMat.color.setRGB(hot ? 3 : 2.6, hot ? 0.7 : 2.1, 0.5);
  }
  chased = anyChase;
}

function updateMaze(dt) {
  trapCool = Math.max(0, trapCool - dt);
  for (const c of maze.cans) {
    c.hideAmt = damp(c.hideAmt, c === inCan ? 1 : 0, 12, dt);
    if (!c.loot.length && state === 'play') { c.refill -= dt; if (c.refill <= 0) { c.loot = c.full.slice(); c.show(); } }
  }
  for (let i = slicks.length - 1; i >= 0; i--) {
    const s = slicks[i];
    if (state === 'play') s.life -= dt;
    s.mesh.scale.setScalar(Math.min(1, s.life / 0.6));
    if (s.life <= 0) { scene.remove(s.mesh); slicks.splice(i, 1); }
  }
  for (const l of maze.lamps) { l.light.intensity = 420 * world.night; l.bulb.visible = world.night > 0.2; }
  updateGuards(dt);
  maze.update(dt, time);
  const n = Math.min(sack.length, 10);
  sackM.visible = n > 0 && where === 'roam';
  sackM.scale.setScalar(0.55 + n * 0.11);
  const perch = where === 'perch' && state === 'play';
  raidBtn.hidden = !perch;
  trapBtn.hidden = !(where === 'roam' && state === 'play');
  trapBtn.classList.toggle('cool', trapCool > 0);
  hideBtn.classList.toggle('active', where === 'roam' ? !!inCan : rc.hide > 0.5);
}


function workerAnim() {
  const r = wk.rig, sp = level.speed / 170;
  if (wk.react === 'spot') return r.play('spot', 0.12);
  if (wk.react === 'throw') return null;
  switch (wk.state) {
    case 'emerge': case 'out': return r.play(wk.carrying ? 'carryWalk' : 'walk', 0.2, sp);
    case 'lob': case 'slip': return null;
    case 'linger': return r.play('idle', 0.3);
    case 'return': case 'enter': return r.play('walk', 0.25, sp);
    default: return r.play(wk.carrying ? 'carryIdle' : 'idle', 0.3);
  }
}

function updateWorker(dt) {
  const base = level, playing = state === 'play';
  const L = dayK === 1 ? base : { ...base, speed: base.speed * dayK, interval: base.interval / dayK, spot: base.spot / dayK };
  let doorOpen = wk.state !== 'idle' && wk.state !== 'warn';
  let moving = false;
  wk.cool = Math.max(0, wk.cool - dt);
  const canMove = playing && wk.react === null;

  if (wk.state === 'idle') {
    if (playing) { wk.timer -= dt; if (wk.timer <= 0) { wk.state = 'warn'; wk.timer = 1.6; sfx.door(); } }
  } else if (wk.state === 'warn') {
    if (playing) wk.timer -= dt;
    doorOpen = wk.timer < 0.7;
    if (wk.timer <= 0) {
      Object.assign(wk, { state: 'emerge', x: DOOR_X, z: -300, face: FACE_OUT, faceTo: FACE_OUT, col: pickColumn(), alert: 0 });
      wk.type = rand(0, 1) < L.crates ? 'crate' : rand(0, 1) < 0.3 ? 'small' : 'box';
      setCarry(wk.type);
      wk.outer.visible = true;
    }
  } else if (wk.state === 'emerge') {
    wk.faceTo = FACE_OUT;
    if (canMove) { wk.z = Math.min(DOCK_Z, wk.z + L.speed * dt); moving = true; }
    if (wk.z >= DOCK_Z) wk.state = 'out';
  } else if (wk.state === 'out') {
    wk.faceTo = FACE_LEFT;
    if (canMove) { wk.x = Math.max(STAND_X, wk.x - L.speed * dt); moving = true; }
    if (wk.x <= STAND_X) {
      if (wk.carrying) { wk.state = 'lob'; wk.timer = 0; wk.lobbed = false; wk.rig.play('lob', 0.12, 1, true); }
      else { wk.state = 'linger'; wk.timer = 1.0 + L.linger; }
    }
  } else if (wk.state === 'lob') {
    wk.faceTo = FACE_LEFT;
    if (canMove) wk.timer += dt;
    if (!wk.lobbed && wk.timer >= 0.55) {
      wk.lobbed = true;
      const from = wk.carry.getWorldPosition(_v).clone();
      fly(wk.type, { x: from.x, y: from.y, z: from.z }, { x: wk.col, y: G - columnTop(wk.col) + 40, z: 0 }, 0.75, 120, 'place');
      setCarry(null);
    }
    if (wk.timer >= 0.95) { wk.state = 'linger'; wk.timer = 1.0 + L.linger; }
  } else if (wk.state === 'linger') {
    wk.faceTo = FACE_LEFT;
    if (canMove) wk.timer -= dt;
    if (wk.timer <= 0) wk.state = 'return';
  } else if (wk.state === 'return') {
    wk.faceTo = FACE_RIGHT;
    if (canMove) { wk.x = Math.min(DOOR_X, wk.x + L.speed * dt); moving = true; }
    if (wk.x >= DOOR_X) wk.state = 'enter';
  } else if (wk.state === 'enter') {
    wk.faceTo = FACE_IN;
    if (canMove) { wk.z = Math.max(-300, wk.z - L.speed * dt); moving = true; }
    if (wk.z <= -300) { wk.state = 'idle'; wk.timer = L.interval; wk.outer.visible = false; setCarry(null); }
  }

  const watching = playing && ['emerge', 'out', 'lob', 'linger'].includes(wk.state);
  const exposed = where === 'perch' && rc.hide < 0.6 && rac.outer.visible;
  if (peel.on && playing && wk.state === 'out' && Math.abs(wk.x - peel.x) < 34) {
    // stepped on a banana peel: drops the box and goes back inside
    peel.on = false; peel.mesh.visible = false;
    if (wk.carrying) { burst(wk.x, DOCK_Y + 150, DOCK_Z, 9, SPEC[wk.type].color, 240, 12); setCarry(null); }
    wk.state = 'slip'; wk.timer = 2.2; wk.react = null; wk.alert = 0;
    wk.rig.play('slip', 0.06, 1, true);
    sfx.slip();
  }
  if (wk.state === 'slip') { if (playing) wk.timer -= dt; if (wk.timer <= 0) wk.state = 'return'; }
  if (watching && exposed) {
    wk.alert = Math.min(1, wk.alert + dt / L.spot);
    if (!spottedLatch) { spottedLatch = true; sfx.spotted(); }
  } else {
    wk.alert = Math.max(0, wk.alert - dt * 1.6);
    if (wk.alert === 0) spottedLatch = false;
  }
  if (wk.react === null && watching && wk.alert > 0.3 && wk.state !== 'lob') { wk.react = 'spot'; wk.faceTo = FACE_LEFT; }
  if (wk.react === 'spot' && (!watching || (!exposed && wk.alert < 0.1))) wk.react = null;
  if (wk.react === 'spot' && wk.alert >= 1 && wk.cool <= 0) {
    wk.react = 'throw'; wk.reactT = 0; wk.released = false;
    if (wk.carrying) { setGrab(wk.type); setCarry(null); } else setGrab('small');
    wk.rig.play('throw', 0.08, 1, true);
  }
  if (wk.react === 'throw' && playing) {
    wk.reactT += dt;
    if (!wk.released && wk.reactT >= 0.36) {
      wk.released = true;
      const from = wk.grab.getWorldPosition(_v).clone();
      fly(wk.grabType || 'small', { x: from.x, y: from.y, z: from.z }, ATTACK_TARGET, level.flight, 170, 'attack');
      setGrab(null);
    }
    if (wk.reactT >= 0.65) { wk.react = null; wk.alert = 0.25; wk.cool = 2.2; if (wk.state === 'lob') { wk.state = 'linger'; wk.timer = 1 + L.linger; } }
  }
  wk.watching = watching;

  if (wk.outer.visible) {
    if (!playing && state !== 'paused') wk.rig.play('idle', 0.3);
    else workerAnim();
    if (state !== 'paused') wk.rig.update(dt);
    wk.face = angleDamp(wk.face, wk.faceTo, 9, dt);
    wk.root.rotation.y = wk.face;
    wk.outer.position.set(wk.x, DOCK_Y, wk.z);
    const a = wk.alert;
    wk.bang.visible = a > 0.05 || wk.react === 'throw';
    wk.bang.scale.setScalar(0.7 + a * 0.9);
    wk.bang.lookAt(camera.position.x, wk.bang.getWorldPosition(_v).y, camera.position.z);
    wk.bangMat.color.setRGB(a > 0.7 ? 3 : 2.6, a > 0.7 ? 0.7 : 2.1, a > 0.7 ? 0.5 : 0.5);
  }

  wk.door += clamp((doorOpen ? 1 : 0) - wk.door, -dt * 3, dt * 3);
  world.setDoor(wk.door, wk.state === 'warn' ? 'warn' : watching ? 'hot' : doorOpen ? 'on' : 'off');
}

// ---------- raccoon ----------
const tipA = new THREE.Vector3(), tipB = new THREE.Vector3(), gripW = new THREE.Vector3(), pouchW = new THREE.Vector3();

function updateRaccoon(dt) {
  const g = rac.outer, rig = rac.rig, J = rac.J;
  rc.invuln = Math.max(0, rc.invuln - dt);
  spawnGrace = Math.max(0, spawnGrace - dt);
  rc.modeT += dt;
  world.canLid.rotation.z = damp(world.canLid.rotation.z, 0, 8, dt);

  if (state === 'winning' || state === 'won') {
    endT += dt;
    band.setVisible(false);
    rac.sling.group.visible = false;
    g.visible = true;
    g.rotation.set(0, 0, 0);
    if (state === 'won') {
      g.visible = false;
    } else if (endT >= 5.3) {
      // full and happy: off to the right, toward the next meal
      rig.play('run', 0.1, 1.2);
      g.scale.setScalar(RS);
      g.position.set(lerp(1290, 1900, (endT - 5.3) / 1.3), 0, 80);
      rac.root.rotation.y = angleDamp(rac.root.rotation.y, -0.2, 12, dt);
      if (endT >= 6.6) { state = 'won'; sfx.win(); showWin(); }
    } else if (endT >= 4.7) {
      rig.play('leap', 0.06);
      const k = (endT - 4.7) / 0.6;
      g.scale.setScalar(RS * lerp(0.85, 1, k));
      g.position.set(lerp(1050, 1290, k), lerp(112, 0, k) + Math.sin(k * Math.PI) * 150, lerp(0, 80, k));
      rac.root.rotation.y = angleDamp(rac.root.rotation.y, -0.2, 10, dt);
    } else if (endT >= 2.2) {
      // eating while the clock runs six hours ahead
      rig.play('cheer', 0.2);
      g.position.set(1050, 112 + Math.sin(time * 9) * 3, 0);
      g.scale.setScalar(RS * 0.85);
      rac.root.rotation.y = angleDamp(rac.root.rotation.y, -0.9, 6, dt);
      const k = clamp((endT - 2.4) / 2.1, 0, 1), before = Math.floor(hourNow);
      hourNow = level.hour + 6 * smooth(k);
      world.setTime(hourNow);
      if (Math.floor(hourNow) !== before) sfx.tick();
      if (Math.floor(endT * 5) !== Math.floor((endT - dt) * 5) && k < 1) { burst(1050 + rand(-40, 40), 180, 10, 2, 0xf2c14e, 150, 7); sfx.munch(); }
    } else if (endT < 1.0) {
      rig.play('run', 0.15);
      const k = endT / 1.0;
      g.position.set(lerp(STAND.x, 880, k), 0, lerp(STAND.z, 10, k));
      rac.root.rotation.y = angleDamp(rac.root.rotation.y, -0.2, 8, dt);
    } else if (endT < 1.65) {
      rig.play('leap', 0.06);
      const k = (endT - 1.0) / 0.65;
      g.position.set(lerp(880, 1050, k), lerp(0, 175, k) + Math.sin(k * Math.PI) * 190, lerp(10, 0, k));
      g.rotation.z = -smooth(k) * Math.PI * 2;
    } else {
      const k = (endT - 1.65) / 0.55;
      g.position.set(1050, lerp(175, 60, k), 0);
      g.scale.setScalar(RS * lerp(1, 0.85, k));
      if (!rc.splashed && k > 0.3) { rc.splashed = true; burst(1050, 190, 0, 14, 0xf2c14e, 320, 10); burst(1050, 190, 0, 8, 0x3b4052, 260, 12); }
    }
    rig.update(dt);
    return;
  }
  if (state === 'lost') {
    endT += dt;
    band.setVisible(false);
    rac.sling.group.visible = false;
    g.visible = true;
    rig.play('flee', 0.12);
    rac.root.rotation.y = angleDamp(rac.root.rotation.y, Math.PI + 0.45, 10, dt);
    g.position.x -= 520 * dt;
    g.position.y = 0;
    rig.update(dt);
    if (endT > 1.1 && !overlay.classList.contains('show')) showLose();
    return;
  }
  if (state === 'paused') return;

  if (where === 'roam') {
    band.setVisible(false);
    rac.sling.group.visible = false;
    g.scale.setScalar(RS);
    g.rotation.set(0, 0, 0);
    g.visible = !inCan && (rc.invuln <= 0 || Math.sin(time * 40) > -0.3);
    if (rc.mode === 'hit' && rc.modeT > 0.62) rc.mode = 'stand';
    let y = ra.h, z = 24, faceY = ra.face > 0 ? -0.3 : Math.PI + 0.3, lineY = 0;
    if (ra.mode === 'rope') {
      lineY = ra.rope.h + ROPE_UP - ropeSag(ra.rope, ra.x);
      y = lineY - 142; z = 34;
      if (ra.moving) rc.ropePh += dt * 9;
      rig.play('hang', 0.12, ra.moving ? 1.5 : 0.45);
    } else if (rc.mode === 'hit') { /* keep the hit reaction */ }
    else if (ra.mode === 'ladder') { rig.play('climb', 0.1, ra.climb ? 1.25 : 0); faceY = Math.PI / 2; z = -8; }
    else if (ra.mode === 'fall') rig.play('fall', 0.08);
    else if (rumCan) { rig.play('rummage', 0.1); faceY = rumCan.x >= ra.x ? -0.5 : Math.PI + 0.5; z = 26; }
    else if (ra.moving) rig.play('run', 0.1, 1.15);
    else rig.play('idle', 0.15);
    rac.root.rotation.y = angleDamp(rac.root.rotation.y, faceY, 14, dt);
    g.position.set(ra.x, y, z);
    rig.update(dt);
    const vx = (g.position.x - rc.lastX) / Math.max(dt, 1e-4);
    rc.lastX = g.position.x;
    rc.tailV += (-(rc.tailA + clamp(vx, -400, 400) * 0.0012) * 60 - rc.tailV * 9) * dt;
    rc.tailA += rc.tailV * dt;
    for (let i = 0; i < 5; i++) J['tail' + i].rotateZ(rc.tailA * (0.3 + i * 0.2));
    rc.blink -= dt;
    if (rc.blink < -0.12) rc.blink = rand(1.5, 4);
    rac.eyes.scale.y = rc.blink < 0 ? 0.12 : 1;
    if (ra.mode === 'rope') {
      // hand over hand along the line
      g.updateMatrixWorld(true);
      const s = Math.sin(rc.ropePh) * 13;
      pouchW.set(ra.x + 12 + s, ra.rope.h + ROPE_UP - ropeSag(ra.rope, ra.x + 12 + s) + 1, z);
      ik2(J.uarmR, J.farmR, J.handR, pouchW, -1);
      gripW.set(ra.x - 12 - s, ra.rope.h + ROPE_UP - ropeSag(ra.rope, ra.x - 12 - s) + 1, z);
      ik2(J.uarmL, J.farmL, J.handL, gripW, -1);
    }
    return;
  }

  const want = hideHeld() && state === 'play' ? 1 : 0;
  if (want && rc.mode !== 'duck') { rc.mode = 'duck'; rc.modeT = 0; rig.play('duck', 0.1, 1, true); sfx.duck(); aim = null; }
  if (!want && rc.mode === 'duck') { rc.mode = 'pop'; rc.modeT = 0; rig.play('pop', 0.08, 1, true); }
  if (rc.mode === 'pop' && rc.modeT > 0.32) { rc.mode = 'stand'; rig.play('idle', 0.2); }
  if (rc.mode === 'release' && rc.modeT > 0.5) { rc.mode = 'stand'; rig.play('idle', 0.25); }
  if (rc.mode === 'hit' && rc.modeT > 0.62) { rc.mode = 'stand'; rig.play('idle', 0.25); }
  if (rc.mode === 'stand' && rig.name !== 'idle') rig.play('idle', 0.2);

  rc.hide += clamp(want - rc.hide, -dt / 0.2, dt / 0.16);
  const h = smooth(rc.hide);
  rc.offX = Math.abs(rc.offX) < 1 ? 0 : damp(rc.offX, 0, 12, dt);
  g.position.set(lerp(STAND.x, HIDE_POS.x, h) + rc.offX, lerp(STAND.y, HIDE_POS.y, h) + Math.sin(h * Math.PI) * 50, lerp(STAND.z, HIDE_POS.z, h));
  g.scale.setScalar(RS * lerp(1, 0.92, h));
  g.rotation.set(0, 0, 0);
  rac.root.rotation.y = angleDamp(rac.root.rotation.y, lerp(-0.45, -1.1, h), 12, dt);
  g.visible = rc.invuln <= 0 || Math.sin(time * 40) > -0.3;

  rig.update(dt);

  const pull = pullFrac();
  rc.aimW = damp(rc.aimW, aim ? pull : 0, aim ? 30 : 14, dt);
  if (rc.mode === 'stand') rig.blend(rac.windup, rc.aimW);

  // Secondary motion: tail swings against the body's sideways speed.
  const vx = (g.position.x - rc.lastX) / Math.max(dt, 1e-4);
  rc.lastX = g.position.x;
  rc.tailV += (-(rc.tailA + vx * 0.0015) * 60 - rc.tailV * 9) * dt;
  rc.tailA += rc.tailV * dt;
  for (let i = 0; i < 5; i++) J['tail' + i].rotateZ(rc.tailA * (0.3 + i * 0.2) + Math.sin(time * 2.1 + i * 0.7) * 0.03);
  rc.blink -= dt;
  if (rc.blink < -0.12) rc.blink = rand(1.5, 4);
  rac.eyes.scale.y = rc.blink < 0 ? 0.12 : lerp(1, 0.6, rc.aimW);

  const slingOn = h < 0.35 && rc.mode !== 'duck';
  rac.sling.group.visible = slingOn;
  g.updateMatrixWorld(true);
  if (slingOn) {
    rac.sling.grip.getWorldPosition(gripW);
    ik2(J.uarmL, J.farmL, J.handL, gripW, -1);
    if (rc.mode !== 'hit') {
      pouchW.set(pouch.x, pouch.wy, LAUNCH.z);
      ik2(J.uarmR, J.farmR, J.handR, pouchW, -1);
    }
  }

  // Pouch: follows the drag, otherwise springs back past the fork and settles.
  if (!aim) {
    const ax = -(pouch.x - REST.x) * 420 - pouch.vx * 18, ay = -(pouch.wy - REST.wy) * 420 - pouch.vy * 18;
    pouch.vx += ax * dt; pouch.vy += ay * dt;
    pouch.x += pouch.vx * dt; pouch.wy += pouch.vy * dt;
  }
  band.setVisible(slingOn);
  if (slingOn) {
    rac.sling.tipA.getWorldPosition(tipA);
    rac.sling.tipB.getWorldPosition(tipB);
    pouchW.set(pouch.x, pouch.wy, LAUNCH.z);
    band.update(tipA, tipB, pouchW, pullFrac());
  }
}

function updateAimVisuals() {
  const show = state === 'play' && where === 'perch' && !!held && rc.hide < 0.25 && throwCool <= 0 && rc.mode !== 'hit' && rac.sling.group.visible;
  if (held) held.visible = show;
  stashPile.visible = state === 'play' || state === 'paused' || state === 'menu';
  if (show) {
    held.position.set(pouch.x + 2, pouch.wy + 2, LAUNCH.z + 6);
    held.rotation.z = aim ? -0.4 : Math.sin(time * 2) * 0.1;
  }
  const active = show && aim && pullAmount() >= MIN_PULL;
  let x = pouch.x, y = G - pouch.wy;
  let v = active ? launchVelocity(pouch) : null, alive = !!active;
  for (let i = 0; i < dots.length; i++) {
    if (alive) {
      for (let s = 0; s < 3; s++) { v.x *= 1 - AIR; v.y = v.y * (1 - AIR) + GRAV; x += v.x; y += v.y; }
      if (y > G - 6) alive = false;
    }
    dots[i].visible = alive;
    if (alive) dots[i].position.set(x, G - y, lerp(LAUNCH.z, 0, i / dots.length));
  }
}

function updateProjectiles(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const o = projs[i], p = o.body.position;
    o.age += dt;
    o.z = damp(o.z, 0, 6, dt);
    if (o.hitAt && o.body.speed < 0.4) o.still += dt;
    const gone = p.x < -300 || p.x > 1700 || p.y > G + 300;
    if (gone || o.age > 10 || (o.hitAt && time - o.hitAt > 3.2) || o.still > 0.8) {
      if (!gone && o.type === 'banana' && p.x > STAND_X - 90 && p.x < DOOR_X + 60) {
        // a peel that lands by the back door waits for the stocker
        peel.on = true; peel.x = clamp(p.x, STAND_X + 6, DOOR_X - 6);
        peel.mesh.position.set(peel.x, DOCK_Y + 6, DOCK_Z + 20);
        peel.mesh.visible = true;
      } else if (!gone) burst(p.x, G - p.y, 0, 5, 0xdfe3ee, 110, 8, 0);
      removeObj(projs, o);
    }
  }
  if (trailProj && projs.includes(trailProj) && !trailProj.hitAt && trailIdx < trail.length) {
    if (++trailTick % 3 === 0) {
      const d = trail[trailIdx++], p = trailProj.body.position;
      d.position.set(p.x, G - p.y, trailProj.z);
      d.visible = true;
    }
  }
  for (let i = boxes.length - 1; i >= 0; i--) {
    const o = boxes[i], p = o.body.position;
    if (p.x < 380 || p.x > 1700 || p.y > G + 300) {
      burst(p.x, G - p.y, 0, 6, SPEC[o.type].color, 180, 10);
      removeObj(boxes, o);
    }
  }
}

function syncMeshes() {
  for (const o of boxes) { o.mesh.position.set(o.body.position.x, G - o.body.position.y, 0); o.mesh.rotation.z = -o.body.angle; }
  for (const o of projs) { o.mesh.position.set(o.body.position.x, G - o.body.position.y, o.z); o.mesh.rotation.z = -o.body.angle; }
}

function updateParticles(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1); continue; }
    p.vy -= p.grav * dt;
    p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
    if (p.m.position.y < 4) { p.m.position.y = 4; p.vy *= -0.35; p.vx *= 0.6; }
    p.m.rotation.x += p.spin * dt; p.m.rotation.z += p.spin * dt;
    p.m.scale.setScalar(p.size * Math.min(1, p.life / 0.3));
  }
}

// ---------- HUD ----------
const hud = {};
function setText(id, text) { if (hud[id] !== text) { hud[id] = text; $(id).textContent = text; } }
function setClass(id, cls) { if (hud[id + '.c'] !== cls) { hud[id + '.c'] = cls; $(id).className = cls; } }

function updateHud(n) {
  setText('lvl', 'Day ' + day + ' · ' + clock(hourNow) + ' · ' + level.name);
  const hk = 'h' + hearts;
  if (hud.hearts !== hk) {
    hud.hearts = hk;
    $('hearts').innerHTML = [1, 2, 3].map(i => '<span class="' + (i <= hearts ? '' : 'off') + '">&#9829;</span>').join('');
    $('hearts').setAttribute('aria-label', hearts + ' of 3 hearts');
  }
  setText('blockers', 'Boxes blocking: ' + n);
  setText('throws', 'Throws: ' + throws + ' (par ' + level.par + ')');
  let cls = '', text = '';
  if (state === 'play' && where === 'roam') {
    if (inCan) { cls = 'calm'; text = 'Shh...'; }
    else if (chased) { cls = 'danger'; text = 'Spotted! Run!'; }
    else if (rumCan) { cls = 'calm'; text = 'Digging...'; }
    else if (wk.state === 'warn' || wk.watching) { cls = 'warn'; text = 'They are restocking the boxes!'; }
  } else if (state === 'play') {
    if (wk.state === 'warn') { cls = 'warn'; text = 'Back door opening!'; }
    else if (wk.watching && rc.hide < 0.6) { cls = 'danger'; text = 'Spotted! Hide!'; }
    else if (wk.watching) { cls = 'calm'; text = 'Stay hidden...'; }
    else if (wk.state === 'return' || wk.state === 'enter') { cls = 'safe'; text = 'Coast is clear'; }
  } else if (state === 'winning' && endT >= 2.2) { cls = 'safe'; text = clock(hourNow); }
  setText('banner', text);
  setClass('banner', cls);
  const digging = where === 'roam' && rumCan;
  setClass('watch', (where === 'perch' && wk.watching) || digging ? 'on' : '');
  $('watchBar').style.width = Math.round((digging ? rumT / ROAM.rummage : wk.alert) * 100) + '%';
  const now = curAmmo(), next = nextAmmo(), key = where + '|' + now + '|' + next + '|' + stash.length + '|' + sack.length;
  if (hud.ammo !== key) {
    hud.ammo = key;
    const more = stash.length > 1 ? ' +' + (stash.length - 1) + ' in the stash' : '';
    $('ammoLine').innerHTML = where === 'roam'
      ? 'Sack: <b>' + sack.length + '</b> ' + (sack.length ? '(' + sack.map(t => AMMO[t].name.toLowerCase()).slice(-3).join(', ') + ')' : 'empty') + '. Haul it back to the slingshot.'
      : now ? 'Loaded: <b>' + AMMO[now].name + '</b>. ' + AMMO[now].hint + more
      : '<b>Out of trash!</b> ' + (TOUCH ? 'Tap RAID' : 'Run left (A)') + ' and dig through the cans.';
  }
  setText('hint', liveFish() ? 'Tap now to split the fish bones!'
    : where === 'roam' ? (nearCan(38) && nearCan(38).loot.length && !rumCan ? 'Stand still to dig.'
      : !(taught & 16) ? (TOUCH ? 'TRAP' : 'E') + ' rips a bag open to trip a guard. ' + (TOUCH ? 'HIDE' : 'SPACE') + ' by a can hides you.' : '')
    : !now ? ''
    : !(taught & 1) ? 'Pull the slingshot back and let go.'
    : !(taught & 2) ? HIDE_HOW + ' to duck into the can.'
    : !(taught & 4) ? (TOUCH ? 'RAID' : 'A or the RAID button') + ' sends you out for more trash.' : '');
}

// ---------- camera ----------
function resize() {
  const w = wrap.clientWidth || window.innerWidth, h = wrap.clientHeight || window.innerHeight;
  view.resize(w, h);
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  cam.D = Math.max(1500 / (2 * t * camera.aspect), 800 / (2 * t));
  cam.aspect = camera.aspect;
  placeCamera(0);
}
function placeCamera(dt) {
  let tx = 0, tz = aim ? 1 + 0.035 * (pullFrac()) : 1, ty = 0, rate = 2.4;
  const p = projs[projs.length - 1];
  const roaming = where === 'roam' && (state === 'play' || state === 'paused' || state === 'lost');
  if (roaming) {
    // on foot the camera closes in and follows him through the maze
    tz = cam.aspect < 1 ? 0.5 : cam.aspect < 1.5 ? 0.7 : 0.84;
    const half = 750 * tz;
    tx = clamp(ra.x + ra.face * 70 - 672, -1700 + half - 672, 0);
    ty = clamp(ra.h - 150, 0, 440) * 0.8;
    rate = 5;
  } else if (state === 'winning' && endT >= 5.3) {
    // he keeps running after the meal; let the camera chase him out instead of holding still
    tx = clamp(rac.outer.position.x - 745, 0, 900);
    rate = 3.2;
  } else if (!aim && p && (!p.hitAt || time - p.hitAt < 0.9) && p.age < 4) tx = clamp((p.body.position.x - 760) * 0.2, -30, 110);
  if (dt > 0) { cam.off = damp(cam.off, tx, rate, dt); cam.zoom = damp(cam.zoom, tz, 5, dt); cam.up = damp(cam.up, ty, 4, dt); }
  if (closeUp) {
    camera.position.set(closeUp.x - 40, closeUp.y + closeUp.D * 0.08, closeUp.D);
    camera.lookAt(closeUp.x, closeUp.y, 0);
    return;
  }
  const D = cam.D * cam.zoom, sx = rand(-1, 1) * shake, sy = rand(-1, 1) * shake;
  camera.position.set(600 + cam.off + sx, 250 + D * 0.1 + sy + cam.up, D);
  camera.lookAt(745 + cam.off + sx * 0.5, 235 + sy * 0.5 + cam.up, 0);
}
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

// ---------- main loop ----------
function update(dt) {
  if (state === 'paused') { raidBtn.hidden = trapBtn.hidden = true; placeCamera(dt); return; }
  time += dt;
  if (state === 'play') levelTime += dt;
  throwCool = Math.max(0, throwCool - dt);
  if (hideHeld()) aim = null;

  Engine.update(engine, STEP_MS);
  afterStep();

  updateWorker(dt);
  updateResidents(dt);
  updateFlying(dt);
  if (where === 'perch' && state === 'play' && moveInput().mx < 0 && !aim) goRoam();
  if (where === 'roam' && (state === 'play' || state === 'lost')) updateRoam(dt);
  updateMaze(dt);
  updateRaccoon(dt);
  updateProjectiles(dt);
  syncMeshes();
  updateAimVisuals();
  updateParticles(dt);
  world.update(dt, time);

  const n = blockers();
  if (state === 'play') {
    clearT = n === 0 && levelTime > 1 ? clearT + dt : 0;
    if (clearT > 0.8) {
      state = 'winning';
      endT = 0;
      rc.splashed = false;
      aim = null;
      where = 'perch'; inCan = null; rc.offX = 0; endStick();
      for (const f of flying) scene.remove(f.mesh);
      flying.length = 0;
    }
  }
  world.zoneBars.visible = state === 'play' || state === 'menu' || state === 'paused';
  const pulse = Math.sin(time * 5) > 0;
  world.zoneMat.color.setRGB(2.4, pulse ? 2.0 : 1.4, pulse ? 0.9 : 0.5);
  updateHud(n);
  shake = Math.max(0, shake - dt * 40);
  placeCamera(dt);
}

// Fixed 60 Hz simulation with catch-up, so slow devices keep real-time speed instead of slow motion.
const MAX_CATCHUP = 15;
let last = performance.now(), lag = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.max(0, Math.min(0.25, (now - last) / 1000));
  last = now;
  if (!running) return;
  lag += real;
  let n = 0;
  while (lag >= STEP && n < MAX_CATCHUP) { update(STEP); lag -= STEP; n++; }
  if (n === MAX_CATCHUP) lag = 0;
  view.watch(real);
  view.render(real, time);
  frames++;
}

// ---------- test hooks ----------
if (TEST) {
  const api = {
    time: () => time,
    danger: () => ['warn', 'emerge', 'out', 'lob', 'linger'].includes(wk.state) || flying.some(f => f.kind === 'attack') || wk.react !== null,
    setHide: v => { hideKey = v; },
    canAim,
    hideAmount: () => rc.hide,
    busy: () => projs.some(o => !o.hitAt && o.age < 5) || boxes.some(o => o.body.speed > 1.2) || flying.some(f => f.kind !== 'residentDump'),
    boxes: () => boxes.filter(o => !o.dead).map(o => {
      const b = o.body.bounds, p = o.body.position;
      return { minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, top: b.min.y, blocking: p.x > ZONE.x0 && p.x < ZONE.x1 && p.y > ZONE.top, type: o.type };
    }),
    statics: () => STATICS,
    ammo: () => AMMO[curAmmo()],
    constrain: constrainPouch,
    velocity: launchVelocity,
    fireDrag(dx, dy) {
      const c = constrainPouch(dx, dy);
      pouch.x = c.x; pouch.wy = c.wy;
      fire();
    },
    // the maze
    get nav() { return nav; }, perchX: PERCH_X,
    where: () => where, agent: () => ra, sack: () => sack, stash: () => stash, cans: () => maze.cans,
    guards: () => guards.filter(g => g.active),
    residents: () => residents.map(r => ({ floor: r.floor.id, x: r.x, state: r.state })),
    inCan: () => !!inCan, trapReady: () => trapCool <= 0,
    setMove: m => { botMove = m; }, trap: dropSlick, raid: goRoam, route: t => route(nav, ra, t),
    hearts: () => hearts, slicks: () => slicks,
  };
  const step = sec => { for (let t = 0; t < sec - 1e-9; t += STEP) update(STEP); };
  window.TPH = {
    ready: true,
    artReady,
    hasRaccoonSkin: () => rac.root.children.some(mesh => mesh.isSkinnedMesh && mesh.skeleton.bones.includes(rac.J.chest)),
    renderStats: () => ({ ...view.renderer.info.render, ...view.renderer.info.memory }),
    get frames() { return frames; },
    run(v) { running = v; last = performance.now(); lag = 0; },
    step,
    seed: n => seedRandom(n),
    start: i => startLevel(i),
    info: () => ({
      state, level: levelIdx, hearts, throws, blockers: blockers(), worker: wk.state, react: wk.react, alert: +wk.alert.toFixed(2),
      boxes: boxes.length, projs: projs.length, levelTime: +levelTime.toFixed(2), hide: +rc.hide.toFixed(2), aiming: !!aim,
      pull: +(pullFrac()).toFixed(2), canAim: canAim(), mode: rc.mode, muted: isMuted(), quality: view.quality,
      overlay: overlay.classList.contains('show') ? (overlay.querySelector('h1') || {}).textContent : null,
      where, x: +ra.x.toFixed(1), h: +ra.h.toFixed(1), move: ra.mode, floor: ra.floor ? ra.floor.id : null,
      sack: sack.length, stash: stash.length, loaded: curAmmo(), inCan: !!inCan, slicks: slicks.length, trapCool: +trapCool.toFixed(2),
      cans: maze.cans.map(c => c.loot.length), day, hour: +hourNow.toFixed(2), night: +world.night.toFixed(2),
      guards: guards.filter(g => g.active).map(g => ({ x: +g.a.x.toFixed(1), h: +g.a.h.toFixed(1), state: g.state, move: g.a.mode })),
    }),
    setAmmo: t => { ammoOverride = t; showStash(); },
    setStash: list => { stash = list.slice(); showStash(); },
    hide: v => { hideKey = v; },
    fireDrag: (dx, dy) => api.fireDrag(dx, dy),
    forceWin() { for (const o of boxes.slice()) removeObj(boxes, o); },
    forceLose() { hearts = 1; hurtRaccoon(); },
    // maze helpers: put the raccoon or a guard somewhere, steer without a keyboard
    warp(x, floorId) { where = 'roam'; aim = null; inCan = null; Object.assign(ra, newAgent(nav, x, floorId)); rc.invuln = 0; spawnGrace = 0; },
    move(mx, my) { botMove = mx || my ? { mx, my } : null; },
    raid: () => goRoam(),
    // also snaps the camera home instantly: it only drifts back over real time otherwise, which
    // left pouchScreen() answering for a frame the camera hadn't caught up to yet.
    toPerch() { Object.assign(ra, newAgent(nav, RAC_X, 'g')); enterPerch(); cam.off = 0; cam.zoom = 1; cam.up = 0; placeCamera(0); },
    trap: () => dropSlick(),
    guard(i, x, floorId, face = 1) {
      const g = guards[i];
      g.active = true; g.outer.visible = true;
      Object.assign(g, { a: newAgent(nav, x, floorId), state: 'patrol', t: 0, lost: 0, dir: face, blind: 0, stuck: 0 });
      g.a.face = face;
    },
    // also keeps the window neighbours indoors, so a test can count what is in the cans
    guardsOff() {
      for (const g of guards) { g.active = false; g.outer.visible = false; }
      for (const r of residents) { Object.assign(r, { state: 'idle', timer: 1e9 }); r.hold(null); r.setOut(false); }
    },
    worldToScreen(x, y, z = LAUNCH.z) {
      const v = new THREE.Vector3(x, y, z).project(camera), r = canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    pouchScreen() { return this.worldToScreen(pouch.x, pouch.wy); },
    aim(dx, dy) { aim = { id: -1, sx: 0, sy: 0 }; const c = constrainPouch(dx, dy); pouch.x = c.x; pouch.wy = c.wy; },
    release() { const ok = aim && pullAmount() >= MIN_PULL; aim = null; if (ok) fire(); },
    closeUp(x, y, D) { closeUp = D ? { x, y, D } : null; placeCamera(0); },
    setTime(h) { hourNow = h; world.setTime(h); },
    popResidents() { for (const r of residents) if (r.state === 'idle') r.timer = 0; },
    autoplay(levelI, seedN, limit = 480) {
      seedRandom(seedN);
      resSeed = (seedN * 2654435761) >>> 0;   // the neighbours' own stream too, so a seed always replays the same game
      day = 1;
      startLevel(levelI);
      const bot = makeBot(api);
      const tally = { trips: 0, caught: 0, slips: 0 };
      let was = where, h0 = hearts, stunned = 0;
      const trace = [];
      let tick = 0;
      while (state === 'play' && levelTime < limit) {
        bot(STEP); update(STEP);
        if (++tick % 20 === 0) {
          trace.push(`${levelTime.toFixed(1)} ${where[0]} x${Math.round(ra.x)} h${Math.round(ra.h)} ${ra.mode[0]} in${JSON.stringify(botMove)} s${sack.length} | ` +
            guards.filter(g => g.active).map(g => g.state.slice(0, 4) + '@' + Math.round(g.a.x) + '/' + Math.round(g.a.h) + g.a.mode[0] + (g.blind > 0 ? 'b' : '')).join(' '));
          if (trace.length > 36) trace.shift();
        }
        if (where !== was) { if (where === 'roam') tally.trips++; was = where; }
        if (hearts < h0) { if (where === 'roam') tally.caught++; h0 = hearts; }
        const st = guards.filter(g => g.active && g.state === 'stun').length;
        if (st > stunned) tally.slips++;
        stunned = st;
      }
      // a game that never ended reports where the autoplayer was standing, to make hangs easy to diagnose
      const stuck = state === 'play' ? { where, x: Math.round(ra.x), h: Math.round(ra.h), move: ra.mode, sack: sack.length, stash: stash.length, inCan: !!inCan,
        hide: +rc.hide.toFixed(2), cans: maze.cans.map(c => c.loot.length).join(''), boxes: boxes.length, worker: wk.state, slicks: slicks.length,
        guards: guards.filter(g => g.active).map(g => g.state + '@' + Math.round(g.a.x) + '/' + Math.round(g.a.h) + g.a.mode[0]).join(' '), trace } : undefined;
      let guard = 0;
      while ((state === 'winning' || state === 'lost') && guard++ < 900) update(STEP);
      hideKey = false; botMove = null;
      return { level: levelI + 1, seed: seedN, result: state === 'won' ? 'win' : state === 'lost' ? 'lose' : 'timeout', time: +levelTime.toFixed(1), throws, hearts, ...tally, stuck };
    },
  };
}

resize();
loadLevel(0);
showMenu();
window.__tphReady = true;
requestAnimationFrame(frame);
