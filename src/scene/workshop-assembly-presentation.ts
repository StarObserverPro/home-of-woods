import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {assemblyGuides,geometryParts} from '../domain/parametric-crafting.ts';
import type {GeometryPart} from '../domain/parametric-crafting.ts';
import type {GuidedAssembly} from '../domain/workshop-guided.ts';
import type {GameState} from '../domain/state.ts';
import type {Resources} from './resources.ts';
import {createSupportedSurfaceFactory} from './supported-surface-presentation.ts';

type PartView={part:GeometryPart;mesh:THREE.Mesh;guide:THREE.LineSegments};

/** A read-only workbench overlay. Only domain commands can fit parts or finish an item. */
export function createWorkshopAssemblyPresentation(r:Resources,workbench:THREE.Group){
  const factory=createSupportedSurfaceFactory(r),group=new THREE.Group(),partsRoot=new THREE.Group(),guidesRoot=new THREE.Group();
  group.name='workbench-supported-assembly';group.position.y=1.32;group.add(partsRoot,guidesRoot);group.visible=false;workbench.add(group);
  const stageMaterial=r.own(new THREE.MeshStandardMaterial({color:'#a88a60',roughness:.86,transparent:true,opacity:.55,depthWrite:false}));
  const activeMaterial=r.material('#edd095',.77);
  const guideMaterial=r.own(new THREE.LineDashedMaterial({color:'#e7dab6',dashSize:.12,gapSize:.085,transparent:true,opacity:.68}));
  const activeGuideMaterial=r.own(new THREE.LineDashedMaterial({color:'#b6d99f',dashSize:.12,gapSize:.085,transparent:true,opacity:.9}));
  const placedGuideMaterial=r.own(new THREE.LineDashedMaterial({color:'#b0c595',dashSize:.12,gapSize:.085,transparent:true,opacity:.35}));
  const markerGeometry=r.own(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(6),3)));
  const marker=new THREE.Line(markerGeometry,r.own(new THREE.LineBasicMaterial({color:'#efc68b',transparent:true,opacity:.65})));marker.name='active-part-to-guide';group.add(marker);marker.visible=false;
  const parts=new Map<string,PartView>();let signature='',disposed=false,phase:GuidedAssembly['phase']|null=null;

  const bracing=new THREE.Group();bracing.name='workbench-bracing';bracing.visible=false;workbench.add(bracing);
  function merged(key:string,make:()=>THREE.BufferGeometry[]){return r.geometry(key,()=>{
    const originals=make(),normalized=originals.map(part=>part.index?part.toNonIndexed():part.clone());
    try{const result=mergeGeometries(normalized,false);if(!result)throw Error('Cannot merge workbench improvement');return result;}
    finally{for(const part of [...originals,...normalized])part.dispose();}
  });}
  const wood=new THREE.Mesh(merged('workbench:bracing-wood',()=>{
    const geometries:THREE.BufferGeometry[]=[];
    for(const z of [-.53,.53])for(const side of [-1,1]){
      const start=new THREE.Vector3(side*1.12,.14,z),end=new THREE.Vector3(side*.37,1.00,z),direction=end.clone().sub(start);
      const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize());
      const matrix=new THREE.Matrix4().compose(start.add(end).multiplyScalar(.5),rotation,new THREE.Vector3(1,1,1));
      geometries.push(new THREE.CylinderGeometry(.075,.09,direction.length(),6).applyMatrix4(matrix));
    }
    return geometries;
  }),factory.materials.frame);wood.name='workbench-diagonal-braces';wood.castShadow=wood.receiveShadow=true;bracing.add(wood);
  const clamps=new THREE.Mesh(merged('workbench:bracing-clamps',()=>{
    const geometries:THREE.BufferGeometry[]=[];
    for(const x of [-1.3,1.3]){
      geometries.push(new THREE.BoxGeometry(.24,.15,.32).translate(x,1.29,.66),new THREE.BoxGeometry(.22,.12,.29).translate(x,1.53,.66),new THREE.CylinderGeometry(.045,.045,.55,7).translate(x,1.34,.83),new THREE.CylinderGeometry(.035,.035,.40,7).rotateZ(Math.PI/2).translate(x,1.08,.83));
    }
    return geometries;
  }),r.material('#556962',.71));clamps.name='workbench-wood-clamps';clamps.castShadow=clamps.receiveShadow=true;bracing.add(clamps);

  function clear(){partsRoot.clear();guidesRoot.clear();parts.clear();signature='';phase=null;marker.visible=false;}
  function rebuild(assembly:GuidedAssembly,key:string){
    clear();signature=key;
    for(const part of geometryParts(assembly.geometry)){
      const mesh=new THREE.Mesh(factory.partGeometry(part),stageMaterial);mesh.name='assembly-part:'+part.id;mesh.userData.assemblyPartId=part.id;mesh.castShadow=mesh.receiveShadow=true;partsRoot.add(mesh);
      const guide=new THREE.LineSegments(factory.partEdges(part),guideMaterial);guide.name='assembly-guide:'+part.id;guide.position.set(part.center.x,part.center.y,part.center.z);guide.scale.setScalar(1.025);guidesRoot.add(guide);
      parts.set(part.id,{part,mesh,guide});
    }
  }
  function staged(view:PartView,index:number){
    const {part,mesh}=view;
    if(part.id==='surface'){mesh.position.set(0,part.dimensions.y/2+.04,-.18);mesh.rotation.set(0,0,0);}
    else{mesh.position.set((index%2?1:-1)*.69,part.dimensions.x/2+.05+Math.floor(index/2)*.20,.30);mesh.rotation.set(0,0,Math.PI/2);}
  }
  return {group,bracing,
    update(state:GameState,reducedMotion=false){
      if(disposed)return;
      bracing.visible=(state.workshop.upgrades['camp-workbench:bracing']?.level??0)>=1;
      const assembly=state.workshop.job?.assembly;
      group.visible=!!assembly&&state.workshop.job?.phase==='working';
      if(!group.visible||!assembly){if(signature)clear();return;}
      const key=factory.geometryKey(assembly.geometry);if(signature!==key)rebuild(assembly,key);phase=assembly.phase;
      const fitted=new Map(assembly.placements.map(placement=>[placement.id,placement])),guides=assemblyGuides(assembly.geometry);
      let stagedIndex=0;
      for(const [id,view] of parts){
        const locked=fitted.get(id),active=assembly.phase==='fitting'&&assembly.activePartId===id;
        const pose=locked??(active?assembly.activePose:null);
        view.mesh.material=locked?(id==='surface'?factory.materials.surface:factory.materials.frame):active?activeMaterial:stageMaterial;
        view.mesh.visible=true;view.guide.visible=assembly.phase==='fitting';
        view.guide.material=locked?placedGuideMaterial:active?activeGuideMaterial:guideMaterial;
        if(assembly.phase==='finishing'){
          view.mesh.position.set(view.part.center.x,view.part.center.y,view.part.center.z);view.mesh.rotation.set(0,0,0);
          view.mesh.material=id==='surface'?factory.materials.surface:factory.materials.frame;
        }else if(pose){view.mesh.position.set(pose.x,pose.y,pose.z);view.mesh.rotation.set(0,pose.angle,0);}
        else{staged(view,stagedIndex);if(view.part.id!=='surface')stagedIndex++;}
      }
      const current=assembly.activePose,guide=guides.find(guide=>guide.id===assembly.activePartId);
      marker.visible=assembly.phase==='fitting'&&!!current&&!!guide&&!reducedMotion;
      if(marker.visible&&current&&guide){
        const position=markerGeometry.getAttribute('position');position.setXYZ(0,current.x,current.y,current.z);position.setXYZ(1,guide.target.x,guide.target.y,guide.target.z);position.needsUpdate=true;markerGeometry.computeBoundingSphere();
      }
    },
    stats:()=>({active:group.visible,braced:bracing.visible,phase,parts:parts.size,guides:guidesRoot.children.filter(child=>child.visible).length}),
    dispose(){if(disposed)return;disposed=true;clear();group.removeFromParent();group.clear();bracing.removeFromParent();bracing.clear();},
  };
}
