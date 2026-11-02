import * as THREE from 'three';
import type {Models} from './models.ts';

/** Reuse the authored cabin kit; the model cache keeps ownership of its GPU resources. */
export function createCabinRepair(models:Models) {
  const source=models.templates.get('cabin');
  if(!source)throw new Error('Missing cabin repair kit');
  source.updateMatrixWorld(true);
  const group=new THREE.Group();
  group.name='cabin-repair-first-stage';
  group.visible=false;
  const copy=(sourceName:string,name:string,x:number,z:number)=>{
    const part=source.getObjectByName(sourceName);
    if(!(part instanceof THREE.Mesh))throw new Error(`Missing cabin repair part: ${sourceName}`);
    const mesh=part.clone();
    part.matrixWorld.decompose(mesh.position,mesh.quaternion,mesh.scale);
    mesh.name=name;mesh.position.x=x;mesh.position.z=z;
    mesh.castShadow=mesh.receiveShadow=true;
    group.add(mesh);
  };
  // Two missing frontward boards. Other roof gaps deliberately remain for later stages.
  copy('roof_board002','repair-roof-left',-2.35,1.23);
  copy('roof_board007','repair-roof-right',2.35,2.02);
  // Additional posts sit outside the opening and inside the existing cabin footprint.
  copy('door_frame','repair-door-left',-1.78,3.57);
  copy('door_frame001','repair-door-right',.58,3.57);
  let disposed=false;
  return {group,
    update(level:number){if(!disposed)group.visible=level>=1;},
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.clear();},
  };
}
