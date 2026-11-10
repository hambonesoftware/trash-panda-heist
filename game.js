(() => {
'use strict';
const { Engine, Bodies, Body, Events, Composite, Query } = Matter;

// Physics runs in 2D (x right, y down, ground at y = G). Scene y = G - physics y.
const G = 600;
const STEP = 1 / 60;
const GRAV = 0.001 * (1000 / 60) ** 2;
const AIR = 0.004;
const RS = 1.25;
const LAUNCH = { x: 315, y: G - 115 };
const ZONE = { x0: 830, x1: 1212, top: 150 };
const DUMP_TOP = G - 160;
const CAN_X = 165, RAC_X = 265, STAND_X = 1312;
const DOOR_X = 1385, DOCK_Y = 50, DOCK_Z = -205;
const MAX_PULL = 240, POWER = 0.1;

const SPEC = {
  box:   { w: 60, h: 60, d: 56, hp: 40,  density: 0.001,  color: 0xc9975c, hurt: 0x9f7443 },
  small: { w: 46, h: 46, d: 44, hp: 28,  density: 0.001,  color: 0xd9ad70, hurt: 0xa9814f },
  crate: { w: 60, h: 60, d: 56, hp: 130, density: 0.0018, color: 0xa06c3a, hurt: 0x7a5029 },
};
const AMMO = {
  can:  { name: 'Tin can',    r: 15, density: 0.005, hint: 'A solid all-rounder.' },
  bag:  { name: 'Trash bag',  r: 24, density: 0.006, hint: 'Heavy. Smashes wooden crates.' },
  fish: { name: 'Fish bones', r: 12, density: 0.005, hint: 'Tap while it flies to split it in three.' },
};
const LEVELS = [
  { name: 'Night Shift', par: 11, first: 8, interval: 13, speed: 170, spot: 0.9, flight: 0.85, linger: 0.3, crates: 0,
    ammo: ['can', 'can', 'bag'],
    cols: [[880, 'box', 'box'], [950, 'box', 'small'], [1016, 'box', 'box', 'small'], [1082, 'box', 'box'], [1148, 'box']] },
  { name: 'Restock Rush', par: 15, first: 7, interval: 10, speed: 200, spot: 0.75, flight: 0.75, linger: 0.6, crates: 0.15,
    ammo: ['can', 'fish', 'can', 'bag'],
    cols: [[880, 'crate', 'box', 'small'], [950, 'box', 'box'], [1016, 'crate', 'box', 'small'], [1082, 'box', 'box', 'box'], [1148, 'box', 'small']] },
  { name: 'Inventory Day', par: 20, first: 6, interval: 7.5, speed: 230, spot: 0.6, flight: 0.65, linger: 1.0, crates: 0.3,
    ammo: ['can', 'bag', 'fish', 'can'],
    cols: [[880, 'crate', 'box', 'box'], [950, 'box', 'crate', 'small'], [1016, 'box', 'box', 'box', 'small'], [1082, 'crate', 'box', 'box'], [1148, 'box', 'box', 'small']] },
];

const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = id => document.getElementById(id);

// ---------- renderer ----------
const wrap = $('wrap'), canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 16 / 9, 50, 9000);
const camBase = new THREE.Vector3();
const LOOK = new THREE.Vector3(745, 235, 0);

function resize() {
  const w = wrap.clientWidth || 1280, h = wrap.clientHeight || 720;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const D = Math.max(1500 / (2 * t * camera.aspect), 780 / (2 * t));
  camBase.set(600, 250 + D * 0.1, D);
  camera.position.copy(camBase);
  camera.lookAt(LOOK);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- cel shading helpers ----------
const gradTex = new THREE.DataTexture(new Uint8Array([95, 170, 255]), 3, 1, THREE.RedFormat);
gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter;
gradTex.generateMipmaps = false;
gradTex.needsUpdate = true;

const toonCache = new Map();
function toon(color) {
  let m = toonCache.get(color);
  if (!m) { m = new THREE.MeshToonMaterial({ color, gradientMap: gradTex }); toonCache.set(color, m); }
  return m;
}
const flat = color => new THREE.MeshBasicMaterial({ color });
const INK = new THREE.MeshBasicMaterial({ color: 0x17131f, side: THREE.BackSide });
const asMat = c => (typeof c === 'number' ? toon(c) : c);

// Mesh with an inverted-hull ink outline of thickness t (geometry must be centred on its origin).
function M(geo, mat, t = 2.5) {
  const m = new THREE.Mesh(geo, asMat(mat));
  m.castShadow = true;
  m.receiveShadow = true;
  if (t > 0) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    const s = geo.boundingBox.getSize(new THREE.Vector3());
    const o = new THREE.Mesh(geo, INK);
    o.scale.set((s.x + 2 * t) / Math.max(s.x, 0.01), (s.y + 2 * t) / Math.max(s.y, 0.01), (s.z + 2 * t) / Math.max(s.z, 0.01));
    m.add(o);
  }
  return m;
}
const B = (w, h, d, c, t) => M(new THREE.BoxGeometry(w, h, d), c, t);
const S = (r, c, t) => M(new THREE.SphereGeometry(r, 20, 14), c, t);
const C = (rt, rb, h, c, t, seg = 22) => M(new THREE.CylinderGeometry(rt, rb, h, seg), c, t);
const put = (m, x, y, z = 0) => { m.position.set(x, y, z); return m; };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return new THREE.CanvasTexture(c);
}

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xc4d2ff, 0x4a4060, 0.62));
const moonLight = new THREE.DirectionalLight(0xfff0d8, 0.62);
moonLight.position.set(200, 950, 850);
moonLight.target.position.set(760, 100, -60);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
Object.assign(moonLight.shadow.camera, { left: -1050, right: 1050, top: 750, bottom: -750, near: 100, far: 3200 });
moonLight.shadow.bias = -0.0008;
moonLight.shadow.normalBias = 2;
scene.add(moonLight, moonLight.target);

// ---------- environment ----------
let doorPanel, doorLamp;
const lampOff = new THREE.Color(0x4b4b58), lampWarn = new THREE.Color(0xffc93c), lampHot = new THREE.Color(0xff5a4a);

