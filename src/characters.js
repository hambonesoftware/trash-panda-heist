import * as THREE from 'three';
import { M, RB, SP, CY, CA, CO, ell, put, toon, glowMat, RoundedBoxGeometry } from './gfx.js';
import { joint, Rig, clip } from './rig.js';
import { rand, rng, lerp } from './util.js';
import { SPEC } from './config.js';

const P = (base, o) => ({ ...base, ...o });

function stick(a, b, r1, r2, color, t = 1.6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = CY(r2, r1, dir.length(), color, t, 10);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

// ---------------- raccoon ----------------
const RC = { FUR: 0x8f99b2, FUR2: 0x6f7891, DARK: 0x2b2d3d, LIGHT: 0xf2ecdd, BAND: 0xe04b3c, NOSE: 0x15121b };

export const R_STAND = {
  '@hips': [0, -1, 0], hips: [0, 0, 0], spine: [0, 0, -4], chest: [0, 0, -5], neck: [0, 0, 3], head: [0, 0, 4],
  earL: [-16, 0, 0], earR: [16, 0, 0],
  uarmR: [0, 0, 25], farmR: [0, 0, 35], uarmL: [0, 0, 45], farmL: [0, 0, 35],
  thighR: [0, 0, 8], shinR: [0, 0, -14], footR: [0, 0, 6], thighL: [0, 0, -6], shinL: [0, 0, -10], footL: [0, 0, 16],
  tail0: [0, 0, 22], tail1: [0, 0, -8], tail2: [0, 0, -12], tail3: [0, 0, -12], tail4: [0, 0, -8],
};
export const R_WINDUP = {
  '@hips': [-7, -5, 0], hips: [0, 0, 6], spine: [0, 0, 13], chest: [0, 0, 9], neck: [0, 0, -6], head: [0, 0, -9],
  earL: [-16, 0, 30], earR: [16, 0, 30],
  thighR: [0, 0, -16], shinR: [0, 0, -24], footR: [0, 0, 22], thighL: [0, 0, 28], shinL: [0, 0, -30], footL: [0, 0, 4],
  tail0: [0, 0, 50], tail1: [0, 0, -2], tail2: [0, 0, -6],
};
const R_DUCK = P(R_STAND, {
  '@hips': [0, -16, 0], hips: [0, 0, -18], spine: [0, 0, -26], chest: [0, 0, -18], neck: [0, 0, -4], head: [0, 0, 32],
  earL: [-16, 0, 34], earR: [16, 0, 34],
  thighR: [0, 0, 84], shinR: [0, 0, -132], footR: [0, 0, 48], thighL: [0, 0, 80], shinL: [0, 0, -128], footL: [0, 0, 48],
  uarmR: [0, 0, 60], farmR: [0, 0, 115], uarmL: [0, 0, 55], farmL: [0, 0, 115], tail0: [0, 0, 75], tail1: [0, 0, 25], tail2: [0, 0, 10],
});

function runClip(name, rig, scared) {
  const S = R_STAND, legs = [[45, -25, 10], [20, -62, 0], [-28, -40, -20], [-42, -92, -10]], keys = [], dur = 0.42;
  for (let i = 0; i <= 4; i++) {
    const r = legs[i % 4], l = legs[(i + 2) % 4], c = Math.cos((i / 4) * Math.PI * 2);
    const p = P(S, {
      spine: [0, 0, -16], chest: [0, 0, -10], neck: [0, 0, 8], head: [0, 0, scared ? -6 : 12], '@hips': [0, i % 2 ? 6 : -2, 0],
      thighR: [0, 0, r[0]], shinR: [0, 0, r[1]], footR: [0, 0, r[2]], thighL: [0, 0, l[0]], shinL: [0, 0, l[1]], footL: [0, 0, l[2]],
      tail0: [0, 0, 62], tail1: [0, 0, 10], tail2: [0, 0, 10],
    });
    if (scared) Object.assign(p, { uarmR: [0, 0, 170 + c * 15], farmR: [0, 0, 30], uarmL: [0, 0, 160 - c * 15], farmL: [0, 0, 30], earL: [-16, 0, 40], earR: [16, 0, 40] });
    else Object.assign(p, { uarmR: [0, 0, -c * 50], farmR: [0, 0, 80], uarmL: [0, 0, c * 50], farmL: [0, 0, 80] });
    keys.push([(dur * i) / 4, p, 'lin']);
  }
  return clip(name, keys, rig);
}

function raccoonClips(rig) {
  const S = R_STAND, W = P(S, R_WINDUP);
  rig.add(clip('idle', [
    [0, S],
    [1.3, P(S, { '@hips': [0, -2.2, 0], chest: [0, 0, -7], neck: [0, 0, 1], head: [0, 5, 8], earR: [16, 0, -14], tail0: [0, 0, 28], tail1: [0, 0, -2], tail2: [0, 0, -6], '^chest': [1, 1.03, 1.04] })],
    [2.6, S],
  ], rig));
  rig.add(clip('release', [
    [0, W],
    [0.07, P(S, {
      '@hips': [8, -3, 0], hips: [0, 0, -6], spine: [0, 0, -17], chest: [0, 0, -12], neck: [0, 0, 6], head: [0, 0, 11],
      earL: [-16, 0, -14], earR: [16, 0, -14], thighR: [0, 0, -26], shinR: [0, 0, -10], footR: [0, 0, -10], thighL: [0, 0, 20], shinL: [0, 0, -22],
      tail0: [0, 0, 4], tail1: [0, 0, 22], tail2: [0, 0, 12],
    }), 'out'],
    [0.5, S, 'io'],
  ], rig), false);
  rig.add(clip('duck', [[0, S], [0.16, R_DUCK, 'out'], [0.3, P(R_DUCK, { '^hips': [1.05, 0.95, 1.05] }), 'io']], rig), false);
  rig.add(clip('pop', [
    [0, R_DUCK],
    [0.12, P(S, { '^hips': [0.92, 1.12, 0.92], head: [0, 0, -6], earL: [-16, 0, -20], earR: [16, 0, -20] }), 'out'],
    [0.32, S, 'io'],
  ], rig), false);
  rig.add(clip('hit', [
    [0, S],
    [0.07, P(S, {
      '@hips': [-12, 4, 0], hips: [0, 0, 16], spine: [0, 0, 22], chest: [0, 0, 14], neck: [0, 0, -8], head: [0, 0, -24],
      earL: [-16, 0, 40], earR: [16, 0, 40], uarmR: [0, 0, 150], farmR: [0, 0, 40], thighL: [0, 0, 30], shinL: [0, 0, -30],
      tail0: [0, 0, 72], '^hips': [0.9, 1.1, 0.9],
    }), 'out'],
    [0.32, P(S, { spine: [0, 0, 6], head: [0, 14, 10], neck: [0, 8, 0], uarmR: [0, 0, 30], farmR: [0, 0, 40] }), 'io'],
    [0.62, S, 'io'],
  ], rig), false);
  rig.add(runClip('run', rig, false));
  rig.add(runClip('flee', rig, true));
  rig.add(clip('leap', [
    [0, P(S, { '@hips': [0, -12, 0], spine: [0, 0, -22], thighR: [0, 0, 60], shinR: [0, 0, -100], thighL: [0, 0, 55], shinL: [0, 0, -95], footR: [0, 0, 30], footL: [0, 0, 30] })],
    [0.15, P(S, {
      '@hips': [0, 6, 0], spine: [0, 0, 6], chest: [0, 0, 6], head: [0, 0, -10], thighR: [0, 0, -12], shinR: [0, 0, -6], thighL: [0, 0, -10], shinL: [0, 0, -6],
      uarmR: [0, 0, 165], farmR: [0, 0, 10], uarmL: [0, 0, 160], farmL: [0, 0, 10], tail0: [0, 0, -10],
    }), 'out'],
    [0.45, P(R_DUCK, { head: [0, 0, 10] }), 'io'],
  ], rig), false);
  // Lode Runner moves: climbing a ladder, hanging from a clothesline, digging through a can.
  const climbPose = k => P(S, {
    '@hips': [0, k ? 2 : -2, 0], spine: [0, 0, 2], chest: [0, 0, 4], neck: [0, 0, -8], head: [0, 0, -16],
    uarmR: [0, 0, k ? 168 : 112], farmR: [0, 0, k ? 14 : 72], uarmL: [0, 0, k ? 112 : 168], farmL: [0, 0, k ? 72 : 14],
    thighR: [0, 0, k ? 78 : 8], shinR: [0, 0, k ? -96 : -18], footR: [0, 0, 20], thighL: [0, 0, k ? 8 : 78], shinL: [0, 0, k ? -18 : -96], footL: [0, 0, 20],
    tail0: [0, 0, k ? 34 : 48], tail1: [0, 0, 6], tail2: [0, 0, 4],
  });
  rig.add(clip('climb', [[0, climbPose(0), 'lin'], [0.22, climbPose(1), 'io'], [0.44, climbPose(0), 'io']], rig));
  const hangPose = k => P(S, {
    '@hips': [0, 0, 0], hips: [0, 0, k * 7], spine: [0, 0, 4 + k * 4], chest: [0, 0, 2], neck: [0, 0, -6], head: [0, 0, -10 - k * 4],
    uarmR: [0, 0, 172], farmR: [0, 0, 8], uarmL: [0, 0, 172], farmL: [0, 0, 8],
    thighR: [0, 0, 14 + k * 22], shinR: [0, 0, -34], footR: [0, 0, 34], thighL: [0, 0, -4 + k * 16], shinL: [0, 0, -26], footL: [0, 0, 34],
    tail0: [0, 0, 26 - k * 30], tail1: [0, 0, -6 - k * 8], tail2: [0, 0, -8], tail3: [0, 0, -8],
  });
  rig.add(clip('hang', [[0, hangPose(-1), 'lin'], [0.36, hangPose(1), 'io'], [0.72, hangPose(-1), 'io']], rig));
  const digPose = k => P(S, {
    '@hips': [-4, -6, 0], hips: [0, 0, -20], spine: [0, 0, -34], chest: [0, 0, -26], neck: [0, 0, -6], head: [0, k * 14, 26],
    earL: [-16, 0, k > 0 ? 24 : -8], earR: [16, 0, k > 0 ? -8 : 24],
    uarmR: [0, 0, k > 0 ? 96 : 56], farmR: [0, 0, k > 0 ? 18 : 70], uarmL: [0, 0, k > 0 ? 56 : 96], farmL: [0, 0, k > 0 ? 70 : 18],
    thighR: [0, 0, 34], shinR: [0, 0, -46], footR: [0, 0, 12], thighL: [0, 0, 18], shinL: [0, 0, -40], footL: [0, 0, 22],
    tail0: [0, 0, 70 + k * 16], tail1: [0, 0, 14], tail2: [0, 0, 8],
  });
  rig.add(clip('rummage', [[0, digPose(-1), 'lin'], [0.14, digPose(1), 'io'], [0.28, digPose(-1), 'io']], rig));
  rig.add(clip('fall', [
    [0, P(S, { uarmR: [0, 0, 150], farmR: [0, 0, 30], uarmL: [0, 0, 160], farmL: [0, 0, 30], thighR: [0, 0, 40], shinR: [0, 0, -70], thighL: [0, 0, -20], shinL: [0, 0, -50], tail0: [0, 0, -20], head: [0, 0, -8] })],
    [0.2, P(S, { uarmR: [0, 0, 162], farmR: [0, 0, 20], uarmL: [0, 0, 148], farmL: [0, 0, 40], thighR: [0, 0, -16], shinR: [0, 0, -52], thighL: [0, 0, 42], shinL: [0, 0, -72], tail0: [0, 0, -34], head: [0, 0, -4] }), 'io'],
    [0.4, P(S, { uarmR: [0, 0, 150], farmR: [0, 0, 30], uarmL: [0, 0, 160], farmL: [0, 0, 30], thighR: [0, 0, 40], shinR: [0, 0, -70], thighL: [0, 0, -20], shinL: [0, 0, -50], tail0: [0, 0, -20], head: [0, 0, -8] }), 'io'],
  ], rig));
  const up = { uarmR: [0, 0, 165], farmR: [0, 0, 25], uarmL: [0, 0, 150], farmL: [0, 0, 40], head: [0, 0, -12], earL: [-16, 0, -10], earR: [16, 0, -10] };
  rig.add(clip('cheer', [
    [0, P(S, up)],
    [0.2, P(S, { uarmR: [0, 0, 140], farmR: [0, 0, 60], uarmL: [0, 0, 172], farmL: [0, 0, 15], head: [0, 0, -4], '@hips': [0, 5, 0], '^hips': [0.95, 1.08, 0.95] }), 'io'],
    [0.4, P(S, up), 'io'],
  ], rig));
}

function buildSlingshot() {
  const WOOD = 0x9a6234, g = new THREE.Group();
  g.add(stick(new THREE.Vector3(0, -24, 0), new THREE.Vector3(0, 0, 0), 2.9, 2.6, WOOD));
  g.add(put(CY(3.4, 3.4, 11, 0x5a2a4a, 1.3, 12), 0, -14, 0));
  const a = new THREE.Vector3(-4, 18, 5), b = new THREE.Vector3(4, 18, -5);
  g.add(stick(new THREE.Vector3(0, 0, 0), a, 2.6, 2.1, WOOD));
  g.add(stick(new THREE.Vector3(0, 0, 0), b, 2.6, 2.1, WOOD));
  g.add(put(SP(2.6, 0x6b3f25, 1.2, 10, 8), a.x, a.y, a.z));
  g.add(put(SP(2.6, 0x6b3f25, 1.2, 10, 8), b.x, b.y, b.z));
  const mk = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); g.add(o); return o; };
  return { group: g, tipA: mk(a.x, a.y, a.z), tipB: mk(b.x, b.y, b.z), fork: mk(0, 17, 0), grip: mk(0, -14, 0) };
}

