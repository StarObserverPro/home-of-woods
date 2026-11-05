import * as THREE from 'three';
import type {Resources} from './resources.ts';

/** bark.v1, fixed periodic coefficients; neutral pigment preserves species colours. Scene lifetime cache. */
export function createBarkSurface(r:Resources){
  const size=128,heights=new Float32Array(size*size),albedo=new Uint8Array(size*size*4),normals=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size*Math.PI*2,v=y/size*Math.PI*2;
    const groove=Math.pow(.5+.5*Math.sin(u*9+.65*Math.sin(v*2)+.24*Math.sin(v*5+u)),8);
    heights[y*size+x]=1-groove*.65-.15*(.5+.5*Math.sin(u*19+.3*Math.sin(v*3)));
  }
  const h=(x:number,y:number)=>heights[((y+size)%size)*size+(x+size)%size];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,shade=Math.round(220+35*h(x,y));
    albedo.set([shade,shade,shade,255],i);
    const n=new THREE.Vector3((h(x-1,y)-h(x+1,y))*.45,(h(x,y-1)-h(x,y+1))*.45,1).normalize();
    normals.set([Math.round(n.x*127+128),Math.round(n.y*127+128),Math.round(n.z*127+128),255],i);
  }
  const texture=(data:Uint8Array,srgb=false)=>{
    const t=r.own(new THREE.DataTexture(data,size,size));t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;
    t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.needsUpdate=true;return t;
  };
  return {map:texture(albedo,true),normalMap:texture(normals)};
}

/** Cylindrical local coordinates; seam unwrapped per triangle, 2 m vertical repeat. */
export function barkUV(geometry:THREE.BufferGeometry,bark:boolean){
  const p=geometry.attributes.position,uv=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i+=3){
    const us=[0,1,2].map(k=>Math.atan2(p.getZ(i+k),p.getX(i+k))/(Math.PI*2)+.5);
    if(Math.max(...us)-Math.min(...us)>.5)for(let k=0;k<3;k++)if(us[k]<.5)us[k]++;
    for(let k=0;k<3;k++){uv[(i+k)*2]=bark?us[k]:.96;uv[(i+k)*2+1]=bark?p.getY(i+k)/2:.96;}
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
}

/** Compose once with the crown-occlusion hook; no separate pass or tree material split. */
export function configureForestBark(material:THREE.MeshStandardMaterial,surface:ReturnType<typeof createBarkSurface>,fade=false){
  material.map=surface.map;material.normalMap=surface.normalMap;
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float barkWeight; varying float vBarkWeight;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBarkWeight=barkWeight;');
    shader.fragmentShader='varying float vBarkWeight;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','if(vBarkWeight>.5){\n'+THREE.ShaderChunk.map_fragment+'\n}');
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','if(vBarkWeight>.5){\n#include <normal_fragment_maps>\n}');
    if(fade)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nif(vBarkWeight>.5) diffuseColor.a=1.;');
  };
  material.customProgramCacheKey=()=>`how-bark-v1-${fade}`;
}
