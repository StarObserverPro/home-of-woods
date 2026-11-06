import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Resources} from './resources.ts';

/** Project-authored broom geometry and isolated motion samples, reused by the live adapter. */
export type BroomStudyInput={
  phase:'idle'|'sweeping'|'playful';progress:number;swept:boolean;signed:boolean;
  affixMotion:'full'|'simple'|'off';reducedMotion:boolean;allowDodge:boolean;
};
export const BROOM_STUDY_ENVELOPE=1.05;
export function sampleBroomStudy(input:BroomStudyInput){
  const p=Number.isFinite(input.progress)?THREE.MathUtils.clamp(input.progress,0,1):0;
  const wave=Math.sin(p*Math.PI),ordinary=input.phase==='sweeping'&&!input.reducedMotion;
  const playful=input.phase==='playful'&&!input.reducedMotion&&input.affixMotion!=='off';
  const dodge=playful&&input.affixMotion==='full'&&input.allowDodge?.40*wave:0;
  const sweepProgress=input.phase==='sweeping'?p:input.swept?1:0;
  return {
    x:dodge+(ordinary?.20*Math.sin(p*Math.PI*6):0),z:ordinary?.06*Math.sin(p*Math.PI*6):0,
    yaw:playful?wave*(input.affixMotion==='full'?1.05:.35):0,
    sweep:ordinary?.23*Math.sin(p*Math.PI*6):0,
    gathered:input.reducedMotion?(sweepProgress>=1?1:0):THREE.MathUtils.smoothstep(sweepProgress,.08,.96),
  };
}