export function buildRaccoon() {
  const { FUR, FUR2, DARK, LIGHT, BAND, NOSE } = RC;
  const outer = new THREE.Group(), root = new THREE.Group();
  outer.add(root);
  root.rotation.y = -0.45;
  const J = {};
  const j = (n, p, x, y, z) => (J[n] = joint(n, p, x, y, z));
  j('hips', root, 0, 44, 0); j('spine', J.hips, 0, 9, 0); j('chest', J.spine, 1, 19, 0); j('neck', J.chest, 3, 19, 0); j('head', J.neck, 1, 5, 0);
  j('earL', J.head, -2, 33, -14); j('earR', J.head, -2, 33, 14);
  for (const [s, z] of [['R', 15], ['L', -15]]) {
    j('uarm' + s, J.chest, 2, 13, z); j('farm' + s, J['uarm' + s], 0, -22, 0); j('hand' + s, J['farm' + s], 0, -21, 0);
    j('thigh' + s, J.hips, 2, -3, z * 0.67); j('shin' + s, J['thigh' + s], 0, -21, 0); j('foot' + s, J['shin' + s], 0, -20, 0);
  }
  j('tail0', J.hips, -15, -2, 0);
  const tailOff = [[-11, 7], [-8, 10], [-3, 11], [2, 10]];
  tailOff.forEach(([x, y], i) => j('tail' + (i + 1), J['tail' + i], x, y, 0));

  J.hips.add(put(ell(17, 1, 0.9, 0.95, FUR), 0, 2, 0));
  J.spine.add(put(ell(18, 1, 1.05, 0.95, FUR), 2, 9, 0));
  J.spine.add(put(ell(13, 0.55, 1.05, 0.85, LIGHT, 0), 11, 8, 0));
  J.chest.add(put(ell(17, 1, 0.95, 1.02, FUR), 1, 8, 0));
  const band = M(new THREE.TorusGeometry(12.5, 4.4, 10, 26), BAND, 1.8);
  band.rotation.set(Math.PI / 2, 0.2, 0);
  J.chest.add(put(band, 2, 18, 0));
  for (const [z, r] of [[4, 1.9], [-4, 2.3]]) { const k = CO(4, 13, BAND, 1.5); k.rotation.z = r; J.chest.add(put(k, -13, 14, z)); }

  const H = J.head;
  H.add(put(ell(22, 1.06, 0.95, 1.05, FUR), 4, 16, 0));
  for (const sz of [-1, 1]) {
    const tuft = CO(8.5, 18, LIGHT, 1.8);
    tuft.rotation.set(-sz * 0.5, 0, 1.95);
    H.add(put(tuft, -6, 8, sz * 16));
  }
  H.add(put(ell(11, 1.45, 0.82, 0.95, LIGHT), 25, 9, 0));
  H.add(put(SP(4.8, NOSE, 1.5), 41, 11, 0));
  H.add(put(new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), glowMat(0xffffff, 1)), 42.6, 13, 2.6));
  H.add(put(ell(16, 0.62, 0.42, 1.18, DARK, 0), 17, 19, 0));
  for (const sz of [-1, 1]) {
    H.add(put(ell(10, 0.78, 0.82, 0.9, DARK, 0), 19, 18, sz * 10));
    H.add(put(ell(7, 0.9, 0.42, 1, LIGHT, 0), 17, 27.5, sz * 9.5));
  }
  const eyes = new THREE.Group();
  eyes.position.set(24, 20, 0);
  H.add(eyes);
  const shine = glowMat(0xffffff, 1);
  for (const sz of [-1, 1]) {
    eyes.add(put(SP(5.6, 0xffffff, 1.2), 0, 0, sz * 9.6));
    eyes.add(put(SP(3.1, NOSE, 0), 3.9, 0.3, sz * 9.9));
    eyes.add(put(new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), shine), 6.4, 1.8, sz * 10.8));
  }
  for (const [n, sz] of [['earL', -1], ['earR', 1]]) {
    J[n].add(put(CO(9.5, 19, DARK, 2), 0, 7, 0));
    J[n].add(put(CO(5.5, 12, 0xc7a9b7, 0), 1.6, 6, sz * 1.5));
  }
  for (const s of ['R', 'L']) {
    J['uarm' + s].add(put(CA(5.4, 13, FUR), 0, -11, 0));
    J['farm' + s].add(put(CA(5, 12, FUR), 0, -10.5, 0));
    J['hand' + s].add(put(ell(6.4, 1.1, 1, 1, DARK), 1, -3, 0));
    J['thigh' + s].add(put(CA(7.5, 9, FUR), 0, -10, 0));
    J['shin' + s].add(put(CA(5.6, 11, DARK), 0, -10, 0));
    J['foot' + s].add(put(ell(7.5, 1.6, 0.62, 1, DARK), 6, 3.5, 0));
  }
  const tailR = [10.5, 12.5, 12.5, 11, 8.5];
  for (let i = 0; i < 5; i++) {
    const nxt = tailOff[i] || [1, 10];
    J['tail' + i].add(put(ell(tailR[i], 1, 1.05, 0.95, i % 2 ? DARK : i === 4 ? FUR2 : FUR), nxt[0] * 0.5, nxt[1] * 0.5, 0));
  }

  const sling = buildSlingshot();
  sling.group.position.set(36, 76, 22);
  root.add(sling.group);
  const sackAnchor = new THREE.Object3D();
  sackAnchor.position.set(-20, 4, 0);
  J.chest.add(sackAnchor);

  const rig = new Rig(root, J);
  raccoonClips(rig);
  rig.play('idle', 0);
  return { outer, root, J, rig, eyes, sling, sackAnchor, windup: rig.compile(R_WINDUP) };
}

