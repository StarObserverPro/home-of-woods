/** All dimensions and face-local coordinates are in millimetres. */
export type Face = 'top' | 'near' | 'far' | 'end'
export const CUTS = ['trim', 'cheekNear', 'cheekFar', 'shoulderNear', 'shoulderFar'] as const
export type CutId = (typeof CUTS)[number]
export type Side = 'near' | 'far'
export interface Point {
  u: number
  v: number
}
export interface Mark {
  face: Face
  a: Point
  b: Point
}
export interface Design {
  length: number
  tenonLength: number
  tenonWidth: number
}
export interface Stock {
  id: string
  label?: string
  length: number
  width: number
  height: number
}
export const DEFAULT_DESIGN: Design = { length: 80, tenonLength: 20, tenonWidth: 14 }
export const DEFAULT_STOCK: Stock = { id: 'demo-blank', length: 90, width: 30, height: 30 }
export const CUT_FACE: Record<CutId, Face> = {
  trim: 'top',
  cheekNear: 'end',
  cheekFar: 'end',
  shoulderNear: 'near',
  shoulderFar: 'far',
}
export interface Job {
  design: Design
  stock: Stock
  marks: Partial<Record<CutId, Mark>>
  cuts: Partial<Record<CutId, Mark>>
  trials: number
  needsTrial: boolean
}
export interface FitReport {
  ready: boolean
  fits: boolean
  score: number
  issues: string[]
  repair: Side[]
  interference?: Side | 'both' | 'end'
  clearance: number
  lengthError: number
  shoulderError: number
}
export interface FinishedWork {
  kind: 'woodworking.tenon-sample'
  version: 1
  score: number
  paint: string | null
  envelope: {
    length: number
    width: number
    height: number
    tenonWidth: number
    tenonLength: number
    end: [number, number]
    nearCheek: [number, number]
    farCheek: [number, number]
    nearShoulder: [number, number]
    farShoulder: [number, number]
  }
}
export function createJob(design = DEFAULT_DESIGN, stock = DEFAULT_STOCK): Job {
  if (
    typeof stock.id !== 'string' ||
    (stock.label !== undefined && typeof stock.label !== 'string') ||
    ![design.length, design.tenonLength, design.tenonWidth, stock.length, stock.width, stock.height].every(
      (x) => Number.isFinite(x) && x > 0,
    ) ||
    !stock.id ||
    design.length > stock.length ||
    design.tenonLength >= design.length ||
    design.tenonWidth >= stock.width
  )
    throw new Error('图纸尺寸与毛料不匹配')
  const { length, tenonLength, tenonWidth } = design
  const { id, label, length: stockLength, width, height } = stock
  return {
    design: { length, tenonLength, tenonWidth },
    stock: { id, ...(label === undefined ? {} : { label }), length: stockLength, width, height },
    marks: {},
    cuts: {},
    trials: 0,
    needsTrial: true,
  }
}
export function idealMark(job: Job, id: CutId): Mark {
  const { design, stock } = job
  const near = (stock.width - design.tenonWidth) / 2
  const u =
    id === 'trim'
      ? design.length
      : id === 'cheekNear'
        ? near
        : id === 'cheekFar'
          ? stock.width - near
          : design.length - design.tenonLength
  return { face: CUT_FACE[id], a: { u, v: 0 }, b: { u, v: id === 'trim' ? stock.width : stock.height } }
}
function station(mark: Mark, v: number) {
  return mark.a.u + ((v - mark.a.v) * (mark.b.u - mark.a.u)) / (mark.b.v - mark.a.v)
}
export function endAt(job: Job, z: number) {
  return job.cuts.trim ? station(job.cuts.trim, z) : job.stock.length
}
export function profile(job: Job, y = job.stock.height / 2) {
  const { cuts, stock } = job
  return {
    near: cuts.cheekNear ? station(cuts.cheekNear, y) : 0,
    far: cuts.cheekFar ? station(cuts.cheekFar, y) : stock.width,
    nearShoulder: cuts.shoulderNear
      ? station(cuts.shoulderNear, y)
      : job.design.length - job.design.tenonLength,
    farShoulder: cuts.shoulderFar ? station(cuts.shoulderFar, y) : job.design.length - job.design.tenonLength,
    nearReleased: !!cuts.shoulderNear,
    farReleased: !!cuts.shoulderFar,
  }
}
export function availableCuts(job: Job): CutId[] {
  if (!job.cuts.trim) return ['trim']
  return CUTS.filter(
    (id) =>
      !job.cuts[id] &&
      (id !== 'shoulderNear' || !!job.cuts.cheekNear) &&
      (id !== 'shoulderFar' || !!job.cuts.cheekFar),
  )
}
function validateLine(job: Job, id: CutId, mark: Mark) {
  const face = CUT_FACE[id],
    span = id === 'trim' ? job.stock.width : job.stock.height
  const width = face === 'end' ? job.stock.width : job.stock.length
  if (
    mark.face !== face ||
    [mark.a, mark.b].some(
      (p) =>
        !Number.isFinite(p.u) || !Number.isFinite(p.v) || p.u < 0 || p.v < 0 || p.v > span || p.u > width,
    ) ||
    Math.abs(mark.a.v - mark.b.v) < span / 4
  )
    throw new Error('请在指定木面上沿切线划出足够长的一段')
  for (const v of [0, span]) {
    const u = station(mark, v)
    if (u <= 0 || u > width) throw new Error('切线延伸后超出木料')
  }
  return { face: mark.face, a: { u: mark.a.u, v: mark.a.v }, b: { u: mark.b.u, v: mark.b.v } }
}
export function markCut(job: Job, id: CutId, mark: Mark): Job {
  if (!availableCuts(job).includes(id)) throw new Error('这道工序当前不可划线')
  return { ...job, marks: { ...job.marks, [id]: validateLine(job, id, mark) } }
}
export function clearMark(job: Job, id: CutId): Job {
  const marks = { ...job.marks }
  delete marks[id]
  return { ...job, marks }
}
/** Follow the player's line. Shoulder strokes stop at the previous cheek kerf. */
export function cheekStop(job: Job): number {
  // The depth fence references the squared left end. A shoulder can be re-marked
  // at or beyond this station; cutting deeper would leave the waste attached.
  return Math.max(0, job.design.length - job.design.tenonLength - 1)
}
export function cut(job: Job, id: CutId): Job {
  const line = job.marks[id]
  if (!line || !availableCuts(job).includes(id)) throw new Error('先在指定木面上划线')
  for (const y of [0, job.stock.height]) {
    const p = profile(job, y),
      u = station(line, y)
    if ((id === 'cheekNear' || id === 'cheekFar') && endAt(job, u) <= cheekStop(job))
      throw new Error('毛料截得过短，榫端未达到纵锯深度挡块')
    if ((id === 'cheekNear' && u >= p.far) || (id === 'cheekFar' && u <= p.near))
      throw new Error('这条锯路会切断整个榫头')
    if (id === 'shoulderNear' || id === 'shoulderFar') {
      const a = id === 'shoulderNear' ? 0 : p.far,
        b = id === 'shoulderNear' ? p.near : job.stock.width
      if (u < cheekStop(job))
        throw new Error('肩线与纵锯路不相交，废料仍相连。请擦线并把肩线向榫端移至锯路内')
      if (u >= Math.min(endAt(job, a), endAt(job, b))) throw new Error('肩线须落在截断面以内')
    }
  }
  return { ...clearMark(job, id), cuts: { ...job.cuts, [id]: line } }
}
/** A keyed socket holds the body centred. Side gaps and penetration are evaluated at both heights. */
export function trialFit(job: Job): FitReport {
  const { stock, design } = job,
    ready = CUTS.every((k) => !!job.cuts[k])
  const result: FitReport = {
    ready,
    fits: false,
    score: 0,
    repair: [],
    issues: [],
    clearance: 0,
    lengthError: 0,
    shoulderError: 0,
  }
  if (!ready) {
    result.issues.push('先完成截料、两道榫颊和两道肩口')
    return result
  }
  const near = (stock.width - design.tenonWidth) / 2,
    far = stock.width - near,
    shoulder = design.length - design.tenonLength
  let looseness = 0,
    excessDepth = 0,
    shortfall = 0,
    skew = 0
  for (const z of [0, stock.width])
    result.lengthError = Math.max(result.lengthError, Math.abs(endAt(job, z) - design.length))
  for (const y of [0, stock.height]) {
    const p = profile(job, y),
      gaps = [p.near - near, far - p.far]
    for (const [i, side] of (['near', 'far'] as const).entries()) {
      if (gaps[i] < -0.25 && !result.repair.includes(side)) result.repair.push(side)
      looseness = Math.max(looseness, gaps[i])
      result.clearance = Math.max(result.clearance, Math.abs(gaps[i]))
    }
    skew = Math.max(skew, Math.abs(p.nearShoulder - p.farShoulder))
    result.shoulderError = Math.max(
      result.shoulderError,
      Math.abs(p.nearShoulder - shoulder),
      Math.abs(p.farShoulder - shoulder),
    )
    for (const z of [p.near, p.far]) {
      const depth = endAt(job, z) - Math.max(p.nearShoulder, p.farShoulder)
      excessDepth = Math.max(excessDepth, depth - design.tenonLength)
      shortfall = Math.max(shortfall, design.tenonLength - depth)
    }
  }
  if (result.repair.length) {
    result.interference = result.repair.length === 2 ? 'both' : result.repair[0]
    result.issues.push('榫颊抵住槽壁，按接触侧薄削')
  }
  if (excessDepth > 0.75) {
    result.interference ??= 'end'
    result.issues.push('榫端抵底，肩口无法贴合')
  }
  if (looseness > 1.5) result.issues.push('榫颊去料过多，侧隙超差')
  if (shortfall > 2) result.issues.push('榫头过短，有效咬合不足')
  if (skew > 2) result.issues.push('两肩高差超差')
  result.fits = result.issues.length === 0
  result.score = Math.max(
    0,
    Math.round(
      100 - 16 * result.clearance - Math.max(7 * result.shoulderError, 3 * skew) - 4 * result.lengthError,
    ),
  )
  return result
}
export function recordTrial(job: Job): Job {
  if (!trialFit(job).ready) throw new Error('完成所有切削后才能试装')
  return { ...job, trials: job.trials + 1, needsTrial: false }
}
export function pare(job: Job, side: Side, mm = 0.25): Job {
  if (!job.trials || !trialFit(job).ready || !Number.isFinite(mm) || mm <= 0 || mm > 1)
    throw new Error('试装后每刀可薄削最多 1 mm')
  const id = side === 'near' ? 'cheekNear' : 'cheekFar',
    line = job.cuts[id]!,
    delta = side === 'near' ? mm : -mm
  for (const y of [0, job.stock.height]) {
    const p = profile(job, y)
    if (p.far - p.near <= mm) throw new Error('余量不足')
  }
  return {
    ...job,
    needsTrial: true,
    cuts: {
      ...job.cuts,
      [id]: {
        face: line.face,
        a: { u: line.a.u + delta, v: line.a.v },
        b: { u: line.b.u + delta, v: line.b.v },
      },
    },
  }
}
export function finish(job: Job, paint: string | null = null): FinishedWork {
  const r = trialFit(job)
  if (job.needsTrial || !r.fits) throw new Error('请先完成合格试装')
  if (paint !== null && !/^#[0-9a-f]{6}$/i.test(paint)) throw new Error('漆色需要六位十六进制色值')
  const profiles = [profile(job, 0), profile(job, job.stock.height)]
  return {
    kind: 'woodworking.tenon-sample',
    version: 1,
    score: r.score,
    paint,
    envelope: {
      end: [endAt(job, 0), endAt(job, job.stock.width)],
      nearCheek: [profiles[0].near, profiles[1].near],
      farCheek: [profiles[0].far, profiles[1].far],
      nearShoulder: [profiles[0].nearShoulder, profiles[1].nearShoulder],
      farShoulder: [profiles[0].farShoulder, profiles[1].farShoulder],
      length: Math.max(endAt(job, 0), endAt(job, job.stock.width)),
      width: job.stock.width,
      height: job.stock.height,
      tenonWidth: Math.max(...profiles.map((p) => p.far)) - Math.min(...profiles.map((p) => p.near)),
      tenonLength: Math.max(
        ...profiles.flatMap((p) =>
          [p.near, p.far].map((z) => endAt(job, z) - Math.min(p.nearShoulder, p.farShoulder)),
        ),
      ),
    },
  }
}
/** Reapply ordinary cut guards to saved planes. Never revive unknown fields or host objects. */
export function restoreJob(raw: unknown): Job {
  if (!raw || typeof raw !== 'object') throw new Error('木作存档缺失')
  const saved = raw as Job
  if (
    !saved.design ||
    !saved.stock ||
    !saved.cuts ||
    !saved.marks ||
    typeof saved.cuts !== 'object' ||
    typeof saved.marks !== 'object' ||
    !Number.isSafeInteger(saved.trials) ||
    saved.trials < 0 ||
    typeof saved.needsTrial !== 'boolean'
  )
    throw new Error('木作存档格式错误')
  const { length, tenonLength, tenonWidth } = saved.design
  const { id, label, length: stockLength, width, height } = saved.stock
  let job = createJob({ length, tenonLength, tenonWidth }, { id, label, length: stockLength, width, height })
  for (const records of [saved.cuts, saved.marks]) {
    if (Array.isArray(records) || Object.keys(records).some((key) => !CUTS.includes(key as CutId)))
      throw new Error('未知工序')
  }
  for (const id of CUTS)
    if (Object.prototype.hasOwnProperty.call(saved.cuts, id)) job = cut(markCut(job, id, saved.cuts[id]!), id)
  for (const id of CUTS)
    if (Object.prototype.hasOwnProperty.call(saved.marks, id)) job = markCut(job, id, saved.marks[id]!)
  if ((saved.trials > 0 && !trialFit(job).ready) || (!saved.trials && !saved.needsTrial))
    throw new Error('试装记录与工序不符')
  return { ...job, trials: saved.trials, needsTrial: saved.needsTrial }
}
