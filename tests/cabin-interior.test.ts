import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCabinState, itemPose, itemBounds, approachPoint, canStand, findPath,
  validatePlacement, moveItem, storeItem, restoreItem, useItem, standUp, setDoorOpen, auditLayout, parseCabinSnapshot,
} from '../sandbox/cabin-interior/src/domain.ts';
import {CABIN,ENTRY_POINT,PORCH_POINT,ITEM_DEFINITIONS} from '../sandbox/cabin-interior/src/content.ts';
import type {CabinState,Point} from '../sandbox/cabin-interior/src/content.ts';
const item=(state:CabinState,id:string)=>state.items.find(i=>i.instanceId===`audit:${id}`)!;
const at=(state:CabinState,point:Point):CabinState=>({...state,player:{...state.player,...point}});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} differs from ${b}`);
function frozen(state:CabinState):CabinState {
  Object.freeze(state.player);for(const i of state.items){Object.freeze(i.location);Object.freeze(i);}Object.freeze(state.items);return Object.freeze(state);
}

test('cabin audit starts sparsely; all three presets retain the same ten independent identities',()=>{
  const empty=createCabinState('empty'),starter=createCabinState('starter'),full=createCabinState('full');
  assert.deepEqual(starter.items.filter(i=>i.location.kind!=='stored').map(i=>i.definitionId),['bed','table','stool','lantern']);
  for(const state of [empty,starter,full]){
    assert.equal(state.items.length,10);assert.equal(new Set(state.items.map(i=>i.instanceId)).size,10);
    const audit=auditLayout(state);assert.equal(audit.ok,true,audit.issues.join('\n'));
    assert.deepEqual(JSON.parse(JSON.stringify(state)),state,'all audit state is serializable');
  }
  assert.deepEqual(empty.items.map(i=>i.instanceId),full.items.map(i=>i.instanceId));
  assert.equal(auditLayout(empty).activeCount,0);assert.equal(auditLayout(full).activeCount,10);
});

test('the original-scale actor has a continuous supported route through the open doorway',()=>{
  const state=createCabinState('full');
  assert.equal(CABIN.actorRadius,.92);
  for(let z=2.45;z<=4.95;z+=.025)assert.equal(canStand(state,{x:0,z}),true,`threshold or porch gap at ${z}`);
  assert.equal(canStand(state,{x:0,z:5.1}),false,'actor cannot stand beyond the actual porch');
  for(const i of state.items.filter(i=>i.location.kind!=='stored')){
    const goal=approachPoint(state,i)!;
    const route=findPath(state,PORCH_POINT,goal);
    assert.ok(route,`no route to ${i.definitionId}`);
    assert.deepEqual(route.at(-1),goal,'route terminates at the actual registered use/exit point');
    for(let n=1;n<route.length;n++){
      const a=route[n-1],b=route[n],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.025);
      for(let s=0;s<=steps;s++)assert.ok(canStand(state,{x:a.x+(b.x-a.x)*s/steps,z:a.z+(b.z-a.z)*s/steps}),`route clips ${i.definitionId}`);
    }
  }
});

test('bed arrival, use permission and standing exit share one exact registered point',()=>{
  const state=createCabinState('full'),goal=approachPoint(state,'audit:bed')!;
  const wrongSide=at(state,{x:-.1,z:goal.z});
  assert.equal(useItem(wrongSide,'audit:bed').ok,false,'being elsewhere near a bed is insufficient');
  const arrived=at(state,goal),used=useItem(arrived,'audit:bed');
  assert.equal(used.ok,true);assert.equal(used.state.player.posture,'resting');
  assert.equal(used.state.player.usingId,'audit:bed');
  assert.equal(storeItem(used.state,'audit:bed').ok,false,'cannot remove the occupied bed');
  const exited=standUp(used.state);assert.equal(exited.ok,true);
  assert.equal(exited.state.player.posture,'standing');
  assert.deepEqual({x:exited.state.player.x,z:exited.state.player.z},goal);
  assert.ok(findPath(exited.state,goal,PORCH_POINT),'can leave after resting');
});

test('stool has a usable side approach and a blocked exit is refused',()=>{
  const state=createCabinState('full'),goal=approachPoint(state,'audit:stool')!;
  const seated=useItem(at(state,goal),'audit:stool');assert.equal(seated.ok,true);
  assert.equal(seated.state.player.posture,'seated');near(seated.state.player.facing,0);
  near(goal.x,-1.15);near(goal.z,.3);assert.equal(standUp(seated.state).ok,true);
  const obstructed={...seated.state,items:seated.state.items.map(i=>i.instanceId==='audit:chest'?{...i,location:{kind:'floor' as const,...goal,yaw:0}}:i)};
  const result=standUp(obstructed);assert.equal(result.ok,false);assert.strictEqual(result.state,obstructed);
});

test('furniture placement preserves the doorway, exact exits and real wall bounds',()=>{
  const state=frozen(createCabinState('full')),before=JSON.stringify(state);
  for(const [id,pose] of [
    ['audit:chest',{x:0,z:2.9,yaw:0}],
    ['audit:chest',{...approachPoint(state,'audit:bed')!,yaw:0}],
    ['audit:bed',{x:-3,z:0,yaw:Math.PI/2}],
    ['audit:table',{x:NaN,z:1,yaw:0}],
  ] as const){
    const check=validatePlacement(state,id,pose);assert.equal(check.ok,false,`${id} unexpectedly allowed`);
    const result=moveItem(state,id,pose);assert.equal(result.ok,false);assert.strictEqual(result.state,state);
  }
  assert.equal(JSON.stringify(state),before,'rejected previews and commits do not mutate input');
});

test('rotated bounds follow real geometry rather than an unrotated axis-aligned guess',()=>{
  const state=createCabinState('empty');
  const rotated={...state,items:state.items.map(i=>i.definitionId==='table'?{...i,location:{kind:'floor' as const,x:0,z:0,yaw:Math.PI/2}}:i)};
  const bounds=itemBounds(rotated,'audit:table')!;
  near(bounds.maxX-bounds.minX,1.15);near(bounds.maxZ-bounds.minZ,1.95);
  const approach=approachPoint(rotated,'audit:table')!;near(approach.x,0);near(approach.z,-1.965);
});

test('moving a table carries its original independent props through the same support transform',()=>{
  const state=frozen(createCabinState('full'));
  const moved=moveItem(state,'audit:table',{x:2.3,z:1.4,yaw:Math.PI});
  assert.equal(moved.ok,true,moved.reason);assert.equal(auditLayout(moved.state).ok,true);
  const lamp=itemPose(moved.state,'audit:lantern')!,bowl=itemPose(moved.state,'audit:bowl')!;
  near(lamp.x,2.85);near(lamp.y,1.02);near(lamp.z,1.4);
  near(bowl.x,1.82);near(bowl.y,1.02);near(bowl.z,1.35);
  assert.strictEqual(item(moved.state,'lantern'),item(state,'lantern'),'child instance is not copied or repositioned independently');
  assert.equal(moved.state.items.length,state.items.length);
});

test('storing a host atomically returns its supported props; restoration never gives duplicate items',()=>{
  const initial=createCabinState('full'),stored=storeItem(initial,'audit:table');
  assert.equal(stored.ok,true);
  for(const id of ['table','lantern','bowl'])assert.equal(item(stored.state,id).location.kind,'stored');
  assert.equal(itemPose(stored.state,'audit:lantern'),null);
  assert.equal(restoreItem(stored.state,'audit:lantern').ok,false,'cannot restore onto an absent support');
  const table=restoreItem(stored.state,'audit:table');assert.equal(table.ok,true,table.reason);
  assert.equal(item(table.state,'lantern').location.kind,'stored','restoring a host does not grant its contents');
  const lamp=restoreItem(table.state,'audit:lantern');assert.equal(lamp.ok,true);
  assert.equal(restoreItem(lamp.state,'audit:lantern').ok,false);
  assert.equal(lamp.state.items.length,10);
  assert.deepEqual(lamp.state.items.map(i=>i.instanceId),initial.items.map(i=>i.instanceId));
  assert.equal(auditLayout(lamp.state).ok,true);
});

test('a closed door stops navigation; its swing refuses to pass through the actor',()=>{
  const state=createCabinState('empty');
  assert.equal(setDoorOpen(state,false).ok,false,'actor on the porch lies inside the real swept door envelope');
  const inside=at(state,ENTRY_POINT),closed=setDoorOpen(inside,false);
  assert.equal(closed.ok,true);assert.equal(canStand(closed.state,{x:0,z:3.5}),false);
  assert.equal(findPath(closed.state,PORCH_POINT,ENTRY_POINT),null);
  assert.equal(auditLayout(closed.state).ok,true,'closing a usable door is not a broken floorplan');
  const opened=setDoorOpen(closed.state,true);assert.equal(opened.ok,true);
  assert.ok(findPath(opened.state,ENTRY_POINT,PORCH_POINT));
});

test('invalid destinations remain invalid instead of snapping to a falsely successful nearby point',()=>{
  const state=createCabinState('full');
  assert.equal(findPath(state,PORCH_POINT,{x:-2.85,z:-1.65}),null,'inside bed');
  assert.equal(findPath(state,PORCH_POINT,{x:5,z:0}),null,'outside floor');
  assert.equal(findPath(state,PORCH_POINT,{x:NaN,z:0}),null,'invalid coordinate');
});

test('all catalogue items restore one by one using their declared supports and useful approach points',()=>{
  let state=createCabinState('empty');
  for(const definition of ITEM_DEFINITIONS){
    const result=restoreItem(state,`audit:${definition.id}`);assert.equal(result.ok,true,`${definition.id}: ${result.reason}`);state=result.state;
  }
  const audit=auditLayout(state);assert.equal(audit.ok,true,audit.issues.join('\n'));assert.equal(audit.activeCount,10);
  const pose=itemPose(state,'audit:plant')!;near(pose.y,1.75);
});


test('audit snapshots round-trip only the explicit isolated schema, including a real seated or resting state',()=>{
  for(const preset of ['empty','starter','full'] as const){
    const source=createCabinState(preset),parsed=parseCabinSnapshot(JSON.parse(JSON.stringify(source)));
    assert.deepEqual(parsed,source);assert.notStrictEqual(parsed,source);
    assert.notStrictEqual(parsed!.items[0],source.items[0]);
  }
  const state=createCabinState('full');
  for(const id of ['audit:bed','audit:stool']){
    const used=useItem(at(state,approachPoint(state,id)!),id);assert.equal(used.ok,true);
    assert.deepEqual(parseCabinSnapshot(JSON.parse(JSON.stringify(used.state))),used.state);
  }
});

test('snapshot import rejects corrupt identities, unknown fields, nonfinite transforms and inconsistent posture',()=>{
  const mutations:((s:any)=>void)[]=[
    s=>s.schemaVersion=2,s=>s.preset='production',s=>s.secret='unknown',s=>s.items.pop(),
    s=>s.items[1].instanceId=s.items[0].instanceId,s=>s.items[1].definitionId='unknown',
    s=>s.items[0].instanceId='copied-bed',s=>s.items[0].extra=true,
    s=>s.items[0].location.x=NaN,s=>s.items[0].location.yaw=Infinity,
    s=>s.items[0].location.y=0,s=>s.items[0].open='yes',s=>s.items[0].lit=true,
    s=>s.player.facing=NaN,s=>s.player.posture='flying',s=>s.player.usingId='audit:bed',
    s=>{s.player.posture='resting';},
    s=>{s.player.posture='resting';s.player.usingId='audit:table';},
    s=>{s.player.posture='resting';s.player.usingId='audit:bed';},
    s=>s.doorOpen=1,
  ];
  for(const mutate of mutations){const source:any=createCabinState('full');mutate(source);assert.equal(parseCabinSnapshot(source),null,String(mutate));}
  for(const source of [null,[],{},'{}',42])assert.equal(parseCabinSnapshot(source),null);
  assert.equal(moveItem(createCabinState('full'),'audit:table',{x:2,z:1,yaw:NaN}).ok,false);
});

test('snapshot import checks real placement, unique support slots, support extents and orphaned contents',()=>{
  const outside=createCabinState('full');item(outside,'bed').location={kind:'floor',x:8,z:0,yaw:0};
  assert.equal(parseCabinSnapshot(outside),null);
  const orphan=createCabinState('full');item(orphan,'table').location={kind:'stored'};
  assert.equal(parseCabinSnapshot(orphan),null);
  const duplicate=createCabinState('full');item(duplicate,'bowl').location={kind:'surface',hostId:'audit:table',slotId:'lamp'};
  assert.equal(parseCabinSnapshot(duplicate),null);
  const tooWide=createCabinState('full');item(tooWide,'bowl').location={kind:'stored'};
  item(tooWide,'plant').location={kind:'surface',hostId:'audit:table',slotId:'bowl'};
  assert.equal(auditLayout(tooWide).ok,false,'plant width exceeds this registered support');
  assert.equal(parseCabinSnapshot(tooWide),null);
  const badUse=createCabinState('full');item(badUse,'stool').location={kind:'stored'};
  badUse.player={...badUse.player,posture:'seated',usingId:'audit:stool'};
  assert.equal(parseCabinSnapshot(badUse),null);
});


test('a closed chest still reserves the full lid sweep behind and above its ordinary footprint',()=>{
  const empty=createCabinState('empty'),placed=restoreItem(empty,'audit:chest');assert.equal(placed.ok,true);
  const tooClose=validatePlacement(placed.state,'audit:chest',{x:0,z:-3.05,yaw:0});
  assert.equal(tooClose.ok,false);assert.match(tooClose.reason!,/开合/);
  const rotated=validatePlacement(placed.state,'audit:chest',{x:-3.75,z:-.5,yaw:Math.PI/2});
  assert.equal(rotated.ok,false);assert.match(rotated.reason!,/开合/);
  const chestDefinition=ITEM_DEFINITIONS.find(d=>d.id==='chest')!;
  near(chestDefinition.motionEnvelope!.min[2],-.5);near(chestDefinition.motionEnvelope!.max[1],1.51);
  const chestOnly=createCabinState('empty');item(chestOnly,'chest').location={kind:'floor',x:0,z:0,yaw:0};
  assert.equal(canStand(chestOnly,{x:0,z:-1.34}),true,'reserved lid volume is not a new broad floor navigation blocker');
  const blocked=createCabinState('empty');item(blocked,'chest').location={kind:'floor',x:0,z:0,yaw:0};
  item(blocked,'stool').location={kind:'floor',x:0,z:-.825,yaw:0};
  assert.equal(auditLayout(blocked).ok,false,'closed footprints do not overlap, but the reserved lid sweep does');
  const opening=useItem(at(blocked,approachPoint(blocked,'audit:chest')!),'audit:chest');
  assert.equal(opening.ok,false);assert.match(opening.reason!,/开合/);
  const movableStool=structuredClone(chestOnly);item(movableStool,'stool').location={kind:'floor',x:-2.5,z:2,yaw:0};
  assert.equal(auditLayout(movableStool).ok,true);
  const intoSweep=validatePlacement(movableStool,'audit:stool',{x:0,z:-.825,yaw:0});
  assert.equal(intoSweep.ok,false);assert.match(intoSweep.reason!,/开合/);
});