// Rubber band and pouch live in world space so they can stretch freely between the fork tips and the drag point.
export function buildBand(scene) {
  const mat = toon(0x6b2034, { rim: 0.4 });
  const geo = new THREE.CylinderGeometry(1, 1, 1, 8);
  const mk = () => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; scene.add(m); return m; };
  const back = mk(), front = mk();
  const pouch = M(new RoundedBoxGeometry(15, 9, 17, 2, 3.5), 0x6b3f25, 1.4);
  scene.add(pouch);
  const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
  const seg = (m, a, b, r) => {
    d.subVectors(b, a);
    const len = Math.max(d.length(), 0.01);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.scale.set(r, len, r);
    m.quaternion.setFromUnitVectors(up, d.normalize());
  };
  return {
    pouch,
    update(tipA, tipB, p, stretch) {
      const r = lerp(2.3, 1.2, Math.min(1, stretch));
      seg(back, tipB, p, r);
      seg(front, tipA, p, r);
      pouch.position.copy(p);
      pouch.rotation.z = Math.atan2(tipA.y - p.y, tipA.x - p.x);
    },
    setVisible(v) { back.visible = front.visible = pouch.visible = v; },
  };
}

// ---------------- worker ----------------
const WK = { SHIRT: 0xd8433a, PANTS: 0x2d3358, SKIN: 0xf2b38c, APRON: 0x2c64b8, CAP: 0x24479a, BOOT: 0x1d1b25, HAIR: 0x3b2417, WHITE: 0xf4f1e8 };

