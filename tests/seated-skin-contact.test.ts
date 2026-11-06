import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {characterModels} from './glb-fixtures.ts';
import {posedMeshes,penetrationReport} from './seated-geometry.ts';
import {createCharacters} from '../src/scene/characters.ts';
import {createLifePresentation} from '../src/scene/life-presentation.ts';
import {createStarterState} from '../src/domain/state.ts';
import {benchReadingSpot,diningReadingSpot} from '../src/domain/housing.ts';
import {createGeometrySpec,geometryParts} from '../src/domain/parametric-crafting.ts';
import type {GeometrySpec} from '../src/domain/parametric-crafting.ts';
import {heightAt} from '../src/world/surface.ts';
import {BENCH_SEATING,STUMP_SEATING} from '../src/content/seating.ts';
import {DINING_SEAT} from '../src/content/scene-props.ts';

function furnitureInnerVolumes(geometry:GeometrySpec){
  const box=(id:string,x:number,y:number,z:number,cx:number,cy:number,cz:number)=>({id,box:new THREE.Box3(new THREE.Vector3(cx-x/2,cy-y/2,cz-z/2),new THREE.Vector3(cx+x/2,cy+y/2,cz+z/2)).expandByScalar(-.015)});
  const p=geometry.parameters,length=p.length as number,width=p.width as number,height=p.height as number,inset=p.supportInset as number;
  return [...geometryParts(geometry).map(part=>box(part.id,part.dimensions.x,part.dimensions.y,part.dimensions.z,part.center.x,part.center.y,part.center.z)),
    box('back-rail',length,.25,.14,0,height+.55,-width/2+.07),
    ...[-1,1].map(side=>box('back-post-'+side,.12,.7,.12,side*(length/2-inset),height+.25,-width/2+.07))];
}

