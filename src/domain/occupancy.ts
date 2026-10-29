import { BUILDINGS, GAME } from '../content/config';
import { getSurface, surfaceSupportsRectangle } from '../world/surface';
import type { BuildingKind, GameState, Rotation, Vec2 } from './types';

export function footprint(kind: BuildingKind, rotation: Rotation): { width: number; depth: number } {
  const spec = BUILDINGS[kind];
  return rotation % 2 ? { width: spec.depth, depth: spec.width } : { width: spec.width, depth: spec.depth };
}

export function rectanglesOverlap(a: Vec2, aw: number, ad: number, b: Vec2, bw: number, bd: number): boolean {
  return Math.abs(a.x - b.x) < (aw + bw) / 2 - 0.015 && Math.abs(a.z - b.z) < (ad + bd) / 2 - 0.015;
}

export function hasOccupiedFootprint(state: GameState, position: Vec2, width: number, depth: number, ignoreId?: string): boolean {
  if (state.trees.some(t => t.id !== ignoreId && rectanglesOverlap(position, width, depth, t, 1.05, 1.05))) return true;
  if (state.plots.some(p => p.id !== ignoreId && rectanglesOverlap(position, width, depth, p, 0.94, 0.94))) return true;
  return state.buildings.some(b => {
    const f = footprint(b.kind, b.rotation);
    return b.id !== ignoreId && rectanglesOverlap(position, width, depth, b, f.width, f.depth);
  });
}

export function isPositionWalkable(state: GameState, x: number, z: number): boolean {
  const r = GAME.playerRadius;
  if (!getSurface(x, z).walkable || !surfaceSupportsRectangle(x, z, r * 2, r * 2)) return false;
  for (const tree of state.trees) {
    if ((x - tree.x) ** 2 + (z - tree.z) ** 2 < (r + 0.4) ** 2) return false;
  }
  for (const building of state.buildings) {
    const f = footprint(building.kind, building.rotation);
    if (Math.abs(x - building.x) < f.width / 2 + r && Math.abs(z - building.z) < f.depth / 2 + r) return false;
  }
  return true;
}
