import { WORLD } from '../world/surface';
import { isPositionWalkable } from './occupancy';
import type { GameState, Vec2 } from './types';

const NODE_LIMIT = 1000;
const ENDPOINT_TOLERANCE = 2.75;
const SAMPLE_STEP = 0.18;
const DIRECTIONS = [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const;
interface Node extends Vec2 { key: string; g: number; h: number; parent: string | null }
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** A short, deterministic route on the same collision surface used by movement.
 * Returns waypoints after the player's current position, without mutating game state.
 * Obstructed taps choose the closest reachable grid endpoint within 2.75 world units.
 */
export function findPath(state: GameState, destination: Vec2): Vec2[] {
  const start = state.player;
  if (![destination.x, destination.z].every(Number.isFinite)
    || destination.x <= WORLD.minX || destination.x >= WORLD.maxX
    || destination.z <= WORLD.minZ || destination.z >= WORLD.maxZ
    || !isPositionWalkable(state, start.x, start.z)) return [];
  const walkable = new Map<string, boolean>();
  function clearPoint(x: number, z: number): boolean {
    if (Number.isInteger(x) && Number.isInteger(z)) {
      const key = `${x},${z}`;
      let result = walkable.get(key);
      if (result === undefined) { result = isPositionWalkable(state, x, z); walkable.set(key, result); }
      return result;
    }
    return isPositionWalkable(state, x, z);
  }
  function clearSegment(a: Vec2, b: Vec2): boolean {
    const samples = Math.max(1, Math.ceil(distance(a, b) / SAMPLE_STEP));
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      if (!clearPoint(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }
  const exactEndpoint = clearPoint(destination.x, destination.z);
  if (exactEndpoint && clearSegment(start, destination)) return distance(start, destination) > 0.08 ? [{ ...destination }] : [];

  // The minimum candidate distance determines the preferred side of an obstructed tap.
  // If that side is enclosed, the visited-node fallback still finds another reachable side.
  let closestEndpoint = Infinity;
  for (let x = Math.ceil(destination.x - ENDPOINT_TOLERANCE); x <= Math.floor(destination.x + ENDPOINT_TOLERANCE); x++) {
    for (let z = Math.ceil(destination.z - ENDPOINT_TOLERANCE); z <= Math.floor(destination.z + ENDPOINT_TOLERANCE); z++) {
      const d = Math.hypot(x - destination.x, z - destination.z);
      if (d <= ENDPOINT_TOLERANCE && clearPoint(x, z)) closestEndpoint = Math.min(closestEndpoint, d);
    }
  }
  if (!Number.isFinite(closestEndpoint)) return [];

  const nodes = new Map<string, Node>();
  const open: Node[] = [];
  const closed = new Set<string>();
  function addNode(x: number, z: number, g: number, parent: string | null): void {
    const key = `${x},${z}`;
    if (closed.has(key)) return;
    const old = nodes.get(key);
    if (old) {
      if (g < old.g) { old.g = g; old.parent = parent; }
      return;
    }
    const node: Node = { x, z, key, g, h: Math.hypot(x - destination.x, z - destination.z), parent };
    nodes.set(key, node); open.push(node);
  }
  // A floating-point player position is a virtual start, connected only by clear segments.
  for (let x = Math.round(start.x) - 1; x <= Math.round(start.x) + 1; x++) {
    for (let z = Math.round(start.z) - 1; z <= Math.round(start.z) + 1; z++) {
      if (clearPoint(x, z) && clearSegment(start, { x, z })) addNode(x, z, Math.hypot(x - start.x, z - start.z), null);
    }
  }
  let best: Node | undefined;
  let exact = false;
  let visited = 0;
  while (open.length && visited < NODE_LIMIT) {
    open.sort((a, b) => (a.g + a.h) - (b.g + b.h) || a.h - b.h || a.x - b.x || a.z - b.z);
    const node = open.shift()!;
    closed.add(node.key); visited++;
    if (node.h <= ENDPOINT_TOLERANCE && (!best || node.h < best.h - 1e-8 || (Math.abs(node.h - best.h) < 1e-8 && node.g < best.g))) best = node;
    if (exactEndpoint && node.h <= 1.75 && clearSegment(node, destination)) { best = node; exact = true; break; }
    if (!exactEndpoint && node.h <= closestEndpoint + 1e-8) { best = node; break; }
    for (const [dx, dz] of DIRECTIONS) {
      const x = node.x + dx;
      const z = node.z + dz;
      if (x <= WORLD.minX || x >= WORLD.maxX || z <= WORLD.minZ || z >= WORLD.maxZ || !clearPoint(x, z)) continue;
      // No diagonal squeezing between two blocked neighbors, even if their centers are clear.
      if (dx && dz && (!clearPoint(node.x + dx, node.z) || !clearPoint(node.x, node.z + dz))) continue;
      if (!clearSegment(node, { x, z })) continue;
      addNode(x, z, node.g + Math.hypot(dx, dz), node.key);
    }
  }
  if (!best) return [];
  const path: Vec2[] = [];
  let node: Node | undefined = best;
  while (node) {
    path.push({ x: node.x, z: node.z });
    node = node.parent ? nodes.get(node.parent) : undefined;
  }
  path.reverse();
  while (path.length && distance(start, path[0]) < 0.08) path.shift();
  if (exact && (!path.length || distance(path[path.length - 1], destination) > 0.08)) path.push({ ...destination });
  return path;
}
