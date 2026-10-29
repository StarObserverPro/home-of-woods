import { BUILDINGS, GAME, STARTING_PLOTS, STARTING_TREES } from '../content/config';
import { getSurface, snapToGrid, surfaceSupportsRectangle } from '../world/surface';
import { footprint, hasOccupiedFootprint, isPositionWalkable, rectanglesOverlap } from './occupancy';
import type { ActionResult, BuildingKind, ContextAction, GameCommand, GameEvent, GameState, PlacementResult, Plot, Rotation, Selection, Tree, Vec2 } from './types';

export type * from './types';
export { isPositionWalkable } from './occupancy';

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const finitePoint = (p: Vec2) => Number.isFinite(p.x) && Number.isFinite(p.z);
const fail = (reason: string): ActionResult => ({ ok: false, reason, events: [] });

export function createGameState(seed: number = GAME.seed): GameState {
  const stableSeed = Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : GAME.seed;
  return {
    schemaVersion: 1, seed: stableSeed, time: 0, revision: 0,
    player: { x: 0, z: 3, facing: -Math.PI / 2 },
    inventory: { wood: 0, seeds: 8, saplings: 3, carrots: 0 },
    trees: STARTING_TREES.map(([x, z], i) => ({
      id: `tree-start-${i + 1}`, x, z, age: GAME.treeMatureSeconds,
      stage: 'mature', hp: GAME.treeHits, variant: ((Math.imul(i + 1, 2654435761) ^ stableSeed) >>> 0) % 3,
    })),
    plots: STARTING_PLOTS.map(([x, z], i) => ({
      id: `plot-start-${i + 1}`, x, z, crop: i < 3 ? 'carrot' : null,
      watered: i < 2, growth: i === 0 ? GAME.cropSeconds : i === 1 ? 12 : 0,
    })),
    buildings: [], progress: { chopped: 0, planted: 0, harvested: 0, built: 0 }, nextId: 1,
  };
}

export function tick(state: GameState, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const dt = Math.min(seconds, 0.25);
  state.time += dt;
  for (const t of state.trees) {
    if (t.stage === 'mature') continue;
    t.age = Math.min(GAME.treeMatureSeconds, t.age + dt);
    t.stage = t.age >= GAME.treeMatureSeconds ? 'mature' : t.age >= GAME.treeYoungSeconds ? 'young' : 'sapling';
  }
  for (const p of state.plots) {
    if (p.crop && p.watered) p.growth = Math.min(GAME.cropSeconds, p.growth + dt);
  }
  state.revision++;
}

function treeAt(state: GameState, p: Vec2): Tree | undefined {
  return state.trees.find(t => distance(t, p) < 0.8);
}
function plotAt(state: GameState, p: Vec2): Plot | undefined {
  return state.plots.find(t => Math.abs(t.x - p.x) < 0.5 && Math.abs(t.z - p.z) < 0.5);
}

function nearest<T extends Vec2>(state: GameState, items: T[]): T | undefined {
  let result: T | undefined;
  let best = GAME.interactionRange + 0.001;
  for (const item of items) {
    const d = distance(state.player, item);
    if (d < best) { best = d; result = item; }
  }
  return result;
}

function actionTarget(state: GameState, selection: Selection, target?: Vec2): Vec2 {
  if (target) return snapToGrid(target);
  if (selection.tool === 'axe') {
    const tree = nearest(state, state.trees);
    if (tree) return { x: tree.x, z: tree.z };
  }
  if (selection.tool === 'water' || (selection.tool === 'plant' && selection.plant === 'carrot')) {
    const plot = nearest(state, state.plots.filter(p => selection.tool === 'water' ? p.crop && (!p.watered || p.growth >= GAME.cropSeconds) : !p.crop || p.growth >= GAME.cropSeconds));
    if (plot) return { x: plot.x, z: plot.z };
    const anyPlot = nearest(state, state.plots);
    if (anyPlot) return { x: anyPlot.x, z: anyPlot.z };
  }
  return snapToGrid({ x: state.player.x + Math.sin(state.player.facing) * 1.7, z: state.player.z + Math.cos(state.player.facing) * 1.7 });
}

function openGroundReason(state: GameState, position: Vec2, isTree: boolean): string | undefined {
  if (getSurface(position.x, position.z).kind !== 'grass' || !surfaceSupportsRectangle(position.x, position.z, 0.95, 0.95)) return '在草地上找一块空位';
  if (hasOccupiedFootprint(state, position, 1, 1)) return '这里已经有东西了';
  if (isTree && distance(state.player, position) < 0.85) return '往旁边站一点，再种树';
  if (isTree && state.trees.length >= GAME.maxTrees) return '这片树林已经很茂密了';
  if (!isTree && state.plots.length >= GAME.maxPlots) return '先照料现有的田地吧';
  return undefined;
}

