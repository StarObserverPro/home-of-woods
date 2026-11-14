import css from './style.css?inline'
import timberCss from '../../../src/ui/timber/theme.css?inline'
import {mountWoodworkingTimber} from './timber-adapter.js'
import {
  availableCuts,
  clearMark,
  createJob,
  cut,
  CUT_FACE,
  CUTS,
  DEFAULT_DESIGN,
  DEFAULT_STOCK,
  finish,
  idealMark,
  markCut,
  pare,
  recordTrial,
  restoreJob,
  trialFit,
} from './domain.js'
import type { CutId, Design, FinishedWork, Job, Stock } from './domain.js'
import { blueprint } from './blueprint.js'
import { createWorkbenchViewport } from './viewport.js'
import type { SurfaceStroke, WorkView } from './viewport.js'

export interface WoodworkingDraft {
  version: 1
  job: Job
  selected: CutId
  paint: string | null
  tested: boolean
}
export interface WoodworkingReceipt {
  rarityLabel?: string
  traits?: readonly string[]
}
export interface WoodworkingOptions {
  stocks?: readonly Stock[]
  draft?: WoodworkingDraft | null
  tools?: { saw?: boolean; chisel?: boolean; brush?: boolean; straightedge?: boolean }
  lockedStraightedgeHint?: string
  onNew?: () => void
  ghostEligible?: boolean
  onDraftChange?: (draft: WoodworkingDraft | null) => void
  onDiscard?: (draft: WoodworkingDraft) => void | Promise<void>
  onComplete?: (
    item: FinishedWork,
    stockId: string,
    draft: WoodworkingDraft,
  ) => void | WoodworkingReceipt | Promise<void | WoodworkingReceipt>
}
export interface WoodworkingMount {
  destroy(): void
  getDraft(): WoodworkingDraft | null
  setPaused(paused: boolean): void
}
const names: Record<CutId, string> = {
  trim: '截取总长',
  cheekNear: '锯近侧榫颊',
  cheekFar: '锯远侧榫颊',
  shoulderNear: '切近侧榫肩',
  shoulderFar: '切远侧榫肩',
}
const surfaces = { top: '顶面', near: '近侧面', far: '远侧面', end: '端面' }
const pigments = [
  ['原木', null],
  ['松绿', '#476b53'],
  ['赭红', '#974f37'],
  ['靛蓝', '#465d79'],
] as const

