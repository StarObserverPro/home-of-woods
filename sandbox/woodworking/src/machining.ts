import { axes, bounds, components, contains, copyBox, EPS, intersection, subtract, surfaceId, surfaces, totalVolume, volume } from './solid.ts'
import type { Axis, Box, Sign, Vec3 } from './solid.ts'
import type { Design, Stock } from './domain.ts'

export type Fixture = 'flat' | 'end-up' | 'side-out'
export interface SawOperation {
  kind: 'saw.sweep'
  id: string
  /** Actual exposed surface; never a drawing-view identifier. */
  entrySurface: string
  planeAxis: Axis
  position: number
  wasteSide: Sign
  depth: number
  fixture: Fixture
  /** Full stock span is swept by the reciprocating blade in this first tool model. */
  kerf: number
}
export interface AutoFinishOperation { kind: 'finish.auto'; id: string; cutters: Box[] }
export type Operation = SawOperation | AutoFinishOperation
export interface Offcut { id: string; kind: 'reusable' | 'fuel'; volumeMm3: number; box?: Box }
export interface MaterialLedger { sawdustMm3: number; shavingsMm3: number; offcuts: Offcut[] }
export interface Workpiece {
  version: 2
  stock: Stock
  design: Design
  geometry: { kind: 'orthogonal-solid'; boxes: Box[] }
  operations: Operation[]
  ledger: MaterialLedger
  repaired: boolean
  inspectedAt: number | null
}
export interface OperationPreview {
  allowed: boolean
  reason: string
  sweep?: Box
  feedAxis?: Axis
  feedSign?: Sign
  strokeAxis?: Axis
  depthLimit?: number
  fixture?: Fixture
}
/** Tool-specific geometry and access rules belong here, not in tutorial button IDs. */
export interface OperationProvider<T extends Operation> {
  kind: T['kind']
  geometryKind: Workpiece['geometry']['kind']
  preview(piece: Workpiece, operation: T): OperationPreview
}
export const KERF_MM = 1
export const MAX_OPERATIONS = 48
export function createPiece(design: Design, stock: Stock): Workpiece {
  const numbers = [design.length, design.tenonLength, design.tenonWidth, stock.length, stock.width, stock.height]
  if (typeof stock.id !== 'string' || !stock.id || !numbers.every(n => Number.isFinite(n) && n > 0 && n <= 2000) || design.length > stock.length || design.tenonLength >= design.length - 4 || design.tenonWidth >= stock.width - 2)
    throw new Error('图纸尺寸与方料不匹配')
  return { version: 2, stock: { ...stock }, design: { ...design },
    geometry: { kind: 'orthogonal-solid', boxes: [{ min: [0, 0, 0], max: [stock.length, stock.height, stock.width] }] },
    operations: [], ledger: { sawdustMm3: 0, shavingsMm3: 0, offcuts: [] }, repaired: false, inspectedAt: null }
}
export function fixtureFor(axis: Axis): Fixture { return axis === 0 ? 'end-up' : axis === 1 ? 'flat' : 'side-out' }
function invalid(reason: string): OperationPreview { return { allowed: false, reason } }
export const sawProvider: OperationProvider<SawOperation> = {
  kind: 'saw.sweep', geometryKind: 'orthogonal-solid',
  preview(piece, op) {
    if (piece.geometry.kind !== this.geometryKind) return invalid('这种锯切尚不支持当前几何')
    if (![0, 1, 2].includes(op.planeAxis) || ![-1, 1].includes(op.wasteSide) || ![op.position, op.depth, op.kerf].every(Number.isFinite) || op.depth <= 0 || op.kerf !== KERF_MM)
      return invalid('锯线、深度或锯缝参数无效')
    const entry = surfaces(piece.geometry.boxes).find(s => s.id === op.entrySurface)
    if (!entry) return invalid('先在立体木料上选择一个现有工作面')
    if (entry.axis === op.planeAxis) return invalid('锯片必须从所选面进入，不能贴着该面凭空切削')
    const fixture = fixtureFor(entry.axis)
    if (op.fixture !== fixture) return { ...invalid('当前夹持不适合这个入口，请采用工序建议'), fixture }
    const feedAxis = entry.axis, feedSign = -entry.sign as Sign
    const strokeAxis = axes.find(a => a !== feedAxis && a !== op.planeAxis)!
    const size: Vec3 = [piece.stock.length, piece.stock.height, piece.stock.width]
    const depthLimit = entry.sign === 1 ? entry.plane : size[feedAxis] - entry.plane
    if (op.depth > depthLimit + EPS) return { ...invalid('止点已超过木料另一侧'), depthLimit, fixture }
    const sweep: Box = { min: [0, 0, 0], max: [...size] }
    sweep.min[feedAxis] = Math.min(entry.plane, entry.plane + feedSign * op.depth)
    sweep.max[feedAxis] = Math.max(entry.plane, entry.plane + feedSign * op.depth)
    sweep.min[op.planeAxis] = op.position + (op.wasteSide === -1 ? -op.kerf : 0)
    sweep.max[op.planeAxis] = op.position + (op.wasteSide === 1 ? op.kerf : 0)
    if (sweep.min[op.planeAxis] < -EPS || sweep.max[op.planeAxis] > size[op.planeAxis] + EPS) return invalid('锯缝必须落在木料范围内')
    // A full-width blade must have exterior access, or continue a prior kerf at this exact entry.
    const available = entry.patches.some(p => sweep.max[op.planeAxis] > p.min[op.planeAxis] + EPS && sweep.min[op.planeAxis] < p.max[op.planeAxis] - EPS)
    const continuation = piece.operations.some(p => p.kind === 'saw.sweep' && p.entrySurface === op.entrySurface && p.planeAxis === op.planeAxis && p.wasteSide === op.wasteSide && Math.abs(p.position - op.position) < EPS)
    if (!available && !continuation) return invalid('锯线没有落在这个工作面的实体范围上')
    // Reject hidden interior entrances: the whole incoming corridor must be empty.
    const approach = copyBox(sweep)
    if (entry.sign === 1) { approach.min[feedAxis] = entry.plane; approach.max[feedAxis] = size[feedAxis] }
    else { approach.min[feedAxis] = 0; approach.max[feedAxis] = entry.plane }
    if (piece.geometry.boxes.some(b => intersection(b, approach))) return invalid('这个入口前方仍有木料挡住，不能穿过外层开始锯')
    const held: Box = { min: [0, 0, 0], max: [Math.min(4, piece.design.length / 5), piece.stock.height, piece.stock.width] }
    if (intersection(sweep, held)) return invalid('锯路进入左端夹持区，请调整位置或深度')
    const removes = piece.geometry.boxes.reduce((sum, b) => sum + (intersection(b, sweep) ? volume(intersection(b, sweep)!) : 0), 0)
    if (removes <= EPS) return invalid('这一深度已经锯过；只能沿原锯缝继续加深')
    return { allowed: true, reason: '可执行', sweep, feedAxis, feedSign, strokeAxis, depthLimit, fixture }
  },
}
export function materialBalance(piece: Workpiece) {
  const stockMm3 = piece.stock.length * piece.stock.width * piece.stock.height
  const retainedMm3 = totalVolume(piece.geometry.boxes)
  const offcutsMm3 = piece.ledger.offcuts.reduce((n, p) => n + p.volumeMm3, 0)
  const accountedMm3 = retainedMm3 + offcutsMm3 + piece.ledger.sawdustMm3 + piece.ledger.shavingsMm3
  return { stockMm3, retainedMm3, offcutsMm3, sawdustMm3: piece.ledger.sawdustMm3, shavingsMm3: piece.ledger.shavingsMm3, errorMm3: stockMm3 - accountedMm3 }
}
function removeMaterial(piece: Workpiece, cutters: Box[], kind: 'sawdustMm3' | 'shavingsMm3', opId: string): Workpiece {
  let boxes = piece.geometry.boxes.map(copyBox)
  const before = totalVolume(boxes)
  for (const cutter of cutters) boxes = subtract(boxes, cutter)
  const removed = before - totalVolume(boxes)
  if (removed <= EPS) throw new Error('没有新增切削，工件保持不变')
  const anchor: Vec3 = [0.01, piece.stock.height / 2, piece.stock.width / 2]
  const groups = components(boxes), retained = groups.find(g => g.some(b => contains(b, anchor)))
  if (!retained) throw new Error('本次加工会移除夹持根部')
  const offcuts: Offcut[] = groups.filter(g => g !== retained).map((g, i) => {
    const box = bounds(g), v = totalVolume(g)
    // Only intact square-section, sufficiently long offcuts enter the existing square-blank adapter.
    const square = Math.abs((box.max[1] - box.min[1]) - (box.max[2] - box.min[2])) < EPS
    const reusable = Math.abs(volume(box) - v) < EPS && square && box.max[0] - box.min[0] >= 12 && box.max[1] - box.min[1] >= 8
    return { id: `${opId}:offcut:${i}`, kind: reusable ? 'reusable' : 'fuel', volumeMm3: v, ...(reusable ? { box } : {}) }
  })
  return { ...piece, geometry: { kind: 'orthogonal-solid', boxes: retained.map(copyBox) },
    ledger: { ...piece.ledger, [kind]: piece.ledger[kind] + removed, offcuts: [...piece.ledger.offcuts, ...offcuts] }, inspectedAt: null }
}
export function executeSaw(piece: Workpiece, operation: SawOperation): Workpiece {
  if (!operation.id || piece.operations.some(o => o.id === operation.id)) throw new Error('这次操作已经执行')
  if (piece.operations.length >= MAX_OPERATIONS) throw new Error('本练习已达到加工次数上限，请检查或换料')
  if (piece.repaired) throw new Error('自动收尾后只可检查和收件，不再继续锯切')
  const preview = sawProvider.preview(piece, operation)
  if (!preview.allowed || !preview.sweep) throw new Error(preview.reason)
  const next = removeMaterial(piece, [preview.sweep], 'sawdustMm3', operation.id)
  return { ...next, operations: [...piece.operations, structuredClone(operation)] }
}
/** Internal completion primitive. The tenon evaluator must authorize the cutters first. */
export function applyFinish(piece: Workpiece, operation: AutoFinishOperation): Workpiece {
  if (piece.operations.length >= MAX_OPERATIONS || piece.repaired || piece.operations.some(o => o.id === operation.id)) throw new Error('本件已经自动收尾一次')
  const next = removeMaterial(piece, operation.cutters, 'shavingsMm3', operation.id)
  return { ...next, repaired: true, operations: [...piece.operations, structuredClone(operation)] }
}
export function outerSurface(piece: Workpiece, axis: Axis, sign: Sign): string {
  const b = bounds(piece.geometry.boxes)
  return surfaceId(axis, sign, sign === 1 ? b.max[axis] : b.min[axis])
}
