import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CAMERA} from '../src/content/world.ts';
import {OVERLOOK} from '../src/content/camera.ts';
import {navigationOpticsProjection,navigationDollyScale,navigationZoomForProjection,overlookAmount,overlookFocusBands,overlookCoC,overlookBufferSize,perspectiveViewDistance} from '../src/scene/overlook-optics-rules.ts';
import {createAnchoredOverlook} from '../src/scene/anchored-overlook.ts';
import {applyNavigationOptics} from '../src/scene/overlook-optics.ts';
import {positionNavigationCamera,updateNavigationForecast} from '../src/scene/camera-forecast.ts';
import {exteriorHeight} from '../src/world/horizon.js';

const close=(a:number,b:number,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);

test('ordinary navigation retains its lens, while aerial framing uses a rotated full-frame gate',()=>{
  const ordinary={elevation:CAMERA.elevation,zoom:CAMERA.zoom};
  for(const aspect of [16/9,390/844]){
    for(const mobile of [false,true]){
      const lens=navigationOpticsProjection(ordinary,aspect,mobile);
      assert.equal(lens.fov,40);assert.equal(lens.zoom,CAMERA.zoom*(mobile?1.45:1));
      assert.equal(lens.amount,0);assert.equal(lens.dollyScale,1);
      const raised=navigationOpticsProjection({...ordinary,elevation:1.1},aspect,mobile);
      assert.ok(raised.verticalFov>=lens.verticalFov-1e-8,'raising alone never narrows the ground lens');
    }
  }
  const aerial={elevation:1.1,zoom:CAMERA.minZoom};
  const landscape=navigationOpticsProjection(aerial,1.6,false),portrait=navigationOpticsProjection(aerial,390/844,true);
  close(landscape.horizontalFov,2*Math.atan(36/32)*180/Math.PI);
  close(portrait.verticalFov,landscape.horizontalFov);
  assert.ok(portrait.verticalFov<100,'portrait remains inside the 16 mm rotated gate');
  assert.equal(landscape.focalLengthMm,16);
  for(const aspect of [16/9,844/390]){
    const wide=navigationOpticsProjection(aerial,aspect,false);
    close(wide.verticalFov,68);
    assert.ok(wide.focalLengthMm>=12&&wide.focalLengthMm<16,'extra-wide framing has an explicit bounded focal range');
  }
  assert.ok(navigationOpticsProjection({...aerial,zoom:1.5},16/9,false).horizontalFov<landscape.horizontalFov,'zooming in still narrows aerial framing');
});

test('actual and forecast navigation have matching matrices across resize and return',()=>{
  const target={x:-12,y:18,z:7};
  const actual=new THREE.PerspectiveCamera(40,1,.1,3200),forecast=actual.clone();
  for(const aspect of [1.6,390/844,844/390])for(const elevation of [.24,.380001,.55,.86,1.15]){
    actual.aspect=aspect;
    const mobile=aspect<.8;
    for(const distance of [110,146,220]){
      const pose={yaw:.5,elevation,zoom:.61,distance};
      positionNavigationCamera(actual,pose,target);
      applyNavigationOptics(actual,pose,mobile);actual.updateProjectionMatrix();actual.updateMatrixWorld(true);
      updateNavigationForecast(forecast,actual,pose,target,mobile);
      assert.deepEqual(forecast.projectionMatrix.elements,actual.projectionMatrix.elements);
      assert.deepEqual(forecast.matrixWorldInverse.elements,actual.matrixWorldInverse.elements);
      assert.ok(actual.position.y>=exteriorHeight(actual.position.x,actual.position.z)+3-1e-8);
    }
  }
  applyNavigationOptics(actual,{elevation:CAMERA.elevation,zoom:CAMERA.zoom},true);
  close(actual.fov,40);close(actual.zoom,CAMERA.zoom*1.45);
});

test('zoom-out dolly uses the existing radius rate and returns without a second camera state',()=>{
  for(const aspect of [1.6,16/9,844/390,390/844]){
    const rig=createAnchoredOverlook(),target={x:-9.5,y:27.5,z:20.75},mobile=aspect<.8;
    const span=()=>{const p=rig.plan().current,l=navigationOpticsProjection(p,aspect,mobile);return p.distance*Math.tan(l.verticalFov*Math.PI/360);};
    const original=span();let previous=original;
    for(let i=0;i<3;i++)rig.zoomBy(1/1.18,target);
    close(rig.plan().desired.distance,220);
    for(let i=0;rig.pending()&&i<600;i++){
      const before=rig.plan().current;
      rig.update(1/60,target);
      const after=rig.plan().current,currentSpan=span();
      assert.ok(after.distance-before.distance<=OVERLOOK.distanceRate/60+1e-8);
      assert.ok(currentSpan>=previous-1e-8,'zooming out must continuously expand the target plane');
      previous=currentSpan;
    }
    assert.equal(rig.pending(),false);close(rig.plan().current.distance,220);
    assert.ok(span()>original*2.5,'the panorama is substantially wider than ordinary navigation');
    assert.deepEqual(rig.plan().anchor,target);
    rig.requestFollow();
    for(let i=0;rig.pending()&&i<600;i++){
      const before=rig.plan().current;rig.update(1/60,target);
      assert.ok(Math.abs(rig.plan().current.distance-before.distance)<=OVERLOOK.distanceRate/60+1e-8);
    }
    assert.equal(rig.groundReady(),true);close(rig.plan().current.distance,110);close(span(),original);
  }
  close(navigationDollyScale(.70),1);close(navigationDollyScale(.50),2);
  assert.ok(navigationDollyScale(.699999)-1<1e-8,'dolly enters continuously');
});

test('a borrowed close view hands its radius and projection back without a lens jump',()=>{
  for(const aspect of [1.6,390/844]){
    const mobile=aspect<.8,elevation=.24,zoom=navigationZoomForProjection(1,elevation,aspect,mobile);
    close(navigationOpticsProjection({elevation,zoom},aspect,mobile).zoom,1);
    const rig=createAnchoredOverlook();rig.releaseFocus({yaw:.1,elevation,zoom,distance:21},{x:0,y:20,z:0});
    close(rig.plan().current.distance,21);
    rig.update(0,{x:0,y:20,z:0});close(rig.plan().current.distance,21);
    rig.update(.1,{x:0,y:20,z:0});close(rig.plan().current.distance,24);
  }
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
