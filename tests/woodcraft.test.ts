import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import {inventoryTransaction,woodBatch,canonicalStacks} from '../src/domain/inventory.ts';
import {createWoodcraft,availableWoodCount,transferWood,collectWood,validateWoodcraft} from '../src/domain/woodcraft.ts';
import {createWoodPhysics} from '../src/physics/woodcraft.ts';
import {createWoodcraftSession} from '../src/app/woodcraft-session.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {serializeWorldSave,prepareWorldSave} from '../src/domain/world-save.ts';
import {saveDigest} from '../src/domain/save-digest.ts';
import {WOODCRAFT} from '../src/content/woodcraft.ts';
import {heightAt} from '../src/world/surface.ts';
import {createWoodcraftPresentation} from '../src/scene/woodcraft-presentation.ts';
import {Resources} from '../src/scene/resources.ts';
const context=createSaveContext(),dt=WOODCRAFT.fixedStep;
function stock(logs=8,branches=4){const s=createState();s.player={...WOODCRAFT.stand,facing:0,moving:false};s.inventory=inventoryTransaction(s.inventory,[{itemId:'wood',qualityId:'ordinary',wood:woodBatch({lengthMm:1800,thicknessMm:460,straightness:'straight'}),delta:logs},{itemId:'branch',qualityId:'ordinary',delta:branches}]);return s;}
const yieldTask=()=>new Promise(r=>setTimeout(r,0));
function mockPhysics(onDispose=()=>{}){
  let disposed=false;
  return {step:()=>[],stats:()=>({bodies:0,awake:0,colliders:0,steps:0,maxStepMs:0,disposed}),dispose(){if(disposed)return;disposed=true;onDispose();}};
}
async function rehash(raw:string,change:(s:any)=>void){const s=JSON.parse(raw);change(s);delete s.checksum;s.checksum=await saveDigest(s);return JSON.stringify(s);}

