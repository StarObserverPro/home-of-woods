import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon, type IconName } from './icons';
import './hud.css';

export type HudTool = 'axe' | 'hoe' | 'water' | 'plant' | 'build';
export type HudPlantKind = 'tree' | 'carrot';
export type HudBuildKind = 'cabin' | 'fence';

export interface HudModel {
  tool: HudTool;
  plantKind: HudPlantKind;
  buildKind: HudBuildKind;
  day: number;
  clockLabel: string;
  inventory: { wood: number; seeds: number; saplings: number; carrots: number };
  context: { title: string; action: string; detail?: string; canAct: boolean; progress?: number };
  goals: Array<{ id: string; label: string; done: boolean }>;
  paused: boolean;
  soundOn: boolean;
  reducedMotion: boolean;
  saveStatus?: string;
  toast?: { text: string; tone?: 'good' | 'warn' | 'neutral'; key?: number };
  build?: { cost: number; canPlace: boolean; reason?: string; rotation: number };
}

export interface HudActions {
  onSelectTool: (tool: HudTool) => void;
  onPlantKind: (kind: HudPlantKind) => void;
  onBuildKind: (kind: HudBuildKind) => void;
  onRotate: () => void;
  onInteract: () => void;
  onConfirmBuild: () => void;
  onCancelBuild: () => void;
  onPause: () => void;
  onResume: () => void;
  /** Screen-relative movement: right +x, down +y. */
  onMove: (x: number, y: number) => void;
  onZoom: (delta: number) => void;
  onToggleSound: () => void;
  onReducedMotion: (enabled: boolean) => void;
}

const tools: Array<{ id: HudTool; name: string; hint: string }> = [
  { id: 'axe', name: '斧头', hint: '采集木材' },
  { id: 'hoe', name: '锄头', hint: '开垦土地' },
  { id: 'water', name: '水壶', hint: '给作物浇水' },
  { id: 'plant', name: '种植', hint: '种树与播种' },
  { id: 'build', name: '建造', hint: '搭建家园' },
];

function RoundButton({ icon, label, onClick, active, className = '', testId }: { icon: IconName; label: string; onClick: () => void; active?: boolean; className?: string; testId?: string }) {
  return <button className={`round-button ${className}`} data-testid={testId} aria-label={label} title={label} onClick={onClick} aria-pressed={active}><Icon name={icon} size={24}/></button>;
}

function Joystick({ onMove, disabled }: { onMove: HudActions['onMove']; disabled: boolean }) {
  const activePointer = useRef<number | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const release = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event && event.pointerId !== activePointer.current) return;
    activePointer.current = null;
    setOffset({ x: 0, y: 0 });
    onMoveRef.current(0, 0);
  };
  const track = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId || disabled) return;
    const box = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    const radius = box.width * 0.3;
    const length = Math.hypot(dx, dy);
    const scale = length > radius ? radius / length : 1;
    const x = dx * scale;
    const y = dy * scale;
    setOffset({ x, y });
    onMoveRef.current(x / radius, y / radius);
  };
  useEffect(() => {
    if (disabled) release();
    // The active pointer is always stopped when a modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);
  useEffect(() => {
    const stop = () => {
      activePointer.current = null;
      setOffset({ x: 0, y: 0 });
      onMoveRef.current(0, 0);
    };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    return () => {
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', stop);
      onMoveRef.current(0, 0);
    };
  }, []);
  return <div className="joystick-wrap">
    <div className="joystick" data-testid="joystick" role="group" aria-label="移动摇杆：拖动以行走" onPointerDown={(event) => {
      event.preventDefault();
      if (disabled || event.button !== 0 || activePointer.current !== null) return;
      activePointer.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      track(event);
    }} onPointerMove={track} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
      <span className="joystick-axis axis-x"/><span className="joystick-axis axis-y"/>
      <span className="joystick-thumb" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}><span/></span>
    </div>
    <span className="joystick-label">移动</span>
  </div>;
}

