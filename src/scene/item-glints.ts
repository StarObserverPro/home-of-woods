import * as THREE from 'three';
import type { Resources } from './resources.ts';
import { ITEM_VFX, ITEM_VFX_LIGHT } from '../content/item-vfx.ts';
import type { EffectRarity } from '../content/item-vfx.ts';

/** Stratified area samples on real triangles, never a bounding-box badge floating above the item. */
export function sampleGlintSurface(geometry: THREE.BufferGeometry, count: number): THREE.BufferGeometry {
  const positions = geometry.getAttribute('position'), index = geometry.getIndex();
  const triangles: {a: THREE.Vector3;b: THREE.Vector3;c: THREE.Vector3;normal: THREE.Vector3;end: number}[] = [];
  let area = 0;
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!, span = bounds.getSize(new THREE.Vector3()).length();
  const n = index ? index.count : positions.count;
  for (let i = 0; i + 2 < n; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(positions,index ? index.getX(i) : i);
    const b = new THREE.Vector3().fromBufferAttribute(positions,index ? index.getX(i+1) : i+1);
    const c = new THREE.Vector3().fromBufferAttribute(positions,index ? index.getX(i+2) : i+2);
    const cross = b.clone().sub(a).cross(c.clone().sub(a));
    const size = cross.length() / 2;
    if (size < 1e-9 || cross.y / (size*2) < -.55) continue;
    area += size;triangles.push({a,b,c,normal:cross.normalize(),end:area});
  }
  const p: number[] = [], normals: number[] = [], phases: number[] = [];
  for (let i=0; i<count && triangles.length; i++) {
    const pick = (i+.5) / count * area, tri = triangles.find(t=>t.end>=pick)!;
    const u = Math.sqrt(.16 + .68 * ((i * .61803398875) % 1));
    const v = .12 + .76 * ((i * .754877666 + .37) % 1);
    const point = tri.a.clone().multiplyScalar(1-u).addScaledVector(tri.b,u*(1-v)).addScaledVector(tri.c,u*v);
    point.addScaledVector(tri.normal, Math.max(.003,span*.009));
    p.push(...point.toArray());normals.push(...tri.normal.toArray());phases.push(i*2.3999632297);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  out.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  out.setAttribute('phase',new THREE.Float32BufferAttribute(phases,1));
  out.computeBoundingSphere();
  return out;
}

export function createGlintFactory(resources: Resources, time: {value:number}, night: {value:number}) {
  const materials = new Map<EffectRarity,THREE.ShaderMaterial>();
  const viewport = new THREE.Vector4();
  return {
    create(mesh: THREE.Mesh, rarity: EffectRarity) {
      const spec = ITEM_VFX[rarity];
      const geometry = resources.geometry(`item-glints:${mesh.geometry.uuid}:${spec.glints}`,()=>sampleGlintSurface(mesh.geometry,spec.glints));
      let material = materials.get(rarity);
      if (!material) {
        material = resources.own(new THREE.ShaderMaterial({
          name:`rarity-${rarity}-surface-glints`,transparent:true,depthTest:true,depthWrite:false,
          blending:THREE.AdditiveBlending,toneMapped:false,
          uniforms:{uTime:time,uNight:night,uLight:{value:new THREE.Vector2(ITEM_VFX_LIGHT[rarity].day,ITEM_VFX_LIGHT[rarity].night)},uTint:{value:new THREE.Color(spec.tint)},uHeight:{value:600},uDiameter:{value:spec.diameter},uMinPixels:{value:spec.minPixels},uMaxPixels:{value:spec.maxPixels}},
          vertexShader:`
            attribute float phase;
            uniform float uTime,uHeight,uDiameter,uMinPixels,uMaxPixels;
            varying float vTwinkle,vPhase,vVisible;
            void main(){
              vec4 p = modelViewMatrix * vec4(position,1.0);
              vec3 n = normalize(normalMatrix * normal);
              vVisible = smoothstep(-0.03,0.3,dot(n,normalize(-p.xyz))) * (1.0-smoothstep(145.0,185.0,-p.z));
              vPhase = phase + uTime*.14;
              vTwinkle = .10 + .90 * pow(.5+.5*sin(uTime*1.8+phase),3.0);
              float worldScale = length(modelMatrix[0].xyz);
              float diameter = uDiameter*worldScale*.5*uHeight*projectionMatrix[1][1]/max(1.0,-p.z);
              gl_PointSize = clamp(diameter,uMinPixels,uMaxPixels);
              gl_Position = projectionMatrix * p;
            }`,
          fragmentShader:`
            uniform vec3 uTint;
            uniform float uNight; uniform vec2 uLight;
            varying float vTwinkle,vPhase,vVisible;
            void main(){
              vec2 p = gl_PointCoord*2.0-1.0;
              float c=cos(vPhase),s=sin(vPhase);
              p = mat2(c,-s,s,c)*p;
              float r=length(p);
              float softness=1.0-smoothstep(.70,1.0,r);
              float halo=exp(-r*r*6.5)*.30;
              float star=max(exp(-abs(p.x)*46.0)*pow(max(0.0,1.0-abs(p.y)),1.6),exp(-abs(p.y)*46.0)*pow(max(0.0,1.0-abs(p.x)),1.6));
              float core=exp(-r*r*180.0);
              float alpha=(halo+star*.82+core*.55)*vTwinkle*vVisible*softness;
              if(alpha<.002)discard;
              vec3 color=mix(uTint,vec3(1.0,.97,.92),clamp(star*1.8+core,0.0,1.0));
              gl_FragColor=vec4(color,alpha*mix(uLight.x,uLight.y,uNight));
              #include <colorspace_fragment>
            }`,
        }));
        materials.set(rarity,material);
      }
      const points = new THREE.Points(geometry,material);
      points.name=`rarity-glints:${rarity}`;
      points.raycast=()=>{};
      points.castShadow=points.receiveShadow=false;
      points.onBeforeRender=(renderer)=>{
        renderer.getCurrentViewport(viewport);
        material!.uniforms.uHeight.value=viewport.w;
        material!.uniformsNeedUpdate=true;
      };
      return points;
    },
    stats:()=>({glintMaterials:materials.size}),
    clear(){materials.clear();},
  };
}
