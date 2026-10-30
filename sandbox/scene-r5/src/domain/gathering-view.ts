import { inventoryCount } from './inventory.ts';
import type { GatheringHost, GatherActionView } from './gathering.ts';
import { gatheringBusy, gatheringReason, canInteract, hostResourceReason } from './gathering.ts';
import type { GatheringRegistry } from './gathering-registry.ts';
import type { Collider } from '../world/layout.ts';
export type GatheringTargetView = {
  id: string; title: string; tag: string; detail: string; status: string; distance: number;
  reward: string; reason: string; actions: { id: 'gather' | 'cancel-gather'; label: string; enabled: boolean }[];
};
export type GatheringSnapshot = {
  inventory: { itemId: string; name: string; icon: string; quantity: number }[];
  action: GatherActionView | null; selectedTarget: GatheringTargetView | null;
};
export function gatheringSnapshot(host: GatheringHost, registry: GatheringRegistry, blockers: Collider[]): GatheringSnapshot {
  const s = host.selected ? registry.sources.get(host.selected) : undefined;
  let selectedTarget: GatheringTargetView | null = null;
  if (s) {
    const d = registry.definitions.get(s.definitionId)!, life = host.gathering.sources[s.sourceId];
    const distance = Math.hypot(host.player.x - s.x, host.player.z - s.z), reason = gatheringReason(host, s);
    const busyHere = gatheringBusy(host.gathering) && host.gathering.action?.sourceId === s.sourceId;
    const near = distance <= d.range && canInteract(host.player, s, blockers);
    selectedTarget = { id: s.sourceId, title: s.displayName ?? d.name, tag: s.hostLabel ? `${s.hostLabel} · 林间物产` : '林间物产', detail: s.placement === 'mushroom-circle' ? `围绕${s.hostLabel}生长的一圈蘑菇，共享这一处的采集量。` : d.description,
      status: hostResourceReason(host,s) ? '宿主暂不提供物产' : life.remaining > 0 ? '可以采集' : '已经采空', distance, reward: `${d.yieldPerUnit} 份${registry.items.get(d.itemId)!.name}`,
      reason: hostResourceReason(host,s) || (life.remaining === 0 ? '暂时没有可采的物产，继续去林间走走吧。' : reason),
      actions: busyHere ? [{ id: 'cancel-gather', label: '取消采集', enabled: true }] : [{ id: 'gather', label: near ? '采集' : '走近采集', enabled: !reason }],
    };
  }
  const a = host.gathering.action;
  return {
    inventory: [...registry.items.values()].filter(i=>i.status==='active' && i.resourceLine !== 'structure-wood').map(i => ({ itemId: i.itemId, name: i.name, icon: i.icon, quantity: inventoryCount(host.inventory, i.itemId) })),
    action: a ? { actionId: a.actionId, actorId: a.actorId, sourceId: a.sourceId, motionTag: a.motionTag, targetAnchor: { ...a.targetAnchor }, phase: a.phase, progress: a.progress } : null,
    selectedTarget,
  };
}