export function validatePlacement(state: GameState, kind: BuildingKind, position: Vec2, rotation: Rotation): PlacementResult {
  if (!(kind in BUILDINGS) || ![0, 1, 2, 3].includes(rotation) || !finitePoint(position)) {
    return { valid: false, reason: '选择一个有效的位置', position: { x: 0, z: 0 }, width: 1, depth: 1 };
  }
  const p = snapToGrid(position);
  const f = footprint(kind, rotation);
  const result = (reason?: string): PlacementResult => ({ valid: !reason, reason, position: p, ...f });
  if (!surfaceSupportsRectangle(p.x, p.z, f.width, f.depth)) return result('这里放不下，换一块平地');
  if (hasOccupiedFootprint(state, p, f.width, f.depth)) return result('这里有树、田地或建筑');
  if (rectanglesOverlap(p, f.width, f.depth, state.player, GAME.playerRadius * 2, GAME.playerRadius * 2)) return result('先走出这块位置');
  // Reach the near edge of a structure, rather than demanding the player stand inside its footprint.
  const edgeX = Math.max(Math.abs(p.x - state.player.x) - f.width / 2, 0);
  const edgeZ = Math.max(Math.abs(p.z - state.player.z) - f.depth / 2, 0);
  if (Math.hypot(edgeX, edgeZ) > GAME.interactionRange) return result('走近一点再搭建');
  if (state.buildings.length >= GAME.maxBuildings) return result('这片空地已经摆满了');
  if (state.inventory.wood < BUILDINGS[kind].wood) return result(`还差 ${BUILDINGS[kind].wood - state.inventory.wood} 块木材`);
  return result();
}

export function getContextAction(state: GameState, selection: Selection, target?: Vec2): ContextAction {
  if (target && !finitePoint(target)) return { label: '选择目标', target: null, enabled: false, reason: '选择一个有效的位置', detail: '' };
  const p = actionTarget(state, selection, target);
  const context = (label: string, detail: string, reason?: string, targetId?: string): ContextAction => ({ label, detail, target: p, targetId, enabled: !reason, reason });
  if (selection.tool === 'build') {
    const spec = BUILDINGS[selection.building];
    const placement = validatePlacement(state, selection.building, p, selection.rotation);
    return context(`搭建${spec.label}`, `${spec.wood} 块木材`, placement.reason);
  }
  if (distance(state.player, p) > GAME.interactionRange) return context('走近一点', '靠近目标后使用工具', '距离有点远');
  const tree = treeAt(state, p);
  const plot = plotAt(state, p);
  if (plot?.crop && plot.growth >= GAME.cropSeconds) return context('收获胡萝卜', '胡萝卜 +3 · 种子 +2', undefined, plot.id);
  if (selection.tool === 'axe') {
    if (!tree) return context('砍树', '靠近一棵成熟的树', '这里没有能砍的树');
    if (tree.stage !== 'mature') return context('小树还在长大', `再等 ${Math.ceil(GAME.treeMatureSeconds - tree.age)} 秒`, '让它再长一会儿', tree.id);
    return context('砍树', `还需 ${tree.hp} 下 · 木材 +${GAME.treeWood}`, undefined, tree.id);
  }
  if (selection.tool === 'hoe') {
    if (plot) return context('这块田已翻好', '换上种子，种点胡萝卜', '已经是田地了', plot.id);
    return context('开垦土地', '翻出一小块田地', openGroundReason(state, p, false));
  }
  if (selection.tool === 'water') {
    if (!plot?.crop) return context('浇水', '先在田里播种', '这里还没有作物', plot?.id);
    if (plot.watered) return context('胡萝卜在长大', `约 ${Math.ceil(GAME.cropSeconds - plot.growth)} 秒后成熟`, '已经浇过水了', plot.id);
    return context('浇水', '浇过水，种子就会发芽', undefined, plot.id);
  }
  if (selection.plant === 'carrot') {
    if (!plot) return context('播种胡萝卜', '先用锄头开垦草地', '要种在翻好的田里');
    if (plot.crop) return context('胡萝卜在长大', plot.watered ? `约 ${Math.ceil(GAME.cropSeconds - plot.growth)} 秒后成熟` : '换上水壶浇水', '这块田已经种上了', plot.id);
    return context('播种胡萝卜', '种子 −1', state.inventory.seeds > 0 ? undefined : '种子用完了，收获可以获得种子', plot.id);
  }
  return context('种下小树', '树苗 −1 · 90 秒长成大树', openGroundReason(state, p, true) ?? (state.inventory.saplings > 0 ? undefined : '树苗用完了，砍树可以获得树苗'));
}

