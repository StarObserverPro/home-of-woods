import {WOOD_TONES} from '../content/wood-tones.ts';
import {woodToneGeometry} from './wood-tones.ts';
import {woodCoordinates,woodMaterial} from './wood-grain.ts';
import {scrapGeometry,scrapMaterial} from './scrap-geometry.ts';
import * as THREE from 'three';
import { WOODCRAFT } from '../content/woodcraft.ts';
import { woodShape } from '../domain/woodcraft.ts';
import type { WoodcraftState } from '../domain/woodcraft.ts';
import type { Resources } from './resources.ts';
import { InteractionRegistry } from './interaction-registry.ts';
import { heightAt } from '../world/surface.ts';
/** Presentation only: all resting poses are physics results, never authored stack coordinates. */
export function createWoodcraftPresentation(r:Resources) {
  const group=new THREE.Group(), hits=new InteractionRegistry();group.name='camp-woodcraft';
  const floor=heightAt(WOODCRAFT.x,WOODCRAFT.z), wood=woodMaterial(r,WOOD_TONES.neutral.bark,.7);
  const railGeo=r.geometry('woodcraft-rail-z',()=>woodCoordinates(new THREE.BoxGeometry(1,1,1),'board','z'));
  const railX=r.geometry('woodcraft-rail-x',()=>woodCoordinates(new THREE.BoxGeometry(1,1,1),'board','x'));
  const cylinder=r.geometry('woodcraft-cylinder',()=>woodCoordinates(new THREE.CylinderGeometry(1,1,1,9),'raw','y'));
  const frame=new THREE.Group();frame.name=WOODCRAFT.id;group.add(frame);hits.register(frame,WOODCRAFT.id);
  for(const side of [-1,1]) {
    const a=new THREE.Mesh(railGeo,wood),b=new THREE.Mesh(railX,wood);
    a.scale.set(WOODCRAFT.railWidth,WOODCRAFT.railHeight,2*(WOODCRAFT.halfZ+WOODCRAFT.railWidth));
    a.position.set(WOODCRAFT.x+side*(WOODCRAFT.halfX+WOODCRAFT.railWidth/2),floor+WOODCRAFT.railHeight/2,WOODCRAFT.z);
    b.scale.set(2*WOODCRAFT.halfX,WOODCRAFT.railHeight,WOODCRAFT.railWidth);
    b.position.set(WOODCRAFT.x,floor+WOODCRAFT.railHeight/2,WOODCRAFT.z+side*(WOODCRAFT.halfZ+WOODCRAFT.railWidth/2));
    a.castShadow=b.castShadow=a.receiveShadow=b.receiveShadow=true;frame.add(a,b);
  }
  const scrap=r.geometry('woodcraft-split-scrap',scrapGeometry),scrapSurface=scrapMaterial(r);
  const placed=new Map<string,{root:THREE.Group;unregister:()=>void}>();
  return {group,hits,
    update(state:WoodcraftState){
      const current=new Set(state.pieces.filter(p=>p.phase==='loose').map(p=>p.id));
      for(const p of state.pieces) {
        if(p.phase!=='loose')continue;
        let owned=placed.get(p.id);
        if(!owned) {
          const root=new THREE.Group();root.name=p.id;
          const {length,radius,fork}=woodShape(p.source),isScrap=p.source.itemId==='scrap-fuel';
          const tone=WOOD_TONES.neutral,toneSeed=p.id;
          const raw=woodMaterial(r,tone.bark,.7),cut=woodMaterial(r,tone.end,.72);
          const body=new THREE.Mesh(woodToneGeometry(r,isScrap?scrap:cylinder,toneSeed),isScrap?scrapSurface:[raw,cut,cut]);
          body.name=isScrap?'split-scrap':p.source.itemId==='branch'?'forked-branch':'log';
          if(!isScrap)body.scale.set(radius,length,radius);body.castShadow=body.receiveShadow=true;root.add(body);
          if(fork){const branch=new THREE.Mesh(woodToneGeometry(r,cylinder,toneSeed),[raw,cut,cut]);branch.scale.set(radius*.7,length*.56,radius*.7);branch.position.set(length*.17,length*.19,0);branch.rotation.z=-.65;branch.castShadow=branch.receiveShadow=true;root.add(branch);}
          group.add(root);owned={root,unregister:hits.register(root,p.id)};placed.set(p.id,owned);
        }
        owned.root.position.copy(p.position);owned.root.quaternion.copy(p.rotation);
      }
      for(const [id,p] of placed)if(!current.has(id)){p.unregister();group.remove(p.root);placed.delete(id);}
    },
    point(id:string){if(id===WOODCRAFT.id)return WOODCRAFT;const root=placed.get(id)?.root;return root?{x:root.position.x,z:root.position.z}:null;},
    stats:()=>({visible:placed.size,hits:hits.size}),
    dispose(){placed.forEach(p=>p.unregister());placed.clear();hits.clear();group.removeFromParent();group.clear();},
  };
}