export function mountWoodworking(container: HTMLElement, options: WoodworkingOptions = {}): WoodworkingMount {
  const mount = document.createElement('div')
  const shadow = mount.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = css + '\n' + timberCss
  const shell = document.createElement('section')
  shell.className = 'shell'
  shell.innerHTML = `<header><div class="brand"><span class="seal">木</span><div><div class="eyebrow">森林之家 ／ 木工房</div><h1>榫作练习台</h1></div></div><span class="stamp">习作 01 · 直榫</span></header>
    <ol class="rail"><li>01　定图选材</li><li>02　放样开榫</li><li>03　试配修整</li><li>04　收件</li></ol>
    <div class="layout"><section class="panel"><div class="bar"><h2>操作台</h2><span class="tag" id="modeLabel"></span></div><div class="stage"><canvas aria-label="可旋转的木料，在划线模式沿木面拖动划线"></canvas></div>
    <div class="tools"><button data-a="rotate">↻ 转动</button><button data-a="mark">✎ 划线</button><button data-a="ruler" title="沿落笔点作直线">直角尺</button><button data-a="face">正对工作面</button><button data-a="iso">立体视角</button></div><div class="foot" id="guide"></div></section>
    <section class="panel"><div class="bar"><h2>工艺图纸</h2><span class="meta">W–01 / mm</span></div><div class="drawings"></div><div class="body">
    <div class="row" id="dims"><label>总长<input name="length" type="number" min="1" step="1"></label><label>榫长<input name="tenonLength" type="number" min="1" step="1"></label><label>榫宽<input name="tenonWidth" type="number" min="1" step="1"></label></div>
    <div id="materials" class="row"><label>毛料<select id="stocks"></select></label><button data-a="start" class="primary">选料开工</button></div>
    <small id="spec" class="hint"></small><details class="tolerance"><summary>试配公差</summary><p>单侧榫颊可留 0.25 mm 过盈，侧隙须在 1.5 mm 以内。榫头允许短 2 mm、长 0.75 mm，两肩沿长度方向最多错开 2 mm。</p></details><div id="operations"><label>工作线　<select id="cuts"></select></label><div class="actions inspect"><button data-a="cut" class="primary">沿墨线下锯</button><button data-a="erase">擦线重画</button></div></div>
    <div id="fitting"><div class="actions"><button data-a="trial" class="primary">试插榫孔</button><button data-a="near">薄削近颊</button><button data-a="far">薄削远颊</button></div><p class="hint" id="fit"></p></div>
    <div id="finish"><div class="actions">面漆 <span id="paints" class="actions"></span><button data-a="finish" class="primary">收为成品</button></div></div>
    <div class="note" id="note" role="status" aria-live="polite"></div><button class="secondary" data-a="restart" hidden>另取毛料</button>
    <dialog id="discard-dialog" aria-labelledby="discard-title"><h2 id="discard-title">放弃当前工件？</h2><p>这块料已经下锯，放弃后不能恢复。</p><div class="actions"><button data-a="keep" autofocus>继续做</button><button data-a="discard" class="discard">确认放弃这块料</button></div></dialog>
    </div></section></div>`
  shadow.append(style, shell)
  container.append(mount)
  const timber = mountWoodworkingTimber(shell, shadow)
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => shell.querySelector<T>(selector)!
  const btn = (a: string) => $<HTMLButtonElement>(`[data-a="${a}"]`)
  const stocks = options.stocks ?? [DEFAULT_STOCK, { id: 'wide-blank', length: 100, width: 36, height: 30 }]
  const restored = options.draft?.version === 1 ? structuredClone(options.draft) : null
  let job: Job | null = restored ? restoreJob(restored.job) : null,
    selected: CutId = restored && CUTS.includes(restored.selected) ? restored.selected : 'trim',
    paint = restored?.paint ?? null
  let design: Design = { ...(job?.design ?? DEFAULT_DESIGN) },
    mode: WorkView['mode'] = 'rotate'
  let item: FinishedWork | null = null,
    receipt: WoodworkingReceipt | void,
    busy = false,
    disposed = false
  let message = job
    ? '已续接工件，选择工作线可继续加工。'
    : !stocks.length
      ? '暂时没有可用毛料。'
      : options.ghostEligible === false
        ? '定好尺寸，选一块毛料。'
        : '定好尺寸，选一块毛料。开工后可观察五秒虚影。'
  let useRuler = false
  let finishedStock: Stock | null = null
  let ghostUntil = 0,
    pausedGhostMs = 0,
    paused = false,
    ghostUsed = !!job
  let timer: ReturnType<typeof setInterval> | undefined
  const discardDialog = $<HTMLDialogElement>('#discard-dialog')
  const caps = options.tools ?? {},
    stockMenu = $<HTMLSelectElement>('#stocks'),
    cutMenu = $<HTMLSelectElement>('#cuts')
  if (caps.straightedge === false) btn('ruler').title = options.lockedStraightedgeHint ?? '尚未配备直角尺'
  for (const [i, s] of stocks.entries())
    stockMenu.add(new Option(`${s.length} × ${s.width} × ${s.height} mm · ${s.label ?? s.id}`, String(i)))
  for (const [key, color] of pigments) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'swatch'
    b.dataset.paint = color ?? ''
    b.title = key
    b.setAttribute('aria-label', `面漆：${key}`)
    b.style.setProperty('--color', color ?? '#cda26d')
    $('#paints').append(b)
  }
  for (const key of Object.keys(design) as (keyof Design)[])
    $<HTMLInputElement>(`[name=${key}]`).value = String(design[key])
  const currentStock = () => job?.stock ?? finishedStock ?? stocks[Number(stockMenu.value)] ?? DEFAULT_STOCK
  function getDraft(): WoodworkingDraft | null {
    return job
      ? structuredClone({ version: 1, job, selected, paint, tested: job.trials > 0 && !job.needsTrial })
      : null
  }
  function emit() {
    options.onDraftChange?.(getDraft())
  }
  function error(e: unknown) {
    message = e instanceof Error ? e.message : String(e)
  }
  function stopClock() {
    clearInterval(timer)
    timer = undefined
  }
  function startClock(ms: number) {
    stopClock()
    ghostUntil = ms > 0 ? performance.now() + ms : 0
    if (ms > 0)
      timer = setInterval(() => {
        if (performance.now() >= ghostUntil) {
          ghostUntil = 0
          stopClock()
        }
        render()
      }, 250)
  }
  function resetBench(newPiece: boolean) {
    job = null
    item = null
    receipt = undefined
    finishedStock = null
    paint = null
    useRuler = false
    mode = 'rotate'
    selected = 'trim'
    pausedGhostMs = 0
    startClock(0)
    if (newPiece) ghostUsed = false
    message = '选一块毛料开始下一次练习。'
    viewport.orient('iso')
    emit()
    if (newPiece) options.onNew?.()
  }
  const viewport = createWorkbenchViewport($<HTMLCanvasElement>('canvas'), (stroke: SurfaceStroke) => {
    if (!job || busy || paused || mode !== 'mark') return
    try {
      const { face, points } = stroke
      if (face !== CUT_FACE[selected])
        throw new Error(`这道工序要在${surfaces[CUT_FACE[selected]]}划线。可点「正对工作面」。`)
      if (points.length < 2) return
      const a = points[0],
        end = points[points.length - 1]
      job = markCut(job, selected, { face, a, b: useRuler ? { u: a.u, v: end.v } : end })
      message = '墨线已留在木面。可以下锯，也可以重画。'
      emit()
    } catch (e) {
      error(e)
    }
    render()
  })
  function render() {
    if (disposed) return
    const stock = currentStock(),
      report = job && trialFit(job),
      all = !!report?.ready
    const tested = !!job && job.trials > 0 && !job.needsTrial
    const stage = item ? 3 : all ? 2 : job ? 1 : 0
    shell.querySelectorAll('.rail li').forEach((li, i) => {
      li.className = i < stage ? 'done' : i === stage ? 'current' : ''
    })
    $('.drawings').innerHTML = blueprint(design, stock, selected)
    $('#materials').hidden = !!job || !!item
    $('#dims')
      .querySelectorAll('input')
      .forEach((el) => (el.disabled = !!job || !!item))
    $('#operations').hidden = !job || all
    $('#fitting').hidden = !all
    $('#finish').hidden = !all
    btn('restart').hidden = !item && !job
    btn('restart').disabled = busy
    btn('restart').textContent = item
      ? '再做一件'
      : Object.keys(job?.cuts ?? {}).length
        ? '放弃工件…'
        : '重新选料'
    btn('start').disabled = stocks.length === 0
    const allowed = job ? availableCuts(job) : []
    cutMenu.replaceChildren(
      ...CUTS.map((id) => {
        const o = new Option(`${job?.cuts[id] ? '✓ ' : ''}${names[id]}`, id)
        o.disabled = !allowed.includes(id)
        return o
      }),
    )
    cutMenu.value = selected
    btn('rotate').disabled = busy
    btn('mark').disabled = !job || all || busy
    btn('rotate').setAttribute('aria-pressed', String(mode === 'rotate'))
    btn('mark').setAttribute('aria-pressed', String(mode === 'mark'))
    btn('ruler').disabled = !job || all || busy || caps.straightedge === false
    btn('ruler').setAttribute('aria-pressed', String(useRuler))
    btn('cut').disabled = !job?.marks[selected] || caps.saw === false || busy
    btn('erase').disabled = !job?.marks[selected] || busy
    btn('trial').disabled = !all || busy
    for (const side of ['near', 'far']) btn(side).disabled = !job?.trials || caps.chisel === false || busy
    btn('finish').disabled = !tested || !report?.fits || busy
    btn('finish').textContent = busy ? '正在收件…' : '收为成品'
    $('#paints')
      .querySelectorAll('button')
      .forEach((b) => {
        b.disabled = busy || caps.brush === false
        b.setAttribute('aria-pressed', String((b.dataset.paint || null) === paint))
      })
    const remaining = Math.max(0, Math.ceil((paused ? pausedGhostMs : ghostUntil - performance.now()) / 1000))
    $('#modeLabel').textContent = paused
      ? '已暂停'
      : remaining
        ? `虚影 ${remaining} 秒`
        : item
          ? '已收件'
          : mode === 'mark'
            ? '划线模式'
            : '观察模式'
    $('#spec').textContent =
      `毛料截面 ${stock.width} × ${stock.height} mm　·　榫肩距基准端 ${design.length - design.tenonLength} mm`
    $('#guide').textContent = item
      ? '成品预览'
      : !job
        ? '拖动查看成形后的直榫。图纸尺寸以毫米计。'
        : all
          ? '比较榫颊与试配孔的接触位置，每次薄削 0.25 mm。'
          : `${names[selected]} · ${surfaces[CUT_FACE[selected]]}　${mode === 'rotate' ? '拖动转动木料，切换划线后落笔。' : '沿木面拖出墨线，松手落笔。'}`
    $('#fit').textContent =
      tested && report
        ? `${report.fits ? '试配合格' : report.issues.join('；')}　·　最大侧偏 ${report.clearance.toFixed(2)} mm`
        : '试配后可查看接触情况。'
    $('#note').textContent = message
    const marks = (m: Job['marks']) => Object.values(m).map((l) => ({ face: l.face, points: [l.a, l.b] }))
    const target = job && idealMark(job, selected)
    const view = {
      ...stock,
      target: design,
      job: job ?? undefined,
      mode,
      ghost: remaining > 0,
      strokes: job ? marks(job.marks) : [],
      kerfs: job ? marks(job.cuts) : [],
      pigment: paint ?? undefined,
    } as WorkView
    if (job) {
      if (target && !all) {
        const span = target.face === 'end' ? stock.width : stock.length
        const zone = Math.min(2, Math.floor((3 * target.a.u) / span))
        view.heat = {
          face: target.face,
          u: ((zone + 0.5) * span) / 3,
          v: target.b.v / 2,
          radiusU: span * 0.22,
          radiusV: target.b.v * 0.45,
        }
      }
      if (tested)
        view.socket = {
          width: design.tenonWidth,
          depth: design.tenonLength,
          interference: report?.interference,
        }
    } else if (item) {
      const e = item.envelope
      view.envelope = e
      view.length = e.length
      view.width = e.width
      view.height = e.height
    }
    viewport.update(view)
    timber.refresh()
  }
  shell.addEventListener('change', (event) => {
    if (busy || paused) return
    const field = event.target
    if (field === cutMenu && job) {
      selected = cutMenu.value as CutId
      message = `下一笔画在${surfaces[CUT_FACE[selected]]}。`
      emit()
    }
    if (field instanceof HTMLInputElement && !job && !item && field.name in design) {
      const value = field.valueAsNumber
      if (Number.isFinite(value) && value > 0) design = { ...design, [field.name]: value }
      else {
        field.value = String(design[field.name as keyof Design])
        message = '尺寸须大于零。'
      }
    }
    render()
  })
  shell.addEventListener('click', async (event) => {
    if (paused || busy) return
    const feature =
      event.target instanceof Element
        ? (event.target.closest('[data-cut]')?.getAttribute('data-cut') as CutId | null)
        : null
    if (feature && !busy) {
      if (!job || availableCuts(job).includes(feature)) {
        selected = feature
        message = `${names[feature]} · ${surfaces[CUT_FACE[feature]]}`
        emit()
      } else message = job.cuts[feature] ? '这道锯口已经完成。' : '先完成前一道工序，再划这条线。'
      render()
      return
    }
    const button = event.target instanceof Element ? event.target.closest('button') : null
    if (!button || button.disabled || busy) return
    try {
      if (button.hasAttribute('data-paint')) {
        paint = button.dataset.paint || null
        emit()
        render()
        return
      }
      switch (button.dataset.a) {
        case 'start': {
          if (!stocks.length) return
          job = createJob(design, currentStock())
          selected = 'trim'
          mode = 'rotate'
          paint = null
          startClock(options.ghostEligible === false || ghostUsed ? 0 : 5000)
          ghostUsed = true
          message = ghostUntil ? '观察虚影，依图在顶面画截断线。' : '依图在顶面画截断线。'
          emit()
          break
        }
        case 'restart':
          if (item) {
            resetBench(true)
            break
          }
          if (!job) break
          if (!Object.keys(job.cuts).length) {
            resetBench(false)
            break
          }
          if (options.onComplete && !options.onDiscard) throw new Error('当前工房未开放弃料，请保留工件。')
          discardDialog.showModal()
          break
        case 'keep':
          discardDialog.close()
          break
        case 'discard': {
          if (!discardDialog.open || !job) break
          discardDialog.close()
          const draft = getDraft()!
          busy = true
          render()
          try {
            await options.onDiscard?.(draft)
          } finally {
            busy = false
          }
          if (!disposed) resetBench(true)
          break
        }
        case 'rotate':
          mode = 'rotate'
          break
        case 'mark':
          mode = 'mark'
          break
        case 'ruler':
          useRuler = !useRuler
          message = useRuler ? '直角尺沿落笔的位置扶正墨线。' : '已收起直角尺。'
          break
        case 'face':
          viewport.orient(CUT_FACE[selected])
          break
        case 'iso':
          viewport.orient('iso')
          break
        case 'erase':
          if (job) {
            job = clearMark(job, selected)
            message = '墨线已擦除。'
            emit()
          }
          break
        case 'cut':
          if (job) {
            job = cut(job, selected)
            selected = availableCuts(job)[0] ?? selected
            mode = 'rotate'
            message = trialFit(job).ready
              ? '榫头已开好，可以试配。'
              : `锯切完成，可以开始${names[selected]}。`
            emit()
          }
          break
        case 'trial':
          if (job) {
            job = recordTrial(job)
            mode = 'rotate'
            viewport.orient('iso')
            message = trialFit(job).fits ? '试配合格，可以上漆收件。' : '查看试配反馈，决定修整或重新选料。'
            emit()
          }
          break
        case 'near':
        case 'far':
          if (job) {
            job = pare(job, button.dataset.a)
            message = '已薄削 0.25 mm，请重新试配。'
            emit()
          }
          break
        case 'finish':
          if (job) {
            const completed = finish(job, paint),
              draft = getDraft()!
            busy = true
            render()
            try {
              receipt = await options.onComplete?.(structuredClone(completed), job.stock.id, draft)
            } finally {
              busy = false
            }
            if (disposed) return
            item = completed
            finishedStock = job.stock
            job = null
            mode = 'rotate'
            message = [`已收件 · 工艺分 ${item.score}`, receipt?.rarityLabel, ...(receipt?.traits ?? [])]
              .filter(Boolean)
              .join('　·　')
            emit()
          }
          break
      }
    } catch (e) {
      error(e)
    }
    render()
  })
  render()
  function setPaused(value: boolean) {
    if (paused === value || disposed) return
    paused = value
    if (paused) {
      pausedGhostMs = Math.max(0, ghostUntil - performance.now())
      stopClock()
      viewport.cancelGesture?.()
      if (discardDialog.open) discardDialog.close()
    } else {
      startClock(pausedGhostMs)
      pausedGhostMs = 0
    }
    shell.inert = paused
    render()
  }
  return {
    getDraft,
    setPaused,
    destroy() {
      disposed = true
      stopClock()
      viewport.destroy()
      timber.dispose()
      mount.remove()
    },
  }
}
