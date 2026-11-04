import * as THREE from 'three';
import type { LocalMotionProfile } from '../content/item-behaviors.ts';
import { sampleItemLocalMotion } from '../domain/item-local-motion.ts';
import type { LocalMotionInput } from '../domain/item-local-motion.ts';

/**
 * Bind a tiny local animation to a unique rendered item root (not shared GLB
 * source geometry). It has no render loop, audio, physical bodies or own clock.
 */
export function createItemLocalMotionBinding(root: THREE.Object3D, profile: LocalMotionProfile) {
  if (profile.status !== 'active') throw new Error('Cannot animate an unimplemented item motion');
  const bound = profile.channels.map(channel => {
    const object = root.getObjectByName(channel.anchorId);
    if (!object) throw new Error('Missing item local-motion anchor: ' + channel.anchorId);
    return { channel, object, base: object.rotation[channel.axis] };
  });
  let disposed = false;
  return {
    update(elapsedSeconds: number, input: LocalMotionInput) {
      if (disposed) return;
      const samples = sampleItemLocalMotion(profile, elapsedSeconds, input);
      for (let i = 0; i < samples.length; i++) {
        const entry = bound[i];
        entry.object.rotation[entry.channel.axis] = entry.base + samples[i].radians;
      }
    },
    reset() {
      if (disposed) return;
      for (const entry of bound) entry.object.rotation[entry.channel.axis] = entry.base;
    },
    dispose() {
      if (disposed) return;
      for (const entry of bound) entry.object.rotation[entry.channel.axis] = entry.base;
      disposed = true;
    },
    stats: () => ({ channels: bound.length, disposed }),
  };
}
