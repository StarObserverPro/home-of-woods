import { CABIN } from './world.ts';
import type { Point } from './world.ts';

export const CABIN_EXTERIOR = {
  scale: 1.6,
  yaw: 0,
  // Midpoint of the door jambs and top of wood_floor in the source GLB.
  threshold: { x: -.6, y: .775, z: 3.35 },
  landingDistance: 4.02,
  approachReach: .85,
} as const;

export function cabinPortal(origin: Point, yaw: number) {
  const { scale, threshold, landingDistance } = CABIN_EXTERIOR;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const toWorld = (x: number, z: number) => ({
    x: origin.x + c * x + s * z,
    z: origin.z - s * x + c * z,
  });
  return {
    threshold: toWorld(threshold.x * scale, threshold.z * scale),
    landing: toWorld(threshold.x * scale, threshold.z * scale + landingDistance),
    outward: { x: s, z: c },
    outwardFacing: yaw,
  };
}

export const CABIN_PORTAL = cabinPortal(CABIN, CABIN_EXTERIOR.yaw);

export const CABIN_ROOF_REPAIR = [
  { source: 'roof_board002', name: 'repair-roof-left', x: -2.35, z: 1.23 },
  { source: 'roof_board007', name: 'repair-roof-right', x: 2.35, z: 2.02 },
] as const;

export type CabinDimensions = {
  width: number; depth: number; height: number; wallThickness: number;
  doorWidth: number; doorHeight: number; doorThickness: number; doorX: number;
  porchDepth: number; porchWidth: number; actorRadius: number; floorY: number;
};

export const CABIN_AUDIT_ROOM = {
  width: 8.4, depth: 7, height: 3.35, wallThickness: .18,
  doorWidth: 2, doorHeight: 2.95, doorThickness: .08, doorX: 0,
  porchDepth: 2.4, porchWidth: 5.6, actorRadius: .92, floorY: 0,
} satisfies CabinDimensions;

const V = CABIN_EXTERIOR.scale;
// +X follows the façade to the right, +Z points out the door, and Y=0 is the
// top of the floor. The centerline of the off-center door is shared with the GLB.
export const CABIN_ROOM = {
  ...CABIN_AUDIT_ROOM,
  width: (2 * 4.05 - .52) * V,
  depth: (6 - .48) * V,
  height: 4.65,
  wallThickness: .48 * V,
  doorWidth: (1.7 - .22) * V,
  doorHeight: (3.25 - .125 - CABIN_EXTERIOR.threshold.y) * V,
  doorX: CABIN_EXTERIOR.threshold.x * V,
} satisfies CabinDimensions;

export const CABIN_ENTRY = { x: CABIN_ROOM.doorX, z: CABIN_ROOM.depth / 2 - 1.2 };
export const CABIN_WINDOW = {
  x: 2.45 * V,
  width: 1.6 * V,
  bottom: (2.55 - .66 - CABIN_EXTERIOR.threshold.y) * V,
  height: 1.32 * V,
};
export const CABIN_SCONCE = { x: CABIN_ROOM.width / 2 - .04, y: 2.45, z: -.85 };
export const CABIN_SCONCE_STAND = { x: CABIN_SCONCE.x - 1.2, z: CABIN_SCONCE.z };
export const CABIN_USE_REACH = .4;