function GameModal({ help, model, actions }: { help: boolean; model: HudModel; actions: HudActions }) {
  const modal = useRef<HTMLDivElement>(null);
  const close = useRef(actions.onResume);
  close.current = actions.onResume;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []);
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => { document.removeEventListener('keydown', keydown, true); previous?.focus(); };
  }, []);
  return <div className="modal-shade" onPointerDown={(event) => event.stopPropagation()}>
    <div ref={modal} className="game-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <RoundButton icon="close" label="返回森林" onClick={actions.onResume} className="modal-close"/>
      <div className="modal-emblem"><Icon name={help ? 'axe' : 'tree'} size={54}/></div>
      <p className="eyebrow">HOME OF WOODS</p>
      <h1 id="modal-title">{help ? '在森林里，慢慢来。' : '歇一小会儿'}</h1>
      <p className="modal-intro">{help ? '走到身边，选好工具，就可以开始了。' : '风停在树梢，等你回来。'}</p>
      <dl className="controls-guide">
        <div><dt>走动</dt><dd><kbd>W A S D</kbd> / 方向键，或点地面</dd></div>
        <div><dt>做事</dt><dd>靠近目标，按 <kbd>E</kbd> / <kbd>空格</kbd></dd></div>
        <div><dt>换工具</dt><dd><kbd>1</kbd> — <kbd>5</kbd>，或点下方工具栏</dd></div>
        <div><dt>建造</dt><dd>点地面选位置，<kbd>R</kbd> 旋转，再确认</dd></div>
        <div className="touch-guide"><dt>触屏</dt><dd>左边摇杆移动，右边按钮做事</dd></div>
      </dl>
      {help && <p className="help-loop">砍树取木，种下新树苗；开垦、播种、浇水，等萝卜长大。攒够木材，就能搭起自己的小屋。</p>}
      <div className="game-options">
        <button className="option-row" onClick={actions.onToggleSound} role="switch" aria-checked={model.soundOn}>
          <span><Icon name={model.soundOn ? 'sound' : 'muted'} size={22}/>森林音效</span><span className={`switch ${model.soundOn ? 'is-on' : ''}`}><span/></span>
        </button>
        <button className="option-row" onClick={() => actions.onReducedMotion(!model.reducedMotion)} role="switch" aria-checked={model.reducedMotion}>
          <span>减少动态效果</span><span className={`switch ${model.reducedMotion ? 'is-on' : ''}`}><span/></span>
        </button>
      </div>
      <button className="primary-button resume-button" data-testid="resume" onClick={actions.onResume}>回到森林 <Icon name="arrow" size={20}/></button>
      {model.saveStatus && <p className="save-note">{model.saveStatus}</p>}
    </div>
  </div>;
}

