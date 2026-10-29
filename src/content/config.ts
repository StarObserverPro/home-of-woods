export const GAME = {
  seed: 20261029,
  movementSpeed: 4.2,
  playerRadius: 0.32,
  interactionRange: 2.45,
  treeHits: 3,
  treeWood: 4,
  treeYoungSeconds: 35,
  treeMatureSeconds: 90,
  cropSeconds: 35,
  daySeconds: 300,
  maxPlots: 120,
  maxTrees: 160,
  maxBuildings: 100,
} as const;

export const BUILDINGS = {
  cabin: { label: '林间小屋', wood: 12, width: 3, depth: 3 },
  fence: { label: '木围栏', wood: 2, width: 2, depth: 1 },
} as const;

// Authored positions keep IDs and the starting clearing independent of load order.
export const STARTING_TREES: ReadonlyArray<readonly [number, number]> = [
  [-3, 1], [-5, -2], [-1, -4], [-6, 3], [-4, 6], [1, 8],
  [-11, -7], [-8, -8], [-5, -9], [-2, -10], [2, -10], [6, -9], [10, -8],
  [-13, -4], [-10, -3], [-7, -5], [-4, -6], [1, -7], [9, -4], [12, -3],
  [-13, 1], [11, 1], [13, 4], [9, 6], [12, 8],
  [-12, 8], [-9, 9], [-6, 10], [-2, 10], [3, 10], [6, 9],
] as const;

export const STARTING_PLOTS: ReadonlyArray<readonly [number, number]> = [
  [3, 3], [4, 3], [5, 3], [3, 4], [4, 4], [5, 4],
] as const;
