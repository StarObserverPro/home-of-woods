import {EXPEDITIONS, EXPEDITION_BY_ID} from '../content/forest-expedition.ts';
import type {ExpeditionId, ExpeditionPoint} from '../content/forest-expedition.ts';
import {createExpeditionLayout, expeditionCanStand, expeditionHabitatAt, expeditionSegmentWalkable, findExpeditionPath} from '../world/forest-expedition.ts';
import type {ExpeditionLayout} from '../world/forest-expedition.ts';
import {advanceExpedition, beginExpeditionGather, beginExpeditionProcess, cancelExpeditionAction, changeExpeditionCarrying, claimExpeditionContainer,
  createForestExpedition, expeditionLoad, expeditionSnapshot, moveExpeditionPlayer, restoreForestExpedition, serializeForestExpedition, switchExpeditionMap} from '../domain/forest-expedition.ts';
import type {ExpeditionContext, ExpeditionResult, ForestExpeditionSnapshot} from '../domain/forest-expedition.ts';
import type {CarryIntent} from '../domain/carrying.ts';
import {createForestExpeditionScene} from '../scene/forest-expedition-scene.ts';
import type {ExpeditionPick, ExpeditionSceneView} from '../scene/forest-expedition-scene.ts';
import {createLoop} from './runtime-loop.ts';

export type ExpeditionAppView = {
  domain: ForestExpeditionSnapshot; layout: ExpeditionLayout; selected: ExpeditionPick | null; habitat: string;
  message: string; paused: boolean; moving: boolean; running: boolean; error: string | null;
  saveStatus: 'saved' | 'pending' | 'unavailable';
};
const SAVE_KEY = 'home-of-woods.forest-expedition.v1';