const W_STAND = {
  hips: [0, 0, 0], spine: [0, 0, -3], chest: [0, 0, -2], neck: [0, 0, 2], head: [0, 0, 2],
  uarmR: [-12, 0, 8], farmR: [0, 0, 14], uarmL: [12, 0, 6], farmL: [0, 0, 12],
  thighR: [0, 0, 3], shinR: [0, 0, -5], footR: [0, 0, 2], thighL: [0, 0, -2], shinL: [0, 0, -4], footL: [0, 0, 6],
};
const W_CARRY = { uarmR: [-22, 0, 172], farmR: [0, 0, 22], uarmL: [22, 0, 172], farmL: [0, 0, 22] };

function walkClip(name, rig, { dur = 0.9, stride = 24, bounce = 3.5, arm = 24, lean = -6, carry = false } = {}) {
  const legs = [[1, -4, 8], [0.6, -16, 0], [0, -8, -2], [-0.5, -6, -10], [-0.8, -18, -24], [-0.3, -50, -14], [0.4, -62, 0], [0.9, -22, 6]];
  const bob = [-0.5, -1, 0.6, 1, -0.5, -1, 0.6, 1];
  const keys = [];
  for (let i = 0; i <= 8; i++) {
    const r = legs[i % 8], l = legs[(i + 4) % 8], ph = i / 8, c = Math.cos(ph * Math.PI * 2);
    const p = P(W_STAND, {
      spine: [0, 0, lean], chest: [0, c * 6, lean * 0.5], head: [0, -c * 4, -lean * 0.8],
      thighR: [0, 0, r[0] * stride], shinR: [0, 0, r[1]], footR: [0, 0, r[2]],
      thighL: [0, 0, l[0] * stride], shinL: [0, 0, l[1]], footL: [0, 0, l[2]],
      '@hips': [0, bob[i % 8] * bounce, 0],
    });
    if (carry) Object.assign(p, W_CARRY);
    else Object.assign(p, { uarmR: [-12, 0, -c * arm], farmR: [0, 0, 16 + Math.max(0, -c) * 18], uarmL: [12, 0, c * arm], farmL: [0, 0, 16 + Math.max(0, c) * 18] });
    keys.push([dur * ph, p, 'lin']);
  }
  return clip(name, keys, rig);
}

