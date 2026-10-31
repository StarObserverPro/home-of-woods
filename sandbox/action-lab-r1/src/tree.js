import * as T from 'three';
import {CUT,clamp,fallProgress,ramp} from './motion.js';

// Clip actual source triangles; upper tree keeps its original silhouette and materials.
export function clipAbove(source,y){
  const g=source.index?source.toNonIndexed():source.clone(),p=g.attributes.position,n=g.attributes.normal,out=[],norm=[];
  for(let i=0;i<p.count;i+=3){
    let poly=[0,1,2].map(k=>({p:new T.Vector3().fromBufferAttribute(p,i+k),n:new T.Vector3().fromBufferAttribute(n,i+k)})),next=[];
    for(let k=0;k<poly.length;k++){
      const a=poly[k],b=poly[(k+1)%poly.length],ina=a.p.y>=y,inb=b.p.y>=y;
      if(ina)next.push(a);
      if(ina!==inb){const f=(y-a.p.y)/(b.p.y-a.p.y);next.push({p:a.p.clone().lerp(b.p,f),n:a.n.clone().lerp(b.n,f).normalize()});}
    }
    for(let k=1;k<next.length-1;k++)for(const v of [next[0],next[k],next[k+1]]){out.push(...v.p);norm.push(...v.n);}
  }
  g.dispose();const result=new T.BufferGeometry();result.setAttribute('position',new T.Float32BufferAttribute(out,3));result.setAttribute('normal',new T.Float32BufferAttribute(norm,3));return result;
}

