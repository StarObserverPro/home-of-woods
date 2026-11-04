import test from 'node:test';
import assert from 'node:assert/strict';
import { CRAFT_PROFILES, GEOMETRY_TEMPLATES, BLUEPRINT_QUALITY_BANDS } from '../src/content/parametric-crafting.ts';
import { CRAFT_BLUEPRINTS } from '../src/content/workshop.ts';
import { RARITIES } from '../src/content/rarities.ts';
import { createGeometrySpec, verifiedGeometrySpec, geometryParts, assemblyGuides, assessAssembly } from '../src/domain/parametric-crafting.ts';
import { blueprintRarityProbabilities, rollBlueprintRarity } from '../src/domain/blueprint-rarity.ts';
import { createState } from '../src/domain/state.ts';
import { inventoryTransaction, inventoryCount } from '../src/domain/inventory.ts';
import { beginWorkshop, advanceWorkshop, workshopTarget } from '../src/domain/workshop.ts';
import { serializeWorldSave, prepareWorldSave } from '../src/domain/world-save.ts';
import { createSaveContext } from '../src/domain/save-context.ts';

test('active workbench blueprints have typed recipes; unrelated camp upgrades are not forced into an assembly shape', () => {
  for (const plan of CRAFT_BLUEPRINTS) {
    const profile = CRAFT_PROFILES[plan.id];
    assert.equal(profile?.status, 'active');
    assert.equal(profile?.method, 'transform');
    assert.equal(GEOMETRY_TEMPLATES[profile.geometryTemplateId!]?.family, 'solid');
    assert.equal(profile.steps.length, 1);
  }
  assert.equal(CRAFT_PROFILES['blueprint.cabin-repair'], undefined);
  assert.equal(CRAFT_PROFILES['blueprint.bench-guided'].status, 'planned');
  assert.equal(CRAFT_PROFILES['blueprint.bench-guided'].method, 'assemble');
});

test('versioned compact geometry rejects unsupported fields and exact-step violations', () => {
  const stump = createGeometrySpec('stump.round', { diameter: 1.05 });
  assert.equal(stump.family, 'solid');
  assert.equal(stump.version, 1);
  assert.equal(geometryParts(stump).length, 1);
  assert.equal(assemblyGuides(stump).length, 0);
  assert.deepEqual(verifiedGeometrySpec(stump), stump);
  assert.throws(() => createGeometrySpec('stump.round', { diameter: 30 }));
  assert.throws(() => createGeometrySpec('stump.round', { unknown: 1 }));
  assert.throws(() => createGeometrySpec('bench.supported', { supportCount: 2.5 }));
  assert.throws(() => verifiedGeometrySpec({ ...stump, version: 9 }));
  assert.throws(() => verifiedGeometrySpec({ ...stump, parameters: { ...stump.parameters, unexpected: 1 } }));
});

test('supported surface auto-distributes symmetrical supports without persisting each leg transform', () => {
  const spec = createGeometrySpec('bench.supported', { supportCount: 4, length: 2.2 });
  assert.equal(Object.keys(spec.parameters).length, 6);
  assert.equal(spec.parameters.supportCount, 4);
  const parts = geometryParts(spec);
  assert.equal(parts.length, 5);
  assert.equal(parts[0].id, 'surface');
  const positions = parts.slice(1).map(p => p.center.x);
  assert.ok(Math.abs(positions[0] + positions[3]) < 1e-8);
  assert.ok(Math.abs(positions[1] + positions[2]) < 1e-8);
  assert.ok(positions.every((p,i) => i===0 || p>positions[i-1]));
});

