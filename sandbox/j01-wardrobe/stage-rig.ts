import * as THREE from 'three';
import type { CharacterFootContact } from '../../src/scene/lighting/character-contact-shadows.ts';
import type { AffixActivity } from './affix-events.ts';
import type { Pose } from './catalog.ts';

export function createFittingRig(avatar: THREE.Group, root: THREE.Object3D, clips: readonly THREE.AnimationClip[], skin: THREE.SkinnedMesh) {
  const original = clips[0];
  const stand = clips.find(clip => clip.name === 'J01_Stand_v2');
  const walk = clips.find(clip => clip.name === 'J01_Walk_v2') ?? original;
  const run = clips.find(clip => clip.name === 'J01_Run_v2');
  const duration = walk === original ? Number(root.userData.j01WalkDuration) || walk.duration : walk.duration;
  const mixer = new THREE.AnimationMixer(root);
  const bones = new Map(skin.skeleton.bones.map(bone => [bone.name, bone]));
  const idle = mixer.clipAction(stand ?? original).play();
  idle.time = stand ? 0 : Number(root.userData.j01IdleTime) || original.duration - .031;
  mixer.update(0);
  const idlePose = [...bones.values()].map(bone => ({
    bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone(),
  }));
  idle.stop();
  const movement = { walk: mixer.clipAction(walk), run: run ? mixer.clipAction(run) : mixer.clipAction(walk) };
  const axis = new THREE.Vector3(), target = new THREE.Vector3();
  const delta = new THREE.Quaternion(), world = new THREE.Quaternion(), inverse = new THREE.Quaternion();
  const plantedFoot = new THREE.Quaternion();
  let playing: THREE.AnimationAction | null = null;
  let strideTime = 0;

  function aim(from: string, child: string, x: number, y: number, z: number) {
    const source = bones.get(from)!, end = bones.get(child)!;
    source.getWorldPosition(target);
    end.getWorldPosition(axis).sub(target).normalize();
    target.set(x, y, z).normalize();
    delta.setFromUnitVectors(axis, target).multiply(source.getWorldQuaternion(world));
    source.quaternion.copy(source.parent!.getWorldQuaternion(inverse).invert().multiply(delta));
    source.updateWorldMatrix(false, true);
  }

  function sample(dt: number, mode: Pose, phase: number | null, reduced: boolean, contact: () => readonly CharacterFootContact[], activity: AffixActivity) {
    avatar.position.y = 0;
    if (mode === 'walk' || mode === 'run') {
      const action = movement[mode];
      if (playing !== action) {
        playing?.stop();
        playing = action.reset().play();
        strideTime = 0;
      }
      const length = mode === 'run' && run ? run.duration : duration;
      strideTime = (strideTime + dt * (mode === 'run' && !run ? 1.45 : 1)) % length;
      action.time = phase == null ? reduced ? length * .24 : strideTime : length * phase;
      mixer.update(0);
    } else {
      playing?.stop();
      playing = null;
      // Reapply the sampled idle before every custom pose, since the mixer skips unchanged writes.
      for (const joint of idlePose) {
        joint.bone.position.copy(joint.position);
        joint.bone.quaternion.copy(joint.quaternion);
        joint.bone.scale.copy(joint.scale);
      }
    }
    avatar.updateMatrixWorld(true);
    if (mode === 'reach') {
      aim('upperarm_l', 'lowerarm_l', .77, .04, .61);
      aim('lowerarm_l', 'hand_l', .18, .91, .48);
      aim('upperarm_r', 'lowerarm_r', -.57, -.31, .74);
      aim('lowerarm_r', 'hand_r', -.28, .47, .83);
    }
    if (activity === 'gather') {
      aim('spine_02', 'neck_01', .11, .84, .50);
      aim('upperarm_l', 'lowerarm_l', .43, -.82, .38);
      aim('lowerarm_l', 'hand_l', .21, -.51, .84);
    }
    if (activity === 'craft') {
      aim('spine_02', 'neck_01', -.12, .83, .53);
      aim('upperarm_r', 'lowerarm_r', -.38, -.87, .31);
      aim('lowerarm_r', 'hand_r', -.23, -.35, .90);
    }
    if (mode === 'squat') {
      aim('spine_02', 'neck_01', 0, .91, .37);
      for (const [side, sign] of [['l', 1], ['r', -1]] as const) {
        const foot = bones.get('foot_' + side)!;
        foot.getWorldQuaternion(plantedFoot);
        aim('thigh_' + side, 'calf_' + side, sign * .16, -.72, .68);
        aim('calf_' + side, 'foot_' + side, sign * .05, -.79, -.53);
        foot.quaternion.copy(foot.parent!.getWorldQuaternion(inverse).invert().multiply(plantedFoot));
      }
      avatar.updateMatrixWorld(true);
      avatar.position.y -= Math.min(...contact().map(foot => foot.position.y));
    }
    avatar.updateMatrixWorld(true);
    return contact();
  }

  return {
    bones, sample, hasNativeRun: !!run,
    clips: { stand: stand?.name ?? original.name, walk: walk.name, run: run?.name ?? null },
    resetPhase() { strideTime = 0; },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(root); },
  };
}
