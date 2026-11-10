import * as THREE from 'three';
import { createView, toon } from './gfx.js';
import { buildWorld } from './world.js';
import { buildRaccoon, buildWorker, buildBand, boxMesh, ammoMesh } from './characters.js';
import { ik2 } from './rig.js';
import { initAudio, sfx, toggleMute, isMuted } from './audio.js';
import { rand, lerp, clamp, damp, smooth, angleDamp, seedRandom } from './util.js';
import {
  G, STEP, STEP_MS, GRAV, AIR, RS, CAN_X, RAC_X, ZONE, DUMP_TOP, DOOR_X, DOCK_Y, DOCK_Z, STAND_X,
  MAX_PULL, MIN_PULL, POWER, SPEC, AMMO, LEVELS,
} from './config.js';
import { makeBot } from './bot.js';

const { Engine, Bodies, Body, Events, Composite, Query } = window.Matter;
const $ = id => document.getElementById(id);
const TEST = /[?&](test|debug)\b/.test(location.search);
const TOUCH = window.matchMedia && matchMedia('(pointer: coarse)').matches;
const HIDE_HOW = TOUCH ? 'Hold the HIDE button' : 'Hold SPACE (or the HIDE button)';

const canvas = $('game'), wrap = $('wrap'), hideBtn = $('hideBtn'), overlay = $('overlay');
const view = createView(canvas);
const { scene, camera } = view;
const world = buildWorld(scene, view);

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

const rc = { mode: 'stand', modeT: 0, hide: 0, invuln: 0, aimW: 0, tailA: 0, tailV: 0, blink: 2, lastX: RAC_X, splashed: false, releaseT: 0 };

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
const boxes = [], projs = [], flying = [], parts = [], killQueue = [];
const pouch = { x: REST.x, wy: REST.wy, vx: 0, vy: 0 };
const cam = { D: 3000, off: 0, zoom: 1 };
let closeUp = null;

const hideHeld = () => hideKey || hideBtnDown;
const ammoAt = i => ammoOverride || level.ammo[i % level.ammo.length];
const pullAmount = () => Math.hypot(pouch.x - REST.x, pouch.wy - REST.wy);
const pullFrac = () => Math.min(1, pullAmount() / MAX_PULL);
const canAim = () => state === 'play' && rac.outer.visible && rc.hide < 0.05 && throwCool <= 0 && !hideHeld() && (rc.mode === 'stand' || rc.mode === 'release');

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
  const type = ammoAt(ammoIdx);
  if (type === heldType && held) return;
  if (held) scene.remove(held);
  held = ammoMesh(type);
  heldType = type;
  scene.add(held);
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
  const i = list.indexOf(o);
  if (i >= 0) list.splice(i, 1);
}

