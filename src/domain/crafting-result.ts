import { craftProfile } from '../content/parametric-crafting.ts';
import type { GeometrySpec, GuidePlacement } from './parametric-crafting.ts';
import { createGeometrySpec, assessAssembly } from './parametric-crafting.ts';
import { rollBlueprintRarity } from './blueprint-rarity.ts';
import type { RarityId } from '../content/rarities.ts';

/**
 * The action module is intentionally replaceable: current menu crafts use preset mode;
 * later guided assemblies submit their actual placements. Never award an invalid assembly.
 */
export type CraftExecution =
  | { mode: 'preset'; geometryParameters?: Readonly<Record<string, unknown>> }
  | { mode: 'guided'; geometryParameters?: Readonly<Record<string, unknown>>; placements: readonly GuidePlacement[] };

export type CraftOutcome = {
  rarityId: RarityId;
  geometry: GeometrySpec | null;
  crafting: {
    schemaVersion: 1; recipeId: string; blueprintTier: RarityId;
    qualityScore: number | null; scoreSource: 'preset-neutral' | 'guided';
  };
};
export function resolveCraftOutcome(blueprintId: string, seed: number, serial: number, execution: CraftExecution): CraftOutcome {
  const profile = craftProfile(blueprintId);
  if (!profile || !profile.geometryTemplateId) throw new Error('Unknown craft blueprint');
  if (execution.mode === 'guided' && profile.method !== 'assemble') throw new Error('This recipe is not a guided assembly');
  if (execution.mode === 'preset' && profile.method === 'assemble') throw new Error('Assembly requires fitting evidence');
  const geometry = createGeometrySpec(profile.geometryTemplateId, execution.geometryParameters);
  let qualityScore: number | null = null;
  if (execution.mode === 'guided') {
    const assessment = assessAssembly(geometry, execution.placements);
    if (!assessment.valid) throw new Error(assessment.reason || 'Invalid assembly');
    qualityScore = assessment.score;
  }
  const rarityId = rollBlueprintRarity(seed, serial, blueprintId, profile.rarityTier, qualityScore ?? 50);
  return { rarityId, geometry, crafting: {
    schemaVersion: 1, recipeId: profile.recipeId, blueprintTier: profile.rarityTier,
    qualityScore, scoreSource: execution.mode === 'guided' ? 'guided' : 'preset-neutral',
  } };
}
