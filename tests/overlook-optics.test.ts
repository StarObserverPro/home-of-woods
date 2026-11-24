import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CAMERA} from '../src/content/world.ts';
import {navigationOpticsProjection,overlookAmount,overlookFocusBands,overlookCoC,overlookBufferSize,perspectiveViewDistance} from '../src/scene/overlook-optics-rules.ts';
import {applyNavigationOptics} from '../src/scene/overlook-optics.ts';
import {updateNavigationForecast} from '../src/scene/camera-forecast.ts';

const close=(a:number,b:number,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);

test('ordinary navigation retains its lens, while aerial framing uses a rotated full-frame gate',()=>{
  const ordinary={elevation:CAMERA.elevation,zoom:CAMERA.zoom};
  for(const aspect of [16/9,390/844]){
    for(const mobile of [false,true]){
      const lens=navigationOpticsProjection(ordinary,aspect,mobile);
      assert.equal(lens.fov,40);assert.equal(lens.zoom,CAMERA.zoom*(mobile?1.45:1));
      assert.equal(lens.amount,0);
    }
  }
  const aerial={elevation:1.1,zoom:CAMERA.minZoom};
  const landscape=navigationOpticsProjection(aerial,16/9,false),portrait=navigationOpticsProjection(aerial,390/844,true);
  close(landscape.horizontalFov,2*Math.atan(36/48)*180/Math.PI);
  close(portrait.verticalFov,landscape.horizontalFov);
  assert.ok(portrait.verticalFov<75,'portrait does not expand beyond a wide-angle lens');
  assert.equal(landscape.focalLengthMm,24);
  assert.ok(navigationOpticsProjection({...aerial,zoom:1.5},16/9,false).horizontalFov<landscape.horizontalFov,'zooming in still narrows aerial framing');
});

test('actual and forecast navigation have matching matrices across resize and return',()=>{
  const target={x:-12,y:18,z:7};
  const actual=new THREE.PerspectiveCamera(40,1,.1,3200),forecast=actual.clone();
  for(const aspect of [1.6,390/844,844/390])for(const elevation of [.24,.380001,.55,.86,1.15]){
    actual.aspect=aspect;
    const mobile=aspect<1,pose={yaw:.5,elevation,zoom:.61,distance:110};
    applyNavigationOptics(actual,pose,mobile);actual.updateProjectionMatrix();
    updateNavigationForecast(forecast,actual,pose,target,mobile);
    assert.deepEqual(forecast.projectionMatrix.elements,actual.projectionMatrix.elements);
  }
  applyNavigationOptics(actual,{elevation:CAMERA.elevation,zoom:CAMERA.zoom},true);
  close(actual.fov,40);close(actual.zoom,CAMERA.zoom*1.45);
});

test('lift enters continuously, broad midground stays sharp, and sky is excluded',()=>{
  const before=overlookAmount({elevation:.38,zoom:.76}),after=overlookAmount({elevation:.38001,zoom:.76});
  assert.equal(before,0);assert.ok(after<1e-7);
  const bands=overlookFocusBands(110);
  for(const depth of [bands.nearSharp,110,220,bands.farSharp])assert.equal(overlookCoC(depth,110),0);
  assert.equal(overlookCoC(bands.nearFull,110),-1);
  assert.equal(overlookCoC(bands.farFull,110),1);
  assert.equal(overlookCoC(3199,110,1,true),0);
  assert.equal(overlookCoC(2,110,0),0);
  assert.ok(overlookCoC(500,110)>0&&overlookCoC(500,110)<1);
});

test('depth reconstruction is perspective-correct and reduced buffers remain bounded on odd sizes',()=>{
  const near=.1,far=3200;
  for(const distance of [.1,10,110,3200]){
    const raw=(far-near*far/distance)/(far-near);
    close(perspectiveViewDistance(raw,near,far),distance,1e-5);
  }
  const s=overlookBufferSize(391,845,true);
  assert.equal(s.blurWidth,196);assert.equal(s.blurHeight,423);
  assert.equal(s.estimatedBytes,391*845*12+196*423*8);
  assert.deepEqual(overlookBufferSize(0,0,false),{width:1,height:1,blurWidth:1,blurHeight:1,estimatedBytes:20});
});
