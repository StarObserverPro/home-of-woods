import * as THREE from 'three';
import {SHADOW_PROFILES} from '../../content/shadows.ts';
import type {CharacterFootContact} from './character-contact-shadows.ts';

const canonical = (name:string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
type Anchor = {
  bone:THREE.Bone; localSole:THREE.Vector3; localForward:THREE.Vector3;
  initialScale:number; footLength:number; contact:CharacterFootContact;
};

/**
 * Measure the admitted rig's sole from its weighted skin vertices once, before
 * starting animation. Thereafter only two bone transforms are read per update.
 * Pass the active body, not a parent containing alternate character rigs.
 */
export function createFootContactAnchors(body:THREE.Object3D, options:{idPrefix?:string;toePrefix?:string}={}) {
  const meshes:THREE.SkinnedMesh[]=[];
  body.traverse(object=>{if(object instanceof THREE.SkinnedMesh)meshes.push(object);});
  function updateRigWorld(){
    body.updateWorldMatrix(true,false);
    // Attached skins refresh bindMatrixInverse in updateMatrixWorld's override.
    // updateWorldMatrix alone would count a new parent scale/translation twice
    // when measuring getVertexPosition before the first renderer frame.
    body.updateMatrixWorld(true);
  }
  updateRigWorld();
  const vertex=new THREE.Vector3(),scale=new THREE.Vector3(),quaternion=new THREE.Quaternion();
  const anchors:Anchor[]=[];
  let inspectedVertices=0;
  for(const side of ['l','r'] as const){
    const footName=`foot${side}`,toeName=`${options.toePrefix??'toes'}${side}`;
    const bone=meshes.flatMap(mesh=>mesh.skeleton.bones).find(value=>canonical(value.name)===footName);
    if(!bone)continue;
    const toe=meshes.flatMap(mesh=>mesh.skeleton.bones).find(value=>canonical(value.name)===toeName);
    const points:THREE.Vector3[]=[];
    for(const mesh of meshes){
      const positions=mesh.geometry.getAttribute('position');
      const skinIndex=mesh.geometry.getAttribute('skinIndex'),skinWeight=mesh.geometry.getAttribute('skinWeight');
      if(!positions||!skinIndex||!skinWeight)continue;
      const joints=new Set(mesh.skeleton.bones.flatMap((joint,index)=>
        canonical(joint.name)===footName||canonical(joint.name)===toeName?[index]:[]));
      if(!joints.size)continue;
      for(let i=0;i<positions.count;i++){
        let influence=0;
        for(let axis=0;axis<4;axis++)if(joints.has(skinIndex.getComponent(i,axis)))influence+=skinWeight.getComponent(i,axis);
        if(influence<.5)continue;
        mesh.getVertexPosition(i,vertex);mesh.localToWorld(vertex);
        if(![vertex.x,vertex.y,vertex.z].every(Number.isFinite))continue;
        points.push(vertex.clone());inspectedVertices++;
      }
    }
    // Missing skin evidence means no contact, never a guessed disc under the body.
    if(!points.length)continue;
    const bounds=new THREE.Box3().setFromPoints(points),extent=bounds.getSize(new THREE.Vector3());
    const soleBand=Math.max(1e-5,extent.y*.12);
    const sole=new THREE.Box3().setFromPoints(points.filter(point=>point.y<=bounds.min.y+soleBand)).getCenter(new THREE.Vector3());
    sole.y=bounds.min.y;
    const forward=toe?toe.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())):
      new THREE.Vector3(0,0,1).applyQuaternion(body.getWorldQuaternion(new THREE.Quaternion()));
    forward.y=0;
    if(forward.lengthSq()<1e-8)forward.set(0,0,1);
    forward.normalize();
    const projections=points.map(point=>point.dot(forward));
    const footLength=Math.max(...projections)-Math.min(...projections);
    const inverse=bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    anchors.push({
      bone,localSole:bone.worldToLocal(sole.clone()),localForward:forward.clone().applyQuaternion(inverse),
      initialScale:bone.getWorldScale(new THREE.Vector3()).length(),footLength,
      contact:{id:`${options.idPrefix??'actor'}:foot:${side}`,position:sole,forward,scale:footLength/(2*SHADOW_PROFILES.character.radiusZ)},
    });
  }
  const contacts=anchors.map(anchor=>anchor.contact);
  return {
    update():readonly CharacterFootContact[]{
      updateRigWorld();
      for(const anchor of anchors){
        anchor.contact.position.copy(anchor.localSole).applyMatrix4(anchor.bone.matrixWorld);
        anchor.bone.getWorldQuaternion(quaternion);
        anchor.contact.forward!.copy(anchor.localForward).applyQuaternion(quaternion).normalize();
        anchor.bone.getWorldScale(scale);
        anchor.contact.scale=anchor.footLength/(2*SHADOW_PROFILES.character.radiusZ)*scale.length()/Math.max(1e-8,anchor.initialScale);
      }
      return contacts;
    },
    stats:()=>({feet:anchors.length,inspectedVertices,method:'weighted-skin-sole-to-animated-foot-bone'}),
  };
}
