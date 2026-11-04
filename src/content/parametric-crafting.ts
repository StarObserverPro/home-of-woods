import type { RarityId } from './rarities.ts';

/** Geometry families are independent of item taxonomy and item rarity. */
export type GeometryFamily = 'solid' | 'supported-surface';
export type GeometryParameter =
  | { kind: 'number' | 'integer'; default: number; min: number; max: number; step: number }
  | { kind: 'choice'; default: string; choices: readonly string[] };
export type GeometryTemplate = {
  id: string; version: number; family: GeometryFamily;
  parameters: Readonly<Record<string, GeometryParameter>>;
  /** World-unit tolerances for guided fitting; the UI may render these as dashed hints. */
  guide?: { maxPositionError: number; maxAngleError: number };
};

/** Only two generators are implemented. Future mechanical models register a new family. */
export const GEOMETRY_TEMPLATES: Readonly<Record<string, GeometryTemplate>> = {
  'stump.round': {
    id: 'stump.round', version: 1, family: 'solid',
    parameters: {
      diameter: { kind: 'number', default: .95, min: .7, max: 1.25, step: .05 },
      height: { kind: 'number', default: .7, min: .5, max: .95, step: .05 },
      silhouette: { kind: 'choice', default: 'rounded', choices: ['rounded', 'straight'] },
    },
  },
  'bench.supported': {
    id: 'bench.supported', version: 1, family: 'supported-surface',
    parameters: {
      length: { kind: 'number', default: 1.8, min: 1.2, max: 2.4, step: .1 },
      width: { kind: 'number', default: .65, min: .45, max: .9, step: .05 },
      height: { kind: 'number', default: .7, min: .45, max: .95, step: .05 },
      seatThickness: { kind: 'number', default: .15, min: .1, max: .25, step: .05 },
      supportCount: { kind: 'integer', default: 2, min: 2, max: 4, step: 1 },
      supportInset: { kind: 'number', default: .2, min: .1, max: .35, step: .05 },
    },
    guide: { maxPositionError: .35, maxAngleError: .45 },
  },
};

export type CraftMethod = 'transform' | 'assemble' | 'modify';
export type CraftStep = { id: string; moduleId: string };
export type CraftProfile = {
  blueprintId: string; status: 'active' | 'planned'; recipeId: string;
  method: CraftMethod; geometryTemplateId: string | null; rarityTier: RarityId;
  steps: readonly CraftStep[];
  /** Registered input roles; a later executor may implement tools, paints and finishing. */
  inputs: readonly { typeIds: readonly string[]; quantity: number; handling: 'consume' | 'attach' }[];
};

/** Active stump recipes use the existing workbench. Guided bench is only a schema fixture for later gameplay. */
export const CRAFT_PROFILES: Readonly<Record<string, CraftProfile>> = {
  'blueprint.stump-cozy': {
    blueprintId: 'blueprint.stump-cozy', status: 'active', recipeId: 'recipe.stump-cozy',
    method: 'transform', geometryTemplateId: 'stump.round', rarityTier: 'common',
    steps: [{ id: 'shape', moduleId: 'workbench.preset.v1' }],
    inputs: [{ typeIds: ['wood.log', 'wood.branch', 'wood.small-piece', 'wood.lumber'], quantity: 1, handling: 'consume' }],
  },
  'blueprint.stump-sturdy': {
    blueprintId: 'blueprint.stump-sturdy', status: 'active', recipeId: 'recipe.stump-sturdy',
    method: 'transform', geometryTemplateId: 'stump.round', rarityTier: 'common',
    steps: [{ id: 'shape', moduleId: 'workbench.preset.v1' }],
    inputs: [{ typeIds: ['wood.log', 'wood.branch', 'wood.small-piece', 'wood.lumber'], quantity: 1, handling: 'consume' }],
  },
  'blueprint.bench-guided': {
    blueprintId: 'blueprint.bench-guided', status: 'planned', recipeId: 'recipe.bench-guided',
    method: 'assemble', geometryTemplateId: 'bench.supported', rarityTier: 'rare',
    steps: [
      { id: 'prepare', moduleId: 'wood.preparation.future' },
      { id: 'fit', moduleId: 'assembly.guided.future' },
      { id: 'finish', moduleId: 'wood.finishing.future' },
    ],
    inputs: [{ typeIds: ['wood.log', 'wood.lumber'], quantity: 2, handling: 'consume' }],
  },
};

/** Candidate probabilities, not economy balance. Zero weights are hard quality caps. */
export type BlueprintQualityBand = {
  tier: RarityId;
  weights: readonly [number, number, number, number, number];
};
export const BLUEPRINT_QUALITY_BANDS: Readonly<Record<RarityId, BlueprintQualityBand>> = {
  common:    { tier: 'common',    weights: [88, 12, 0, 0, 0] },
  uncommon:  { tier: 'uncommon',  weights: [6, 75, 18, 1, 0] },
  rare:      { tier: 'rare',      weights: [0, 8, 80, 11.5, .5] },
  epic:      { tier: 'epic',      weights: [0, 0, 10, 80, 10] },
  legendary: { tier: 'legendary', weights: [0, 0, 1, 19, 80] },
};

export const craftProfile = (id: string): CraftProfile | undefined => CRAFT_PROFILES[id];