/** The one application owner for time, commands, movement, frame scheduling and sample persistence. */
export async function createForestExpeditionRuntime(canvas: HTMLCanvasElement, options: {
  /** Development harnesses may exercise the actual UI/domain without a GPU. */
  createScene?: typeof createForestExpeditionScene; storageKey?: string;
} = {}) {
  const storageKey = options.storageKey ?? SAVE_KEY;
  // Let the loading view paint before each bounded navigation-grid build.
  const layouts = {} as Record<ExpeditionId, ExpeditionLayout>;
  for (const definition of EXPEDITIONS) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    layouts[definition.id] = createExpeditionLayout(definition.id);
  }
  const context: ExpeditionContext = {maps: layouts,
    canStand: (id, point) => expeditionCanStand(layouts[id], point.x, point.z),
    canInteract: (id, from, to) => expeditionSegmentWalkable(layouts[id], from, to, .24),
  };
  let state = createForestExpedition(context), saveAvailable = true, saveStatus: ExpeditionAppView['saveStatus'] = 'saved';
  let message = '点地面走动，点林间物产查看；走近后再采集。', error: string | null = null;
  try {const saved = localStorage.getItem(storageKey); if (saved) state = restoreForestExpedition(saved, context);}
  catch {saveAvailable = false; saveStatus = 'unavailable'; message = '已有样区记录暂时无法读取，先保留原记录；本次可临时游玩。';}
  const scene = await (options.createScene ?? createForestExpeditionScene)(canvas);
  try {scene.setMap(layouts[state.activeMapId]);} catch (error) {scene.dispose(); throw error;}
  let selected: ExpeditionPick | null = null, paused = false, panelOpen = false, running = false, destroyed = false, contextLost = false;
  let vector = {x: 0, y: 0}, route: ExpeditionPoint[] = [], facing = Math.PI, speed = 0;
  let lastPublish = -1, lastSave = state.time, lastSavedRevision = state.revision, lastSavedTime = state.time;
  let published: ExpeditionAppView, snapshot = expeditionSnapshot(state, context);
  const listeners = new Set<() => void>(), keys = new Set<string>(), removers: (() => void)[] = [];
  function publish() {
    snapshot = expeditionSnapshot(state, context);
    published = {domain: snapshot, layout: layouts[state.activeMapId], selected, habitat: expeditionHabitatAt(state.activeMapId, state.player.x, state.player.z).name,
      message, paused, moving: route.length > 0 || speed > .01, running, error, saveStatus};
    for (const listener of listeners) listener();
    lastPublish = state.time;
  }
  function save() {
    if (!saveAvailable || (lastSavedRevision === state.revision && lastSavedTime === state.time)) return;
    try {localStorage.setItem(storageKey, serializeForestExpedition(state)); saveStatus = 'saved'; lastSavedRevision = state.revision; lastSavedTime = state.time; lastSave = state.time;}
    catch {saveAvailable = false; saveStatus = 'unavailable'; message = '当前浏览器未能保存进度，请先保持此页打开。';}
  }
  function commit(result: ExpeditionResult, persist = true) {
    const before = state; state = result.state;
    if (result.message) message = result.message;
    if (state !== before && saveAvailable) saveStatus = 'pending';
    if (persist) save();
    publish(); return result;
  }
  function clearMovement() {keys.clear(); vector = {x: 0, y: 0}; speed = 0;}
  function stopRoute() {route = []; scene.destination(null);}
  function walkTo(point: ExpeditionPoint) {
    if (paused) {message = '先继续漫步。'; publish(); return;}
    const next = findExpeditionPath(layouts[state.activeMapId], state.player, point);
    if (!next.length) {message = '这条路暂时走不通，试试沿小径靠近。'; publish(); return;}
    if (state.action) state = cancelExpeditionAction(state).state;
    route = next; scene.destination(point); message = '沿林间小径走近。'; publish();
  }
  function select(pick: ExpeditionPick | null) {
    if (!pick) {selected = null; publish(); return;}
    if (pick.kind === 'ground') {selected = null; walkTo(pick.point); return;}
    selected = pick; publish();
  }
  function primary() {
    if (!selected || paused) return;
    stopRoute();
    if (selected.kind === 'source') {
      const result = commit(beginExpeditionGather(state, selected.id, context));
      if (result.approach) walkTo(result.approach);
    } else if (selected.kind === 'drop') {
      const result = commit(changeExpeditionCarrying(state, {kind: 'take', key: selected.key, quantity: 'max'}, context));
      if (result.approach) walkTo(result.approach);
    } else if (selected.kind === 'landmark') {
      const landmark = layouts[state.activeMapId].landmarks.find(mark => mark.id === (selected as {id: string}).id);
      if (landmark) walkTo(landmark.approach);
    } else if (selected.kind === 'supply') walkTo(layouts[state.activeMapId].supply);
  }
  function switchMap(id: ExpeditionId) {
    if (id === state.activeMapId) return;
    const result = switchExpeditionMap(state, id, context); if (!result.ok) {commit(result); return;}
    clearMovement(); stopRoute(); selected = null; state = result.state; message = `${EXPEDITION_BY_ID[id].name} · ${result.message}`;
    scene.setMap(layouts[id]); scene.resetCamera(); save(); publish(); render(0);
  }
  function move(dt: number) {
    const x = vector.x + (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    const z = vector.y + (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    const manual = Math.hypot(x, z) > .05;
    if (!manual && !route.length) {speed = 0; return;}
    if (manual) stopRoute();
    let dx: number, dz: number, available = Infinity;
    if (manual) {const yaw = scene.yaw(), length = Math.max(1, Math.hypot(x, z)); dx = (x * Math.cos(yaw) + z * Math.sin(yaw)) / length; dz = (-x * Math.sin(yaw) + z * Math.cos(yaw)) / length;}
    else {
      const next = route[0]; dx = next.x - state.player.x; dz = next.z - state.player.z; available = Math.hypot(dx, dz);
      if (available < .08) {route.shift(); if (!route.length) {scene.destination(null); message = '到了。可以查看或收取身边的物产。';} speed = 0; return;}
      dx /= available; dz /= available;
    }
    const amount = Math.min(available, 3.8 * ((running || keys.has('shift')) ? 1.6 : 1) * expeditionLoad(state).speed * dt);
    const from = state.player, next = {x: from.x + dx * amount, z: from.z + dz * amount}, layout = layouts[state.activeMapId];
    let destination: ExpeditionPoint | null = expeditionSegmentWalkable(layout, from, next) ? next : null;
    // A manual nudge can slide along a trunk; click paths are already checked as full segments.
    if (!destination && manual) for (const candidate of [{x: next.x, z: from.z}, {x: from.x, z: next.z}]) {
      if (expeditionSegmentWalkable(layout, from, candidate)) {destination = candidate; break;}
    }
    if (destination) {
      const result = moveExpeditionPlayer(state, destination, context); state = result.state;
      if (result.message) message = result.message;
      const actualX = state.player.x - from.x, actualZ = state.player.z - from.z;
      speed = dt > 0 ? Math.hypot(actualX, actualZ) / dt : 0;
      if (speed > .01) facing = Math.atan2(actualX, actualZ);
      if (saveAvailable) saveStatus = 'pending';
    } else {speed = 0; if (!manual) {stopRoute(); message = '前面过不去，换一个落脚点。';}}
  }
  function render(dt: number) {
    const view: ExpeditionSceneView = {player: {...state.player, facing, speed}, gathering: !!state.action, carryingWood: snapshot.carried.some(stack => stack.itemId === 'wood' || stack.itemId === 'branch'), sources: state.sources, drops: snapshot.ground, selected};
    scene.render(view, dt);
  }
  function tick(dt: number, draw = true) {
    if (destroyed) return;
    const active = !paused && !panelOpen && !contextLost;
    if (active) {
      move(dt);
      const result = advanceExpedition(state, state.time + dt, context), changed = result.state.revision !== state.revision; state = result.state;
      if (result.message) message = result.message;
      if (changed) {save(); publish();}
      if (state.time - lastSave >= 3) save();
    }
    if (state.time - lastPublish > .12 || lastPublish < 0) publish();
    if (draw) render(active ? dt : 0);
  }
  const loop = createLoop(dt => {try {tick(dt);} catch (failure) {paused = true; error = failure instanceof Error ? failure.message : '林地暂时停下了'; clearMovement(); publish();}},
    {request: callback => window.requestAnimationFrame(callback), cancel: id => window.cancelAnimationFrame(id)}, clearMovement);

  function listen<T extends EventTarget>(target: T, type: string, callback: EventListener, options?: AddEventListenerOptions) {
    target.addEventListener(type, callback, options); removers.push(() => target.removeEventListener(type, callback, options));
  }
  listen(window, 'keydown', ((event: KeyboardEvent) => {
    if (panelOpen || event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    if (['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright','shift'].includes(key)) {if (!paused) {event.preventDefault(); keys.add(key);}}
    if (event.repeat) return;
    if (key === 'q') scene.orbit(18); else if (key === 'e') scene.orbit(-18);
  }) as EventListener);
  listen(window, 'keyup', ((event: KeyboardEvent) => {keys.delete(event.key.toLowerCase());}) as EventListener);
  listen(window, 'blur', (() => {clearMovement(); save();}) as EventListener);
  listen(document, 'visibilitychange', (() => {clearMovement(); save(); loop.setPaused(document.hidden || contextLost);}) as EventListener);
  listen(canvas, 'webglcontextlost', (event => {
    event.preventDefault(); contextLost = true; clearMovement(); stopRoute(); save(); loop.setPaused(true);
    message = '画面暂时中断，进度与时间已经停下。'; publish();
  }) as EventListener);
  listen(canvas, 'webglcontextrestored', (() => {
    if (destroyed) return; contextLost = false; message = '画面已恢复，可以继续漫步。'; publish(); loop.setPaused(document.hidden);
  }) as EventListener);
  listen(window, 'pagehide', (() => save()) as EventListener);
  const pointers = new Map<number, {x: number; y: number}>(); let start = {x: 0, y: 0}, dragged = false, pinch = 0;
  listen(canvas, 'contextmenu', (event => event.preventDefault()) as EventListener);
  listen(canvas, 'pointerdown', ((event: PointerEvent) => {
    if (panelOpen || paused) return;
    canvas.setPointerCapture(event.pointerId); pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
    if (pointers.size === 1) {start = {x: event.clientX, y: event.clientY}; dragged = false;}
    if (pointers.size === 2) {const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); dragged = true;}
  }) as EventListener);
  listen(canvas, 'pointermove', ((event: PointerEvent) => {
    const previous = pointers.get(event.pointerId); if (!previous || panelOpen) return;
    const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
    pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
    if (pointers.size === 2) {const [a, b] = [...pointers.values()], current = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) scene.zoom((pinch - current) * 4); pinch = current;}
    else if (dragged || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7) {dragged = true; scene.orbit(dx, dy);}
  }) as EventListener);
  listen(canvas, 'pointerup', ((event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    if (!dragged && !panelOpen && !paused) select(scene.pick(event.clientX, event.clientY));
    pointers.delete(event.pointerId); pinch = 0;
  }) as EventListener);
  listen(canvas, 'pointercancel', ((event: PointerEvent) => {pointers.delete(event.pointerId); pinch = 0; dragged = true;}) as EventListener);
  listen(canvas, 'wheel', ((event: WheelEvent) => {if (!panelOpen) {event.preventDefault(); scene.zoom(event.deltaY);}}) as EventListener, {passive: false});
  const resizeObserver = new ResizeObserver(() => scene.resize()); resizeObserver.observe(canvas);
  publish(); render(0); loop.setPaused(document.hidden);
  const runtime = {
    snapshot: () => published,
    subscribe(listener: () => void) {listeners.add(listener); return () => {listeners.delete(listener);};},
    switchMap, select, primary, walkTo,
    returnToSupply() {selected = {kind: 'supply'}; walkTo(layouts[state.activeMapId].supply);},
    carry(intent: CarryIntent) {const result = commit(changeExpeditionCarrying(state, intent, context)); if (result.approach) walkTo(result.approach);},
    process(recipeId: string) {commit(beginExpeditionProcess(state, recipeId, context));},
    claimContainer() {commit(claimExpeditionContainer(state, context));},
    cancel() {stopRoute(); clearMovement(); commit(cancelExpeditionAction(state));},
    setPaused(value: boolean) {paused = value; clearMovement(); save(); publish();},
    setPanelOpen(value: boolean) {panelOpen = value; clearMovement(); pointers.clear(); if (value) stopRoute(); publish();},
    setMoveVector(x: number, y: number) {vector = {x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y))};},
    setRunning(value: boolean) {running = value; publish();},
    orbit: scene.orbit, zoom: scene.zoom, resetCamera: scene.resetCamera,
    dispose() {if (destroyed) return; save(); destroyed = true; loop.destroy(); removers.forEach(remove => remove()); resizeObserver.disconnect(); listeners.clear(); scene.dispose(); if (inspectionInstalled) delete (window as unknown as Record<string, unknown>).__forestExpedition;},
  };
  let inspectionInstalled = false;
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('inspect')) {
    inspectionInstalled = true;
    (window as unknown as Record<string, unknown>).__forestExpedition = {
      snapshot: () => ({...structuredClone(published.domain), selected, message, paused, panelOpen, route: structuredClone(route), scene: scene.stats(), loop: loop.stats(), saveStatus}),
      layout: () => ({...layouts[state.activeMapId], grid: undefined}),
      project: scene.project,
      camera(name: 'near' | 'design' | 'far') {scene.bookmark(name); render(0);},
      diagnostic(mode: 'final' | 'terrain' | 'wood') {scene.diagnostic(mode); render(0);},
      /** Bounded fixed steps run the same tick and temporarily suspend its only scheduler. */
      advance(seconds: number) {
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > 5) throw new Error('Inspection steps must be between zero and five seconds');
        const wasRunning = loop.stats().running; loop.setPaused(true);
        try {for (let left = seconds; left > 1e-8;) {const dt = Math.min(1 / 30, left); tick(dt, false); left -= dt;} publish(); render(0);}
        finally {if (wasRunning && !document.hidden) loop.setPaused(false);}
      },
    };
  }
  return runtime;
}
export type ForestExpeditionRuntime = Awaited<ReturnType<typeof createForestExpeditionRuntime>>;
