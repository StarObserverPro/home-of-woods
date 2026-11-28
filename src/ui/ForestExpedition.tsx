import {useCallback, useEffect, useMemo, useState, useSyncExternalStore} from 'react';
import type {PointerEvent as ReactPointerEvent, ReactNode} from 'react';
import type {ForestExpeditionRuntime} from '../app/forest-expedition-runtime.ts';
import {EXPEDITIONS, EXPEDITION_BY_ID} from '../content/forest-expedition.ts';
import type {ExpeditionPoint} from '../content/forest-expedition.ts';
import type {ForestExpeditionSnapshot} from '../domain/forest-expedition.ts';
import {GameIcon} from './GameIcon.tsx';
import {itemIcon} from './art-icons.ts';
import {TimberButton, TimberHeading, TimberPanel} from './timber/components.tsx';
import {useWindowFocus} from './timber/use-window-focus.ts';
import './timber/theme.css';
import './forest-expedition.css';

type WindowName = 'bag' | 'sources' | 'supply' | 'pause';
type BagTab = 'carried' | 'stored' | 'ground';
type Source = ForestExpeditionSnapshot['sources'][number];
type GroundStack = ForestExpeditionSnapshot['ground'][number];
type Action = NonNullable<ForestExpeditionSnapshot['action']>;

const decimal = (value: number) => Number(value.toFixed(1)).toString();
const distanceLabel = (value: number) => value < 2 ? '就在身边' : `约 ${Math.ceil(value)} 米`;
const durationLabel = (seconds: number) => seconds < 60 ? `${Math.ceil(seconds)} 秒` : `${Math.ceil(seconds / 60)} 分钟`;
const pendingLabel = (mapId: keyof typeof EXPEDITION_BY_ID | null) => mapId ? `${EXPEDITION_BY_ID[mapId].name}的长材待归架` : '';

function ProduceName({itemId,children}:{itemId:string;children:ReactNode}) {
  return <span className="expedition-produce-name"><GameIcon name={itemIcon(itemId)} size={28}/><span>{children}</span></span>;
}

/** Lists retain their place while distances and quantities change. */
function PagedList<T>({items, render, label, empty, pageSize = 4}: {
  items: readonly T[]; render: (item: T) => ReactNode; label: string; empty: string; pageSize?: number;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pages - 1);
  useEffect(() => {setPage(0);}, [label]);
  return <section className="expedition-list" aria-label={label} data-ui-grid="content">
    {items.length ? <div className="expedition-rows">{items.slice(current * pageSize, (current + 1) * pageSize).map(render)}</div>
      : <p className="expedition-empty">{empty}</p>}
    {pages > 1 && <nav className="expedition-pager" aria-label={`${label}分页`} data-ui-grid="row">
      <TimberButton emphasis="quiet" aria-label={`${label}上一页`} disabled={current === 0} onClick={() => setPage(current - 1)}>上一页</TimberButton>
      <span aria-live="polite">{current + 1} / {pages}</span>
      <TimberButton emphasis="quiet" aria-label={`${label}下一页`} disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>下一页</TimberButton>
    </nav>}
  </section>;
}

function ActionProgress({action, suspended, onCancel}: {action: Action; suspended: boolean; onCancel: () => void}) {
  return <section className="expedition-progress" data-ui-grid="notice" aria-label="当前动作" aria-busy="true">
    <div className="expedition-progress-text"><strong>{action.name}</strong><span>{suspended ? '计时已暂停' : `还需 ${durationLabel(action.remainingSeconds)}`}</span>
      <progress max={1} value={action.progress} aria-label={`${action.name}进度`}/></div>
    <TimberButton emphasis="quiet" onClick={onCancel}>取消</TimberButton>
  </section>;
}

function DirectionButton({label, children, x, y, runtime, className}: {
  label: string; children: ReactNode; x: number; y: number; runtime: ForestExpeditionRuntime; className: string;
}) {
  const stop = () => runtime.setMoveVector(0, 0);
  const start = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    runtime.setMoveVector(x, y);
  };
  return <TimberButton className={className} emphasis="quiet" aria-label={label}
    onPointerDown={start} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
    onKeyDown={event => {if (event.key === ' ' || event.key === 'Enter') {event.preventDefault(); runtime.setMoveVector(x, y);}}}
    onKeyUp={stop} onBlur={stop}>{children}</TimberButton>;
}

