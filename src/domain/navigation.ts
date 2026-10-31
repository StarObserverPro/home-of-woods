import { MOVEMENT } from "../content/world.ts";
import type { Point } from "../content/world.ts";
import type { Collider } from "../world/layout.ts";
import {
  heightAt,
  inOpenArea,
  pathDistance,
  slopeAt,
} from "../world/surface.ts";
export function canStand(
  p: Point,
  colliders: Collider[],
  radius = MOVEMENT.radius,
) {
  if (!inOpenArea(p.x, p.z) || slopeAt(p.x, p.z) > MOVEMENT.maxSlope)
    return false;
  return !colliders.some((c) =>
    "radius" in c
      ? Math.hypot(p.x - c.x, p.z - c.z) < c.radius + radius
      : Math.abs(p.x - c.x) < c.halfX + radius &&
        Math.abs(p.z - c.z) < c.halfZ + radius,
  );
}
function segmentEntersBox(from:Point,to:Point,c:Extract<Collider,{halfX:number}>){
  let enter=0,exit=1;
  for(const [offset,delta,half] of [
    [from.x-c.x,to.x-from.x,c.halfX+MOVEMENT.radius],
    [from.z-c.z,to.z-from.z,c.halfZ+MOVEMENT.radius],
  ]){
    if(delta===0){if(Math.abs(offset)>=half)return false;continue;}
    const a=(-half-offset)/delta,b=(half-offset)/delta;
    enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
    if(enter>=exit)return false;
  }
  return enter<exit;
}
/** An expanding trunk may overlap a stationary player. Only monotonic retreat is allowed. */
function canRetreat(from:Point,to:Point,colliders:Collider[]){
  if(!inOpenArea(to.x,to.z)||slopeAt(to.x,to.z)>MOVEMENT.maxSlope)return false;
  const dx=to.x-from.x,dz=to.z-from.z,lengthSquared=dx*dx+dz*dz;
  if(!lengthSquared)return false;
  let overlap=false;
  for(const c of colliders){
    if(!('radius'in c)){
      if(segmentEntersBox(from,to,c))return false;
      continue;
    }
    const x=from.x-c.x,z=from.z-c.z,limit=(c.radius+MOVEMENT.radius)**2;
    const dot=x*dx+z*dz;
    if(x*x+z*z<limit){
      // Distance must increase throughout the segment, not only at its endpoint.
      if(dot<0)return false;
      overlap=true;
    }else{
      const t=Math.max(0,Math.min(1,-dot/lengthSquared));
      if((x+dx*t)**2+(z+dz*t)**2<limit)return false;
    }
  }
  return overlap;
}
export function move(
  p: Point,
  dx: number,
  dz: number,
  colliders: Collider[],
): Point {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.16));
  let x = p.x,
    z = p.z;
  for (let i = 0; i < steps; i++) {
    const nx = x + dx / steps,
      nz = z + dz / steps;
    const current={x,z},legalStart=canStand(current,colliders);
    const accepts=(next:Point)=>legalStart?canStand(next,colliders):canRetreat(current,next,colliders);
    if (accepts({ x: nx, z: nz })) {
      x = nx;
      z = nz;
    } else if (accepts({ x: nx, z })) x = nx;
    else if (accepts({ x, z: nz })) z = nz;
  }
  return { x, z };
}
const GRID = 1.5;
const key = (x: number, z: number) => `${x},${z}`;
export function findPath(
  from: Point,
  to: Point,
  colliders: Collider[],
): Point[] {
  if (!canStand(to, colliders)) return [];
  const sx = Math.round(from.x / GRID),
    sz = Math.round(from.z / GRID);
  const tx = Math.round(to.x / GRID),
    tz = Math.round(to.z / GRID);
  const start = key(sx, sz),
    target = key(tx, tz);
  const scores = new Map([[start, 0]]),
    parents = new Map<string, string>();
  const open = new Map([[start, Math.hypot(sx - tx, sz - tz)]]),
    closed = new Set<string>();
  for (let count = 0; count < 9000 && open.size; count++) {
    let current = "",
      best = Infinity;
    open.forEach((v, k) => {
      if (v < best) {
        best = v;
        current = k;
      }
    });
    if (current === target) {
      const route: Point[] = [{x:to.x,z:to.z}];
      let cursor = current;
      while (cursor !== start) {
        const [x, z] = cursor.split(",").map(Number);
        route.push({ x: x * GRID, z: z * GRID });
        cursor = parents.get(cursor)!;
      }
      return route.reverse();
    }
    open.delete(current);
    closed.add(current);
    const [x, z] = current.split(",").map(Number),
      fromP = { x: x * GRID, z: z * GRID };
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const nk = key(x + dx, z + dz),
          np = { x: (x + dx) * GRID, z: (z + dz) * GRID };
        if (closed.has(nk) || !canStand(np, colliders)) continue;
        // Prevent diagonal corner cuts and collision between grid nodes.
        const checked = move(fromP, dx * GRID, dz * GRID, colliders);
        if (Math.hypot(checked.x - np.x, checked.z - np.z) > 0.01) continue;
        const cost =
          scores.get(current)! +
          Math.hypot(dx, dz) *
            (1 + Math.min(pathDistance(np.x, np.z) / 20, 0.8)) +
          Math.abs(heightAt(np.x, np.z) - heightAt(fromP.x, fromP.z)) * 0.2;
        if (cost >= (scores.get(nk) ?? Infinity)) continue;
        parents.set(nk, current);
        scores.set(nk, cost);
        open.set(nk, cost + Math.hypot(x + dx - tx, z + dz - tz));
      }
  }
  return [];
}