function buildEnvironment() {
  scene.background = canvasTex(8, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#0d1030'); gr.addColorStop(0.6, '#2b2a5c'); gr.addColorStop(1, '#4a3f78');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });

  const starPos = [];
  for (let i = 0; i < 110; i++) starPos.push(rand(-2400, 3800), rand(380, 1900), -2200);
  const stars = new THREE.BufferGeometry();
  stars.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xfdf6d8, size: 2.2, sizeAttenuation: false })));
  scene.add(put(new THREE.Mesh(new THREE.CircleGeometry(85, 40), flat(0xf6f0c8)), 60, 640, -1500));
  scene.add(put(new THREE.Mesh(new THREE.CircleGeometry(70, 40), flat(0x2b2a5c)), 100, 665, -1490));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4600, 1900), toon(0x4a4f6a));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(740, 0, 250);
  ground.receiveShadow = true;
  scene.add(ground);
  for (const x of [380, 640, 900, 1160]) {
    const line = B(9, 1, 300, 0xd8d4c0, 0);
    line.castShadow = false;
    scene.add(put(line, x, 0.6, 330));
  }

  const brick = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#a3574a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7a3c33';
    for (let r = 0; r < 8; r++) {
      g.fillRect(0, r * 16, w, 2);
      for (let c = 0; c < 9; c++) g.fillRect(c * 32 + (r % 2 ? 16 : 0), r * 16, 2, 16);
    }
  });
  brick.wrapS = brick.wrapT = THREE.RepeatWrapping;
  brick.repeat.set(9, 5);
  const wall = M(new THREE.BoxGeometry(1500, 450, 40), new THREE.MeshToonMaterial({ map: brick, gradientMap: gradTex }), 0);
  scene.add(put(wall, 1150, 225, -350));
  scene.add(put(B(1520, 18, 60, 0x5b3a3a, 3), 1150, 459, -345));

  const planks = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#6d5540'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4b3a2c';
    for (let c = 0; c < 8; c++) g.fillRect(c * 32, 0, 3, h);
  });
  planks.wrapS = THREE.RepeatWrapping;
  planks.repeat.set(7, 1);
  const fence = M(new THREE.BoxGeometry(1500, 215, 12), new THREE.MeshToonMaterial({ map: planks, gradientMap: gradTex }), 0);
  scene.add(put(fence, -350, 107, -338));

  scene.add(put(B(1180, DOCK_Y, 200, 0x9498a8, 3), 1230, DOCK_Y / 2, -232));
  scene.add(put(B(1180, 9, 5, 0xe9bd3a, 0), 1230, DOCK_Y - 5, -130));

  scene.add(put(B(116, 190, 6, 0x2e3142, 3), DOOR_X, DOCK_Y + 95, -329));
  scene.add(put(new THREE.Mesh(new THREE.BoxGeometry(94, 174, 3), flat(0x0b0a12)), DOOR_X, DOCK_Y + 87, -325));
  doorPanel = put(B(94, 174, 4, 0x7f8da0, 0), DOOR_X, DOCK_Y + 87, -322);
  scene.add(doorPanel);
  doorLamp = put(new THREE.Mesh(new THREE.SphereGeometry(11, 16, 12), flat(0x4b4b58)), DOOR_X, DOCK_Y + 212, -318);
  scene.add(doorLamp);
  scene.add(put(B(30, 10, 14, 0x2e3142, 2), DOOR_X, DOCK_Y + 224, -322));

  const sign = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#f3e7c4'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#17131f'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#c0392b'; g.font = 'bold 54px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('MEGA-MART', w / 2, 46);
    g.fillStyle = '#17131f'; g.font = 'bold 26px "Trebuchet MS", sans-serif';
    g.fillText('RECEIVING  -  STAFF ONLY', w / 2, 96);
  });
  scene.add(put(new THREE.Mesh(new THREE.PlaneGeometry(300, 75), new THREE.MeshBasicMaterial({ map: sign })), 1010, 370, -329));
}

let canLid;
function buildTrashCan() {
  const g = new THREE.Group();
  g.add(put(C(47, 42, 120, 0xaab4c6, 3), 0, 60, 0));
  for (const y of [28, 60, 92]) g.add(put(C(47.5 - (120 - y) * 0.04, 47 - (120 - y) * 0.04, 5, 0x8590a6, 0), 0, y, 0));
  g.add(put(C(50, 50, 7, 0x8590a6, 2.5), 0, 118, 0));
  canLid = new THREE.Group();
  canLid.add(C(54, 54, 8, 0xc4ccdb, 3));
  const dome = S(46, 0xc4ccdb, 0);
  dome.scale.y = 0.26;
  canLid.add(put(dome, 0, 4, 0));
  canLid.add(put(B(26, 8, 8, 0x8590a6, 2), 0, 19, 0));
  canLid.position.set(0, 124, 0);
  g.add(canLid);
  g.position.set(CAN_X, 0, 0);
  g.scale.setScalar(RS);
  scene.add(g);
}

function buildDumpster() {
  const g = new THREE.Group();
  g.add(put(B(280, 146, 200, 0x34995f, 4), 0, 85, 0));
  g.add(put(B(294, 12, 212, 0x267548, 3), 0, 154, 0));
  g.add(put(new THREE.Mesh(new THREE.BoxGeometry(268, 2, 186), flat(0x14131c)), 0, 160.4, 0));
  for (const x of [-96, -32, 32, 96]) g.add(put(B(12, 118, 6, 0x267548, 0), x, 82, 102));
  for (const sx of [-1, 1]) g.add(put(B(8, 34, 120, 0x267548, 2), sx * 144, 96, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wheel = C(13, 13, 10, 0x22222c, 2);
    wheel.rotation.x = Math.PI / 2;
    g.add(put(wheel, sx * 112, 13, sz * 84));
  }
  const bags = [[-92, -66, 20], [-44, -72, 24], [10, -68, 21], [62, -72, 25], [106, -64, 19]];
  for (const [x, z, r] of bags) {
    const bag = S(r, 0x3b4052, 2);
    bag.scale.y = 0.7;
    g.add(put(bag, x, 160, z));
  }
  const pizza = B(46, 6, 46, 0xe9dcc0, 2);
  pizza.rotation.y = 0.4;
  g.add(put(pizza, 30, 176, -74));
  g.position.set(1060, 0, 0);
  scene.add(g);

  const y1 = G - ZONE.top, bars = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0xffe07a });
  for (const [x, sx] of [[ZONE.x0, 1], [ZONE.x1, -1]]) for (const [y, sy] of [[4, 1], [y1, -1]]) {
    bars.add(put(new THREE.Mesh(new THREE.BoxGeometry(46, 5, 5), mat), x + sx * 23, y, 112));
    bars.add(put(new THREE.Mesh(new THREE.BoxGeometry(5, 46, 5), mat), x, y + sy * 23, 112));
  }
  scene.add(bars);
  return bars;
}

