/** Exact rectilinear solids, in mm. Boxes are disjoint; this is not a voxel grid. */
export type Vec3 = [number, number, number]
export type Axis = 0 | 1 | 2
export type Sign = -1 | 1
export interface Box { min: Vec3; max: Vec3 }
export interface Surface {
  id: string
  axis: Axis
  sign: Sign
  plane: number
  /** Disjoint exposed patches, all in the same workpiece coordinate system. */
  patches: Box[]
}
export const EPS = 1e-7
export const axes: Axis[] = [0, 1, 2]
export const copyBox = (b: Box): Box => ({ min: [...b.min], max: [...b.max] })
export const volume = (b: Box) => axes.reduce<number>((v, a) => v * Math.max(0, b.max[a] - b.min[a]), 1)
export const totalVolume = (solid: readonly Box[]) => solid.reduce((v, b) => v + volume(b), 0)
export function intersection(a: Box, b: Box): Box | null {
  const c: Box = { min: [0, 0, 0], max: [0, 0, 0] }
  for (const d of axes) {
    c.min[d] = Math.max(a.min[d], b.min[d]); c.max[d] = Math.min(a.max[d], b.max[d])
    if (c.max[d] - c.min[d] <= EPS) return null
  }
  return c
}
/** Up to six non-overlapping pieces; no numerical material creation. */
export function subtractBox(a: Box, cutter: Box): Box[] {
  const hit = intersection(a, cutter)
  if (!hit) return [copyBox(a)]
  const core = copyBox(a), result: Box[] = []
  for (const d of axes) {
    if (hit.min[d] - core.min[d] > EPS) {
      const p = copyBox(core); p.max[d] = hit.min[d]; result.push(p); core.min[d] = hit.min[d]
    }
    if (core.max[d] - hit.max[d] > EPS) {
      const p = copyBox(core); p.min[d] = hit.max[d]; result.push(p); core.max[d] = hit.max[d]
    }
  }
  return result
}
export const subtract = (solid: readonly Box[], cutter: Box) => solid.flatMap(b => subtractBox(b, cutter))
export function bounds(solid: readonly Box[]): Box {
  if (!solid.length) throw new Error('木料已不存在')
  return { min: axes.map(a => Math.min(...solid.map(b => b.min[a]))) as Vec3,
    max: axes.map(a => Math.max(...solid.map(b => b.max[a]))) as Vec3 }
}
export function connected(a: Box, b: Box): boolean {
  let contacts = 0
  for (const d of axes) {
    const overlap = Math.min(a.max[d], b.max[d]) - Math.max(a.min[d], b.min[d])
    if (overlap < -EPS) return false
    if (overlap <= EPS) contacts++
  }
  return contacts <= 1 // An edge or a point does not hold two chunks together.
}
export function components(solid: readonly Box[]): Box[][] {
  const remaining = new Set(solid.map((_, i) => i)), groups: Box[][] = []
  while (remaining.size) {
    const seed = remaining.values().next().value!
    remaining.delete(seed)
    const queue = [seed], group: Box[] = []
    for (let i = 0; i < queue.length; i++) {
      const n = queue[i]; group.push(solid[n])
      for (const k of remaining) if (connected(solid[n], solid[k])) { remaining.delete(k); queue.push(k) }
    }
    groups.push(group)
  }
  return groups
}
export const contains = (b: Box, p: Vec3) => axes.every(a => p[a] >= b.min[a] - EPS && p[a] <= b.max[a] + EPS)
export const surfaceId = (axis: Axis, sign: Sign, plane: number) => `surface:${axis}:${sign}:${Number(plane.toFixed(6))}`
/** Subtract a coplanar face rectangle, not a 3D volume. */
function subtractPatch(p: Box, cover: Box, normal: Axis): Box[] {
  const dims = axes.filter(a => a !== normal), hit = copyBox(p)
  for (const a of dims) {
    hit.min[a] = Math.max(p.min[a], cover.min[a]); hit.max[a] = Math.min(p.max[a], cover.max[a])
    if (hit.max[a] - hit.min[a] <= EPS) return [p]
  }
  const core = copyBox(p), out: Box[] = []
  for (const a of dims) {
    if (hit.min[a] - core.min[a] > EPS) { const b = copyBox(core); b.max[a] = hit.min[a]; out.push(b); core.min[a] = hit.min[a] }
    if (core.max[a] - hit.max[a] > EPS) { const b = copyBox(core); b.min[a] = hit.max[a]; out.push(b); core.max[a] = hit.max[a] }
  }
  return out
}
/** Rendering and picking consume these same boundary patches; no hidden internal faces. */
export function surfaces(solid: readonly Box[]): Surface[] {
  const result = new Map<string, Surface>()
  for (const box of solid) for (const axis of axes) for (const sign of [-1, 1] as Sign[]) {
    const plane = sign === 1 ? box.max[axis] : box.min[axis]
    const face = copyBox(box); face.min[axis] = face.max[axis] = plane
    let patches = [face]
    for (const other of solid) {
      if (other === box) continue
      const otherPlane = sign === 1 ? other.min[axis] : other.max[axis]
      if (Math.abs(otherPlane - plane) < EPS) patches = patches.flatMap(p => subtractPatch(p, other, axis))
    }
    if (patches.length) {
      const id = surfaceId(axis, sign, plane)
      const s = result.get(id) ?? { id, axis, sign, plane, patches: [] }
      s.patches.push(...patches); result.set(id, s)
    }
  }
  return [...result.values()]
}
export function patchVertices(p: Box, axis: Axis): Vec3[] {
  const [u, v] = axes.filter(a => a !== axis)
  return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b]) => {
    const q: Vec3 = [...p.min]; q[u] = a ? p.max[u] : p.min[u]; q[v] = b ? p.max[v] : p.min[v]; return q
  })
}
