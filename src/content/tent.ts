/** Original felt camp tent. All geometry is in the old asset's local frame: Y up,
 * +Z entrance. The scene applies this scale once, at the building root. */
export const TENT_SCALE = 1.6;
export const TENT_SHAPE = {
  halfWidth: 2.65, halfDepth: 2.4, ridgeY: 3.9, hemY: .2, floorY: .18,
  doorZ: 2.43, doorHalfWidth: 1.22, doorTopY: 3.05, thickness: .035,
  roofSag: .14, ridgeSag: .075, widthSegments: 14, lengthSegments: 18,
} as const;

export const TENT_FURNISHINGS = {
  sleepingBag: { x: -.95, z: -.15, width: 1.12, length: 2.85, height: .30 },
  drum: { x: .94, z: -.25, radius: .34, height: .72 },
  bowl: { x: .86, z: 1.05, radius: .30, height: .22 },
} as const;

/** Stable attachment datums; installed ornaments can resolve these same IDs. */
export const TENT_HANGING_SOCKETS = [
  { id: 'tent:entry-left', x: -.91, y: 2.68, z: 2.56 },
  { id: 'tent:entry-crown', x: 0, y: 3.52, z: 2.56 },
  { id: 'tent:entry-right', x: .91, y: 2.68, z: 2.56 },
] as const;

export const TENT_CLOTH = {
  patternResolution: 512, fiberResolution: 256, fiberRepeat: 3,
  roughness: .94, bumpScale: .012, sheen: .72, sheenRoughness: .94,
  maxWindDisplacement: .035, windUpdatesPerSecond: 24,
  palette: { cream: '#d5c5a5', red: '#9b5041', ink: '#344957', ochre: '#ae824e', sage: '#7d9071' },
} as const;

export type TentCanvasVariant = 'warm' | 'sage';
export type TentDebugMode = 'final' | 'clay' | 'wireframe' | 'normals';