const partGeo = new THREE.BoxGeometry(1, 1, 1);
const partMats = new Map();
function burst(x, y, z, n, color, speed, size, grav = 900) {
  let mat = partMats.get(color);
  if (!mat) { mat = new THREE.MeshToonMaterial({ color }); partMats.set(color, mat); }
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(partGeo, mat);
    const a = rand(0, Math.PI * 2), sp = rand(0.3, 1) * speed;
    m.position.set(x + rand(-10, 10), y + rand(-10, 10), z + rand(-10, 10));
    scene.add(m);
    parts.push({ m, vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp + speed * 0.3, vz: rand(-0.5, 0.5) * speed, life: rand(0.5, 0.9), size: rand(0.6, 1.2) * size, grav, spin: rand(-9, 9) });
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
    if (p && p.kind === 'proj') p.punch = { x: vOther.x * 0.55, y: vOther.y * 0.55 };
  } else if (!o.worn && o.hp < o.max * 0.55) {
    o.worn = true;
    o.skin.material = toon(SPEC[o.type].hurt);
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

function loadLevel(i) {
  levelIdx = i;
  level = LEVELS[i];
  clearLevel();
  for (const [x, ...types] of level.cols) {
    let y = x >= 915 ? DUMP_TOP : G;
    for (const t of types) { addBox(t, x, y); y -= SPEC[t].h; }
  }
  hearts = 3; throws = 0; ammoIdx = 0; ammoOverride = null; throwCool = 0; clearT = 0; endT = 0; levelTime = 0; aim = null;
  Object.assign(rc, { mode: 'stand', modeT: 0, hide: 0, invuln: 0, aimW: 0, splashed: false });
  Object.assign(pouch, { x: REST.x, wy: REST.wy, vx: 0, vy: 0 });
  rac.outer.visible = true;
  rac.outer.position.copy(STAND);
  rac.outer.rotation.set(0, 0, 0);
  rac.outer.scale.setScalar(RS);
  rac.root.rotation.set(0, -0.45, 0);
  rac.rig.play('idle', 0.1);
  Object.assign(wk, { state: 'idle', timer: level.first, alert: 0, cool: 0, door: 0, react: null, carrying: false, watching: false });
  setCarry(null); setGrab(null);
  wk.outer.visible = false;
  setHeld();
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
  spawnProj(ammoAt(ammoIdx), p.x, G - p.wy, v.x, v.y, LAUNCH.z);
  throws++; ammoIdx++; throwCool = 0.5; taught |= 1;
  pouch.vx = (LAUNCH.x - p.x) * 16; pouch.vy = (LAUNCH.wy - p.wy) * 16;
  rc.mode = 'release'; rc.modeT = 0; rc.releaseT = 0;
  rac.rig.play('release', 0.04, 1, true);
  for (const d of trail) d.visible = false;
  trailIdx = 0; trailTick = 0; trailProj = projs[projs.length - 1];
  setHeld();
  sfx.snap();
  buzz(10);
}

canvas.addEventListener('pointerdown', e => {
  initAudio();
  if (state !== 'play') return;
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
  if (!aim || e.pointerId !== aim.id) return;
  const c = constrainPouch((e.clientX - aim.cx) * aim.perPx, -(e.clientY - aim.cy) * aim.perPx);
  pouch.x = c.x; pouch.wy = c.wy; pouch.vx = pouch.vy = 0;
  const k = Math.floor((pullFrac()) * 5);
  if (k > lastStretch) sfx.stretch(k / 5);
  lastStretch = k;
});
function endAim(e) {
  if (!aim || e.pointerId !== aim.id) return;
  const ok = e.type === 'pointerup' && state === 'play' && pullAmount() >= MIN_PULL && canAim();
  aim = null;
  if (ok) fire();
  else { pouch.vx = pouch.vy = 0; }
}
canvas.addEventListener('pointerup', endAim);
canvas.addEventListener('pointercancel', endAim);
canvas.addEventListener('contextmenu', e => e.preventDefault());

const HIDE_KEYS = new Set(['Space', 'ArrowDown', 'KeyS']);
window.addEventListener('keydown', e => {
  if (HIDE_KEYS.has(e.code)) { hideKey = true; e.preventDefault(); return; }
  if (e.repeat) return;
  if (e.code === 'KeyR' && state !== 'menu') startLevel(levelIdx);
  else if (e.code === 'KeyM') toggleSound();
  else if (e.code === 'KeyP' || e.code === 'Escape') setPaused(state !== 'paused');
  else if (e.code === 'Enter' && overlay.classList.contains('show')) {
    const b = overlay.querySelector('button[data-act]');
    if (b) { e.preventDefault(); b.click(); }
  }
});
window.addEventListener('keyup', e => { if (HIDE_KEYS.has(e.code)) hideKey = false; });
window.addEventListener('blur', () => { hideKey = false; hideBtnDown = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && !TEST) setPaused(true); });