test('actual skinned body and starter garments clear seat, backrest and every support across 64 bench configurations',async()=>{
  const {resources,models}=await characterModels(),actors=createCharacters(resources,models,[],new Map()),state=createStarterState([]),life=createLifePresentation(resources,actors.player);
  const body=actors.player.children[0],anchors=[{x:-34,z:14},{x:-31,z:19},{x:-55,z:18},{x:-44,z:20}];
  let checked=0,minFootClearance=Infinity;
  for(const length of [1.6,2.4])for(const width of [.55,.9])for(const height of [.65,.95])for(const supportCount of [2,3])for(const [index,rotation] of [0,Math.PI/2,Math.PI,Math.PI*1.5].entries()){
    const anchor=anchors[index],geometry=createGeometrySpec('bench.supported',{length,width,height,supportCount,seatThickness:.15,supportInset:.2});
    const wear=state.inventory.instances!.filter(item=>item.definitionId!=='furniture.guest-bench');
    state.inventory.instances=[...wear,{instanceId:'skin-bench',definitionId:'furniture.guest-bench',blueprintId:'blueprint.bench-guided',createdAt:0,geometry,location:{kind:'world',...anchor,rotation}}];
    const spot=benchReadingSpot(state,'skin-bench')!;state.player={...spot.stand,facing:spot.seat.facing,moving:false};
    life.restorePose();actors.setReading(true,spot.seat);actors.update(state,index%2===0,index*.71);life.setReading(true);life.update(state,0,index%2===0);actors.player.updateMatrixWorld(true);
    const modelMatrix=new THREE.Matrix4().makeRotationY(rotation).setPosition(anchor.x,heightAt(anchor.x,anchor.z)+BENCH_SEATING.baseOffset,anchor.z),frame=modelMatrix.clone().invert();
    const reports=penetrationReport(body,furnitureInnerVolumes(geometry),frame);
    assert.deepEqual(reports.filter(report=>report.vertices||report.triangles),[],JSON.stringify({length,width,height,supportCount,rotation,reports}));
    const posed=posedMeshes(body,frame),hips=posed.flatMap(mesh=>mesh.vertices).filter(vertex=>vertex.bone==='hips');
    const contactY=Math.min(...hips.map(vertex=>vertex.point.y));assert.ok(contactY>=height-.005&&contactY<=height+.045,'the skin, rather than only its pelvis bone, meets the seat');
    for(const mesh of posedMeshes(body))for(const vertex of mesh.vertices)if(/foot|toes/.test(vertex.bone)){
      const clearance=vertex.point.y-heightAt(vertex.point.x,vertex.point.z);minFootClearance=Math.min(minFootClearance,clearance);
      assert.ok(clearance>=.025,`skin foot intersects real terrain: ${JSON.stringify({anchor,rotation,height,clearance})}`);
    }
    const bodyFrame=new THREE.Matrix4().makeRotationY(spot.seat.facing).setPosition(spot.seat.x,spot.seat.surfaceY,spot.seat.z).invert();
    for(const mesh of posedMeshes(actors.player,bodyFrame))for(const vertex of mesh.vertices){
      assert.ok(Math.abs(vertex.point.x)<=BENCH_SEATING.halfWidth+.01,'the actual held-book body stays within the checked horizontal width');
      assert.ok(vertex.point.z>=BENCH_SEATING.backZ-.01&&vertex.point.z<=BENCH_SEATING.frontZ+.01,`the actual body and held book stay within the checked front/back envelope: ${JSON.stringify({point:vertex.point.toArray(),bone:vertex.bone,mesh:mesh.mesh.name,rotation})}`);
    }
    const beforeStanding=structuredClone(state);
    life.setReading(false);life.cancelMeal();life.restorePose();actors.setReading(false);
    actors.update(state,index%2===0,index*.71);life.update(state,0,index%2===0);
    assert.deepEqual(actors.player.position.toArray(),[spot.stand.x,heightAt(spot.stand.x,spot.stand.z),spot.stand.z],'closing the book restores the same safe front standing position even at the identical animation sample');
    const standingReports=penetrationReport(body,furnitureInnerVolumes(geometry),frame);
    assert.deepEqual(standingReports.filter(report=>report.vertices||report.triangles),[],`standing skin and garments clear the same real seat, backrest and supports: ${JSON.stringify({length,width,height,supportCount,rotation,standingReports})}`);
    assert.equal(life.group.getObjectByName('forest-storybook')!.visible,false);assert.equal(life.group.getObjectByName('meal-wooden-bowl')!.visible,false);
    assert.deepEqual(state,beforeStanding,'standing restores only presentation, preserving inventory, time and the collision-safe player anchor');
    checked++;
  }
  assert.equal(checked,64);assert.ok(minFootClearance>.025);
  life.dispose();actors.dispose();resources.dispose();
});

