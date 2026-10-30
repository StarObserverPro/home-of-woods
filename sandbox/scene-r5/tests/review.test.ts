import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildClosedTerrain} from '../src/world/closed-terrain.ts';
import {heightAt,riverX} from '../src/world/surface.ts';
import {gorgeSection} from '../src/world/gorge-profile.ts';
import {Resources} from '../src/scene/resources.ts';
import {createCampProps} from '../src/scene/camp-props.ts';
import {createReviewState,REVIEW_PROPS} from '../src/content/scene-review.ts';
import {createInventory,inventoryTransaction} from '../src/domain/inventory.ts';
import {logPresentation,daylightAt} from '../src/domain/scene-review.ts';
import {makeColliders,makeTrees} from '../src/world/layout.ts';
import {buildMountainGeometry} from '../src/scene/environment.ts';
import {MOUNTAINS} from '../src/content/environment.ts';
import {planStoneFoundation} from '../src/world/prop-foundation.ts';
import {buildFoundationGeometry} from '../src/scene/stone-foundation.ts';
import {buildFlameGeometry,createFlames} from '../src/scene/fire.ts';
import {createAltarCrown} from '../src/scene/altar.ts';
import {ALTAR_LAYOUT} from '../src/content/altar.ts';

test('adaptive terrain is a closed consistently wound manifold, with fewer triangles and exact near-field ground',()=>{
  const g=buildClosedTerrain(),p=g.getAttribute('position'),ix=g.index!;
  assert.ok(g.userData.totalTriangles<23000,`${g.userData.totalTriangles} vs original 45000`);
  assert.ok(g.userData.facetedPatches>30&&g.userData.facetedPatches<450,'sparse real rock chips, not dense subdivision');
  const edges=new Map<string,{count:number;orientation:number}>();
  const welded=new Map<string,number>();
  const weld=(id:number)=>{const key=[p.getX(id),p.getY(id),p.getZ(id)].join(':');if(!welded.has(key))welded.set(key,welded.size);return welded.get(key)!;};
  for(let i=0;i<ix.count;i+=3){const ids=[ix.getX(i),ix.getX(i+1),ix.getX(i+2)];const a=new THREE.Vector3().fromBufferAttribute(p,ids[0]),b=new THREE.Vector3().fromBufferAttribute(p,ids[1]),c=new THREE.Vector3().fromBufferAttribute(p,ids[2]);assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).length()>1e-7,'nondegenerate');
    for(let n=0;n<3;n++){const a=weld(ids[n]),b=weld(ids[(n+1)%3]),key=a<b?`${a}:${b}`:`${b}:${a}`,entry=edges.get(key)??{count:0,orientation:0};entry.count++;entry.orientation+=a<b?1:-1;edges.set(key,entry);}}
  assert.ok([...edges.values()].every(v=>v.count===2),'each edge has exactly two faces');
  assert.ok([...edges.values()].every(v=>v.orientation===0),'every adjacent face winds consistently');
  for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i))<89&&Math.abs(p.getZ(i))<89&&p.getY(i)>-40)assert.ok(Math.abs(p.getY(i)-heightAt(p.getX(i),p.getZ(i)))<.0001);
  g.dispose();
});
test('the crest has a physical angular shoulder and rock/grass use separate normal domains',()=>{
  const rim=gorgeSection(riverX(0)+30,0).rim;
  const inner=(heightAt(rim,0)-heightAt(rim-.4,0))/.4,outer=(heightAt(rim+.4,0)-heightAt(rim,0))/.4;
  assert.ok(inner-outer>.5&&Math.abs(outer)<.4,'linear rock face ends abruptly at plateau');
  const g=buildClosedTerrain(),groups=g.groups;
  assert.equal(groups.length,2);assert.ok(groups[1].count>300);
  const used=groups.map(group=>new Set(Array.from({length:group.count},(_,i)=>g.index!.getX(group.start+i))));
  assert.ok([...used[0]].every(id=>!used[1].has(id)),'grass normals never average cliff normals');g.dispose();
});
test('altar foundation has a horizontal top above the complete footprint and embeds every perimeter edge into the shared slope',()=>{
  const spec=REVIEW_PROPS.altar,plan=planStoneFoundation(spec.x,spec.z),g=buildFoundationGeometry(plan),p=g.getAttribute('position');
  assert.ok(plan.samples.every(sample=>sample.height<plan.levelY));
  for(let z=-3;z<=3;z+=.2)for(let x=-3;x<=3;x+=.2)if(Math.hypot(x,z)<3.1)assert.ok(heightAt(spec.x+x,spec.z+z)<plan.levelY);
  for(let i=0;i<32;i+=2){assert.equal(p.getY(i),0);assert.ok(p.getY(i+1)+plan.levelY<=heightAt(spec.x+p.getX(i+1),spec.z+p.getZ(i+1))-.24);}
  assert.ok(spec.radius>plan.radius+.15,'collider covers the facing stones');g.dispose();
});
test('volumetric flames have bounded real geometry, freeze their shared phase and switch off as a complete light effect',()=>{
  const g=buildFlameGeometry();assert.ok(g.index!.count/3>150&&g.index!.count/3<300);
  for(const v of g.getAttribute('position').array)assert.ok(Number.isFinite(v));g.dispose();
  const r=new Resources(),flame=createFlames(r);flame.update(4,1,false,true);const phase=flame.stats().visualTime;
  flame.update(8,1,true,true);assert.equal(flame.stats().visualTime,phase);assert.ok(flame.stats().triangles<3500);
  const shell=flame.group.getObjectByName('eight-curved-outer-tongues') as THREE.InstancedMesh;
  assert.equal(shell.count,8);assert.equal((shell.material as THREE.Material).transparent,true);assert.equal((shell.material as THREE.Material).depthWrite,false);
  flame.update(8,1,false,false);assert.equal(flame.group.visible,false);r.dispose();
});
test('offering slots, floating oracle and ritual states are real bounded scene objects without inventory writes',()=>{
  const r=new Resources(),crown=createAltarCrown(r),state=createReviewState(),inventory=createInventory(),before=JSON.stringify(inventory);
  assert.equal(crown.slots.length,3);assert.equal(new Set(crown.slots.map(s=>s.name)).size,3);
  assert.ok(crown.slots.every(s=>s.position.z>.5&&s.position.y<1.5));
  assert.ok(crown.oracleAnchor.position.y>3&&crown.oracleAnchor.position.x>1.5);
  assert.equal(crown.oracleHit.userData.reviewId,ALTAR_LAYOUT.oracle.id);
  for(const altar of ['dormant','ready','answering','resting'] as const)for(const offering of ['empty','forest','mixed'] as const){
    state.altar=altar;state.offering=offering;const reviewBefore=JSON.stringify(state);crown.update(3,state,false);
    assert.equal(crown.oracleAnchor.visible,altar!=='dormant');
    assert.equal(crown.slots[2].children.find(o=>o.name.endsWith(':contents'))!.visible,offering==='mixed');
    assert.equal(JSON.stringify(state),reviewBefore);assert.equal(JSON.stringify(inventory),before);
  }
  crown.update(4,state,false);const revision=crown.stats().textRevision,phase=crown.stats().visualTime;crown.update(12,state,true);
  assert.equal(crown.stats().textRevision,revision,'text texture is not redrawn every frame');assert.equal(crown.stats().visualTime,phase);
  assert.ok(crown.stats().meshes<45&&crown.stats().triangles<6000);
  const texture=(crown.oracleHit.material as THREE.MeshBasicMaterial).map!;let releases=0;texture.addEventListener('dispose',()=>releases++);r.dispose();r.dispose();assert.equal(releases,1);
});
test('log pile derives exact counts across quality stacks without mutating inventory, and releases all owned GPU allocations once',()=>{
  for(let cycle=0;cycle<3;cycle++){
    const r=new Resources(),camp=createCampProps(r),state=createReviewState();let inventory=createInventory();
    const owned=new Set<THREE.BufferGeometry|THREE.Material>();camp.group.traverse(o=>{if(o instanceof THREE.Mesh){owned.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])owned.add(m);}});
    const releases=new Map([...owned].map(x=>[x,0]));owned.forEach(x=>x.addEventListener('dispose',()=>releases.set(x,releases.get(x)!+1)));
    for(const quantity of [0,6,18,32]){
      inventory=inventoryTransaction(createInventory(),[{itemId:'wood',qualityId:'ordinary',delta:quantity}]);const before=JSON.stringify(inventory);camp.update(3,state,inventory,1,false);assert.equal(camp.stats().logs,Math.min(18,quantity));assert.equal(camp.stats().logCaps,Math.min(18,quantity)*2);assert.equal(JSON.stringify(inventory),before);
    }
    inventory=inventoryTransaction(inventory,[{itemId:'wood',qualityId:'fine',delta:3}]);assert.equal(logPresentation(inventory).quantity,35);
    for(const altar of ['dormant','ready','answering','resting'] as const){state.altar=altar;camp.update(4,state,inventory,.5,false);}
    camp.dispose();camp.dispose();r.dispose();r.dispose();assert.ok([...releases.values()].every(n=>n===1));assert.equal(r.stats().extras,0);assert.equal(camp.hits.length,0);
  }
});
test('daylight has distinct day, twilight and night and all three stable prop identities block navigation',()=>{
  assert.equal(daylightAt(14).day,1);assert.equal(daylightAt(23).day,0);assert.ok(daylightAt(18).warm>.5);
  const colliders=makeColliders(makeTrees());for(const p of Object.values(REVIEW_PROPS))assert.ok(colliders.some(c=>c.id===p.id));
});
test('every distant mountain has a sealed shell when welded by its actual vertex coordinates',()=>{
  for(const spec of MOUNTAINS){const g=buildMountainGeometry(spec),p=g.getAttribute('position'),edges=new Map<string,number>();
    const key=(i:number)=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*10000)).join(':');
    for(let i=0;i<p.count;i+=3)for(let n=0;n<3;n++){const a=key(i+n),b=key(i+(n+1)%3),k=a<b?`${a}/${b}`:`${b}/${a}`;edges.set(k,(edges.get(k)??0)+1);}
    assert.ok([...edges.values()].every(n=>n===2),spec.id);g.dispose();
  }
});
