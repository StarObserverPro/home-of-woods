import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { CHARACTER } from '../../../../src/content/characters.ts';
import { MOVEMENT } from '../../../../src/content/world.ts';
import { applySeatedLegPose, SEATED_SKIN_CLEARANCE } from '../../../../src/scene/seated-pose.ts';
import type { Resources } from '../../../../src/scene/resources.ts';

export type CabinCharacterPose = {
  x: number;
  z: number;
  facing: number;
  posture: 'standing' | 'seated' | 'resting';
  moving: boolean;
  seatY?: number;
  bedY?: number;
};

/** All heights are world units, including the existing character's 1.5 outer scale. */
export type CabinCharacterMeasurements = {
  height: number;
  width: number;
  depth: number;
  posture: CabinCharacterPose['posture'];
  supportY: number;
  skinSupportY: number;
};

type BoneRest = { bone: THREE.Bone; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 };
const nameOf = (name: string) => name.replaceAll('.', '');
const pelvisBones = new Set(['hips']);
const backBones = new Set(['hips', 'spine', 'chest']);
const headBones = new Set(['head']);
const pillowRise = .792 - .5775;
// Measured adopted bed pillow: its flat top occupies Z [-.893, -.531].
const pillowContactZ = -.67;
const bedHalfLength = 3.05 / 2;

/**
 * A small adapter around the actual game character. It owns no clock, route, input,
 * inventory, RAF or save. The host calls update once from its own scene loop.
 */