/** Resource-owned factory. The live adapter validates the whole sweep/dodge envelope. */
export function createBroomStudy(r:Resources,sharedMarkMaterial?:THREE.LineBasicMaterial){
  const group=new THREE.Group(),tool=new THREE.Group(),joint=new THREE.Group();
  group.name='branch-broom-model';tool.name='broom-tool';joint.name='broom-sweep-joint';joint.position.y=.35;tool.add(joint);group.add(tool);
  group.userData.motionEnvelopeRadius=BROOM_STUDY_ENVELOPE;
  const merged=(key:string,make:()=>THREE.BufferGeometry[])=>r.geometry('broom-study:'+key,()=>{
    const originals=make(),normalized=originals.map(part=>part.index?part.toNonIndexed():part.clone());
    try{const result=mergeGeometries(normalized,false);if(!result)throw Error('Cannot merge broom study');return result;}
    finally{for(const part of [...originals,...normalized])part.dispose();}
  });
  const mesh=(geometry:THREE.BufferGeometry,color:string,name:string)=>{
    const object=new THREE.Mesh(geometry,r.material(color,.86));object.name=name;object.castShadow=object.receiveShadow=true;joint.add(object);return object;
  };
  mesh(merged('wood',()=>[
    new THREE.CylinderGeometry(.038,.055,1.38,8).translate(0,.82,0),
    new THREE.BoxGeometry(.38,.18,.045).translate(0,.72,.065),
  ]),'#9d7246','broom-handle-and-makers-plate');
  mesh(merged('bristles',()=>[
    new THREE.CylinderGeometry(.095,.32,.4,9).scale(1.50,1,.53).translate(0,-.14,0),
    ...[-.36,-.18,0,.18,.36].map(x=>new THREE.CylinderGeometry(.021,.032,.32,5).translate(x,-.17,.075)),
  ]),'#c5ac6f','broom-reed-head');
  mesh(merged('bindings',()=>[
    new THREE.CylinderGeometry(.14,.17,.10,8).scale(1.50,1,.65).translate(0,.085,0),
    new THREE.CylinderGeometry(.058,.058,.15,8).translate(0,.17,0),
  ]),'#64523b','broom-bound-neck');
  const markGeometry=r.geometry('broom-study:makers-mark',()=>{
    // A project-authored geometric maker's mark, not text or a downloaded font texture.
    const outline=[[-.13,.72],[-.07,.775],[.045,.775],[.13,.72],[.045,.665],[-.07,.665],[-.13,.72]];
    const segments=outline.slice(1).map((point,index)=>[...outline[index],.091,...point,.091]);
    segments.push([-.17,.72,.091,.13,.72,.091],[-.055,.72,.091,-.025,.765,.091],[-.055,.72,.091,-.025,.675,.091],[.025,.72,.091,.065,.755,.091],[.025,.72,.091,.065,.685,.091]);
    return new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(segments.flat(),3));
  });
  const mark=new THREE.LineSegments(markGeometry,sharedMarkMaterial??r.own(new THREE.LineBasicMaterial({color:'#ead2a4'})));mark.name='broom-makers-mark';mark.visible=false;joint.add(mark);
  const upperGrip=new THREE.Object3D(),lowerGrip=new THREE.Object3D();upperGrip.name='broom-grip-upper';lowerGrip.name='broom-grip-lower';upperGrip.position.set(0,1.35,0);lowerGrip.position.set(0,.95,0);joint.add(upperGrip,lowerGrip);
  const leafGeometry=r.geometry('broom-study:leaf',()=>{
    const shape=new THREE.Shape();shape.moveTo(0,-.11);shape.lineTo(-.075,0);shape.lineTo(0,.15);shape.lineTo(.075,0);shape.closePath();
    return new THREE.ShapeGeometry(shape).rotateX(-Math.PI/2);
  });
  const leaves=r.own(new THREE.InstancedMesh(leafGeometry,r.material('#ad884b',.94),12));leaves.name='sweep-study-leaves';leaves.receiveShadow=true;group.add(leaves);
  for(let i=0;i<12;i++)leaves.setColorAt(i,new THREE.Color(['#ad884b','#c8a360','#8a7544'][i%3]));
  const transform=new THREE.Object3D();let disposed=false;
  function update(input:BroomStudyInput,ground:(x:number,z:number)=>number=()=>0){
    if(disposed)return;
    const pose=sampleBroomStudy(input);tool.position.set(pose.x,ground(pose.x,pose.z),pose.z);tool.rotation.y=pose.yaw;joint.rotation.z=pose.sweep;mark.visible=input.signed;
    for(let i=0;i<12;i++){
      const startX=((i*7)%13)/12*1.02-.51,startZ=((i*5)%11)/10*.25-.125;
      const endX=.65+Math.sin(i*2.1)*.085,endZ=.10+Math.cos(i*2.1)*.07;
      const x=THREE.MathUtils.lerp(startX,endX,pose.gathered),z=THREE.MathUtils.lerp(startZ,endZ,pose.gathered);
      transform.position.set(x,ground(x,z)+.018+(i%3)*.006*pose.gathered,z);transform.rotation.set(0,i*1.91,0);transform.scale.setScalar(.78+(i%4)*.09);transform.updateMatrix();leaves.setMatrixAt(i,transform.matrix);
    }
    leaves.instanceMatrix.needsUpdate=true;leaves.computeBoundingSphere();
  }
  update({phase:'idle',progress:0,swept:false,signed:false,affixMotion:'off',reducedMotion:false,allowDodge:false});
  return {group,tool,joint,leaves,mark,upperGrip,lowerGrip,update,
    stats(){
      let meshes=0,triangles=0;tool.traverse(object=>{if(object instanceof THREE.Mesh){meshes++;triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;}});
      return {meshes,triangles,leafInstances:leaves.count,leafTriangles:(leafGeometry.index?.count??leafGeometry.getAttribute('position').count)/3*leaves.count,mark:mark.visible,envelope:BROOM_STUDY_ENVELOPE,disposed};
    },
    dispose(){if(disposed)return;disposed=true;r.releaseOwned(leaves);group.removeFromParent();group.clear();tool.clear();joint.clear();},
  };
}
