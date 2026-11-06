import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import type {GameState} from '../src/domain/state.ts';
import {inventoryTransaction,inventoryCount} from '../src/domain/inventory.ts';
import {BROOM,CAMP_LEAF_PATCHES} from '../src/content/broom.ts';
import {WORKBENCH} from '../src/content/workshop.ts';
import {CAMP_PROPS,VISUAL_DAY_SECONDS} from '../src/content/scene-props.ts';
import {learnBroomBlueprint,beginBroomCraft,broomAccess,approachBroomPatch,useBroom,broomUsage,broomHasMark,broomHasWillful,broomSnapshot} from '../src/domain/broom.ts';
import {beginItemOracle,itemOracleReason} from '../src/domain/item-oracle.ts';
import {advanceWorkshop,cancelWorkshop} from '../src/domain/workshop.ts';
import {leafPatchSnapshot,validateSweptLeaves} from '../src/domain/leaf-patches.ts';
import {makeTrees,makeColliders} from '../src/world/layout.ts';
import {workstationColliders,furnitureColliders,placeFurniture,packFurniture,suggestFurniturePlacement} from '../src/domain/furniture-placement.ts';
import {seatingColliders} from '../src/domain/housing.ts';
import {WOODCRAFT} from '../src/content/woodcraft.ts';
import {canStand} from '../src/domain/navigation.ts';
import {serializeWorldSave,prepareWorldSave} from '../src/domain/world-save.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {HOUSEHOLD_AFFIX_DEFINITIONS} from '../src/content/household-affixes.ts';
import {validateAffixComposition} from '../src/content/affix-vfx-library.ts';

function stocked(){
  const state=createState();Object.assign(state.player,WORKBENCH.stand);state.selected=WORKBENCH.id;
  state.inventory=inventoryTransaction(state.inventory,[{itemId:'branch',qualityId:'ordinary',delta:10},{itemId:'mushroom',qualityId:'ordinary',delta:5}]);return state;
}
function crafted(mark:'leaf'|null=null){
  const state=stocked();learnBroomBlueprint(state);assert.match(beginBroomCraft(state,{mark}),/工作台/);advanceWorkshop(state);state.time+=3.01;assert.match(advanceWorkshop(state)??'',/做好/);
  return {state,id:state.inventory.instances![0].instanceId};
}
const owned=(state:GameState,id:string)=>state.inventory.instances!.find(item=>item.instanceId===id)!;
const baseBlockers=()=>[...makeColliders(makeTrees()),...workstationColliders(),...seatingColliders(),{id:WOODCRAFT.id,x:WOODCRAFT.x,z:WOODCRAFT.z,halfX:WOODCRAFT.halfX+.2,halfZ:WOODCRAFT.halfZ+.2}];
function atPatch(state:GameState,index=0){Object.assign(state.player,CAMP_LEAF_PATCHES[index].stand);}
function atAltar(state:GameState){Object.assign(state.player,{x:CAMP_PROPS.altar.x,z:CAMP_PROPS.altar.z+5});state.selected=CAMP_PROPS.altar.id;}
function bless(state:GameState,id:string){atAltar(state);assert.match(beginItemOracle(state,id,BROOM.oracleRiteId),/回应完成/);state.time+=3.01;assert.match(advanceWorkshop(state)??'',/神谕回应/);}

test('two real branches create an ordinary broom; the optional handmade mark is a separate appearance trait',()=>{
  for(const mark of [null,'leaf'] as const){
    const {state,id}=crafted(mark),item=owned(state,id);
    assert.equal(inventoryCount(state.inventory,'branch'),8);assert.equal(item.definitionId,BROOM.definitionId);assert.equal((item.geometry as {templateId:string}).templateId,'broom.bundle');
    assert.equal(broomHasMark(item),mark==='leaf');assert.equal(broomHasWillful(item),false);
    assert.equal((item.traits as unknown[]).length,mark?1:0);
    const before=structuredClone(state);assert.equal(advanceWorkshop(state),null);assert.deepEqual(state,before);
  }
});