export async function createCabinCharacter(resources: Resources) {
  const loader = new GLTFLoader();
  const owned = new Set<object>();
  function own<T extends { dispose(): void }>(resource: T) {
    if (!owned.has(resource)) { owned.add(resource); resources.own(resource); }
  }
  function registerSource(source: THREE.Object3D) {
    source.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      own(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        own(material);
        for (const value of Object.values(material)) {
          const texture = value as THREE.Texture | undefined;
          if (!texture?.isTexture) continue;
          own(texture);
          const bitmap = texture.source?.data as { close?: () => void } | undefined;
          if (bitmap?.close && !owned.has(bitmap)) {
            owned.add(bitmap);
            resources.own({ dispose: () => bitmap.close?.() });
          }
        }
      }
      const skinned = mesh as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh) own(skinned.skeleton);
    });
  }
  const [model, motions] = await Promise.all([
    loader.loadAsync('/assets/characters/player.glb').then(gltf => {
      // Register promptly: a later animation-load failure must not leak this GLB.
      registerSource(gltf.scene);
      return gltf;
    }),
    loader.loadAsync('/assets/characters/motions.glb'),
  ]);
  if (resources.disposed) throw new Error('木屋人物加载已取消');
  const idleClip = motions.animations.find(clip => clip.name === 'Idle_A');
  const walkClip = motions.animations.find(clip => clip.name === 'Walking_A');
  if (!idleClip || !walkClip) throw new Error('木屋缺少原角色待机或行走动作');

  const root = new THREE.Group();
  root.name = 'cabin-player';
  root.scale.setScalar(CHARACTER.worldScale);
  const postureRoot = new THREE.Group();
  postureRoot.name = 'cabin-player-posture';
  const body = cloneSkeleton(model.scene);
  body.name = 'cabin-player-body';
  root.add(postureRoot);
  postureRoot.add(body);
  const bones = new Map<string, THREE.Bone>();
  const rest: BoneRest[] = [];
  body.traverse(object => {
    const bone = object as THREE.Bone;
    if (bone.isBone) {
      bones.set(nameOf(bone.name), bone);
      rest.push({ bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone() });
    }
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    const skinned = object as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) {
      own(skinned.skeleton);
      // Skin bounds change in the bed and seat poses. Avoid stale GLB culling.
      skinned.frustumCulled = false;
    }
  });
  const mixer = new THREE.AnimationMixer(body);
  const actions = { idle: mixer.clipAction(idleClip), walk: mixer.clipAction(walkClip) };
  let mode: keyof typeof actions = 'idle';
  actions.idle.play();
  let disposed = false;
  let time = .01;
  let distanceTime = 0;
  let previousPosition: { x: number; z: number } | undefined;
  let poseKey = '';
  let currentPosture: CabinCharacterPose['posture'] = 'standing';
  let supportY = 0;
  let skinSupportY = 0;

  function restoreBones() {
    for (const value of rest) {
      value.bone.position.copy(value.position);
      value.bone.quaternion.copy(value.quaternion);
      value.bone.scale.copy(value.scale);
    }
  }
  function sample(next: keyof typeof actions, at: number) {
    if (next !== mode) {
      actions[mode].stop();
      mode = next;
      actions[mode].reset().play();
    }
    restoreBones();
    actions[mode].time = at % actions[mode].getClip().duration;
    mixer.update(0);
    // Store the last *sampled* pose, not the bind pose. PropertyMixer may skip
    // reapplying unchanged tracks; restoring bind data before an equal-time
    // sample would otherwise leave the character in a partial T-pose.
    for (const value of rest) {
      value.position.copy(value.bone.position);
      value.quaternion.copy(value.bone.quaternion);
      value.scale.copy(value.bone.scale);
    }
  }

  /** Actual skinned vertices, in root-local coordinates; never raw accessor bounds. */
  function bounds(include?: ReadonlySet<string>, lowest?: THREE.Vector3) {
    root.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert();
    const box = new THREE.Box3();
    const point = new THREE.Vector3();
    body.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      const position = mesh.geometry.getAttribute('position');
      const indices = mesh.geometry.getAttribute('skinIndex');
      const weights = mesh.geometry.getAttribute('skinWeight');
      const skinned = mesh as THREE.SkinnedMesh;
      const transform = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
      for (let index = 0; index < position.count; index++) {
        if (include) {
          if (!skinned.isSkinnedMesh || !indices || !weights) continue;
          let dominant = 0;
          for (let slot = 1; slot < 4; slot++) {
            if (weights.getComponent(index, slot) > weights.getComponent(index, dominant)) dominant = slot;
          }
          const bone = skinned.skeleton.bones[indices.getComponent(index, dominant)];
          if (!include.has(nameOf(bone.name))) continue;
        }
        mesh.getVertexPosition(index, point);
        point.applyMatrix4(transform);
        box.expandByPoint(point);
        if (lowest && point.y < lowest.y) lowest.copy(point);
      }
    });
    if (box.isEmpty()) throw new Error('木屋人物蒙皮包络为空');
    return box;
  }

  function configurePosture(pose: CabinCharacterPose) {
    sample('idle', .01);
    postureRoot.position.set(0, 0, 0);
    postureRoot.rotation.set(0, 0, 0);
    const scale = CHARACTER.worldScale;
    currentPosture = pose.posture;
    supportY = pose.posture === 'seated' ? (pose.seatY ?? .58) : pose.posture === 'resting' ? (pose.bedY ?? .5775) : 0;
    if (pose.posture === 'seated') {
      applySeatedLegPose(root, bones);
      // Keep the familiar short-legged character: pelvis contacts the seat,
      // while feet may hang naturally rather than stretching its skeleton.
      for (const side of ['l', 'r']) {
        const upperArm = bones.get(`upperarm${side}`);
        const forearm = bones.get(`lowerarm${side}`);
        if (upperArm) upperArm.rotation.x -= .3;
        if (forearm) forearm.rotation.x -= .4;
      }
      const contact = bounds(pelvisBones).min.y;
      postureRoot.position.y = (supportY + SEATED_SKIN_CLEARANCE) / scale - contact;
      skinSupportY = supportY + SEATED_SKIN_CLEARANCE;
    } else if (pose.posture === 'resting') {
      // +Y becomes -Z (head toward the headboard), +Z becomes +Y (face up).
      postureRoot.rotation.x = -Math.PI / 2;
      const spine = bones.get('spine');
      if (spine) {
        const base = spine.quaternion.clone();
        const localX = new THREE.Vector3(1, 0, 0);
        let low = 0, high = .8;
        // Recline against the pillow. A rigid 90-degree rotation would put this
        // character's oversized head through the mattress, or float its torso.
        // Bend the actual upper body while preserving all authored bone lengths.
        for (let iteration = 0; iteration < 12; iteration++) {
          const angle = (low + high) / 2;
          spine.quaternion.copy(base).multiply(new THREE.Quaternion().setFromAxisAngle(localX, angle));
          if (bounds(headBones).min.y - bounds(backBones).min.y < pillowRise / scale) low = angle;
          else high = angle;
        }
        spine.quaternion.copy(base).multiply(new THREE.Quaternion().setFromAxisAngle(localX, high));
      }
      const back = bounds(backBones).min.y;
      postureRoot.position.y = (supportY + SEATED_SKIN_CLEARANCE) / scale - back;
      const full = bounds();
      // Translation centres the preserved-size skin; no rescaling to the bed.
      postureRoot.position.x -= (full.min.x + full.max.x) / 2;
      postureRoot.position.z -= (full.min.z + full.max.z) / 2;
      const headContact = new THREE.Vector3(0, Infinity, 0);
      bounds(headBones, headContact);
      const centred = bounds();
      const shiftZ = THREE.MathUtils.clamp(
        pillowContactZ / scale - headContact.z,
        (-bedHalfLength + .03) / scale - centred.min.z,
        (bedHalfLength - .03) / scale - centred.max.z,
      );
      postureRoot.position.z += shiftZ;
      skinSupportY = supportY + SEATED_SKIN_CLEARANCE;
    } else {
      const feet = bounds().min.y;
      postureRoot.position.y = -feet;
      skinSupportY = 0;
    }
    root.updateMatrixWorld(true);
  }

  // The shipped walk clip moves its boots slightly below its authoring plane.
  // Sample actual skin once, then interpolate a tiny render-only floor offset.
  // The state/route remains on Y=0 and the original rig scale is unchanged.
  const floorSamples = 40;
  const floorOffsets = {} as Record<keyof typeof actions, { values: number[]; margin: number }>;
  for (const action of ['idle', 'walk'] as const) {
    postureRoot.position.set(0, 0, 0);
    postureRoot.rotation.set(0, 0, 0);
    const duration = actions[action].getClip().duration;
    const values = Array.from({ length: floorSamples }, (_, index) => {
      sample(action, duration * index / floorSamples);
      return -bounds().min.y;
    });
    let margin = 0;
    // Midpoint samples bound the interpolation error. A millimetre of skin
    // clearance covers the residual between samples without a visible hover.
    for (let index = 0; index < floorSamples; index++) {
      sample(action, duration * (index + .5) / floorSamples);
      const interpolated = (values[index] + values[(index + 1) % floorSamples]) / 2;
      margin = Math.max(margin, -bounds().min.y - interpolated);
    }
    floorOffsets[action] = { values, margin: margin + .001 / CHARACTER.worldScale };
  }
  function floorOffset(action: keyof typeof actions, at: number) {
    const duration = actions[action].getClip().duration;
    const phase = (at % duration) / duration * floorSamples;
    const index = Math.floor(phase), fraction = phase - index;
    const { values, margin } = floorOffsets[action];
    return THREE.MathUtils.lerp(values[index], values[(index + 1) % floorSamples], fraction) + margin;
  }
  configurePosture({ x: 0, z: 0, facing: 0, moving: false, posture: 'standing' });

  return {
    root,
    update(pose: CabinCharacterPose, dt: number) {
      if (disposed) return;
      const elapsed = THREE.MathUtils.clamp(dt, 0, .1);
      time += elapsed;
      if (previousPosition && pose.moving) {
        distanceTime += Math.hypot(pose.x - previousPosition.x, pose.z - previousPosition.z) * 1.6 / MOVEMENT.speed;
      }
      previousPosition = { x: pose.x, z: pose.z };
      root.position.set(pose.x, 0, pose.z);
      root.rotation.y = pose.facing;
      const key = `${pose.posture}:${pose.seatY ?? .58}:${pose.bedY ?? .5775}`;
      if (key !== poseKey) { configurePosture(pose); poseKey = key; }
      if (pose.posture === 'standing') {
        postureRoot.rotation.set(0, 0, 0);
        const action = pose.moving ? 'walk' : 'idle';
        const at = pose.moving ? distanceTime : time;
        postureRoot.position.set(0, floorOffset(action, at), 0);
        sample(action, at);
        skinSupportY = .001;
      }
      root.updateMatrixWorld(true);
    },
    measure(): CabinCharacterMeasurements {
      const box = bounds(), size = box.getSize(new THREE.Vector3()).multiplyScalar(CHARACTER.worldScale);
      const actualSupport = currentPosture === 'standing' ? box.min.y * CHARACTER.worldScale : skinSupportY;
      return { height: size.y, width: size.x, depth: size.z, posture: currentPosture, supportY, skinSupportY: actualSupport };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(body);
      root.removeFromParent();
      // Source buffers, texture bitmaps and both skeletons belong to Resources.
      // The shared owner releases them exactly once when the sandbox unmounts.
    },
  };
}
