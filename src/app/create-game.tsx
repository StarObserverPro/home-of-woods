import { createRoot } from 'react-dom/client';
import { BUILDINGS, GAME } from '../content/config';
import { createGameState, dispatch, getContextAction, tick, validatePlacement } from '../domain/game-state';
import { deserializeGame, serializeGame } from '../domain/save';
import { findPath } from '../domain/navigation';
import type { GameCommand, GameState, Selection, Tool, Vec2 } from '../domain/types';
import { snapToGrid } from '../world/surface';
import { createScene } from '../scene/create-scene';
import { Hud, type HudActions, type HudModel } from '../ui/Hud';
import { createRuntimeLoop } from './runtime-loop';
import { createSaveController } from './save-controller';
import { createAudio } from './audio';

const toolOrder: Tool[] = ['axe', 'hoe', 'water', 'plant', 'build'];
const toolTitles: Record<Tool, string> = { axe: '树荫下，慢慢来', hoe: '开出一小块田', water: '给小苗喝点水', plant: '在这里种下新生命', build: '搭起自己的家' };

export function createGame(host: HTMLElement, hudHost: HTMLElement) {
  let storage: Storage | null = null;
  try { storage = localStorage; } catch { /* The game remains playable if browser storage is denied. */ }
  const saves = createSaveController(storage), audio = createAudio(), react = createRoot(hudHost);
  let state = saves.load();
  let selection: Selection = { tool: 'axe', plant: 'tree', building: 'cabin', rotation: 0 };
  let chosen: Vec2 | null = null, destination: Vec2 | null = null, route: Vec2[] = [], routeIndex = 0;
  let paused = false, contextLost = false, frozen = false, destroyed = false, soundOn = true;
  let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let touchX = 0, touchY = 0, hudElapsed = 0, saveElapsed = 0, cooldown = 0, stalled = 0;
  let toast: HudModel['toast'] = { text: saves.protectedOriginal ? saves.status : '欢迎来到森林。走近一棵树，挥动斧头试试。', tone: saves.protectedOriginal ? 'warn' : 'neutral', key: 1 };
  let toastUntil = saves.protectedOriginal ? 15 : 6, toastCounter = 1;
  const keys = new Set<string>();
  let view: ReturnType<typeof createScene>;

  const clearInput = () => { keys.clear(); touchX = 0; touchY = 0; destination = null; route = []; view?.setDestination(null); };
  const canRun = () => !paused && !contextLost && !frozen && !document.hidden && !destroyed;
  const showToast = (text: string, tone: 'good' | 'warn' | 'neutral' = 'neutral') => { toast = { text, tone, key: ++toastCounter }; toastUntil = state.time + 3.2; };
  const getContext = () => getContextAction(state, selection, chosen ?? undefined);
  const updateHud = () => {
    if (destroyed) return;
    const context = getContext();
    const position = context.target;
    const placement = selection.tool === 'build' && position ? validatePlacement(state, selection.building, position, selection.rotation) : null;
    view.sync(state, selection, position, placement);
    const selectedTree = state.trees.find(t => t.id === context.targetId);
    const selectedPlot = state.plots.find(p => p.id === context.targetId);
    const minute = Math.floor(480 + (state.time % GAME.daySeconds) / GAME.daySeconds * 720);
    const title = selectedTree ? selectedTree.stage === 'mature' ? '枝叶茂盛的大树' : selectedTree.stage === 'young' ? '正在长大的小树' : '刚种下的小树苗' : selectedPlot ? selectedPlot.crop ? '胡萝卜田' : '松软的田地' : toolTitles[selection.tool];
    const model: HudModel = {
      tool: selection.tool, plantKind: selection.plant, buildKind: selection.building,
      day: Math.floor(state.time / GAME.daySeconds) + 1, clockLabel: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
      inventory: { ...state.inventory }, paused, soundOn, reducedMotion, saveStatus: saves.status,
      context: { title, action: context.label, detail: context.reason ? `${context.reason} · ${context.detail}` : context.detail, canAct: context.enabled && !contextLost,
        progress: selectedPlot?.crop && selectedPlot.watered ? selectedPlot.growth / GAME.cropSeconds : selectedTree && selectedTree.stage !== 'mature' ? selectedTree.age / GAME.treeMatureSeconds : undefined },
      goals: [
        { id: 'wood', label: `采集木材 ${Math.min(state.progress.chopped * 4, 12)} / 12`, done: state.progress.chopped >= 3 },
        { id: 'plant', label: '种下新树，收获一畦萝卜', done: state.progress.planted > 0 && state.progress.harvested > 0 },
        { id: 'home', label: '搭起第一间小木屋', done: state.buildings.some(b => b.kind === 'cabin') },
      ],
      toast: state.time < toastUntil ? toast : undefined,
      build: placement ? { cost: BUILDINGS[selection.building].wood, canPlace: placement.valid, reason: placement.reason, rotation: selection.rotation } : undefined,
    };
    react.render(<Hud model={model} actions={actions}/>);
  };

  const apply = (command: GameCommand, fromQA = false) => {
    if ((!canRun() && !fromQA) || destroyed) return { ok: false, reason: '游戏暂停中', events: [] };
    const result = dispatch(state, command);
    if (result.ok) {
      view.event(result.events);
      for (const event of result.events) {
        audio.play(event.type);
        if (event.type === 'fell') showToast(`木材 +${event.amount ?? 4} · 树苗 +1`, 'good');
        else if (event.type === 'harvest') showToast('胡萝卜 +3 · 种子 +2', 'good');
        else if (event.type === 'build') showToast(command.type === 'build' && command.kind === 'cabin' ? '小屋盖好了。这里就是你的家。' : '围栏搭好了', 'good');
        else if (event.type === 'plant') showToast(selection.plant === 'tree' ? '小树扎下根了' : '种子种好了，记得浇水', 'good');
        else if (event.type === 'water') showToast('小苗喝饱水，开始长大了', 'good');
      }
      if (result.events.length) saves.write(state);
    } else showToast(result.reason ?? '换个位置试试', 'warn');
    updateHud(); return result;
  };
  const interact = () => {
    if (cooldown > 0 || !canRun()) return;
    if (selection.tool === 'build') { confirmBuild(); return; }
    cooldown = 0.3; apply({ type: 'interact', selection, target: chosen ?? undefined });
  };
  const confirmBuild = () => {
    if (cooldown > 0 || !canRun()) return;
    const target = getContext().target; if (!target) return;
    cooldown = 0.3; apply({ type: 'build', kind: selection.building, position: target, rotation: selection.rotation });
  };
  const pause = () => { if (destroyed) return; paused = true; clearInput(); loop.pause(); saves.write(state); updateHud(); };
  const resume = () => { if (destroyed) return; paused = false; clearInput(); if (canRun()) loop.resume(); updateHud(); };
  const selectTool = (tool: Tool) => { selection = { ...selection, tool }; clearInput(); chosen = null; cooldown = 0; updateHud(); };
  const actions: HudActions = {
    onSelectTool: selectTool,
    onPlantKind: plant => { selection = { ...selection, plant }; updateHud(); },
    onBuildKind: building => { selection = { ...selection, building }; updateHud(); },
    onRotate: () => { selection.rotation = ((selection.rotation + 1) % 4) as Selection['rotation']; updateHud(); },
    onInteract: interact, onConfirmBuild: confirmBuild, onCancelBuild: () => selectTool('axe'), onPause: pause, onResume: resume,
    onMove: (x, y) => { touchX = x; touchY = y; if (x || y) { destination = null; route = []; chosen = null; view.setDestination(null); } },
    onZoom: delta => view.zoom(delta * 0.12),
    onToggleSound: () => { soundOn = !soundOn; audio.setEnabled(soundOn); updateHud(); },
    onReducedMotion: value => { reducedMotion = value; view.setReducedMotion(value); updateHud(); },
  };
  const navigate = (position: Vec2) => {
    route = findPath(state, position); routeIndex = 0; stalled = 0;
    destination = route.length ? route[route.length - 1] : null; view.setDestination(destination);
    if (!route.length) showToast('这里走不过去，换个落脚点试试', 'warn');
  };
  view = createScene(host, state, {
    onTarget: (position, entityId) => {
      if (!canRun()) return;
      chosen = snapToGrid(position);
      if (entityId && selection.tool !== 'build' && Math.hypot(position.x - state.player.x, position.z - state.player.z) > GAME.interactionRange) {
        const dx = state.player.x - position.x, dz = state.player.z - position.z, length = Math.hypot(dx, dz);
        navigate({ x: position.x + dx / length * 1.65, z: position.z + dz / length * 1.65 });
      }
      updateHud();
    },
    onDestination: position => {
      if (canRun() && (selection.tool === 'axe' || selection.tool === 'water')) { chosen = null; navigate(position); }
    },
    onZoom: delta => view.zoom(delta),
    onContextLost: () => { contextLost = true; clearInput(); loop.pause(); showToast('画面正在恢复，进度已暂存', 'warn'); saves.write(state); updateHud(); },
    onContextRestored: () => { contextLost = false; view.frame(0, state); if (canRun()) loop.resume(); updateHud(); },
  });
  view.setReducedMotion(reducedMotion);

  const loop = createRuntimeLoop({
    step: dt => {
      let screenX = touchX + (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      let screenY = touchY + (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
      let x = screenX * 0.8 + screenY * 0.6, z = -screenX * 0.6 + screenY * 0.8;
      if (route.length && Math.abs(screenX) + Math.abs(screenY) < 0.05) {
        let point = route[routeIndex];
        if (point && Math.hypot(point.x - state.player.x, point.z - state.player.z) < 0.16) point = route[++routeIndex];
        if (!point) { route = []; destination = null; view.setDestination(null); }
        else { x = point.x - state.player.x; z = point.z - state.player.z; const length = Math.hypot(x, z); x /= Math.max(length, 0.001); z /= Math.max(length, 0.001); }
      }
      if (Math.abs(x) + Math.abs(z) > 0.01) {
        const beforeX = state.player.x, beforeZ = state.player.z;
        dispatch(state, { type: 'move', x, z, dt });
        stalled = Math.hypot(state.player.x - beforeX, state.player.z - beforeZ) < 0.001 ? stalled + dt : 0;
        if (stalled > 0.8) { route = []; destination = null; view.setDestination(null); }
      }
      tick(state, dt); cooldown = Math.max(0, cooldown - dt); hudElapsed += dt; saveElapsed += dt;
      if (saveElapsed >= 2) { saves.write(state); saveElapsed = 0; }
      if (hudElapsed >= 0.12) { updateHud(); hudElapsed = 0; }
    },
    frame: dt => view.frame(dt, state),
  });
  const keydown = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest('[role="dialog"],input,textarea,select')) return;
    const key = e.key.toLowerCase();
    if (key === ' ' && el?.closest('button')) return;
    if (key === 'escape') { e.preventDefault(); if (selection.tool === 'build' && !paused) actions.onCancelBuild(); else if (paused) resume(); else pause(); return; }
    if (!canRun()) return;
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      e.preventDefault(); keys.add(key); chosen = null; destination = null; route = []; view.setDestination(null);
    }
    if (e.repeat) return;
    if ('12345'.includes(key) && key.length === 1) { e.preventDefault(); selectTool(toolOrder[Number(key) - 1]); }
    else if (key === 'e' || key === ' ') { e.preventDefault(); interact(); }
    else if (key === 'r' && selection.tool === 'build') { e.preventDefault(); actions.onRotate(); }
  };
  const keyup = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  const visibility = () => { clearInput(); if (document.hidden) { loop.pause(); saves.write(state); } else if (canRun()) loop.resume(); };
  const pagehide = () => { clearInput(); loop.pause(); saves.write(state); };
  const pageshow = () => { if (canRun()) loop.resume(); };
  document.addEventListener('keydown', keydown); document.addEventListener('keyup', keyup); document.addEventListener('visibilitychange', visibility);
  window.addEventListener('blur', clearInput); window.addEventListener('pagehide', pagehide); window.addEventListener('pageshow', pageshow);
  updateHud(); if (canRun()) loop.start();

  const destroy = () => {
    if (destroyed) return; saves.write(state); destroyed = true; loop.destroy(); clearInput();
    document.removeEventListener('keydown', keydown); document.removeEventListener('keyup', keyup); document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('blur', clearInput); window.removeEventListener('pagehide', pagehide); window.removeEventListener('pageshow', pageshow);
    react.unmount(); view.destroy(); audio.destroy();
    if (import.meta.env.DEV) window.__VISUAL_READY__ = false;
  };
  if (import.meta.env.DEV) {
    window.__HOW__ = {
      state: () => JSON.parse(serializeGame(state)) as GameState,
      command: command => { const result = apply(command, true); view.frame(0, state); return result; },
      target: position => { chosen = position; updateHud(); view.frame(0, state); },
      camera: options => { view.setCamera(options); view.frame(0, state); },
      project: position => view.project(position),
      metrics: () => ({ ...view.metrics(), running: loop.isRunning, steps: loop.stepCount, saveStatus: saves.status }),
      pause, resume,
      freeze: value => { frozen = value; if (value) loop.pause(); else if (canRun()) loop.resume(); updateHud(); view.frame(0, state); },
      load: value => {
        const result = deserializeGame(typeof value === 'string' ? value : JSON.stringify(value));
        if (!result.ok) throw new Error(result.error);
        clearInput(); state = result.state; chosen = null; toast = undefined; toastUntil = 0; updateHud(); view.frame(0, state);
      },
      reset: () => { state = createGameState(); selection = { tool: 'axe', plant: 'tree', building: 'cabin', rotation: 0 }; chosen = null; clearInput(); updateHud(); view.frame(0, state); },
      destroy,
    };
    window.__VISUAL_READY__ = true;
  }
  return { destroy };
}

declare global {
  interface Window {
    __VISUAL_READY__?: boolean;
    __HOW__?: {
      state(): GameState; command(command: GameCommand): ReturnType<typeof dispatch>;
      target(position: Vec2 | null): void; camera(options: { x?: number; z?: number; zoom?: number }): void;
      project(position: Vec2): { x: number; y: number };
      metrics(): Record<string, unknown>; pause(): void; resume(): void; freeze(value: boolean): void;
      load(value: GameState | string): void; reset(): void; destroy(): void;
    };
  }
}
