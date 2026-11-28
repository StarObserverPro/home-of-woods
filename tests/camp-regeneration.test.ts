import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMP_REGENERATION_STRIPS } from '../src/content/camp-woodland.ts';
import { FORESTRY } from '../src/content/forestry.ts';
import { CREEK_BRIDGE } from '../src/content/regions.ts';
import { START, WORLD_SEED, WAYPOINTS } from '../src/content/world.ts';
import { advanceForestry, canFellTree, chopReason, startChop } from '../src/domain/forestry.ts';
import { canStand, findPath } from '../src/domain/navigation.ts';
import { createSaveContext } from '../src/domain/save-context.ts';
import { validateSavedForestry } from '../src/domain/save-forestry.ts';
import { createState } from '../src/domain/state.ts';
import { branchAttachment } from '../src/scene/branch-attachment.ts';
import { Models } from '../src/scene/models.ts';
import { Resources } from '../src/scene/resources.ts';
import { makeColliders, makeTrees } from '../src/world/layout.ts';
import { bankDistance, bridgeClearance } from '../src/world/camp-woodland.ts';
import { makeGatheringSources } from '../src/world/gathering-layout.ts';
import { pathDistance, slopeAt } from '../src/world/surface.ts';
import { campTreeDimensions, treeTrunkRadius } from '../src/world/tree-dimensions.ts';
import { fellingSpaceIsClear, fellingStandCandidates } from '../src/world/tree-felling-space.ts';

const trees = makeTrees(), byId = new Map(trees.map(t=>[t.id,t])), colliders = makeColliders(trees);
const small = trees.filter(t=>t.regeneration), candidates = small.filter(canFellTree);
const access = {openLinks:[CREEK_BRIDGE.id]};

test('seeded recruitment stays in the registered habitats and only grants a minority of tree slots', () => {
  assert.deepEqual(makeTrees(),trees);
  assert.notDeepEqual(makeTrees(WORLD_SEED+19).filter(t=>t.regeneration),small);
  assert.equal(new Set(trees.map(t=>t.id)).size,trees.length);
  assert.ok(small.length/trees.length>=.07 && small.length/trees.length<=.11);
  assert.ok(candidates.length/small.length>=.30 && candidates.length/small.length<=.48);
  assert.deepEqual(trees.filter(canFellTree),candidates);
  assert.ok(trees.filter(t=>t.woodland?.layer==='old-growth'&&campTreeDimensions(t.woodland).height*t.scale>34).length>=3);
  const blockers = new Set(colliders.map(c=>c.id));
  for (const strip of CAMP_REGENERATION_STRIPS) {
    const members = small.filter(t=>t.regeneration===strip.id);
    assert.ok(members.length>=3 && members.length<=strip.trees);
    assert.ok(members.filter(canFellTree).length<=strip.permits);
    for (const t of members) {
      assert.ok(strip.mixture.some(([species])=>species===t.woodland!.species) || strip.existing?.some(anchor=>anchor.id===t.id));
      assert.ok(blockers.has(t.id));
      assert.ok(!bridgeClearance(t.x,t.z) && pathDistance(t.x,t.z)>4.1);
      assert.ok(bankDistance(t.x,t.z)>7.4 && slopeAt(t.x,t.z)<=.73);
    }
  }
  for (const tree of candidates) {
    assert.equal(tree.woodland?.layer,'pole');
    assert.ok(fellingStandCandidates(tree,0).some(stand=>canStand(stand,colliders,undefined,access)&&fellingSpaceIsClear(tree,stand,colliders,access)),tree.id);
  }
  const home = candidates.find(tree=>tree.id==='tree-slot-r3-hero-0')!;
  const stand = fellingStandCandidates(home,0).find(p=>fellingSpaceIsClear(home,p,colliders,access))!;
  assert.ok(findPath(START,stand,colliders).length>0);
  for (const id of ['lookout','creek']) assert.ok(findPath(START,WAYPOINTS.find(w=>w.id===id)!,colliders).length>0);
});

