export const WORLD = {
  minX: -16, maxX: 16, minZ: -13, maxZ: 13,
  width: 32, depth: 26, cornerRadius: 3,
  pond: { x: -10, z: 4, radiusX: 3, radiusZ: 2.3 },
} as const;

export interface Surface { height: number; walkable: boolean; kind: 'grass' | 'path' | 'water' | 'outside' }

export function getSurface(x: number, z: number): Surface {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { height: 0, walkable: false, kind: 'outside' };
  const dx = Math.max(Math.abs(x) - (WORLD.maxX - WORLD.cornerRadius), 0);
  const dz = Math.max(Math.abs(z) - (WORLD.maxZ - WORLD.cornerRadius), 0);
  if (Math.abs(x) >= WORLD.maxX || Math.abs(z) >= WORLD.maxZ || dx * dx + dz * dz >= WORLD.cornerRadius ** 2) {
    return { height: 0, walkable: false, kind: 'outside' };
  }
  const p = WORLD.pond;
  if (((x - p.x) / p.radiusX) ** 2 + ((z - p.z) / p.radiusZ) ** 2 <= 1) {
    return { height: -0.12, walkable: false, kind: 'water' };
  }
  const path = (Math.abs(x) < 0.95 && z > -2 && z < 11) || (Math.abs(z + 1) < 0.85 && x > -1 && x < 8);
  return { height: 0, walkable: true, kind: path ? 'path' : 'grass' };
}

export function snapToGrid(position: { x: number; z: number }): { x: number; z: number } {
  return { x: Math.round(position.x), z: Math.round(position.z) };
}

export function surfaceSupportsRectangle(x: number, z: number, width: number, depth: number): boolean {
  // Sample the footprint interior too: a large object may straddle the pond with all corners on grass.
  for (let ix = 0; ix <= Math.ceil(width * 2); ix++) {
    for (let iz = 0; iz <= Math.ceil(depth * 2); iz++) {
      const px = x - width / 2 + ix * width / Math.ceil(width * 2);
      const pz = z - depth / 2 + iz * depth / Math.ceil(depth * 2);
      if (!getSurface(px, pz).walkable) return false;
    }
  }
  return true;
}
