import type { ForestExpeditionSnapshot } from '../domain/forest-expedition.ts';
import type { ExpeditionLayout } from '../world/forest-expedition.ts';
import '../../sandbox/forest-expedition/inspection.css';

type InspectionSnapshot = ForestExpeditionSnapshot & {
  scene?: Record<string, unknown>; loop?: Record<string, unknown>;
  selected?: { kind: string; id?: string } | null; route?: { x: number; z: number }[];
  message?: string; paused?: boolean; panelOpen?: boolean; saveStatus?: string;
};
type InspectionApi = {
  snapshot(): InspectionSnapshot;
  layout(): Omit<ExpeditionLayout, 'grid'> & { grid?: undefined };
  project(point: { x: number; z: number; y?: number }): { x: number; y: number; visible: boolean };
  camera(name: 'near' | 'design' | 'far'): void;
  diagnostic(mode: 'final' | 'terrain' | 'wood'): void;
  advance(seconds: number): void;
};
const rounded = (value: number, digits = 2) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const fields = (value: unknown, names: readonly string[]) => {
  const record = object(value);
  return Object.fromEntries(names.filter(name => record[name] !== undefined).map(name => [name, record[name]]));
};
function amounts(items: ForestExpeditionSnapshot['carried']) {
  const totals = new Map<string, { name: string; quantity: number }>();
  for (const item of items) {
    const row = totals.get(item.itemId) ?? { name: item.name, quantity: 0 };
    row.quantity += item.quantity; totals.set(item.itemId, row);
  }
  return [...totals.entries()].map(([itemId, row]) => ({ itemId, ...row }));
}

