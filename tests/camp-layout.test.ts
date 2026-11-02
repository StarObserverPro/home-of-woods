import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMP_PROPS} from '../src/content/scene-props.ts';
import {START,TENT,CABIN} from '../src/content/world.ts';
import {WORKBENCH} from '../src/content/workshop.ts';
import {WOODCRAFT} from '../src/content/woodcraft.ts';
import {makeColliders,makeTrees} from '../src/world/layout.ts';
import {heightAt} from '../src/world/surface.ts';
import {canStand,findPath} from '../src/domain/navigation.ts';
import {workstationColliders} from '../src/domain/furniture-placement.ts';
import {Resources} from '../src/scene/resources.ts';
import {createSelectionMarker} from '../src/scene/selection-marker.ts';

test('the hearth leaves an open strip around canvas, stored wood and workbench on the original ground',()=>{
  const fire=CAMP_PROPS.fire;
  const boxGap=(x:number,z:number,halfX:number,halfZ:number)=>Math.hypot(
    Math.max(0,Math.abs(fire.x-x)-halfX),Math.max(0,Math.abs(fire.z-z)-halfZ),
  )-fire.radius;
  assert.ok(boxGap(TENT.x,TENT.z,4.4,4.4)>3.5,'canvas has a clear gap');
  assert.ok(boxGap(WORKBENCH.x,WORKBENCH.z,WORKBENCH.halfX,WORKBENCH.halfZ)>3.5,'working wood stays clear');
  assert.ok(boxGap(WOODCRAFT.x,WOODCRAFT.z,WOODCRAFT.halfX+WOODCRAFT.railWidth,WOODCRAFT.halfZ+WOODCRAFT.railWidth)>3.5,'loose wood and wooden rail stay clear');
  const rack=CAMP_PROPS.logs;
  assert.ok(Math.hypot(fire.x-rack.x,fire.z-rack.z)-fire.radius-rack.radius>3.5,'stored logs stay clear');
  const heights=Array.from({length:24},(_,i)=>heightAt(fire.x+Math.cos(i*Math.PI/12)*fire.radius,fire.z+Math.sin(i*Math.PI/12)*fire.radius));
  assert.ok(Math.max(...heights)-Math.min(...heights)<.2,'hearth does not need another terrain surface or tall foundation');
});

test('the shifted hearth preserves routes from the camp entrance to both work areas and its own edge',()=>{
  const blockers=[...makeColliders(makeTrees()),...workstationColliders()];
  const fire=CAMP_PROPS.fire;
  for(const target of [WORKBENCH.stand,WOODCRAFT.stand,{x:fire.x-2.8,z:fire.z}]){
    assert.equal(canStand(target,blockers),true);
    assert.ok(findPath(START,target,blockers).length>0);
  }
});

test('selection cues follow the canonical slope and reuse their owned geometry across changing selections',()=>{
  const resources=new Resources(),marker=createSelectionMarker(resources),before=resources.stats();
  for(const [id,point] of [['cabin',CABIN],['tent',TENT],['loose-wood',{x:-30,z:7}]] as const){
    marker.update(id,point);
    const positions=marker.object.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++){
      const x=marker.object.position.x+positions.getX(i),z=marker.object.position.z+positions.getZ(i);
      assert.ok(Math.abs(positions.getY(i)-heightAt(x,z)-.045)<.0001);
    }
    assert.deepEqual(resources.stats(),before,'selection does not allocate a new resource each frame');
  }
  marker.update(null,null);assert.equal(marker.object.visible,false);
  let releases=0;marker.object.geometry.addEventListener('dispose',()=>releases++);
  resources.dispose();resources.dispose();assert.equal(releases,1);
});
