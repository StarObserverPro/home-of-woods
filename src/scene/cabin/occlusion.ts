import type { CabinDimensions } from '../../content/cabin.ts';
import type { OcclusionVolume } from '../../world/occlusion.ts';
import type { WallPlan } from './shell.ts';

/** The real wall roots and envelope continue to occlude when the camera peels them away. */
export function cabinEnvelopeVolumes(room: CabinDimensions, plans: readonly WallPlan[]): OcclusionVolume[] {
  const height = 1.2;
  const volumes: OcclusionVolume[] = [{
    id: 'cabin:enclosure', center: [0, height, -.1],
    halfSize: [room.width / 2 - .32, height, room.depth / 2 - .32],
    yaw: 0, softness: .45, strength: .18, detail: false,
  }];
  for (const wall of plans) {
    const gaps = wall.openings.filter(opening => opening.kind === 'door').sort((a, b) => a.left - b.left);
    let start = 0;
    for (const gap of [...gaps, { left: wall.length, width: 0 }]) {
      const length = gap.left - start;
      if (length > .01) {
        const along = start + length / 2;
        volumes.push({
          id: `cabin:wall-root:${wall.id}:${start}`,
          center: [wall.origin[0] + along * Math.cos(wall.yaw), .12, wall.origin[2] - along * Math.sin(wall.yaw)],
          halfSize: [length / 2, .1, .05],
          yaw: wall.yaw, softness: .55, strength: .40, detail: true,
        });
      }
      start = gap.left + gap.width;
    }
  }
  return volumes;
}