test('batch transfer reserves one total piece and manual release uses the final slot',()=>{
  const s=stock();assert.equal(transferWood(s,'prepare'),11);assert.equal(availableWoodCount(s.inventory),1);assert.equal(transferWood(s,'prepare'),0);
  assert.equal(transferWood(s,'one',{x:WOODCRAFT.x,y:heightAt(WOODCRAFT.x,WOODCRAFT.z),z:WOODCRAFT.z}),1);assert.equal(availableWoodCount(s.inventory),0);assert.equal(s.woodcraft.pieces.length,12);assert.equal(transferWood(s,'one'),0);
});
test('empty and single-piece inventories do not create materials',()=>{for(const n of [0,1]){const s=stock(n,0);assert.equal(transferWood(s,'prepare'),0);assert.equal(availableWoodCount(s.inventory),n);assert.deepEqual(s.woodcraft,createWoodcraft());}});
test('capacity leaves excess in inventory and one free manual slot',()=>{const s=stock(40,0);assert.equal(transferWood(s,'prepare'),31);assert.equal(availableWoodCount(s.inventory),9);assert.equal(transferWood(s,'one'),1);assert.equal(transferWood(s,'one'),0);assert.equal(availableWoodCount(s.inventory),8);});
test('reserved wood, fuel and unknown catalog records are never moved',()=>{
  const s=stock(2,0);s.inventory.stacks=canonicalStacks([...s.inventory.stacks,{itemId:'wood',qualityId:'fine',quantity:5,wood:{...woodBatch(null),reserved:true}},{itemId:'scrap-fuel',qualityId:'ordinary',quantity:7},{itemId:'branch',qualityId:'unknown-quality',quantity:3}]);
  assert.equal(transferWood(s,'prepare'),1);assert.equal(s.inventory.stacks.reduce((n,p)=>n+p.quantity,0),16);
});
test('pickup restores exact source batches and is idempotent',()=>{const s=stock(),before=structuredClone(s.inventory.stacks);transferWood(s,'prepare');for(const p of [...s.woodcraft.pieces]){assert.equal(collectWood(s,p.id),true);assert.equal(collectWood(s,p.id),false);}assert.deepEqual(s.inventory.stacks,before);assert.equal(s.woodcraft.pieces.length,0);});
test('invalid click has no partial debit or identity allocation',()=>{const s=stock(),before=structuredClone(s);assert.throws(()=>transferWood(s,'one',{x:100,y:22,z:100}));assert.deepEqual(s,before);});
test('loose source, poses and identities are strictly validated',()=>{
  const s=stock();transferWood(s,'prepare');validateWoodcraft(s.woodcraft);
  for(const mutate of [(v:any)=>v.pieces[0].position.y=NaN,(v:any)=>v.pieces[0].rotation.w=5,(v:any)=>v.pieces[0].source.quantity=2,(v:any)=>v.pieces.push(v.pieces[0]),(v:any)=>v.nextId=1,(v:any)=>v.pieces[0].linear.x=100,(v:any)=>v.pieces[0].extra=true]){const copy=structuredClone(s.woodcraft);mutate(copy);assert.throws(()=>validateWoodcraft(copy));}
});
test('world save round trip includes queued material ownership and selected piece',async()=>{const s=stock();transferWood(s,'prepare');s.selected=s.woodcraft.pieces[0].id;const raw=await serializeWorldSave(s,context,{sequence:1,savedAt:10});const loaded=await prepareWorldSave(raw,context);assert.equal(loaded.decision,'restored');if(loaded.decision==='restored'){assert.deepEqual(loaded.value.woodcraft,s.woodcraft);assert.deepEqual(loaded.value.inventory.stacks,s.inventory.stacks);}});
test('damaged current and future saves are protected rather than reset',async()=>{const s=stock();transferWood(s,'prepare');const raw=await serializeWorldSave(s,context,{sequence:1,savedAt:10});for(const mutate of [(v:any)=>delete v.world.woodcraft,(v:any)=>v.world.woodcraft.pieces[0].source.quantity=9,(v:any)=>v.rulesetVersion=999]){const bad=await rehash(raw,mutate);const loaded=await prepareWorldSave(bad,context);assert.equal(loaded.decision,'protected');if(loaded.decision==='protected')assert.equal(loaded.raw,bad);}});
test('real Rapier gravity settles a mixed pile, reaches sleep and skips idle solver steps',async()=>{
  const s=stock();transferWood(s,'prepare');const physics=await createWoodPhysics();
  try{for(let i=0;i<2400;i++)assert.deepEqual(physics.step(s.woodcraft,dt),[]);assert.equal(physics.stats().bodies,11);assert.equal(physics.stats().awake,0);assert.ok(s.woodcraft.pieces.some(p=>p.position.y>22));assert.ok(s.woodcraft.pieces.every(p=>p.position.y>=heightAt(p.position.x,p.position.z)+.04));validateWoodcraft(s.woodcraft);const steps=physics.stats().steps;for(let i=0;i<120;i++)physics.step(s.woodcraft,dt);assert.equal(physics.stats().steps,steps);}finally{physics.dispose();physics.dispose();}assert.equal(physics.stats().bodies,0);assert.equal(physics.stats().colliders,0);
});
test('removing a lower support wakes and resettles the upper log',async()=>{
  const s=stock(4,0);transferWood(s,'prepare');const r=.23,y=heightAt(WOODCRAFT.x,WOODCRAFT.z),q={x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2};
  s.woodcraft.pieces.forEach((p,i)=>{p.phase='loose';p.position={x:WOODCRAFT.x,y:y+r+(i===2?Math.sqrt(3)*r:0),z:WOODCRAFT.z+(i===0?-r:i===1?r:0)};p.rotation=q;p.linear={x:0,y:0,z:0};p.angular={x:0,y:0,z:0};});
  const physics=await createWoodPhysics();try{for(let i=0;i<1200;i++)physics.step(s.woodcraft,dt);const top=s.woodcraft.pieces[2],before=top.position.y;assert.ok(before>y+.5);collectWood(s,s.woodcraft.pieces[0].id);physics.step(s.woodcraft,dt);assert.ok(physics.stats().awake>0);for(let i=0;i<1200;i++)physics.step(s.woodcraft,dt);assert.ok(top.position.y<before-.15);assert.equal(availableWoodCount(s.inventory)+s.woodcraft.pieces.length,4);}finally{physics.dispose();}
});
test('hourglass speed cannot change physical elapsed time or settling',async()=>{
  const a=stock(3,0),b=stock(3,0);transferWood(a,'prepare');transferWood(b,'prepare');a.clock.speed=1;b.clock.speed=12;const pa=await createWoodPhysics(),pb=await createWoodPhysics();
  try{for(let i=0;i<600;i++){a.time+=dt;b.time+=dt*12;pa.step(a.woodcraft,dt);pb.step(b.woodcraft,dt);}assert.deepEqual(a.woodcraft,b.woodcraft);assert.throws(()=>pa.step(a.woodcraft,dt*12));}finally{pa.dispose();pb.dispose();}
});
test('airborne save restores velocity, then settles without duplicating a body',async()=>{const s=stock(3,0);transferWood(s,'prepare');const first=await createWoodPhysics();first.step(s.woodcraft,dt);const raw=await serializeWorldSave(s,context,{sequence:1,savedAt:10});first.dispose();const loaded=await prepareWorldSave(raw,context);assert.equal(loaded.decision,'restored');if(loaded.decision!=='restored')return;const second=await createWoodPhysics();try{for(let i=0;i<1200;i++)second.step(loaded.value.woodcraft,dt);assert.equal(second.stats().bodies,2);assert.equal(second.stats().awake,0);assert.equal(availableWoodCount(loaded.value.inventory),1);}finally{second.dispose();}});
test('32-piece stress stays conserved and valid after real solver steps',async()=>{const s=stock(29,4);transferWood(s,'prepare');transferWood(s,'one');const p=await createWoodPhysics();try{for(let i=0;i<3600;i++)for(const id of p.step(s.woodcraft,dt))collectWood(s,id);validateWoodcraft(s.woodcraft);assert.equal(availableWoodCount(s.inventory)+s.woodcraft.pieces.length,33);assert.ok(p.stats().bodies<=32);assert.ok(p.stats().awake<4);}finally{p.dispose();}});
test('loader failure never charges inventory and late results are disposed',async()=>{
  const s=stock(),before=structuredClone(s.inventory);const failed=createWoodcraftSession(s,()=>{},async()=>{throw new Error('offline');});failed.requestPrepare();await yieldTask();failed.step(dt);assert.deepEqual(s.inventory,before);assert.ok(failed.snapshot().error);failed.dispose();
  let resolve:any,disposed=0;const deferred=new Promise<any>(r=>resolve=r);const late=createWoodcraftSession(s,()=>{},()=>deferred);late.requestPrepare();late.dispose();resolve({dispose(){disposed++;}});await yieldTask();assert.equal(disposed,1);assert.deepEqual(s.inventory,before);
});
test('far travel frees physics and revisiting restores the same saved pieces',async()=>{const s=stock(3,0),session=createWoodcraftSession(s,()=>{});session.requestPrepare();for(let i=0;i<20&&!session.snapshot().ready;i++)await yieldTask();for(let i=0;i<1200;i++)session.step(dt);const poses=structuredClone(s.woodcraft);s.player.x=50;session.step(dt);assert.equal(session.stats().loaded,false);assert.deepEqual(s.woodcraft,poses);s.player={...WOODCRAFT.stand,facing:0,moving:false};session.step(dt);for(let i=0;i<20&&!session.snapshot().ready;i++)await yieldTask();session.step(dt);assert.equal(session.stats().loaded,true);assert.equal(s.woodcraft.pieces.length,2);session.dispose();});
test('approaching an empty wood area retains activation through travel and does not automatically move stock',async()=>{
  const s=stock(3,0),before=structuredClone(s.inventory);s.player.x=50;s.player.z=0;
  let loads=0,disposals=0;
  const session=createWoodcraftSession(s,()=>{},async()=>{loads++;return mockPhysics(()=>disposals++);});
  session.activate();session.step(dt);await yieldTask();
  assert.equal(loads,0,'distant inspection does not start loading');
  s.player.x=WOODCRAFT.x+WOODCRAFT.activateRadius-1;s.player.z=WOODCRAFT.z;
  session.step(dt);await yieldTask();assert.equal(session.snapshot().ready,true);assert.equal(loads,1);
  s.player.x=50;session.step(dt);assert.equal(session.snapshot().ready,false);assert.equal(disposals,1);
  s.player={...WOODCRAFT.stand,facing:0,moving:false};session.step(dt);await yieldTask();session.step(dt);
  assert.equal(session.snapshot().near,true);assert.equal(session.snapshot().ready,true);assert.equal(loads,2,'an empty island still reloads after returning');
  assert.deepEqual(s.inventory,before);assert.equal(s.woodcraft.pieces.length,0);
  assert.equal(session.beginDrop(),true,'manual placement is available on arrival');
  session.cancelRequest();assert.equal(session.isDropping(),false);assert.deepEqual(s.inventory,before);
  session.dispose();assert.equal(disposals,2);
});
test('cancelling an approach, pending batch or uncommitted drop never moves materials',async()=>{
  const s=stock(3,0),before=structuredClone(s.inventory);s.player.x=50;s.player.z=0;
  let loads=0;
  const session=createWoodcraftSession(s,()=>{},async()=>{loads++;return mockPhysics();});
  session.activate();session.cancelRequest();s.player={...WOODCRAFT.stand,facing:0,moving:false};
  session.step(dt);await yieldTask();assert.equal(loads,0,'cancelled approach does not activate the empty island later');
  session.requestPrepare();session.cancelRequest();await yieldTask();session.step(dt);
  assert.equal(session.snapshot().ready,true);assert.deepEqual(s.inventory,before);assert.equal(s.woodcraft.pieces.length,0,'late loader completion cannot resurrect the cancelled batch');
  assert.equal(session.beginDrop(),true);session.cancelRequest();
  assert.equal(session.drop({x:WOODCRAFT.x,y:heightAt(WOODCRAFT.x,WOODCRAFT.z),z:WOODCRAFT.z}),false);
  assert.deepEqual(s.inventory,before);assert.equal(s.woodcraft.pieces.length,0);
  session.dispose();
});
test('presentation follows solver poses and unregisters collected pieces',()=>{const s=stock(3,0);transferWood(s,'prepare');s.woodcraft.pieces.forEach(p=>p.phase='loose');const r=new Resources(),v=createWoodcraftPresentation(r);v.update(s.woodcraft);assert.equal(v.stats().visible,2);const p=s.woodcraft.pieces[0];assert.equal(v.group.getObjectByName(p.id)?.position.y,p.position.y);collectWood(s,p.id);v.update(s.woodcraft);assert.equal(v.stats().visible,1);v.dispose();r.dispose();assert.equal(v.stats().hits,0);assert.equal(r.stats().geometries,0);});
