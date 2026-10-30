import * as THREE from 'three';
import {FORESTRY} from '../content/forestry.ts';
import {PALETTE} from '../content/world.ts';
import type {GameState} from '../domain/state.ts';
import {treeScaleFactor} from '../domain/forestry.ts';
import type {Tree} from '../world/layout.ts';
import {heightAt} from '../world/surface.ts';
import type {Resources} from './resources.ts';

type ForestryPresentationOptions={
  resources:Resources; forestGroup:THREE.Group; trees:Tree[];
  selections:Map<string,THREE.Object3D>;
};
// The domain has already settled the tree; this short rest only makes its landing legible.
const FALLEN_HOLD_SECONDS=1.8;
/** Presentation only: consumes committed world state; no timers, rewards or gameplay writes. */
export function createForestryPresentation({resources:r,forestGroup,trees,selections}:ForestryPresentationOptions){
  let disposed=false;
  const treeById=new Map(trees.map(t=>[t.id,t])),stumps=new Map<string,THREE.Group>();
  const baseRotations=new Map<string,THREE.Quaternion>();
  selections.forEach((o,id)=>baseRotations.set(id,o.quaternion.clone()));
  const bark=r.material(PALETTE.wood,.72),cutWood=r.material('#d9b07a',.78),ringWood=r.material('#966a3d',.8);
  const stumpGeometry=r.geometry('forestry-stump-r4',()=>new THREE.CylinderGeometry(1,.95,.5,10));
  const ringGeometry=r.geometry('forestry-growth-ring-r4',()=>new THREE.RingGeometry(.67,.72,16));
  const chips=new THREE.InstancedMesh(r.geometry('forestry-woodchip-r4',()=>new THREE.BoxGeometry(.13,.07,.1)),cutWood,18);
  chips.name='forestry-hit-chips';chips.visible=false;chips.frustumCulled=false;forestGroup.add(chips);
  const dummy=new THREE.Object3D(),rotation=new THREE.Quaternion(),axis=new THREE.Vector3();
  const chipOrigin=new THREE.Vector3();let chipTree:string|null=null;
  const getStump=(tree:Tree)=>{
    let root=stumps.get(tree.id);if(root)return root;
    root=new THREE.Group();root.name=tree.id;root.userData.forestryRole='stump';
    const trunk=new THREE.Mesh(stumpGeometry,[bark,cutWood,cutWood]);trunk.position.y=.25;trunk.castShadow=true;trunk.receiveShadow=true;root.add(trunk);
    const ring=new THREE.Mesh(ringGeometry,ringWood);ring.rotation.x=-Math.PI/2;ring.position.y=.505;root.add(ring);
    root.position.set(tree.x,heightAt(tree.x,tree.z),tree.z);const radius=(tree.kind==='pine'?.43:.66)*tree.scale;root.scale.set(radius,tree.scale,radius);
    forestGroup.add(root);stumps.set(tree.id,root);return root;
  };
  const pickTargets:THREE.Object3D[]=[];
  function update(state:GameState,reducedMotion=false){
    if(disposed)return;
    pickTargets.length=0;
    let impactTree:Tree|undefined,impactAge=Infinity;
    for(const [id,object] of selections){
      const tree=treeById.get(id)!,life=state.forestry.slots[id];
      const status=life?.status??'standing',factor=treeScaleFactor(life,state.time);
      const ground=heightAt(tree.x,tree.z);
      const landingAge=life?.felledAt!=null?state.time-(life.felledAt+FORESTRY.fallSeconds):Infinity;
      const resting=status==='stump'&&landingAge>=0&&landingAge<FALLEN_HOLD_SECONDS;
      if(resting&&landingAge<.58&&landingAge<impactAge){impactTree=tree;impactAge=landingAge;}
      object.visible=status!=='stump'||resting;object.userData.forestrySelectable=status!=='falling'&&status!=='stump';
      object.position.set(tree.x,ground,tree.z);object.quaternion.copy(baseRotations.get(id)!);object.scale.setScalar(tree.scale*factor);
      if((status==='falling'||resting)&&life?.felledAt!==null&&life?.felledAt!==undefined){
        const p=THREE.MathUtils.clamp((state.time-life.felledAt)/FORESTRY.fallSeconds,0,1),dir=life.fallDirection;
        const length=(tree.kind==='pine'?6.6:6.4)*tree.scale;
        const targetRise=heightAt(tree.x+dir.x*length,tree.z+dir.z*length)-ground+1.1*tree.scale;
        const finalAngle=THREE.MathUtils.clamp(Math.atan2(length,targetRise),1.05,Math.PI/2+.08);
        const angle=finalAngle*Math.pow(p,reducedMotion?1:1.6),pivot=.42*tree.scale;
        axis.set(dir.z,0,-dir.x).normalize();rotation.setFromAxisAngle(axis,angle);object.quaternion.premultiply(rotation);
        object.position.set(tree.x-dir.x*pivot*Math.sin(angle),ground+pivot*(1-Math.cos(angle)),tree.z-dir.z*pivot*Math.sin(angle));
      }else if(status==='chopping'&&!reducedMotion){
        const phase=((state.time-(state.forestry.active?.startedAt??state.time))/ (FORESTRY.chopSeconds/FORESTRY.hits))%1;
        const wobble=phase>.58?Math.sin((phase-.58)*26)*.022*Math.max(0,1-(phase-.58)/.42):0;
        axis.set(life?.fallDirection.z??1,0,-(life?.fallDirection.x??0)).normalize();rotation.setFromAxisAngle(axis,wobble);object.quaternion.premultiply(rotation);
      }
      object.updateWorldMatrix(true,false);
      if(object.userData.forestrySelectable&&object.visible)pickTargets.push(object);
      if(status==='falling'||status==='stump'){
        const stump=getStump(tree);stump.visible=true;stump.updateWorldMatrix(true,true);if(status==='stump')pickTargets.push(stump);
      }else if(stumps.has(id))stumps.get(id)!.visible=false;
    }
    const action=state.forestry.active;
    chips.visible=false;chips.position.set(0,0,0);chipTree=null;
    if(action&&!reducedMotion){
      const tree=treeById.get(action.treeId)!,life=state.forestry.slots[action.treeId],cycle=FORESTRY.chopSeconds/FORESTRY.hits;
      const elapsed=state.time-action.startedAt,stroke=Math.min(FORESTRY.hits-1,Math.floor(elapsed/cycle-.58));
      const age=elapsed-(stroke+.58)*cycle;
      if(stroke>=0&&age>=0&&age<.48){
        const dir=life.fallDirection,radius=(tree.kind==='pine'?.43:.66)*tree.scale;
        const bx=tree.x-dir.x*radius,bz=tree.z-dir.z*radius,by=heightAt(tree.x,tree.z)+1.2;
        chipOrigin.set(bx,by,bz);chipTree=tree.id;
        for(let i=0;i<18;i++){
          const vx=-dir.x*1.8+Math.sin(i*2.4)*2.1,vz=-dir.z*1.8+Math.cos(i*1.8)*2;
          dummy.position.set(bx+vx*age,by+(1.8+(i%5)*.25)*age-5.5*age*age,bz+vz*age);
          dummy.rotation.set(i+age*8,i*.3+age*5,age*9);dummy.scale.setScalar((.75+(i%3)*.25)*(1-age/.48));dummy.updateMatrix();chips.setMatrixAt(i,dummy.matrix);
        }
        chips.instanceMatrix.needsUpdate=true;chips.visible=true;
      }
    }
    if(!chips.visible&&impactTree&&!reducedMotion){
      // Reuse the hit pool for a low, short-lived landing scatter; no new particles or clock.
      const tree=impactTree,dir=state.forestry.slots[tree.id].fallDirection;
      const length=(tree.kind==='pine'?6.6:6.4)*tree.scale;
      const bx=tree.x+dir.x*length*.7,bz=tree.z+dir.z*length*.7;
      for(let i=0;i<18;i++){
        const angle=i*2.4,spread=.25+(i%5)*.16+impactAge*(1.8+(i%3)*.6);
        const x=bx+Math.sin(angle)*spread,z=bz+Math.cos(angle)*spread;
        dummy.position.set(x,heightAt(x,z)+.12+Math.max(0,(1.2+(i%3)*.18)*impactAge-3.4*impactAge*impactAge),z);
        dummy.rotation.set(i+impactAge*4,i*.3+impactAge*3,impactAge*5);
        const size=(.7+(i%4)*.15)*(1-impactAge/.58);dummy.scale.set(size,size*.45,size);dummy.updateMatrix();chips.setMatrixAt(i,dummy.matrix);
      }
      chips.instanceMatrix.needsUpdate=true;chips.visible=true;
    }
  }
  return{
    update,
    alignContact(impact:{treeId:string;point:THREE.Vector3}|null){if(impact&&chips.visible&&chipTree===impact.treeId)chips.position.copy(impact.point).sub(chipOrigin);},
    getPickTargets:()=>pickTargets,
    dispose(){
      if(disposed)return;disposed=true;chips.removeFromParent();chips.dispose();
      stumps.forEach(o=>o.removeFromParent());stumps.clear();pickTargets.length=0;baseRotations.clear();treeById.clear();
      // Geometry and materials belong to the scene's Resources owner, not this adapter.
    },
  };
}
