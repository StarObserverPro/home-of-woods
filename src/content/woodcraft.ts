/** First local physics region. Values are prototype budgets, not device benchmarks. */
export const WOODCRAFT = {
  id: 'camp-woodcraft', x: -29, z: 7, halfX: 3, halfZ: 2.5,
  stand: { x: -33.5, z: 6 }, reach: 8, activateRadius: 18, unloadRadius: 24,
  maxPieces: 32, fixedStep: 1 / 60, releaseInterval: .28,
  ground: { minX: -34, maxX: -24, minZ: 2, maxZ: 12, step: 2 },
  railHeight: .3, railWidth: .16,
} as const;
export type Vec3 = { x: number; y: number; z: number };
export type Quat = Vec3 & { w: number };
export const zeroVector = (): Vec3 => ({ x: 0, y: 0, z: 0 });
export const insideWoodcraft = (p: {x:number;z:number}, margin = .6) =>
  Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x - WOODCRAFT.x) <= WOODCRAFT.halfX - margin && Math.abs(p.z - WOODCRAFT.z) <= WOODCRAFT.halfZ - margin;