function workerClips(rig) {
  const S = W_STAND;
  rig.add(walkClip('walk', rig));
  rig.add(walkClip('carryWalk', rig, { stride: 20, bounce: 2.5, lean: -3, carry: true }));
  rig.add(clip('carryIdle', [[0, P(S, W_CARRY)], [1, P(S, { ...W_CARRY, '@hips': [0, -2, 0], spine: [0, 0, 1] })], [2, P(S, W_CARRY)]], rig));
  rig.add(clip('idle', [
    [0, S],
    [1.0, P(S, { head: [0, 24, 4], neck: [0, 10, 0], '@hips': [2, 0, 0], hips: [0, 0, 2] })],
    [2.0, P(S, { uarmR: [-10, 0, 150], farmR: [0, 0, 120], head: [0, -10, -6], chest: [0, 0, 4] })],
    [2.8, P(S, { uarmR: [-10, 0, 152], farmR: [0, 0, 132], head: [0, -14, -8], chest: [0, 0, 4] })],
    [3.4, P(S, { head: [0, -18, 2] })],
    [4.0, S],
  ], rig));
  rig.add(clip('lob', [
    [0, P(S, W_CARRY)],
    [0.35, P(S, {
      '@hips': [0, -10, 0], hips: [0, 0, 4], spine: [0, 0, 14], chest: [0, 0, 10], head: [0, 0, -8],
      uarmR: [-20, 0, 200], farmR: [0, 0, 40], uarmL: [20, 0, 200], farmL: [0, 0, 40],
      thighR: [0, 0, 16], shinR: [0, 0, -32], footR: [0, 0, 16], thighL: [0, 0, 16], shinL: [0, 0, -32], footL: [0, 0, 16],
    }), 'io'],
    [0.55, P(S, {
      '@hips': [4, 2, 0], spine: [0, 0, -16], chest: [0, 0, -12], head: [0, 0, 8],
      uarmR: [-14, 0, 120], farmR: [0, 0, 4], uarmL: [14, 0, 118], farmL: [0, 0, 4], thighR: [0, 0, -6], shinR: [0, 0, -8], thighL: [0, 0, 18], shinL: [0, 0, -6],
    }), 'out'],
    [0.95, P(S, { uarmR: [-12, 0, 30], farmR: [0, 0, 20], uarmL: [12, 0, 28], farmL: [0, 0, 20] }), 'io'],
  ], rig), false);
  rig.add(walkClip('run', rig, { dur: 0.52, stride: 36, bounce: 6, arm: 46, lean: -14 }));
  const climb = k => P(S, {
    spine: [0, 0, 2], head: [0, 0, -14],
    uarmR: [-8, 0, k ? 165 : 118], farmR: [0, 0, k ? 16 : 70], uarmL: [8, 0, k ? 118 : 165], farmL: [0, 0, k ? 70 : 16],
    thighR: [0, 0, k ? 66 : 6], shinR: [0, 0, k ? -84 : -12], thighL: [0, 0, k ? 6 : 66], shinL: [0, 0, k ? -12 : -84],
  });
  rig.add(clip('climb', [[0, climb(0), 'lin'], [0.3, climb(1), 'io'], [0.6, climb(0), 'io']], rig));
  // Slipped on a ripped trash bag: feet fly out, lands sitting, shakes it off.
  const SAT = P(S, {
    '@hips': [-14, -62, 0], hips: [0, 0, 26], spine: [0, 0, -6], chest: [0, 0, -4], head: [0, 0, 6],
    thighR: [0, 0, 96], shinR: [0, 0, -14], footR: [0, 0, 10], thighL: [0, 0, 84], shinL: [0, 0, -26], footL: [0, 0, 10],
    uarmR: [-30, 0, -36], farmR: [0, 0, 20], uarmL: [30, 0, -30], farmL: [0, 0, 20],
  });
  rig.add(clip('slip', [
    [0, S],
    [0.16, P(S, {
      '@hips': [-8, -10, 0], hips: [0, 0, 52], spine: [0, 0, 16], head: [0, 0, -18],
      thighR: [0, 0, 110], shinR: [0, 0, -8], thighL: [0, 0, 78], shinL: [0, 0, -20], uarmR: [-20, 0, 160], farmR: [0, 0, 20], uarmL: [20, 0, 150], farmL: [0, 0, 26],
    }), 'out'],
    [0.42, SAT, 'in'],
    [0.9, P(SAT, { head: [0, 26, 10], chest: [0, 10, -4] }), 'io'],
    [1.4, P(SAT, { head: [0, -26, 10], chest: [0, -10, -4], uarmR: [-30, 0, 120], farmR: [0, 0, 120] }), 'io'],
    [2.0, P(SAT, { head: [0, 0, 6] }), 'io'],
  ], rig), false);
  // Caught him: a grab and a triumphant shake.
  rig.add(clip('grabbed', [
    [0, S],
    [0.14, P(S, { spine: [0, 0, -30], chest: [0, 0, -18], head: [0, 0, 12], uarmR: [-8, 0, 70], farmR: [0, 0, 10], uarmL: [8, 0, 70], farmL: [0, 0, 10], '@hips': [6, -10, 0] }), 'out'],
    [0.5, P(S, { spine: [0, 0, 6], head: [0, 0, -8], uarmR: [-10, 0, 160], farmR: [0, 0, 40], uarmL: [10, 0, 30], farmL: [0, 0, 30] }), 'io'],
    [0.9, P(S, { spine: [0, 0, 4], head: [0, 14, -4], uarmR: [-10, 0, 150], farmR: [0, 0, 70], uarmL: [10, 0, 30], farmL: [0, 0, 30] }), 'io'],
    [1.3, S, 'io'],
  ], rig), false);
  const POINT = P(S, {
    spine: [0, 0, -14], chest: [0, 0, -10], neck: [0, 0, 6], head: [0, 0, 10],
    uarmR: [-6, 0, 96], farmR: [0, 0, 6], uarmL: [10, 0, 30], farmL: [0, 0, 60], '@hips': [4, -2, 0], thighL: [0, 0, 16], shinL: [0, 0, -14],
  });
  rig.add(clip('spot', [
    [0, S],
    [0.08, P(S, { head: [0, 0, -14], neck: [0, 0, -6], chest: [0, 0, 6], '@hips': [-3, 3, 0] }), 'out'],
    [0.3, POINT, 'out'],
    [0.55, P(POINT, { farmR: [0, 0, 16] }), 'io'],
  ], rig), false);
  rig.add(clip('throw', [
    [0, POINT],
    [0.24, P(S, {
      '@hips': [-6, -4, 0], spine: [0, 0, 14], chest: [0, 0, 14], head: [0, 0, -6],
      uarmR: [-10, 0, 215], farmR: [0, 0, 80], uarmL: [12, 0, 70], farmL: [0, 0, 30], thighL: [0, 0, 24], shinL: [0, 0, -10], thighR: [0, 0, -10], shinR: [0, 0, -20],
    }), 'io'],
    [0.36, P(S, { '@hips': [8, -2, 0], spine: [0, 0, -22], chest: [0, 0, -16], head: [0, 0, 8], uarmR: [-8, 0, 95], farmR: [0, 0, 8], uarmL: [12, 0, -20], farmL: [0, 0, 20] }), 'out'],
    [0.65, P(S, { spine: [0, 0, -10], uarmR: [-10, 0, 40], farmR: [0, 0, 20] }), 'io'],
  ], rig), false);
}

