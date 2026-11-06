import * as THREE from 'three';
import {BROOM,CAMP_LEAF_PATCHES,leafPilePoint} from '../content/broom.ts';
import {broomHasMark,broomHasWillful} from '../domain/broom.ts';
import {leafPatchSnapshot} from '../domain/leaf-patches.ts';
import type {BroomUseEvent} from '../domain/broom.ts';
import type {GameState} from '../domain/state.ts';
import type {OwnedItem} from '../domain/owned-items.ts';
import type {PlacementDraft} from '../domain/furniture-placement.ts';
import type {RarityVfxMode} from '../content/item-vfx.ts';
import type {WhimsyMode} from '../content/whimsy-display.ts';
import {heightAt} from '../world/surface.ts';
import type {Resources} from './resources.ts';
import {createBroomStudy} from './broom-study.ts';
import {poseHandAt} from './seated-pose.ts';
import {InteractionRegistry} from './interaction-registry.ts';
import {createItemSurface} from './item-surface.ts';

const MODEL_SCALE=.80;
type Model=ReturnType<typeof createBroomStudy>;
/** Inventory/location remain authoritative. A successful command merely borrows one model for the hands. */
export function createBroomPresentation(r:Resources,player:THREE.Group){
  const group=new THREE.Group();group.name='camp-brooms-and-leaves';
  const hits=new InteractionRegistry(),surfaces=createItemSurface(r),markMaterial=r.own(new THREE.LineBasicMaterial({color:'#ead2a4'}));
  const make=()=>{const model=createBroomStudy(r,markMaterial);model.leaves.visible=false;model.group.scale.setScalar(MODEL_SCALE);return model;};
  const held=make();held.group.name='held-branch-broom';held.group.visible=false;group.add(held.group);
  const ghost=make();ghost.group.name='branch-broom-placement';ghost.group.visible=false;group.add(ghost.group);
  const ghostMaterial=r.own(new THREE.MeshStandardMaterial({color:'#d7edaf',transparent:true,opacity:.45,depthWrite:false,roughness:.9}));
  ghost.tool.traverse(object=>{if(object instanceof THREE.Mesh){object.material=ghostMaterial;object.castShadow=false;}});
  const placed=new Map<string,{model:Model;unregister:()=>void}>();
  const leafGroups=new Map(CAMP_LEAF_PATCHES.map(patch=>{
    const leaves=r.own(new THREE.InstancedMesh(held.leaves.geometry,held.leaves.material,patch.leafCount));leaves.name=patch.id;leaves.receiveShadow=true;
    for(let index=0;index<patch.leafCount;index++)leaves.setColorAt(index,new THREE.Color(['#ad884b','#c8a360','#8a7544'][index%3]));
    group.add(leaves);const unregister=hits.register(leaves,patch.id);return [patch.id,{leaves,unregister}];
  }));
  const body=player.children.find(child=>!!child.getObjectByName('hips'));
  const bones=new Map<string,THREE.Bone>();body?.traverse(node=>{if(node instanceof THREE.Bone)bones.set(node.name.replaceAll('.',''),node);});
  const overlay=new Map<THREE.Bone,THREE.Quaternion>(),transform=new THREE.Object3D();
  let event:BroomUseEvent|null=null,elapsed=0,preview:PlacementDraft|null=null,whimsy:WhimsyMode='full',disposed=false;
  const seen=new Set<string>();
  const drawn=new Map<THREE.Mesh,number>();let probeCamera:THREE.Camera|null=null;
  held.tool.traverse(object=>{if(object instanceof THREE.Mesh){drawn.set(object,0);object.onBeforeRender=(_renderer,_scene,camera)=>{if(event){drawn.set(object,(drawn.get(object)??0)+1);probeCamera=camera;}};}});
  held.mark.onBeforeRender=(_renderer,_scene,camera)=>{if(event)probeCamera=camera;};
  function sampleHeld(){
    if(!event)return null;
    const parents=[];for(let object:THREE.Object3D|null=held.joint;object;object=object.parent)parents.push({name:object.name||object.type,visible:object.visible});
    return {useId:event.useId,kind:event.kind,elapsed,parents,patch:{...event.patch.center,height:heightAt(event.patch.center.x,event.patch.center.z)},stand:{...event.stand,height:heightAt(event.stand.x,event.stand.z)},camera:probeCamera?.getWorldPosition(new THREE.Vector3()).toArray()??null,
      meshes:[...drawn].map(([mesh,draws])=>{
        if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld),center=box.getCenter(new THREE.Vector3());
        const screenBox=probeCamera?new THREE.Box3().setFromPoints([box.min.x,box.max.x].flatMap(x=>[box.min.y,box.max.y].flatMap(y=>[box.min.z,box.max.z].map(z=>new THREE.Vector3(x,y,z).project(probeCamera!))))):null;
        const material=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(value=>({type:value.type,visible:value.visible,opacity:value.opacity,transparent:value.transparent,depthTest:value.depthTest,depthWrite:value.depthWrite,color:'color' in value?(value as THREE.MeshStandardMaterial).color.getHexString():null}));
        return {name:mesh.name,draws,visible:mesh.visible,frustumCulled:mesh.frustumCulled,worldBounds:{min:box.min.toArray(),max:box.max.toArray()},screenBounds:screenBox?{min:screenBox.min.toArray(),max:screenBox.max.toArray()}:null,groundAtCenter:heightAt(center.x,center.z),material};
      })};
  }
  let lastHeldSample:ReturnType<typeof sampleHeld>=null;
  const marked=(item:OwnedItem)=>broomHasMark(item);
  function restorePose(){for(const [bone,quaternion] of overlay)bone.quaternion.copy(quaternion);overlay.clear();}
  function cancel(){restorePose();event=null;elapsed=0;surfaces.release(held.tool);held.group.visible=false;}
  function modelPose(model:Model,item:OwnedItem){
    model.update({phase:'idle',progress:0,swept:false,signed:marked(item),affixMotion:'off',reducedMotion:true,allowDodge:false});model.leaves.visible=false;
  }
  function grip(side:'l'|'r',anchor:THREE.Object3D){
    for(const name of ['upperarm','lowerarm','hand']){const bone=bones.get(name+side);if(bone&&!overlay.has(bone))overlay.set(bone,bone.quaternion.clone());}
    const actual=anchor.getWorldPosition(new THREE.Vector3()),contact=player.worldToLocal(actual.clone());
    const hand=contact.clone();hand.x+=(side==='l'?1:-1)*.065;hand.z-=.085;hand.y-=.012;
    poseHandAt(player,bones,side,hand,contact);
  }
  function leafPosition(patch:typeof CAMP_LEAF_PATCHES[number],index:number,side:'scattered'|'left'|'right'){
    const c=Math.cos(patch.stand.facing),s=Math.sin(patch.stand.facing);
    if(side==='scattered'){
      const x=(((index*7)%13)/12*2-1)*patch.scatterHalfWidth,z=(((index*5)%11)/10*2-1)*patch.scatterHalfDepth;
      return {x:patch.center.x+c*x+s*z,z:patch.center.z-s*x+c*z};
    }
    const pile=leafPilePoint(patch,side==='left'?0:1),x=Math.sin(index*2.1)*.055,z=Math.cos(index*2.1)*.045;
    return {x:pile.x+c*x+s*z,z:pile.z-s*x+c*z};
  }
  return {group,hits,restorePose,
    present(value:BroomUseEvent){if(disposed||seen.has(value.useId))return false;cancel();seen.add(value.useId);event=structuredClone(value);elapsed=0;lastHeldSample=null;probeCamera=null;for(const mesh of drawn.keys())drawn.set(mesh,0);return true;},
    cancel,
    resetPresentationHistory(){cancel();seen.clear();lastHeldSample=null;},
    setPreview(value:PlacementDraft|null){preview=value;},
    setRarityVfxMode(mode:RarityVfxMode){surfaces.setMode(mode);},setWhimsyMode(mode:WhimsyMode){whimsy=mode;},
    isPlaying:()=>event!==null,
    focus:()=>event?{x:event.patch.center.x,z:event.patch.center.z}:null,
    action:()=>event?{id:event.useId,elapsed,duration:event.durationSeconds,focus:event.patch.center,yawOffset:CAMP_LEAF_PATCHES.find(patch=>patch.id===event!.patchId)?.cameraYawOffset??BROOM.cameraYawOffset}:null,
    update(state:GameState,dt:number,reducedMotion=false,night=0){
      if(disposed)return;restorePose();surfaces.update(dt,reducedMotion,night);
      if(event&&(state.player.moving||state.route.length||state.workshop.job||state.forestry.active||['approaching','performing'].includes(state.gathering.action?.phase??'')||['approaching','performing'].includes(state.ritual?.phase??'')))cancel();
      if(event){elapsed+=Math.max(0,Math.min(.1,dt));if(elapsed>=event.durationSeconds)cancel();}
      const current=new Set<string>();
      for(const item of state.inventory.instances??[]){
        if(item.definitionId!==BROOM.definitionId||item.location.kind!=='world')continue;current.add(item.instanceId);
        let display=placed.get(item.instanceId);if(!display){const model=make();model.group.name=item.instanceId;group.add(model.group);display={model,unregister:hits.register(model.tool,item.instanceId)};placed.set(item.instanceId,display);}
        modelPose(display.model,item);display.model.group.position.set(item.location.x,heightAt(item.location.x,item.location.z),item.location.z);display.model.group.rotation.y=item.location.rotation;surfaces.apply(display.model.tool,item);
      }
      for(const [id,display] of placed)if(!current.has(id)){display.unregister();surfaces.release(display.model.tool);display.model.dispose();placed.delete(id);}
      const previewItem=state.inventory.instances?.find(item=>item.instanceId===preview?.instanceId);
      ghost.group.visible=!!preview?.point&&previewItem?.definitionId===BROOM.definitionId;
      if(ghost.group.visible&&preview?.point&&previewItem){modelPose(ghost,previewItem);ghost.group.position.set(preview.point.x,heightAt(preview.point.x,preview.point.z),preview.point.z);ghost.group.rotation.y=preview.rotation;ghostMaterial.color.set(preview.reason?'#da8068':'#d7edaf');}
      let gather=1;
      held.group.visible=event!==null;
      if(event){
        const item=state.inventory.instances?.find(item=>item.instanceId===event!.instanceId&&item.definitionId===BROOM.definitionId&&item.location.kind==='inventory');
        if(!item){cancel();return;}
        const animatedWill=event.kind==='willful'&&broomHasWillful(item)&&whimsy!=='off'&&!reducedMotion,sweepSeconds=animatedWill?event.durationSeconds-1.2:event.durationSeconds;
        const sweepProgress=Math.min(1,elapsed/sweepSeconds),playful=animatedWill&&elapsed>sweepSeconds,playfulProgress=playful?(elapsed-sweepSeconds)/1.2:0;
        gather=reducedMotion?1:THREE.MathUtils.smoothstep(sweepProgress,.08,.96);
        const facing=event.stand.facing;
        player.position.set(event.stand.x,heightAt(event.stand.x,event.stand.z),event.stand.z);player.rotation.y=facing;
        // The reed head meets the actual leaves. Lean only the handle toward the
        // hands, rather than shifting the whole tool away from its work surface.
        const baseX=event.patch.center.x,baseZ=event.patch.center.z;
        held.group.position.set(baseX,heightAt(baseX,baseZ),baseZ);held.group.rotation.y=facing;
        const stroke=reducedMotion?0:Math.sin(sweepProgress*Math.PI*6);
        held.tool.position.set(.11*stroke,0,0);held.tool.rotation.set(0,0,0);held.joint.rotation.set(-.17,0,.14*stroke);held.mark.visible=marked(item);
        held.group.updateWorldMatrix(true,true);grip('l',held.upperGrip);grip('r',held.lowerGrip);
        if(playful){
          const wave=Math.sin(Math.PI*playfulProgress);held.tool.rotation.y=(whimsy==='simple'?.35:1.05)*wave;
          if(whimsy==='full')held.tool.position.x+=.40*wave;
        }
        surfaces.apply(held.tool,item);
      }
      for(const patch of CAMP_LEAF_PATCHES){
        const display=leafGroups.get(patch.id)!,snapshot=leafPatchSnapshot(state,patch.id),active=event?.patchId===patch.id;
        const from=active?event!.from:snapshot?.currentSide??'scattered',to=active?event!.to:from;
        for(let index=0;index<patch.leafCount;index++){
          const a=leafPosition(patch,index,from),b=leafPosition(patch,index,to),progress=active?gather:1,x=THREE.MathUtils.lerp(a.x,b.x,progress),z=THREE.MathUtils.lerp(a.z,b.z,progress);
          transform.position.set(x,heightAt(x,z)+.018+(index%3)*.006*(from==='scattered'?progress:1),z);transform.rotation.set(0,index*1.91,0);transform.scale.setScalar(.78+(index%4)*.09);transform.updateMatrix();display.leaves.setMatrixAt(index,transform.matrix);
        }
        display.leaves.instanceMatrix.needsUpdate=true;display.leaves.computeBoundingSphere();
      }
    },
    point(id:string){const display=placed.get(id);if(display)return {x:display.model.group.position.x,z:display.model.group.position.z};return CAMP_LEAF_PATCHES.find(patch=>patch.id===id)?.center??null;},
    // Three cached bounds only, while an explicit action is at its middle. Keep
    // the last sample after completion so actual draw/culling evidence is readable.
    stats:()=>{if(event&&elapsed>=.8&&elapsed<=1.8)lastHeldSample=sampleHeld();return {placed:placed.size,patches:leafGroups.size,playing:!!event,elapsed,whimsy,held:held.group.visible,lastHeldSample};},
    held,
    dispose(){if(disposed)return;disposed=true;cancel();for(const display of placed.values()){display.unregister();surfaces.release(display.model.tool);display.model.dispose();}placed.clear();for(const display of leafGroups.values()){display.unregister();r.releaseOwned(display.leaves);}leafGroups.clear();held.dispose();ghost.dispose();surfaces.dispose();hits.clear();group.removeFromParent();group.clear();},
  };
}
