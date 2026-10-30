export type RegenerationSpec =
  | { kind: 'period-refill'; configKey: string }
  | { kind: 'after-depletion'; configKey: string };
export type GatherMotionTag = 'gather.pickup' | 'gather.pluck';
export type GatherableDefinition = {
  definitionId: string; name: string; description: string; itemId: string; qualityId: string; assetId: string;
  motionTag: GatherMotionTag; regeneration: RegenerationSpec;
  capacity: number; yieldPerUnit: number; range: number; durationSeconds: number; hitRadius: number;
};
// Initial sample contents, not a seasonal economy. No production refill configuration yet.
export const GATHERABLES: readonly GatherableDefinition[] = [
  { definitionId: 'forage.branch-pile', name: '落枝堆', description: '林间落下的干枝，可以拾起来留作小型木料。', itemId: 'branch', qualityId: 'ordinary', assetId: 'how-gathering-branches', motionTag: 'gather.pickup', regeneration: { kind: 'period-refill', configKey: 'ground-branches' }, capacity: 1, yieldPerUnit: 3, range: 2.4, durationSeconds: 0, hitRadius: 1.05 },
  { definitionId: 'forage.mushroom-cluster', name: '蘑菇簇', description: '草叶间长着一小簇蘑菇，走近后可以采下。', itemId: 'mushroom', qualityId: 'ordinary', assetId: 'how-gathering-mushrooms', motionTag: 'gather.pluck', regeneration: { kind: 'after-depletion', configKey: 'ground-mushrooms' }, capacity: 1, yieldPerUnit: 2, range: 2.4, durationSeconds: 0, hitRadius: .95 },
];
export type RegenerationConfig = { capacity: number; waitSeconds?: number };
export const REGENERATION_CONFIG: Readonly<Record<string, RegenerationConfig>> = {};
