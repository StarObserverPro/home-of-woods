import type { Point } from '../content/world.ts';
import type { GatherMotionTag, RegenerationConfig } from '../content/gatherables.ts';
import { REGENERATION_CONFIG } from '../content/gatherables.ts';
import type { GatheringSource } from '../world/gathering-layout.ts';
import type { Collider } from '../world/layout.ts';
import { heightAt } from '../world/surface.ts';
import { canStand, findPath } from './navigation.ts';
import type { ForestryState } from './forestry.ts';
import { inventoryCandidate } from './inventory.ts';
import type { InventoryState } from './inventory.ts';
import type { GatheringRegistry } from './gathering-registry.ts';

export type GatherActionView = {
  actionId: string; actorId: string; sourceId: string; motionTag: GatherMotionTag;
  targetAnchor: { x: number; y: number; z: number };
  phase: 'approaching' | 'performing' | 'completed' | 'cancelled'; progress: number;
};
export type GatheringSourceState = {
  remaining: number; version: number; lastPeriod: number | null; depletedAt: number | null;
  hostIndividualId?: string; hostAvailable?: boolean;
};
export type GatherAction = GatherActionView & { sourceVersion: number; startedAt: number | null; durationSeconds: number; reward: { itemId: string; qualityId: string; quantity: number } };
export type GatheringState = {
  sources: Record<string, GatheringSourceState>; action: GatherAction | null;
  nextAction: number; settled: Record<string, true>;
};
export type GatheringHost = {
  time: number; selected: string | null; route: Point[]; player: Point & { facing: number; moving: boolean };
  gathering: GatheringState; inventory: InventoryState; forestry: Pick<ForestryState, 'active' | 'slots'>;
};
export const gatheringBusy = (g: GatheringState) => !!g.action && ['approaching', 'performing'].includes(g.action.phase);
export function createGathering(registry: GatheringRegistry): GatheringState {
  return { sources: Object.fromEntries([...registry.sources.values()].map(s => [s.sourceId, {
    remaining: registry.definitions.get(s.definitionId)!.capacity, version: 0, lastPeriod: null, depletedAt: null,
    ...(s.hostRef ? { hostIndividualId: s.hostRef.id, hostAvailable: true } : {}),
  }])), action: null, nextAction: 1, settled: {} };
}
export function hostResourceReason(host: GatheringHost, source: GatheringSource) {
  if (!source.hostRef) return '';
  const tree = host.forestry.slots[source.hostRef.slotId], life = host.gathering.sources[source.sourceId];
  if (!tree || !life || tree.individualId !== life.hostIndividualId) return '这处物产的宿主已经换代。';
  if (tree.status === 'sapling') return '幼树还在生长，暂不提供成熟树的物产。';
  if (tree.status === 'falling' || tree.status === 'stump') return '这棵树已经采伐，树下物产不再恢复。';
  return '';
}
/** Called by the app after forestry transitions, without adding another clock or refill. */
export function synchronizeGatheringHosts(host: GatheringHost, registry: GatheringRegistry) {
  for (const source of registry.sources.values()) {
    if (!source.hostRef) continue;
    const tree = host.forestry.slots[source.hostRef.slotId], life = host.gathering.sources[source.sourceId];
    if (!tree || !life) continue;
    const changed = life.hostIndividualId !== tree.individualId;
    const available = tree.status === 'standing' || tree.status === 'chopping';
    if (!changed && life.hostAvailable === available) continue;
    host.gathering.sources[source.sourceId] = { ...life, hostIndividualId: tree.individualId, hostAvailable: available,
      remaining: !available || changed ? 0 : life.remaining, version: life.version + 1,
      depletedAt: changed || !available ? null : life.depletedAt, lastPeriod: changed ? null : life.lastPeriod };
  }
  if (gatheringBusy(host.gathering)) {
    const source = registry.sources.get(host.gathering.action!.sourceId);
    if (source && hostResourceReason(host, source)) cancelGather(host);
  }
}
/** Short interaction segment must stay on the same traversable ground, including obstacles/water. */
export function canInteract(from: Point, to: Point, blockers: Collider[]) {
  if (!canStand(from, blockers) || !canStand(to, blockers)) return false;
  const distance = Math.hypot(from.x - to.x, from.z - to.z), steps = Math.max(1, Math.ceil(distance / .12));
  for (let i = 1; i <= steps; i++) if (!canStand({ x: from.x + (to.x - from.x) * i / steps, z: from.z + (to.z - from.z) * i / steps }, blockers)) return false;
  return Math.abs(heightAt(from.x, from.z) - heightAt(to.x, to.z)) <= distance * .9 + .2;
}
export function interactionRoute(host: Pick<GatheringHost, 'player'>, source: GatheringSource, registry: GatheringRegistry, blockers: Collider[]) {
  const d = registry.definitions.get(source.definitionId)!;
  if (Math.hypot(host.player.x - source.x, host.player.z - source.z) <= d.range && canInteract(host.player, source, blockers)) return { reachable: true, route: [] as Point[] };
  const angle = Math.atan2(host.player.z - source.z, host.player.x - source.x);
  for (const delta of [0, .55, -.55, 1.1, -1.1, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    const p = { x: source.x + Math.cos(angle + delta) * 1.45, z: source.z + Math.sin(angle + delta) * 1.45 };
    if (!canInteract(p, source, blockers)) continue;
    const route = findPath(host.player, p, blockers);
    if (route.length) return { reachable: true, route };
  }
  return { reachable: false, route: [] as Point[] };
}
export function gatheringReason(host: GatheringHost, source: GatheringSource | undefined) {
  if (!source || !host.gathering.sources[source.sourceId]) return '请先选中林间物产。';
  const hostReason = hostResourceReason(host, source); if (hostReason) return hostReason;
  if (host.forestry.active) return '先完成当前采伐，再采集物产。';
  if (gatheringBusy(host.gathering)) return '正在采集，可以取消或移动离开。';
  if (host.gathering.sources[source.sourceId].remaining <= 0) return '这里已经采空。';
  return '';
}
export function beginGather(host: GatheringHost, sourceId: string, registry: GatheringRegistry, blockers: Collider[]) {
  const source = registry.sources.get(sourceId), reason = gatheringReason(host, source);
  if (reason || !source || host.selected !== sourceId) return { ok: false, message: reason || '目标已经变化。' };
  const path = interactionRoute(host, source, registry, blockers);
  if (!path.reachable) return { ok: false, message: '暂时没有可到达的采集位置。' };
  const d = registry.definitions.get(source.definitionId)!;
  host.gathering.action = {
    actionId: `gather-${host.gathering.nextAction++}`, actorId: 'player', sourceId,
    motionTag: d.motionTag, targetAnchor: { ...source.targetAnchor }, phase: 'approaching', progress: 0,
    sourceVersion: host.gathering.sources[sourceId].version, startedAt: null,
    durationSeconds: d.durationSeconds, reward: { itemId: d.itemId, qualityId: d.qualityId, quantity: d.yieldPerUnit },
  };
  host.route = path.route;
  return { ok: true, message: path.route.length ? `走近${d.name}后采集。` : `准备采集${d.name}。` };
}
export function cancelGather(host: GatheringHost) {
  if (!gatheringBusy(host.gathering)) return false;
  host.gathering.action = { ...host.gathering.action!, phase: 'cancelled' };
  host.route = [];
  return true;
}
export type GatherCandidate = {
  actionId: string; sourceId: string; sourceVersion: number; inventoryRevision: number;
  source: GatheringSourceState; inventory: InventoryState; action: GatherAction; message: string;
};
export function gatherCandidate(host: GatheringHost, registry: GatheringRegistry, blockers: Collider[]): GatherCandidate | null {
  const a = host.gathering.action;
  if (!a || a.phase !== 'performing' || a.startedAt === null || host.gathering.settled[a.actionId] || host.forestry.active || host.selected !== a.sourceId) return null;
  const s = registry.sources.get(a.sourceId), life = host.gathering.sources[a.sourceId];
  if (!s || !life || life.version !== a.sourceVersion || life.remaining <= 0) return null;
  if (hostResourceReason(host, s)) return null;
  const d = registry.definitions.get(s.definitionId)!;
  if (host.time < a.startedAt + a.durationSeconds || Math.hypot(host.player.x - s.x, host.player.z - s.z) > d.range || !canInteract(host.player, s, blockers)) return null;
  const remaining = life.remaining - 1;
  return { actionId: a.actionId, sourceId: s.sourceId, sourceVersion: life.version, inventoryRevision: host.inventory.revision,
    source: { ...life, remaining, version: life.version + 1, depletedAt: remaining === 0 ? host.time : life.depletedAt },
    inventory: inventoryCandidate(host.inventory, a.reward.itemId, a.reward.quantity, a.reward.qualityId, registry.catalog),
    action: { ...a, phase: 'completed', progress: 1 }, message: `收获 ${a.reward.quantity} 份${registry.items.get(a.reward.itemId)!.name}。` };
}
/** App calls this synchronously; stale candidates and replays cannot write either half. */
export function commitGather(host: GatheringHost, candidate: GatherCandidate, registry: GatheringRegistry, blockers: Collider[]) {
  const fresh = gatherCandidate(host, registry, blockers);
  if (!fresh || fresh.actionId !== candidate.actionId || fresh.sourceVersion !== candidate.sourceVersion || fresh.inventoryRevision !== candidate.inventoryRevision || fresh.sourceId !== candidate.sourceId) return false;
  host.gathering.sources[fresh.sourceId] = fresh.source;
  host.inventory = fresh.inventory;
  host.gathering.action = fresh.action;
  host.gathering.settled[fresh.actionId] = true;
  host.route = [];
  return true;
}
export function advanceGather(host: GatheringHost, registry: GatheringRegistry, blockers: Collider[]): GatherCandidate | null {
  const a = host.gathering.action;
  if (!a || !gatheringBusy(host.gathering)) return null;
  const source = registry.sources.get(a.sourceId), life = host.gathering.sources[a.sourceId];
  if (!source || host.selected !== a.sourceId || !life || life.version !== a.sourceVersion || life.remaining <= 0 || host.forestry.active || hostResourceReason(host, source)) { cancelGather(host); return null; }
  if (a.phase === 'approaching') {
    if (host.route.length) return null;
    const d = registry.definitions.get(source.definitionId)!;
    if (Math.hypot(host.player.x - source.x, host.player.z - source.z) > d.range || !canInteract(host.player, source, blockers)) { cancelGather(host); return null; }
    a.phase = 'performing'; a.startedAt = host.time; host.player.moving = false;
    host.player.facing = Math.atan2(source.x - host.player.x, source.z - host.player.z);
  }
  const duration = a.durationSeconds;
  a.progress = duration === 0 ? 1 : Math.min(1, Math.max(0, (host.time - a.startedAt!) / duration));
  return gatherCandidate(host, registry, blockers);
}
export function regenerationCandidate(
  state: GatheringState, registry: GatheringRegistry, input: { now: number; period?: number },
  configs: Readonly<Record<string, RegenerationConfig>> = REGENERATION_CONFIG,
): GatheringState {
  if (!Number.isFinite(input.now) || input.now < 0 || (input.period !== undefined && (!Number.isSafeInteger(input.period) || input.period < 0))) throw new Error('Invalid regeneration input');
  const sources = { ...state.sources }; let changed = false;
  for (const s of registry.sources.values()) {
    const d = registry.definitions.get(s.definitionId)!, life = sources[s.sourceId], config = configs[d.regeneration.configKey];
    if (!config) continue;
    if (life.hostAvailable === false) continue;
    if (!Number.isSafeInteger(config.capacity) || config.capacity <= 0) throw new Error('Invalid regeneration capacity');
    if (d.regeneration.kind === 'period-refill') {
      if (input.period === undefined || input.period <= (life.lastPeriod ?? -1)) continue;
      sources[s.sourceId] = { ...life, remaining: config.capacity, version: life.version + 1, lastPeriod: input.period, depletedAt: null }; changed = true;
    } else {
      if (!Number.isFinite(config.waitSeconds) || config.waitSeconds! <= 0) throw new Error('Invalid depletion wait');
      if (life.remaining !== 0 || life.depletedAt === null || input.now < life.depletedAt + config.waitSeconds!) continue;
      sources[s.sourceId] = { ...life, remaining: config.capacity, version: life.version + 1, depletedAt: null }; changed = true;
    }
  }
  return changed ? { ...state, sources } : state;
}
