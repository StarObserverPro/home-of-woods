import * as THREE from 'three';
import type {Resources} from './resources.ts';

export function buildFlameGeometry(){
  const sectors=12,levels=9,p:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let y=0;y<=levels;y++){
    const t=y/levels,radius=Math.max(.015,Math.sin(Math.PI*(.12+.88*t))**.8)*(.56-.31*t);
    for(let j=0;j<=sectors;j++){const a=j/sectors*Math.PI*2,bend=Math.sin(t*2.5)*t*.31;p.push(Math.cos(a)*radius+bend,t*1.8,Math.sin(a)*radius*.8);uv.push(j/sectors,t);}
  }
  for(let y=0;y<levels;y++)for(let j=0;j<sectors;j++){const a=y*(sectors+1)+j,b=a+1,c=a+sectors+1,d=c+1;indices.push(a,c,b,b,c,d);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();return g;
}

/** Curved volumetric tongues, an incandescent core and a local halo; no full-screen bloom pass. */
export function createFlames(r:Resources){
  const group=new THREE.Group();group.name='r5b-luminous-translucent-flames';
  const geometry=r.geometry('r5b-curved-flame',buildFlameGeometry);
  const vertexShader=`uniform float fireTime;varying vec2 vUv;varying float vPhase;
    void main(){vUv=uv;vec3 p=position;float phase=instanceMatrix[3].x*7.1+instanceMatrix[3].z*11.3;vPhase=phase;
    p.x+=sin(fireTime*4.2+phase+p.y*2.6)*.15*pow(uv.y,1.4);p.z+=cos(fireTime*3.6+phase+p.y*2.)*.10*uv.y*uv.y;
    p.y*=1.+sin(fireTime*5.1+phase)*.09;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p,1.);}`;
  const material=(core:boolean)=>r.own(new THREE.ShaderMaterial({
    name:core?'r5b-incandescent-core':'r5b-transparent-amber-shell',transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:core?THREE.AdditiveBlending:THREE.NormalBlending,
    uniforms:{fireTime:{value:0},core:{value:core?1:0}},vertexShader,
    fragmentShader:`uniform float fireTime,core;varying vec2 vUv;varying float vPhase;
      void main(){float t=vUv.y;float rib=.82+.18*sin(vUv.x*18.85+vPhase+t*6.-fireTime*4.);float fade=smoothstep(0.,.12,t)*(1.-smoothstep(.68,1.,t));
      float alpha=fade*mix(.25,.34,core)*rib;vec3 amber=mix(vec3(1.65,.19,.018),vec3(2.1,.72,.085),1.-t);
      vec3 light=mix(amber,vec3(2.6,1.45,.32),core);gl_FragColor=vec4(light,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  }));
  const outerMaterial=material(false),coreMaterial=material(true);
  const outer=new THREE.InstancedMesh(geometry,outerMaterial,8),core=new THREE.InstancedMesh(geometry,coreMaterial,5),dummy=new THREE.Object3D();
  outer.name='eight-curved-outer-tongues';core.name='five-bright-inner-tongues';outer.renderOrder=21;core.renderOrder=20;
  for(const [mesh,count,inner] of [[outer,8,false],[core,5,true]] as const)for(let i=0;i<count;i++){
    const a=i/count*Math.PI*2,radius=inner?.10:.36;dummy.position.set(Math.cos(a)*radius,.24,Math.sin(a)*radius);
    dummy.rotation.set(0,a+.45,Math.sin(a)*.13);dummy.scale.set(inner?.28:.66,(inner?.34:.68)+(i%3)*(inner?.065:.11),inner?.28:.66);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  }
  outer.computeBoundingSphere();core.computeBoundingSphere();group.add(core,outer);
  const haloMaterial=r.own(new THREE.ShaderMaterial({name:'r5b-local-fire-halo',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{strength:{value:.11}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;vec4 center=modelViewMatrix*vec4(0.,1.25,0.,1.);center.xy+=position.xy*3.4;gl_Position=projectionMatrix*center;}`,
    fragmentShader:`varying vec2 vUv;uniform float strength;void main(){float d=length((vUv-.5)*2.);float a=exp(-d*d*4.)*(1.-smoothstep(.3,1.,d))*strength;gl_FragColor=vec4(1.,.34,.035,a);}`,
  }));
  const halo=new THREE.Mesh(r.geometry('r5b-fire-halo-quad',()=>new THREE.PlaneGeometry(1,1)),haloMaterial);halo.frustumCulled=false;halo.renderOrder=19;group.add(halo);
  let visualTime=0;
  return {group,update(time:number,night:number,reduced:boolean,burning:boolean){if(!reduced)visualTime=time;group.visible=burning;outerMaterial.uniforms.fireTime.value=coreMaterial.uniforms.fireTime.value=visualTime;haloMaterial.uniforms.strength.value=.065+night*.16;},
    stats:()=>({tongues:13,triangles:13*geometry.index!.count/3,drawCalls:3,translucent:true,localHalo:true,visualTime}),
  };
}