/** The runtime owns every game fact; this component owns only open windows and their focus. */
export function ForestExpeditionApp({runtime,onReturn}: {runtime: ForestExpeditionRuntime;onReturn?:()=>void}) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.snapshot, runtime.snapshot);
  const {domain, layout} = view;
  const [panel, setPanel] = useState<WindowName | null>(null);
  const [bagTab, setBagTab] = useState<BagTab>('carried');

  useEffect(() => () => {runtime.setPanelOpen(false); runtime.setMoveVector(0, 0);}, [runtime]);
  useWindowFocus(panel ? '.expedition-window' : null, panel);

  // Gate input synchronously: an ensuing walk command must not be cleared by a late open effect.
  const changePanel = useCallback((next: WindowName | null) => {
    runtime.setPanelOpen(next !== null);
    setPanel(next);
  }, [runtime]);
  const closePanel = useCallback(() => changePanel(null), [changePanel]);
  const resume = useCallback(() => {closePanel(); runtime.setPaused(false);}, [closePanel, runtime]);
  const togglePause = useCallback(() => {
    if (runtime.snapshot().paused) resume();
    else {runtime.setPaused(true); changePanel('pause');}
  }, [changePanel, resume, runtime]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (panel === 'pause') resume();
        else if (panel) closePanel();
        else togglePause();
      } else if (event.key.toLowerCase() === 'b') {
        event.preventDefault(); event.stopPropagation();
        if (panel === 'pause') return;
        changePanel(panel === 'bag' ? null : 'bag');
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [panel, closePanel, resume, togglePause, changePanel]);

  const walk = (point: ExpeditionPoint) => {closePanel(); runtime.walkTo(point);};
  const supply = () => {
    if (domain.storage.near) changePanel('supply');
    else {closePanel(); runtime.returnToSupply();}
  };
  const inspectSource = (source: Source, approach = false) => {
    closePanel(); runtime.select({kind: 'source', id: source.id});
    if (approach) runtime.walkTo(source.point);
  };
  const inspectGround = (stack: GroundStack) => {
    closePanel(); runtime.select({kind: 'drop', key: stack.key}); runtime.walkTo(stack.point);
  };
  const process = (recipeId: string) => {
    runtime.process(recipeId);
    if (runtime.snapshot().domain.action?.kind === 'process') closePanel();
  };
  const sources = useMemo(() => [...domain.sources].sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id)), [domain.sources]);
  const ground = useMemo(() => [...domain.ground].sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key)), [domain.ground]);
  const selected = view.selected;
  const selectedSource = selected?.kind === 'source' ? domain.sources.find(source => source.id === selected.id) : undefined;
  const selectedDrop = selected?.kind === 'drop' ? domain.ground.find(stack => stack.key === selected.key) : undefined;
  const selectedLandmark = selected?.kind === 'landmark' ? layout.landmarks.find(mark => mark.id === selected.id) : undefined;
  const landmarkTree = selectedLandmark ? layout.trees.find(tree => tree.id === selectedLandmark.treeId) : undefined;
  const landmarkHabitat = landmarkTree ? layout.habitats.find(habitat => habitat.id === landmarkTree.habitatId) : undefined;
  const title = panel === 'bag' ? '整理行囊' : panel === 'sources' ? '林间物产' : panel === 'supply' ? '补给与加工' : '歇一会儿';
  const busy = !!domain.action;

  function renderBag() {
    return <>
      <nav className="expedition-tabs" aria-label="物品所在位置" data-ui-grid="row">
        {([['carried', '随身'], ['stored', '寄存'], ['ground', '地面']] as const).map(([tab, name]) =>
          <TimberButton key={tab} emphasis="quiet" aria-pressed={bagTab === tab} onClick={() => setBagTab(tab)}>{name} <span>{domain[tab].length}</span></TimberButton>)}
      </nav>
      <div className="expedition-load" data-ui-grid="row">
        <p>负重 {decimal(domain.carryLoad.weight)} / {decimal(domain.carryLoad.weightLimit)}<br/><span>占位 {decimal(domain.carryLoad.bulk)} / {decimal(domain.carryLoad.bulkLimit)}</span></p>
        <TimberButton emphasis="quiet" disabled={busy || view.paused} aria-pressed={domain.carryMethod === 'bundle'} onClick={() => runtime.carry({kind: 'method', method: domain.carryMethod === 'bundle' ? 'hands' : 'bundle'})}>{domain.carryMethod === 'bundle' ? '解开束带' : '整理打捆'}</TimberButton>
      </div>
      {bagTab === 'carried' && <PagedList items={domain.carried} label="随身物品" empty="行囊还是空的。走近林间物产，采集后就会放在这里。" render={stack =>
        <div key={stack.key} className="expedition-stock-row" data-ui-grid="row">
          <div className="expedition-row-copy"><strong><ProduceName itemId={stack.itemId}>{stack.name} × {stack.quantity}</ProduceName></strong>{stack.pendingMapId && <small>{pendingLabel(stack.pendingMapId)}</small>}</div>
          <div className="expedition-row-actions"><TimberButton emphasis="quiet" disabled={busy || view.paused} aria-label={`放下全部${stack.name}`} onClick={() => runtime.carry({kind: 'drop', key: stack.key, quantity: 'max'})}>放下</TimberButton>
            <TimberButton disabled={busy || view.paused} aria-label={domain.storage.near ? `存入全部${stack.name}` : '走到补给架'} onClick={() => domain.storage.near ? runtime.carry({kind: 'store', key: stack.key}) : supply()}>{domain.storage.near ? '存入' : '归架'}</TimberButton></div>
        </div>}/>}
      {bagTab === 'stored' && <>
        <p className="expedition-note">三块林地共用这些寄存物。{domain.storage.near ? '在补给架旁可取回。' : '走回补给架后才能取回。'}</p>
        <PagedList items={domain.stored} label="寄存物品" empty="补给架上还没有你的材料。把随身采集物带回来存放，也能用于加工。" render={stack =>
          <div key={stack.key} className="expedition-stock-row" data-ui-grid="row"><div className="expedition-row-copy"><strong><ProduceName itemId={stack.itemId}>{stack.name}</ProduceName></strong><span>共 {stack.quantity} 份</span></div>
            <div className="expedition-row-actions"><TimberButton disabled={busy || view.paused} aria-label={`取回一份${stack.name}`} onClick={() => domain.storage.near ? runtime.carry({kind: 'withdraw', key: stack.key, quantity: 1}) : supply()}>{domain.storage.near ? '取一份' : '去补给'}</TimberButton>
              {domain.storage.near && stack.quantity > 1 && <TimberButton emphasis="quiet" disabled={busy || view.paused} aria-label={`尽量取回${stack.name}`} onClick={() => runtime.carry({kind: 'withdraw', key: stack.key, quantity: 'max'})}>尽量取</TimberButton>}</div>
          </div>}/>
      </>}
      {bagTab === 'ground' && <>
        <p className="expedition-note">这里列出本林地放下的材料；离开后仍会留在原处。</p>
        <PagedList items={ground} label="地面物品" empty="这块林地没有尚未拿回的材料。" render={stack =>
          <div key={stack.key} className="expedition-stock-row" data-ui-grid="row"><div className="expedition-row-copy"><strong><ProduceName itemId={stack.itemId}>{stack.name} × {stack.quantity}</ProduceName></strong><span>{distanceLabel(stack.distance)}</span>{stack.near && stack.takeReason && <small>{stack.takeReason}</small>}</div>
            <TimberButton disabled={view.paused || (stack.near && !!stack.takeReason)} onClick={() => stack.near ? runtime.carry({kind: 'take', key: stack.key, quantity: 'max'}) : inspectGround(stack)}>{stack.near ? '拿起来' : '走近'}</TimberButton>
          </div>}/>
      </>}
      {domain.carryLoad.reason && <p className="expedition-note" role="status">{domain.carryLoad.reason}</p>}
    </>;
  }

  function renderSources() {
    return <>
      <p className="expedition-note">按距离排列。先查看或走近，到达后再决定采集。</p>
      <PagedList items={sources} label="附近物产" empty="附近暂时没有可查看的物产。" render={source =>
        <div key={source.id} className="expedition-source-row" data-ui-grid="row" data-source-id={source.id}>
          <div className="expedition-row-copy"><strong><ProduceName itemId={source.itemId}>{source.name}</ProduceName></strong><span>{distanceLabel(source.distance)} · 余量 {source.remaining}</span>{source.depleted && <small>{source.recoverable ? `${durationLabel(source.waitSeconds)}后再来` : '已收取'}</small>}</div>
          <div className="expedition-row-actions"><TimberButton emphasis="quiet" onClick={() => inspectSource(source)}>查看</TimberButton><TimberButton disabled={view.paused} onClick={() => inspectSource(source, true)}>走近</TimberButton></div>
        </div>}/>
      <div className="expedition-landmark-list" data-ui-grid="content"><h3>林地地标</h3>
        {layout.landmarks.map(mark => <TimberButton key={mark.id} emphasis="quiet" onClick={() => {closePanel(); runtime.select({kind: 'landmark', id: mark.id});}}>{mark.name}</TimberButton>)}
      </div>
    </>;
  }

  function renderSupply() {
    return <>
      <p className="expedition-note">把材料放上共用补给架，再晾制、劈柴或熬煮。</p>
      <div className="expedition-supply-actions" data-ui-grid="row">
        <TimberButton disabled={!domain.storage.near || !domain.carried.length || busy || view.paused} onClick={() => runtime.carry({kind: 'store'})}>存入随身物品</TimberButton>
        <TimberButton emphasis="quiet" disabled={!domain.storage.canClaimContainer || view.paused} onClick={() => runtime.claimContainer()}>{domain.storage.containerIssued ? '收液罐已领' : '领取收液罐'}</TimberButton>
      </div>
      {!domain.storage.near && <TimberButton onClick={() => {closePanel(); runtime.returnToSupply();}}>走回补给架</TimberButton>}
      <PagedList items={domain.recipes} pageSize={2} label="林间加工" empty="目前没有可做的加工。" render={recipe =>
        <div key={recipe.id} className="expedition-recipe" data-ui-grid="content">
          <div className="expedition-recipe-heading" data-ui-grid="row"><strong>{recipe.name}</strong><span>{durationLabel(recipe.durationSeconds)}</span></div>
          <p>{recipe.description}</p>
          <div className="expedition-recipe-bottom" data-ui-grid="row"><div><span className="expedition-muted">{recipe.inputs.map(input => `${input.label} × ${input.quantity}`).join(' · ')}</span>
            {recipe.reason && <small>{recipe.reason}</small>}</div><TimberButton disabled={!recipe.enabled || view.paused} onClick={() => process(recipe.id)}>开始</TimberButton></div>
        </div>}/>
    </>;
  }

  function renderPause() {
    return <>
      <p>林间时间已经停下，休息好再继续。</p>
      <TimberButton className="expedition-resume" onClick={resume}>继续漫步</TimberButton>
      <dl className="expedition-help">
        <div><dt>走动</dt><dd>点地面，或用 W A S D / 方向键；按住 Shift 小跑。</dd></div>
        <div><dt>采集</dt><dd>点物产查看，走近后再按采集。</dd></div>
        <div><dt>镜头</dt><dd>拖动场景旋转；滚轮或双指缩放；Q / E 转向。</dd></div>
        <div><dt>整理</dt><dd>B 打开行囊；Esc 关闭窗口或暂停。</dd></div>
      </dl>
      <p className="expedition-note">{onReturn?'沿路回到出口，才能换林地或回营地。':'三块林地共用行囊、寄存材料和长材额度，换地图后可以接着上次的位置继续走。'}</p>
      <p className="expedition-note">{view.saveStatus === 'saved' ? '进度已保存。' : view.saveStatus === 'pending' ? '正在保存进度。' : '当前进度无法保存，请保持此页打开。'}</p>
    </>;
  }

  return <div className="expedition-ui" data-expedition-map={domain.activeMapId} data-expedition-panel={panel ?? 'none'}>
    <div className="expedition-top" data-ui-grid="hud" aria-hidden={panel ? true : undefined}>
      <header className="expedition-topbar" data-ui-grid="row">
        <div className="expedition-location"><span>森林之家 · 林间漫步</span><strong>{view.habitat}</strong></div>
        <nav className="expedition-map-tabs" aria-label="选择林地" data-ui-grid="row">{EXPEDITIONS.map(definition =>
          <TimberButton key={definition.id} emphasis="quiet" aria-pressed={domain.activeMapId === definition.id} disabled={busy} onClick={() => {closePanel(); runtime.switchMap(definition.id);}}>{definition.name}</TimberButton>)}
        </nav>
      </header>
      <div className="expedition-status" data-ui-grid="row"><span>负重 {decimal(domain.carryLoad.weight)} / {decimal(domain.carryLoad.weightLimit)}</span><span>长材余量 {domain.timber.remaining} / {domain.timber.limit}</span>{view.paused && <strong>已暂停</strong>}</div>
    </div>

    {!panel && <div className="expedition-notices hud-notices" data-ui-grid="notice">
      {domain.action ? <div data-timber-surface="slot" className="expedition-notice-surface"><ActionProgress action={domain.action} suspended={view.paused} onCancel={() => runtime.cancel()}/></div>
        : <p className="expedition-message" role="status">{view.message}</p>}
      {view.saveStatus === 'unavailable' && <p className="expedition-save-warning" role="status">进度暂时无法保存，请保持页面打开。</p>}
      {view.error && <p className="expedition-save-warning" role="alert">林地暂时停下了。重新打开页面可从已保存的位置继续。</p>}
    </div>}

    {!panel && !view.paused && <>
      <div className="expedition-movement" data-ui-grid="hud" aria-label="移动方向">
        <DirectionButton runtime={runtime} className="expedition-direction-up" label="向前走" x={0} y={-1}>↑</DirectionButton>
        <DirectionButton runtime={runtime} className="expedition-direction-left" label="向左走" x={-1} y={0}>←</DirectionButton>
        <TimberButton className="expedition-run" emphasis="quiet" aria-label={view.running ? '切换为走路' : '切换为跑步'} aria-pressed={view.running} onClick={() => runtime.setRunning(!view.running)}>{view.running ? '跑' : '走'}</TimberButton>
        <DirectionButton runtime={runtime} className="expedition-direction-right" label="向右走" x={1} y={0}>→</DirectionButton>
        <DirectionButton runtime={runtime} className="expedition-direction-down" label="向后走" x={0} y={1}>↓</DirectionButton>
      </div>
      <div className={`expedition-camera${view.selected ? ' expedition-camera-with-target' : ''}`} data-ui-grid="hud" aria-label="镜头控制">
        <TimberButton emphasis="quiet" aria-label="镜头向左转" onClick={() => runtime.orbit(36)}><GameIcon name="camera-left" size={24}/></TimberButton>
        <TimberButton emphasis="quiet" aria-label="镜头向右转" onClick={() => runtime.orbit(-36)}><GameIcon name="camera-right" size={24}/></TimberButton>
        <TimberButton emphasis="quiet" aria-label="拉近镜头" onClick={() => runtime.zoom(-160)}><GameIcon name="camera-zoom-in" size={24}/></TimberButton>
        <TimberButton emphasis="quiet" aria-label="拉远镜头" onClick={() => runtime.zoom(160)}><GameIcon name="camera-zoom-out" size={24}/></TimberButton>
        <TimberButton className="expedition-camera-reset" emphasis="quiet" onClick={() => runtime.resetCamera()}>复位</TimberButton>
      </div>
    </>}

    {!panel && !domain.action && view.selected && view.selected.kind !== 'ground' && <section className="expedition-target" data-timber-surface="slot" data-ui-grid="hud" aria-label="选中目标">
      <div className="expedition-target-heading" data-ui-grid="row"><h2>{selectedSource?.name ?? selectedDrop?.name ?? selectedLandmark?.name ?? (view.selected.kind === 'supply' ? '林地补给架' : '林间物件')}</h2><TimberButton emphasis="quiet" aria-label="收起目标详情" onClick={() => runtime.select(null)}>×</TimberButton></div>
      {selectedSource && <><p className="expedition-target-meta">{distanceLabel(selectedSource.distance)} · 余量 {selectedSource.remaining}</p><p className="expedition-target-note">{selectedSource.hint}</p>
        {selectedSource.near && selectedSource.reason && <p className="expedition-target-reason">{selectedSource.reason}</p>}
        <TimberButton disabled={view.paused || (selectedSource.near && !selectedSource.canGather)} onClick={() => runtime.primary()}>{selectedSource.actionLabel}</TimberButton></>}
      {selectedDrop && <><p className="expedition-target-meta">{distanceLabel(selectedDrop.distance)} · {selectedDrop.quantity} 份</p>{selectedDrop.near && selectedDrop.takeReason && <p className="expedition-target-reason">{selectedDrop.takeReason}</p>}
        <TimberButton disabled={view.paused || (selectedDrop.near && !!selectedDrop.takeReason)} onClick={() => runtime.primary()}>{selectedDrop.near ? '拿起来' : '走近'}</TimberButton></>}
      {selectedLandmark && <><p className="expedition-target-meta">{landmarkHabitat?.name}</p><p>{landmarkTree ? `树高约 ${Math.round(landmarkTree.height / 2)} 个人高` : '沿小径走近看看'}</p><p className="expedition-target-note">{landmarkHabitat?.note}</p><TimberButton disabled={view.paused} onClick={() => walk(selectedLandmark.approach)}>走近看看</TimberButton></>}
      {view.selected.kind === 'supply' && <><p className="expedition-target-meta">{domain.storage.near ? '可以寄存、取回和加工' : distanceLabel(Math.hypot(domain.player.x - layout.supply.x, domain.player.z - layout.supply.z))}</p><TimberButton disabled={view.paused} onClick={supply}>{domain.storage.near ? '打开补给架' : '走回补给架'}</TimberButton></>}
    </section>}

    <nav className={`expedition-bottom${onReturn ? ' expedition-bottom-camp' : ''}`} aria-label="林地操作" data-ui-grid="hud" aria-hidden={panel ? true : undefined}>
      <TimberButton aria-pressed={panel === 'bag'} onClick={() => changePanel(panel === 'bag' ? null : 'bag')}>行囊</TimberButton>
      <TimberButton aria-pressed={panel === 'sources'} onClick={() => changePanel(panel === 'sources' ? null : 'sources')}>物产</TimberButton>
      <TimberButton aria-pressed={panel === 'supply'} disabled={view.paused && panel !== 'pause'} onClick={supply}>补给</TimberButton>
      {view.campExit && onReturn && <TimberButton disabled={busy||view.paused||view.campExit.returning} onClick={async()=>{if(await runtime.returnToCamp())onReturn();}}>
        {view.campExit.near?'回营地':'去出口'}
      </TimberButton>}
      <TimberButton emphasis="quiet" aria-pressed={view.paused} onClick={togglePause}>{view.paused ? '继续' : '暂停'}</TimberButton>
    </nav>

    {panel && <div className="expedition-window-layer" onPointerDown={event => {if (event.target === event.currentTarget && panel !== 'pause') closePanel();}}>
      <TimberPanel className={`expedition-window expedition-window-${panel}`} role="dialog" aria-modal="true" aria-labelledby="expedition-window-title" tabIndex={-1} onPointerDown={event => event.stopPropagation()}>
        <TimberHeading className="expedition-window-heading" data-ui-grid="row"><h2 id="expedition-window-title">{title}</h2><TimberButton emphasis="quiet" aria-label={panel === 'pause' ? '继续漫步' : '关闭窗口'} onClick={panel === 'pause' ? resume : closePanel}>×</TimberButton></TimberHeading>
        {domain.action && <ActionProgress action={domain.action} suspended onCancel={() => runtime.cancel()}/>}
        <div className="expedition-window-body" data-ui-grid="content">
          {panel === 'bag' ? renderBag() : panel === 'sources' ? renderSources() : panel === 'supply' ? renderSupply() : renderPause()}
          {panel !== 'pause' && <p className="expedition-window-message" data-ui-grid="notice" role="status">{view.message}</p>}
        </div>
      </TimberPanel>
    </div>}
  </div>;
}

export default ForestExpeditionApp;
