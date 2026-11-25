import test from 'node:test';
import assert from 'node:assert/strict';
import {CHARACTER_QUALITY_TIERS, CHARACTER_SURFACE_STANDARD, CHARACTER_IMPORT_RULES} from '../src/content/character-quality.ts';

test('character budgets keep hero > trader > neighbor > visitor without triangle quotas', () => {
  const tiers = ['hero', 'trader', 'neighbor', 'visitor'] as const;
  for (const [index, name] of tiers.entries()) {
    const tier = CHARACTER_QUALITY_TIERS[name];
    assert.ok(tier.triangles.target <= tier.triangles.maximum);
    assert.equal(tier.triangles.bodyTarget + tier.triangles.accessoryTarget, tier.triangles.target);
    if (index) {
      const previous = CHARACTER_QUALITY_TIERS[tiers[index - 1]];
      assert.ok(previous.triangles.target > tier.triangles.target);
      assert.ok(previous.triangles.maximum > tier.triangles.maximum);
    }
  }
  assert.equal(CHARACTER_IMPORT_RULES.automaticSubdivision, false);
  assert.equal(CHARACTER_IMPORT_RULES.runtimeDecimation, false);
});

test('a common NPC atlas plus normal and packed mask fit every NPC memory budget', () => {
  const standard = CHARACTER_SURFACE_STANDARD;
  const pixels = standard.bodyAtlas ** 2 + standard.normalAtlasMaximum ** 2 + standard.packedMaskAtlasMaximum ** 2 + standard.eyeAtlasMaximum ** 2;
  for (const name of ['trader', 'neighbor', 'visitor'] as const) {
    assert.equal(CHARACTER_QUALITY_TIERS[name].textureDimension, standard.bodyAtlas);
    assert.ok(pixels <= CHARACTER_QUALITY_TIERS[name].texturePixels);
    assert.ok(CHARACTER_IMPORT_RULES.preserveExistingNp120Bones <= CHARACTER_QUALITY_TIERS[name].bones);
  }
  assert.equal(Object.values(standard.colorArea).reduce((a, b) => a + b, 0), 1);
});
