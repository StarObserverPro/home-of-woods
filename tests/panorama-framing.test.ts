import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MOUNTAINS} from '../src/content/environment.ts';
import {CAMERA,CABIN,TENT,GIANT} from '../src/content/world.ts';
import {OVERLOOK} from '../src/content/camera.ts';
import {heightAt} from '../src/world/surface.ts';
import {createAnchoredOverlook} from '../src/scene/anchored-overlook.ts';
import {updateNavigationForecast} from '../src/scene/camera-forecast.ts';
import {buildMountainGeometry} from '../src/scene/mountain-geometry.js';

const campAnchor={x:-9.5,y:27.5,z:20.75};
const views=[
  {name:'1280×800',aspect:1280/800},
  {name:'16:9',aspect:16/9},
  {name:'844×390',aspect:844/390},
  {name:'390×844 portrait',aspect:390/844},
];

function crownSummit(){
  const spec=MOUNTAINS.find(mountain=>mountain.id==='crown');
  assert.ok(spec,'the main massif must exist');
  const geometry=buildMountainGeometry(spec);
  try{
    // Use the authored mesh, including its sampled ridge and height variation.
    // The nominal definition height is not the rendered summit coordinate.
    const positions=geometry.getAttribute('position');
    let highest=0;
    for(let i=1;i<positions.count;i++)if(positions.getY(i)>positions.getY(highest))highest=i;
    return new THREE.Vector3().fromBufferAttribute(positions,highest);
  }finally{geometry.dispose();}
}

function settle(rig:ReturnType<typeof createAnchoredOverlook>){
  for(let frame=0;rig.pending()&&frame<600;frame++)rig.update(1/60,campAnchor);
  assert.equal(rig.pending(),false,'ordinary camera input must settle');
}

function cameraFor(rig:ReturnType<typeof createAnchoredOverlook>,aspect:number){
  const actual=new THREE.PerspectiveCamera(40,aspect,.1,3200);
  const plan=rig.plan();
  return updateNavigationForecast(new THREE.PerspectiveCamera(),actual,
    plan.current,plan.anchor??campAnchor,aspect<.8);
}

function assertInFrame(camera:THREE.PerspectiveCamera,point:THREE.Vector3,label:string){
  const projected=point.clone().project(camera);
  assert.ok([projected.x,projected.y,projected.z].every(Number.isFinite),`${label}: finite projection`);
  assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1&&projected.z>-1&&projected.z<1,
    `${label} is outside the frame: ${projected.toArray().join(', ')}`);
}

function lowerGroundWidth(camera:THREE.PerspectiveCamera){
  // A finite lower-screen slice avoids calling the horizon's unbounded ground
  // footprint an area. This is a local camp-height plane, not an occlusion test.
  const ground=new THREE.Plane(new THREE.Vector3(0,1,0),-heightAt(campAnchor.x,campAnchor.z));
  const ray=new THREE.Raycaster();
  const hits=[-1,1].map(x=>{
    ray.setFromCamera(new THREE.Vector2(x,-.5),camera);
    const hit=ray.ray.intersectPlane(ground,new THREE.Vector3());
    assert.ok(hit,'the lower-screen ray must reach the ground in front of the camera');
    return hit;
  });
  return hits[0].distanceTo(hits[1]);
}

for(const view of views)test(`three ordinary zoom-out clicks frame camp and the actual main summit at ${view.name}`,()=>{
  const rig=createAnchoredOverlook();
  const groundCamera=cameraFor(rig,view.aspect);
  // This is the actual toolbar zoom factor, without raising or rotating first.
  for(let click=0;click<3;click++){
    rig.zoomBy(1/1.18,campAnchor);
    settle(rig);
  }
  const plan=rig.plan();
  assert.equal(plan.current.yaw,CAMERA.yaw);
  assert.equal(plan.current.elevation,CAMERA.elevation);
  assert.equal(plan.current.zoom,CAMERA.minZoom);
  assert.deepEqual(plan.anchor,campAnchor,'zooming keeps the existing observation center');

  const panorama=cameraFor(rig,view.aspect);
  // Portrait intentionally need not include every side massif. These checks
  // establish geometric framing; real rendered visibility remains a GPU check.
  assertInFrame(panorama,crownSummit(),'main summit');
  assertInFrame(panorama,new THREE.Vector3(campAnchor.x,campAnchor.y,campAnchor.z),'camp anchor');
  for(const [name,point] of [['cabin',CABIN],['tent',TENT],['giant tree base',GIANT]] as const)
    assertInFrame(panorama,new THREE.Vector3(point.x,heightAt(point.x,point.z),point.z),name);
  assert.ok(lowerGroundWidth(panorama)>lowerGroundWidth(groundCamera),
    'zooming out must expand the ground coverage as well as include the summit');
  assert.ok(Math.abs(plan.current.distance-2*OVERLOOK.distance)<1e-8,
    'the panorama uses the bounded 220-unit radius');
});