function buildRaccoon() {
  const FUR = 0x8f93a3, DARK = 0x3c3e4b, LIGHT = 0xebe6da;
  const g = new THREE.Group();
  const body = S(30, FUR);
  body.scale.set(1, 1.25, 0.95);
  g.add(put(body, 0, 40, 0));
  const belly = S(22, LIGHT, 0);
  belly.scale.set(0.8, 1.1, 0.8);
  g.add(put(belly, 11, 37, 0));
  for (const sz of [-1, 1]) {
    const foot = S(10, DARK, 2);
    foot.scale.set(1.5, 0.7, 1);
    g.add(put(foot, 8, 7, sz * 15));
  }

  const head = new THREE.Group();
  const skull = S(27, FUR);
  skull.scale.set(1.05, 0.92, 1.05);
  head.add(skull);
  const snout = S(12, LIGHT, 2);
  snout.scale.set(1.25, 0.8, 0.95);
  head.add(put(snout, 25, -7, 0));
  head.add(put(S(4.6, 0x15131a, 0), 39, -5, 0));
  for (const sz of [-1, 1]) {
    const patch = S(10.5, DARK, 0);
    patch.scale.set(0.7, 0.85, 1);
    head.add(put(patch, 21, 4, sz * 12.5));
    head.add(put(S(5, 0xffffff, 0), 27.5, 6, sz * 11.5));
    head.add(put(S(2.7, 0x15131a, 0), 31.6, 6, sz * 11));
    const ear = M(new THREE.ConeGeometry(9.5, 17, 14), DARK, 2);
    ear.rotation.x = sz * 0.3;
    head.add(put(ear, -3, 25, sz * 17));
  }
  head.position.set(8, 88, 0);
  g.add(head);

  const tail = new THREE.Group();
  [[-12, 4, 13], [-25, 15, 13], [-33, 30, 12], [-34, 46, 11], [-28, 60, 9]].forEach(([x, y, r], i) => {
    tail.add(put(S(r, i % 2 ? DARK : FUR, 2), x, y, 0));
  });
  tail.position.set(-20, 20, 0);
  g.add(tail);

  const arms = [];
  for (const sz of [1, -1]) {
    const arm = new THREE.Group();
    arm.add(put(C(5.5, 5, 28, FUR, 2, 10), 0, -14, 0));
    arm.add(put(S(6.5, DARK, 2), 0, -30, 0));
    arm.position.set(6, 62, sz * 22);
    g.add(arm);
    arms.push(arm);
  }
  scene.add(g);
  return { group: g, head, tail, armR: arms[0], armL: arms[1] };
}

function buildWorker() {
  const SHIRT = 0xd9483b, PANTS = 0x2f3558, SKIN = 0xeab48c, APRON = 0x2f62b0;
  const g = new THREE.Group();
  const legs = [];
  for (const sz of [1, -1]) {
    const leg = new THREE.Group();
    leg.add(put(B(18, 82, 20, PANTS), 0, -41, 0));
    leg.add(put(B(28, 10, 22, 0x1d1c26, 2), -5, -80, 0));
    leg.position.set(0, 84, sz * 13);
    g.add(leg);
    legs.push(leg);
  }
  g.add(put(B(36, 74, 58, SHIRT), 0, 120, 0));
  g.add(put(B(4, 56, 46, APRON, 0), -20, 112, 0));
  g.add(put(S(23, SKIN), 0, 180, 0));
  g.add(put(C(24, 24, 11, SHIRT, 2), 0, 198, 0));
  g.add(put(B(20, 4, 34, SHIRT, 2), -28, 194, 0));
  for (const sz of [-1, 1]) g.add(put(S(3, 0x15131a, 0), -21, 181, sz * 8));
  const arms = [];
  for (const sz of [1, -1]) {
    const arm = new THREE.Group();
    arm.add(put(B(14, 52, 14, SHIRT, 2), 0, -26, 0));
    arm.add(put(S(8, SKIN, 2), 0, -56, 0));
    arm.position.set(0, 152, sz * 37);
    g.add(arm);
    arms.push(arm);
  }
  const carry = new THREE.Group();
  carry.position.set(-52, 118, 0);
  g.add(carry);
  const bang = new THREE.Group(), bangMat = flat(0xffd23f);
  bang.add(put(new THREE.Mesh(new THREE.BoxGeometry(9, 26, 9), bangMat), 0, 16, 0));
  bang.add(put(new THREE.Mesh(new THREE.SphereGeometry(6, 12, 10), bangMat), 0, -6, 0));
  bang.position.set(0, 244, 0);
  g.add(bang);
  g.visible = false;
  scene.add(g);
  return { group: g, legs, arms, carry, bang, bangMat };
}

const boxGeo = {};
function boxMesh(type) {
  const s = SPEC[type];
  const geo = boxGeo[type] || (boxGeo[type] = new THREE.BoxGeometry(s.w, s.h, s.d));
  const g = new THREE.Group(), inner = new THREE.Group();
  const skin = M(geo, s.color);
  inner.add(skin);
  if (type === 'crate') {
    for (const y of [-0.32, 0.32]) inner.add(put(B(s.w + 1.6, s.h * 0.14, s.d + 1.6, 0x6e4622, 0), 0, y * s.h, 0));
  } else {
    inner.add(B(s.w * 0.2, s.h + 1.4, s.d + 1.4, 0xecd9ad, 0));
  }
  inner.rotation.y = rand(-0.12, 0.12);
  inner.position.z = rand(-8, 8);
  g.add(inner);
  return { g, skin };
}