export function buildWorker(palette = {}) {
  const { SHIRT, PANTS, SKIN, APRON, CAP, BOOT, HAIR, WHITE } = { ...WK, ...palette };
  const outer = new THREE.Group(), root = new THREE.Group();
  outer.add(root);
  const J = {};
  const j = (n, p, x, y, z) => (J[n] = joint(n, p, x, y, z));
  j('hips', root, 0, 90, 0); j('spine', J.hips, 0, 12, 0); j('chest', J.spine, 0, 30, 0); j('neck', J.chest, 3, 32, 0); j('head', J.neck, 0, 8, 0);
  for (const [s, z] of [['R', 34], ['L', -34]]) {
    j('uarm' + s, J.chest, 0, 24, z); j('farm' + s, J['uarm' + s], 0, -31, 0); j('hand' + s, J['farm' + s], 0, -29, 0);
    j('thigh' + s, J.hips, 0, -6, z * 0.38); j('shin' + s, J['thigh' + s], 0, -42, 0); j('foot' + s, J['shin' + s], 0, -42, 0);
  }
  j('carry', J.chest, 6, 112, 0);
  j('grab', J.handR, 4, -12, 0);

  J.hips.add(put(RB(42, 26, 50, PANTS, 2.2, 9), 0, 0, 0));
  J.hips.add(put(RB(44, 7, 52, 0x3a2a22, 1.6, 3), 0, 12, 0));
  J.spine.add(put(ell(30, 1.02, 0.95, 1.12, SHIRT), 6, 14, 0));
  J.spine.add(put(RB(5, 52, 42, APRON, 1.8, 2), 32, 8, 0));
  J.chest.add(put(ell(30, 0.92, 0.82, 1.3, SHIRT), 2, 16, 0));
  J.chest.add(put(RB(4, 40, 40, APRON, 1.6, 1.8), 27, 10, 0));
  J.chest.add(put(RB(2.4, 8, 14, WHITE, 1, 1), 29.5, 20, 10));
  J.neck.add(put(CY(9, 10, 10, SKIN, 1.8), 0, 2, 0));
  const H = J.head;
  H.add(put(ell(21, 1, 1.05, 0.98, SKIN), 4, 18, 0));
  H.add(put(ell(7.5, 1.1, 1, 1, 0xe9977a, 1.8), 25, 14, 0));
  H.add(put(ell(9, 0.55, 0.38, 1.6, HAIR, 1.6), 22, 6, 0));
  for (const sz of [-1, 1]) {
    H.add(put(SP(3.2, 0x15121b, 0), 20.5, 22, sz * 8));
    H.add(put(RB(4, 3, 10, HAIR, 1, 1), 21, 27.5, sz * 8));
    H.add(put(ell(6, 0.6, 1, 0.6, SKIN, 1.6), 2, 16, sz * 20));
  }
  H.add(put(M(new THREE.SphereGeometry(22.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), CAP), 3, 24, 0));
  H.add(put(RB(28, 4, 32, CAP, 1.6, 1.8), 26, 25, 0));
  const logo = put(new THREE.Mesh(new THREE.CircleGeometry(5, 16), toon(0xf2c14e, { rim: 0 })), 25.4, 34, 0);
  logo.rotation.y = Math.PI / 2;
  H.add(logo);
  for (const s of ['R', 'L']) {
    J['uarm' + s].add(put(CA(8.5, 18, SHIRT), 0, -14, 0));
    J['farm' + s].add(put(CA(7, 20, SKIN), 0, -14, 0));
    J['hand' + s].add(put(ell(10.5, 1.05, 1.1, 0.85, SKIN), 2, -6, 0));
    J['thigh' + s].add(put(CA(10, 26, PANTS), 0, -21, 0));
    J['shin' + s].add(put(CA(8, 28, PANTS), 0, -21, 0));
    J['foot' + s].add(put(RB(36, 15, 22, BOOT, 2, 6), 9, 4, 0));
  }

  const bang = new THREE.Group(), bangMat = glowMat(0xffd23f, 1.6);
  bang.add(put(new THREE.Mesh(new RoundedBoxGeometry(11, 30, 11, 2, 3), bangMat), 0, 18, 0));
  bang.add(put(new THREE.Mesh(new THREE.SphereGeometry(7, 12, 10), bangMat), 0, -8, 0));
  bang.position.set(0, 275, 0);
  outer.add(bang);

  const rig = new Rig(root, J);
  workerClips(rig);
  rig.play('idle', 0);
  return { outer, root, J, rig, carry: J.carry, grab: J.grab, bang, bangMat };
}