function surfaceGeometry(rings,cap=false){
  const positions=[],ids=[];for(const ring of rings)for(const v of ring)positions.push(...v);
  const N=rings[0].length;
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<N;i++){const a=j*N+i,b=j*N+(i+1)%N,c=b+N,d=a+N;ids.push(a,d,b,b,d,c);}
  if(cap){const center=new T.Vector3();rings.at(-1).forEach(v=>center.add(v));center.divideScalar(N);const ci=positions.length/3;positions.push(...center);for(let i=0;i<N;i++)ids.push(ci,(rings.length-1)*N+(i+1)%N,(rings.length-1)*N+i);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(ids);g.computeVertexNormals();return g;
}
export function createTree(source,kind){
  const root=new T.Group(),upper=new T.Group(),crown=new T.Group(),stump=new T.Group(),fibers=new T.Group();root.add(stump,upper);upper.add(crown);root.add(fibers);
  const owned=new Set(),material=(color)=>{const m=new T.MeshStandardMaterial({color,roughness:.82,flatShading:true,side:T.DoubleSide});owned.add(m);return m;};
  const wood=material('#d9ad70'),heart=material('#c19456'),bark=material(kind==='pine'?'#82634a':'#8c7053');
  function add(g,m,parent){owned.add(g);const o=new T.Mesh(g,m);o.castShadow=o.receiveShadow=true;parent.add(o);return o;}
  source=source.clone(true);source.scale.multiplyScalar(.74);source.updateMatrixWorld(true);let trunk;
  source.traverse(o=>{if(o.isMesh&&/trunk/.test(o.name))trunk=o;});
  bark.color.copy(trunk.material.color);bark.roughness=trunk.material.roughness;
  const original=trunk.geometry.clone().applyMatrix4(trunk.matrixWorld);original.computeBoundingBox();
  const radius=(kind==='pine'?.25:.28);
  // Cross-section ray samples retain the source trunk outline at the join (no floating sleeve).
  const section=[];const p=original.attributes.position,idx=original.index;
  for(let i=0;i<(idx?idx.count:p.count);i+=3){const vv=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,idx?idx.getX(i+k):i+k));for(let k=0;k<3;k++){const a=vv[k],b=vv[(k+1)%3];if((a.y<=CUT.join&&b.y>CUT.join)||(b.y<=CUT.join&&a.y>CUT.join))section.push(a.clone().lerp(b,(CUT.join-a.y)/(b.y-a.y)));}}
  section.sort((a,b)=>Math.atan2(a.z,a.x)-Math.atan2(b.z,b.x));
  const clean=section.filter((v,i)=>i===0||v.distanceTo(section[i-1])>1e-5);
  const radialScale=radius*.96/(clean.reduce((sum,v)=>sum+Math.hypot(v.x,v.z),0)/clean.length);
  original.scale(radialScale,1,radialScale);clean.forEach(v=>{v.x*=radialScale;v.z*=radialScale;});
  const N=clean.length;
  const ring=(h,mul=1)=>clean.map((v,i)=>{const a=Math.atan2(v.z,v.x),r=radius*mul*(1+.065*Math.sin(a*3+.4)+.025*Math.sin(a*7));return new T.Vector3(Math.cos(a)*r,h,Math.sin(a)*r*.94);});
  const cutY=x=>CUT.height-.11*ramp(x/radius,.2,.95);
  const seamLower=ring(CUT.height).map(v=>v.setY(cutY(v.x))),seamUpper=ring(CUT.height).map(v=>v.setY(CUT.height+.11*ramp(v.x/radius,.2,.95)));
  add(surfaceGeometry([ring(-.12,1.65),ring(.06,1.45),ring(.24,1.12),ring(.5,1.02),seamLower]),bark,stump);
  const cap=(seam,parent,flip=false)=>{
    const rings=[.02,.28,.52,.76,.93,1].map(scale=>seam.map(v=>new T.Vector3(v.x*scale,flip?CUT.height+.11*ramp(v.x*scale/radius,.2,.95):cutY(v.x*scale),v.z*scale)));
    for(let j=0;j<rings.length-1;j++)add(surfaceGeometry([rings[j],rings[j+1]]),j===4?bark:j===3?wood:heart,parent);
  };
  cap(seamLower,stump);cap(seamUpper,upper,true);
  add(surfaceGeometry([seamUpper,ring(1.18,.96),clean]),bark,upper);
  const retained=clipAbove(original,CUT.join);original.dispose();add(retained,trunk.material,upper);
  const leafMeshes=[];
  source.traverse(o=>{if(!o.isMesh||o===trunk)return;const c=o.clone();c.geometry=o.geometry;c.material=o.material;c.matrix.copy(o.matrixWorld);c.matrix.decompose(c.position,c.quaternion,c.scale);c.position.x*=radialScale;c.position.z*=radialScale;c.scale.x*=radialScale;c.scale.z*=radialScale;c.castShadow=c.receiveShadow=true;if(/crown|tier/.test(o.name)){c.geometry=o.geometry.clone();owned.add(c.geometry);leafMeshes.push({mesh:c,positions:c.geometry.attributes.position.array.slice()});crown.add(c);}else upper.add(c);});
  // Fine eccentric rings follow the cut plane; rough fibres only occupy the hinge band.
  for(const [parent,flip] of [[stump,false],[upper,true]])for(const scale of [.25,.46,.67,.84]){
    const pts=Array.from({length:65},(_,i)=>{const a=i*Math.PI*2/64,r=radius*scale*(1+.035*Math.sin(a*3));const x=Math.cos(a)*r-.012*(1-scale);return new T.Vector3(x,(flip?CUT.height+.11*ramp(x/radius,.2,.95):cutY(x))+(flip?-.003:.003),Math.sin(a)*r*.94);});
    const g=new T.BufferGeometry().setFromPoints(pts),m=new T.LineBasicMaterial({color:'#ad834f',transparent:true,opacity:.45});owned.add(g);owned.add(m);parent.add(new T.Line(g,m));
  }
  for(let i=0;i<13;i++){
    const z=(i-6)*radius*.115,x=radius*(.12+.065*Math.sin(i*2.7)),h=.035+.055*(.5+.5*Math.sin(i*4.1));
    const splinter=add(new T.CylinderGeometry(.007,.014,h,3),i%3?wood:heart,stump);splinter.position.set(x,cutY(x)+h*.38,z);splinter.rotation.z=-.12;
    const mate=add(new T.CylinderGeometry(.009,.005,h*.6,3),wood,upper);mate.position.set(x,CUT.height-h*.23,z);
  }
  const pivot=new T.Vector3(radius*.18,CUT.height,0);
  for(let i=0;i<6;i++){const f=add(new T.CylinderGeometry(.012,.025,1,4),wood,fibers);f.userData.z=(i-2.5)*radius*.22;}
  const collar=add(surfaceGeometry([ring(CUT.height-.13,1.008),ring(CUT.height+.15,1.008)]),bark,root);
  const marks=new T.Group();root.add(marks);const mark=(pos,color)=>{const o=add(new T.SphereGeometry(.065,10,8),material(color),marks);o.position.copy(pos);return o;};mark(new T.Vector3(0,0,0),'#398ed3');mark(pivot,'#e76d39');const centerMark=mark(new T.Vector3(0,3.4,0),'#f2d044');
  const samples=[];upper.updateMatrixWorld(true);upper.traverse(o=>{if(o.isMesh&&o.parent!==crown){const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++)samples.push(new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld));}});
  let slope=0,crossSlope=0,landing=1.5,landShift=new T.Vector3();
  function solveLanding(){
    // After fibers part, the cut end and woody branches are supports on the same ground plane.
    // Solve their common contact angle; do not leave the log hinged to the stump forever.
    const support=angle=>{const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,-1),angle);let base=Infinity,canopy=Infinity,min=Infinity;for(const v of samples){const w=v.clone().sub(pivot).applyQuaternion(q).add(pivot),d=w.y-slope*w.x-crossSlope*w.z;min=Math.min(min,d);if(v.y<1.25)base=Math.min(base,d);if(v.y>1.25)canopy=Math.min(canopy,d);}return {base,canopy,min};};
    let lo=.15,hi=1.72;for(let i=0;i<32;i++){const mid=(lo+hi)/2,s=support(mid);if(s.canopy>s.base)lo=mid;else hi=mid;}landing=lo;
    const dx=radius*2.15+.22;landShift.set(dx,-support(landing).min+slope*dx+.008,0);
  }
  solveLanding();let lastAngle=0;
  function update(t,action,reduced,showAnchors){
    const active=action==='fell';const progress=active?fallProgress(t):0;
    let angle=landing*progress;
    if(active&&t<CUT.fallStart&&!reduced){const age=t-(t>=1.49?1.49:.55);if(age>=0)angle+=Math.sin(age*22)*.012*Math.exp(-age*7);}
    if(active&&t>=CUT.impact&&!reduced)angle-=Math.sin(Math.min(1,(t-CUT.impact)/.38)*Math.PI)*.006*Math.exp(-(t-CUT.impact)*5);
    const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,-1),angle);upper.quaternion.copy(q);upper.position.copy(pivot).sub(pivot.clone().applyQuaternion(q));
    const free=ramp(progress,.35,1);upper.position.addScaledVector(landShift,free);lastAngle=angle;
    collar.visible=!active||t<.75;marks.visible=showAnchors;centerMark.position.set(0,3.4,0).applyQuaternion(q).add(upper.position);
    const shake=action==='climb'&&!reduced?(Math.sin(t*12)*.035+Math.sin(t*19)*.012)*ramp(t,2.7,3.2)*(1-ramp(t,4.7,5.5)):active&&!reduced&&t>CUT.impact?Math.sin((t-CUT.impact)*14)*.05*Math.exp(-(t-CUT.impact)*3):0;
    crown.rotation.z=shake;crown.rotation.x=shake*.4;
    root.updateMatrixWorld(true);
    // Foliage is soft. Flatten only leaf vertices below the shared ground, not wood or the whole tree.
    // Original arrays are immutable so scrubbing and replays cannot accumulate deformation.
    const point=new T.Vector3(),inverse=new T.Matrix4();
    for(const {mesh,positions} of leafMeshes){const a=mesh.geometry.attributes.position;inverse.copy(mesh.matrixWorld).invert();for(let i=0;i<a.count;i++){point.fromArray(positions,i*3);if(active&&progress>0){point.applyMatrix4(mesh.matrixWorld);root.worldToLocal(point);point.y=Math.max(point.y,slope*point.x+crossSlope*point.z+.025);root.localToWorld(point);point.applyMatrix4(inverse);}a.setXYZ(i,point.x,point.y,point.z);}a.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();}
    fibers.visible=active&&t>1.65&&progress<.12;
    fibers.children.forEach(f=>{const a=new T.Vector3(pivot.x,CUT.height,f.userData.z),b=a.clone().add(new T.Vector3(-.08,.07,0)).sub(pivot).applyQuaternion(q).add(pivot);f.position.copy(a).add(b).multiplyScalar(.5);f.scale.y=Math.max(.03,a.distanceTo(b));f.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.sub(a).normalize());});
  }
  return {root,upper,crown,radius,pivot,update,setSlope(v,z=0){slope=v;crossSlope=z;solveLanding();},stats:()=>({radius,landingAngle:landing,angle:lastAngle,landingShift:landShift.toArray(),join:CUT.join,cut:CUT.height,retainedVertices:retained.attributes.position.count}),dispose(){root.removeFromParent();owned.forEach(o=>o.dispose());}};
}
