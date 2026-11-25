import { FORESTRY } from '../content/forestry.ts';
import type { Point } from '../content/world.ts';
import { canStand } from '../domain/navigation.ts';
import type { Collider, Tree } from './layout.ts';
import type { TravelAccess } from './regions.ts';
import { campTreeDimensions, treeFootRadius, treeTrunkRadius } from './tree-dimensions.ts';

export function fellingStandDistance(tree: Tree) {
  return FORESTRY.preferredStandOffset + (tree.regeneration ? treeTrunkRadius(tree) : treeFootRadius(tree));
}

export function fellingStandCandidates(tree: Tree, preferredAngle: number) {
  const radius = fellingStandDistance(tree);
  const angles = tree.regeneration
    ? Array.from({length:16},(_,i)=>i * Math.PI / 8).sort((a,b) => Math.cos(b-preferredAngle)-Math.cos(a-preferredAngle))
    : [0,.55,-.55,1.1,-1.1,Math.PI/2,-Math.PI/2,Math.PI].map(offset=>preferredAngle+offset);
  return angles.map(a => ({x:tree.x+Math.cos(a)*radius,z:tree.z+Math.sin(a)*radius}));
}

export function fellingSpaceIsClear(tree: Tree, stand: Point, blockers: Collider[], access: TravelAccess) {
  const dx = tree.x - stand.x, dz = tree.z - stand.z;
  const length = Math.hypot(dx, dz);
  if (length < .001) return false;
  const x = dx / length, z = dz / length;
  const others = blockers.filter(c => c.id !== tree.id);
  const form = tree.regeneration && tree.woodland ? campTreeDimensions(tree.woodland) : null;
  const reach = (form?.height ?? 5.5) * tree.scale;
  const steps = Math.max(1, Math.ceil((reach - .6) / .4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, distance = form ? .6 + (reach - .6) * t : .6 + i * .4;
    if (distance > reach + .0001) break;
    const width = form ? (.18 + Math.max(0, (t - .4) / .6) * form.crown * .49) * tree.scale : .65 * tree.scale;
    for (const side of [-width, 0, width]) {
      if (!canStand({ x: tree.x + x * distance - z * side, z: tree.z + z * distance + x * side }, others, undefined, access)) return false;
    }
  }
  return true;
}
