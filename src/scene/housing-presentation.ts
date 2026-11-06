import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {HOUSING} from '../content/housing.ts';
import type {RarityVfxMode} from '../content/item-vfx.ts';
import type {GameState} from '../domain/state.ts';
import type {PlacementDraft} from '../domain/furniture-placement.ts';
import {furnitureGeometry} from '../domain/furniture-placement.ts';
import {heightAt} from '../world/surface.ts';
import type {Resources} from './resources.ts';
import {InteractionRegistry} from './interaction-registry.ts';
import {createItemSurface} from './item-surface.ts';
import {createDoorbellAudio} from './bell-audio.ts';
import {createSupportedSurfaceFactory} from './supported-surface-presentation.ts';
import type {SupportedSurfaceLook} from './supported-surface-presentation.ts';

type XYZ=[number,number,number];
type Display={root:THREE.Group;swing:THREE.Group|null;age:number|null;key:string;unregister:()=>void};

/** Original, reusable low-poly handwork. No gameplay state is written by these meshes. */
export function createHousingPresentation(r:Resources,cabin:THREE.Object3D){
  const group=new THREE.Group();group.name='housing-ordinary-items';
  const mountedGroup=new THREE.Group();mountedGroup.name='housing-cabin-items';cabin.add(mountedGroup);
  const hits=new InteractionRegistry(),surfaces=createItemSurface(r),audio=createDoorbellAudio();
  const supported=createSupportedSurfaceFactory(r);
  const placed=new Map<string,Display>();
  const lightWood=r.material('#d1ac72',.78),wood=r.material('#9d7246',.84),darkWood=r.material('#624936',.88),cord=r.material('#e3d3a6',.93);
  let preview:PlacementDraft|null=null,disposed=false;

  function merged(key:string,parts:THREE.BufferGeometry[]){
    try{return r.geometry(key,()=>{
        const normalized=parts.map(part=>part.index?part.toNonIndexed():part.clone());
        const result=mergeGeometries(normalized,false);
        for(const part of normalized)part.dispose();
        if(!result)throw new Error('Could not merge housing geometry');
        result.computeBoundingSphere();return result;
      });
    }finally{for(const part of parts)part.dispose();}
  }
  const block=(dimensions:XYZ,position:XYZ)=>new RoundedBoxGeometry(...dimensions,1,.045).translate(...position);
  const cylinder=(top:number,bottom:number,height:number,position:XYZ,segments=8)=>new THREE.CylinderGeometry(top,bottom,height,segments).translate(...position);
  function addMesh(parent:THREE.Group,geometry:THREE.BufferGeometry,material:THREE.Material,name:string){
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function doorbell(){
    const root=new THREE.Group(),swing=new THREE.Group();swing.name='doorbell-swing';root.add(swing);
    const crossbar=block([1.03,.14,.18],[0,-.05,0]);
    addMesh(root,merged('housing-doorbell-crossbar',[crossbar]),wood,'doorbell-wooden-crossbar');
    const cords:THREE.BufferGeometry[]=[],cones:THREE.BufferGeometry[]=[],ends:THREE.BufferGeometry[]=[];
    for(const [i,x] of [-.32,0,.32].entries()){
      const drop=.38+(i%2)*.18;
      cords.push(cylinder(.026,.026,drop,[x,-drop/2-.08,0],6));
      const bodyY=-drop-.39;
      // Broad, overlapping whorls keep the pinecone silhouette clear at normal camera scale.
      for(let tier=0;tier<4;tier++){
        const radius=.19-tier*.033;
        cones.push(new THREE.ConeGeometry(radius,.24,7).rotateZ(Math.PI).translate(x,bodyY+tier*.10,0));
      }
      ends.push(cylinder(.06,.09,.09,[x,bodyY+.38,0],7));
    }
    cords.push(cylinder(.028,.028,.70,[.52,-.43,.08],6));
    ends.push(new THREE.SphereGeometry(.095,7,4).translate(.52,-.83,.08));
    addMesh(swing,merged('housing-doorbell-cords',cords),cord,'doorbell-cords');
    addMesh(swing,merged('housing-doorbell-cones',cones),darkWood,'doorbell-three-pinecones');
    addMesh(swing,merged('housing-doorbell-ends',ends),lightWood,'doorbell-ties-and-pull');
    return {root,swing};
  }
  const ghost=new THREE.Group();ghost.name='supported-furniture-placement';ghost.visible=false;group.add(ghost);
  let ghostKey='';
  const ghostMaterial=r.own(new THREE.MeshStandardMaterial({color:'#d7edaf',transparent:true,opacity:.45,depthWrite:false,roughness:.9}));
  const anchor=new THREE.Vector3(HOUSING.doorbell.anchor.x,HOUSING.doorbell.anchor.y,HOUSING.doorbell.anchor.z);

  function remove(id:string,display:Display){
    display.unregister();surfaces.release(display.root);display.root.removeFromParent();display.root.clear();placed.delete(id);
  }
  return {group,mountedGroup,hits,
    setPreview(value:PlacementDraft|null){preview=value;},
    setRarityVfxMode(mode:RarityVfxMode){surfaces.setMode(mode);},
    update(state:GameState,dt=0,reducedMotion=false,night=0){
      if(disposed)return;
      const step=Number.isFinite(dt)&&dt>0?Math.min(dt,.1):0;
      surfaces.update(step,reducedMotion,night);
      const visible=new Set<string>();
      for(const item of state.inventory.instances??[]){
        const isBell=item.definitionId===HOUSING.doorbell.definitionId&&item.location.kind==='mounted'&&item.location.hostId===HOUSING.doorbell.hostId&&item.location.slotId===HOUSING.doorbell.slotId;
        const isBench=item.definitionId===HOUSING.guestBench.definitionId&&item.location.kind==='world';
        const isTable=item.definitionId==='furniture.prep-side-table'&&item.location.kind==='world';
        if(!isBell&&!isBench&&!isTable)continue;
        const geometry=isBell?null:furnitureGeometry(item),look:SupportedSurfaceLook=isTable?'table':'bench';
        if(!isBell&&(!geometry||geometry.family!=='supported-surface'))continue;
        const key=isBell?'doorbell':supported.signature(geometry!,look);
        visible.add(item.instanceId);let display=placed.get(item.instanceId);
        if(display&&display.key!==key){remove(item.instanceId,display);display=undefined;}
        if(!display){
          const made=isBell?doorbell():{root:supported.create(geometry!,look),swing:null};
          made.root.name=item.instanceId;(isBell?mountedGroup:group).add(made.root);
          display={...made,age:null,key,unregister:hits.register(made.root,item.instanceId)};placed.set(item.instanceId,display);
        }
        if(isBell){display.root.position.copy(anchor);display.root.rotation.set(0,0,0);}
        else if(item.location.kind==='world'){
          display.root.position.set(item.location.x,heightAt(item.location.x,item.location.z)-.025,item.location.z);
          display.root.rotation.set(0,item.location.rotation,0);
        }
        surfaces.apply(display.root,item);
        if(display.swing){
          if(display.age!==null){display.age+=step;if(display.age>1.8)display.age=null;}
          display.swing.rotation.z=display.age===null||reducedMotion?0:Math.sin(display.age*19)*.24*Math.exp(-display.age*1.9);
          display.swing.rotation.x=display.age===null||reducedMotion?0:Math.sin(display.age*14)*.065*Math.exp(-display.age*2.0);
        }
      }
      for(const [id,display] of placed)if(!visible.has(id))remove(id,display);
      const instance=state.inventory.instances?.find(item=>item.instanceId===preview?.instanceId);
      const ghostGeometry=instance&&(instance.definitionId===HOUSING.guestBench.definitionId||instance.definitionId==='furniture.prep-side-table')?furnitureGeometry(instance):null;
      ghost.visible=!!preview?.point&&ghostGeometry?.family==='supported-surface';
      if(ghost.visible&&ghostGeometry&&instance){
        const look:SupportedSurfaceLook=instance.definitionId==='furniture.prep-side-table'?'table':'bench',key=supported.signature(ghostGeometry,look);
        if(key!==ghostKey){
          ghost.clear();const root=supported.create(ghostGeometry,look);
          root.traverse(object=>{if(object instanceof THREE.Mesh){object.material=ghostMaterial;object.castShadow=false;}});
          ghost.add(root);ghostKey=key;
        }
      }
      if(ghost.visible&&preview?.point){
        ghost.position.set(preview.point.x,heightAt(preview.point.x,preview.point.z)-.025,preview.point.z);
        ghost.rotation.y=preview.rotation;ghostMaterial.color.set(preview.reason?'#da8068':'#d7edaf');
      }
    },
    ring(instanceId:string){
      const display=placed.get(instanceId);if(disposed||!display?.swing)return false;
      display.age=.001;audio.ring();return true;
    },
    point(id:string){
      const display=placed.get(id);if(!display)return null;
      const point=display.root.getWorldPosition(new THREE.Vector3());return {x:point.x,z:point.z};
    },
    object(id:string){return placed.get(id)?.root??null;},
    stats(){
      let meshes=0,triangles=0;
      for(const display of placed.values())display.root.traverse(object=>{if(object instanceof THREE.Mesh){meshes++;triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;}});
      return {items:placed.size,hits:hits.size,meshes,triangles,preview:ghost.visible,surfaces:surfaces.stats()};
    },
    dispose(){
      if(disposed)return;disposed=true;
      for(const [id,display] of placed)remove(id,display);
      hits.clear();surfaces.dispose();audio.dispose();group.removeFromParent();mountedGroup.removeFromParent();group.clear();mountedGroup.clear();preview=null;ghostKey='';
      // Every geometry/material (including removed-instance caches) belongs to Resources.
    },
  };
}
