export type ProcessingMaterial = { itemId: string; quantity: number | null };
export type ProcessingDefinition = {
  processingId: string; name: string; status: 'planned' | 'configured';
  inputs: readonly ProcessingMaterial[]; outputs: readonly ProcessingMaterial[];
  station: string; durationSeconds: number | null;
};
// Real catalog entries with deliberately unresolved economy parameters; no execution command yet.
export const PROCESSING: readonly ProcessingDefinition[] = [
  { processingId: 'sort-branches', name: '整理枝料', status: 'planned', inputs: [{ itemId: 'branch', quantity: null }], outputs: [{ itemId: 'small-wood', quantity: null }], station: '工作台', durationSeconds: null },
  { processingId: 'dry-mushrooms', name: '晾制蘑菇', status: 'configured', inputs: [{ itemId: 'mushroom', quantity: 2 }], outputs: [{ itemId: 'dried-mushroom', quantity: 1 }], station: '营地晾晒架', durationSeconds: 100 },
];
