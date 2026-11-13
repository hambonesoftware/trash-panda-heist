import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const sockets = new Map();

export async function loadArt() {
  try {
    const url = new URL('../assets/midnight.glb', import.meta.url);
    const { scene } = await new GLTFLoader().loadAsync(url.href);
    for (const socket of scene.children) {
      socket.traverse(node => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
      });
      sockets.set(socket.name, socket);
    }
  } catch (error) {
    console.warn('Midnight art could not load. Using the built-in models.', error);
  }
}

export function artMesh(name) {
  // GLTFLoader strips punctuation from node names for animation binding.
  return sockets.get(name.replaceAll('.', ''))?.clone() ?? null;
}

export function artReady() {
  return ['raccoon.head', 'worker.head', 'facade', 'fire-escape', 'dumpster',
    'dumpster-lid', 'slingshot', 'crate', 'carton', 'ammo-can', 'ammo-bottle', 'ammo-bag']
    .every(name => sockets.has(name.replaceAll('.', '')));
}

export function replaceJointArt(prefix, joints) {
  for (const [name, joint] of Object.entries(joints)) {
    const mesh = artMesh(prefix + '.' + name);
    if (!mesh) continue;
    for (const child of joint.children.slice()) {
      if (child.isMesh) joint.remove(child);
    }
    joint.add(mesh);
  }
}

export function fireEscapeArt(group, floor) {
  const section = sockets.get('fire-escape');
  if (!section) return false;
  section.updateMatrixWorld(true);
  const width = floor.x1 - floor.x0;
  const count = Math.ceil(width / 100);
  const step = width / count;
  const tile = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  section.traverse(mesh => {
    if (!mesh.isMesh) return;
    const batch = new THREE.InstancedMesh(mesh.geometry, mesh.material, count);
    batch.receiveShadow = true;
    for (let i = 0; i < count; i++) {
      tile.makeScale(step / 100, 1, 1);
      tile.setPosition(floor.x0 + (i + .5) * step, floor.h, 0);
      batch.setMatrixAt(i, matrix.multiplyMatrices(tile, mesh.matrixWorld));
    }
    group.add(batch);
  });
  return true;
}