test('fire-stump sitting leaves no body triangles inside the physical stump and retains skin-level contact',async()=>{
  const {resources,models}=await characterModels(),actors=createCharacters(resources,models,[],new Map()),state=createStarterState([]),life=createLifePresentation(resources,actors.player),spot=diningReadingSpot();
  state.player={...spot.stand,facing:spot.seat.facing,moving:false};actors.setReading(true,spot.seat);actors.update(state,true,0);life.setReading(true);life.update(state,0,true);
  const body=actors.player.children[0],ground=heightAt(DINING_SEAT.x,DINING_SEAT.z),surface=ground+DINING_SEAT.height;
  let overlaps=0,minHipY=Infinity;
  const inside=(p:THREE.Vector3)=>{
    const y=p.y-ground;if(y<=.015||y>=DINING_SEAT.height-.015)return false;
    const radius=y<DINING_SEAT.height-.04?STUMP_SEATING.radius-(STUMP_SEATING.radius-.45)*y/(DINING_SEAT.height-.04):.43;
    return Math.hypot(p.x-DINING_SEAT.x,p.z-DINING_SEAT.z)<radius-.015;
  };
  for(const mesh of posedMeshes(body)){
    for(const vertex of mesh.vertices)if(vertex.bone==='hips')minHipY=Math.min(minHipY,vertex.point.y);
    for(let i=0;i<mesh.indices.length;i+=3){
      const a=mesh.vertices[mesh.indices[i]].point,b=mesh.vertices[mesh.indices[i+1]].point,c=mesh.vertices[mesh.indices[i+2]].point;
      const samples=[a,b,c,a.clone().lerp(b,.5),b.clone().lerp(c,.5),c.clone().lerp(a,.5),a.clone().add(b).add(c).multiplyScalar(1/3)];
      if(samples.some(inside))overlaps++;
    }
  }
  assert.equal(overlaps,0,'deformed body triangles do not enter the actual tapered stump or top cap');
  assert.ok(minHipY>=surface-.005&&minHipY<=surface+.045,`skin contact offset ${minHipY-surface}`);
  const beforeStanding=structuredClone(state);
  life.setReading(false);life.cancelMeal();life.restorePose();actors.setReading(false);actors.update(state,true,0);life.update(state,0,true);
  assert.deepEqual(actors.player.position.toArray(),[spot.stand.x,heightAt(spot.stand.x,spot.stand.z),spot.stand.z]);
  for(const mesh of posedMeshes(body))for(let i=0;i<mesh.indices.length;i+=3){
    const a=mesh.vertices[mesh.indices[i]].point,b=mesh.vertices[mesh.indices[i+1]].point,c=mesh.vertices[mesh.indices[i+2]].point;
    assert.equal([a,b,c,a.clone().lerp(b,.5),b.clone().lerp(c,.5),c.clone().lerp(a,.5),a.clone().add(b).add(c).multiplyScalar(1/3)].some(inside),false,'standing at the shared exit anchor keeps the real skinned body outside the stump');
  }
  assert.equal(life.group.getObjectByName('forest-storybook')!.visible,false);assert.deepEqual(state,beforeStanding);
  life.dispose();actors.dispose();resources.dispose();
});

test('held book, soup and bread stay ahead of the torso while both real hand sockets meet their visible bounds',async()=>{
  const {resources,models}=await characterModels(),actors=createCharacters(resources,models,[],new Map()),state=createStarterState([]),life=createLifePresentation(resources,actors.player),spot=diningReadingSpot(),body=actors.player.children[0];
  state.player={...spot.stand,facing:spot.seat.facing,moving:false};actors.setReading(true,spot.seat);
  for(const mode of ['book','soup','bread'] as const)for(const reduced of [false,true])for(const targetTime of mode==='book'?[.4]:[0,.4,1.2,2.2,3.2,3.5]){
    life.cancelMeal();life.restorePose();actors.update(state,reduced,1.3);life.setReading(mode==='book');if(mode!=='book')life.presentMeal(mode);
    let elapsed=0;
    do{const step=Math.min(.1,targetTime-elapsed);life.restorePose();actors.update(state,reduced,1.3+elapsed);life.update(state,Math.max(0,step),reduced);elapsed+=step;}while(elapsed<targetTime-1e-8);
    const prop=life.group.getObjectByName(mode==='book'?'forest-storybook':mode==='soup'?'meal-wooden-bowl':'meal-black-bread')!;actors.player.updateMatrixWorld(true);
    assert.equal(prop.visible,true,`${mode} is still held at ${targetTime}s, before the ordinary 3.6s meal ends`);
    const bounds=new THREE.Box3().setFromObject(prop);for(const side of ['l','r']){
      const socket=body.getObjectByName('handslot'+side)!.getWorldPosition(new THREE.Vector3());assert.ok(bounds.distanceToPoint(socket)<.09,'visible prop edge meets both actual hand sockets');
    }
    prop.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;object.geometry.computeBoundingBox();
      const box=object.geometry.boundingBox!.clone().expandByScalar(-.008),frame=object.matrixWorld.clone().invert();
      const report=penetrationReport(body,[{id:mode,box}],frame)[0];
      const forbidden=Object.entries(report.bones).filter(([bone])=>/^(hips|spine|chest|head|upperarm|upperleg|lowerleg|foot|toes)/.test(bone)||/pack|scarf/.test(bone));
      assert.deepEqual(forbidden,[],`${mode} at ${targetTime}s must not intersect torso, upper arms, scarf or back gear`);
    });
  }
  life.dispose();actors.dispose();resources.dispose();
});
