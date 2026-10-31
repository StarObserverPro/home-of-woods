export type RegenerationSpec =
  | { kind: 'period-refill'; configKey: string }
  | { kind: 'after-depletion'; configKey: string };
export type GatherMotionTag = 'gather.pickup' | 'gather.pluck' | 'gather.climb';
export type GatherableDefinition = {
  definitionId: string; name: string; description: string; itemId: string; qualityId: string; assetId: string;
  motionTag: GatherMotionTag; regeneration: RegenerationSpec;
  capacity: number; yieldPerUnit: number; range: number; durationSeconds: number; hitRadius: number;
};
// Initial sample contents, not a seasonal economy. No production refill configuration yet.
export const GATHERABLES: readonly GatherableDefinition[] = [
  { definitionId: 'forage.branch-pile', name: '树上枝杈', description: '抱住宿主树干，蹬上一阶，到树冠采集枝杈。', itemId: 'branch', qualityId: 'ordinary', assetId: 'how-gathering-branches', motionTag: 'gather.climb', regeneration: { kind: 'period-refill', configKey: 'ground-branches' }, capacity: 1, yieldPerUnit: 3, range: 2.4, durationSeconds: 8, hitRadius: 1.05 },
  { definitionId: 'forage.mushroom-cluster', name: '蘑菇簇', description: '草叶间长着一小簇蘑菇，走近后可以采下。', itemId: 'mushroom', qualityId: 'ordinary', assetId: 'how-gathering-mushrooms', motionTag: 'gather.pluck', regeneration: { kind: 'after-depletion', configKey: 'ground-mushrooms' }, capacity: 1, yieldPerUnit: 2, range: 2.4, durationSeconds: 5, hitRadius: .95 },
  { definitionId: 'forage.scrap-pile', name: '地面碎柴', description: '弯腰捡起地面的枯柴，留作生火燃料。', itemId: 'scrap-fuel', qualityId: 'ordinary', assetId: 'how-gathering-branches', motionTag: 'gather.pickup', regeneration: { kind: 'period-refill', configKey: 'ground-scraps' }, capacity: 1, yieldPerUnit: 3, range: 2.4, durationSeconds: 3.2, hitRadius: 1.05 },
];
export type RegenerationConfig = { capacity: number; waitSeconds?: number };
export const REGENERATION_CONFIG: Readonly<Record<string, RegenerationConfig>> = {};