hideBtn.addEventListener('pointerdown', e => {
  initAudio();
  hideBtnDown = true;
  try { hideBtn.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
  e.preventDefault();
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) hideBtn.addEventListener(ev, () => { hideBtnDown = false; });
hideBtn.addEventListener('contextmenu', e => e.preventDefault());

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
  if (act === 'play') startLevel(0);
  else if (act === 'retry') startLevel(levelIdx);
  else if (act === 'next') startLevel((levelIdx + 1) % LEVELS.length);
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
    '<p>Dinner is in the dumpster, but the night crew keeps stacking boxes around it.</p>' +
    '<p><b>Pull the slingshot back and let go</b> to fling trash. Drag from the raccoon, or anywhere on the left side.</p>' +
    '<p><b>' + HIDE_HOW + '</b> to duck into the can when the back door light blinks. Get spotted and they throw boxes at you.</p>' +
    '<p>Clear every box from the glowing brackets and the raccoon dives in.</p>' +
    '<div class="row"><button data-act="play">Play</button></div>');
}
function showWin() {
  const stars = throws <= level.par ? 3 : throws <= level.par + 5 ? 2 : 1;
  const last = levelIdx === LEVELS.length - 1;
  showOverlay(
    '<h1>' + (last ? 'Dumpster Royalty!' : 'Dinner is served!') + '</h1>' +
    '<div class="stars">' + [1, 2, 3].map(n => '<span class="' + (n <= stars ? '' : 'off') + '">&#9733;</span>').join('') + '</div>' +
    '<p>' + throws + ' throws (3 stars at ' + level.par + ' or fewer) &middot; ' + Math.round(levelTime) + ' seconds &middot; ' + hearts + ' of 3 hearts left</p>' +
    '<div class="row"><button data-act="next">' + (last ? 'Play again' : 'Next level') + '</button><button class="alt" data-act="retry">Replay</button></div>');
}
function showLose() {
  showOverlay(
    '<h1>Busted!</h1>' +
    '<p>The night crew chased the raccoon off. Duck into the can as soon as the door light blinks.</p>' +
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

function fly(type, from, to, dur, arc, kind) {
  const mesh = boxMesh(type).g;
  scene.add(mesh);
  flying.push({ mesh, type, from, to, dur, arc, kind, t: 0 });
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
  rc.invuln = 1.5;
  shake = 16;
  aim = null;
  burst(rac.outer.position.x, 90, 30, 10, 0xd49d5e, 280, 12);
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
      else if (state === 'play') landPlaced(f);
    }
  }
}

const FACE_LEFT = Math.PI + 0.35, FACE_RIGHT = -0.35, FACE_OUT = -Math.PI / 2, FACE_IN = Math.PI / 2;
const _v = new THREE.Vector3();

function workerAnim() {
  const r = wk.rig, sp = level.speed / 170;
  if (wk.react === 'spot') return r.play('spot', 0.12);
  if (wk.react === 'throw') return null;
  switch (wk.state) {
    case 'emerge': case 'out': return r.play(wk.carrying ? 'carryWalk' : 'walk', 0.2, sp);
    case 'lob': return null;
    case 'linger': return r.play('idle', 0.3);
    case 'return': case 'enter': return r.play('walk', 0.25, sp);
    default: return r.play(wk.carrying ? 'carryIdle' : 'idle', 0.3);
  }
}

