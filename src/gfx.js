import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export { RoundedBoxGeometry };
export const INK = 0x0d0a18;

const ramp = new THREE.DataTexture(new Uint8Array([60, 60, 60, 255, 140, 140, 140, 255, 210, 210, 210, 255, 255, 255, 255, 255]), 4, 1, THREE.RGBAFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.generateMipmaps = false;
ramp.needsUpdate = true;

// Shared moonlight rim so every cel-shaded surface gets the same hard edge highlight.
export const rimU = { rimColor: { value: new THREE.Color(0x9cc0ff) }, rimStrength: { value: 0.5 } };

const matCache = new Map();
export function toon(color, { rim = 1, map = null, emissive = 0, transparent = false, opacity = 1 } = {}) {
  const key = map || transparent ? null : color + '|' + rim + '|' + emissive;
  if (key && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: ramp, map, transparent, opacity });
  if (emissive) m.emissive = new THREE.Color(emissive);
  if (rim > 0) {
    m.onBeforeCompile = sh => {
      sh.uniforms.rimColor = rimU.rimColor;
      sh.uniforms.rimStrength = rimU.rimStrength;
      sh.uniforms.rimMul = { value: rim };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimMul;')
        .replace('#include <opaque_fragment>',
          'float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);\n' +
          'outgoingLight += rimColor * smoothstep(0.6, 0.66, rimF) * clamp(normal.y * 0.6 + 0.6, 0.0, 1.0) * rimStrength * rimMul;\n' +
          '#include <opaque_fragment>');
    };
    m.customProgramCacheKey = () => 'toonrim';
  }
  if (key) matCache.set(key, m);
  return m;
}

// Inverted hull pushed out in view space, so the ink line keeps one weight on scaled parts.
const inkCache = new Map();
export function inkMat(thick) {
  const k = Math.round(thick * 10);
  if (inkCache.has(k)) return inkCache.get(k);
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  m.onBeforeCompile = sh => {
    sh.uniforms.thick = { value: thick };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float thick;')
      .replace('#include <project_vertex>',
        'vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);\n' +
        'mvPosition.xyz += normalize(normalMatrix * normal) * thick;\n' +
        'gl_Position = projectionMatrix * mvPosition;');
  };
  m.customProgramCacheKey = () => 'ink';
  inkCache.set(k, m);
  return m;
}

export function M(geo, mat, t = 2.2) {
  const m = new THREE.Mesh(geo, typeof mat === 'number' ? toon(mat) : mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (t > 0) {
    const o = new THREE.Mesh(geo, inkMat(t));
    o.castShadow = o.receiveShadow = false;
    o.raycast = () => {};
    m.add(o);
  }
  return m;
}

export const put = (m, x, y, z = 0) => { m.position.set(x, y, z); return m; };
export const RB = (w, h, d, c, t = 2.2, r) => M(new RoundedBoxGeometry(w, h, d, 3, r ?? Math.min(w, h, d) * 0.14), c, t);
export const SP = (r, c, t = 2.2, ws = 24, hs = 16) => M(new THREE.SphereGeometry(r, ws, hs), c, t);
export const CY = (rt, rb, h, c, t = 2.2, seg = 24) => M(new THREE.CylinderGeometry(rt, rb, h, seg), c, t);
export const CA = (r, len, c, t = 2.2) => M(new THREE.CapsuleGeometry(r, len, 6, 16), c, t);
export const CO = (r, h, c, t = 2, seg = 18) => M(new THREE.ConeGeometry(r, h, seg), c, t);
export const ell = (r, sx, sy, sz, c, t = 2.2) => { const m = SP(r, c, t); m.scale.set(sx, sy, sz); return m; };

export function glowMat(color, k = 2, opts = {}) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false, fog: false, ...opts });
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vig: { value: 1.05 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float vig; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 t = texture2D(tDiffuse, vUv);
      vec3 c = t.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(c, c * vec3(0.8, 0.85, 1.22) + vec3(0.004, 0.002, 0.018), (1.0 - smoothstep(0.0, 0.3, l)) * 0.75);
      c = mix(c, c * vec3(1.08, 1.0, 0.86), smoothstep(0.3, 0.9, l) * 0.45);
      vec2 d = vUv - 0.5;
      c *= clamp(1.0 - dot(d, d) * vig, 0.0, 1.0);
      c += (hash(vUv * 900.0 + fract(time)) - 0.5) * 0.014;
      gl_FragColor = vec4(c, t.a);
    }`,
};

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 50, 16000);

  let composer = null, bloom = null, grade = null;
  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.5, 0.82);
    composer.addPass(bloom);
    grade = new ShaderPass(GradeShader);
    composer.addPass(grade);
    composer.addPass(new OutputPass());
  } catch (e) {
    console.warn('Post-processing unavailable, rendering directly.', e);
    composer = null;
  }

  const q = new URLSearchParams(location.search).get('q');
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  const v = {
    renderer, scene, camera, composer, bloom, grade,
    quality: q !== null ? Math.max(0, Math.min(2, +q)) : coarse ? 1 : 2,
    auto: q === null, w: 1, h: 1, slow: 0, shadowLights: [],
  };

  v.applyQuality = () => {
    const dpr = window.devicePixelRatio || 1;
    const pr = v.quality >= 2 ? Math.min(dpr, 2) : v.quality === 1 ? Math.min(dpr, 1.5) : Math.min(dpr, 1);
    renderer.setPixelRatio(pr);
    renderer.setSize(v.w, v.h, false);
    if (composer) { composer.setPixelRatio(pr); composer.setSize(v.w, v.h); }
    const size = v.quality >= 2 ? 2048 : 1024;
    for (const l of v.shadowLights) {
      if (l.shadow.mapSize.x !== size) {
        l.shadow.mapSize.set(size, size);
        if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
      }
    }
  };
  v.resize = (w, h) => {
    v.w = Math.max(1, w); v.h = Math.max(1, h);
    camera.aspect = v.w / v.h;
    camera.updateProjectionMatrix();
    v.applyQuality();
  };
  v.render = (dt, time) => {
    if (grade) grade.uniforms.time.value = time;
    if (composer && v.quality >= 1) composer.render(dt);
    else renderer.render(scene, camera);
  };
  // Step quality down if the device can't keep up; never step back up, to avoid flicker between tiers.
  v.watch = dt => {
    if (!v.auto) return;
    if (dt > 1 / 38) v.slow += dt; else v.slow = Math.max(0, v.slow - dt * 0.5);
    if (v.slow > 2.5 && v.quality > 0) { v.quality--; v.slow = 0; v.applyQuality(); }
  };
  return v;
}
