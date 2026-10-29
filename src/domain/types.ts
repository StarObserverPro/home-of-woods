export interface Vec2 { x: number; z: number }
export type Tool = 'axe' | 'hoe' | 'water' | 'plant' | 'build';
export type PlantKind = 'tree' | 'carrot';
export type BuildingKind = 'cabin' | 'fence';
export type Rotation = 0 | 1 | 2 | 3;
export interface Selection { tool: Tool; plant: PlantKind; building: BuildingKind; rotation: Rotation }
export interface Tree extends Vec2 {
  id: string; stage: 'sapling' | 'young' | 'mature'; age: number; hp: number; variant: number;
}
export interface Plot extends Vec2 { id: string; crop: 'carrot' | null; watered: boolean; growth: number }
export interface Building extends Vec2 { id: string; kind: BuildingKind; rotation: Rotation }
export interface GameState {
  schemaVersion: 1; seed: number; time: number; revision: number;
  player: Vec2 & { facing: number };
  inventory: { wood: number; seeds: number; saplings: number; carrots: number };
  trees: Tree[]; plots: Plot[]; buildings: Building[];
  progress: { chopped: number; planted: number; harvested: number; built: number };
  nextId: number;
}
export interface GameEvent {
  type: 'chop' | 'fell' | 'plant' | 'till' | 'water' | 'harvest' | 'build';
  position: Vec2; entityId: string; amount?: number;
}
export interface ActionResult { ok: boolean; reason?: string; events: GameEvent[] }
export interface ContextAction { label: string; target: Vec2 | null; targetId?: string; reason?: string; enabled: boolean; detail: string }
export interface PlacementResult { valid: boolean; reason?: string; position: Vec2; width: number; depth: number }
export type GameCommand =
  | { type: 'move'; x: number; z: number; dt: number }
  | { type: 'interact'; selection: Selection; target?: Vec2 }
  | { type: 'build'; kind: BuildingKind; position: Vec2; rotation: Rotation };
