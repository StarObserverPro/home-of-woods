import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMERA} from '../src/content/world.ts';
import {OVERLOOK} from '../src/content/camera.ts';
import {createAnchoredOverlook} from '../src/scene/anchored-overlook.ts';
import {updateNavigationForecast} from '../src/scene/camera-forecast.ts';
import {navigationOpticsProjection} from '../src/scene/overlook-optics-rules.ts';
import * as THREE from 'three';

const home={x:-12,y:18,z:7};
const close=(a:number,b:number,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);
const settle=(rig:ReturnType<typeof createAnchoredOverlook>,target=home)=>{
  for(let frame=0;rig.pending()&&frame<600;frame++)rig.update(1/60,target);
  assert.equal(rig.pending(),false);
};

test('default composition stays untouched; rising captures one fixed observation center',()=>{
  const rig=createAnchoredOverlook();
  rig.update(1/60,home);
  assert.deepEqual(rig.plan().current,{yaw:CAMERA.yaw,elevation:CAMERA.elevation,zoom:CAMERA.zoom,distance:OVERLOOK.distance});
  assert.equal(rig.plan().anchor,null);
  rig.elevate(.7,home);
  assert.equal(rig.groundReady(),false,'movement is blocked before the first render');
  const movedPlayerTarget={x:home.x+90,y:home.y+10,z:home.z-40};
  settle(rig,movedPlayerTarget);
  assert.deepEqual(rig.plan().anchor,home);
  rig.rotate(1);rig.zoomBy(.01,movedPlayerTarget);settle(rig,movedPlayerTarget);
  assert.deepEqual(rig.plan().anchor,home,'orbit/zoom never acquires a new aerial center');
  close(rig.plan().current.zoom,CAMERA.minZoom);
  assert.equal(rig.plan().mode,'overlook');
});

test('input floods and long frames cannot outrun the authored angular and logarithmic rates',()=>{
  const rig=createAnchoredOverlook();
  for(let i=0;i<1000;i++){rig.rotate(2);rig.elevate(1,home);rig.zoomBy(.5,home);}
  const before=rig.plan().current;
  rig.update(5,home);
  const after=rig.plan().current;
  close(after.yaw-before.yaw,OVERLOOK.yawRate*OVERLOOK.maxDelta);
  close(after.elevation-before.elevation,OVERLOOK.elevationRate*OVERLOOK.maxDelta);
  close(Math.log(before.zoom/after.zoom),OVERLOOK.logZoomRate*OVERLOOK.maxDelta);
  assert.ok(Math.abs(rig.plan().desired.yaw-before.yaw)<=OVERLOOK.maxQueuedYaw+1e-8);
  const a=createAnchoredOverlook(),b=createAnchoredOverlook();
  for(const r of [a,b]){r.rotate(.5);r.elevate(.8,home);r.zoomBy(.65,home);}
  for(let i=0;i<60;i++)a.update(1/60,home);
  for(let i=0;i<30;i++)b.update(1/30,home);
  for(const key of ['yaw','elevation','zoom'] as const)close(a.plan().current[key],b.plan().current[key]);
});

test('readiness gates expansion while contraction and reset remain available',()=>{
  const rig=createAnchoredOverlook();
  rig.elevate(.8,home);rig.zoomBy(.65,home);
  rig.setAdvanceScale(0);rig.update(.1,home);
  close(rig.plan().current.elevation,CAMERA.elevation);
  close(rig.plan().current.zoom,CAMERA.zoom);
  rig.setAdvanceScale(.25);rig.update(.1,home);
  close(rig.plan().current.elevation,CAMERA.elevation+OVERLOOK.elevationRate*.1*.25);
  rig.setAdvanceScale(1);settle(rig);
  rig.setAdvanceScale(0);rig.reset();settle(rig);
  assert.equal(rig.groundReady(),true);
  close(rig.plan().current.elevation,CAMERA.elevation);
  close(rig.plan().current.zoom,CAMERA.zoom);
});

test('aerial turns wait for prepared views while ground turns and return remain available',()=>{
  const rig=createAnchoredOverlook();
  rig.elevate(.8,home);rig.rotate(.5);rig.setAdvanceScale(0);
  const before=rig.plan().current;
  rig.update(.1,home);
  assert.deepEqual(rig.plan().current,before,'first high-view frame cannot outrun preparation');
  const future=rig.forecast(.1,home,()=>home);
  assert.ok(future.pose.yaw>before.yaw,'forecast advances even while actual camera waits');
  rig.setAdvanceScale(1);rig.update(.1,home);
  close(rig.plan().current.yaw,before.yaw+OVERLOOK.yawRate*.1);
  rig.setAdvanceScale(0);rig.requestFollow();settle(rig);
  assert.equal(rig.groundReady(),true,'return cannot deadlock on preparation');
  const groundYaw=rig.plan().current.yaw;rig.rotate(.2);rig.update(.1,home);
  close(rig.plan().current.yaw,groundYaw+OVERLOOK.yawRate*.1);
});

