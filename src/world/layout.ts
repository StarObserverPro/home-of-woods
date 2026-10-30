import { CABIN, GIANT, HOME, TENT, WORLD_SEED } from "../content/world.ts";
import { heightAt, pathDistance, riverX, slopeAt } from "./surface.ts";
export type Tree = {
  id: string;
  individualId: string;
  generation: number;
  x: number;
  z: number;
  kind: "pine" | "broadleaf";
  scale: number;
  variant: number;
  role: "managed" | "scenery" | "landmark";
};
export type Collider =
  | { id: string; x: number; z: number; radius: number }
  | { id: string; x: number; z: number; halfX: number; halfZ: number };
export function makeRocks() {
  const rng = random(20261029),
    rocks: {
      id: string;
      x: number;
      z: number;
      scale: number;
      rotation: number;
    }[] = [];
  for (let i = 0; i < 65; i++) {
    const x = -110 + rng() * 226,
      z = -100 + rng() * 218;
    if (pathDistance(x, z) < 3.7 || Math.hypot(x - HOME.x, z - HOME.z) < 17)
      continue;
    const scale = 0.7 + rng() * 2,
      rotation = rng() * 6.283;
    rocks.push({ id: `rock-${i}`, x, z, scale, rotation });
  }
  return rocks;
}
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeTrees(seed = WORLD_SEED): Tree[] {
  const rng = random(seed),
    trees: Tree[] = [];
  for (let row = 0; row < 26; row++)
    for (let col = 0; col < 28; col++) {
      const x = -125 + col * 9 + rng() * 6,
        z = -118 + row * 9 + rng() * 6;
      const scale = 0.85 + rng() * 0.75,
        kind = rng() < (x > -20 ? 0.91 : z < -25 ? 0.22 : 0.85) ? "pine" : "broadleaf";
      const variant = rng();
      if (
        Math.abs(x - riverX(z)) < 8 ||
        pathDistance(x, z) < 6 ||
        Math.hypot((x - HOME.x)*.85, (z - HOME.z)*.7) < 23 ||
        Math.hypot(x - GIANT.x, z - GIANT.z) < 14 ||
        heightAt(x, z) < 2 ||
        slopeAt(x, z) > 1.3
      )
        continue;
      // Keep the camp's east-facing view corridor open.
      if (x > -24 && x < 8 && z > -28 && z < 36) continue;
      const role =
        x > -79 && x < riverX(z)-8 && z > -76 && z < 66 ? "managed" : "scenery";
      const id = `tree-slot-${row}-${col}`;
      trees.push({
        id,
        individualId: `${id}:g0`,
        generation: 0,
        x,
        z,
        scale,
        kind,
        variant,
        role,
      });
    }
  for(const [i,p] of [{x:-20,z:27,scale:1.6},{x:-63,z:22,scale:1.65}].entries()){
    const id=`tree-slot-r3-hero-${i}`;
    trees.push({...p,id,individualId:`${id}:g0`,generation:0,kind:'pine',variant:.2+i*.3,role:'managed'});
  }
  trees.push({
    id: "landmark-elder",
    individualId: "landmark-elder",
    generation: 0,
    ...GIANT,
    kind: "broadleaf",
    scale: 3.8,
    variant: 0.3,
    role: "landmark",
  });
  return trees;
}
export function makeColliders(trees: Tree[]): Collider[] {
  return [
    { id: "cabin", x:CABIN.x, z:CABIN.z+1.4, halfX: 7.5, halfZ: 7.0 },
    { id: "tent", ...TENT, halfX: 4.4, halfZ: 4.4 },
    ...trees
      .filter((t) => t.role !== "scenery")
      .map((t) => ({
        id: t.id,
        x: t.x,
        z: t.z,
        radius: (t.role === "landmark" ? 1.2 : t.kind==='pine' ? .43 : .66) * t.scale,
      })),
    ...makeRocks().map((p) => ({
      id: p.id,
      x: p.x,
      z: p.z,
      radius: p.scale * 0.85,
    })),
  ];
}
