import * as T from 'three';
import {ramp,CUT,clamp} from './motion.js';
export function createWorld(scene,mushroomSource){
  const group=new T.Group();scene.add(group);const owned=new Set(),mats={};
  const mat=c=>mats[c]??(mats[c]=new T.MeshStandardMaterial({color:c,roughness:.88,flatShading:true}));
  function mesh(g,c,parent=group){owned.add(g);const o=new T.Mesh(g,mat(c));o.castShadow=o.receiveShadow=true;parent.add(o);return o;}
  const ground=mesh(new T.CylinderGeometry(8.8,9,.35,80),'#a9bc8d');ground.position.set(1.2,-.19,0);
  const pad=mesh(new T.CircleGeometry(4.9,64),'#c5c89d');pad.rotation.x=-Math.PI/2;pad.position.set(.6,.004,0);
  const decor=new T.Group();group.add(decor);
  for(let i=0;i<30;i++){const a=i*2.39996,r=5.7+(i%4)*.55;const stone=mesh(new T.IcosahedronGeometry(.15+(i%3)*.09,0),i%3===0?'#879783':'#788c62',decor);stone.position.set(1.2+Math.cos(a)*r,.04,Math.sin(a)*r);stone.scale.y=.6;stone.rotation.y=a;}
  const mushrooms=new T.Group();group.add(mushrooms);
  for(let i=0;i<3;i++){const m=mushroomSource.clone(true);m.scale.setScalar(.28);m.position.set((i-1)*.42,0,-.05+(i%2)*.12);m.traverse(o=>{if(o.isMesh)o.castShadow=true;});mushrooms.add(m);}
  const scraps=new T.Group();group.add(scraps);
  for(let i=0;i<5;i++){const o=mesh(new T.CylinderGeometry(i===0?.04:.023,i===0?.055:.038,i===0?.55:.29+(i%3)*.08,5),'#92704a',scraps);o.rotation.set(0,i*.7,Math.PI/2);o.position.set(.375+(i?-.32+i*.06:0),.07+(i%2)*.025,.225+(i?-.2+i*.04:0));o.userData.rest=o.position.clone();}
  const altar=new T.Group();group.add(altar);
  const base=mesh(new T.CylinderGeometry(.68,.85,.24,8),'#8d9d91',altar);base.position.y=.12;
  const top=mesh(new T.CylinderGeometry(.48,.59,.28,8),'#a9b7a4',altar);top.position.y=.36;
  const crystal=mesh(new T.OctahedronGeometry(.24,0),'#a9d5ab',altar);crystal.position.y=1.08;const cm=crystal.material.clone();cm.emissive=new T.Color('#8dcc91');crystal.material=cm;owned.add(cm);
  const haloMat=new T.MeshBasicMaterial({color:'#f6e6ae',transparent:true,opacity:.5,side:T.DoubleSide});owned.add(haloMat);
  const halo=mesh(new T.TorusGeometry(.48,.012,5,48),'#d7d2a4',altar);halo.material=haloMat;halo.rotation.x=Math.PI/2;halo.position.y=.95;
  const particles=new T.Group();group.add(particles);
  for(let i=0;i<32;i++){const o=mesh(new T.BoxGeometry(.06+(i%4)*.013,.025,.055),i%3===0?'#d8b079':'#71905b',particles);o.userData.i=i;}
  const glows=new T.Group();altar.add(glows);for(let i=0;i<12;i++){const o=mesh(new T.OctahedronGeometry(.025,0),'#f5dda4',glows);o.userData.i=i;}
  function update(action,t,slope,reduced,radius=.5,direction=0,pickupHand=null){
    group.rotation.set(0,direction,0);ground.position.y=-.19+slope*Math.cos(direction)*1.2;pad.position.y=.004+slope*Math.cos(direction)*.6;const tilt=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(-slope*Math.cos(direction),1,-slope*Math.sin(direction)).normalize());for(const o of [ground,pad,decor]){o.quaternion.copy(tilt);if(o===pad)o.rotateX(-Math.PI/2);} // Stage slope agrees with tree contact equation at x=0.
    // Interactive objects are independently grounded; decorative platter follows the same plane.
    mushrooms.rotation.z=0;altar.rotation.z=0;
    scraps.visible=action==='pickup';scraps.children.forEach((o,i)=>{o.position.copy(o.userData.rest);o.position.y+=slope*o.position.x;o.visible=true;if(i===0&&t>=1.15&&pickupHand){group.updateMatrixWorld(true);o.position.copy(group.worldToLocal(pickupHand.clone()));o.visible=t<2.85;}});
    mushrooms.visible=action==='gather';altar.visible=action==='pray';
    mushrooms.children.forEach((o,i)=>o.scale.setScalar(.28*(1-.25*ramp(t,1.7+i*.5,2+i*.5))));
    const light=ramp(t,1.7,2.6)*(1-ramp(t,3.8,4.8));cm.emissiveIntensity=light*.8;
    crystal.rotation.y=reduced?0:t*.35;crystal.position.y=1.08+(reduced?0:Math.sin(t*2)*.035);halo.scale.setScalar(1+light*.16);haloMat.opacity=.2+light*.55;
    glows.visible=!reduced&&light>0;glows.children.forEach((o,i)=>{const a=i*2.4+t*.7;o.position.set(Math.cos(a)*(.35+i%3*.12),.75+(i/12+ t*.25)%1,Math.sin(a)*(.35+i%3*.12));o.scale.setScalar(light);});
    const hitAge=t-(t>=1.49?1.49:.55),chipping=action==='fell'&&t<2.1&&hitAge>=0&&hitAge<.48;
    particles.visible=!reduced&&(chipping||(action==='fell'&&t>CUT.impact&&t<CUT.impact+1)||(action==='climb'&&t>3&&t<5.7));
    const age=chipping?hitAge:action==='fell'?t-CUT.impact:t-3;
    particles.children.forEach((o,i)=>{const a=i*2.4,k=i%7*.13;let x,y,z;if(chipping){x=radius+age*(1+k);y=CUT.height+age*(1+k)-4*age*age;z=.12+Math.sin(a)*age*1.8;o.material=mat('#d8b079');}else if(action==='fell'){x=3.4+Math.cos(a)*age*2;y=Math.max(.04,(1+k)*age-2.8*age*age);z=Math.sin(a)*age*2;o.material=mat(i%3===0?'#d8b079':'#71905b');}else{x=Math.cos(a)*(1+age*.14);z=Math.sin(a)*1.4;y=Math.max(.04,3.2+k-age*(.7+k));o.material=mat('#71905b');}y+=slope*(Math.cos(direction)*x+Math.sin(direction)*z);o.position.set(x,y,z);o.rotation.set(age*3+i,age*5,age*2);o.scale.setScalar(chipping?.7*(1-age/.48):action==='fell'?Math.max(0,1-age):.9);});
  }
  return {group,update,dispose(){owned.forEach(g=>g.dispose());Object.values(mats).forEach(m=>m.dispose());group.removeFromParent();}};
}