test('the original gather hosts remain registered and protected forms expose their real woody branch graph', () => {
  const sources = makeGatheringSources(trees);
  assert.equal(sources.length,24);
  const resources=new Resources(), models=new Models(resources);
  try {
    for (const source of sources.filter(s=>s.definitionId==='forage.branch-pile')) {
      const host=byId.get(source.hostRef!.slotId)!;
      const attachment=branchAttachment(host,models);
      assert.ok(attachment.root.toArray().every(Number.isFinite));
      assert.ok(attachment.local.y>1.65);
    }
    const sample = [...candidates.slice(0,4), ...trees.filter(t=>t.woodland?.layer==='old-growth')];
    for (const tree of sample) {
      const geometry=models.treeGeometry(tree.kind,true,tree), declared=campTreeDimensions(tree.woodland!);
      geometry.computeBoundingBox();
      assert.ok(geometry.attributes.position.array.every(Number.isFinite));
      assert.ok(Math.abs(geometry.boundingBox!.max.y-declared.height)<declared.height*.14);
      const solid=geometry.getAttribute('shadowSolidWeight');
      assert.ok(solid.array.includes(0) && solid.array.includes(1));
    }
  } finally {resources.dispose();}
});

test('a small permitted pole completes the existing transaction once and keeps its site on save and regrowth', () => {
  const tree=candidates.find(t=>t.regeneration==='west-terrace'&&t.kind==='broadleaf')!;
  const reserve=trees.find(t=>t.retained && t.role==='managed' && !t.regeneration)!;
  const state=createState(trees), before=structuredClone(state.inventory);
  assert.match(chopReason(state,reserve),/保留木/);
  assert.equal(startChop(state,reserve,colliders).ok,false);
  assert.deepEqual(state.inventory,before);
  const stand=fellingStandCandidates(tree,0).find(p=>canStand(p,colliders)&&fellingSpaceIsClear(tree,p,colliders,{openLinks:[]}))!;
  Object.assign(state.player,stand);
  const obstruction=[...colliders,{id:'blocked-fall',x:tree.x+(tree.x-stand.x)*2,z:tree.z+(tree.z-stand.z)*2,radius:1}];
  assert.equal(startChop(state,tree,obstruction).ok,false);
  assert.equal(state.forestry.ledger.reserved,0);
  assert.equal(startChop(state,tree,colliders).ok,true);
  const action=state.forestry.active!;
  assert.ok(action.yield>=1&&action.yield<=2);
  assert.ok(Math.abs(action.reward.wood!.spec!.thicknessMm - treeTrunkRadius(tree)*2/ (2.55/1.75)*1_000)<.51);
  state.time+=FORESTRY.chopSeconds+.01;
  advanceForestry(state,byId);
  const received=structuredClone(state.inventory);
  advanceForestry(state,byId);
  assert.deepEqual(state.inventory,received);
  assert.equal(state.forestry.ledger.used,action.cost);
  state.time+=FORESTRY.fallSeconds+.01;
  advanceForestry(state,byId);
  const context=createSaveContext(trees);
  const resumed=validateSavedForestry(state.forestry,context,state.time);
  assert.equal(resumed.slots[tree.id].status,'stump');
  state.forestry=resumed;
  state.time=resumed.slots[tree.id].regrowAt!+.01;
  advanceForestry(state,byId);
  assert.equal(state.forestry.slots[tree.id].individualId,`${tree.id}:g1`);
  assert.match(chopReason(state,tree),/尚未成材/);
  assert.deepEqual(state.inventory,received);
});

test('an older roster gets initial records for new application sites once', () => {
  const state=createState(trees), context=createSaveContext(trees);
  for (const tree of candidates) if(tree.id.startsWith('camp-regeneration:'))delete state.forestry.slots[tree.id];
  const resumed=validateSavedForestry(state.forestry,context,state.time);
  const newTree=candidates.find(t=>t.id.startsWith('camp-regeneration:'))!;
  assert.equal(resumed.slots[newTree.id].individualId,newTree.individualId);
  delete resumed.slots[newTree.id];
  assert.throws(()=>validateSavedForestry(resumed,context,state.time),/forestry.slots/);
});