test('unlearned, distant, busy and cancelled broom crafts never take materials or overwrite a running mark choice',()=>{
  const state=stocked(),initial=structuredClone(state.inventory);
  assert.match(beginBroomCraft(state),/先获得/);learnBroomBlueprint(state);Object.assign(state.player,{x:0,z:0});assert.match(beginBroomCraft(state),/先走近/);
  Object.assign(state.player,WORKBENCH.stand);beginBroomCraft(state,{mark:'leaf'});const job=structuredClone(state.workshop.job);
  assert.match(beginBroomCraft(state,{mark:null}),/当前动作/);assert.deepEqual(state.workshop.job,job);
  cancelWorkshop(state);assert.deepEqual(state.inventory,initial);assert.equal(state.inventory.instances?.length??0,0);
});

test('all three finite leaf patches have real reachable standing and held-tool clearances',()=>{
  const {state,id}=crafted(),blockers=baseBlockers();
  for(const patch of CAMP_LEAF_PATCHES){
    Object.assign(state.player,WORKBENCH.stand);
    assert.ok(canStand(patch.stand,blockers,BROOM.actionClearance));assert.ok(canStand(patch.center,blockers,BROOM.actionClearance));
    assert.match(approachBroomPatch(state,patch.id,blockers),/正在走到/);assert.ok(state.route.length);
    Object.assign(state.player,state.route.at(-1)!);state.route=[];assert.equal(broomAccess(state,id,patch.id,blockers).code,'ready');
  }
});

test('ordinary manual sweeping gathers the same leaves, then moves that pile without creating items or magic',()=>{
  const {state,id}=crafted('leaf');atPatch(state);const blockers=baseBlockers(),before=structuredClone(state.inventory.stacks);
  const first=useBroom(state,id,CAMP_LEAF_PATCHES[0].id,blockers);assert.equal(first.ok,true);assert.equal(first.event?.kind,'sweep');assert.equal(first.event?.from,'scattered');assert.equal(first.event?.to,'left');
  assert.equal(leafPatchSnapshot(state,CAMP_LEAF_PATCHES[0].id)?.currentSide,'left');assert.equal(owned(state,id).location.kind,'inventory');
  const second=useBroom(state,id,CAMP_LEAF_PATCHES[0].id,blockers);assert.equal(second.ok,true);assert.equal(second.event?.from,'left');assert.equal(second.event?.to,'right');assert.notEqual(second.event?.useId,first.event?.useId);
  assert.deepEqual(state.inventory.stacks,before);assert.equal(state.inventory.instances!.length,1);assert.equal(broomUsage(owned(state,id))?.sweeps,2);
  assert.equal(CAMP_LEAF_PATCHES.reduce((total,patch)=>total+patch.leafCount,0),36);assert.equal(Object.keys(state.workshop.sweptLeaves!).length,1);
  const after=structuredClone(state);assert.equal(advanceWorkshop(state),null);assert.deepEqual(state,after,'there is no animation completion reward callback');
});

test('distant, occupied, busy and uncarried use reject atomically including the far side of the sweep head',()=>{
  const {state,id}=crafted(),patch=CAMP_LEAF_PATCHES[0],blockers=baseBlockers();let before=structuredClone(state);
  assert.equal(useBroom(state,id,patch.id,blockers).ok,false);assert.deepEqual(state,before);
  atPatch(state);before=structuredClone(state);
  const obstacle={id:'new-chair',x:patch.center.x,z:patch.center.z-.9,radius:.15};
  assert.ok(canStand(patch.stand,[...blockers,obstacle],BROOM.actionClearance),'the far-side obstruction is not at the player');
  assert.equal(useBroom(state,id,patch.id,[...blockers,obstacle]).ok,false);assert.deepEqual(state,before);
  state.ritual={kind:'prayer',phase:'performing',startedAt:state.time};before=structuredClone(state);assert.equal(useBroom(state,id,patch.id,blockers).ok,false);assert.deepEqual(state,before);state.ritual=null;
  owned(state,id).location={kind:'world',x:patch.center.x+3,z:patch.center.z,rotation:0};before=structuredClone(state);
  assert.match(useBroom(state,id,patch.id,blockers).message,/收回仓库/);assert.deepEqual(state,before);
});

