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
        if (node.userData.raccoonGroom) {
          // The solid undercoat supplies the shadow. Keep the fine cutout hairs
          // out of the shadow map.
          node.material.alphaToCoverage = true;
          return;
        }
        node.castShadow = true;
        node.receiveShadow = true;
      });
      sockets.set(socket.name, socket);
    }
  } catch (error) {
    console.warn('Midnight art could not load. Using the built-in models.', error);
  }
}

const socketName = name => THREE.PropertyBinding.sanitizeNodeName(name);

export function artMesh(name) {
  return sockets.get(socketName(name))?.clone() ?? null;
}

export function artReady() {
  return ['raccoon.head', 'raccoon.body', 'worker.head', 'facade', 'fire-escape', 'dumpster',
    'dumpster-lid', 'slingshot', 'crate', 'carton', 'ammo-can', 'ammo-bottle', 'ammo-bag']
    .every(name => sockets.has(socketName(name)));
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

export function skinRaccoon(root, joints) {
  const body = artMesh('raccoon.body');
  if (!body) return;
  // Rebind cloned skinned meshes to the existing AnimationMixer joints.
  const skinMeshes = [];
  body.traverse(mesh => { if (mesh.isSkinnedMesh) skinMeshes.push(mesh); });
  if (!skinMeshes.length || skinMeshes.some(mesh =>
    mesh.skeleton.bones.some(bone => !joints[bone.name.slice(5)]))) return;
  const sourceBones = skinMeshes[0].skeleton.bones;
  const tailNames = ['tail0', 'tail1', 'tail2', 'tail3', 'tail4'];
  // Transfer the authored rest offsets without changing the animation axes.
  const point = new THREE.Vector3(), parent = new THREE.Vector3();
  for (const name of tailNames) {
    const bone = sourceBones.find(node => node.name === 'skin_' + name);
    if (!bone) continue;
    bone.getWorldPosition(point);
    bone.parent.getWorldPosition(parent);
    joints[name].position.copy(point.sub(parent));
  }
  const names = new Set(sourceBones.map(bone => bone.name.slice(5)));
  for (const name of names) {
    const joint = joints[name];
    for (const child of joint.children.slice()) {
      if (child.isMesh) joint.remove(child);
    }
  }
  // GLTFLoader splits the material primitives into separate meshes. Bind all
  // of them in the unposed coordinate system, before clips start playing.
  root.updateWorldMatrix(true, true);
  for (const mesh of skinMeshes) {
    const bones = mesh.skeleton.bones.map(bone => joints[bone.name.slice(5)]);
    mesh.removeFromParent();
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.scale.setScalar(1);
    mesh.frustumCulled = false;
    root.add(mesh);
    mesh.updateWorldMatrix(true, false);
    mesh.bind(new THREE.Skeleton(bones), mesh.matrixWorld);
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