test('walking waits for both orbit recovery and a bounded return to its follow target',()=>{
  const rig=createAnchoredOverlook();
  rig.elevate(.8,home);settle(rig);
  const destination={x:home.x+45,y:home.y,z:home.z+15};
  assert.equal(rig.requestFollow(),false);
  const highAnchor=rig.plan().anchor;
  rig.setAdvanceScale(0);rig.update(.1,destination);
  assert.deepEqual(rig.plan().anchor,highAnchor,'no aerial panning during descent');
  let movedAnchor=false;
  for(let frame=0;frame<300&&!rig.groundReady();frame++){
    const before=rig.plan();rig.requestFollow();rig.update(1/60,destination);
    const after=rig.plan();
    if(before.anchor&&after.anchor){
      const distance=Math.hypot(after.anchor.x-before.anchor.x,after.anchor.y-before.anchor.y,after.anchor.z-before.anchor.z);
      assert.ok(distance<=OVERLOOK.returnTargetSpeed/60+1e-8);
      if(distance>0){movedAnchor=true;assert.ok(after.current.elevation<=CAMERA.elevation+1e-8);}
    }
  }
  assert.ok(movedAnchor);
  assert.equal(rig.requestFollow(),true);
  assert.equal(rig.plan().anchor,null);
});

test('authored scene, character and cabin owners preserve the suspended outdoor rig',()=>{
  for(const owner of ['scene','character','cabin'] as const){
    const rig=createAnchoredOverlook();rig.elevate(.6,home);rig.update(.1,home);
    const before=rig.plan();rig.setBorrower(owner);
    rig.rotate(1);rig.elevate(1,{x:90,y:90,z:90});rig.zoomBy(.5,home);rig.update(.1,home);
    assert.equal(rig.pending(),false,'a borrowed view cannot keep paused navigation frames alive');
    assert.deepEqual(rig.plan().current,before.current);
    assert.deepEqual(rig.plan().desired,before.desired);
    assert.deepEqual(rig.plan().anchor,before.anchor);
    rig.setBorrower(null);settle(rig);
    assert.equal(rig.plan().mode,'overlook');
    close(rig.plan().current.elevation,before.desired.elevation);
  }
});

test('a furniture close view releases along a bounded radius before walking is allowed',()=>{
  const rig=createAnchoredOverlook();
  rig.releaseFocus({yaw:CAMERA.yaw,elevation:CAMERA.elevation,zoom:1,distance:21},home);
  rig.elevate(.16,home);rig.update(.1,home);
  close(rig.plan().current.distance,24);
  assert.equal(rig.groundReady(),false);
  rig.setAdvanceScale(0);rig.update(.1,home);close(rig.plan().current.distance,24);
  rig.requestFollow();rig.update(.1,home);close(rig.plan().current.distance,27);
  settle(rig);
  assert.equal(rig.groundReady(),true);
  close(rig.plan().current.distance,110);
});

test('short forecast follows the same constrained orbit without consuming readiness or moving the rig',()=>{
  const rig=createAnchoredOverlook();rig.elevate(.8,home);rig.rotate(1);rig.zoomBy(.65,home);
  rig.setAdvanceScale(0);
  const before=rig.plan(),sample=rig.forecast(.5,home,()=>home);
  assert.deepEqual(rig.plan(),before);
  rig.setAdvanceScale(1);for(let i=0;i<30;i++)rig.update(1/60,home);
  for(const key of ['yaw','elevation','zoom','distance'] as const)close(sample.pose[key],rig.plan().current[key]);
  assert.deepEqual(sample.target,rig.plan().anchor);
});

test('forecast projection uses the actual aspect/clip planes and shared navigation lens',()=>{
  const actual=new THREE.PerspectiveCamera(40,390/844,.1,3200);
  actual.setViewOffset(390,844,0,140,390,844);
  const forecast=new THREE.PerspectiveCamera();
  const pose={yaw:.5,elevation:.8,zoom:.5,distance:110};
  updateNavigationForecast(forecast,actual,pose,home,true);
  close(forecast.aspect,actual.aspect);close(forecast.zoom,navigationOpticsProjection(pose,actual.aspect,true).zoom);
  assert.equal(forecast.near,actual.near);assert.equal(forecast.far,actual.far);
  assert.equal(forecast.view?.enabled,false,'authored view offsets do not leak into navigation');
  const center=new THREE.Vector3(home.x,home.y,home.z).project(forecast);
  close(center.x,0);close(center.y,0);
  actual.aspect=16/9;actual.updateProjectionMatrix();
  updateNavigationForecast(forecast,actual,pose,home,false);
  close(forecast.aspect,16/9);close(forecast.zoom,navigationOpticsProjection(pose,16/9,false).zoom);
});
