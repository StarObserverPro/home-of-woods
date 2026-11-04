import type { LocalMotionProfile } from '../content/item-behaviors.ts';

export type LocalMotionInput = { moving: boolean; reducedMotion: boolean };
export type LocalMotionSample = { anchorId: string; axis: 'x' | 'y' | 'z'; radians: number };

/**
 * A render-only local pose offset. The host passes an unscaled active-play
 * clock; this module owns no timers, world time, physics or gameplay effects.
 * Planned profiles, reduced-motion mode and idle movement return neutral poses.
 */
export function sampleItemLocalMotion(profile: LocalMotionProfile, elapsedSeconds: number, input: LocalMotionInput): LocalMotionSample[] {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new Error('Invalid local motion time');
  const enabled = profile.status === 'active' && !input.reducedMotion &&
    (profile.driver !== 'movement' || input.moving);
  return profile.channels.map(channel => ({
    anchorId: channel.anchorId, axis: channel.axis,
    radians: enabled ? channel.amplitude *
      Math.sin(2 * Math.PI * channel.frequency * elapsedSeconds + channel.phase) : 0,
  }));
}
