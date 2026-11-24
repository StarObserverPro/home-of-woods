import { TENT_ENTRY, TENT_PORTAL, TENT_ROOM, TENT_ROOM_BLOCKERS, TENT_USE_REACH } from '../content/tent-room.ts';
import type { Point } from '../content/world.ts';
import type { Collider } from '../world/layout.ts';
import type { TravelAccess } from '../world/regions.ts';
import { movementOffset } from './movement.ts';
import { canStand, findPath, move, navigationGridPoint } from './navigation.ts';

export type TentPlayer = Point & { facing: number; moving: boolean };
export type TentVisit = {
  player: TentPlayer; destination: Point | null; route: Point[]; action: 'exit' | null;
};
export function makeTentVisit(): TentVisit {
  return { player: { ...TENT_ENTRY, facing: Math.PI, moving: false }, destination: null, route: [], action: null };
}

const radius = TENT_ROOM.actorRadius;
const boxes = TENT_ROOM_BLOCKERS.map(b => ({
  minX: b.x - b.halfX - radius, maxX: b.x + b.halfX + radius,
  minZ: b.z - b.halfZ - radius, maxZ: b.z + b.halfZ + radius,
}));
export function tentFloorPoint({ x, z }: Point): Point {
  const maxZ = TENT_ROOM.depth / 2 - radius;
  return { x: Math.max(-TENT_ROOM.walkHalfX, Math.min(TENT_ROOM.walkHalfX, x)), z: Math.max(-maxZ, Math.min(maxZ, z)) };
}
export function tentCanStand(p: Point) {
  const bounded = tentFloorPoint(p);
  return Number.isFinite(p.x) && Number.isFinite(p.z) && bounded.x === p.x && bounded.z === p.z &&
    !boxes.some(b => p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ);
}
function clearSegment(from: Point, to: Point) {
  return boxes.every(b => {
    let enter = 0, exit = 1;
    for (const [p, d, lo, hi] of [[from.x, to.x - from.x, b.minX, b.maxX], [from.z, to.z - from.z, b.minZ, b.maxZ]]) {
      if (d === 0) { if (p <= lo || p >= hi) return true; continue; }
      const a = (lo - p) / d, z = (hi - p) / d;
      enter = Math.max(enter, Math.min(a, z)); exit = Math.min(exit, Math.max(a, z));
      if (enter >= exit) return true;
    }
    return enter >= exit;
  });
}
/** Tiny visibility graph around the three furnishings; no world navigation or RNG. */
export function tentRoute(from: Point, destination: Point): Point[] {
  const target = tentFloorPoint(destination);
  if (!tentCanStand(from) || !tentCanStand(target)) return [];
  const margin = .025;
  const vertices = [from, target, ...boxes.flatMap(b => [
    { x: b.minX - margin, z: b.minZ - margin }, { x: b.minX - margin, z: b.maxZ + margin },
    { x: b.maxX + margin, z: b.minZ - margin }, { x: b.maxX + margin, z: b.maxZ + margin },
  ]).filter(tentCanStand)];
  const distance = vertices.map(() => Infinity), parent = vertices.map(() => -1), visited = new Set<number>();
  distance[0] = 0;
  for (let count = 0; count < vertices.length; count++) {
    let current = -1;
    for (let i = 0; i < vertices.length; i++) if (!visited.has(i) && (current < 0 || distance[i] < distance[current])) current = i;
    if (current < 0 || !Number.isFinite(distance[current])) return [];
    if (current === 1) {
      const route: Point[] = [];
      for (let i = 1; i > 0; i = parent[i]) route.unshift({ ...vertices[i] });
      return route;
    }
    visited.add(current);
    for (let i = 1; i < vertices.length; i++) {
      if (visited.has(i) || !clearSegment(vertices[current], vertices[i])) continue;
      const next = distance[current] + Math.hypot(vertices[i].x - vertices[current].x, vertices[i].z - vertices[current].z);
      if (next < distance[i]) { distance[i] = next; parent[i] = current; }
    }
  }
  return [];
}
export function setTentDestination(visit: TentVisit, destination: Point, action: 'exit' | null = null) {
  const route = tentRoute(visit.player, destination);
  visit.route = route; visit.destination = route.length ? route[route.length - 1] : null;
  visit.action = route.length ? action : null;
  return route.length > 0;
}
export function nearTentExit(point: Point) {
  return Math.hypot(point.x - TENT_ENTRY.x, point.z - TENT_ENTRY.z) <= TENT_USE_REACH;
}
export function stepTentVisit(visit: TentVisit, input: Point, dt: number, loadSpeed: number, run: boolean) {
  if (input.x || input.z) { visit.destination = null; visit.route = []; visit.action = null; }
  let distance = Infinity;
  const target = visit.route[0];
  if (target) {
    const x = target.x - visit.player.x, z = target.z - visit.player.z;
    distance = Math.hypot(x, z);
    input = distance > .015 ? { x: x / distance, z: z / distance } : { x: 0, z: 0 };
    if (distance <= .015) { visit.route.shift(); if (!visit.route.length) visit.destination = null; }
  }
  const offset = movementOffset(input, loadSpeed, run, dt, distance), old = { ...visit.player };
  // Substeps prevent a run or a coarse review tick from tunnelling through props.
  const steps = Math.max(1, Math.ceil(Math.hypot(offset.x, offset.z) / .1));
  for (let i = 0; i < steps; i++) {
    const next = tentFloorPoint({ x: visit.player.x + offset.x / steps, z: visit.player.z + offset.z / steps });
    if (tentCanStand(next)) Object.assign(visit.player, next);
    else if (tentCanStand({ x: next.x, z: visit.player.z })) visit.player.x = next.x;
    else if (tentCanStand({ x: visit.player.x, z: next.z })) visit.player.z = next.z;
  }
  const x = visit.player.x - old.x, z = visit.player.z - old.z;
  visit.player.moving = Math.hypot(x, z) > .001;
  if (visit.player.moving) visit.player.facing = Math.atan2(x, z);
}
export function atTentEntrance(point: Point) {
  return Math.hypot(point.x - TENT_PORTAL.landing.x, point.z - TENT_PORTAL.landing.z) <= TENT_PORTAL.approachReach;
}
export function tentApproachRoute(from: Point, colliders: Collider[], access: TravelAccess): Point[] {
  const { landing } = TENT_PORTAL, grid = navigationGridPoint(landing);
  if (!canStand(landing, colliders, undefined, access) || !canStand(grid, colliders, undefined, access)) return [];
  const end = move(grid, landing.x - grid.x, landing.z - grid.z, colliders, access);
  if (Math.hypot(end.x - landing.x, end.z - landing.z) > .01) return [];
  return findPath(from, landing, colliders, access);
}
