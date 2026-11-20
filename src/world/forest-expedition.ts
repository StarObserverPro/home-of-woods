import { EXPEDITION_BY_ID } from '../content/forest-expedition.ts';
import type { ExpeditionDefinition, ExpeditionHabitat, ExpeditionId, ExpeditionPoint, ExpeditionPoint3, ExpeditionResourceRole, ExpeditionResourceSite, ExpeditionTree, ExpeditionTreeKind } from '../content/forest-expedition.ts';

export type ExpeditionWater = {
  id: string; points: ExpeditionPoint3[]; halfWidth: number; bankWidth: number; deepHalfWidth: number;
};
export type ExpeditionLandmark = ExpeditionPoint3 & { id: string; name: string; treeId: string; approach: ExpeditionPoint3 };
export type ExpeditionTerrainGrid = { step: number; columns: number; rows: number; positions: Float32Array; indices: Uint32Array };
export type ExpeditionLayout = {
  id: ExpeditionId; definition: ExpeditionDefinition; bounds: ExpeditionDefinition['bounds']; terrainStep: number;
  spawn: ExpeditionPoint3; supply: ExpeditionPoint3; routes: ExpeditionDefinition['routes']; habitats: ExpeditionDefinition['habitats'];
  trees: ExpeditionTree[]; landmarks: ExpeditionLandmark[]; resourceSites: ExpeditionResourceSite[];
  water: ExpeditionWater[]; grid: ExpeditionTerrainGrid;
};

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function random(seed: number) { let a = seed >>> 0; return () => { a += 0x6d2b79f5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const distance = (a: ExpeditionPoint, b: ExpeditionPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const rounded = (v: number) => Math.round(v * 1000) / 1000;

function streamCenter(definition: ExpeditionDefinition, z: number) {
  const s = definition.stream;
  return s.x + s.wave * Math.sin(z * .026 + s.phase) + s.wave * .22 * Math.sin(z * .071 + s.phase);
}

/** The same sampled centerline drives terrain carving, visible water and traversal. */
export function expeditionWaterAt(id: ExpeditionId, z: number) {
  const definition = EXPEDITION_BY_ID[id], step = 6, min = definition.bounds.minZ;
  const az = Math.floor((clamp(z, min, definition.bounds.maxZ) - min) / step) * step + min;
  const bz = Math.min(definition.bounds.maxZ, az + step), t = bz === az ? 0 : (z - az) / (bz - az);
  return { x: streamCenter(definition, az) * (1 - t) + streamCenter(definition, bz) * t, y: definition.stream.y + z * definition.stream.slope };
}

/** Vertex heights are immutable mathematical facts; scene code must not add its own height noise. */
export function expeditionVertexHeight(id: ExpeditionId, x: number, z: number) {
  const definition = EXPEDITION_BY_ID[id], terrain = definition.terrain;
  const phase = definition.seed % 31 / 7;
  const hill = Math.sin(x * .038 + phase) * Math.cos(z * .031 - phase) * terrain.relief
    + Math.sin(x * .017 + z * .025 + phase) * terrain.relief * .55;
  const rim = smooth(64, 90, Math.max(Math.abs(x), Math.abs(z))) * terrain.rim;
  const plateau = terrain.base + z * terrain.slopeZ + x * terrain.slopeX + hill + rim;
  const water = expeditionWaterAt(id, z), fromStream = Math.abs(x - water.x);
  const bank = smooth(definition.stream.deepHalfWidth, definition.stream.bankWidth, fromStream);
  const bed = water.y - .75;
  return bed * (1 - bank) + plateau * bank;
}

/** Exact interpolation of the a-c-b / b-c-d terrain triangles, including at the stream banks. */
export function expeditionHeightAt(id: ExpeditionId, x: number, z: number) {
  const definition = EXPEDITION_BY_ID[id], { minX, maxX, minZ, maxZ } = definition.bounds, step = definition.terrainStep;
  const gx = clamp((x - minX) / step, 0, (maxX - minX) / step - 1e-8);
  const gz = clamp((z - minZ) / step, 0, (maxZ - minZ) / step - 1e-8);
  const ax = minX + Math.floor(gx) * step, az = minZ + Math.floor(gz) * step, u = gx % 1, v = gz % 1;
  const a = expeditionVertexHeight(id, ax, az), b = expeditionVertexHeight(id, ax + step, az);
  const c = expeditionVertexHeight(id, ax, az + step), d = expeditionVertexHeight(id, ax + step, az + step);
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

function segmentDistance(point: ExpeditionPoint, a: ExpeditionPoint, b: ExpeditionPoint) {
  const dx = b.x - a.x, dz = b.z - a.z, t = clamp(((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1));
  return Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t);
}

export function expeditionPathDistance(layout: Pick<ExpeditionLayout, 'routes'>, x: number, z: number) {
  let nearest = Infinity;
  for (const route of layout.routes) for (let i = 1; i < route.points.length; i++) nearest = Math.min(nearest, segmentDistance({ x, z }, route.points[i - 1], route.points[i]));
  return nearest;
}

function routeClearance(definition: ExpeditionDefinition, point: ExpeditionPoint) {
  let nearest = Infinity;
  for (const route of definition.routes) for (let i = 1; i < route.points.length; i++) nearest = Math.min(nearest, segmentDistance(point, route.points[i - 1], route.points[i]) - route.halfWidth);
  return nearest;
}

export function expeditionHabitatAt(map: ExpeditionId | Pick<ExpeditionLayout, 'id'>, x: number, z: number): ExpeditionHabitat {
  const id = typeof map === 'string' ? map : map.id, habitats = EXPEDITION_BY_ID[id].habitats;
  return habitats.reduce((best, candidate) => {
    const norm = (h: ExpeditionHabitat) => ((x - h.center.x) / h.radiusX) ** 2 + ((z - h.center.z) / h.radiusZ) ** 2;
    return norm(candidate) < norm(best) ? candidate : best;
  });
}

function terrainGrid(id: ExpeditionId): ExpeditionTerrainGrid {
  const { bounds, terrainStep: step } = EXPEDITION_BY_ID[id];
  const columns = (bounds.maxX - bounds.minX) / step + 1, rows = (bounds.maxZ - bounds.minZ) / step + 1;
  const positions = new Float32Array(columns * rows * 3), indices = new Uint32Array((columns - 1) * (rows - 1) * 6);
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const x = bounds.minX + col * step, z = bounds.minZ + row * step, i = (row * columns + col) * 3;
    positions.set([x, expeditionVertexHeight(id, x, z), z], i);
    if (row < rows - 1 && col < columns - 1) { const a = row * columns + col, b = a + 1, c = a + columns, d = c + 1; indices.set([a,c,b,b,c,d], (row * (columns - 1) + col) * 6); }
  }
  return { step, columns, rows, positions, indices };
}

const treeRatios: Record<ExpeditionTreeKind, [number, number]> = {
  redwood: [.049,.18], hemlock: [.036,.20], spruce: [.033,.21], fir: [.030,.17], pine: [.040,.24], cedar: [.048,.21],
  oak: [.054,.35], maple: [.045,.34], beech: [.039,.30], birch: [.026,.19], aspen: [.024,.18], elm: [.044,.35], ash: [.034,.28], hazel: [.045,.52], berry: [.043,.54], serviceberry: [.035,.36],
};

function dimensions(id: ExpeditionId, kind: ExpeditionTreeKind, variant: 0 | 1 | 2, landmarkHeight?: number) {
  const shrub = kind === 'hazel' || kind === 'berry';
  const heights = kind === 'berry' ? [1.55,1.85,2.15] : shrub ? [2.4,3.2,4] : kind === 'serviceberry' ? [5.5,6.5,7.5] : id === 'upper' ? (kind === 'pine' || kind === 'fir' ? [18,22,26] : [24,30,36]) : id === 'mixed' ? [12,16,20] : [10,14,18];
  const height = landmarkHeight ?? heights[variant], [trunk, crown] = treeRatios[kind];
  return { height, trunkRadius: height * trunk * (landmarkHeight ? 1.2 : 1), crownRadius: height * crown };
}

function landCanStand(id: ExpeditionId, x: number, z: number, radius: number) {
  if (![x,z,radius].every(Number.isFinite) || radius < 0) return false;
  const definition = EXPEDITION_BY_ID[id], bounds = definition.bounds;
  if (x < bounds.minX + radius + 2 || x > bounds.maxX - radius - 2 || z < bounds.minZ + radius + 2 || z > bounds.maxZ - radius - 2) return false;
  for (const [dx,dz] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]]) {
    const water = expeditionWaterAt(id, z + dz);
    if (Math.abs(x + dx - water.x) <= definition.stream.deepHalfWidth || expeditionHeightAt(id, x + dx, z + dz) < water.y + .10) return false;
  }
  const slope = Math.hypot(expeditionHeightAt(id, x + .5, z) - expeditionHeightAt(id, x - .5, z), expeditionHeightAt(id, x, z + .5) - expeditionHeightAt(id, x, z - .5));
  return slope < .82;
}

/** Large root ribs occupy ground as well as the trunk; every clearance query uses this radius. */
export function expeditionTreeCollisionRadius(tree: Pick<ExpeditionTree, 'kind' | 'trunkRadius'>) {
  return tree.trunkRadius * (tree.kind === 'redwood' || tree.kind === 'cedar' || tree.trunkRadius >= 1 ? 1.55 : 1);
}

const treeIndices = new WeakMap<ExpeditionLayout, { cells: Map<string, ExpeditionTree[]>; maxRadius: number }>();
function nearbyTrees(layout: ExpeditionLayout, x: number, z: number, radius: number) {
  let index = treeIndices.get(layout);
  if (!index) { index = { cells: new Map(), maxRadius: 0 }; for (const tree of layout.trees) { const key = `${Math.floor(tree.x / 8)}:${Math.floor(tree.z / 8)}`; index.cells.set(key, [...(index.cells.get(key) ?? []), tree]); index.maxRadius = Math.max(index.maxRadius, expeditionTreeCollisionRadius(tree)); } treeIndices.set(layout, index); }
  const result: ExpeditionTree[] = [], reach = radius + index.maxRadius + .12;
  for (let ix = Math.floor((x - reach) / 8); ix <= Math.floor((x + reach) / 8); ix++) for (let iz = Math.floor((z - reach) / 8); iz <= Math.floor((z + reach) / 8); iz++) result.push(...(index.cells.get(`${ix}:${iz}`) ?? []));
  return result;
}

export function expeditionCanStand(layout: ExpeditionLayout, x: number, z: number, radius = .48) {
  return landCanStand(layout.id, x, z, radius) && nearbyTrees(layout, x, z, radius).every(tree => Math.hypot(x - tree.x, z - tree.z) > expeditionTreeCollisionRadius(tree) + radius + .12);
}

export function expeditionSegmentWalkable(layout: ExpeditionLayout, from: ExpeditionPoint, to: ExpeditionPoint, radius = .48) {
  const steps = Math.max(1, Math.ceil(distance(from, to) / .45));
  for (let i = 0; i <= steps; i++) { const t = i / steps; if (!expeditionCanStand(layout, from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t, radius)) return false; }
  return true;
}

type Navigation = { columns: number; rows: number; walkable: Uint8Array; connected: Uint8Array; edges: Uint8Array; point: (index: number) => ExpeditionPoint };
const navigationCache = new WeakMap<ExpeditionLayout, Navigation>();
const directions = [[1,0],[-1,0],[0,1],[0,-1]] as const;

function navigation(layout: ExpeditionLayout): Navigation {
  const cached = navigationCache.get(layout); if (cached) return cached;
  const { columns, rows, step } = layout.grid, count = columns * rows;
  const point = (index: number) => ({ x: layout.bounds.minX + index % columns * step, z: layout.bounds.minZ + Math.floor(index / columns) * step });
  const walkable = new Uint8Array(count), connected = new Uint8Array(count), edges = new Uint8Array(count);
  for (let i = 0; i < count; i++) { const p = point(i); walkable[i] = +expeditionCanStand(layout, p.x, p.z); }
  for (let i = 0; i < count; i++) if (walkable[i]) {
    const x = i % columns, z = Math.floor(i / columns), a = point(i);
    for (let d = 0; d < directions.length; d++) {
      const [dx,dz] = directions[d], xx = x + dx, zz = z + dz, j = zz * columns + xx;
      if (xx < 0 || zz < 0 || xx >= columns || zz >= rows || !walkable[j]) continue;
      if (expeditionSegmentWalkable(layout, a, point(j))) edges[i] |= 1 << d;
    }
  }
  const start = Math.round((layout.spawn.z - layout.bounds.minZ) / step) * columns + Math.round((layout.spawn.x - layout.bounds.minX) / step);
  const seed = walkable[start] ? start : [...walkable.keys()].filter(i => walkable[i]).sort((a,b) => distance(point(a),layout.spawn)-distance(point(b),layout.spawn))[0];
  if (seed === undefined) throw new Error(`No walkable entrance in ${layout.id}`);
  const queue = [seed]; connected[seed] = 1;
  for (let head = 0; head < queue.length; head++) { const i = queue[head]; for (let d = 0; d < directions.length; d++) if (edges[i] & 1 << d) { const [dx,dz] = directions[d], j = i + dz * columns + dx; if (!connected[j]) { connected[j] = 1; queue.push(j); } } }
  const result = { columns, rows, walkable, connected, edges, point }; navigationCache.set(layout, result); return result;
}

function nearestNode(layout: ExpeditionLayout, target: ExpeditionPoint, maxDistance = 12, requireSegment = false) {
  const nav = navigation(layout), step = layout.terrainStep;
  const cx = Math.round((target.x - layout.bounds.minX) / step), cz = Math.round((target.z - layout.bounds.minZ) / step), range = Math.ceil(maxDistance / step);
  let best = -1, score = Infinity;
  for (let z = Math.max(0, cz - range); z <= Math.min(nav.rows - 1, cz + range); z++) for (let x = Math.max(0, cx - range); x <= Math.min(nav.columns - 1, cx + range); x++) {
    const i = z * nav.columns + x; if (!nav.connected[i]) continue; const p = nav.point(i), d = distance(p, target);
    if (d > maxDistance || d >= score || requireSegment && !expeditionSegmentWalkable(layout, target, p)) continue;
    best = i; score = d;
  }
  return best;
}

/** Grid search checks actual clearance; simplification cannot cut through trunks or deep water. */
export function findExpeditionPath(layout: ExpeditionLayout, from: ExpeditionPoint, to: ExpeditionPoint): ExpeditionPoint[] {
  if (!expeditionCanStand(layout, from.x, from.z) || !expeditionCanStand(layout, to.x, to.z)) return [];
  if (expeditionSegmentWalkable(layout, from, to)) return [{ ...to }];
  const nav = navigation(layout), start = nearestNode(layout, from, 5, true), goal = nearestNode(layout, to, 5, true);
  if (start < 0 || goal < 0) return [];
  const previous = new Int32Array(nav.walkable.length).fill(-1), queue = [start]; previous[start] = start;
  for (let head = 0; head < queue.length && previous[goal] < 0; head++) {
    const i = queue[head]; for (let d = 0; d < directions.length; d++) if (nav.edges[i] & 1 << d) {
      const [dx,dz] = directions[d], j = i + dz * nav.columns + dx; if (previous[j] >= 0) continue; previous[j] = i; queue.push(j);
    }
  }
  if (previous[goal] < 0) return [];
  const raw: ExpeditionPoint[] = [{ ...to }]; for (let i = goal; i !== start; i = previous[i]) raw.push(nav.point(i)); raw.push(nav.point(start)); raw.reverse();
  const result: ExpeditionPoint[] = []; let anchor = from, cursor = 0;
  while (cursor < raw.length) { let farthest = cursor; while (farthest + 1 < raw.length && expeditionSegmentWalkable(layout, anchor, raw[farthest + 1])) farthest++; result.push(raw[farthest]); anchor = raw[farthest]; cursor = farthest + 1; }
  return result;
}

const hostKinds: Partial<Record<ExpeditionResourceRole, readonly ExpeditionTreeKind[]>> = {
  resin: ['pine','spruce','fir','hemlock'], sap: ['birch','maple'], nut: ['hazel','oak','beech'], berry: ['berry'], 'tree-fruit': ['serviceberry'], 'shelf-fungus': ['maple','beech','elm'], 'long-timber': ['pine','spruce','fir','ash','elm','oak','maple','beech','birch','aspen'],
};

function placeResources(layout: ExpeditionLayout): ExpeditionResourceSite[] {
  const nav = navigation(layout), used = new Set<number>();
  return layout.definition.resourceAnchors.map(anchor => {
    const allowed = anchor.hostKind ? [anchor.hostKind] : hostKinds[anchor.role]; let node = -1, host: ExpeditionTree | undefined;
    if (allowed) {
      const candidates = layout.trees.filter(tree => !tree.landmark && allowed.includes(tree.kind))
        .sort((a,b) => Number(b.habitatId === anchor.habitatId) - Number(a.habitatId === anchor.habitatId) || distance(a,anchor)-distance(b,anchor));
      for (const tree of candidates) {
        for (let attempt = 0; attempt < 16; attempt++) {
          const angle = Math.atan2(anchor.z-tree.z,anchor.x-tree.x) + attempt * Math.PI / 8, r = expeditionTreeCollisionRadius(tree) + 2.1;
          const point = { x: tree.x + Math.cos(angle) * r, z: tree.z + Math.sin(angle) * r };
          const candidate = nearestNode(layout, point, 2.1); if (candidate < 0 || used.has(candidate) || distance(nav.point(candidate),tree) > expeditionTreeCollisionRadius(tree) + 4.1) continue;
          node = candidate; host = tree; break;
        }
        if (node >= 0) break;
      }
    } else {
      node = nearestNode(layout, anchor, 12);
      if (used.has(node)) for (const [dx,dz] of [[2,0],[-2,0],[0,2],[0,-2]]) { const candidate = nearestNode(layout, { x: anchor.x + dx, z: anchor.z + dz }, 12); if (candidate >= 0 && !used.has(candidate)) { node = candidate; break; } }
    }
    if (node < 0 || used.has(node)) throw new Error(`No distinct reachable resource anchor: ${layout.id}/${anchor.key}`);
    used.add(node); const p = nav.point(node);
    return { id: `expedition.${layout.id}.${anchor.key}`, habitatId: anchor.habitatId, role: anchor.role, ...(anchor.substrate ? { substrate: anchor.substrate } : {}), x: p.x, z: p.z, y: expeditionHeightAt(layout.id,p.x,p.z), ...(host ? { hostTreeId: host.id } : {}) };
  });
}

export function createExpeditionLayout(id: ExpeditionId): ExpeditionLayout {
  const definition = EXPEDITION_BY_ID[id]; if (!definition) throw new Error(`Unknown woodland: ${id}`);
  const rng = random(definition.seed), trees: ExpeditionTree[] = [];
  const point3 = (p: ExpeditionPoint): ExpeditionPoint3 => ({ ...p, y: expeditionHeightAt(id,p.x,p.z) });
  for (const landmark of definition.landmarks) {
    const habitat = definition.habitats.find(h => h.id === landmark.habitatId)!;
    trees.push({ id: `expedition.${landmark.id}`, kind: landmark.kind, x: landmark.x, z: landmark.z, y: expeditionHeightAt(id,landmark.x,landmark.z), ...dimensions(id,landmark.kind,2,landmark.height), variant: 2, rotation: rng()*Math.PI*2, landmark: true, habitatId: habitat.id, moss: habitat.moisture > .7 });
  }
  for (let attempt = 0; attempt < definition.treeCount * 80 && trees.length < definition.treeCount; attempt++) {
    const habitat = definition.habitats[attempt % definition.habitats.length];
    const angle = rng()*Math.PI*2, radius = Math.sqrt(rng()), x = rounded(habitat.center.x + Math.cos(angle)*radius*habitat.radiusX), z = rounded(habitat.center.z + Math.sin(angle)*radius*habitat.radiusZ);
    let pick = rng()*habitat.trees.reduce((sum,t)=>sum+t.weight,0), kind = habitat.trees.at(-1)!.kind;
    for (const entry of habitat.trees) { pick -= entry.weight; if (pick <= 0) { kind = entry.kind; break; } }
    const variant = Math.floor(rng()*3) as 0|1|2, size = dimensions(id,kind,variant);
    const rotation = rng()*Math.PI*2;
    const collisionRadius = expeditionTreeCollisionRadius({ kind, trunkRadius: size.trunkRadius });
    if (!landCanStand(id,x,z,collisionRadius) || routeClearance(definition,{x,z}) < collisionRadius+.9 || distance({x,z},definition.spawn) < 11 || distance({x,z},definition.supply) < 9) continue;
    const spacing = kind === 'hazel' || kind === 'berry' ? 2.4 : id === 'upper' ? 4.0 : 3.4;
    if (trees.some(t => Math.hypot(t.x-x,t.z-z) < Math.max(spacing,collisionRadius+expeditionTreeCollisionRadius(t)+1.8))) continue;
    trees.push({ id: `expedition.${id}.tree.${attempt}`, kind, x, z, y: expeditionHeightAt(id,x,z), ...size, variant, rotation, landmark: false, habitatId: habitat.id, moss: habitat.moisture > .72 && (kind === 'hemlock' || kind === 'cedar' || kind === 'maple') });
  }
  const waterPoints: ExpeditionPoint3[] = []; for (let z=definition.bounds.minZ;z<=definition.bounds.maxZ;z+=6) { const w=expeditionWaterAt(id,z); waterPoints.push({x:w.x,y:w.y,z}); }
  const layout: ExpeditionLayout = { id, definition, bounds: definition.bounds, terrainStep: definition.terrainStep, spawn: point3(definition.spawn), supply: point3(definition.supply), routes: definition.routes, habitats: definition.habitats, trees, landmarks: [], resourceSites: [], water: [{id:`${id}-creek`,points:waterPoints,halfWidth:definition.stream.halfWidth,bankWidth:definition.stream.bankWidth,deepHalfWidth:definition.stream.deepHalfWidth}], grid: terrainGrid(id) };
  const nav = navigation(layout);
  layout.landmarks = definition.landmarks.map(landmark => { const treeId=`expedition.${landmark.id}`,tree=trees.find(t=>t.id===treeId)!; const node=nearestNode(layout,{x:tree.x,z:tree.z+expeditionTreeCollisionRadius(tree)+3},8); if(node<0)throw new Error(`Unreachable landmark: ${treeId}`); return { id:landmark.id,name:landmark.name,treeId,x:tree.x,y:tree.y,z:tree.z,approach:point3(nav.point(node)) }; });
  layout.resourceSites = placeResources(layout);
  return layout;
}


// Layouts are immutable after construction. Saving a trip and mounting its scene use the same anchors.
const cachedExpeditions = new Map<ExpeditionId, ExpeditionLayout>();
export function cachedExpeditionLayout(id: ExpeditionId) {
  let layout = cachedExpeditions.get(id);
  if (!layout) {
    layout = createExpeditionLayout(id);
    cachedExpeditions.set(id, layout);
  }
  return layout;
}
