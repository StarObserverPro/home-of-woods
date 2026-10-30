// Authored ground-cover plan. It describes understory and meadow areas, not live tree state.
// Cutting a tree does not repaint the ecology or move the fixed forest slots.
export const GROUND_PLAN = {
  tileSize: 2.4,
  patternSpan: 5,
  woodland: [
    { x: -87, z: -12, rx: 43, rz: 84, weight: .94 },
    { x: -55, z: -88, rx: 86, rz: 37, weight: .98 },
    { x: 72, z: 6, rx: 66, rz: 103, weight: .96 },
    { x: 15, z: -34, rx: 34, rz: 45, weight: .78 },
    { x: -58, z: 44, rx: 28, rz: 35, weight: .84 },
  ],
  clearings: [
    { x: -36, z: -4, rx: 25, rz: 34, weight: 1 },
    { x: -25, z: 27, rx: 24, rz: 37, weight: .86 },
    { x: -1, z: 43, rx: 15, rz: 18, weight: .92 },
  ],
  meadow: ['#94a45e', '#a7b76d', '#b8c581'],
  understory: ['#657744', '#788b50', '#8a9860'],
  verge: '#799b71',
  bank: '#b0a782',
  scree: '#999d8b',
} as const;
