import css from './style.css?inline'
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
  if (!d || d.version !== 2 || !TASKS.some(t => t.id === d.selected)) throw new Error('旧版手绘草稿不能冒充有限锯切，请保留旧档并另开练习。')
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
  const style = document.createElement('style'); style.textContent = css; shadow.append(style)
  const shell = document.createElement('section'); shell.className = 'shell'
  shell.innerHTML = `<header><div><div class="eyebrow">森林之家 / 木工房</div><h1>把一支榫，慢慢锯出来</h1></div><span class="stamp">直榫习作 · 02</span></header>
  <div class="layout"><section class="stage-panel">
    <div class="stage"><canvas aria-label="可旋转的立体木料，点击只选择工作面"></canvas></div>
    <div class="view-tools"><button data-a="iso">立体视角</button><button data-a="face">正对工作面</button><button data-a="depth-view">侧向看锯深</button></div>
    <div class="readout"><span id="face-label">尚未选择工作面</span><span id="cut-count">尚未下锯</span></div>
    <div class="message" id="message" role="status" aria-live="polite"></div>
    <details class="drawing"><summary>参考图纸 <span>毫米 · 仅供读图</span></summary><div class="drawings"></div></details>
  </section><aside class="controls">
    <section id="setup"><h2>定图选材</h2><label>可用方料<select id="stocks"></select></label><div class="dimensions"><label>总长<input name="length" type="number" min="8" step="1"></label><label>榫长<input name="tenonLength" type="number" min="2" step="1"></label><label>榫宽<input name="tenonWidth" type="number" min="2" step="1"></label></div><p id="stock-spec" class="hint"></p><button class="primary" data-a="start">选料开工</button></section>
    <section id="working" hidden>
      <nav class="tasks" aria-label="加工部位"></nav><p class="task-hint" id="task-hint"></p>
      <section class="control-step"><h2><b>1</b> 选择工作面</h2><div class="row"><select id="surface" aria-label="工作面"><option value="">点选木料或从这里选择</option></select><button data-a="suggest-face" title="选择工序建议的真实木面，不会下锯">建议面</button></div></section>
      <section class="control-step"><h2><b>2</b> 定位锯线 <small>量具辅助</small></h2><label class="row">测量基准<select id="reference"><option value="low">左基准端 A</option><option value="high">现有端面</option></select></label><div class="measure"><button data-step="offset:-1" aria-label="位置减零点一毫米">−</button><input id="offset-number" aria-label="距基准毫米" type="number" step="0.1"><span>mm</span><button data-step="offset:1" aria-label="位置加零点一毫米">＋</button></div><input id="offset-range" aria-label="锯线位置滑块" type="range" step="0.1"><label class="row">锯缝放在<select id="waste"><option value="1">标线右侧 · 废料侧</option><option value="-1">标线左侧 · 废料侧</option></select></label></section>
      <section class="control-step"><h2><b>3</b> 设置止锯深度 <button class="small" data-a="depth-view">看侧面 ↗</button></h2><div class="measure"><button data-step="depth:-1" aria-label="深度减零点一毫米">−</button><input id="depth-number" aria-label="锯入深度毫米" type="number" min="0.1" step="0.1"><span>mm</span><button data-step="depth:1" aria-label="深度加零点一毫米">＋</button></div><input id="depth-range" aria-label="锯入深度滑块" type="range" min="0.1" step="0.1"><div class="row short"><span id="depth-note" class="hint"></span><button data-a="through" class="small">到另一侧</button></div><details><summary>夹持与方向</summary><label>夹持<select id="fixture"><option value="auto">采用工序建议</option><option value="flat">平放</option><option value="end-up">端头朝上</option><option value="side-out">侧面朝外</option></select></label><p class="hint">锯片沿标线往复，箭头表示逐渐锯入的方向；本轮只开放正交直锯。</p></details></section>
      <div class="execute"><p id="cut-hint" class="hint"></p><button class="primary" data-a="cut">确认下锯</button></div>
      <div class="inspection"><button data-a="trial">检查 / 试配</button><strong id="score"></strong><div id="issues"></div><button data-a="repair" hidden>确认一次自动收尾</button><div class="finish-row" id="finish" hidden><label>面漆<select id="paint"></select></label><button data-a="finish" class="primary">收进作品匣</button></div></div>
      <details class="materials"><summary>材料去向 <span id="balance"></span></summary><p id="materials"></p><p class="hint">可用余段保留尺寸；小块与锯屑只记体积，不生成散落物，也不进入物理木料堆。</p></details>
      <button data-a="discard" class="quiet danger">放弃这根料</button>
    </section><section id="done" hidden><h2>这一件收好了</h2><p id="receipt"></p><button data-a="new" class="primary">再做一件</button></section>
  </aside></div><dialog><form method="dialog"><h2>放弃当前工件？</h2><p>已经下锯的木料不能恢复。合规格余段会保留，不发成品。</p><div class="row"><button value="cancel">继续加工</button><button value="discard" class="danger">确认弃料</button></div></form></dialog>`
  shadow.append(shell); container.append(mount)
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => shell.querySelector<T>(selector)!
  const input = (id: string) => $<HTMLInputElement>(`#${id}`)
  const select = (id: string) => $<HTMLSelectElement>(`#${id}`)
  const btn = (a: string) => $<HTMLButtonElement>(`[data-a="${a}"]`)
  const stocks = [...(options.stocks ?? [DEFAULT_STOCK])]
  for (const s of stocks) select('stocks').add(new Option(s.label ?? s.id, s.id))
  for (const t of TASKS) { const b = document.createElement('button'); b.dataset.task = t.id; b.textContent = t.name; $('.tasks').append(b) }
  for (const [name, color] of pigments) select('paint').add(new Option(name, color ?? ''))
  let lastPiece: Workpiece | null = null
  let showingInspection = false
  let design: Design = { ...DEFAULT_DESIGN }, job: Workpiece | null = null, selected: TaskId = 'trim', selectedSurface: string | null = null
  let layouts: FiniteSawDraft['layouts'] = {}, paint: string | null = null, paused = false, disposed = false, pending = false, completed = false, invalidInput = false
  let message = '先定尺寸，再在立体木料上选面。精准定位不需要徒手描线。', receipt = ''
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
    selectedSurface = id; showingInspection = false; message = '工作面已选中。设置位置和深度后，再明确下锯。'; emit(); render()
  })
  function current() {
    const p = scenePiece(), task = TASKS.find(t => t.id === selected)!, l = layout(p)
    const ss = surfaces(p.geometry.boxes), face = ss.find(s => s.id === selectedSurface)
    const extent = task.planeAxis === 0 ? bounds(p.geometry.boxes).max[0] : p.stock.width
    const sizes = [p.stock.length, p.stock.height, p.stock.width]
    const depthMax = face ? (face.sign === 1 ? face.plane : sizes[face.axis] - face.plane) : sizes[task.entryAxis]
    const op = operationFor(p, selected, l, selectedSurface)
    const compatible = face?.axis === task.entryAxis && face?.sign === task.entrySign
    const preview = !compatible ? { allowed: false, reason: '请选择这个部位的建议进锯面；点击只选面，不会切削。' } : sawProvider.preview(p, op)
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
    $('#cut-count').textContent = p.operations.length ? `已执行 ${p.operations.length} 次加工` : '尚未下锯'
    $('.drawings').innerHTML = blueprint(p.design, p.stock, selected)
    $('.tasks').querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.classList.toggle('active', b.dataset.task === selected); b.setAttribute('aria-pressed', String(b.dataset.task === selected)) })
    $('#task-hint').textContent = task.instruction
    const s = select('surface')
    s.replaceChildren(new Option('点选木料或从这里选择', ''))
    for (const f of ss) s.add(new Option(surfaceName(f, p) + ` · ${f.plane.toFixed(1)}`, f.id))
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
    $('#depth-note').textContent = priorDepth ? `原锯缝已深 ${priorDepth.toFixed(1)} mm，续锯只会加深。` : '从入口向木料内部测量，不是动画进度。'
    $('#cut-hint').textContent = invalidInput ? '请输入范围内的有效数值。' : preview.reason
    btn('cut').textContent = priorDepth ? '沿原锯缝继续锯' : '确认下锯'
    btn('cut').disabled = !job || !preview.allowed || invalidInput || pending || paused || job.repaired || options.tools?.saw === false
    $('#score').textContent = checked ? (report.status === 'incomplete' ? '尚未成形' : `工艺 ${report.score} 分`) : ''
    $('#issues').replaceChildren()
    if (checked) {
      const lines = report.issues.length ? report.issues : ['试配合格，可以收件。']
      for (const text of lines) { const el = document.createElement('p'); el.textContent = text; $('#issues').append(el) }
    }
    btn('repair').hidden = !(checked && report.status === 'repairable')
    btn('repair').textContent = `自动收尾一次 → 预计 ${report.repairedScore ?? '—'} 分`
    btn('repair').disabled = pending || options.tools?.autoFinish === false || (options.tools?.autoFinish === undefined && options.tools?.chisel === false)
    $('#finish').hidden = !(checked && report.status === 'pass'); select('paint').value = paint ?? ''; select('paint').disabled = options.tools?.brush === false
    btn('finish').disabled = pending; btn('discard').disabled = pending; btn('trial').disabled = pending
    const balance = materialBalance(p)
    $('#balance').textContent = `${(balance.retainedMm3 / 1000).toFixed(2)} cm³ 在制`
    $('#materials').textContent = `原料 ${(balance.stockMm3 / 1000).toFixed(2)} cm³；在制 ${(balance.retainedMm3 / 1000).toFixed(2)}；已脱离 ${(balance.offcutsMm3 / 1000).toFixed(2)}；锯屑 ${(balance.sawdustMm3 / 1000).toFixed(2)}；收尾薄屑 ${(balance.shavingsMm3 / 1000).toFixed(2)}。可用余段 ${p.ledger.offcuts.filter(o => o.kind === 'reusable').length} 件。`
    viewport.update({ piece: p, selectedSurface, operation: job && !checked ? op : undefined, preview: job && !checked ? preview : undefined, conflictSurfaces: checked ? report.conflictSurfaces : [], paint, setup: !job, socket: checked && report.metrics ? { fits: report.status === 'pass', width: p.design.tenonWidth, depth: p.design.tenonLength } : undefined })
    shell.inert = paused || pending
  }
  function editMeasure(which: 'offset' | 'depth', n: number) {
    if (!job) return
    const c = current(), max = which === 'depth' ? c.depthMax : c.extent
    if (!Number.isFinite(n) || n < (which === 'depth' ? .1 : 0) || n > max + EPS) { invalidInput = true; render(); return }
    invalidInput = false
    if (which === 'depth') c.l.depth = round(n)
    else c.l.position = round(c.l.reference === 'low' ? n : c.extent - n)
    showingInspection = false; message = '虚线为本次设定，尚未切削。'; emit(); render()
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
        if (target.id === 'surface') { selectedSurface = target.value || null; viewport.update({ piece: job, selectedSurface }); viewport.orient('face', selectedSurface) }
        if (target.id === 'reference') l.reference = target.value as Layout['reference']
        if (target.id === 'waste') l.wasteSide = Number(target.value) as Sign
        if (target.id === 'fixture') l.fixture = target.value as Layout['fixture']
        if (target.id === 'paint') paint = target.value || null
        emit()
      }
      render()
    } catch (e) { setMessage(e); render() }
  })
  const dialog = $<HTMLDialogElement>('dialog')
  async function discard() {
    if (!job) return
    const held = getDraft()!
    pending = true; render()
    try { if (job.operations.length) await options.onDiscard?.(held); if (disposed) return; job = null; selectedSurface = null; layouts = {}; completed = true; receipt = '当前工件已放弃。合规格余段由宿主保留。'; options.onDraftChange?.(null) }
    catch (e) { setMessage(e) } finally { pending = false; render() }
  }
  dialog.addEventListener('close', () => { if (dialog.returnValue === 'discard' && !paused && !pending) void discard() })
  shell.addEventListener('click', async event => {
    if (paused || pending || disposed) return
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
    if (!target || target.disabled) return
    try {
      if (target.dataset.task && job) { showingInspection = false; selected = target.dataset.task as TaskId; selectedSurface = null; invalidInput = false; message = '选择这个部位的进锯面，再设置锯线与止点。'; emit(); render(); return }
      if (target.dataset.step && job) { const [key, sign] = target.dataset.step.split(':'); const value = Number(input(`${key}-number`).value); editMeasure(key as 'offset' | 'depth', round(value + Number(sign) * .1)); return }
      switch (target.dataset.a) {
        case 'start': lastPiece = null; showingInspection = false; job = createPiece(design, stock()); layouts = {}; selected = 'trim'; selectedSurface = null; message = '点选顶面开始截端；也可用“建议面”准确选中。'; emit(); break
        case 'suggest-face': if (job) { showingInspection = false; selectedSurface = recommendedSurface(job, selected); message = '建议工作面已高亮，尚未下锯。'; emit(); render(); viewport.orient('face', selectedSurface) } return
        case 'face': viewport.orient('face', selectedSurface); return
        case 'depth-view': viewport.orient('depth', selectedSurface); return
        case 'iso': viewport.orient('iso'); return
        case 'through': if (job) editMeasure('depth', current().depthMax); return
        case 'cut': if (job) {
          const c = current(), before = job.ledger.offcuts.length
          if (!c.preview.allowed) throw new Error(c.preview.reason)
          job = executeSaw(job, c.op)
          const detached = job.ledger.offcuts.length - before
          message = detached ? `锯缝已接通，${detached} 块废料脱离。` : '留下了有限锯缝；废料仍相连，可继续加深或从另一面锯接。'
          emit()
        } break
        case 'trial': if (job) { showingInspection = true; job = inspectPiece(job); message = '按实际接触与几何检查，不按按钮完成数评分。'; emit(); render(); viewport.orient('iso') } return
        case 'repair': if (job) { showingInspection = true; job = inspectPiece(repairTenon(job)); message = '已做一次减材收尾；几何已更新，收尾成本计入工艺分。'; emit() } break
        case 'finish': if (job) {
          const held = getDraft()!, result = finishTenon(job, paint); pending = true; render()
          try {
            const response = await options.onComplete?.(result, job.stock.id, held)
            if (disposed) return
            receipt = [`工艺 ${result.score} 分`, response?.rarityLabel, ...(response?.traits ?? [])].filter(Boolean).join(' · ')
            lastPiece = job; completed = true; job = null; options.onDraftChange?.(null); message = '成品已收好，材料只结算一次。'
          } finally { pending = false }
        } break
        case 'discard': if (job?.operations.length) dialog.showModal(); else await discard(); return
        case 'new': if (options.onNew) { options.onNew(); return } completed = false; job = null; lastPiece = null; showingInspection = false; layouts = {}; selectedSurface = null; message = '开始下一根方料。'; break
      }
    } catch (e) { setMessage(e); pending = false }
    render()
  })
  render()
  return { getDraft, setPaused(value) { if (disposed) return; paused = value; viewport.cancelGesture(); if (dialog.open) dialog.close('cancel'); render() }, destroy() { disposed = true; viewport.destroy(); mount.remove() } }
}
