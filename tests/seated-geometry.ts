import * as THREE from 'three';

export type SkinVertex={point:THREE.Vector3;bone:string};
/** Sample actual posed skin and every visible attached garment, rather than bone pivots. */
export function posedMeshes(root:THREE.Object3D,frame?:THREE.Matrix4){
  root.updateWorldMatrix(true,true);
  // SkinnedMesh refreshes its bind-matrix inverse in updateMatrixWorld, not updateWorldMatrix.
  root.updateMatrixWorld(true);
  const result:{mesh:THREE.Mesh;vertices:SkinVertex[];indices:number[]}[]=[];
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    for(let ancestor:THREE.Object3D|null=object;ancestor;ancestor=ancestor.parent)if(!ancestor.visible)return;
    const position=object.geometry.getAttribute('position'),skinIndex=object.geometry.getAttribute('skinIndex'),skinWeight=object.geometry.getAttribute('skinWeight');
    const vertices:SkinVertex[]=[];
    for(let index=0;index<position.count;index++){
      const point=object.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(object.matrixWorld);if(frame)point.applyMatrix4(frame);
      let bone=object.parent?.name??object.name;
      if(object instanceof THREE.SkinnedMesh&&skinIndex&&skinWeight){
        let strongest=0;for(let axis=1;axis<4;axis++)if(skinWeight.getComponent(index,axis)>skinWeight.getComponent(index,strongest))strongest=axis;
        bone=object.skeleton.bones[skinIndex.getComponent(index,strongest)]?.name??bone;
      }
      vertices.push({point,bone});
    }
    const indices=object.geometry.index?Array.from(object.geometry.index.array):Array.from({length:position.count},(_,index)=>index);
    result.push({mesh:object,vertices,indices});
  });
  return result;
}
export function penetrationReport(root:THREE.Object3D,boxes:{id:string;box:THREE.Box3}[],frame?:THREE.Matrix4){
  const meshes=posedMeshes(root,frame),report:{id:string;vertices:number;triangles:number;deepest:number;bones:Record<string,number>}[]=[];
  for(const volume of boxes){
    let vertices=0,triangles=0,deepest=0;const bones:Record<string,number>={};
    for(const mesh of meshes){
      for(const sample of mesh.vertices){
        const p=sample.point;if(!volume.box.containsPoint(p))continue;
        const depth=Math.min(p.x-volume.box.min.x,volume.box.max.x-p.x,p.y-volume.box.min.y,volume.box.max.y-p.y,p.z-volume.box.min.z,volume.box.max.z-p.z);
        if(depth<=.001)continue;vertices++;deepest=Math.max(deepest,depth);bones[sample.bone]=(bones[sample.bone]??0)+1;
      }
      for(let index=0;index<mesh.indices.length;index+=3){
        const triangle=new THREE.Triangle(mesh.vertices[mesh.indices[index]].point,mesh.vertices[mesh.indices[index+1]].point,mesh.vertices[mesh.indices[index+2]].point);
        if(volume.box.intersectsTriangle(triangle))triangles++;
      }
    }
    report.push({id:volume.id,vertices,triangles,deepest,bones});
  }
  return report;
}