test('real altar offering changes the original marked broom once and preserves nested unknown metadata and rarity',()=>{
  const {state,id}=crafted('leaf'),item=owned(state,id);item.future={kept:['wood',17]};
  (item.traits as Record<string,unknown>[])[0].futureMark={carver:{style:'leaf'}};item.location.futurePlacement={retained:true};
  const original=structuredClone(item),fungi=inventoryCount(state.inventory,'mushroom');
  assert.match(beginItemOracle(state,id,BROOM.oracleRiteId),/先走到祭坛/);atAltar(state);
  assert.match(beginItemOracle(state,id,BROOM.oracleRiteId),/回应完成/);assert.equal(inventoryCount(state.inventory,'mushroom'),fungi);
  state.time+=3.01;assert.match(advanceWorkshop(state)??'',/神谕回应/);
  const blessed=owned(state,id);assert.equal(blessed.instanceId,original.instanceId);assert.equal(blessed.rarityId,original.rarityId);assert.deepEqual(blessed.geometry,original.geometry);assert.deepEqual(blessed.future,original.future);assert.deepEqual(blessed.location,original.location);
  assert.deepEqual((blessed.traits as unknown[])[0],(original.traits as unknown[])[0]);assert.equal(broomHasMark(blessed),true);assert.equal(broomHasWillful(blessed),true);assert.equal(inventoryCount(state.inventory,'mushroom'),fungi-1);
  validateAffixComposition((blessed.traits as {id:string}[]).map(trait=>trait.id),HOUSEHOLD_AFFIX_DEFINITIONS);
  const source=(blessed.traits as {source?:{kind:string;riteId:string;at:number}}[])[1].source!;assert.equal(source.kind,'oracle');assert.equal(source.riteId,BROOM.oracleRiteId);assert.equal(source.at,state.time);
  const before=structuredClone(state);assert.match(beginItemOracle(state,id,BROOM.oracleRiteId),/已经得到/);assert.deepEqual(state,before);assert.equal(advanceWorkshop(state),null);
});

test('unknown or conflicting old traits and interrupted oracle jobs preserve the item and offered fungus',()=>{
  const {state,id}=crafted();atAltar(state);owned(state,id).traits=[{id:'future.unreviewed-motion',value:2,opaque:{keep:7}}];
  const unknown=structuredClone(state);assert.match(itemOracleReason(state,id,BROOM.oracleRiteId),/无法确认/);assert.match(beginItemOracle(state,id,BROOM.oracleRiteId),/无法确认/);assert.deepEqual(state,unknown);
  owned(state,id).traits=[];const inventory=structuredClone(state.inventory);beginItemOracle(state,id,BROOM.oracleRiteId);cancelWorkshop(state);assert.deepEqual(state.inventory,inventory);
  beginItemOracle(state,id,BROOM.oracleRiteId);state.player.x+=3;state.time+=4;assert.match(advanceWorkshop(state)??'',/供品没有扣除/);assert.deepEqual(state.inventory,inventory);assert.equal(state.workshop.job,null);
});

test('willful motion is a persistent daily cadence and never a three-play lifetime charge',()=>{
  const {state,id}=crafted('leaf');atPatch(state);useBroom(state,id,CAMP_LEAF_PATCHES[0].id,baseBlockers());bless(state,id);atPatch(state);
  const sweep=()=>useBroom(state,id,CAMP_LEAF_PATCHES[0].id,baseBlockers());
  assert.equal(sweep().event?.kind,'willful');
  for(let i=0;i<4;i++)assert.equal(sweep().event?.kind,'sweep','the same day never repeats the extra behavior');
  for(let day=0;day<3;day++){
    state.time+=VISUAL_DAY_SECONDS;
    let performed=false;for(let i=0;i<3;i++){const result=sweep();if(result.event?.kind==='willful')performed=true;}
    assert.ok(performed,'a later day can show the same item personality again');
  }
  const use=broomUsage(owned(state,id))!;assert.equal(use.mischiefPlays,4);assert.ok(use.lastMischiefDay!==null);assert.ok(use.lastMischiefSweep<=use.sweeps);assert.equal(broomHasWillful(owned(state,id)),true);
});