// ---------------- props ----------------
const geoCache = {};
const stickerTex = {};
function sticker(label) {
  if (!stickerTex[label]) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = label === 'FRAGILE' ? '#e84a3c' : '#f3ead2';
    g.fillRect(0, 0, 128, 64);
    g.strokeStyle = '#2b1d14'; g.lineWidth = 5; g.strokeRect(3, 3, 122, 58);
    g.fillStyle = label === 'FRAGILE' ? '#fff' : '#2b1d14';
    g.font = 'bold 24px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label === 'UP' ? '↑ ↑' : label, 64, 34);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    stickerTex[label] = toon(0xffffff, { map: t, rim: 0 });
  }
  return stickerTex[label];
}

export function boxMesh(type) {
  const s = SPEC[type];
  const geo = geoCache[type] || (geoCache[type] = new RoundedBoxGeometry(s.w, s.h, s.d, 2, 3));
  const g = new THREE.Group(), inner = new THREE.Group();
  const skin = M(geo, s.color, 2.2);
  inner.add(skin);
  if (type === 'crate') {
    for (const y of [-0.32, 0.32]) inner.add(put(RB(s.w + 1.6, s.h * 0.15, s.d + 1.6, 0x6e4622, 0, 1.5), 0, y * s.h, 0));
    const brace = RB(s.w * 1.2, 6, 2, 0x6e4622, 0, 1);
    brace.rotation.z = 0.78;
    inner.add(put(brace, 0, 0, s.d / 2 + 0.6));
  } else {
    inner.add(RB(s.w * 0.2, s.h + 1.4, s.d + 1.4, 0xead6a6, 0, 1));
    if (rng() < 0.55) {
      const label = ['FRAGILE', 'UP', 'MEGA', 'PRODUCE'][Math.floor(rng() * 4)];
      const st = new THREE.Mesh(new THREE.PlaneGeometry(s.w * 0.42, s.h * 0.22), sticker(label));
      inner.add(put(st, s.w * 0.22, -s.h * 0.18, s.d / 2 + 0.8));
    }
  }
  inner.rotation.y = rand(-0.12, 0.12);
  inner.position.z = rand(-8, 8);
  g.add(inner);
  return { g, skin };
}

