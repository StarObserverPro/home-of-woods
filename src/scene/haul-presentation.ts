import {woodCoordinates,woodMaterial} from './wood-grain.ts';
import {groundScrapGeometry,scrapMaterial} from './scrap-geometry.ts';
import * as THREE from 'three';
import {groundStacks,groundId} from '../domain/carrying.ts';
import {transportLocation} from '../domain/transport-location.ts';
import type {InventoryState} from '../domain/inventory.ts';
import {woodShape} from '../domain/woodcraft.ts';
import {heightAt} from '../world/surface.ts';
import type {Resources} from './resources.ts';
import type {Models} from './models.ts';
import {InteractionRegistry} from './interaction-registry.ts';
/** One representative model per batch. These are static material drops, not a second physics world. */
export function createHaulPresentation(r:Resources,models:Models){
  const group=new THREE.Group(),hits=new InteractionRegistry();group.name='haul-materials';
  const placed=new Map<string,{root:THREE.Group;remove:()=>void}>();
  const cylinder=r.geometry('haul-log',()=>woodCoordinates(new THREE.CylinderGeometry(1,1,1,9),'raw','y'));
  const bark=woodMaterial(r,'#875b3c',.7),end=woodMaterial(r,'#ddbd87',.72);
  const scraps=r.geometry('haul-split-scraps',groundScrapGeometry),scrapSurface=scrapMaterial(r);
  let revision=-1;
  return {group,hits,
    update(inventory:InventoryState){
      if(inventory.revision===revision)return;revision=inventory.revision;
      const live=new Set<string>(),slots=new Map<string,number>();
      for(const stack of groundStacks(inventory)){
        const id=groundId(stack),p=transportLocation(stack)! as {x:number;z:number};live.add(id);
        let entry=placed.get(id);
        if(!entry){
          const root=new THREE.Group();root.name=id;
          if(stack.itemId==='wood'||stack.itemId==='small-wood'){
            const shape=woodShape(stack),mesh=new THREE.Mesh(cylinder,[bark,end,end]);
            mesh.scale.set(shape.radius,shape.length,shape.radius);mesh.rotation.z=Math.PI/2;
            mesh.position.y=shape.radius;root.add(mesh);
          }else if(stack.itemId==='scrap-fuel'){
            const mesh=new THREE.Mesh(scraps,scrapSurface);mesh.name='ground-split-scraps';root.add(mesh);
          }else{
            const template=models.templates.get(stack.itemId.includes('mushroom')?'mushrooms':'branches');
            if(template){const mesh=template.clone(true);root.add(mesh);const box=new THREE.Box3().setFromObject(mesh),size=box.getSize(new THREE.Vector3());
              const scale=1.1/Math.max(size.x,size.z,.01);mesh.scale.multiplyScalar(scale);mesh.position.y-=box.min.y*scale;}
          }
          root.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=o.receiveShadow=true;});
          group.add(root);entry={root,remove:hits.register(root,id)};placed.set(id,entry);
        }
        const spot=`${p.x},${p.z}`,index=slots.get(spot)??0;slots.set(spot,index+1);
        const x=p.x+(index%3-1)*.32,z=p.z+Math.floor(index/3)*.35;
        entry.root.position.set(x,heightAt(x,z)+.025,z);
      }
      for(const [id,entry] of placed)if(!live.has(id)){entry.remove();group.remove(entry.root);placed.delete(id);}
    },
    point(id:string){const p=placed.get(id)?.root.position;return p?{x:p.x,z:p.z}:null;},
    stats:()=>({batches:placed.size,hits:hits.size}),
    dispose(){placed.forEach(e=>e.remove());placed.clear();hits.clear();group.clear();group.removeFromParent();},
  };
}
