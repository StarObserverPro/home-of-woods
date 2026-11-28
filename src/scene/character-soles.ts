import * as THREE from 'three';

export type GroundHeight=(x:number,z:number)=>number;
const canonical=(name:string)=>name.toLowerCase().replace(/[^a-z0-9]/g,'');
const sides=['l','r'] as const;

/** Sample the visible skin around the heel and toes, including blended weights. */
export function createShoeSoles(body:THREE.Object3D,toePrefix='toes'){
  type Vertices={mesh:THREE.SkinnedMesh;indices:number[]};
  const samples=sides.map(()=>[] as Vertices[]);
  const point=new THREE.Vector3();
  const update=()=>{body.updateWorldMatrix(true,false);body.updateMatrixWorld(true);};
  update();
  body.traverse(mesh=>{
    if(!(mesh instanceof THREE.SkinnedMesh))return;
    const positions=mesh.geometry.getAttribute('position');
    const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
    if(!indices||!weights)return;
    const names=mesh.skeleton.bones.map(bone=>canonical(bone.name));
    for(const [slot,side] of sides.entries()){
      const foot=names.indexOf('foot'+side),toe=names.indexOf(toePrefix+side);
      if(foot<0)continue;
      const band:{index:number;y:number}[]=[];
      let low=Infinity;
      for(let i=0;i<indices.count;i++){
        let weight=0;
        for(let n=0;n<4;n++){
          const id=indices.getComponent(i,n);
          if(id===foot||id===toe)weight+=weights.getComponent(i,n);
        }
        if(weight<.64)continue;
        mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);
        low=Math.min(low,point.y);band.push({index:i,y:point.y});
      }
      const unique=new Set<string>(),sole=[];
      for(const {index,y} of band){
        if(y>low+.09)continue;
        // UV seams repeat positions and weights. Evaluate each distinct skin vertex once.
        const key=[positions.getX(index),positions.getY(index),positions.getZ(index),
          ...[0,1,2,3].map(n=>indices.getComponent(index,n)+':'+weights.getComponent(index,n))].join(',');
        if(!unique.has(key)){unique.add(key);sole.push(index);}
      }
      if(sole.length)samples[slot].push({mesh,indices:sole});
    }
  });
  const clearance=[0,0],level=[0,0];
  return function read(groundAt:GroundHeight,rootHeight=0){
    update();
    for(const [side,parts] of samples.entries()){
      clearance[side]=level[side]=Infinity;
      for(const {mesh,indices} of parts){
        let visible=true;
        for(let o:THREE.Object3D|null=mesh;o&&o!==body;o=o.parent)visible&&=o.visible;
        if(!visible)continue;
        for(const i of indices){
          mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);
          clearance[side]=Math.min(clearance[side],point.y-groundAt(point.x,point.z));
          level[side]=Math.min(level[side],point.y-rootHeight);
        }
      }
    }
    return {clearance,level};
  };
}