function ammoMesh(type) {
  const g = new THREE.Group();
  if (type === 'can') {
    g.add(C(12, 12, 27, 0xc7ced9, 2, 14));
    g.add(C(12.6, 12.6, 13, 0xd9483b, 0, 14));
  } else if (type === 'bag') {
    const bag = S(24, 0x3f4558);
    bag.scale.y = 0.9;
    g.add(bag);
    g.add(put(M(new THREE.ConeGeometry(8, 14, 10), 0x3f4558, 2), 0, 24, 0));
  } else {
    const BONE = 0xf3eede;
    const spine = C(2.2, 2.2, 30, BONE, 1.5, 8);
    spine.rotation.z = Math.PI / 2;
    g.add(spine);
    const head = S(7.5, BONE, 2);
    head.scale.set(1.25, 0.95, 0.6);
    g.add(put(head, 15, 0, 0));
    g.add(put(S(1.9, 0x15131a, 0), 17, 2, 4.4));
    [[5, 16], [-1, 15], [-7, 12], [-12, 9]].forEach(([x, h]) => g.add(put(B(2.4, h, 2.4, BONE, 1.2), x, 0, 0)));
    const tail = M(new THREE.ConeGeometry(8, 10, 3), BONE, 1.5);
    tail.rotation.z = -Math.PI / 2;
    tail.scale.z = 0.35;
    g.add(put(tail, -19, 0, 0));
  }
  return g;
}

// ---------- sound ----------
let ac = null, muted = false, lastThud = 0;
function initAudio() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
  if (ac && ac.state === 'suspended') ac.resume();
}
function tone(f, d, type = 'sine', v = 0.12, f2 = 0, delay = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g); g.connect(ac.destination);
  o.start(t); o.stop(t + d + 0.02);
}
function noise(d, v = 0.2, freq = 1200) {
  if (!ac || muted) return;
  const n = Math.floor(ac.sampleRate * d), buf = ac.createBuffer(1, n, ac.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf; fl.type = 'lowpass'; fl.frequency.value = freq; g.gain.value = v;
  src.connect(fl); fl.connect(g); g.connect(ac.destination);
  src.start();
}
const sfx = {
  throw() { noise(0.16, 0.16, 900); tone(280, 0.14, 'triangle', 0.07, 620); },
  thud(power) { if (time - lastThud < 0.06) return; lastThud = time; tone(120, 0.12, 'sine', clamp(power * 0.02, 0.05, 0.25), 55); },
  smash() { noise(0.2, 0.22, 2400); tone(170, 0.1, 'square', 0.05, 70); },
  door() { tone(170, 0.45, 'sawtooth', 0.045, 85); },
  spotted() { tone(880, 0.09, 'square', 0.07); tone(1175, 0.12, 'square', 0.07, 0, 0.1); },
  hurt() { tone(320, 0.32, 'sawtooth', 0.14, 70); noise(0.15, 0.2, 700); },
  clang() { tone(1250, 0.28, 'triangle', 0.12, 720); },
  split() { tone(700, 0.1, 'triangle', 0.08, 1300); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, 0, i * 0.11)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.26, 'sawtooth', 0.08, 0, i * 0.14)); },
};

// ---------- physics ----------
const engine = Engine.create();
engine.positionIterations = 8;
engine.velocityIterations = 6;
const world = engine.world;
Composite.add(world, [
  Bodies.rectangle(700, G + 50, 5000, 100, { isStatic: true, friction: 0.9 }),
  Bodies.rectangle(1060, G - 80, 290, 160, { isStatic: true, friction: 0.9 }),
  Bodies.rectangle(1480, G - 400, 60, 1400, { isStatic: true }),
  Bodies.rectangle(CAN_X, G - 75, 116, 150, { isStatic: true }),
]);

// ---------- game state ----------
let state = 'menu', levelIdx = 0, level = LEVELS[0];
let time = 0, levelTime = 0, acc = 0, hearts = 3, throws = 0, ammoIdx = 0, throwCool = 0, clearT = 0, endT = 0, shake = 0;
let hideKey = false, hideBtnDown = false, aim = null, spottedLatch = false, taught = 0;
const boxes = [], projs = [], flying = [], parts = [], killQueue = [];

buildEnvironment();
buildTrashCan();
const zoneBars = buildDumpster();
const rac = Object.assign(buildRaccoon(), { hide: 0, throwT: 0, invuln: 0 });
const wk = Object.assign(buildWorker(), { state: 'idle', timer: 0, x: DOOR_X, z: -300, face: -1, alert: 0, pause: 0, cool: 0, col: 0, type: 'box', door: 0, walk: 0, carrying: false });
const dots = [];
for (let i = 0; i < 24; i++) {
  const d = new THREE.Mesh(new THREE.SphereGeometry(i % 4 ? 4 : 5.5, 8, 6), flat(0xfff6d8));
  d.visible = false;
  scene.add(d);
  dots.push(d);
}
let held = null, heldType = '';

const hideHeld = () => hideKey || hideBtnDown;
const ammoAt = i => level.ammo[i % level.ammo.length];

function setHeld() {
  const type = ammoAt(ammoIdx);
  if (type === heldType && held) return;
  if (held) scene.remove(held);
  held = ammoMesh(type);
  heldType = type;
  scene.add(held);
}

function addBox(type, x, bottom) {
  const s = SPEC[type];
  const body = Bodies.rectangle(x, bottom - s.h / 2, s.w, s.h, { density: s.density, friction: 0.85, restitution: 0.02 });
  const { g, skin } = boxMesh(type);
  const o = { kind: 'box', type, body, mesh: g, skin, hp: s.hp, max: s.hp, dead: false, worn: false };
  body.gameObj = o;
  Composite.add(world, body);
  scene.add(g);
  boxes.push(o);
  return o;
}

