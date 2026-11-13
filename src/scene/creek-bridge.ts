import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import {CREEK_BRIDGE} from '../content/regions.ts';
import {bridgeHeightAt,onBridge} from '../world/traversal.ts';
import {heightAt} from '../world/surface.ts';
import {travelAccess,bridgeOpen} from '../world/regions.ts';
import type {GameState} from '../domain/state.ts';
import type {Resources} from './resources.ts';
import {InteractionRegistry} from './interaction-registry.ts';
import {createSign} from './models.ts';

/** Original modular timber bridge. Every plank and the walking surface share one profile. */
export function createCreekBridge(r:Resources){
  const group=new THREE.Group(),built=new THREE.Group(),hits=new InteractionRegistry();
  group.name=CREEK_BRIDGE.id;built.name='creek-bridge-deck';group.add(built);
  const {west,east,width}=CREEK_BRIDGE,length=east.x-west.x;
  const box=r.geometry('bridge-timber-unit',()=>new THREE.BoxGeometry(1,1,1));
  const timber=r.material('#956b40',.8),plank=r.material('#ba935e',.78),end=r.material('#d1b080',.8);
  function beam(parent:THREE.Group,a:THREE.Vector3,b:THREE.Vector3,thickness:number,material=timber){
    const mesh=new THREE.Mesh(box,material),delta=b.clone().sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.set(thickness,delta.length(),thickness);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);
  }
  const count=48,parts:THREE.BufferGeometry[]=[];
  for(let i=0;i<count;i++){
    const x=west.x+(i+.5)*length/count,geometry=box.clone(),position=geometry.getAttribute('position');
    for(let j=0;j<position.count;j++){
      const wx=x+position.getX(j)*length/count*.96,wz=west.z+position.getZ(j)*width;
      position.setXYZ(j,wx,bridgeHeightAt(wx,wz)+(position.getY(j)>.0?0:-.26),wz);
    }
    geometry.computeVertexNormals();parts.push(geometry);
  }
  const deck=r.geometry('creek-bridge-planks',()=>mergeGeometries(parts,false)!);parts.forEach(g=>g.dispose());
  const boards=new THREE.Mesh(deck,plank);boards.castShadow=boards.receiveShadow=true;built.add(boards);
  for(const side of [-1,1]){
    const z=west.z+side*(width/2-.1);
    for(let i=0;i<9;i++){
      const x=west.x+i*length/8,y=bridgeHeightAt(x,z);
      beam(built,new THREE.Vector3(x,y-.4,z),new THREE.Vector3(x,y+1.25,z),.2,end);
      if(i){const px=west.x+(i-1)*length/8,py=bridgeHeightAt(px,z);
        beam(built,new THREE.Vector3(px,py+1.1,z),new THREE.Vector3(x,y+1.1,z),.14);
        beam(built,new THREE.Vector3(px,py-.4,z),new THREE.Vector3(x,y-.4,z),.32);
      }
      if(i%2===0)beam(built,new THREE.Vector3(x,heightAt(x,z)-.4,z),new THREE.Vector3(x,y-.25,z),.34);
    }
  }
  // Merge static beams by material rather than adding one draw call per railing/post.
  for(const material of [timber,end]){
    const pieces=built.children.filter((o):o is THREE.Mesh=>o instanceof THREE.Mesh&&o.material===material),parts=pieces.map(mesh=>{mesh.updateMatrix();return mesh.geometry.clone().applyMatrix4(mesh.matrix);});
    const geometry=r.geometry(`bridge-beams-${material.uuid}`,()=>mergeGeometries(parts,false)!);parts.forEach(g=>g.dispose());pieces.forEach(mesh=>mesh.removeFromParent());
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;built.add(mesh);
  }
  const site=createSign(r,'跨溪木桥');site.position.set(west.x-1,heightAt(west.x-1,west.z-3),west.z-3);group.add(site);
  const unregister=hits.register(site,CREEK_BRIDGE.id);
  const stakes=new THREE.Group();group.add(stakes);
  for(const z of [west.z-width/2,west.z+width/2])beam(stakes,new THREE.Vector3(west.x-.7,heightAt(west.x-.7,z),z),new THREE.Vector3(west.x-.7,heightAt(west.x-.7,z)+.8,z),.15);
  const point=(x:number,z:number)=>onBridge(x,z)?{x,y:bridgeHeightAt(x,z),z}:null;
  return {group,built,hits,point,
    update(state:GameState){built.visible=bridgeOpen(travelAccess(state));stakes.visible=!built.visible;},
    dispose(){unregister();hits.clear();group.clear();group.removeFromParent();},
  };
}
