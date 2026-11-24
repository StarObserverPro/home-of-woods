import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoop, requiredFrameMode} from '../src/app/runtime-loop.ts';

test('paused visual work uses one frame chain and never advances simulation',()=>{
  const pending=new Map<number,(now:number)=>void>();
  let next=0, work=3, worldTime=12, presentationTime=0, hardStop=false, simulationPaused=true, resets=0;
  const loop=createLoop((dt,_now,mode)=>{
    if(mode==='simulation')worldTime+=dt;
    else{presentationTime+=dt;work--;}
    wake();
  },{request(callback){pending.set(++next,callback);return next;},cancel(id){pending.delete(id);}},()=>resets++);
  const wake=()=>loop.setMode(requiredFrameMode(hardStop,simulationPaused,work>0));
  const frame=(now:number)=>{
    assert.equal(pending.size,1);
    const [id,callback]=pending.entries().next().value!;
    pending.delete(id);callback(now);
  };
  wake();wake();
  frame(1_000);frame(1_016);frame(1_032);
  assert.equal(worldTime,12);
  assert.equal(presentationTime,.032);
  assert.equal(resets,0,'a visual wake does not reset simulation/input state');
  assert.equal(pending.size,0,'the same loop sleeps as soon as visual work settles');
  work=2;wake();hardStop=true;wake();
  assert.equal(pending.size,0,'hidden/context-lost/capture-held work stays stopped');
  hardStop=false;wake();frame(20_000);
  assert.equal(presentationTime,.032,'a long hard stop establishes a fresh time baseline');
  simulationPaused=false;wake();frame(25_000);frame(25_016);
  assert.equal(worldTime,12.016);
  assert.equal(resets,1,'returning to simulation resets only its frame baseline');
  loop.destroy();work=5;wake();
  assert.equal(pending.size,0);
});

test('simulation pause wins over visual readiness and hard stops win over every mode',()=>{
  assert.equal(requiredFrameMode(false,false,false),'simulation');
  assert.equal(requiredFrameMode(false,false,true),'simulation');
  assert.equal(requiredFrameMode(false,true,true),'presentation');
  assert.equal(requiredFrameMode(false,true,false),'stopped');
  for(const simulationPaused of [false,true])for(const pending of [false,true]){
    assert.equal(requiredFrameMode(true,simulationPaused,pending),'stopped');
  }
});
