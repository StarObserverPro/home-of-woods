import { endAt, profile, type Design, type FinishedWork, type Job, trialFit, cheekStop } from './domain.js'

/** Orthographic workbench. All geometry is in millimetres. */
export type WoodFace = 'top' | 'near' | 'far' | 'end' | 'bottom' | 'left'
export interface SurfacePoint {
  u: number
  v: number
}
export interface SurfaceStroke {
  face: WoodFace
  points: readonly SurfacePoint[]
}
export interface WorkView {
  length: number
  width: number
  height: number
  /** Crosscut end and the two independently cut cheeks. */
  target?: Design
  job?: Job
  envelope?: FinishedWork['envelope']
  strokes?: readonly SurfaceStroke[]
  kerfs?: readonly SurfaceStroke[]
  heat?: { face: WoodFace; u: number; v: number; radiusU: number; radiusV: number }
  mode: 'rotate' | 'mark'
  ghost?: boolean
  pigment?: string
  socket?: { width: number; depth: number; interference?: 'near' | 'far' | 'both' | 'end' }
}
export interface WorkbenchViewport {
  update(view: WorkView): void
  cancelGesture(): void
  orient(face: WoodFace | 'iso'): void
  destroy(): void
}
type Vec = [number, number, number]
type Pixel = [number, number]
interface Panel {
  vertices: Vec[]
  face: WoodFace
  color?: string
  fixture?: boolean
  outer?: boolean
}
const faces: WoodFace[] = ['near', 'far', 'top', 'bottom', 'end', 'left']
const normals: Record<WoodFace, Vec> = {
  near: [0, 0, -1],
  far: [0, 0, 1],
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  end: [1, 0, 0],
  left: [-1, 0, 0],
}
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))
function board(x: number, X: number, y: number, Y: number, z: number, Z: number, fixture = false): Panel[] {
  if (X <= x || Y <= y || Z <= z) return []
  const vertices: Vec[][] = [
    [
      [x, y, z],
      [X, y, z],
      [X, Y, z],
      [x, Y, z],
    ],
    [
      [x, y, Z],
      [X, y, Z],
      [X, Y, Z],
      [x, Y, Z],
    ],
    [
      [x, Y, z],
      [X, Y, z],
      [X, Y, Z],
      [x, Y, Z],
    ],
    [
      [x, y, z],
      [X, y, z],
      [X, y, Z],
      [x, y, Z],
    ],
    [
      [X, y, z],
      [X, Y, z],
      [X, Y, Z],
      [X, y, Z],
    ],
    [
      [x, y, z],
      [x, Y, z],
      [x, Y, Z],
      [x, y, Z],
    ],
  ]
  return faces.map((face, i) => ({ face, vertices: vertices[i], fixture }))
}
/** Parametric bands keep independent left and right shoulders, even for slanted cuts. */
function shapedBoard(
  W: number,
  H: number,
  section: (y: number) => ReturnType<typeof profile>,
  endAtZ: (z: number) => number,
): Panel[] {
  const result: Panel[] = []
  for (let band = 0; band < 3; band++) {
    const vertices = (t: number, y: number, zEdge: number): Vec => {
      const p = section(y),
        stations = [0, p.near, p.far, W],
        z = stations[band + zEdge]
      const end =
        band === 0 && p.nearReleased
          ? p.nearShoulder
          : band === 2 && p.farReleased
            ? p.farShoulder
            : endAtZ(z)
      return [end * t, y, z]
    }
    const solids = board(0, 1, 0, 1, 0, 1)
    for (const panel of solids) {
      const nearInner = panel.face === 'near' && band > 0,
        farInner = panel.face === 'far' && band < 2
      if ((nearInner || farInner) && band !== 1) continue
      const side = nearInner ? 'near' : 'far'
      const verts = panel.vertices.map(([t, y, z]) => {
        const point = vertices(t, y * H, z)
        if ((nearInner || farInner) && t === 0) {
          const p = section(y * H)
          point[0] = (side === 'near' ? p.near === 0 : p.far === W)
            ? 0
            : side === 'near' && p.nearReleased
              ? p.nearShoulder
              : side === 'far' && p.farReleased
                ? p.farShoulder
                : endAtZ(point[2])
        }
        return point
      })
      const p = section(H / 2),
        original =
          panel.face === 'end'
            ? band === 1 || (band === 0 ? !p.nearReleased : !p.farReleased)
            : !nearInner && !farInner
      result.push({ ...panel, vertices: verts, outer: original })
    }
  }
  // Before the cheek cuts, the whole end is the middle band.
  for (const panel of result) {
    if (
      (panel.face === 'near' && panel.vertices.every((v) => Math.abs(v[2]) < 1e-7)) ||
      (panel.face === 'far' && panel.vertices.every((v) => Math.abs(v[2] - W) < 1e-7))
    )
      panel.outer = true
  }
  return result
}
function local(face: WoodFace, p: Vec): SurfacePoint {
  return {
    u: face === 'end' || face === 'left' ? p[2] : p[0],
    v: face === 'top' || face === 'bottom' ? p[2] : p[1],
  }
}
function world(face: WoodFace, p: SurfacePoint, plane: number): Vec {
  if (face === 'top' || face === 'bottom') return [p.u, plane, p.v]
  if (face === 'end' || face === 'left') return [plane, p.v, p.u]
  return [p.u, p.v, plane]
}
function normal(panel: Panel): Vec {
  const [a, b, c] = panel.vertices,
    u = b.map((v, i) => v - a[i]),
    v = c.map((v, i) => v - a[i])
  const n: Vec = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  const len = Math.hypot(...n),
    sign = dot(n, normals[panel.face]) < 0 ? -1 : 1
  return len ? (n.map((x) => (x * sign) / len) as Vec) : [0, 0, 0]
}
function surface(panel: Panel, pt: SurfacePoint): Vec {
  const n = normal(panel),
    a = panel.vertices[0],
    p = world(panel.face, pt, 0),
    axis =
      panel.face === 'top' || panel.face === 'bottom'
        ? 1
        : panel.face === 'end' || panel.face === 'left'
          ? 0
          : 2
  p[axis] = (dot(n, a) - dot(n, p)) / n[axis]
  return p
}
const planeOf = (p: Panel) =>
  p.vertices[0][p.face === 'top' || p.face === 'bottom' ? 1 : p.face === 'end' || p.face === 'left' ? 0 : 2]