export function ammoMesh(type) {
  const g = new THREE.Group();
  if (type === 'can') {
    const pts = [[0, -14], [10, -14], [12, -12], [12.4, 10], [11, 13], [9.5, 14], [0, 14]].map(([x, y]) => new THREE.Vector2(x, y));
    g.add(M(new THREE.LatheGeometry(pts, 18), 0xc7ced9, 2));
    g.add(CY(12.7, 12.7, 14, 0xe23b2e, 0, 18));
    g.add(put(CY(12.8, 12.8, 3, 0xf2f2f2, 0, 18), 0, 2, 0));
  } else if (type === 'bag') {
    const bag = SP(24, 0x3f4558);
    bag.scale.set(1, 0.9, 0.95);
    g.add(bag);
    g.add(put(CO(8, 14, 0x3f4558, 2, 10), 0, 24, 0));
    for (const sz of [-1, 1]) { const ear = CO(4, 10, 0x3f4558, 1.5, 8); ear.rotation.x = sz * 0.9; g.add(put(ear, 0, 30, sz * 4)); }
  } else if (type === 'bottle') {
    const pts = [[0, -15], [6.5, -15], [7.5, -13], [7.5, 2], [6, 6], [3, 9], [2.6, 15], [3.4, 15.6], [3.4, 17], [0, 17]].map(([x, y]) => new THREE.Vector2(x, y));
    const b = M(new THREE.LatheGeometry(pts, 16), toon(0x4fae7a, { rim: 1.2 }), 1.8);
    g.add(b);
    g.add(put(CY(7.7, 7.7, 8, 0xf2e6c2, 0, 16), 0, -5, 0));
    g.rotation.z = -0.5;
  } else if (type === 'melon') {
    const rind = M(new THREE.SphereGeometry(27, 24, 14, 0, Math.PI), 0x3f8f4a, 2.4);
    rind.rotation.y = Math.PI / 2;
    rind.rotation.x = Math.PI / 2;
    g.add(rind);
    const flesh = M(new THREE.CircleGeometry(25.5, 24), toon(0xef5b6c, { rim: 0 }), 0);
    flesh.rotation.x = -Math.PI / 2;
    g.add(put(flesh, 0, 0.5, 0));
    const pith = M(new THREE.RingGeometry(23.5, 26.8, 24), toon(0xe9f2d0, { rim: 0 }), 0);
    pith.rotation.x = -Math.PI / 2;
    g.add(put(pith, 0, 0.8, 0));
    for (const [x, z] of [[-10, 4], [8, -6], [2, 12], [-4, -12], [14, 8]]) g.add(put(ell(2.2, 1, 0.5, 1.6, 0x1b1620, 0), x, 1.4, z));
    g.rotation.x = 0.9;
  } else if (type === 'banana') {
    const Y = 0xf2d24a;
    for (const a of [0, 2.1, 4.2]) {
      const flap = M(new THREE.TorusGeometry(11, 3.4, 8, 12, 1.5), Y, 1.6);
      flap.rotation.set(Math.PI / 2, 0, a);
      const piv = new THREE.Group();
      piv.rotation.y = a;
      piv.add(put(flap, 9, -2, 0));
      flap.rotation.set(0, 0, -0.5);
      g.add(piv);
    }
    g.add(put(CY(2.6, 3.4, 9, 0x6b4a24, 1.2, 8), 0, 9, 0));
  } else {
    const BONE = 0xf3eede;
    const spine = CY(2.2, 2.2, 30, BONE, 1.5, 8);
    spine.rotation.z = Math.PI / 2;
    g.add(spine);
    const head = SP(7.5, BONE, 2);
    head.scale.set(1.25, 0.95, 0.6);
    g.add(put(head, 15, 0, 0));
    g.add(put(SP(1.9, 0x15131a, 0), 17, 2, 4.4));
    [[5, 16], [-1, 15], [-7, 12], [-12, 9]].forEach(([x, h]) => g.add(put(RB(2.4, h, 2.4, BONE, 1.2, 0.8), x, 0, 0)));
    const tail = CO(8, 10, BONE, 1.5, 3);
    tail.rotation.z = -Math.PI / 2;
    tail.scale.z = 0.35;
    g.add(put(tail, -19, 0, 0));
  }
  return g;
}