export function Hud({ model, actions }: { model: HudModel; actions: HudActions }) {
  const [help, setHelp] = useState(false);
  const [questExpanded, setQuestExpanded] = useState(true);
  const completedGoals = model.goals.filter((goal) => goal.done).length;
  const hasSubmenu = model.tool === 'plant' || model.tool === 'build';
  const building = model.tool === 'build';
  const canAct = building ? !!model.build?.canPlace : model.context.canAct;
  const perform = building ? actions.onConfirmBuild : actions.onInteract;
  const actionName = building ? '建在这里' : model.context.action;
  useEffect(() => { if (!model.paused) setHelp(false); }, [model.paused]);
  const openHelp = () => { setHelp(true); actions.onPause(); };
  return <div className={`game-hud ${hasSubmenu ? 'has-submenu' : ''} ${building ? 'is-building' : ''} ${model.reducedMotion ? 'reduced-motion' : ''}`}>
    <header className="hud-header">
      <div className="forest-badge">
        <span className="badge-mark"><Icon name="tree" size={35}/></span>
        <div><p className="forest-name">森林之家</p><div className="forest-time"><Icon name="sun" size={16}/><span>第 {model.day} 天</span><i/><span>{model.clockLabel}</span></div></div>
      </div>
      <div className="resource-bar" aria-label="背包资源">
        <div className="resource" aria-label={`木材 ${model.inventory.wood}`} title="木材"><Icon name="wood"/><span>{model.inventory.wood}</span><small>木材</small></div>
        <div className="resource" aria-label={`树苗 ${model.inventory.saplings}`} title="树苗"><Icon name="tree"/><span>{model.inventory.saplings}</span><small>树苗</small></div>
        <div className="resource" aria-label={`种子 ${model.inventory.seeds}`} title="种子"><Icon name="seed"/><span>{model.inventory.seeds}</span><small>种子</small></div>
        <div className="resource" aria-label={`萝卜 ${model.inventory.carrots}`} title="萝卜"><Icon name="carrot"/><span>{model.inventory.carrots}</span><small>萝卜</small></div>
      </div>
      <div className="header-actions">
        <RoundButton icon={model.soundOn ? 'sound' : 'muted'} label={model.soundOn ? '关闭音效' : '开启音效'} onClick={actions.onToggleSound} active={model.soundOn} className="sound-toggle"/>
        <RoundButton icon="help" label="操作帮助" onClick={openHelp}/>
        <RoundButton icon="pause" testId="pause" label="暂停游戏" onClick={() => { setHelp(false); actions.onPause(); }}/>
      </div>
    </header>
    {model.goals.length > 0 && <section className={`quest-slip ${questExpanded ? 'expanded' : ''}`} aria-label="林间心愿">
      <button className="quest-toggle" onClick={() => setQuestExpanded(!questExpanded)} aria-expanded={questExpanded}>
        <span className="quest-title"><span className="quest-eyebrow">林间心愿</span><strong>{completedGoals === model.goals.length ? '这里，已经是家了' : '第一间林中小屋'}</strong></span>
        <span className="quest-count">{completedGoals}<small> / {model.goals.length}</small></span>
        <Icon name="arrow" size={14}/>
      </button>
      {questExpanded && <ul>{model.goals.map((goal) => <li key={goal.id} className={goal.done ? 'done' : ''}><span className="goal-dot">{goal.done && <Icon name="check" size={12}/>}</span>{goal.label}</li>)}</ul>}
    </section>}
    <div className="zoom-control" aria-label="调整视角缩放">
      <RoundButton icon="plus" label="拉近视角" onClick={() => actions.onZoom(1)}/>
      <RoundButton icon="minus" label="拉远视角" onClick={() => actions.onZoom(-1)}/>
    </div>
    <div className="play-hint"><span><kbd>W A S D</kbd> 移动</span><i/><span>点地面前往</span><i/><span><kbd>E</kbd> 做事</span></div>
    <div className="action-context" aria-live="polite" aria-atomic="true">
      <p className="target-title">{model.context.title}</p>
      <div className="context-main"><span className="context-dot"/><span>{building && model.build ? `${model.build.cost} 木材 · ${model.build.reason || '选好位置，搭起来吧'}` : model.context.detail || '靠近身边的树木与土地'}</span></div>
      {model.context.progress != null && <div className="context-progress" role="progressbar" aria-label="成长进度" aria-valuenow={Math.round(model.context.progress * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.min(1, Math.max(0, model.context.progress)) * 100}%` }}/></div>}
      <button className={`context-action ${canAct ? 'ready' : ''}`} data-testid={building ? "build-confirm" : "action"} onClick={perform} disabled={!canAct}><kbd>{building ? '确认' : 'E'}</kbd>{actionName}<Icon name="arrow" size={14} className="context-enter"/></button>
    </div>
    {model.toast && <div key={model.toast.key ?? model.toast.text} className={`game-toast ${model.toast.tone || 'neutral'}`} role="status">{model.toast.tone === 'good' && <Icon name="check" size={17}/>}<span>{model.toast.text}</span></div>}
    {model.tool === 'plant' && <div className="tool-submenu plant-menu" aria-label="选择种植物">
      <button data-testid="plant-tree" className={model.plantKind === 'tree' ? 'chosen' : ''} aria-pressed={model.plantKind === 'tree'} onClick={() => actions.onPlantKind('tree')}><Icon name="tree" size={27}/><span>小树苗</span><small>×1</small></button>
      <button data-testid="plant-carrot" className={model.plantKind === 'carrot' ? 'chosen' : ''} aria-pressed={model.plantKind === 'carrot'} onClick={() => actions.onPlantKind('carrot')}><Icon name="carrot" size={27}/><span>萝卜种子</span><small>×1</small></button>
    </div>}
    {building && <div className="tool-submenu build-menu" aria-label="选择建筑">
      <button data-testid="build-cabin" className={model.buildKind === 'cabin' ? 'chosen' : ''} aria-pressed={model.buildKind === 'cabin'} onClick={() => actions.onBuildKind('cabin')}><Icon name="build" size={27}/><span>小木屋</span></button>
      <button data-testid="build-fence" className={model.buildKind === 'fence' ? 'chosen' : ''} aria-pressed={model.buildKind === 'fence'} onClick={() => actions.onBuildKind('fence')}><Icon name="fence" size={27}/><span>围栏</span></button>
      <button className="rotate-button" data-testid="build-rotate" onClick={actions.onRotate} title="旋转 · R"><Icon name="rotate" size={21}/><span>旋转</span></button>
      <button className="cancel-build" data-testid="build-cancel" onClick={actions.onCancelBuild} title="取消建造"><Icon name="close" size={20}/><span>取消</span></button>
    </div>}
    <div className="touch-controls">
      <Joystick onMove={actions.onMove} disabled={model.paused}/>
      <button className={`touch-action ${canAct ? 'ready' : ''}`} data-testid={building ? "touch-build-confirm" : "touch-action"} aria-label={actionName} disabled={!canAct} onClick={perform}><Icon name={building ? 'check' : model.tool} size={34}/><span>{actionName}</span></button>
    </div>
    <nav className="toolbelt" aria-label="工具栏">{tools.map((tool, index) => <button key={tool.id} data-tool={tool.id} className={`tool-slot ${model.tool === tool.id ? 'selected' : ''}`} aria-label={`${tool.name} · ${tool.hint} · 快捷键 ${index + 1}`} aria-pressed={model.tool === tool.id} title={`${tool.name} · ${tool.hint} (${index + 1})`} onClick={() => actions.onSelectTool(tool.id)}><kbd>{index + 1}</kbd><Icon name={tool.id} size={42}/><span>{tool.name}</span>{model.tool === tool.id && <i className="selected-mark"/>}</button>)}</nav>
    {model.paused && <GameModal help={help} model={model} actions={actions}/>}
  </div>;
}