function spawnProj(type, x, y, vx, vy, split = false) {
  const a = AMMO[type];
  const body = Bodies.circle(x, y, a.r, { density: a.density, restitution: 0.25, friction: 0.7, frictionAir: AIR });
  Body.setVelocity(body, { x: vx, y: vy });
  Body.setAngularVelocity(body, 0.18);
  const o = { kind: 'proj', type, body, mesh: ammoMesh(type), age: 0, hitAt: 0, still: 0, split, punch: null };
  body.gameObj = o;
  Composite.add(world, body);
  scene.add(o.mesh);
  projs.push(o);
  return o;
}

function removeObj(list, o) {
  Composite.remove(world, o.body);
  scene.remove(o.mesh);
  const i = list.indexOf(o);
  if (i >= 0) list.splice(i, 1);
}

const partGeo = new THREE.BoxGeometry(1, 1, 1);
function burst(x, y, z, n, color, speed, size, grav = 900) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(partGeo, toon(color));
    const a = rand(0, Math.PI * 2), sp = rand(0.3, 1) * speed, sz = rand(0.6, 1.2) * size;
    m.position.set(x + rand(-10, 10), y + rand(-10, 10), z + rand(-10, 10));
    scene.add(m);
    parts.push({ m, vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp + speed * 0.3, vz: rand(-0.5, 0.5) * speed, life: rand(0.5, 0.9), size: sz, grav, spin: rand(-9, 9) });
  }
}

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
    burst(p.x, G - p.y, 0, 4, 0xecd9ad, 200, 9);
    removeObj(boxes, o);
    sfx.smash();
    shake = Math.max(shake, 5);
  }
  killQueue.length = 0;
  for (const o of projs) if (o.punch) { Body.setVelocity(o.body, o.punch); o.punch = null; }
}

function loadLevel(i) {
  levelIdx = i;
  level = LEVELS[i];
  for (const o of boxes.slice()) removeObj(boxes, o);
  for (const o of projs.slice()) removeObj(projs, o);
  for (const f of flying) scene.remove(f.mesh);
  for (const p of parts) scene.remove(p.m);
  flying.length = parts.length = killQueue.length = 0;
  for (const [x, ...types] of level.cols) {
    let y = x >= 915 ? DUMP_TOP : G;
    for (const t of types) { addBox(t, x, y); y -= SPEC[t].h; }
  }
  hearts = 3; throws = 0; ammoIdx = 0; throwCool = 0; clearT = 0; endT = 0; levelTime = 0; aim = null;
  Object.assign(rac, { hide: 0, throwT: 0, invuln: 0 });
  rac.group.visible = true;
  rac.group.scale.setScalar(RS);
  rac.group.rotation.set(0, -0.45, 0);
  Object.assign(wk, { state: 'idle', timer: level.first, alert: 0, pause: 0, cool: 0, door: 0, carrying: false });
  wk.group.visible = false;
  setHeld();
}

function startLevel(i) {
  loadLevel(i);
  state = 'play';
  $('overlay').classList.remove('show');
}

// ---------- input ----------
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), ndc = new THREE.Vector2(), hitPt = new THREE.Vector3();
function toWorld(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(plane, hitPt) ? { x: hitPt.x, y: hitPt.y } : null;
}

function splitFish(o) {
  const v = o.body.velocity, p = o.body.position;
  o.split = true;
  for (const a of [-0.17, 0.17]) {
    const c = Math.cos(a), s = Math.sin(a);
    spawnProj('fish', p.x, p.y, v.x * c - v.y * s, v.x * s + v.y * c, true);
  }
  burst(p.x, G - p.y, 0, 5, 0xf3eede, 120, 6, 0);
  sfx.split();
}

function aimVelocity() {
  return { x: Math.max(0.5, aim.dx * POWER), y: -aim.dy * POWER };
}

function fire() {
  const v = aimVelocity();
  spawnProj(ammoAt(ammoIdx), LAUNCH.x, LAUNCH.y, v.x, v.y);
  throws++; ammoIdx++; throwCool = 0.5; rac.throwT = 0.25;
  taught |= 1;
  setHeld();
  sfx.throw();
}

