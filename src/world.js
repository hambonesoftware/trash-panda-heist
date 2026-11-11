import * as THREE from 'three';
import { M, RB, SP, CY, CA, CO, ell, put, toon, glowMat, rimU, RoundedBoxGeometry } from './gfx.js';
import { rand, rng, lerp } from './util.js';
import { G, ZONE, DUMP_X, DOOR_X, DOCK_Y, CAN_X, CS } from './config.js';

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}
function tex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const softDot = tex(canvas(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
}));

function bubbleText(g, text, x, y, size, fill, stroke) {
  g.font = `900 ${size}px "Luckiest Guy", "Arial Black", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = size * 0.28; g.strokeStyle = '#120c1c'; g.strokeText(text, x, y);
  g.lineWidth = size * 0.12; g.strokeStyle = stroke; g.strokeText(text, x, y);
  g.fillStyle = fill; g.fillText(text, x, y);
}

function brickWall() {
  return canvas(2048, 720, (g, w, h) => {
    g.fillStyle = '#3f2330'; g.fillRect(0, 0, w, h);
    const bw = 48, bh = 20;
    for (let r = 0; r * bh < h; r++) for (let c = -1; c * bw < w + bw; c++) {
      const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * bh;
      g.fillStyle = `hsl(${rand(354, 374) % 360}, ${rand(38, 52)}%, ${rand(27, 36)}%)`;
      g.fillRect(x + 2, y + 2, bw - 3, bh - 3);
      g.fillStyle = 'rgba(255,210,200,0.08)'; g.fillRect(x + 2, y + 2, bw - 3, 3);
      if (rng() < 0.08) { g.fillStyle = 'rgba(15,8,20,0.3)'; g.fillRect(x + rand(4, 30), y + rand(4, 12), rand(4, 12), rand(2, 5)); }
    }
    let gr = g.createLinearGradient(0, h * 0.55, 0, h);
    gr.addColorStop(0, 'rgba(12,8,24,0)'); gr.addColorStop(1, 'rgba(12,8,24,0.6)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    gr = g.createLinearGradient(0, 0, 0, h * 0.25);
    gr.addColorStop(0, 'rgba(12,8,24,0.45)'); gr.addColorStop(1, 'rgba(12,8,24,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h * 0.25);
    for (let i = 0; i < 16; i++) { g.fillStyle = 'rgba(12,8,24,0.18)'; g.fillRect(rand(0, w), rand(0, h * 0.3), rand(3, 10), rand(80, 320)); }
    // Posters
    const poster = (x, y, pw, ph, bg, a, b, ink, rot) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-pw / 2 + 5, -ph / 2 + 6, pw, ph);
      g.fillStyle = bg; g.fillRect(-pw / 2, -ph / 2, pw, ph);
      g.fillStyle = ink; g.font = `900 ${pw * 0.2}px "Arial Black", sans-serif`; g.textAlign = 'center';
      g.fillText(a, 0, -ph * 0.22);
      g.font = `bold ${pw * 0.12}px "Trebuchet MS", sans-serif`; g.fillText(b, 0, ph * 0.32);
      g.strokeStyle = ink; g.lineWidth = 4; g.strokeRect(-pw * 0.3, -ph * 0.1, pw * 0.6, ph * 0.3);
      g.restore();
    };
    poster(250, 430, 120, 160, '#e9dcb2', 'LOST', 'HAVE YOU SEEN', '#7a2a2a', -0.05);
    poster(395, 455, 110, 140, '#f2b84b', 'LIVE', 'JAZZ TONITE', '#2a1d3a', 0.04);
    poster(1800, 420, 120, 160, '#8fc6d8', 'SALE', 'EVERYTHING GOES', '#142030', 0.03);
    // Graffiti tag
    g.save(); g.translate(560, 470); g.rotate(-0.06);
    bubbleText(g, 'TRASH', 0, -40, 86, '#b08cff', '#4fe0d0');
    bubbleText(g, 'PANDA', 40, 46, 86, '#4fe0d0', '#b08cff');
    g.restore();
  });
}

// Sky, fog and light for each meal time. `night` drives lamps, neon, stars and city windows.
const TIMES = [
  { h: 0,  top: 0x070926, mid: 0x2a2266, bot: 0x7a4386, fog: 0x2b2457, sky: 0x95a3ff, gnd: 0x3b2a52, hemi: 1.35, key: 0xc9d7ff, keyI: 2.1, pos: [-300, 1300, 1100], night: 1,    cloud: 1,   rim: 0x9cc0ff },
  { h: 6,  top: 0x5f78c8, mid: 0xffa98a, bot: 0xffe0a8, fog: 0xc79aa6, sky: 0xffdcc0, gnd: 0x6a566c, hemi: 1.8,  key: 0xffb788, keyI: 2.6, pos: [2300, 620, 1000],  night: 0.12, cloud: 2.1, rim: 0xffc79a },
  { h: 12, top: 0x2f7fd6, mid: 0x86c8f4, bot: 0xd6eefa, fog: 0xb4d6ee, sky: 0xe6f4ff, gnd: 0x77777f, hemi: 2.0,  key: 0xfff3dc, keyI: 2.9, pos: [500, 1900, 1000],  night: 0,    cloud: 2.6, rim: 0xffffff },
  { h: 18, top: 0x4a3a86, mid: 0xf0688a, bot: 0xffb05a, fog: 0xa8607a, sky: 0xffbe96, gnd: 0x4a3458, hemi: 1.65, key: 0xff9257, keyI: 2.5, pos: [-1700, 520, 1000], night: 0.35, cloud: 1.8, rim: 0xffb07a },
  { h: 24, top: 0x070926, mid: 0x2a2266, bot: 0x7a4386, fog: 0x2b2457, sky: 0x95a3ff, gnd: 0x3b2a52, hemi: 1.35, key: 0xc9d7ff, keyI: 2.1, pos: [-300, 1300, 1100], night: 1,    cloud: 1,   rim: 0x9cc0ff },
];

function skyline(scene, { z, width, height, y0, color, density, glow, seedTall }) {
  const cw = 2048, ch = 512;
  const win = canvas(cw, ch, g => { g.fillStyle = '#000'; g.fillRect(0, 0, cw, ch); });
  const wg = win.getContext('2d');
  const sil = canvas(cw, ch, g => {
    let x = -20;
    while (x < cw) {
      const bw = rand(50, 150), bh = rand(ch * 0.22, ch * seedTall), top = ch - bh;
      g.fillStyle = color;
      g.fillRect(x, top, bw, bh);
      const r = rng();
      if (r < 0.22) {
        const tx = x + rand(10, Math.max(12, bw - 40));
        g.fillRect(tx, top - 46, 30, 30);
        g.beginPath(); g.moveTo(tx - 4, top - 46); g.lineTo(tx + 15, top - 64); g.lineTo(tx + 34, top - 46); g.fill();
        g.fillRect(tx + 3, top - 17, 3, 17); g.fillRect(tx + 24, top - 17, 3, 17);
      } else if (r < 0.42) {
        g.fillRect(x + bw * 0.5, top - 70, 3, 70);
        wg.fillStyle = '#ff3b3b'; wg.fillRect(x + bw * 0.5 - 2, top - 74, 7, 7);
      } else if (r < 0.58) {
        g.fillRect(x + bw * 0.18, top - 26, bw * 0.64, 26);
        g.fillRect(x + bw * 0.34, top - 48, bw * 0.32, 22);
      }
      for (let wy = top + 12; wy < ch - 8; wy += 16) for (let wx = x + 8; wx < x + bw - 10; wx += 13) {
        if (rng() < density) { wg.fillStyle = rng() < 0.82 ? '#ffd27a' : '#9fd4ff'; wg.fillRect(wx, wy, 6, 8); }
      }
      x += bw + rand(-12, 6);
    }
  });
  const geo = new THREE.PlaneGeometry(width, height);
  const a = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex(sil), transparent: true, alphaTest: 0.4, fog: true }));
  const b = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: tex(win), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false,
    color: new THREE.Color(glow, glow, glow),
  }));
  a.position.set(700, y0 + height / 2, z);
  b.position.set(700, y0 + height / 2, z + 2);
  scene.add(a, b);
  return { mat: b.material, glow };
}

function cone(r, h, color, opacity) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { col: { value: new THREE.Color(color) }, op: { value: opacity } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 col; uniform float op; varying vec2 vUv; void main() { gl_FragColor = vec4(col, pow(vUv.y, 1.7) * op); }',
  });
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 32, 1, true), mat);
  m.rotation.z = Math.PI;
  m.position.y = -h / 2;
  const pivot = new THREE.Group();
  pivot.add(m);
  pivot.userData.mat = mat;
  return pivot;
}

export function buildWorld(scene, view) {
  const W = { t: 0 };
  scene.fog = new THREE.Fog(0x2b2457, 3800, 10500);

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0x95a3ff, 0x3b2a52, 1.35);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xc9d7ff, 2.1);
  moon.position.set(-300, 1300, 1100);
  moon.target.position.set(760, 80, -60);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -2700, right: 1300, top: 1100, bottom: -1000, near: 100, far: 6500 });
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 2.5;
  scene.add(moon, moon.target);
  view.shadowLights.push(moon);

  // ---------- sky ----------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(11000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x070926) }, mid: { value: new THREE.Color(0x2a2266) }, bot: { value: new THREE.Color(0x7a4386) } },
    vertexShader: 'varying vec3 vP; void main() { vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main() { float h = normalize(vP - cameraPosition).y; vec3 c = mix(bot, mid, smoothstep(-0.03, 0.12, h)); c = mix(c, top, smoothstep(0.12, 0.45, h)); gl_FragColor = vec4(c, 1.0); }',
  }));
  sky.position.set(700, 200, 0);
  sky.renderOrder = -1;
  scene.add(sky);
  scene.background = new THREE.Color(0x2a2266);
  const starPos = [];
  for (let i = 0; i < 260; i++) starPos.push(rand(-6000, 7500), rand(900, 4200), -8500);
  const stars = new THREE.BufferGeometry();
  stars.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.55, 1.3), size: 2.2, sizeAttenuation: false, fog: false, toneMapped: false, transparent: true });
  scene.add(new THREE.Points(stars, starMat));

  const moonTex = tex(canvas(512, 512, g => {
    const gr = g.createRadialGradient(230, 220, 20, 256, 256, 250);
    gr.addColorStop(0, '#fffbe6'); gr.addColorStop(0.85, '#f1e6bf'); gr.addColorStop(1, '#d8c896');
    g.fillStyle = gr; g.beginPath(); g.arc(256, 256, 250, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(160,140,110,0.35)';
    for (const [x, y, r] of [[180, 200, 40], [300, 170, 26], [320, 320, 52], [200, 340, 22], [360, 240, 18], [140, 290, 16]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  }));
  const moonDisk = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, fog: false, toneMapped: false, color: new THREE.Color(1.5, 1.45, 1.3) }));
  moonDisk.position.set(-1500, 2300, -8000);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200), new THREE.MeshBasicMaterial({ map: softDot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: new THREE.Color(0.35, 0.33, 0.55) }));
  halo.position.set(-1500, 2300, -8010);
  scene.add(halo, moonDisk);
  const sunDisk = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), new THREE.MeshBasicMaterial({ map: softDot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
  sunDisk.visible = false;
  scene.add(sunDisk);

  const cloudTex = tex(canvas(512, 160, g => {
    for (let i = 0; i < 9; i++) {
      const x = 60 + i * 48 + rand(-10, 10), y = 100 + rand(-20, 15), r = rand(36, 62);
      g.fillStyle = '#8b84c8'; g.beginPath(); g.arc(x, y - 5, r, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 9; i++) {
      const x = 60 + i * 48 + rand(-10, 10), y = 108 + rand(-20, 10), r = rand(34, 58);
      g.fillStyle = '#39326f'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'destination-out';
    g.fillRect(0, 150, 512, 10);
  }));
  W.clouds = [];
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(1500, 470), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 }));
    c.position.set(rand(-4000, 5000), rand(1700, 3200), -7000 + i * 40);
    c.userData.speed = rand(18, 40);
    scene.add(c);
    W.clouds.push(c);
  }

  const city = [
    skyline(scene, { z: -5200, width: 16000, height: 3400, y0: -200, color: '#3c3577', density: 0.1, glow: 0.7, seedTall: 0.85 }),
    skyline(scene, { z: -3600, width: 11000, height: 2200, y0: -150, color: '#2a2558', density: 0.16, glow: 1.05, seedTall: 0.8 }),
    skyline(scene, { z: -2200, width: 7600, height: 1350, y0: -80, color: '#1b1838', density: 0.2, glow: 1.4, seedTall: 0.75 }),
  ];

  W.beams = [];
  for (const [x, z, ph] of [[-900, -4200, 0], [2300, -3900, 2.1]]) {
    const b = cone(420, 6000, 0x9fb6ff, 0.16);
    b.position.set(x, 0, z);
    b.userData.ph = ph;
    scene.add(b);
    W.beams.push(b);
  }

  // ---------- alley ----------
  const asphalt = tex(canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#525777'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const v = rand(-1, 1); g.fillStyle = v > 0 ? `rgba(255,255,255,${v * 0.05})` : `rgba(0,0,20,${-v * 0.1})`; g.fillRect(rand(0, w), rand(0, h), 2, 2); }
    g.strokeStyle = 'rgba(20,18,40,0.55)'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { g.beginPath(); let x = rand(0, w), y = rand(0, h); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rand(-40, 40); y += rand(-40, 40); g.lineTo(x, y); } g.stroke(); }
  }), [10, 4]);
  asphalt.repeat.set(16, 22);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(11000, 15000), toon(0xffffff, { map: asphalt, rim: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(700, 0, 6400);
  ground.receiveShadow = true;
  scene.add(ground);
  for (const x of [380, 640, 900, 1160]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(10, 300), toon(0xe2ddc4, { rim: 0 }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.6, 360);
    line.receiveShadow = true;
    scene.add(line);
  }
  const puddleMat = new THREE.MeshBasicMaterial({ color: 0x3a4486, transparent: true, opacity: 0.75, fog: true });
  for (const [x, z, sx, sz] of [[560, 170, 120, 46], [1330, 230, 150, 50], [-20, 260, 90, 34]]) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(1, 32), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.scale.set(sx, sz, 1);
    p.position.set(x, 0.8, z);
    scene.add(p);
    const glint = new THREE.Mesh(new THREE.PlaneGeometry(sx * 0.8, sz * 0.4), new THREE.MeshBasicMaterial({ map: softDot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(0.5, 0.55, 0.9) }));
    glint.rotation.x = -Math.PI / 2;
    glint.position.set(x + sx * 0.1, 1, z);
    scene.add(glint);
  }

  const wall = new THREE.Mesh(new THREE.BoxGeometry(1600, 560, 40), toon(0xffffff, { map: tex(brickWall()), rim: 0.3 }));
  wall.position.set(1150, 280, -350);
  wall.receiveShadow = true;
  scene.add(wall);
  scene.add(put(RB(1630, 22, 64, 0x4c2f46, 3, 4), 1150, 565, -345));
  scene.add(put(RB(1610, 16, 30, 0x5f6076, 2, 4), 1150, 8, -322));

  const plank = tex(canvas(1024, 256, (g, w, h) => {
    for (let c = 0; c < 16; c++) {
      g.fillStyle = `hsl(${rand(22, 30)}, ${rand(22, 32)}%, ${rand(24, 32)}%)`;
      g.fillRect(c * 64 + 2, rand(0, 16), 60, h);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let k = 0; k < 5; k++) g.fillRect(c * 64 + rand(6, 54), 0, 1.5, h);
      g.fillStyle = '#1a1420'; g.fillRect(c * 64 + 28, 40, 4, 4); g.fillRect(c * 64 + 28, 200, 4, 4);
    }
  }), [2, 1]);
  const fence = new THREE.Mesh(new THREE.BoxGeometry(1500, 230, 12), toon(0xffffff, { map: plank, rim: 0.3 }));
  fence.position.set(-400, 115, -338);
  fence.receiveShadow = true;
  scene.add(fence);
  scene.add(put(RB(1500, 10, 18, 0x2f2433, 2, 3), -400, 232, -336));

  // Fire escape with a lit window and a cat silhouette.
  const FE = 0x2a2838;
  scene.add(put(RB(240, 6, 72, FE, 2, 2), 560, 420, -312));
  scene.add(put(RB(240, 4, 4, FE, 1.6, 1), 560, 462, -278));
  for (let x = 445; x <= 675; x += 23) scene.add(put(RB(3, 42, 3, FE, 1.2, 1), x, 441, -278));
  for (const x of [610, 650]) scene.add(put(RB(4, 200, 4, FE, 1.4, 1), x, 320, -300));
  for (let y = 240; y <= 400; y += 22) scene.add(put(RB(44, 3, 3, FE, 1.2, 1), 630, y, -300));
  const windowTex = tex(canvas(128, 160, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ffd890'); gr.addColorStop(1, '#ff9e5a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a1a2a';
    g.beginPath(); g.ellipse(84, 128, 18, 22, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(84, 98, 13, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(74, 90); g.lineTo(76, 76); g.lineTo(82, 88); g.fill();
    g.beginPath(); g.moveTo(94, 90); g.lineTo(92, 76); g.lineTo(86, 88); g.fill();
    g.fillRect(100, 128, 22, 6);
    g.fillStyle = 'rgba(60,30,40,0.5)'; for (let y = 0; y < 60; y += 10) g.fillRect(0, y, w, 5);
    g.fillStyle = '#2a1d2a'; g.fillRect(60, 0, 8, h); g.fillRect(0, 76, w, 8);
  }));
  for (const [x, lit] of [[520, true], [760, false], [1540, true]]) {
    scene.add(put(RB(92, 112, 10, 0x2b2036, 2.4, 3), x, 500, -332));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(76, 96), lit
      ? new THREE.MeshBasicMaterial({ map: windowTex, color: new THREE.Color(1.5, 1.35, 1.2), toneMapped: false })
      : toon(0x23284d, { rim: 0 }));
    glass.position.set(x, 500, -326);
    scene.add(glass);
    scene.add(put(RB(104, 8, 18, 0x4c3a4e, 1.8, 2), x, 442, -326));
  }

  // Pipes, AC unit, pallet, traffic cone.
  const PIPE = 0x6a6f8a;
  scene.add(put(CY(7, 7, 560, PIPE, 2, 16), 1268, 280, -322));
  for (const y of [90, 260, 430]) scene.add(put(RB(22, 8, 20, 0x3f4258, 1.6, 2), 1268, y, -322));
  const hp = CY(6, 6, 430, PIPE, 2, 16);
  hp.rotation.z = Math.PI / 2;
  scene.add(put(hp, 600, 300, -324));
  scene.add(put(RB(84, 58, 46, 0x9aa1b8, 2.4, 6), 1560, 360, -312));
  const grille = new THREE.Mesh(new THREE.CircleGeometry(20, 24), toon(0x2c2f44, { rim: 0 }));
  scene.add(put(grille, 1548, 360, -288));
  W.fan = new THREE.Group();
  for (let i = 0; i < 3; i++) { const blade = RB(36, 6, 2, 0x5c6178, 0, 1); blade.rotation.z = (i * Math.PI) / 3; W.fan.add(blade); }
  W.fan.position.set(1548, 360, -286);
  scene.add(W.fan);
  const pallet = new THREE.Group();
  for (const y of [-38, 0, 38]) pallet.add(put(RB(120, 14, 10, 0x9b7444, 1.8, 2), 0, y, 0));
  for (const x of [-48, 0, 48]) pallet.add(put(RB(12, 100, 12, 0x7d5a32, 1.8, 2), x, 0, -6));
  pallet.position.set(700, 58, -318);
  pallet.rotation.z = 0.12;
  scene.add(pallet);
  const tcone = new THREE.Group();
  tcone.add(put(RB(44, 6, 44, 0xff7a2a, 1.8, 2), 0, 3, 0));
  tcone.add(put(CO(17, 50, 0xff7a2a, 2, 20), 0, 30, 0));
  tcone.add(put(CY(11, 13.5, 8, 0xf4f1e8, 0, 20), 0, 24, 0));
  tcone.position.set(470, 0, 170);
  tcone.rotation.y = 0.4;
  scene.add(tcone);
  const paperTex = tex(canvas(128, 96, g => {
    g.fillStyle = '#ddd6c0'; g.fillRect(0, 0, 128, 96);
    g.fillStyle = '#504a5a'; g.fillRect(8, 8, 112, 16);
    for (let y = 32; y < 90; y += 7) g.fillRect(8, y, rand(40, 112), 3);
  }));
  for (const [x, z, r] of [[420, 240, 0.4], [760, 120, -0.6], [1180, 260, 1.1], [80, 120, 2.2]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(48, 36), toon(0xffffff, { map: paperTex, rim: 0 }));
    p.rotation.set(-Math.PI / 2, 0, r);
    p.position.set(x, 1.2, z);
    p.receiveShadow = true;
    scene.add(p);
  }

  // Neon store sign.
  scene.add(put(RB(340, 96, 12, 0x1a1626, 3, 6), 1030, 505, -334));
  const neon = tex(canvas(1024, 256, (g, w, h) => {
    g.font = '900 112px "Luckiest Guy", "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.shadowColor = '#ff3d6e'; g.shadowBlur = 30;
    g.strokeStyle = '#ff4f7a'; g.lineWidth = 16; g.strokeText('MEGA-MART', w / 2, h / 2 + 6);
    g.shadowBlur = 0; g.strokeStyle = '#ffe3ea'; g.lineWidth = 5; g.strokeText('MEGA-MART', w / 2, h / 2 + 6);
  }));
  W.neonMat = new THREE.MeshBasicMaterial({ map: neon, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, color: new THREE.Color(2.2, 2.2, 2.2) });
  scene.add(put(new THREE.Mesh(new THREE.PlaneGeometry(320, 80), W.neonMat), 1030, 506, -326));
  W.neonLight = new THREE.PointLight(0xff4f7a, 260, 520, 1);
  W.neonLight.position.set(1030, 470, -250);
  scene.add(W.neonLight);

  // Loading dock and roll-up door.
  scene.add(put(RB(1180, DOCK_Y, 200, 0x8a8fa8, 3, 4), 1230, DOCK_Y / 2, -232));
  scene.add(put(RB(1180, 8, 6, 0xf2c14e, 0, 1), 1230, DOCK_Y - 5, -130));
  for (const x of [880, 1080, 1280, 1480]) scene.add(put(RB(26, 30, 12, 0x24222e, 2, 4), x, 26, -128));
  scene.add(put(RB(122, 196, 10, 0x2e3142, 3, 3), DOOR_X, DOCK_Y + 98, -330));
  W.doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(96, 176), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.05, 0.08), toneMapped: false }));
  W.doorGlow.position.set(DOOR_X, DOCK_Y + 88, -324);
  scene.add(W.doorGlow);
  const slats = tex(canvas(64, 256, (g, w, h) => {
    g.fillStyle = '#8796ab'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { g.fillStyle = '#5f6c80'; g.fillRect(0, y, w, 3); g.fillStyle = '#a5b2c4'; g.fillRect(0, y + 3, w, 2); }
  }));
  W.doorPanel = new THREE.Mesh(new THREE.BoxGeometry(96, 176, 4), toon(0xffffff, { map: slats, rim: 0.5 }));
  W.doorPanel.position.set(DOOR_X, DOCK_Y + 88, -321);
  W.doorPanel.castShadow = true;
  scene.add(W.doorPanel);
  W.doorLampMat = glowMat(0x4b4b58, 1);
  scene.add(put(new THREE.Mesh(new THREE.SphereGeometry(11, 16, 12), W.doorLampMat), DOOR_X, DOCK_Y + 214, -318));
  scene.add(put(RB(32, 10, 16, 0x2e3142, 2, 2), DOOR_X, DOCK_Y + 226, -322));
  W.doorLight = new THREE.PointLight(0xffc27a, 0, 700, 1);
  W.doorLight.position.set(DOOR_X, DOCK_Y + 90, -230);
  scene.add(W.doorLight);

  // Sodium wall lamp over the dock.
  const sodX = 1180;
  scene.add(put(RB(8, 8, 60, 0x2a2838, 1.6, 2), sodX, 352, -310));
  scene.add(put(CO(26, 22, 0x2a2838, 2, 20), sodX, 342, -282));
  scene.add(put(new THREE.Mesh(new THREE.SphereGeometry(9, 14, 10), glowMat(0xffc277, 3)), sodX, 332, -282));
  const sodCone = cone(150, 330, 0xffb05a, 0.13);
  W.nightLights = [];
  sodCone.position.set(sodX, 332, -282);
  scene.add(sodCone);
  const sod = new THREE.PointLight(0xffa24d, 520, 900, 1);
  sod.position.set(sodX, 320, -240);
  scene.add(sod);
  W.nightLights.push({ light: sod, base: 520, cone: sodCone, op: 0.13 });

  // Street lamp on the raccoon's side.
  const LAMP = 0x2a2838;
  scene.add(put(CY(6, 8, 480, LAMP, 2.2, 14), -60, 240, -170));
  const arm = RB(130, 7, 7, LAMP, 1.8, 2);
  scene.add(put(arm, 0, 476, -170));
  scene.add(put(CO(30, 26, LAMP, 2, 20), 60, 464, -170));
  scene.add(put(new THREE.Mesh(new THREE.SphereGeometry(11, 14, 10), glowMat(0xd8ebff, 3)), 60, 452, -170));
  const streetCone = cone(190, 450, 0xb8d4ff, 0.12);
  streetCone.position.set(60, 452, -170);
  scene.add(streetCone);
  W.streetLight = new THREE.PointLight(0xaed0ff, 340, 1000, 1);
  W.streetLight.position.set(90, 430, -60);
  scene.add(W.streetLight);
  W.nightLights.push({ light: W.streetLight, base: 340, cone: streetCone, op: 0.12 });
  W.moths = [];
  const mothMat = glowMat(0xfff4c8, 1.8);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.8, 6, 4), mothMat);
    m.userData = { r: rand(18, 42), s: rand(2, 5) * (rng() < 0.5 ? -1 : 1), ph: rand(0, 6), y: rand(-20, 10) };
    scene.add(m);
    W.moths.push(m);
  }

  // Power lines sagging across the top of the frame.
  for (let i = 0; i < 3; i++) {
    const a = new THREE.Vector3(-900, 660 + i * 22, -650), b = new THREE.Vector3(2400, 630 + i * 22, -650);
    const mid = a.clone().lerp(b, 0.5); mid.y -= 120;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 60, 1.6, 6), toon(0x15121f, { rim: 0 }));
    scene.add(tube);
  }

  // Steam vent and dumpster stink.
  scene.add(put(RB(80, 3, 44, 0x2a2838, 1.6, 1), 640, 1.5, 60));
  const steamMat = () => new THREE.SpriteMaterial({ map: softDot, color: 0xb9b2e6, transparent: true, depthWrite: false, opacity: 0 });
  W.steam = [];
  for (let i = 0; i < 10; i++) { const s = new THREE.Sprite(steamMat()); s.userData.t = i / 10; scene.add(s); W.steam.push(s); }
  const stinkTex = tex(canvas(64, 128, g => {
    g.strokeStyle = '#9fe36b'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(32, 124);
    for (let y = 124; y > 6; y -= 4) g.lineTo(32 + Math.sin(y * 0.09) * 14, y);
    g.stroke();
  }));
  W.stink = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: stinkTex, transparent: true, depthWrite: false, opacity: 0, color: new THREE.Color(1.2, 1.4, 1) }));
    s.scale.set(22, 44, 1);
    s.userData = { t: i / 4, x: rand(960, 1160) };
    scene.add(s);
    W.stink.push(s);
  }

  // ---------- trash can ----------
  const can = new THREE.Group();
  const prof = [[0, 0], [42, 0], [44, 4], [45, 28], [47, 31], [45.4, 34], [46, 60], [48, 63], [46.4, 66], [47, 92], [49, 95], [47.4, 98], [48, 117], [50, 120], [50, 124], [0, 124]];
  can.add(M(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 36), toon(0x9aa5bb, { rim: 0.6 }), 3));
  for (const sz of [-1, 1]) { const h = M(new THREE.TorusGeometry(8, 2.2, 8, 16, Math.PI), 0x7f8aa2, 1.5); h.rotation.y = sz * Math.PI / 2; can.add(put(h, 0, 92, sz * 48)); }
  W.canLid = new THREE.Group();
  const lidProf = [[0, 0], [54, 0], [54, 5], [50, 8], [38, 13], [20, 16], [0, 17]];
  W.canLid.add(M(new THREE.LatheGeometry(lidProf.map(([x, y]) => new THREE.Vector2(x, y)), 36), toon(0xa9b2c6, { rim: 0.4 }), 3));
  const handle = M(new THREE.TorusGeometry(10, 2.6, 8, 16, Math.PI), 0x7f8aa2, 1.6);
  W.canLid.add(put(handle, 0, 17, 0));
  W.canLid.position.set(0, 123, 0);
  can.add(W.canLid);
  can.position.set(CAN_X, 0, 0);
  can.scale.setScalar(CS);
  scene.add(can);
  const bagL = ell(26, 1, 0.8, 0.9, 0x3f4558);
  bagL.position.set(CAN_X - 80, 18, -30);
  scene.add(bagL);

  // ---------- dumpster ----------
  const d = new THREE.Group();
  d.add(put(RB(280, 146, 200, 0x2f9a5c, 3.4, 10), 0, 85, 0));
  d.add(put(RB(296, 14, 214, 0x237447, 3, 5), 0, 155, 0));
  d.add(put(new THREE.Mesh(new THREE.BoxGeometry(268, 2, 188), new THREE.MeshBasicMaterial({ color: 0x0c0b14 })), 0, 161.4, 0));
  for (const x of [-96, -32, 32, 96]) d.add(put(RB(12, 116, 8, 0x237447, 0, 3), x, 82, 101));
  for (const sx of [-1, 1]) d.add(put(RB(10, 36, 124, 0x237447, 2, 3), sx * 145, 96, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wheel = CY(13, 13, 10, 0x22222c, 2, 18);
    wheel.rotation.x = Math.PI / 2;
    d.add(put(wheel, sx * 112, 13, sz * 84));
  }
  const lid = new THREE.Group();
  lid.add(put(RB(292, 8, 200, 0x2a2f45, 3, 3), 0, 0, 100));
  lid.position.set(0, 162, -104);
  lid.rotation.x = -1.85;
  d.add(lid);
  for (const [x, z, r] of [[-92, -66, 20], [-44, -72, 24], [10, -68, 21], [62, -72, 25], [106, -64, 19]]) d.add(put(ell(r, 1, 0.7, 1, 0x3b4052), x, 160, z));
  const pizza = RB(46, 6, 46, 0xe9dcc0, 2, 2);
  pizza.rotation.y = 0.4;
  d.add(put(pizza, 30, 176, -74));
  const stencil = tex(canvas(256, 64, g => {
    g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 256, 64);
    g.font = '900 40px "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(235,240,220,0.85)'; g.fillText('WASTE CO.', 128, 34);
  }));
  const st = new THREE.Mesh(new THREE.PlaneGeometry(150, 38), toon(0xffffff, { map: stencil, rim: 0, transparent: true }));
  d.add(put(st, -40, 120, 101.5));
  d.position.set(DUMP_X, 0, 0);
  scene.add(d);

  // Target-zone corner brackets.
  const y1 = G - ZONE.top;
  W.zoneBars = new THREE.Group();
  W.zoneMat = glowMat(0xffe07a, 1.8);
  for (const [x, sx] of [[ZONE.x0, 1], [ZONE.x1, -1]]) for (const [y, sy] of [[4, 1], [y1, -1]]) {
    W.zoneBars.add(put(new THREE.Mesh(new RoundedBoxGeometry(48, 6, 6, 2, 2), W.zoneMat), x + sx * 24, y, 112));
    W.zoneBars.add(put(new THREE.Mesh(new RoundedBoxGeometry(6, 48, 6, 2, 2), W.zoneMat), x, y + sy * 24, 112));
  }
  scene.add(W.zoneBars);

  const lampOff = new THREE.Color(0.3, 0.3, 0.36), lampWarn = new THREE.Color(2.6, 2, 0.4), lampHot = new THREE.Color(3, 0.6, 0.4);
  W.setDoor = (open, mode) => {
    W.doorPanel.scale.y = 1 - open * 0.93;
    W.doorPanel.position.y = DOCK_Y + 176 - 88 * W.doorPanel.scale.y;
    W.doorGlow.material.color.setRGB(lerp(0.06, 1.15, open), lerp(0.05, 0.85, open), lerp(0.08, 0.5, open));
    W.doorLight.intensity = open * 300;
    const blink = Math.sin(W.t * 22) > 0;
    W.doorLampMat.color.copy(mode === 'warn' ? (blink ? lampWarn : lampOff) : mode === 'hot' ? lampHot : mode === 'on' ? lampWarn : lampOff);
  };

  // ---------- time of day ----------
  const cA = new THREE.Color(), cB = new THREE.Color();
  const mix = (a, b, k) => cA.set(a).lerp(cB.set(b), k);
  W.hour = 0; W.night = 1;
  W.setTime = hour => {
    const hh = ((hour % 24) + 24) % 24;
    let i = 0;
    while (i < TIMES.length - 2 && hh >= TIMES[i + 1].h) i++;
    const a = TIMES[i], b = TIMES[i + 1], k = (hh - a.h) / (b.h - a.h);
    sky.material.uniforms.top.value.copy(mix(a.top, b.top, k));
    sky.material.uniforms.mid.value.copy(mix(a.mid, b.mid, k));
    sky.material.uniforms.bot.value.copy(mix(a.bot, b.bot, k));
    scene.background.copy(mix(a.mid, b.mid, k));
    scene.fog.color.copy(mix(a.fog, b.fog, k));
    hemi.color.copy(mix(a.sky, b.sky, k));
    hemi.groundColor.copy(mix(a.gnd, b.gnd, k));
    hemi.intensity = lerp(a.hemi, b.hemi, k);
    moon.color.copy(mix(a.key, b.key, k));
    moon.intensity = lerp(a.keyI, b.keyI, k);
    moon.position.set(lerp(a.pos[0], b.pos[0], k), lerp(a.pos[1], b.pos[1], k), lerp(a.pos[2], b.pos[2], k));
    rimU.rimColor.value.copy(mix(a.rim, b.rim, k));
    const night = lerp(a.night, b.night, k), cloud = lerp(a.cloud, b.cloud, k);
    W.hour = hh; W.night = night;
    starMat.opacity = Math.max(0, night * 1.6 - 0.6);
    moonDisk.material.opacity = night; halo.material.opacity = night;
    moonDisk.visible = halo.visible = night > 0.02;
    // the sun rides an arc from the east (right) at dawn to the west at dusk
    const day = Math.max(0, Math.min(1, (hh - 5) / 14));
    sunDisk.visible = hh > 4.5 && hh < 19.5;
    sunDisk.position.set(lerp(6200, -4800, day), 500 + Math.sin(day * Math.PI) * 3300, -8200);
    sunDisk.material.color.copy(mix(0xff9a5a, 0xfff2c8, Math.sin(day * Math.PI))).multiplyScalar(1.6);
    for (const c of W.clouds) c.material.color.setScalar(cloud);
    for (const s of city) s.mat.color.setScalar(s.glow * (0.12 + 0.88 * night));
    for (const n of W.nightLights) { n.light.intensity = n.base * night; n.cone.userData.mat.uniforms.op.value = n.op * night; }
    for (const b2 of W.beams) b2.visible = night > 0.6;
    W.neonK = 0.35 + 0.65 * night;
  };
  W.neonK = 1;

  W.update = (dt, t) => {
    W.t = t;
    for (const b of W.beams) b.rotation.z = Math.sin(t * 0.25 + b.userData.ph) * 0.45 + (b.position.x < 0 ? -0.15 : 0.15);
    for (const c of W.clouds) { c.position.x += c.userData.speed * dt; if (c.position.x > 6000) c.position.x = -5000; }
    W.fan.rotation.z -= dt * 9;
    const flick = Math.sin(t * 1.7) + Math.sin(t * 13.1) * 0.3 > 1.15 ? 0.25 : 1;
    W.neonMat.opacity = flick * (0.5 + 0.5 * W.neonK);
    W.neonLight.intensity = 260 * flick * W.neonK;
    W.moths.forEach((m, i) => {
      const u = m.userData, a = t * u.s + u.ph;
      m.position.set(60 + Math.cos(a) * u.r, 440 + u.y + Math.sin(a * 1.7) * 10, -170 + Math.sin(a) * u.r * 0.6);
    });
    for (const s of W.steam) {
      s.userData.t = (s.userData.t + dt * 0.28) % 1;
      const k = s.userData.t;
      s.position.set(640 + Math.sin(k * 6 + s.id) * 14 + k * 30, 8 + k * 200, 60);
      s.scale.setScalar(30 + k * 90);
      s.material.opacity = Math.sin(k * Math.PI) * 0.22;
    }
    for (const s of W.stink) {
      s.userData.t = (s.userData.t + dt * 0.35) % 1;
      const k = s.userData.t;
      s.position.set(s.userData.x + Math.sin(k * 5) * 6, 180 + k * 90, -60);
      s.material.opacity = Math.sin(k * Math.PI) * 0.55;
    }
  };
  return W;
}