function updateWorker(dt) {
  const L = level, playing = state === 'play';
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
  const exposed = rc.hide < 0.6 && rac.outer.visible;
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
  rc.modeT += dt;
  world.canLid.rotation.z = damp(world.canLid.rotation.z, 0, 8, dt);

  if (state === 'winning' || state === 'won') {
    endT += dt;
    band.setVisible(false);
    rac.sling.group.visible = false;
    g.visible = true;
    g.rotation.set(0, 0, 0);
    if (state === 'won' || endT >= 2.2) {
      rig.play('cheer', 0.2);
      g.position.set(1050, 112 + (state === 'won' ? Math.sin(time * 5) * 3 : 0), 0);
      g.scale.setScalar(RS * 0.85);
      rac.root.rotation.y = angleDamp(rac.root.rotation.y, -0.9, 6, dt);
      if (state === 'winning' && endT >= 2.9) { state = 'won'; sfx.win(); showWin(); }
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

  const want = hideHeld() && state === 'play' ? 1 : 0;
  if (want && rc.mode !== 'duck') { rc.mode = 'duck'; rc.modeT = 0; rig.play('duck', 0.1, 1, true); sfx.duck(); aim = null; }
  if (!want && rc.mode === 'duck') { rc.mode = 'pop'; rc.modeT = 0; rig.play('pop', 0.08, 1, true); }
  if (rc.mode === 'pop' && rc.modeT > 0.32) { rc.mode = 'stand'; rig.play('idle', 0.2); }
  if (rc.mode === 'release' && rc.modeT > 0.5) { rc.mode = 'stand'; rig.play('idle', 0.25); }
  if (rc.mode === 'hit' && rc.modeT > 0.62) { rc.mode = 'stand'; rig.play('idle', 0.25); }
  if (rc.mode === 'stand' && rig.name !== 'idle') rig.play('idle', 0.2);

  rc.hide += clamp(want - rc.hide, -dt / 0.2, dt / 0.16);
  const h = smooth(rc.hide);
  g.position.set(lerp(STAND.x, HIDE_POS.x, h), lerp(STAND.y, HIDE_POS.y, h) + Math.sin(h * Math.PI) * 50, lerp(STAND.z, HIDE_POS.z, h));
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
  hideBtn.classList.toggle('active', h > 0.5);
}

function updateAimVisuals() {
  const show = state === 'play' && rc.hide < 0.25 && throwCool <= 0 && rc.mode !== 'hit' && rac.sling.group.visible;
  held.visible = show;
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
      if (!gone) burst(p.x, G - p.y, 0, 5, 0xdfe3ee, 110, 8, 0);
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
  setText('lvl', 'Level ' + (levelIdx + 1) + ': ' + level.name);
  const hk = 'h' + hearts;
  if (hud.hearts !== hk) {
    hud.hearts = hk;
    $('hearts').innerHTML = [1, 2, 3].map(i => '<span class="' + (i <= hearts ? '' : 'off') + '">&#9829;</span>').join('');
    $('hearts').setAttribute('aria-label', hearts + ' of 3 hearts');
  }
  setText('blockers', 'Boxes blocking: ' + n);
  setText('throws', 'Throws: ' + throws + ' (par ' + level.par + ')');
  let cls = '', text = '';
  if (state === 'play') {
    if (wk.state === 'warn') { cls = 'warn'; text = 'Back door opening!'; }
    else if (wk.watching && rc.hide < 0.6) { cls = 'danger'; text = 'Spotted! Hide!'; }
    else if (wk.watching) { cls = 'calm'; text = 'Stay hidden...'; }
    else if (wk.state === 'return' || wk.state === 'enter') { cls = 'safe'; text = 'Coast is clear'; }
  }
  setText('banner', text);
  setClass('banner', cls);
  setClass('watch', wk.watching ? 'on' : '');
  $('watchBar').style.width = Math.round(wk.alert * 100) + '%';
  const now = ammoAt(ammoIdx), next = ammoAt(ammoIdx + 1), key = now + next;
  if (hud.ammo !== key) {
    hud.ammo = key;
    $('ammoLine').innerHTML = 'Loaded: <b>' + AMMO[now].name + '</b>. ' + AMMO[now].hint + ' Next: <b>' + AMMO[next].name + '</b>';
  }
  setText('hint', liveFish() ? 'Tap now to split the fish bones!'
    : !(taught & 1) ? 'Pull the slingshot back and let go.'
    : !(taught & 2) ? HIDE_HOW + ' to duck into the can.' : '');
}

// ---------- camera ----------
function resize() {
  const w = wrap.clientWidth || window.innerWidth, h = wrap.clientHeight || window.innerHeight;
  view.resize(w, h);
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  cam.D = Math.max(1500 / (2 * t * camera.aspect), 800 / (2 * t));
  placeCamera(0);
}
function placeCamera(dt) {
  let tx = 0;
  const p = projs[projs.length - 1];
  if (!aim && p && (!p.hitAt || time - p.hitAt < 0.9) && p.age < 4) tx = clamp((p.body.position.x - 760) * 0.2, -30, 110);
  const tz = aim ? 1 + 0.035 * (pullFrac()) : 1;
  if (dt > 0) { cam.off = damp(cam.off, tx, 2.4, dt); cam.zoom = damp(cam.zoom, tz, 5, dt); }
  if (closeUp) {
    camera.position.set(closeUp.x - 40, closeUp.y + closeUp.D * 0.08, closeUp.D);
    camera.lookAt(closeUp.x, closeUp.y, 0);
    return;
  }
  const D = cam.D * cam.zoom, sx = rand(-1, 1) * shake, sy = rand(-1, 1) * shake;
  camera.position.set(600 + cam.off + sx, 250 + D * 0.1 + sy, D);
  camera.lookAt(745 + cam.off + sx * 0.5, 235 + sy * 0.5, 0);
}
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

// ---------- main loop ----------
function update(dt) {
  if (state === 'paused') { placeCamera(dt); return; }
  time += dt;
  if (state === 'play') levelTime += dt;
  throwCool = Math.max(0, throwCool - dt);
  if (hideHeld()) aim = null;

  Engine.update(engine, STEP_MS);
  afterStep();

  updateWorker(dt);
  updateFlying(dt);
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
    busy: () => projs.some(o => !o.hitAt && o.age < 5) || boxes.some(o => o.body.speed > 1.2) || flying.length > 0,
    boxes: () => boxes.filter(o => !o.dead).map(o => {
      const b = o.body.bounds, p = o.body.position;
      return { minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, top: b.min.y, blocking: p.x > ZONE.x0 && p.x < ZONE.x1 && p.y > ZONE.top, type: o.type };
    }),
    statics: () => STATICS,
    ammo: () => AMMO[ammoAt(ammoIdx)],
    constrain: constrainPouch,
    velocity: launchVelocity,
    fireDrag(dx, dy) {
      const c = constrainPouch(dx, dy);
      pouch.x = c.x; pouch.wy = c.wy;
      fire();
    },
  };
  const step = sec => { for (let t = 0; t < sec - 1e-9; t += STEP) update(STEP); };
  window.TPH = {
    ready: true,
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
    }),
    setAmmo: t => { ammoOverride = t; setHeld(); },
    hide: v => { hideKey = v; },
    fireDrag: (dx, dy) => api.fireDrag(dx, dy),
    forceWin() { for (const o of boxes.slice()) removeObj(boxes, o); },
    forceLose() { hearts = 1; hurtRaccoon(); },
    worldToScreen(x, y, z = LAUNCH.z) {
      const v = new THREE.Vector3(x, y, z).project(camera), r = canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    pouchScreen() { return this.worldToScreen(pouch.x, pouch.wy); },
    aim(dx, dy) { aim = { id: -1, sx: 0, sy: 0 }; const c = constrainPouch(dx, dy); pouch.x = c.x; pouch.wy = c.wy; },
    release() { const ok = aim && pullAmount() >= MIN_PULL; aim = null; if (ok) fire(); },
    closeUp(x, y, D) { closeUp = D ? { x, y, D } : null; placeCamera(0); },
    autoplay(levelI, seedN, limit = 300) {
      seedRandom(seedN);
      startLevel(levelI);
      const bot = makeBot(api);
      while (state === 'play' && levelTime < limit) { bot(STEP); update(STEP); }
      let guard = 0;
      while ((state === 'winning' || state === 'lost') && guard++ < 600) update(STEP);
      hideKey = false;
      return { level: levelI + 1, seed: seedN, result: state === 'won' ? 'win' : state === 'lost' ? 'lose' : 'timeout', time: +levelTime.toFixed(1), throws, hearts };
    },
  };
}

resize();
loadLevel(0);
showMenu();
window.__tphReady = true;
requestAnimationFrame(frame);