canvas.addEventListener('pointerdown', e => {
  initAudio();
  if (state !== 'play') return;
  const p = toWorld(e);
  if (!p) return;
  const fish = projs.find(o => o.type === 'fish' && !o.split && !o.hitAt);
  if (fish) { splitFish(fish); return; }
  if (hideHeld() || throwCool > 0 || rac.hide > 0.2) return;
  aim = { id: e.pointerId, sx: p.x, sy: p.y, dx: 0, dy: 0 };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!aim || e.pointerId !== aim.id) return;
  const p = toWorld(e);
  if (!p) return;
  let dx = aim.sx - p.x, dy = aim.sy - p.y;
  const len = Math.hypot(dx, dy);
  if (len > MAX_PULL) { dx *= MAX_PULL / len; dy *= MAX_PULL / len; }
  aim.dx = dx; aim.dy = dy;
});
function endAim(e) {
  if (!aim || e.pointerId !== aim.id) return;
  if (e.type === 'pointerup' && state === 'play' && Math.hypot(aim.dx, aim.dy) > 25) fire();
  aim = null;
}
canvas.addEventListener('pointerup', endAim);
canvas.addEventListener('pointercancel', endAim);
canvas.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('keydown', e => {
  if (e.code === 'Space') { hideKey = true; e.preventDefault(); }
  else if (e.code === 'KeyR' && state !== 'menu') startLevel(levelIdx);
  else if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', e => { if (e.code === 'Space') hideKey = false; });
window.addEventListener('blur', () => { hideKey = false; hideBtnDown = false; });

const hideBtn = $('hideBtn');
hideBtn.addEventListener('pointerdown', e => { initAudio(); hideBtnDown = true; hideBtn.setPointerCapture(e.pointerId); e.preventDefault(); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) hideBtn.addEventListener(ev, () => { hideBtnDown = false; });

function toggleMute() {
  muted = !muted;
  $('muteBtn').textContent = 'Sound: ' + (muted ? 'off' : 'on');
}
$('muteBtn').addEventListener('click', () => { initAudio(); toggleMute(); });
$('restartBtn').addEventListener('click', () => { initAudio(); if (state !== 'menu') startLevel(levelIdx); });
$('overlay').addEventListener('click', e => {
  const act = e.target.dataset && e.target.dataset.act;
  if (!act) return;
  initAudio();
  if (act === 'play' || act === 'retry') startLevel(act === 'play' ? 0 : levelIdx);
  else if (act === 'next') startLevel((levelIdx + 1) % LEVELS.length);
});

// ---------- overlays ----------
function showOverlay(html) {
  $('overlay').innerHTML = '<div class="panel">' + html + '</div>';
  $('overlay').classList.add('show');
}
function showMenu() {
  showOverlay(
    '<h1>Trash Panda Heist</h1>' +
    '<p>Dinner is in the dumpster, but the night crew keeps stacking boxes around it.</p>' +
    '<p><b>Drag back and release</b> anywhere to fling trash and smash the boxes.</p>' +
    '<p><b>Hold SPACE</b> (or the HIDE button) to duck into the trash can when the back door opens. If a worker spots you, they throw a box at you.</p>' +
    '<p>Clear every box from the marked area and the raccoon climbs in.</p>' +
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
    '<p>The night crew chased the raccoon off. Duck into the can as soon as the door light comes on.</p>' +
    '<div class="row"><button data-act="retry">Try again</button></div>');
}

// ---------- updates ----------
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
  return pool[Math.floor(Math.random() * pool.length)].x;
}

function setCarry(type) {
  while (wk.carry.children.length) wk.carry.remove(wk.carry.children[0]);
  if (type) wk.carry.add(boxMesh(type).g);
  wk.carrying = !!type;
}

function fly(type, from, to, dur, arc, kind) {
  const mesh = boxMesh(type).g;
  scene.add(mesh);
  flying.push({ mesh, type, from, to, dur, arc, kind, t: 0 });
}

function landPlaced(f) {
  const s = SPEC[f.type], all = Composite.allBodies(world);
  let bottom = columnTop(f.to.x) - 14;
  for (let i = 0; i < 8; i++) {
    const region = { min: { x: f.to.x - s.w / 2 + 2, y: bottom - s.h }, max: { x: f.to.x + s.w / 2 - 2, y: bottom - 1 } };
    if (!Query.region(all, region).length) break;
    bottom -= 30;
  }
  addBox(f.type, f.to.x, bottom);
}

function landAttack() {
  const x = lerp(RAC_X, CAN_X, rac.hide);
  if (rac.hide < 0.6 && rac.invuln <= 0 && state === 'play') {
    hearts--;
    rac.invuln = 1.5;
    shake = 16;
    aim = null;
    burst(x, 70, 30, 10, 0xc9975c, 280, 12);
    sfx.hurt();
    if (hearts <= 0) { state = 'lost'; endT = 0; sfx.lose(); }
  } else {
    burst(x, 130, 30, 7, 0xc9975c, 220, 10);
    sfx.clang();
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

function updateWorker(dt) {
  const L = level, playing = state === 'play';
  let doorOpen = wk.state !== 'idle' && wk.state !== 'warn';
  let moving = false;
  wk.cool = Math.max(0, wk.cool - dt);
  wk.pause = Math.max(0, wk.pause - dt);
  const canMove = playing && wk.pause <= 0;

  if (wk.state === 'idle') {
    if (playing) { wk.timer -= dt; if (wk.timer <= 0) { wk.state = 'warn'; wk.timer = 1.6; sfx.door(); } }
  } else if (wk.state === 'warn') {
    if (playing) wk.timer -= dt;
    doorOpen = wk.timer < 0.7;
    if (wk.timer <= 0) {
      Object.assign(wk, { state: 'emerge', x: DOOR_X, z: -300, face: -1, col: pickColumn(), alert: 0 });
      wk.type = Math.random() < L.crates ? 'crate' : Math.random() < 0.3 ? 'small' : 'box';
      setCarry(wk.type);
      wk.group.visible = true;
    }
  } else if (wk.state === 'emerge') {
    if (canMove) { wk.z = Math.min(DOCK_Z, wk.z + L.speed * dt); moving = true; }
    if (wk.z >= DOCK_Z) wk.state = 'out';
  } else if (wk.state === 'out') {
    if (canMove) { wk.x = Math.max(STAND_X, wk.x - L.speed * dt); moving = true; }
    if (wk.x <= STAND_X) { wk.state = 'lob'; wk.timer = 0.6; }
  } else if (wk.state === 'lob') {
    if (canMove) wk.timer -= dt;
    if (wk.timer <= 0) {
      const top = columnTop(wk.col);
      fly(wk.type, { x: wk.x - 50, y: DOCK_Y + 150, z: wk.z + 20 }, { x: wk.col, y: G - top + 40, z: 0 }, 0.75, 120, 'place');
      setCarry(null);
      wk.state = 'linger';
      wk.timer = 1.0 + L.linger;
    }
  } else if (wk.state === 'linger') {
    if (canMove) wk.timer -= dt;
    if (wk.timer <= 0) { wk.state = 'return'; wk.face = 1; }
  } else if (wk.state === 'return') {
    if (canMove) { wk.x = Math.min(DOOR_X, wk.x + L.speed * dt); moving = true; }
    if (wk.x >= DOOR_X) wk.state = 'enter';
  } else if (wk.state === 'enter') {
    if (canMove) { wk.z = Math.max(-300, wk.z - L.speed * dt); moving = true; }
    if (wk.z <= -300) { wk.state = 'idle'; wk.timer = L.interval; wk.group.visible = false; }
  }

  const watching = playing && (wk.state === 'emerge' || wk.state === 'out' || wk.state === 'lob' || wk.state === 'linger');
  const exposed = rac.hide < 0.6;
  if (watching && exposed) {
    wk.alert = Math.min(1, wk.alert + dt / L.spot);
    if (!spottedLatch) { spottedLatch = true; sfx.spotted(); }
  } else {
    wk.alert = Math.max(0, wk.alert - dt * 1.6);
    if (wk.alert === 0) spottedLatch = false;
  }
  if (watching && wk.alert >= 1 && wk.cool <= 0) {
    fly('small', { x: wk.x - 50, y: DOCK_Y + 170, z: wk.z + 20 }, { x: RAC_X, y: 75, z: 24 }, L.flight, 170, 'attack');
    wk.alert = 0.25; wk.cool = 2.2; wk.pause = 0.55;
  }
  wk.watching = watching;

  wk.door += clamp((doorOpen ? 1 : 0) - wk.door, -dt * 3, dt * 3);
  doorPanel.scale.y = 1 - wk.door * 0.93;
  doorPanel.position.y = DOCK_Y + 174 - 87 * doorPanel.scale.y;
  const blink = wk.state === 'warn' && Math.sin(time * 22) > 0;
  doorLamp.material.color.copy(wk.state === 'warn' ? (blink ? lampWarn : lampOff) : watching ? lampHot : doorOpen ? lampWarn : lampOff);

  if (!wk.group.visible) return;
  if (moving) wk.walk += dt * L.speed * 0.06;
  const sw = moving ? Math.sin(wk.walk) * 0.55 : 0;
  wk.group.position.set(wk.x, DOCK_Y + (moving ? Math.abs(Math.sin(wk.walk)) * 5 : 0), wk.z);
  wk.group.rotation.y = wk.face < 0 ? 0.4 : Math.PI - 0.4;
  wk.legs[0].rotation.z = sw;
  wk.legs[1].rotation.z = -sw;
  const armTarget = wk.pause > 0 ? -2.6 : wk.carrying ? -1.25 : 0;
  for (let i = 0; i < 2; i++) wk.arms[i].rotation.z = wk.carrying || wk.pause > 0 ? armTarget : (i ? sw : -sw) * 0.8;
  const a = wk.alert;
  wk.bang.visible = a > 0.05;
  wk.bang.scale.setScalar(0.7 + a * 0.9);
  wk.bang.rotation.y = -wk.group.rotation.y;
  wk.bangMat.color.set(a > 0.7 ? 0xff4a3a : 0xffd23f);
}

function updateRaccoon(dt) {
  const g = rac.group;
  rac.invuln = Math.max(0, rac.invuln - dt);
  rac.throwT = Math.max(0, rac.throwT - dt);

  if (state === 'winning') {
    endT += dt;
    g.visible = true;
    rac.tail.scale.setScalar(1);
    canLid.position.y = 124; canLid.rotation.z = 0;
    if (endT < 1.4) {
      const k = endT / 1.4;
      g.position.set(lerp(RAC_X, 850, k), Math.abs(Math.sin(k * Math.PI * 5)) * 28, lerp(24, 0, k) + Math.sin(k * Math.PI) * 80);
      g.rotation.set(0, -0.2, 0);
    } else if (endT < 2.1) {
      const k = (endT - 1.4) / 0.7;
      g.position.set(lerp(850, 1050, k), lerp(0, 165, k) + Math.sin(k * Math.PI) * 170, 0);
      g.rotation.set(0, -0.2, -k * Math.PI * 2);
    } else if (endT < 2.7) {
      const k = (endT - 2.1) / 0.6;
      g.position.set(1050, lerp(165, 80, k), 0);
      g.rotation.set(0, -0.9, 0);
      g.scale.setScalar(RS * lerp(1, 0.6, k));
      if (k > 0.4 && !rac.splashed) { rac.splashed = true; burst(1050, 190, 0, 14, 0xf2c14e, 320, 10); burst(1050, 190, 0, 8, 0x3b4052, 260, 12); }
    } else {
      state = 'won';
      sfx.win();
      showWin();
    }
    return;
  }
  if (state === 'won') {
    g.position.set(1050, 92 + Math.sin(time * 5) * 5, 0);
    g.rotation.set(0, -1.0, 0);
    g.scale.setScalar(RS * 0.8);
    return;
  }
  if (state === 'lost') {
    endT += dt;
    g.visible = true;
    g.position.x -= 520 * dt;
    g.position.y = Math.abs(Math.sin(endT * 16)) * 24;
    g.rotation.set(0, Math.PI + 0.45, 0);
    if (endT > 1.1 && !$('overlay').classList.contains('show')) showLose();
    return;
  }

  const want = hideHeld() && state === 'play' ? 1 : 0;
  rac.hide += clamp(want - rac.hide, -dt / 0.16, dt / 0.16);
  const h = rac.hide, pull = aim ? Math.hypot(aim.dx, aim.dy) / MAX_PULL : 0;
  g.position.set(lerp(RAC_X, CAN_X, h), (lerp(0, 38, h) + Math.sin(h * Math.PI) * 46) * RS, lerp(24, 0, h));
  g.rotation.set(0, lerp(-0.45, -1.0, h), pull * 0.22);
  g.scale.set(RS, RS * (1 + Math.sin(time * 3) * 0.015), RS);
  g.visible = rac.invuln <= 0 || Math.sin(time * 40) > 0;
  rac.tail.scale.setScalar(Math.max(0.001, 1 - h));
  rac.tail.rotation.z = Math.sin(time * 4) * 0.12;
  rac.head.rotation.z = pull * -0.15;
  canLid.position.y = 124 + h * 33;
  canLid.rotation.z = h * 0.14;

  const swing = rac.throwT > 0 ? lerp(0.6, 3.3, rac.throwT / 0.25) : 2.2 + pull * 1.2;
  rac.armR.rotation.z = h > 0.3 ? 0.2 : swing;
  rac.armL.rotation.z = h > 0.3 ? 0.2 : 0.5;

  hideBtn.classList.toggle('active', h > 0.5);
}

function updateAimVisuals() {
  const show = state === 'play' && rac.hide < 0.25 && throwCool <= 0;
  held.visible = show;
  if (show) {
    const ox = aim ? aim.dx * 0.13 : 0, oy = aim ? aim.dy * 0.13 : 0;
    held.position.set(LAUNCH.x - ox, G - LAUNCH.y - oy + Math.sin(time * 3) * 1.5, 26);
    held.rotation.z = aim ? time * 6 : 0;
  }
  const active = show && aim && Math.hypot(aim.dx, aim.dy) > 25;
  let x = LAUNCH.x, y = LAUNCH.y, v = active ? aimVelocity() : null, alive = active;
  for (let i = 0; i < dots.length; i++) {
    if (alive) {
      for (let s = 0; s < 3; s++) { v.x *= 1 - AIR; v.y = v.y * (1 - AIR) + GRAV; x += v.x; y += v.y; }
      if (y > G - 6) alive = false;
    }
    dots[i].visible = alive;
    if (alive) dots[i].position.set(x, G - y, 0);
  }
}

function updateProjectiles(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const o = projs[i], p = o.body.position;
    o.age += dt;
    if (o.hitAt && o.body.speed < 0.4) o.still += dt;
    const gone = p.x < -300 || p.x > 1700 || p.y > G + 300;
    if (gone || o.age > 10 || (o.hitAt && time - o.hitAt > 3.2) || o.still > 0.8) {
      if (!gone) burst(p.x, G - p.y, 0, 5, 0xdfe3ee, 110, 8, 0);
      removeObj(projs, o);
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
  for (const list of [boxes, projs]) for (const o of list) {
    o.mesh.position.set(o.body.position.x, G - o.body.position.y, 0);
    o.mesh.rotation.z = -o.body.angle;
  }
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

const hud = {};
function setText(id, text) { if (hud[id] !== text) { hud[id] = text; $(id).textContent = text; } }
function setClass(id, cls) { if (hud[id + '.c'] !== cls) { hud[id + '.c'] = cls; $(id).className = cls; } }

function updateHud(n) {
  setText('lvl', 'Level ' + (levelIdx + 1) + ': ' + level.name);
  const hk = 'h' + hearts;
  if (hud.hearts !== hk) {
    hud.hearts = hk;
    $('hearts').innerHTML = [1, 2, 3].map(i => '<span class="' + (i <= hearts ? '' : 'off') + '">&#9829;</span>').join('');
  }
  setText('blockers', 'Boxes blocking: ' + n);
  setText('throws', 'Throws: ' + throws + ' (par ' + level.par + ')');

  let cls = '', text = '';
  if (state === 'play') {
    if (wk.state === 'warn') { cls = 'warn'; text = 'Back door opening!'; }
    else if (wk.watching && rac.hide < 0.6) { cls = 'danger'; text = 'Spotted! Hide!'; }
    else if (wk.watching) { cls = 'calm'; text = 'Stay hidden...'; }
    else if (wk.state === 'return' || wk.state === 'enter') { cls = 'safe'; text = 'Coast is clear'; }
  }
  setText('banner', text);
  setClass('banner', cls);
  setClass('watch', wk.watching ? 'on' : '');
  $('watchBar').style.width = Math.round(wk.alert * 100) + '%';

  const now = ammoAt(ammoIdx), next = ammoAt(ammoIdx + 1);
  const key = now + next;
  if (hud.ammo !== key) {
    hud.ammo = key;
    $('ammoLine').innerHTML = 'Throwing: <b>' + AMMO[now].name + '</b>. ' + AMMO[now].hint + ' Next: <b>' + AMMO[next].name + '</b>';
  }
  const fishUp = projs.some(o => o.type === 'fish' && !o.split && !o.hitAt);
  setText('hint', fishUp ? 'Tap now to split the fish bones!'
    : !(taught & 1) ? 'Drag back anywhere and release to throw.'
    : !(taught & 2) ? 'Hold SPACE or the HIDE button to duck into the can.' : '');
}

function update(dt) {
  time += dt;
  if (state !== 'menu') levelTime += state === 'play' ? dt : 0;
  throwCool = Math.max(0, throwCool - dt);
  if (hideHeld()) aim = null;

  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 4) {
    Engine.update(engine, 1000 / 60);
    afterStep();
    acc -= STEP;
    steps++;
  }
  if (steps === 4) acc = 0;

  updateWorker(dt);
  updateFlying(dt);
  updateRaccoon(dt);
  updateProjectiles(dt);
  syncMeshes();
  updateAimVisuals();
  updateParticles(dt);

  const n = blockers();
  if (state === 'play') {
    clearT = n === 0 && levelTime > 1 ? clearT + dt : 0;
    if (clearT > 0.8) {
      state = 'winning';
      endT = 0;
      rac.splashed = false;
      aim = null;
      for (const f of flying) scene.remove(f.mesh);
      flying.length = 0;
    }
  }
  zoneBars.visible = state === 'play' || state === 'menu';
  zoneBars.children.forEach(b => { b.material.color.setHex(Math.sin(time * 5) > 0 ? 0xffe07a : 0xffb347); });
  updateHud(n);

  shake = Math.max(0, shake - dt * 40);
  camera.position.set(camBase.x + rand(-1, 1) * shake, camBase.y + rand(-1, 1) * shake, camBase.z);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  renderer.render(scene, camera);
}

if (location.search.includes('debug')) {
  window.TPH = {
    step(sec) { for (let t = 0; t < sec; t += STEP) update(STEP); renderer.render(scene, camera); },
    fire(dx, dy) { aim = { id: -1, sx: 0, sy: 0, dx, dy }; fire(); aim = null; },
    hide(v) { hideKey = v; },
    aim(dx, dy) { aim = { id: -1, sx: 0, sy: 0, dx, dy }; },
    start(i) { startLevel(i); },
    view(x, y, d) { camBase.set(x - 80, y + d * 0.1, d); camera.position.copy(camBase); camera.lookAt(x, y, 0); renderer.render(scene, camera); },
    info: () => ({ state, hearts, throws, blockers: blockers(), worker: wk.state, alert: +wk.alert.toFixed(2), boxes: boxes.length, projs: projs.length, levelTime: +levelTime.toFixed(1), hide: rac.hide }),
    boxes: () => boxes.map(o => [o.type, Math.round(o.body.position.x), Math.round(G - o.body.position.y), Math.round(o.hp), +o.body.angle.toFixed(2)]),
  };
}

resize();
loadLevel(0);
showMenu();
if (!window.TPH) requestAnimationFrame(frame);
})();
