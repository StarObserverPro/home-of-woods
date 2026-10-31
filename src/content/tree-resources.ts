export const TREE_RESOURCE_HOSTS = ['tree-slot-r3-hero-0', 'tree-slot-16-9', 'tree-slot-13-6', 'tree-slot-17-11', 'landmark-elder'] as const;
// Game habitat/art profiles for the current fictional pine/oak silhouettes.
export const TREE_RESOURCE_PROFILES = {
  pine: { label: '针叶树', circleName: '针叶林蘑菇圈', radiusPerScale: 1.6, radiusBase: .8, patches: 6, mushroomScale: .7, branchAngle: .65 },
  broadleaf: { label: '阔叶树', circleName: '阔叶林蘑菇圈', radiusPerScale: 1.9, radiusBase: 1, patches: 7, mushroomScale: .72, branchAngle: -.7 },
} as const;
// Future resources resolve through the same host, not free-floating world refresh points.
export const TREE_RESOURCE_ANCHORS = {
  branch: { kind: 'trunk', hosts: ['pine', 'broadleaf'], attachment: 'trunk' },
  scrap: { kind: 'under-canopy', hosts: ['pine', 'broadleaf'], attachment: 'ground' },
  mushroom: { kind: 'mushroom-circle', hosts: ['pine', 'broadleaf'], attachment: 'ground' },
  resin: { kind: 'trunk', hosts: ['pine'], attachment: 'trunk', status: 'reserved' },
} as const;
