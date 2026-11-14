import css from './style.css?inline'
import timberCss from '../../../src/ui/timber/theme.css?inline'
import { mountWoodworkingTimber } from './timber-adapter.ts'
import { blueprint } from './blueprint.ts'
import { DEFAULT_DESIGN, DEFAULT_STOCK } from './domain.ts'
import type { CutId, Design, FinishedWork, Job, Stock } from './domain.ts'
import { createPiece, executeSaw, materialBalance, sawProvider } from './machining.ts'
import type { Workpiece } from './machining.ts'
import { bounds, EPS, surfaces } from './solid.ts'
import type { Sign } from './solid.ts'
import { defaultLayout, finishTenon, inspectPiece, inspectTenon, operationFor, recommendedSurface, repairTenon, restorePiece, TASKS } from './tenon.ts'
import type { Layout, TaskId } from './tenon.ts'
import { createWorkbenchViewport, surfaceName } from './viewport.ts'
export interface LegacyWoodworkingDraft { version: 1; job: Job; selected: CutId; paint: string | null; tested: boolean }
export interface FiniteSawDraft {
  version: 2
  job: Workpiece
  selected: TaskId
  selectedSurface: string | null
  layouts: Partial<Record<TaskId, Layout>>
  paint: string | null
}
export type WoodworkingDraft = LegacyWoodworkingDraft | FiniteSawDraft
export interface WoodworkingReceipt { rarityLabel?: string; traits?: readonly string[] }
export interface WoodworkingOptions {
  stocks?: readonly Stock[]
  draft?: WoodworkingDraft | null
  tools?: { saw?: boolean; autoFinish?: boolean; chisel?: boolean; brush?: boolean; straightedge?: boolean }
  lockedStraightedgeHint?: string
  ghostEligible?: boolean
  onNew?: () => void
  onDraftChange?: (draft: WoodworkingDraft | null) => void
  onDiscard?: (draft: WoodworkingDraft) => void | Promise<void>
  onComplete?: (item: FinishedWork, stockId: string, draft: WoodworkingDraft) => void | WoodworkingReceipt | Promise<void | WoodworkingReceipt>
}
export interface WoodworkingMount { destroy(): void; getDraft(): WoodworkingDraft | null; setPaused(paused: boolean): void }
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const round = (v: number) => Math.round(v * 10) / 10
const pigments: [string, string | null][] = [['原木', null], ['松绿', '#476b53'], ['赭红', '#974f37'], ['靛蓝', '#465d79']]
export function restoreDraft(raw: unknown): FiniteSawDraft {
  const d = raw as FiniteSawDraft
  if (!d || d.version !== 2 || !TASKS.some(t => t.id === d.selected)) throw new Error('这件旧习作暂不能继续，请另开一件。')
  const job = restorePiece(d.job), layouts: FiniteSawDraft['layouts'] = {}
  for (const task of TASKS) {
    const l = d.layouts?.[task.id]
    if (!l) continue
    if (![l.position, l.depth].every(Number.isFinite) || ![-1, 1].includes(l.wasteSide) || !['low', 'high'].includes(l.reference) || !['auto', 'flat', 'end-up', 'side-out'].includes(l.fixture)) throw new Error('放样数据无效')
    layouts[task.id] = { ...l }
  }
  const selectedSurface = surfaces(job.geometry.boxes).some(s => s.id === d.selectedSurface) ? d.selectedSurface : null
  if (d.paint !== null && !/^#[0-9a-f]{6}$/i.test(d.paint)) throw new Error('面漆数据无效')
  return { version: 2, job, layouts, selected: d.selected, selectedSurface, paint: d.paint }
}
export function mountWoodworking(container: HTMLElement, options: WoodworkingOptions = {}): WoodworkingMount {
  const mount = document.createElement('div'), shadow = mount.attachShadow({ mode: 'open' })
  const style = document.createElement('style'); style.textContent = css + '\n' + timberCss; shadow.append(style)
  const shell = document.createElement('section'); shell.className = 'shell'
  shell.innerHTML = `<header class="workshop-hud" data-ui-grid="hud"><div class="title-plaque"><span class="eyebrow">森林之家</span><h1>木作台</h1></div><div class="message" id="message" role="status" aria-live="polite" data-ui-grid="notice"></div><span class="stamp">直榫习作</span></header>
  <div class="layout" data-ui-grid="content"><section class="stage-panel">
    <div class="stage"><canvas tabindex="0" aria-label="木作台：拖动翻看木料，点击选择木面；加工使用按钮"></canvas></div>
    <div class="stage-readout"><span id="face-label">选择木面</span><span id="cut-count"></span></div>
    <div class="view-tools" aria-label="观察木料" data-ui-grid="hud">
      <div class="orbit-pad"><button data-a="turn-up" data-how-camera aria-label="向上翻看" title="向上翻看">↑</button><button data-a="turn-left" data-how-camera aria-label="向左转动" title="向左转动">←</button><button data-a="iso" data-how-camera aria-label="复位角度" title="复位角度，不改变大小">◈</button><button data-a="turn-right" data-how-camera aria-label="向右转动" title="向右转动">→</button><button data-a="turn-down" data-how-camera aria-label="向下翻看" title="向下翻看">↓</button></div>
      <div class="view-presets"><button data-a="face" data-how-camera title="正对选中的木面">正面</button><button data-a="depth-view" data-how-camera title="从侧面查看锯入深度">侧看</button><button data-a="zoom-in" data-how-camera aria-label="放大木料">＋</button><button data-a="zoom-out" data-how-camera aria-label="缩小木料">−</button></div>
    </div>
    <nav class="tool-dock" aria-label="手工工具" data-ui-grid="row">
      <button data-a="measure-tool" title="用量具定位锯线"><svg viewBox="0 0 48 38" aria-hidden="true"><path d="M6 3H15V25H43V34H6Z" fill="#bec9b2"/><path d="M9 7H15M9 13H15M9 19H15M21 25V31M28 25V31M35 25V31" stroke="#4d6151" stroke-width="2"/></svg><span>量具</span></button>
      <button data-a="saw-tool" title="设置锯深与下锯"><svg viewBox="0 0 56 38" aria-hidden="true"><path d="M17 9L53 12V23L48 21L45 24L42 22L39 25L36 23L33 26L30 24L27 27L24 25L18 27Z" fill="#c2cbc4"/><path fill-rule="evenodd" d="M5 7Q2 11 3 27Q4 33 11 33Q20 30 21 17L20 7Q14 2 5 7ZM8 11Q5 20 8 28L12 27L16 12Z" fill="#bf8a51"/></svg><span>手锯</span></button>
      <button data-a="paper" title="查看图纸"><svg viewBox="0 0 48 38" aria-hidden="true"><path d="M10 4H36L34 33H8Z" fill="#ecdcad"/><path d="M14 11H30V25H14ZM19 11V25M14 18H30" fill="none" stroke="#937951" stroke-width="2"/></svg><span>图纸</span></button>
      <button data-a="trial" title="检查尺寸与试配"><svg viewBox="0 0 48 38" aria-hidden="true"><path d="M7 8H22V17H31V24H22V31H7Z" fill="#d3a66a"/><path d="M31 7H42V32H31V26H36V15H31Z" fill="#8b6745"/></svg><span>试配</span></button>
    </nav>
  </section><aside class="controls" data-ui-grid="window">
    <div class="card-content" data-ui-grid="content">
    <section id="setup"><p class="eyebrow">选料开工</p><h2>做一支直榫</h2><label>方料<select id="stocks"></select></label><div class="dimensions"><label>总长<input name="length" type="number" min="8" step="1"></label><label>榫长<input name="tenonLength" type="number" min="2" step="1"></label><label>榫宽<input name="tenonWidth" type="number" min="2" step="1"></label></div><p id="stock-spec" class="hint"></p><button class="primary" data-a="start">放上工作台</button></section>
    <section id="working" hidden>
      <nav class="tasks" aria-label="加工部位" data-ui-grid="row"></nav><p class="task-hint" id="task-hint"></p>
      <nav class="steps" aria-label="当前操作" data-ui-grid="row"><button data-stage="face">选面</button><button data-stage="line">定线</button><button data-stage="depth">锯深</button></nav>
      <div class="operation-inputs">
      <section class="control-step" data-section="face"><h2>从哪一面下锯？</h2><label>工作面<select id="surface" aria-label="工作面"><option value="">选择木面</option></select></label><button data-a="suggest-face">选择建议面</button><p class="hint">点木料也能选面。</p><button class="primary" data-a="next-line">定锯线 →</button></section>
      <section class="control-step" data-section="line" hidden><h2>锯线位置</h2><label>从哪里量<select id="reference"><option value="low">基准端 A</option><option value="high">现有端面</option></select></label><div class="measure" data-ui-grid="row"><button data-step="offset:-1" aria-label="位置减零点一毫米">−</button><input id="offset-number" aria-label="距基准毫米" type="number" step="0.1"><span>mm</span><button data-step="offset:1" aria-label="位置加零点一毫米">＋</button></div><input id="offset-range" aria-label="锯线位置滑块" type="range" step="0.1"><label>锯缝落在<select id="waste"><option value="1">标线右侧</option><option value="-1">标线左侧</option></select></label><button class="primary" data-a="next-depth">设锯深 →</button></section>
      <section class="control-step" data-section="depth" hidden><h2>锯到哪里停？</h2><div class="measure" data-ui-grid="row"><button data-step="depth:-1" aria-label="深度减零点一毫米">−</button><input id="depth-number" aria-label="锯入深度毫米" type="number" min="0.1" step="0.1"><span>mm</span><button data-step="depth:1" aria-label="深度加零点一毫米">＋</button></div><input id="depth-range" aria-label="锯入深度滑块" type="range" min="0.1" step="0.1"><div class="row"><p id="depth-note" class="hint"></p><button data-a="through">锯穿</button></div><details><summary>夹持</summary><label class="sr-only" for="fixture">夹持方式</label><select id="fixture"><option value="auto">采用建议</option><option value="flat">平放</option><option value="end-up">端头朝上</option><option value="side-out">侧面朝外</option></select></details><div class="execute"><p id="cut-hint" class="hint"></p><button class="primary" data-a="cut">下锯</button></div></section>
      </div>
      <section class="inspection" hidden><h2>试配结果 <strong id="score"></strong></h2><div id="issues"></div><button data-a="repair" hidden>收尾修整一次</button><div class="finish-row" id="finish" hidden><label>面漆<select id="paint"></select></label><button data-a="finish" class="primary">收好成品</button></div><button data-a="back-work">返回加工</button></section>
      <details class="materials"><summary>余料 <span id="balance"></span></summary><p id="materials"></p></details>
      <button data-a="discard" class="quiet danger">放弃这根料</button>
    </section><section id="done" hidden><p class="eyebrow">完成</p><h2>这一件收好了</h2><p id="receipt"></p><button data-a="new" class="primary">再做一件</button></section>
    </div>
  </aside></div>
  <dialog class="drawing" id="paper-dialog"><div class="paper-heading" data-ui-grid="row"><h2>直榫图纸</h2><button data-a="close-paper" aria-label="收起图纸">×</button></div><div class="drawings"></div><p class="hint">尺寸单位：毫米</p></dialog>
  <dialog id="discard-dialog"><form method="dialog"><h2>放弃这根料？</h2><p>锯过的木头不能恢复。可用余段会保留。</p><div class="row"><button value="cancel">继续加工</button><button value="discard" class="danger">确认弃料</button></div></form></dialog>`
  shadow.append(shell); container.append(mount)
  const timber = mountWoodworkingTimber(shell, shadow)
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => shell.querySelector<T>(selector)!
  const input = (id: string) => $<HTMLInputElement>(`#${id}`)
  const select = (id: string) => $<HTMLSelectElement>(`#${id}`)
  const btn = (a: string) => $<HTMLButtonElement>(`[data-a="${a}"]`)
  const stocks = [...(options.stocks ?? [DEFAULT_STOCK])]
  for (const s of stocks) select('stocks').add(new Option(s.label ?? s.id, s.id))
  for (const t of TASKS) { const b = document.createElement('button'); b.dataset.task = t.id; b.textContent = ({trim:'截端',cheekNear:'近颊',cheekFar:'远颊',shoulderNear:'近肩',shoulderFar:'远肩'} as const)[t.id]; b.setAttribute('aria-label',t.name); $('.tasks').append(b) }
  for (const [name, color] of pigments) select('paint').add(new Option(name, color ?? ''))
  let lastPiece: Workpiece | null = null
  let stage: 'face' | 'line' | 'depth' = 'face'
  let showingInspection = false
  let design: Design = { ...DEFAULT_DESIGN }, job: Workpiece | null = null, selected: TaskId = 'trim', selectedSurface: string | null = null
  let layouts: FiniteSawDraft['layouts'] = {}, paint: string | null = null, paused = false, disposed = false, pending = false, completed = false, invalidInput = false
  let message = '选好方料，放上工作台。', receipt = ''
  if (options.draft) {
    try { const d = restoreDraft(options.draft); ({ job, selected, selectedSurface, layouts, paint } = d); showingInspection = job.inspectedAt === job.operations.length; design = { ...job.design }; select('stocks').value = job.stock.id }
    catch (e) { message = e instanceof Error ? e.message : '草稿不能继续'; }
  }
  for (const k of ['length', 'tenonLength', 'tenonWidth'] as const) $<HTMLInputElement>(`[name="${k}"]`).value = String(design[k])
  function stock() { return stocks.find(s => s.id === select('stocks').value) ?? DEFAULT_STOCK }
  function scenePiece(): Workpiece { return job ?? lastPiece ?? createPiece(design, stock()) }
  function layout(p: Workpiece) { return layouts[selected] ??= defaultLayout(p, selected) }
  function getDraft(): FiniteSawDraft | null { return job ? structuredClone({ version: 2, job, selected, selectedSurface, layouts, paint }) : null }
  function emit() { options.onDraftChange?.(getDraft()) }
  function setMessage(e: unknown) { message = e instanceof Error ? e.message : String(e) }
  const viewport = createWorkbenchViewport($<HTMLCanvasElement>('canvas'), id => {
    if (!job || paused || pending || disposed) return
    selectedSurface = id; showingInspection = false; message = '木面已选好。'; emit(); render()
  })
  function current() {
    const p = scenePiece(), task = TASKS.find(t => t.id === selected)!, l = layout(p)
    const ss = surfaces(p.geometry.boxes), face = ss.find(s => s.id === selectedSurface)
    const extent = task.planeAxis === 0 ? bounds(p.geometry.boxes).max[0] : p.stock.width
    const sizes = [p.stock.length, p.stock.height, p.stock.width]
    const depthMax = face ? (face.sign === 1 ? face.plane : sizes[face.axis] - face.plane) : sizes[task.entryAxis]
    const op = operationFor(p, selected, l, selectedSurface)
    const compatible = face?.axis === task.entryAxis && face?.sign === task.entrySign
    const preview = !compatible ? { allowed: false, reason: '先选合适的进锯面。' } : sawProvider.preview(p, op)
    return { p, task, l, face, ss, extent, depthMax, op, preview }
  }
  function render() {
    if (disposed) return
    let c: ReturnType<typeof current>
    try { c = current() } catch (e) { setMessage(e); $('#message').textContent = message; btn('start').disabled = true; return }
    const { p, task, l, face, ss, extent, depthMax, op, preview } = c
    if (selectedSurface && !face) selectedSurface = null
    const report = inspectTenon(p), checked = showingInspection && p.inspectedAt === p.operations.length
    $('#setup').hidden = !!job || completed; $('#working').hidden = !job || completed; $('#done').hidden = !completed
    $('#receipt').textContent = receipt
    btn('start').disabled = !stocks.length || invalidInput || pending
    $('#stock-spec').textContent = `${stock().length} × ${stock().width} × ${stock().height} mm · ${stocks.length ? '已备好的方料' : '当前没有可用方料'}`
    $('#message').textContent = message
    $('#face-label').textContent = face ? surfaceName(face, p) : '尚未选择工作面'
    $('#cut-count').textContent = job ? `${p.stock.length} × ${p.stock.width} × ${p.stock.height} mm` : ''
    $('.drawings').innerHTML = blueprint(p.design, p.stock, selected)
    $('.tasks').querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.classList.toggle('active', b.dataset.task === selected); b.setAttribute('aria-pressed', String(b.dataset.task === selected)) })
    $('#task-hint').textContent = ({ trim: '截齐端头', cheekNear: '沿木纹锯近侧榫颊', cheekFar: '沿木纹锯远侧榫颊', shoulderNear: '锯开近侧榫肩', shoulderFar: '锯开远侧榫肩' })[selected]
    $('.operation-inputs').hidden = checked
    $('.steps').hidden = checked
    $('.inspection').hidden = !checked
    shell.querySelectorAll<HTMLElement>('[data-section]').forEach(el => el.hidden = el.dataset.section !== stage)
    shell.querySelectorAll<HTMLElement>('[data-stage]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.stage === stage && !checked)))
    btn('next-line').disabled = !face
    btn('next-depth').disabled = !face || invalidInput
    btn('measure-tool').disabled = !job
    btn('saw-tool').disabled = !job
    btn('measure-tool').setAttribute('aria-pressed', String(!!job && stage === 'line' && !checked))
    btn('saw-tool').setAttribute('aria-pressed', String(!!job && stage !== 'line' && !checked))
    btn('trial').setAttribute('aria-pressed', String(checked))
    const s = select('surface')
    s.replaceChildren(new Option('点选木料或从这里选择', ''))
    for (const f of ss) s.add(new Option(surfaceName(f, p), f.id))
    s.value = selectedSurface ?? ''
    select('reference').options[0].text = task.planeAxis === 0 ? '左基准端 A' : '近侧基准 B'
    select('reference').options[1].text = task.planeAxis === 0 ? '现有端面' : '远侧边'
    select('reference').value = l.reference
    const offset = round(l.reference === 'low' ? l.position : extent - l.position)
    for (const id of ['offset-number', 'offset-range']) { const i = input(id); i.min = '0'; i.max = String(extent); if (!invalidInput || shadow.activeElement !== i) i.value = String(offset) }
    for (const id of ['depth-number', 'depth-range']) { const i = input(id); i.max = String(depthMax); if (!invalidInput || shadow.activeElement !== i) i.value = String(l.depth) }
    select('waste').options[0].text = task.planeAxis === 0 ? '标线右侧（朝端头）' : '标线远侧'
    select('waste').options[1].text = task.planeAxis === 0 ? '标线左侧（朝基准端）' : '标线近侧'
    select('waste').value = String(l.wasteSide); select('fixture').value = l.fixture
    const previous = p.operations.filter(o => o.kind === 'saw.sweep' && o.entrySurface === op.entrySurface && o.planeAxis === op.planeAxis && Math.abs(o.position - op.position) < EPS && o.wasteSide === op.wasteSide)
    const priorDepth = Math.max(0, ...previous.map(o => o.kind === 'saw.sweep' ? o.depth : 0))
    $('#depth-note').textContent = priorDepth ? `已锯 ${priorDepth.toFixed(1)} mm` : '从选中的木面量起。'
    $('#cut-hint').textContent = invalidInput ? '请检查数值。' : preview.allowed ? '确认后下锯。' : selectedSurface ? '当前木面无法这样下锯。' : '先选一个木面。'
    btn('cut').textContent = priorDepth ? '继续锯' : '下锯'
    btn('cut').disabled = !job || !preview.allowed || invalidInput || pending || paused || job.repaired || options.tools?.saw === false
    $('#score').textContent = checked ? (report.status === 'incomplete' ? '尚未成形' : `工艺 ${report.score} 分`) : ''
    $('#issues').replaceChildren()
    if (checked) {
      const lines = report.issues.length ? report.issues : ['试配合格，可以收件。']
      for (const text of lines) { const el = document.createElement('p'); el.textContent = text; $('#issues').append(el) }
    }
    btn('repair').hidden = !(checked && report.status === 'repairable')
    btn('repair').textContent = `收尾修整 · ${report.repairedScore ?? '—'} 分`
    btn('repair').disabled = pending || options.tools?.autoFinish === false || (options.tools?.autoFinish === undefined && options.tools?.chisel === false)
    $('#finish').hidden = !(checked && report.status === 'pass'); select('paint').value = paint ?? ''; select('paint').disabled = options.tools?.brush === false
    btn('finish').disabled = pending; btn('discard').disabled = pending; btn('trial').disabled = pending || !job
    const balance = materialBalance(p)
    $('#balance').textContent = `${(balance.retainedMm3 / 1000).toFixed(2)} cm³ 在制`
    $('#materials').textContent = `原料 ${(balance.stockMm3 / 1000).toFixed(2)} cm³；在制 ${(balance.retainedMm3 / 1000).toFixed(2)}；已脱离 ${(balance.offcutsMm3 / 1000).toFixed(2)}；锯屑 ${(balance.sawdustMm3 / 1000).toFixed(2)}；收尾薄屑 ${(balance.shavingsMm3 / 1000).toFixed(2)}。可用余段 ${p.ledger.offcuts.filter(o => o.kind === 'reusable').length} 件。`
    viewport.update({ piece: p, selectedSurface, operation: job && !checked ? op : undefined, preview: job && !checked ? preview : undefined, conflictSurfaces: checked ? report.conflictSurfaces : [], paint, setup: !job, socket: checked && report.metrics ? { fits: report.status === 'pass', width: p.design.tenonWidth, depth: p.design.tenonLength } : undefined })
    shell.inert = paused || pending
    shell.setAttribute('aria-busy', String(pending))
    timber.refresh()
  }
  function editMeasure(which: 'offset' | 'depth', n: number) {
    if (!job) return
    const c = current(), max = which === 'depth' ? c.depthMax : c.extent
    if (!Number.isFinite(n) || n < (which === 'depth' ? .1 : 0) || n > max + EPS) { invalidInput = true; render(); return }
    invalidInput = false
    if (which === 'depth') c.l.depth = round(n)
    else c.l.position = round(c.l.reference === 'low' ? n : c.extent - n)
    showingInspection = false; message = which === 'depth' ? '止点已更新。' : '锯线已更新。'; emit(); render()
  }
  shell.addEventListener('input', event => {
    if (paused || pending || disposed) return
    const target = event.target as HTMLInputElement
    if (target.id.startsWith('offset-')) editMeasure('offset', target.value === '' ? NaN : Number(target.value))
    else if (target.id.startsWith('depth-')) editMeasure('depth', target.value === '' ? NaN : Number(target.value))
    else if (['length', 'tenonLength', 'tenonWidth'].includes(target.name)) {
      const candidate = { ...design, [target.name]: Number(target.value) }
      try { createPiece(candidate, stock()); design = candidate; invalidInput = false; message = '图纸尺寸已更新。'; render() } catch (e) { invalidInput = true; setMessage(e); $('#message').textContent = message; btn('start').disabled = true }
    }
  })
  shell.addEventListener('change', event => {
    if (paused || pending || disposed) return
    const target = event.target as HTMLSelectElement
    try {
      if (target.id === 'stocks') { invalidInput = false; layouts = {}; message = '已换方料，请确认图纸放得下。' }
      else if (job) {
        if (target.id !== 'paint') showingInspection = false
        const l = layout(job)
        if (target.id === 'surface') { selectedSurface = target.value || null; viewport.update({ piece: job, selectedSurface }) }
        if (target.id === 'reference') l.reference = target.value as Layout['reference']
        if (target.id === 'waste') l.wasteSide = Number(target.value) as Sign
        if (target.id === 'fixture') l.fixture = target.value as Layout['fixture']
        if (target.id === 'paint') paint = target.value || null
        emit()
      }
      render()
    } catch (e) { setMessage(e); render() }
  })
  const dialog = $<HTMLDialogElement>('#discard-dialog')
  const paper = $<HTMLDialogElement>('#paper-dialog')
  paper.addEventListener('close', () => btn('paper').focus())
  async function discard() {
    if (!job) return
    const held = getDraft()!
    pending = true; render()
    try { if (job.operations.length) await options.onDiscard?.(held); if (disposed) return; job = null; selectedSurface = null; layouts = {}; completed = true; receipt = '这根料已放弃，可用余段已保留。'; options.onDraftChange?.(null) }
    catch (e) { setMessage(e) } finally { pending = false; render() }
  }
  dialog.addEventListener('close', () => { if (dialog.returnValue === 'discard' && !paused && !pending) void discard() })
  shell.addEventListener('click', async event => {
    if (paused || pending || disposed) return
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
    if (!target || target.disabled) return
    try {
      if (target.dataset.stage && job) { stage = target.dataset.stage as typeof stage; showingInspection = false; render(); return }
      if (target.dataset.task && job) { stage = 'face'; showingInspection = false; selected = target.dataset.task as TaskId; selectedSurface = null; invalidInput = false; message = '选择进锯面。'; emit(); render(); return }
      if (target.dataset.step && job) { const [key, sign] = target.dataset.step.split(':'); const value = Number(input(`${key}-number`).value); editMeasure(key as 'offset' | 'depth', round(value + Number(sign) * .1)); return }
      switch (target.dataset.a) {
        case 'start': stage = 'face'; lastPiece = null; showingInspection = false; job = createPiece(design, stock()); layouts = {}; selected = 'trim'; selectedSurface = null; message = '选择顶面，准备截端。'; emit(); break
        case 'suggest-face': if (job) { showingInspection = false; selectedSurface = recommendedSurface(job, selected); message = '建议面已选好。'; emit(); render() } return
        case 'next-line': case 'measure-tool': if (job) { stage = 'line'; showingInspection = false; render() } return
        case 'next-depth': case 'saw-tool': if (job) { stage = 'depth'; showingInspection = false; render() } return
        case 'paper': paper.showModal(); btn('close-paper').focus(); return
        case 'close-paper': paper.close(); return
        case 'back-work': showingInspection = false; render(); return
        case 'turn-up': case 'turn-down': case 'turn-left': case 'turn-right': viewport.turn(target.dataset.a.slice(5) as 'up'|'down'|'left'|'right'); return
        case 'zoom-in': viewport.zoom(1.12); return
        case 'zoom-out': viewport.zoom(1/1.12); return
        case 'face': viewport.orient('face', selectedSurface); return
        case 'depth-view': viewport.orient('depth', selectedSurface); return
        case 'iso': viewport.orient('iso'); return
        case 'through': if (job) editMeasure('depth', current().depthMax); return
        case 'cut': if (job) {
          const c = current(), before = job.ledger.offcuts.length
          if (!c.preview.allowed) throw new Error(c.preview.reason)
          job = executeSaw(job, c.op)
          const detached = job.ledger.offcuts.length - before
          message = detached ? `锯缝已接通，${detached} 块废料脱离。` : '锯口还未接通。'
          emit()
        } break
        case 'trial': if (job) { showingInspection = true; job = inspectPiece(job); message = '试配后再决定是否修整。'; emit(); render() } return
        case 'repair': if (job) { showingInspection = true; job = inspectPiece(repairTenon(job)); message = '收尾完成。'; emit() } break
        case 'finish': if (job) {
          const held = getDraft()!, result = finishTenon(job, paint); pending = true; render()
          try {
            const response = await options.onComplete?.(result, job.stock.id, held)
            if (disposed) return
            receipt = [`工艺 ${result.score} 分`, response?.rarityLabel, ...(response?.traits ?? [])].filter(Boolean).join(' · ')
            lastPiece = job; completed = true; job = null; options.onDraftChange?.(null); message = '成品已收好。'
          } finally { pending = false }
        } break
        case 'discard': if (job?.operations.length) dialog.showModal(); else await discard(); return
        case 'new': if (options.onNew) { options.onNew(); return } completed = false; job = null; lastPiece = null; showingInspection = false; layouts = {}; selectedSurface = null; message = '开始下一根方料。'; break
      }
    } catch (e) { setMessage(e); pending = false }
    render()
  })
  render()
  return { getDraft, setPaused(value) { if (disposed) return; paused = value; viewport.setPaused(value); if (paper.open) paper.close(); if (dialog.open) dialog.close('cancel'); render() }, destroy() { disposed = true; viewport.destroy(); timber.dispose(); mount.remove() } }
}