test('oracle work, decimal receipts, usage cadence and finite leaf positions roundtrip in the single world save',async()=>{
  let {state,id}=crafted('leaf');atAltar(state);beginItemOracle(state,id,BROOM.oracleRiteId);state.time+=1.125;
  const context=createSaveContext();
  async function restore(){const raw=await serializeWorldSave(state,context,{sequence:1,savedAt:1}),loaded=await prepareWorldSave(raw,context);assert.equal(loaded.decision,'restored');if(loaded.decision!=='restored')throw Error(loaded.diagnostics.join(';'));state=loaded.value;}
  const pending=structuredClone(state.workshop.job);await restore();assert.deepEqual(state.workshop.job,pending);state.time+=2.01;advanceWorkshop(state);atPatch(state);
  const first=useBroom(state,id,CAMP_LEAF_PATCHES[0].id,baseBlockers());assert.equal(first.event?.kind,'willful');state.selected=CAMP_LEAF_PATCHES[0].id;
  const records=structuredClone(state.workshop.sweptLeaves),item=structuredClone(owned(state,id));await restore();assert.deepEqual(state.workshop.sweptLeaves,records);assert.deepEqual(owned(state,id),item);
  assert.equal(useBroom(state,id,CAMP_LEAF_PATCHES[0].id,baseBlockers()).event?.kind,'sweep','refresh does not reroll a second same-day extra action');
});

test('a night crossing midnight cannot refresh the same broom performance before sunrise',()=>{
  const {state,id}=crafted('leaf');bless(state,id);atPatch(state);
  const sweep=()=>useBroom(state,id,CAMP_LEAF_PATCHES[0].id,baseBlockers());
  assert.equal(sweep().event?.kind,'willful');
  state.time=700;
  for(let i=0;i<3;i++)assert.equal(sweep().event?.kind,'sweep');
  state.time=800;
  assert.equal(sweep().event?.kind,'willful');
  assert.equal(broomUsage(owned(state,id))?.mischiefPlays,2);
});

test('broom world placement and retrieval retain the same signed and blessed instance',()=>{
  const {state,id}=crafted('leaf');bless(state,id);Object.assign(state.player,WORKBENCH.stand);state.selected=id;
  const before=structuredClone(owned(state,id)),blockers=baseBlockers(),point=suggestFurniturePlacement(state,id,blockers);assert.ok(point);
  assert.match(placeFurniture(state,id,point,Math.PI/3,blockers),/摆好/);assert.equal(furnitureColliders(state).find(c=>c.id===id)?.radius,BROOM.radius);
  assert.match(packFurniture(state,id),/收回/);assert.deepEqual(owned(state,id),before);
});

test('invalid leaf receipts and exhausted usage cannot silently reset state or repeat a response',()=>{
  for(const at of [NaN,Infinity,-1,100])assert.throws(()=>validateSweptLeaves({[CAMP_LEAF_PATCHES[0].id]:{at,instanceId:'broom-1',useId:'use-1',pileSide:0}},10));
  assert.throws(()=>validateSweptLeaves({'future-patch':{at:1,instanceId:'broom-1',useId:'use-1',pileSide:0}},10),/Unknown camp leaf patch/);
  const {state,id}=crafted();atPatch(state);owned(state,id).broomUsage={sweeps:Number.MAX_SAFE_INTEGER,mischiefPlays:0,lastMischiefDay:null,lastMischiefSweep:0};
  const before=structuredClone(state);assert.equal(useBroom(state,id,CAMP_LEAF_PATCHES[0].id,baseBlockers()).ok,false);assert.deepEqual(state,before);
  assert.equal(broomSnapshot(state,baseBlockers()).items.length,1);
});