function commitEvent(state: GameState, event: GameEvent): ActionResult {
  state.revision++;
  return { ok: true, events: [event] };
}

function move(state: GameState, x: number, z: number, dt: number): ActionResult {
  if (![x, z, dt].every(Number.isFinite) || dt <= 0) return fail('无效的移动');
  const magnitude = Math.hypot(x, z);
  if (magnitude < 0.001) return { ok: true, events: [] };
  const scale = GAME.movementSpeed * Math.min(dt, 0.1) / Math.max(magnitude, 1);
  const dx = x * scale;
  const dz = z * scale;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
  const px = state.player.x;
  const pz = state.player.z;
  state.player.facing = Math.atan2(x, z);
  for (let i = 0; i < steps; i++) {
    if (isPositionWalkable(state, state.player.x + dx / steps, state.player.z)) state.player.x += dx / steps;
    if (isPositionWalkable(state, state.player.x, state.player.z + dz / steps)) state.player.z += dz / steps;
  }
  if (px !== state.player.x || pz !== state.player.z) state.revision++;
  return { ok: true, events: [] };
}

export function dispatch(state: GameState, command: GameCommand): ActionResult {
  if (command.type === 'move') return move(state, command.x, command.z, command.dt);
  if (command.type === 'build') {
    const placement = validatePlacement(state, command.kind, command.position, command.rotation);
    if (!placement.valid) return fail(placement.reason!);
    const id = `building-${state.nextId++}`;
    state.inventory.wood -= BUILDINGS[command.kind].wood;
    state.buildings.push({ id, ...placement.position, kind: command.kind, rotation: command.rotation });
    state.progress.built++;
    return commitEvent(state, { type: 'build', position: placement.position, entityId: id });
  }
  if (command.type !== 'interact') return fail('未知操作');
  const { selection } = command;
  // A preview never confirms a building. The app must send an explicit build command.
  if (selection.tool === 'build') return fail('先调整位置，再确认搭建');
  const action = getContextAction(state, selection, command.target);
  if (!action.enabled || !action.target) return fail(action.reason ?? '暂时无法操作');
  const p = action.target;
  const plot = plotAt(state, p);
  const tree = treeAt(state, p);
  if (plot?.crop && plot.growth >= GAME.cropSeconds) {
    plot.crop = null; plot.watered = false; plot.growth = 0;
    state.inventory.carrots += 3; state.inventory.seeds += 2; state.progress.harvested++;
    return commitEvent(state, { type: 'harvest', position: p, entityId: plot.id, amount: 3 });
  }
  if (selection.tool === 'axe' && tree) {
    tree.hp--;
    if (tree.hp > 0) return commitEvent(state, { type: 'chop', position: p, entityId: tree.id });
    state.trees.splice(state.trees.indexOf(tree), 1);
    state.inventory.wood += GAME.treeWood; state.inventory.saplings++; state.progress.chopped++;
    return commitEvent(state, { type: 'fell', position: p, entityId: tree.id, amount: GAME.treeWood });
  }
  if (selection.tool === 'hoe') {
    const id = `plot-${state.nextId++}`;
    state.plots.push({ id, ...p, crop: null, watered: false, growth: 0 });
    return commitEvent(state, { type: 'till', position: p, entityId: id });
  }
  if (selection.tool === 'water' && plot) {
    plot.watered = true;
    return commitEvent(state, { type: 'water', position: p, entityId: plot.id });
  }
  if (selection.tool === 'plant' && selection.plant === 'carrot' && plot) {
    state.inventory.seeds--; plot.crop = 'carrot'; plot.watered = false; plot.growth = 0;
    return commitEvent(state, { type: 'plant', position: p, entityId: plot.id });
  }
  if (selection.tool === 'plant' && selection.plant === 'tree') {
    const id = `tree-${state.nextId++}`;
    state.inventory.saplings--; state.progress.planted++;
    state.trees.push({ id, ...p, stage: 'sapling', age: 0, hp: GAME.treeHits, variant: (state.nextId + state.seed) % 3 });
    return commitEvent(state, { type: 'plant', position: p, entityId: id });
  }
  return fail('暂时无法操作');
}
