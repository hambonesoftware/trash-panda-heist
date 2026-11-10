import * as THREE from 'three';

const D2R = Math.PI / 180;
const ZERO = [0, 0, 0], ONE = [1, 1, 1];

export function joint(name, parent, x = 0, y = 0, z = 0) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

export const EASE = {
  lin: t => t,
  io: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  back: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};

// Pose keys: { joint: [rx, ry, rz] degrees, '@joint': position offset from rest, '^joint': scale }.
// Keys: [[time, pose, easeIntoThisKey]]. Clips are densely sampled so easing survives slerp.
export function clip(name, keys, rig, fps = 30) {
  const dur = keys[keys.length - 1][0];
  const rot = new Set(), pos = new Set(), scl = new Set();
  for (const [, p] of keys) for (const k in p) {
    if (k[0] === '@') pos.add(k.slice(1));
    else if (k[0] === '^') scl.add(k.slice(1));
    else rot.add(k);
  }
  const n = Math.max(2, Math.round(dur * fps) + 1);
  const times = [];
  for (let i = 0; i < n; i++) times.push((dur * i) / (n - 1));
  const seg = t => {
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const t0 = keys[i][0], t1 = keys[i + 1][0], e = EASE[keys[i + 1][2] || 'io'];
    const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
    return [keys[i][1], keys[i + 1][1], e(u)];
  };
  const tracks = [];
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), eu = new THREE.Euler();
  for (const j of rot) {
    if (!rig.j[j]) continue;
    const vals = [];
    for (const t of times) {
      const [a, b, u] = seg(t);
      const va = a[j] || ZERO, vb = b[j] || ZERO;
      qa.setFromEuler(eu.set(va[0] * D2R, va[1] * D2R, va[2] * D2R));
      qb.setFromEuler(eu.set(vb[0] * D2R, vb[1] * D2R, vb[2] * D2R));
      qa.slerp(qb, u);
      vals.push(qa.x, qa.y, qa.z, qa.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(j + '.quaternion', times, vals));
  }
  const vec = (set, prefix, base, def) => {
    for (const j of set) {
      if (!rig.j[j]) continue;
      const vals = [];
      for (const t of times) {
        const [a, b, u] = seg(t);
        const va = a[prefix + j] || def, vb = b[prefix + j] || def, r = base(j);
        for (let c = 0; c < 3; c++) vals.push(r[c] + va[c] + (vb[c] - va[c]) * u);
      }
      tracks.push(new THREE.VectorKeyframeTrack(j + (prefix === '@' ? '.position' : '.scale'), times, vals));
    }
  };
  vec(pos, '@', j => rig.rest[j].toArray(), ZERO);
  vec(scl, '^', () => ZERO, ONE);
  return new THREE.AnimationClip(name, dur, tracks);
}

export class Rig {
  constructor(root, joints) {
    this.root = root;
    this.j = joints;
    this.rest = {};
    for (const k in joints) this.rest[k] = joints[k].position.clone();
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    this.cur = null;
    this.name = '';
  }

  add(c, loop = true) {
    const a = this.mixer.clipAction(c);
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    this.actions[c.name] = a;
    return a;
  }

  play(name, fade = 0.18, speed = 1, restart = false) {
    const a = this.actions[name];
    if (!a) return null;
    a.timeScale = speed;
    if (this.cur === a && !restart) return a;
    const prev = this.cur;
    a.reset();
    a.enabled = true;
    a.setEffectiveTimeScale(speed);
    a.setEffectiveWeight(1);
    a.play();
    if (prev && prev !== a) prev.crossFadeTo(a, fade, false);
    this.cur = a;
    this.name = name;
    return a;
  }

  time() { return this.cur ? this.cur.time : 0; }
  update(dt) { this.mixer.update(dt); }

  compile(pose) {
    const out = { rot: [], pos: [] };
    for (const k in pose) {
      const v = pose[k];
      if (k[0] === '@') {
        const n = k.slice(1);
        if (this.j[n]) out.pos.push([this.j[n], this.rest[n].clone().add(new THREE.Vector3(v[0], v[1], v[2]))]);
      } else if (k[0] !== '^' && this.j[k]) {
        out.rot.push([this.j[k], new THREE.Quaternion().setFromEuler(new THREE.Euler(v[0] * D2R, v[1] * D2R, v[2] * D2R))]);
      }
    }
    return out;
  }

  // Layer a compiled pose over whatever the mixer produced this frame.
  blend(cp, w) {
    if (w <= 0.001) return;
    for (const [o, q] of cp.rot) o.quaternion.slerp(q, w);
    for (const [o, p] of cp.pos) o.position.lerp(p, w);
  }
}

// Two-bone IK for a chain hanging along local -y and bending about local z.
// Solves in screen space (world x/y), so a 3/4-turned character still lands exactly on the target from the side camera.
export function ik2(upper, lower, end, target, bend = -1) {
  const parent = upper.parent;
  parent.updateWorldMatrix(true, false);
  const e = parent.matrixWorld.elements;
  const z0 = upper.position.z;
  const rx = target.x - e[12] - z0 * e[8], ry = target.y - e[13] - z0 * e[9];
  const det = e[0] * e[5] - e[4] * e[1];
  if (Math.abs(det) < 1e-8) return 0;
  const lx = (rx * e[5] - e[4] * ry) / det, ly = (e[0] * ry - e[1] * rx) / det;
  const dx = lx - upper.position.x, dy = ly - upper.position.y;
  const L1 = Math.abs(lower.position.y), L2 = Math.abs(end.position.y);
  const want = Math.hypot(dx, dy);
  const d = Math.min(Math.max(want, Math.abs(L1 - L2) + 0.01), L1 + L2 - 0.01);
  const ang = Math.atan2(dy, dx);
  const b = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const c = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
  upper.rotation.set(0, 0, ang + bend * b + Math.PI / 2);
  lower.rotation.set(0, 0, -bend * (Math.PI - c));
  return want - d;
}
