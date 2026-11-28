/** This tutorial is a consumer of the machining core, not the core's list of legal cuts. */
import { applyFinish, createPiece, executeSaw, fixtureFor, KERF_MM, materialBalance, MAX_OPERATIONS, outerSurface } from './machining.ts'
import type { Fixture, SawOperation, Workpiece } from './machining.ts'
import { axes, bounds, EPS, intersection, subtract, surfaceId, totalVolume, volume } from './solid.ts'
import type { Axis, Box, Sign } from './solid.ts'
import type { CutId, FinishedWork } from './domain.ts'
export type TaskId = CutId
export const TASKS: { id: TaskId; name: string; planeAxis: Axis; entryAxis: Axis; entrySign: Sign; wasteSide: Sign; instruction: string }[] = [
  { id: 'trim', name: '截端', planeAxis: 0, entryAxis: 1, entrySign: 1, wasteSide: 1, instruction: '从左基准端确定总长；由顶面向下锯。未贯穿时余段不会脱离。' },
  { id: 'cheekNear', name: '近侧榫颊', planeAxis: 2, entryAxis: 0, entrySign: 1, wasteSide: -1, instruction: '从现有端面进入；榫颊位置从近侧基准量起，进深朝向榫肩。' },
  { id: 'cheekFar', name: '远侧榫颊', planeAxis: 2, entryAxis: 0, entrySign: 1, wasteSide: 1, instruction: '仍从同一个端面进入；不要把翻转镜头当成换了测量基准。' },
  { id: 'shoulderNear', name: '近侧榫肩', planeAxis: 0, entryAxis: 2, entrySign: -1, wasteSide: 1, instruction: '从近侧向内锯肩；与纵向锯缝接通后，这一侧废料才能脱离。' },
  { id: 'shoulderFar', name: '远侧榫肩', planeAxis: 0, entryAxis: 2, entrySign: 1, wasteSide: 1, instruction: '从远侧向内锯肩。肩先或颊先都可以；切入榫芯的过深锯缝不能补回。' },
]
export interface Layout { position: number; depth: number; wasteSide: Sign; reference: 'low' | 'high'; fixture: 'auto' | Fixture }
export function defaultLayout(piece: Workpiece, id: TaskId): Layout {
  const end = bounds(piece.geometry.boxes).max[0]
  // Neutral starting measurements, NOT a projection of the ideal blueprint.
  return { position: id === 'trim' ? Math.max(5, end - 5) : id === 'cheekNear' ? piece.stock.width / 4 : id === 'cheekFar' ? piece.stock.width * 3 / 4 : Math.max(5, end - 15),
    depth: 2, wasteSide: TASKS.find(t => t.id === id)!.wasteSide, reference: 'low', fixture: 'auto' }
}
export function recommendedSurface(piece: Workpiece, id: TaskId) {
  const task = TASKS.find(t => t.id === id)!
  return outerSurface(piece, task.entryAxis, task.entrySign)
}
export function operationFor(piece: Workpiece, taskId: TaskId, layout: Layout, selectedSurface: string | null): SawOperation {
  const task = TASKS.find(t => t.id === taskId)!
  return { kind: 'saw.sweep', id: `saw:${piece.operations.length}`, entrySurface: selectedSurface ?? '', planeAxis: task.planeAxis,
    position: layout.position, wasteSide: layout.wasteSide, depth: layout.depth, kerf: KERF_MM,
    fixture: layout.fixture === 'auto' ? fixtureFor(task.entryAxis) : layout.fixture }
}
export interface TenonMetrics { length: number; near: number; far: number; nearShoulder: number; farShoulder: number; missingMm3: number }
export interface Inspection {
  status: 'incomplete' | 'pass' | 'repairable' | 'scrap'
  score: number
  issues: string[]
  conflictSurfaces: string[]
  metrics?: TenonMetrics
  repairCutters: Box[]
  repairedScore?: number
}
export function idealShape(piece: Workpiece): Box[] {
  const { length, tenonLength, tenonWidth } = piece.design
  const near = (piece.stock.width - tenonWidth) / 2
  return shape(piece, { length, near, far: near + tenonWidth, nearShoulder: length - tenonLength, farShoulder: length - tenonLength, missingMm3: 0 })
}
function shape(piece: Workpiece, m: TenonMetrics): Box[] {
  const H = piece.stock.height, W = piece.stock.width
  return [
    { min: [0, 0, 0], max: [m.nearShoulder, H, m.near] },
    { min: [0, 0, m.near], max: [m.length, H, m.far] },
    { min: [0, 0, m.far], max: [m.farShoulder, H, W] },
  ].filter(b => volume(b as Box) > EPS) as Box[]
}
function differenceVolume(a: readonly Box[], b: readonly Box[]) {
  let remaining = a.map(p => ({ min: [...p.min], max: [...p.max] } as Box))
  for (const cutter of b) remaining = subtract(remaining, cutter)
  return totalVolume(remaining)
}
function metrics(piece: Workpiece): TenonMetrics | null {
  const boxes = piece.geometry.boxes, L = bounds(boxes).max[0]
  const tip = boxes.filter(b => Math.abs(b.max[0] - L) < EPS)
  const near = Math.min(...tip.map(b => b.min[2])), far = Math.max(...tip.map(b => b.max[2]))
  if (near <= EPS || far >= piece.stock.width - EPS) return null
  const nearShoulder = Math.max(0, ...boxes.filter(b => b.min[2] < near - EPS).map(b => b.max[0]))
  const farShoulder = Math.max(0, ...boxes.filter(b => b.max[2] > far + EPS).map(b => b.max[0]))
  if (nearShoulder <= 0 || farShoulder <= 0 || nearShoulder >= L - EPS || farShoulder >= L - EPS) return null
  const m: TenonMetrics = { length: L, near, far, nearShoulder, farShoulder, missingMm3: 0 }
  m.missingMm3 = differenceVolume(shape(piece, m), boxes) + differenceVolume(boxes, shape(piece, m))
  return m
}
/** Game tolerances, not a claim about real load-bearing joinery. */
export const TENON_LIMITS = { sideGap: 0.6, interference: 0.1, shoulderSkew: 0.6, lengthError: 0.8, repairAllowance: 0.8, minimumScore: 60, repairPenalty: 6 }
export function inspectTenon(piece: Workpiece, allowRepair = true): Inspection {
  const result: Inspection = { status: 'incomplete', score: 0, issues: [], conflictSurfaces: [], repairCutters: [] }
  const { length: L, tenonLength: TL, tenonWidth: TW } = piece.design, N = (piece.stock.width - TW) / 2, F = N + TW, S = L - TL
  if (bounds(piece.geometry.boxes).max[0] < L - TENON_LIMITS.lengthError - EPS) {
    return { ...result, status: 'scrap', issues: ['总长已不足，减材修整不能把木头补回来。'] }
  }
  const m = metrics(piece)
  if (!m) return { ...result, issues: ['榫颊或榫肩尚未形成。检查锯缝是否真正接通，仍连着的废料不能试配。'] }
  result.metrics = m
  // A notch in excess stock may disappear when that stock is pared away.
  // Judge the retained result after the bounded subtraction, never fill a missing voxel.
  if (m.missingMm3 > EPS * 100) result.issues.push('有额外锯口；仅能修去余量，不能补回内部损伤。')
  const gaps = [m.near - N, F - m.far], shoulders = [m.nearShoulder - S, m.farShoulder - S]
  result.score = Math.max(0, Math.round(100 - 20 * Math.max(...gaps.map(Math.abs)) - 12 * Math.max(...shoulders.map(Math.abs)) - 10 * Math.abs(m.length - L) - (piece.repaired ? TENON_LIMITS.repairPenalty : 0)))
  gaps.forEach((gap, i) => {
    if (gap < -TENON_LIMITS.interference - EPS) result.issues.push(`${i ? '远' : '近'}侧榫颊抵住槽壁，需去掉 ${(-gap).toFixed(1)} mm。`)
    if (gap > TENON_LIMITS.sideGap + EPS) result.issues.push(`${i ? '远' : '近'}侧去料过多，侧隙 ${gap.toFixed(1)} mm。`)
    if (gap < -TENON_LIMITS.interference - EPS || gap > TENON_LIMITS.sideGap + EPS) result.conflictSurfaces.push(surfaceId(2, i ? 1 : -1, i ? m.far : m.near))
  })
  if (Math.abs(m.length - L) > TENON_LIMITS.lengthError + EPS) result.issues.push('总长偏差过大。')
  if (Math.abs(m.nearShoulder - m.farShoulder) > TENON_LIMITS.shoulderSkew + EPS) result.issues.push('两肩不齐，无法同时贴合。')
  if (Math.max(...shoulders.map(Math.abs)) > TENON_LIMITS.lengthError + EPS) result.issues.push('榫肩位置超差，咬合长度不合要求。')
  if (result.score < TENON_LIMITS.minimumScore) result.issues.push('工艺分低于本图纸最低要求。')
  if (!result.issues.length) return { ...result, status: 'pass' }
  // A correction is bounded removal only. No sanding away a deep internal saw wound.
  const extras = [N - m.near, m.far - F, m.length - L, ...shoulders]
  const deficitsAllowed = gaps.every(g => g <= TENON_LIMITS.sideGap + EPS) && shoulders.every(s => s >= -TENON_LIMITS.lengthError - EPS) && m.length >= L - TENON_LIMITS.lengthError - EPS
  if (allowRepair && piece.operations.length < MAX_OPERATIONS && !piece.repaired && deficitsAllowed && extras.every(e => e <= TENON_LIMITS.repairAllowance + EPS)) {
    const H = piece.stock.height, W = piece.stock.width
    const cutters: Box[] = []
    if (m.near < N - EPS) cutters.push({ min: [m.nearShoulder, 0, m.near], max: [m.length, H, N] })
    if (m.far > F + EPS) cutters.push({ min: [m.farShoulder, 0, F], max: [m.length, H, m.far] })
    if (m.length > L + EPS) cutters.push({ min: [L, 0, 0], max: [m.length, H, W] })
    if (m.nearShoulder > S + EPS) cutters.push({ min: [S, 0, 0], max: [m.nearShoulder, H, N] })
    if (m.farShoulder > S + EPS) cutters.push({ min: [S, 0, F], max: [m.farShoulder, H, W] })
    if (cutters.length) {
      const candidate = applyFinish(piece, { kind: 'finish.auto', id: `finish:${piece.operations.length}`, cutters })
      const after = inspectTenon(candidate, false)
      if (after.status === 'pass') return { ...result, issues: result.issues.filter(text => !text.includes('内部损伤')), status: 'repairable', repairCutters: cutters, repairedScore: after.score }
    }
  }
  return { ...result, status: 'scrap' }
}
export function inspectPiece(piece: Workpiece): Workpiece { return { ...piece, inspectedAt: piece.operations.length } }
export function repairTenon(piece: Workpiece): Workpiece {
  if (piece.inspectedAt !== piece.operations.length) throw new Error('先检查实际工件，再确认自动收尾')
  const report = inspectTenon(piece)
  if (report.status !== 'repairable') throw new Error('这件工件不能靠一次减材收尾补救')
  return applyFinish(piece, { kind: 'finish.auto', id: `finish:${piece.operations.length}`, cutters: report.repairCutters })
}
export function finishTenon(piece: Workpiece, paint: string | null = null): FinishedWork & { materialBalance: ReturnType<typeof materialBalance>; automaticFinish: boolean } {
  const report = inspectTenon(piece)
  if (piece.inspectedAt !== piece.operations.length || report.status !== 'pass' || !report.metrics) throw new Error('先完成合格试配，再收件')
  if (paint !== null && !/^#[0-9a-f]{6}$/i.test(paint)) throw new Error('面漆颜色无效')
  const m = report.metrics
  return { kind: 'woodworking.tenon-sample', version: 1, paint, score: report.score, automaticFinish: piece.repaired, materialBalance: materialBalance(piece),
    envelope: { length: m.length, width: piece.stock.width, height: piece.stock.height, tenonWidth: m.far - m.near,
      tenonLength: m.length - Math.min(m.nearShoulder, m.farShoulder), end: [m.length, m.length],
      nearCheek: [m.near, m.near], farCheek: [m.far, m.far], nearShoulder: [m.nearShoulder, m.nearShoulder], farShoulder: [m.farShoulder, m.farShoulder] } }
}
/** Rebuild from real tool operations; a saved/client-supplied mesh is never settlement authority. */
export function restorePiece(raw: unknown): Workpiece {
  const r = raw as Workpiece
  if (!r || r.version !== 2 || !r.stock || !r.design || !Array.isArray(r.operations) || r.operations.length > MAX_OPERATIONS) throw new Error('木作草稿格式不匹配')
  let piece = createPiece(r.design, r.stock)
  for (const op of r.operations) {
    if (!op || typeof op.id !== 'string') throw new Error('加工记录无效')
    if (op.kind === 'saw.sweep') piece = executeSaw(piece, op)
    else if (op.kind === 'finish.auto') {
      piece = inspectPiece(piece)
      const next = repairTenon(piece), actual = next.operations.at(-1)!
      if (JSON.stringify(actual) !== JSON.stringify(op)) throw new Error('收尾记录与实际可补救范围不符')
      piece = next
    } else throw new Error('尚不支持这种加工工具')
  }
  if (r.inspectedAt !== null) {
    if (!Number.isSafeInteger(r.inspectedAt) || r.inspectedAt !== piece.operations.length) throw new Error('检查记录已过期')
    piece = inspectPiece(piece)
  }
  return piece
}
