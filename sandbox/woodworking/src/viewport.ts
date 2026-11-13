import { bounds, EPS, patchVertices, surfaces } from './solid.ts'
import type { Box, Surface, Vec3 } from './solid.ts'
import type { OperationPreview, SawOperation, Workpiece } from './machining.ts'
export interface WorkView {
  piece: Workpiece
  selectedSurface: string | null
  operation?: SawOperation
  preview?: OperationPreview
  conflictSurfaces?: string[]
  paint?: string | null
  setup?: boolean
  socket?: { fits: boolean; width: number; depth: number }
}
export interface WorkbenchViewport {
  update(view: WorkView): void
  orient(mode: 'iso' | 'face' | 'depth', surfaceId?: string | null): void
  cancelGesture(): void
  destroy(): void
}
type Pixel = [number, number]
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, x, i) => sum + x * b[i], 0)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export function surfaceName(s: Surface, p: Workpiece): string {
  const size = [p.stock.length, p.stock.height, p.stock.width]
  const exterior = Math.abs(s.plane - (s.sign === 1 ? size[s.axis] : 0)) < EPS
  if (s.axis === 0) return s.sign < 0 ? '左基准端' : exterior ? '原端面' : `新端面 · ${s.plane.toFixed(1)} mm`
  if (s.axis === 1) return s.sign > 0 ? (exterior ? '顶面' : '锯缝底面') : '底面'
  return `${s.sign < 0 ? '近' : '远'}${exterior ? '侧面' : '侧新切面'}`
}
export function createWorkbenchViewport(canvas: HTMLCanvasElement, onSelect: (id: string) => void): WorkbenchViewport {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器无法显示木作台')
  const g = ctx
  let view: WorkView | null = null, yaw = .58, pitch = .46, scale = 1, cx = 0, cy = 0
  let right: Vec3 = [1, 0, 0], up: Vec3 = [0, 1, 0], camera: Vec3 = [0, 0, -1]
  let visible: { surface: Surface; patch: Box; points: Vec3[]; depth: number; fixture?: boolean }[] = []
  let hovered: string | null = null, disposed = false
  let drag: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null
  const project = (p: Vec3): Pixel => [cx + dot(p, right) * scale, cy - dot(p, up) * scale]
  function path(points: Pixel[], close = false) {
    g.beginPath(); points.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); if (close) g.closePath()
  }
  function label(p: Pixel, text: string, color = '#fbf4df') {
    g.font = '12px system-ui,sans-serif'; const w = g.measureText(text).width
    g.fillStyle = '#243b32ed'; g.beginPath(); g.roundRect(p[0] - w / 2 - 6, p[1] - 10, w + 12, 21, 5); g.fill()
    g.fillStyle = color; g.textAlign = 'center'; g.fillText(text, p[0], p[1] + 4); g.textAlign = 'left'
  }
  function line(a: Vec3, b: Vec3, color: string, width = 1.5) { path([project(a), project(b)]); g.strokeStyle = color; g.lineWidth = width; g.stroke() }
  function render() {
    if (!view || disposed) return
    const r = canvas.getBoundingClientRect(), w = r.width, h = r.height
    if (!w || !h) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr) }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h)
    right = [Math.cos(yaw), 0, Math.sin(yaw)]
    up = [-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)]
    camera = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)]
    // Fixed stock bounds prevent camera jumps when a piece of waste detaches.
    const { stock } = view.piece
    const all = patchVertices({ min: [0, 0, 0], max: [stock.length, 0, stock.width] }, 1)
      .flatMap(p => [p, [p[0], stock.height, p[2]] as Vec3])
    const fixtureBoxes: Box[] = []
    if (view.socket) {
      const end = bounds(view.piece.geometry.boxes).max[0]
      const x = view.socket.fits ? view.piece.design.length - view.socket.depth : end + 7
      const X = x + view.socket.depth, near = (stock.width - view.socket.width) / 2, far = near + view.socket.width
      fixtureBoxes.push({min:[x,0,near-6],max:[X,stock.height,near]}, {min:[x,0,far],max:[X,stock.height,far+6]}, {min:[X,0,near-6],max:[X+3,stock.height,far+6]})
      all.push([X+3,stock.height,far+6], [x,0,near-6])
    }
    const xs = all.map(p => dot(p, right)), ys = all.map(p => dot(p, up))
    const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys)
    scale = Math.min(w * .77 / Math.max(1, xmax - xmin), h * .58 / Math.max(1, ymax - ymin))
    cx = w * .48 - (xmin + xmax) * scale / 2; cy = h * .54 + (ymin + ymax) * scale / 2
    const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#36574b'); bg.addColorStop(1, '#21382f'); g.fillStyle = bg; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#e8d9b70d'; g.lineWidth = 1
    for (let i = 25; i < w; i += 28) { path([[i, 0], [i, h]]); g.stroke() }
    for (let i = 25; i < h; i += 28) { path([[0, i], [w, i]]); g.stroke() }
    g.save(); g.translate(w * .49, h * .78); g.scale(w * .35, h * .10)
    const shadow = g.createRadialGradient(0, 0, .1, 0, 0, 1); shadow.addColorStop(0, '#091c16aa'); shadow.addColorStop(1, '#091c1600'); g.fillStyle = shadow; g.fillRect(-1, -1, 2, 2); g.restore()
    const ss = surfaces(view.piece.geometry.boxes)
    visible = [...ss.map(surface => ({surface,fixture:false})), ...surfaces(fixtureBoxes).map(surface => ({surface,fixture:true}))]
      .filter(({surface:s}) => s.sign * camera[s.axis] > .002)
      .flatMap(({surface,fixture}) => surface.patches.map(patch => {
        const points = patchVertices(patch, surface.axis)
        return {surface,fixture,patch,points,depth:points.reduce((n,p)=>n+dot(p,camera),0)/4}
      })).sort((a,b)=>a.depth-b.depth)
    for (const { surface: s, patch, points, fixture } of visible) {
      const pp = points.map(project), color = s.axis === 1 ? '#d9b78b' : s.axis === 0 ? '#e8c597' : s.sign < 0 ? '#bb895b' : '#c89b68'
      path(pp, true); g.fillStyle = fixture ? '#789a95' : view.paint || color; g.fill(); g.save(); g.clip()
      g.strokeStyle = '#75543925'; g.lineWidth = 1
      if (s.axis !== 0) {
        const along = s.axis === 1 ? 2 : 1
        for (let k = 1; k < 10; k++) {
          const a: Vec3 = [...patch.min], b: Vec3 = [...patch.max]
          a[along] = b[along] = patch.min[along] + (patch.max[along] - patch.min[along]) * k / 10
          a[s.axis] = b[s.axis] = s.plane
          line(a, b, '#75543924', .7)
        }
      } else {
        const c = project([s.plane, stock.height * .35, stock.width * .65]); g.strokeStyle = '#8d61352c'
        for (let k = 1; k < 7; k++) { g.beginPath(); g.ellipse(c[0], c[1], k * scale * 2.5, k * scale * 3.4, -.2, 0, Math.PI * 2); g.stroke() }
      }
      if (!fixture && (s.id === view.selectedSurface || s.id === hovered || view.conflictSurfaces?.includes(s.id))) {
        g.fillStyle = view.conflictSurfaces?.includes(s.id) ? '#d455393b' : s.id === view.selectedSurface ? '#67dab641' : '#ffffff20'; g.fillRect(0, 0, w, h)
      }
      g.restore(); path(pp, true); g.lineWidth = !fixture && s.id === view.selectedSurface ? 2 : .7
      g.strokeStyle = !fixture && s.id === view.selectedSurface ? '#d4f0bd' : '#4c382e77'; g.stroke()
    }
    const preview = view.preview, op = view.operation
    if (preview?.sweep && op && preview.feedAxis !== undefined && preview.strokeAxis !== undefined) {
      // The narrow amber band is the kerf on the chosen waste side, not the whole waste block.
      for (const s of surfaces([preview.sweep])) for (const patch of s.patches) {
        path(patchVertices(patch, s.axis).map(project), true); g.fillStyle = '#ef985540'; g.fill()
      }
      const sweep = preview.sweep, fa = preview.feedAxis, sa = preview.strokeAxis
      const mid = { min: [...sweep.min], max: [...sweep.max] } as Box
      mid.min[op.planeAxis] = mid.max[op.planeAxis] = op.position
      const corners = patchVertices(mid, op.planeAxis)
      path(corners.map(project), true); g.fillStyle = '#f2ce7330'; g.fill(); g.setLineDash([5, 4]); g.strokeStyle = '#f5d892'; g.lineWidth = 1.5; g.stroke(); g.setLineDash([])
      const start: Vec3 = [...sweep.min], end: Vec3 = [...sweep.min]
      start[op.planeAxis] = end[op.planeAxis] = op.position
      // Dimension arrow lies just outside the blade stroke, so it remains legible on the solid.
      start[sa] = end[sa] = sa === 1 ? sweep.max[sa] + 4 : sweep.min[sa] - 5
      start[fa] = preview.feedSign === -1 ? sweep.max[fa] : sweep.min[fa]
      end[fa] = preview.feedSign === -1 ? sweep.min[fa] : sweep.max[fa]
      line(start, end, '#f3db90', 2)
      const a = project(start), b = project(end), angle = Math.atan2(b[1] - a[1], b[0] - a[0])
      path([[b[0] - 9 * Math.cos(angle - .45), b[1] - 9 * Math.sin(angle - .45)], b, [b[0] - 9 * Math.cos(angle + .45), b[1] - 9 * Math.sin(angle + .45)]]); g.strokeStyle = '#f3db90'; g.stroke()
      const entryLineA: Vec3 = [...sweep.min], entryLineB: Vec3 = [...sweep.max]
      entryLineA[op.planeAxis] = entryLineB[op.planeAxis] = op.position
      entryLineA[fa] = entryLineB[fa] = start[fa]
      line(entryLineA, entryLineB, '#fff2b9', 2.5)
      const midPoint: Pixel = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 14]
      label(midPoint, `进深 ${op.depth.toFixed(1)} mm`)
      g.beginPath(); g.arc(...b, 4, 0, Math.PI * 2); g.fillStyle = '#f3db90'; g.fill()
      label([b[0] + 15, b[1] + 14], '止')
    }
    if (view.socket) label([w / 2, h - 20], view.socket.fits ? '预制试配槽 · 已就位' : '预制试配槽 · 未通过，检查红色接触面')
    const selected = ss.find(s => s.id === view!.selectedSurface)
    g.font = '12px system-ui,sans-serif'; g.fillStyle = '#e9e3cc'; g.fillText(selected ? `工作面：${surfaceName(selected, view.piece)}` : '点一下选面 · 拖动旋转木料', 16, 25)
    g.fillStyle = '#b6c8b9'; g.fillText('点击不会划线或下锯', 16, 45)
    if (hovered) { const s = ss.find(s => s.id === hovered); if (s) { g.textAlign = 'right'; g.fillStyle = '#e9e3cc'; g.fillText(surfaceName(s, view.piece), w - 16, 25); g.textAlign = 'left' } }
    const scaleLength = Math.min(10, stock.width / 3)
    path([[20, h - 24], [20 + scaleLength * scale, h - 24]]); g.strokeStyle = '#e9e3cc'; g.lineWidth = 2; g.stroke()
    g.fillStyle = '#d4dfcf'; g.fillText(`${scaleLength.toFixed(0)} mm`, 20, h - 32)
    label(project([0, stock.height + 2, 0]), 'A · 基准端')
    if (view.operation?.planeAxis === 2) label(project([stock.length, 0, 0]), 'B · 近侧基准')
    canvas.dataset.surface = view.selectedSurface || ''
    canvas.dataset.operations = String(view.piece.operations.length)
    canvas.dataset.volume = String(view.piece.geometry.boxes.reduce((n, b) => n + (b.max[0]-b.min[0])*(b.max[1]-b.min[1])*(b.max[2]-b.min[2]), 0))
  }
  function pick(x: number, y: number): string | null {
    const sx = (x - cx) / scale, sy = -(y - cy) / scale
    const base = right.map((v, i) => v * sx + up[i] * sy) as Vec3
    let nearest = -Infinity, id: string | null = null
    for (const { surface: s, patch, fixture } of visible) {
      if (fixture) continue
      const t = (s.plane - base[s.axis]) / camera[s.axis]
      const p = base.map((v, i) => v + camera[i] * t)
      if (t > nearest && p.every((v, i) => v >= patch.min[i] - EPS && v <= patch.max[i] + EPS)) { nearest = t; id = s.id }
    }
    return id
  }
  function point(e: PointerEvent) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  function down(e: PointerEvent) {
    if (disposed || drag || e.button !== 0) return
    const p = point(e); drag = { id: e.pointerId, ...p, startX: p.x, startY: p.y, moved: false }; canvas.setPointerCapture(e.pointerId); e.preventDefault()
  }
  function move(e: PointerEvent) {
    const p = point(e)
    if (!drag) { const id = pick(p.x, p.y); if (hovered !== id) { hovered = id; canvas.style.cursor = id ? 'pointer' : 'grab'; render() } return }
    if (e.pointerId !== drag.id) return
    if (Math.hypot(p.x - drag.startX, p.y - drag.startY) > 6) drag.moved = true
    if (drag.moved) { yaw += (p.x - drag.x) * .009; pitch = clamp(pitch + (p.y - drag.y) * .009, -1.35, 1.35); hovered = null }
    drag.x = p.x; drag.y = p.y; render()
  }
  function cancelGesture() {
    if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id)
    drag = null; hovered = null; render()
  }
  function end(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return
    const d = drag, p = point(e); cancelGesture()
    if (e.type === 'pointerup' && !d.moved && Math.hypot(p.x - d.startX, p.y - d.startY) <= 6) { const id = pick(p.x, p.y); if (id) onSelect(id) }
  }
  function leave() { if (!drag) { hovered = null; render() } }
  const resize = new ResizeObserver(render); resize.observe(canvas)
  const priorTouchAction = canvas.style.touchAction; canvas.style.touchAction = 'none'
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('pointerleave', leave)
  return {
    update(next) { view = next; render() }, cancelGesture,
    orient(mode, id) {
      const surface = view && surfaces(view.piece.geometry.boxes).find(s => s.id === (id ?? view!.selectedSurface))
      if (mode === 'iso' || !surface) { yaw = .58; pitch = .46 }
      else if (mode === 'face') {
        if (surface.axis === 0) { yaw = surface.sign > 0 ? 1.40 : -1.40; pitch = .18 }
        else if (surface.axis === 1) { yaw = .14; pitch = surface.sign > 0 ? 1.32 : -1.32 }
        else { yaw = surface.sign < 0 ? .16 : Math.PI - .16; pitch = .20 }
      } else {
        const axis = view!.operation?.planeAxis ?? 2
        // Look along the cut-plane normal: entry and stopping depth are both visible.
        if (axis === 0) { yaw = 1.28; pitch = .32 }
        else if (axis === 2) { yaw = .20; pitch = .35 }
        else { yaw = .35; pitch = 1.20 }
      }
      hovered = null; render()
    },
    destroy() { cancelGesture(); disposed = true; resize.disconnect(); canvas.style.touchAction = priorTouchAction; canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', end); canvas.removeEventListener('pointercancel', end); canvas.removeEventListener('pointerleave', leave) },
  }
}
