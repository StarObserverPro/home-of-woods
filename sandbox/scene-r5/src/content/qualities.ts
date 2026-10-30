export type QualityDefinition = { qualityId: string; name: string; rank: number | null };
// IDs are durable identities. Display order is never a persisted grade.
export const QUALITIES: readonly QualityDefinition[] = [
  { qualityId: 'ungraded', name: '未分级', rank: null },
  { qualityId: 'ordinary', name: '普通', rank: 0 },
  { qualityId: 'fine', name: '精品', rank: 1 },
];