function mix(a: string, b: string, t: number) {
  const channel = (i: number) =>
    Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t)
  return `rgb(${channel(1)},${channel(3)},${channel(5)})`
}
export function createWorkbenchViewport(
  canvas: HTMLCanvasElement,
  onStroke: (stroke: SurfaceStroke) => void,
): WorkbenchViewport {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前设备无法打开木作视窗')
  const g = ctx
  let view: WorkView = { length: 80, width: 30, height: 30, mode: 'rotate' },
    yaw = 0.56,
    pitch = 0.42,
    scale = 1,
    cx = 0,
    cy = 0
  let right: Vec = [1, 0, 0],
    up: Vec = [0, 1, 0],
    camera: Vec = [0, 0, -1],
    panels: Panel[] = []
  let toolCue: { a: Vec; b: Vec; kind: 'saw' | 'pare'; step: number } | undefined
  let cueTimers: ReturnType<typeof setTimeout>[] = []
  function clearCue() {
    cueTimers.forEach(clearTimeout)
    cueTimers = []
    toolCue = undefined
  }
  const samePlane = (a: Panel, b: Panel) =>
    a.face === b.face && Math.abs(dot(normal(a), a.vertices[0]) - dot(normal(a), b.vertices[0])) < 1e-6
  let drag: { id: number; x: number; y: number; panel?: Panel; points: SurfacePoint[] } | null = null
  const project = (p: Vec): Pixel => [cx + dot(p, right) * scale, cy - dot(p, up) * scale]
  function path(points: Pixel[]) {
    g.beginPath()
    points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  }
  function stroke(p: Panel, s: SurfaceStroke, color: string, weight: number) {
    if (s.face !== p.face || s.points.length < 2) return
    path(s.points.map((point) => project(surface(p, point))))
    g.strokeStyle = color
    g.lineWidth = weight
    g.stroke()
  }
  function render() {
    const { width: w, height: h } = canvas.getBoundingClientRect()
    if (!w || !h) return
    const ratio = Math.min(2, canvas.ownerDocument.defaultView?.devicePixelRatio || 1)
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio)
      canvas.height = Math.round(h * ratio)
    }
    g.setTransform(ratio, 0, 0, ratio, 0, 0)
    g.clearRect(0, 0, w, h)
    const { length: L, width: W, height: H, socket } = view
    const E = view.job ? Math.max(endAt(view.job, 0), endAt(view.job, W)) : (view.envelope?.length ?? L)
    const c = Math.cos(yaw),
      s = Math.sin(yaw),
      a = Math.cos(pitch),
      b = Math.sin(pitch)
    right = [c, 0, s]
    up = [-s * b, a, c * b]
    camera = [s * a, b, -c * a]
    panels = board(0, L, 0, H, 0, W)
    const job = view.job,
      envelope = view.envelope,
      target = view.target ?? job?.design
    const idealPanels = target
      ? shapedBoard(
          W,
          H,
          () => ({
            near: (W - target.tenonWidth) / 2,
            far: (W + target.tenonWidth) / 2,
            nearShoulder: target.length - target.tenonLength,
            farShoulder: target.length - target.tenonLength,
            nearReleased: true,
            farReleased: true,
          }),
          () => target.length,
        )
      : []
    if (!job && !envelope && idealPanels.length) panels = idealPanels
    if (job)
      panels = shapedBoard(
        W,
        H,
        (y) => profile(job, y),
        (z) => endAt(job, z),
      )
    else if (envelope) {
      const at = (pair: [number, number], t: number) => pair[0] + (pair[1] - pair[0]) * t
      panels = shapedBoard(
        W,
        H,
        (y) => ({
          near: at(envelope.nearCheek, y / H),
          far: at(envelope.farCheek, y / H),
          nearShoulder: at(envelope.nearShoulder, y / H),
          farShoulder: at(envelope.farShoulder, y / H),
          nearReleased: true,
          farReleased: true,
        }),
        (z) => at(envelope.end, z / W),
      )
    }
    const jointStart =
      socket && job && trialFit(job).fits
        ? Math.max(profile(job).nearShoulder, profile(job).farShoulder)
        : E + Math.max(5, W * 0.22)
    if (socket) {
      const x = jointStart,
        X = x + socket.depth,
        side = W * 0.25,
        lo = (W - socket.width) / 2,
        hi = W - lo
      panels.push(
        ...board(x, X, 0, H, -side, lo, true),
        ...board(x, X, 0, H, hi, W + side, true),
        ...board(X, X + 4, 0, H, -side, W + side, true),
      )
    }
    const all = panels.flatMap((p) => p.vertices)
    if (!all.length) return
    const xs = all.map((p) => dot(p, right)),
      ys = all.map((p) => dot(p, up)),
      xmin = Math.min(...xs),
      xmax = Math.max(...xs),
      ymin = Math.min(...ys),
      ymax = Math.max(...ys)
    scale = Math.min((w * 0.82) / Math.max(1, xmax - xmin), (h * 0.64) / Math.max(1, ymax - ymin))
    cx = w * 0.5 - ((xmin + xmax) * scale) / 2
    cy = h * 0.49 + ((ymin + ymax) * scale) / 2
    const mat = g.createLinearGradient(0, 0, w, h)
    mat.addColorStop(0, '#3b5145')
    mat.addColorStop(0.64, '#30483d')
    mat.addColorStop(1, '#253b32')
    g.fillStyle = mat
    g.fillRect(0, 0, w, h)
    // A quiet bench mat gives the rotating piece a constant visual reference.
    g.save()
    g.strokeStyle = 'rgba(228,224,180,.095)'
    g.lineWidth = 1
    for (const [x, y, dx, dy] of [
      [13, 13, 1, 1],
      [w - 13, 13, -1, 1],
      [13, h - 13, 1, -1],
      [w - 13, h - 13, -1, -1],
    ]) {
      g.beginPath()
      g.moveTo(x + dx * 14, y)
      g.lineTo(x, y)
      g.lineTo(x, y + dy * 14)
      g.stroke()
    }
    g.restore()
    const shadow = g.createRadialGradient(0, 0, 0, 0, 0, 1)
    shadow.addColorStop(0, 'rgba(30,25,16,.26)')
    shadow.addColorStop(1, 'rgba(30,25,16,0)')
    g.save()
    g.translate(w * 0.49, h * 0.7)
    g.scale(w * 0.46, h * 0.12)
    g.fillStyle = shadow
    g.fillRect(-1, -1, 2, 2)
    g.restore()
    const depth = (p: Panel) => p.vertices.reduce((sum, v) => sum + dot(v, camera), 0) / p.vertices.length
    panels = panels.filter((p) => dot(normal(p), camera) > 0.002).sort((a, b) => depth(a) - depth(b))
    const original: Record<WoodFace, number> = { near: 0, far: W, top: H, bottom: 0, end: E, left: 0 }
    for (const p of panels) {
      const face = p.face,
        plane = planeOf(p),
        material = p.fixture
          ? '#586667'
          : /^#[0-9a-f]{6}$/i.test(view.pigment || '')
            ? view.pigment!
            : '#c49465'
      g.save()
      path(p.vertices.map(project))
      g.closePath()
      g.fillStyle = mix(
        material,
        face === 'top' ? '#ffe0aa' : '#4d3225',
        face === 'top' ? 0.37 : face === 'end' || face === 'left' ? 0.26 : 0.1,
      )
      g.fill()
      g.clip()
      const coords = p.vertices.map((v) => local(face, v))
      const u0 = Math.min(...coords.map((v) => v.u)),
        u1 = Math.max(...coords.map((v) => v.u)),
        v0 = Math.min(...coords.map((v) => v.v)),
        v1 = Math.max(...coords.map((v) => v.v))
      if (!p.fixture) {
        const cross = face === 'end' || face === 'left'
        const point = (u: number, v: number) => project(surface(p, { u, v }))
        if (cross) {
          for (let i = 1; i < 23; i++) {
            const pts: Pixel[] = []
            for (let j = 0; j <= 64; j++) {
              const t = (j * Math.PI) / 32,
                r = i * 2.4 + 0.28 * Math.sin(3 * t + i * 0.14) + 0.18 * Math.sin(5 * t)
              pts.push(point(W * 0.16 + Math.cos(t) * r * 1.16, H * 0.28 + Math.sin(t) * r))
            }
            path(pts)
            g.strokeStyle = i % 4 === 0 ? 'rgba(98,58,33,.26)' : 'rgba(105,59,31,.14)'
            g.lineWidth = i % 4 === 0 ? 1.15 : 0.7
            g.stroke()
          }
        } else {
          // Continuous coordinates keep figure aligned across a newly exposed shoulder.
          for (let i = Math.floor(v0 / 2.15) - 3; i <= v1 / 2.15 + 3; i++) {
            const pts: Pixel[] = []
            for (let j = 0; j <= 32; j++) {
              const u = u0 + ((u1 - u0) * j) / 32
              const v =
                i * 2.15 +
                1.05 * Math.sin(0.084 * u + i * 0.22) +
                0.38 * Math.sin(0.17 * u + i * 0.8) +
                0.08 * i * Math.sin(0.066 * u)
              pts.push(point(u, v))
            }
            path(pts)
            g.strokeStyle = i % 4 === 0 ? 'rgba(98,58,31,.24)' : 'rgba(106,66,38,.14)'
            g.lineWidth = i % 4 === 0 ? 1.35 : 0.75
            g.stroke()
          }
        }
      }
      if (!p.fixture && (p.outer ?? Math.abs(original[face] - plane) < 0.001)) {
        if (view.heat?.face === face) {
          const heat = view.heat
          for (const spread of [1.16, 1.08, 1, 0.94]) {
            const ring: Pixel[] = []
            for (let i = 0; i < 40; i++) {
              const t = (i * Math.PI) / 20
              const rounded = (v: number) => Math.sign(v) * Math.abs(v) ** 0.58
              ring.push(
                project(
                  surface(p, {
                    u: heat.u + heat.radiusU * spread * rounded(Math.cos(t)),
                    v: heat.v + heat.radiusV * spread * rounded(Math.sin(t)),
                  }),
                ),
              )
            }
            path(ring)
            g.closePath()
            g.fillStyle = 'rgba(250,196,69,.10)'
            g.fill()
          }
        }
        for (const mark of view.strokes ?? []) stroke(p, mark, '#334754', 2)
        for (const cut of view.kerfs ?? []) stroke(p, cut, '#573a25', 4)
        if (face === 'top' && view.job) {
          const j = view.job,
            section = profile(j, H)
          for (const side of ['near', 'far'] as const) {
            const cut = side === 'near' ? j.cuts.cheekNear : j.cuts.cheekFar
            if (!cut) continue
            const z = section[side],
              end = endAt(j, z),
              start = (side === 'near' ? section.nearReleased : section.farReleased)
                ? section[side === 'near' ? 'nearShoulder' : 'farShoulder']
                : cheekStop(j)
            stroke(
              p,
              {
                face: 'top',
                points: [
                  { u: start, v: z },
                  { u: end, v: z },
                ],
              },
              '#65442b',
              2.3,
            )
          }
        }
      }
      if (drag?.panel && samePlane(drag.panel, p)) stroke(p, { face, points: drag.points }, '#2b4555', 2.4)
      if (p.fixture && socket?.interference) {
        const issue = socket.interference
        const highlight =
          issue === 'end'
            ? Math.abs(plane - (jointStart + socket.depth)) < 0.01
            : issue === 'both' ||
              (issue === 'near'
                ? p.vertices.every((v) => v[2] <= W / 2)
                : p.vertices.every((v) => v[2] >= W / 2))
        if (highlight) {
          g.fillStyle = 'rgba(215,76,45,.44)'
          g.fillRect(0, 0, w, h)
        }
      }
      g.restore()
    }
    if (view.ghost && job && idealPanels.length) {
      g.save()
      g.lineJoin = 'round'
      g.lineWidth = 1.7
      g.setLineDash([6, 4])
      for (const panel of idealPanels
        .filter((p) => dot(normal(p), camera) > 0.002)
        .sort((a, b) => depth(a) - depth(b))) {
        path(panel.vertices.map(project))
        g.closePath()
        g.fillStyle = 'rgba(202,241,210,.15)'
        g.fill()
        g.strokeStyle = 'rgba(216,247,219,.9)'
        g.stroke()
      }
      g.restore()
    }
    if (toolCue) {
      const A = project(toolCue.a),
        B = project(toolCue.b),
        t = [0.25, 0.48, 0.38, 0.59][toolCue.step]
      if (Math.hypot(B[0] - A[0], B[1] - A[1]) > 3) {
        g.save()
        g.translate(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t)
        let angle = Math.atan2(B[1] - A[1], B[0] - A[0])
        if (Math.cos(angle) < 0) angle += Math.PI
        g.rotate(angle)
        g.shadowColor = 'rgba(35,25,14,.3)'
        g.shadowBlur = 3
        g.shadowOffsetY = 2
        if (toolCue.kind === 'saw') {
          path([
            [-9, -2],
            [-1, -13],
            [34, -8],
            [37, -2],
            [34, 1],
            [32, -1],
            [29, 1],
            [26, -1],
            [23, 1],
            [20, -1],
            [17, 1],
            [14, -1],
            [11, 1],
            [8, -1],
            [5, 1],
            [2, -1],
            [-1, 1],
          ])
          g.closePath()
          g.fillStyle = '#bec7c0'
          g.fill()
          path([
            [-19, -10],
            [-9, -12],
            [-4, -6],
            [-6, 0],
            [-11, 0],
            [-12, -5],
            [-19, -4],
          ])
        } else {
          path([
            [-14, -4],
            [8, -2],
            [14, 0],
            [8, 2],
            [-14, 1],
          ])
          g.closePath()
          g.fillStyle = '#c6cdc4'
          g.fill()
          path([
            [-28, -6],
            [-12, -5],
            [-12, 2],
            [-28, 3],
          ])
        }
        g.closePath()
        g.fillStyle = '#764e34'
        g.fill()
        g.restore()
      }
    }
    const span = scale * 10 <= w * 0.22 ? 10 : 5,
      x = 24,
      y = h - 23
    g.save()
    g.strokeStyle = '#c6cfb3'
    g.fillStyle = '#d6dfc9'
    g.lineWidth = 1.4
    g.beginPath()
    g.moveTo(x, y - 3)
    g.lineTo(x, y + 2)
    g.lineTo(x + span * scale, y + 2)
    g.lineTo(x + span * scale, y - 3)
    g.stroke()
    g.font = '11px system-ui,sans-serif'
    g.fillText(span + ' mm', x, y - 5)
    g.restore()
  }
  function hit(p: Panel, x: number, y: number): SurfacePoint | null {
    const face = p.face,
      origin = project(surface(p, { u: 0, v: 0 })),
      u = project(surface(p, { u: 1, v: 0 })),
      v = project(surface(p, { u: 0, v: 1 }))
    const ax = u[0] - origin[0],
      ay = u[1] - origin[1],
      bx = v[0] - origin[0],
      by = v[1] - origin[1],
      det = ax * by - ay * bx
    if (Math.abs(det) < 0.0001) return null
    const dx = x - origin[0],
      dy = y - origin[1],
      point = { u: (dx * by - dy * bx) / det, v: (dy * ax - dx * ay) / det },
      coords = p.vertices.map((q) => local(face, q))
    let positive = false,
      negative = false
    for (let i = 0; i < coords.length; i++) {
      const a = coords[i],
        b = coords[(i + 1) % coords.length],
        cross = (b.u - a.u) * (point.v - a.v) - (b.v - a.v) * (point.u - a.u)
      positive ||= cross > 1e-8
      negative ||= cross < -1e-8
    }
    if (positive && negative) return null
    return point.u >= Math.min(...coords.map((q) => q.u)) &&
      point.u <= Math.max(...coords.map((q) => q.u)) &&
      point.v >= Math.min(...coords.map((q) => q.v)) &&
      point.v <= Math.max(...coords.map((q) => q.v))
      ? point
      : null
  }
  function pick(x: number, y: number) {
    let closest: { panel: Panel; point: SurfacePoint; depth: number } | undefined
    for (const panel of panels) {
      const point = hit(panel, x, y)
      if (!point) continue
      const depth = dot(surface(panel, point), camera)
      if (!closest || closest.depth < depth) closest = { panel, point, depth }
    }
    return closest
  }
  function pointer(e: PointerEvent) {
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function down(e: PointerEvent) {
    if (drag || e.button !== 0) return
    const { x, y } = pointer(e),
      selection = pick(x, y),
      mark = view.mode === 'mark'
    if (mark && (!selection || selection.panel.fixture || selection.panel.outer === false)) return
    drag = {
      id: e.pointerId,
      x,
      y,
      panel: mark ? selection?.panel : undefined,
      points: mark && selection ? [selection.point] : [],
    }
    canvas.setPointerCapture(e.pointerId)
    e.preventDefault()
  }
  function sample(x: number, y: number) {
    const selected = pick(x, y)
    if (!drag?.panel || !selected || selected.panel.fixture || !samePlane(selected.panel, drag.panel))
      return false
    drag.points.push(selected.point)
    return true
  }
  function move(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return
    const { x, y } = pointer(e)
    if (drag.panel) {
      if (!sample(x, y)) {
        finish(e)
        return
      }
    } else {
      yaw += (x - drag.x) * 0.012
      pitch = clamp(pitch + (y - drag.y) * 0.012, -1.48, 1.48)
    }
    drag.x = x
    drag.y = y
    render()
  }
  function finish(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return
    const { x, y } = pointer(e)
    if (drag.panel && e.type === 'pointerup') sample(x, y)
    const old = drag
    drag = null
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    render()
    if (e.type !== 'pointercancel' && old.panel && old.points.length > 1)
      onStroke({ face: old.panel.face, points: old.points })
  }
  const observer = new ResizeObserver(render)
  observer.observe(canvas)
  const previousTouchAction = canvas.style.touchAction
  canvas.style.touchAction = 'none'
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', finish)
  canvas.addEventListener('pointercancel', finish)
  render()
  return {
    cancelGesture() {
      clearCue()
      if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id)
      drag = null
      render()
    },
    update(next) {
      if (
        next.job &&
        view.job &&
        !canvas.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        const prev = view.job
        const changed = Object.entries(next.job.cuts).find(([k, line]) => {
          const old = prev.cuts[k as keyof typeof prev.cuts]
          return !old || old.a.u !== line.a.u || old.b.u !== line.b.u
        })
        if (changed) {
          const [key, line] = changed,
            job = next.job
          const pos = (pt: SurfacePoint): Vec =>
            world(
              line.face,
              pt,
              line.face === 'end'
                ? endAt(job, pt.u)
                : line.face === 'top'
                  ? job.stock.height
                  : line.face === 'far'
                    ? job.stock.width
                    : 0,
            )
          clearCue()
          toolCue = {
            a: pos(line.a),
            b: pos(line.b),
            kind: prev.cuts[key as keyof typeof prev.cuts] ? 'pare' : 'saw',
            step: 0,
          }
          for (let step = 1; step <= 4; step++)
            cueTimers.push(
              setTimeout(() => {
                if (step === 4) clearCue()
                else if (toolCue) toolCue.step = step
                render()
              }, step * 95),
            )
        }
      }
      view = next
      render()
    },
    orient(face) {
      const poses: Record<WoodFace | 'iso', Pixel> = {
        iso: [0.56, 0.42],
        top: [0, Math.PI / 2],
        bottom: [0, -Math.PI / 2],
        near: [0, 0],
        far: [Math.PI, 0],
        end: [Math.PI / 2, 0],
        left: [-Math.PI / 2, 0],
      }
      ;[yaw, pitch] = poses[face]
      render()
    },
    destroy() {
      clearCue()
      observer.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', finish)
      canvas.removeEventListener('pointercancel', finish)
      if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id)
      drag = null
      canvas.style.touchAction = previousTouchAction
    },
  }
}
