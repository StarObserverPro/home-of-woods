import {createItemSurface} from './item-surface.ts';
import * as THREE from 'three';
import type {Resources} from './resources.ts';
import type {Models} from './models.ts';
import type {GameState} from '../domain/state.ts';
import {InteractionRegistry} from './interaction-registry.ts';
import {WORKBENCH,WORKBENCH_STOOL,SEAT_DEFINITION,WORKSHOP_RULES} from '../content/workshop.ts';
import {heightAt} from '../world/surface.ts';
import type {PlacementDraft} from '../domain/furniture-placement.ts';

/** CC0 Kenney log cribs support authored rough planks. Meshes never settle gameplay. */
export function createWorkshopPresentation(r:Resources,models:Models){
  const surfaces=createItemSurface(r);
  const group=new THREE.Group(),hits=new InteractionRegistry();group.name='workshop';
  const wood=r.material('#855739'),endgrain=r.material('#d6b47a');
  const seatGeometry=r.geometry('workshop-seat',()=>new THREE.CylinderGeometry(.52,.6,.7,9));
  const plank=r.geometry('workshop-plank',()=>new THREE.BoxGeometry(3.3,.22,.41));
  const seat=()=>{const root=new THREE.Group();const m=new THREE.Mesh(seatGeometry,[wood,endgrain,endgrain]);m.position.y=.35;m.castShadow=m.receiveShadow=true;root.add(m);return root;};
  const bench=new THREE.Group();bench.name=WORKBENCH.id;
  for(const x of [-1.15,1.15]){
    const support=models.staticClone('branches');
    const bounds=new THREE.Box3().setFromObject(support),size=bounds.getSize(new THREE.Vector3());
    support.scale.set(.72/size.x,1.1/size.y,1.25/size.z);support.position.set(x,0,0);bench.add(support);
  }
  for(let i=0;i<3;i++){const m=new THREE.Mesh(plank,i===1?endgrain:wood);m.position.set(i===1?.05:0,1.16+(i%2)*.025,(i-1)*.43);m.rotation.y=(i-1)*.012;m.castShadow=m.receiveShadow=true;bench.add(m);}
  bench.position.set(WORKBENCH.x,heightAt(WORKBENCH.x,WORKBENCH.z)-.08,WORKBENCH.z);group.add(bench);hits.register(bench,WORKBENCH.id);
  const stool=seat();stool.name=WORKBENCH_STOOL.id;stool.scale.set(.85,.85,.85);stool.position.set(WORKBENCH_STOOL.x,heightAt(WORKBENCH_STOOL.x,WORKBENCH_STOOL.z)-.06,WORKBENCH_STOOL.z);group.add(stool);hits.register(stool,WORKBENCH_STOOL.id);
  const placed=new Map<string,{root:THREE.Group;unregister:()=>void}>();
  const ghost=seat();const ghostMaterial=r.own(new THREE.MeshStandardMaterial({color:'#d4edab',transparent:true,opacity:.48,depthWrite:false}));
  ghost.traverse(o=>{if(o instanceof THREE.Mesh){o.material=ghostMaterial;o.castShadow=false;}});ghost.visible=false;group.add(ghost);
  const ringMaterial=r.own(new THREE.MeshBasicMaterial({color:'#d4edab',side:THREE.DoubleSide,depthWrite:false}));
  const ring=new THREE.Mesh(r.geometry('placement-ring',()=>new THREE.RingGeometry(WORKSHOP_RULES.seatRadius,.76,32)),ringMaterial);ring.rotation.x=-Math.PI/2;ghost.add(ring);ring.position.y=.03;
  const progress=new THREE.Group(),barGeo=r.geometry('workshop-progress',()=>new THREE.PlaneGeometry(1,.10));
  const back=new THREE.Mesh(barGeo,r.own(new THREE.MeshBasicMaterial({color:'#3d4839',depthTest:false}))),fill=new THREE.Mesh(barGeo,r.own(new THREE.MeshBasicMaterial({color:'#e8d793',depthTest:false})));
  back.scale.x=1.8;fill.scale.x=1.8;fill.position.z=.01;back.renderOrder=fill.renderOrder=20;progress.add(back,fill);progress.visible=false;group.add(progress);
  let preview:PlacementDraft|null=null;
  return {group,hits,setPreview(value:PlacementDraft|null){preview=value;},
    update(state:GameState,camera:THREE.Camera){
      const current=new Set<string>();
      for(const item of state.inventory.instances??[]){
        if(item.definitionId!==SEAT_DEFINITION||item.location.kind!=='world')continue;
        current.add(item.instanceId);let owned=placed.get(item.instanceId);
        if(!owned){const root=seat();root.name=item.instanceId;group.add(root);owned={root,unregister:hits.register(root,item.instanceId)};placed.set(item.instanceId,owned);}
        surfaces.apply(owned.root,item);
        owned.root.position.set(item.location.x,heightAt(item.location.x,item.location.z)-.06,item.location.z);owned.root.rotation.y=item.location.rotation;
      }
      for(const [id,item] of placed)if(!current.has(id)){item.unregister();group.remove(item.root);placed.delete(id);}
      ghost.visible=!!preview?.point;if(preview?.point){ghost.position.set(preview.point.x,heightAt(preview.point.x,preview.point.z)-.06,preview.point.z);ghost.rotation.y=preview.rotation;ghostMaterial.color.set(preview.reason?'#d97563':'#d4edab');ringMaterial.color.copy(ghostMaterial.color);}
      const job=state.workshop.job;progress.visible=job?.phase==='working';
      if(job?.phase==='working'){const p=Math.min(1,(state.time-job.startedAt!)/job.durationSeconds);progress.position.set(state.player.x,heightAt(state.player.x,state.player.z)+2.4,state.player.z);progress.quaternion.copy(camera.quaternion);fill.scale.x=1.8*p;fill.position.x=-.9+.9*p;}
    },
    point(id:string){if(id===WORKBENCH.id)return WORKBENCH;if(id===WORKBENCH_STOOL.id)return WORKBENCH_STOOL;const root=placed.get(id)?.root;return root?{x:root.position.x,z:root.position.z}:null;},
    stats(){return {placed:placed.size,hits:hits.size,preview:!!preview,surfaces:surfaces.stats()};},
    dispose(){surfaces.dispose();placed.forEach(p=>p.unregister());placed.clear();hits.clear();group.clear();preview=null;},
  };
}