/** Dev-only visible QA surface. Reads on demand and borrows the existing theme and runtime. */
export function mountExpeditionInspection(host: HTMLElement): () => void {
  const view = host.ownerDocument.defaultView;
  if (!import.meta.env.DEV || !view || new URLSearchParams(view.location.search).get('inspect') !== '1') return () => {};
  if (host.querySelector('[data-expedition-inspection]')) return () => {};
  const doc = host.ownerDocument, cleanups: (() => void)[] = [];
  let disposed = false, reads = 0;
  const api = () => (view as unknown as { __forestExpedition?: InspectionApi }).__forestExpedition;
  const details = doc.createElement('details');
  details.className = 'expedition-inspection'; details.dataset.expeditionInspection = '';
  details.dataset.uiGridRoot = 'module'; details.setAttribute('aria-label', '林地运行检查');
  const summary = doc.createElement('summary');
  summary.textContent = '运行检查'; summary.dataset.timberSurface = 'button'; summary.dataset.timberTone = 'moss';
  summary.setAttribute('aria-controls', 'expedition-inspection-body'); details.append(summary);
  const body = doc.createElement('div');
  body.id = 'expedition-inspection-body'; body.className = 'expedition-inspection-body';
  body.dataset.timberSurface = 'panel'; body.dataset.timberSeed = 'forest-inspection'; body.dataset.uiGrid = 'window';
  const status = doc.createElement('p'); status.className = 'expedition-inspection-status'; status.dataset.uiGrid = 'notice';
  status.setAttribute('role', 'status'); status.textContent = '仅开发检查；状态在按下按钮后读取。';
  const output = doc.createElement('pre');
  output.className = 'expedition-inspection-output'; output.dataset.uiGrid = 'content'; output.tabIndex = 0;
  output.setAttribute('aria-label', '当前运行状态摘要'); output.textContent = '点击“读取状态”查看这一次的状态。';

  function readState(note = '读取状态') {
    if (disposed) return;
    const inspection = api();
    if (!inspection) { status.textContent = '运行时尚未就绪，请稍后再读取。'; return; }
    try {
      const snapshot = inspection.snapshot(), layout = inspection.layout(), scene = snapshot.scene ?? {};
      const nearest = [...snapshot.sources].sort((a, b) => a.distance - b.distance).slice(0, 3).map(source => {
        const site = layout.resourceSites.find(value => value.id === source.id);
        const projected = inspection.project({ ...source.point, ...(site ? { y: site.y + .7 } : {}) });
        return {
          id: source.id, name: source.name, role: source.role,
          remaining: source.remaining, capacity: source.capacity, distance: rounded(source.distance), near: source.near,
          position: { x: rounded(source.point.x), z: rounded(source.point.z) },
          screen: { x: rounded(projected.x, 0), y: rounded(projected.y, 0), visible: projected.visible },
          readyInSeconds: rounded(source.waitSeconds), reason: source.reason || null,
        };
      });
      const selected = snapshot.selected;
      const action = snapshot.action;
      const digest = {
        map: { id: snapshot.activeMapId, name: layout.definition.name, trees: layout.trees.length, sources: layout.resourceSites.length },
        timeSeconds: rounded(snapshot.time), paused: snapshot.paused, panelOpen: snapshot.panelOpen,
        player: { x: rounded(snapshot.player.x), z: rounded(snapshot.player.z) },
        carrying: { ...snapshot.carryLoad, speed: rounded(snapshot.carryLoad.speed, 3), method: snapshot.carryMethod },
        carried: amounts(snapshot.carried), stored: amounts(snapshot.stored),
        ground: snapshot.ground.map(drop => ({ name: drop.name, itemId: drop.itemId, quantity: drop.quantity, x: rounded(drop.x), z: rounded(drop.z), pendingMapId: drop.pendingMapId })),
        timber: snapshot.timber,
        action: action ? { name: action.name, kind: action.kind, progress: rounded(action.progress, 3), remainingSeconds: rounded(action.remainingSeconds) } : null,
        selected: selected ? { kind: selected.kind, ...(selected.id ? { id: selected.id } : {}) } : null,
        routePoints: snapshot.route?.length ?? 0, nearestSources: nearest,
        storage: { near: snapshot.storage.near, containerIssued: snapshot.storage.containerIssued },
        saveStatus: snapshot.saveStatus, message: snapshot.message,
        scene: {
          ...fields(scene, ['mapBuilds', 'visibleTrees', 'drawCalls', 'triangles', 'geometries', 'textures', 'renderer', 'postProcessing', 'frameMs', 'p95FrameMs']),
          viewport: fields(scene.viewport, ['width', 'height', 'dpr']),
          camera: fields(scene.camera, ['position', 'target', 'distance', 'yaw', 'pitch']),
          vegetation: fields(scene.vegetation, ['treeTemplates', 'featureTemplates', 'geometryCount', 'materialCount', 'textureCount', 'templateTriangles', 'disposed']),
        },
        loop: fields(snapshot.loop, ['running', 'paused', 'scheduled', 'executing', 'frames', 'destroyed']),
      };
      output.textContent = JSON.stringify(digest, null, 2);
      reads++; status.textContent = `${note} · 第 ${reads} 次快照 · 游戏 ${rounded(snapshot.time)} 秒`;
      details.dataset.lastRead = String(reads);
    } catch (error) { status.textContent = `检查未完成：${error instanceof Error ? error.message : '无法读取状态'}`; }
  }
  function control(label: string, title: string, action: (inspection: InspectionApi) => void, note = title) {
    const button = doc.createElement('button');
    button.type = 'button'; button.textContent = label; button.title = title;
    button.dataset.timberSurface = 'button'; button.dataset.timberTone = 'moss';
    const click = () => {
      const inspection = api();
      if (!inspection) { status.textContent = '运行时尚未就绪。'; return; }
      try { action(inspection); readState(note); }
      catch (error) { status.textContent = `检查未完成：${error instanceof Error ? error.message : '操作失败'}`; }
    };
    button.addEventListener('click', click); cleanups.push(() => button.removeEventListener('click', click));
    return button;
  }
  function row(label: string, controls: HTMLElement[]) {
    const group = doc.createElement('div'); group.className = 'expedition-inspection-group';
    const heading = doc.createElement('h3'); heading.textContent = label;
    const buttons = doc.createElement('div'); buttons.className = 'expedition-inspection-controls';
    buttons.dataset.uiGrid = 'row'; buttons.append(...controls); group.append(heading, buttons); body.append(group);
  }
  row('镜头', [
    control('近景', '切到近景镜头', inspection => inspection.camera('near')),
    control('常态', '切到常态镜头', inspection => inspection.camera('design')),
    control('远景', '切到远景镜头', inspection => inspection.camera('far')),
  ]);
  row('画面', [
    control('全貌', '显示完整画面', inspection => inspection.diagnostic('final')),
    control('地形', '检查地形', inspection => inspection.diagnostic('terrain')),
    control('枝架', '检查枝架', inspection => inspection.diagnostic('wood')),
  ]);
  row('同一运行时', [
    control('推进 5 秒', '按原有运行规则推进五秒；暂停和整理时不推进', inspection => inspection.advance(5), '已请求推进 5 秒'),
    control('读取状态', '读取一次运行状态', () => {}),
  ]);
  body.append(status, output); details.append(body); host.append(details);
  const keyboard = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); details.open = false; summary.focus(); }
  };
  details.addEventListener('keydown', keyboard);
  cleanups.push(() => details.removeEventListener('keydown', keyboard));
  return () => {
    if (disposed) return; disposed = true;
    cleanups.forEach(cleanup => cleanup()); details.remove();
  };
}