test('guided assembly tolerates small errors, assigns lower scores, and rejects severe misalignment', () => {
  const spec = createGeometrySpec('bench.supported');
  const guides = assemblyGuides(spec);
  assert.equal(guides.length, 3);
  const perfect = guides.map(g => ({ id:g.id,...g.target }));
  assert.deepEqual(assessAssembly(spec,perfect).valid,true);
  assert.equal(assessAssembly(spec,perfect).score,100);
  const close = perfect.map((p,i)=>i===1?{...p,x:p.x+.2,angle:.2}:p);
  const report = assessAssembly(spec,close);
  assert.equal(report.valid,true);
  assert.ok(report.score>0 && report.score<100);
  const bad = close.map((p,i)=>i===1?{...p,x:p.x+.5}:p);
  assert.equal(assessAssembly(spec,bad).valid,false);
  assert.equal(assessAssembly(spec,bad).score,0);
  assert.equal(assessAssembly(spec,perfect.slice(1)).valid,false);
  assert.equal(assessAssembly(spec,[...perfect,perfect[0]]).valid,false);
});

test('tier hard caps hold; higher fitting scores shift odds without erasing luck', () => {
  for (const tier of RARITIES.map(r=>r.id)) {
    assert.equal(BLUEPRINT_QUALITY_BANDS[tier].tier,tier);
    for (const score of [0, 50, 100]) {
      const p=blueprintRarityProbabilities(tier,score);
      assert.ok(Math.abs(Object.values(p).reduce((a,b)=>a+b,0)-1)<1e-10);
      for (const r of RARITIES) assert.equal(p[r.id]>0,BLUEPRINT_QUALITY_BANDS[tier].weights[RARITIES.indexOf(r)]>0);
    }
  }
  assert.equal(blueprintRarityProbabilities('common',100).legendary,0);
  assert.equal(blueprintRarityProbabilities('common',100).rare,0);
  assert.ok(blueprintRarityProbabilities('rare',0).legendary>0);
  assert.ok(blueprintRarityProbabilities('rare',0).uncommon>0);
  assert.ok(blueprintRarityProbabilities('rare',100).legendary>blueprintRarityProbabilities('rare',0).legendary);
  assert.ok(blueprintRarityProbabilities('rare',100).uncommon<blueprintRarityProbabilities('rare',0).uncommon);
  const ordinary = new Set(Array.from({length:500},(_,i)=>rollBlueprintRarity(104729,i+1,'blueprint.stump-cozy','common',100)));
  assert.deepEqual([...ordinary].sort(),['common','uncommon']);
  assert.equal(rollBlueprintRarity(104729,7,'blueprint.stump-cozy','common',60),
    rollBlueprintRarity(104729,7,'blueprint.stump-cozy','common',60));
  assert.throws(()=>blueprintRarityProbabilities('rare',NaN));
  assert.throws(()=>rollBlueprintRarity(104729,0,'blueprint.stump-cozy','common',50));
});

test('current basic blueprint completes one atomic craft, saves compact geometry and stable roll', async () => {
  const s = createState();
  s.inventory = inventoryTransaction(s.inventory,[{itemId:'wood',qualityId:'ordinary',delta:2}]);
  s.workshop.blueprints.push('blueprint.stump-cozy');
  Object.assign(s.player,workshopTarget('craft'));
  const expected = rollBlueprintRarity(s.seed,1,'blueprint.stump-cozy','common',50);
  beginWorkshop(s,'craft',[],'blueprint.stump-cozy');advanceWorkshop(s);s.time+=3.1;assert.match(advanceWorkshop(s)??'',/做好/);
  assert.equal(inventoryCount(s.inventory,'wood'),1);
  assert.equal(s.inventory.instances!.length,1);
  const item=s.inventory.instances![0];
  assert.equal(item.rarityId,expected);
  assert.deepEqual(verifiedGeometrySpec(item.geometry),createGeometrySpec('stump.round'));
  assert.deepEqual(item.crafting,{schemaVersion:1,recipeId:'recipe.stump-cozy',blueprintTier:'common',qualityScore:null,scoreSource:'preset-neutral'});
  const result=await prepareWorldSave(await serializeWorldSave(s,createSaveContext(),{sequence:1,savedAt:100}),createSaveContext());
  assert.equal(result.decision,'restored');
  if (result.decision!=='restored') throw Error('Save not restored');
  assert.deepEqual(result.value.inventory.instances,s.inventory.instances);
});
