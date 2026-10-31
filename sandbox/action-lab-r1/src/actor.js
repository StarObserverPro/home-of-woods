import * as T from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {ramp,clamp,CUT} from './motion.js';

const v=(x,y,z)=>new T.Vector3(x,y,z);
// Small contact solver shared by hands and feet. Targets are actor-local, never gameplay positions.
export function solveChain(root,end,bones,target,iterations=12){
  const goal=root.localToWorld(target.clone());
  for(let step=0;step<iterations;step++)for(const bone of bones){
    root.updateMatrixWorld(true);const origin=bone.getWorldPosition(v(0,0,0)),a=end.getWorldPosition(v(0,0,0)).sub(origin),b=goal.clone().sub(origin);
    if(a.lengthSq()<1e-10||b.lengthSq()<1e-10)continue;
    const delta=new T.Quaternion().setFromUnitVectors(a.normalize(),b.normalize()),world=bone.getWorldQuaternion(new T.Quaternion());
    const parent=bone.parent.getWorldQuaternion(new T.Quaternion()).invert();bone.quaternion.copy(parent.multiply(delta.multiply(world)));
  }
  root.updateMatrixWorld(true);
}
export function createActor(model,motions){
  const root=new T.Group(),body=clone(model);root.add(body);root.scale.setScalar(1.5);
  const bones={};body.traverse(o=>{if(o.isBone)bones[o.name.replaceAll('.','')]=o;if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  const mixer=new T.AnimationMixer(body),idle=mixer.clipAction(motions.find(c=>c.name==='Idle_A'));idle.play();mixer.setTime(.01);
  const saved=[];body.traverse(o=>{if(o.isBone)saved.push([o,o.position.clone(),o.quaternion.clone(),o.scale.clone()]);});mixer.stopAllAction();
  const feet={l:root.worldToLocal(bones.footl.getWorldPosition(v(0,0,0))),r:root.worldToLocal(bones.footr.getWorldPosition(v(0,0,0)))};
  const footRotations=Object.fromEntries(['l','r'].map(s=>[s,root.getWorldQuaternion(new T.Quaternion()).invert().multiply(bones['foot'+s].getWorldQuaternion(new T.Quaternion()))]));
  const mat=(c)=>new T.MeshStandardMaterial({color:c,roughness:.65});const wood=mat('#805633'),metal=mat('#7d9297');
  const axe=new T.Group(),handle=new T.Mesh(new T.CylinderGeometry(.032,.04,.76,8),wood);handle.position.y=.29;axe.add(handle);
  const blade=new T.Mesh(new T.BoxGeometry(.28,.22,.075),metal);blade.position.set(.11,.61,0);axe.add(blade);axe.traverse(o=>{if(o.isMesh)o.castShadow=true;});root.add(axe);
  const hand=(side,target)=>solveChain(root,bones['handslot'+side],[bones['lowerarm'+side],bones['upperarm'+side]],target);
  const leg=(side,target)=>solveChain(root,bones['foot'+side],[bones['lowerleg'+side],bones['upperleg'+side]],target);
  function rest(){for(const [b,p,q,s]of saved){b.position.copy(p);b.quaternion.copy(q);b.scale.copy(s);}body.position.set(0,0,0);body.rotation.set(0,0,0);axe.visible=false;body.visible=true;root.updateMatrixWorld(true);}
  function update(action,t,{radius=.5,slope=0,crossSlope=0}={}){
    rest();root.position.set(0,0,0);root.rotation.set(0,0,0);
    if(action==='fell'){
      const retreat=ramp(t,1.75,2.6);root.position.set(radius+1.05,0,.75+retreat*.8);root.rotation.y=-Math.PI/2-.25;
      const stroke=t<.95?ramp(t,.1,.55)*(1-ramp(t,.62,.92)):ramp(t,1.0,1.49)*(1-ramp(t,1.65,2.15));
      axe.visible=t<2.4;
      const impactRotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(v(-1,0,0),v(0,0,1),v(0,1,0)));
      const contact=v(radius*.95,CUT.height+.03-slope*root.position.x,.12).sub(root.position).applyAxisAngle(v(0,1,0),-root.rotation.y).divideScalar(1.5);
      const impactPosition=contact.sub(v(.25,.61,0).applyQuaternion(impactRotation));
      axe.position.copy(impactPosition).add(v(-.12,.18,-.22).multiplyScalar(1-stroke));axe.quaternion.copy(impactRotation).multiply(new T.Quaternion().setFromAxisAngle(v(0,0,1),-1.1)).slerp(impactRotation,stroke);axe.updateMatrix();
      bones.chest.rotation.y+=.12-stroke*.22;bones.head.rotation.x+=.08;
      if(t<2.4){hand('r',v(0,.03,0).applyMatrix4(axe.matrix));hand('l',v(0,.25,0).applyMatrix4(axe.matrix));}
      if(retreat>0&&retreat<1){bones.upperlegl.rotation.x+=Math.sin(retreat*Math.PI*4)*.2;bones.upperlegr.rotation.x-=Math.sin(retreat*Math.PI*4)*.2;}
    }else if(action==='pickup'){
      root.position.set(0,0,1.05);root.rotation.y=Math.PI;
      const bend=ramp(t,.15,1)*(1-ramp(t,1.45,2.55));
      bones.hips.position.y-=.30*bend;bones.hips.position.z+=.16*bend;bones.chest.rotation.x+=1.05*bend;bones.head.rotation.x+=.15*bend;
      leg('l',feet.l);leg('r',feet.r);
      hand('l',v(.28,.65-.23*bend,.10+.20*bend));
      hand('r',v(-.25,.68-.61*bend,.12+.43*bend));
    }else if(action==='gather'){
      root.position.set(0,0,1.05);root.rotation.y=Math.PI;
      const crouch=ramp(t,.1,.9)*(1-ramp(t,3.65,4.65));bones.hips.position.y-=.22*crouch;bones.hips.position.z+=.16*crouch;bones.chest.rotation.x+=.65*crouch;bones.head.rotation.x+=.12*crouch;
      leg('l',feet.l);leg('r',feet.r);
      for(const s of ['l','r']){const foot=bones['foot'+s],desired=root.getWorldQuaternion(new T.Quaternion()).multiply(footRotations[s]);foot.quaternion.copy(foot.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(desired));}
      const reach=(a,b)=>ramp(t,a,a+.3)*(1-ramp(t,b,b+.32));const left=reach(1.05,1.75),right=reach(2.15,2.85);
      hand('l',v(.25,.73-.35*crouch-.18*left,.12+.30*crouch+.14*left));hand('r',v(-.25,.73-.35*crouch-.18*right,.12+.30*crouch+.14*right));
    }else if(action==='pray'){
      root.position.set(0,0,1.3);root.rotation.y=Math.PI;
      const fold=ramp(t,.15,1.1)*(1-ramp(t,3.75,4.65));bones.head.rotation.x+=.27*fold;bones.chest.rotation.x+=.06*fold;
      hand('l',v(.29*(1-fold)+.035*fold,.63+.28*fold,.07+.26*fold));hand('r',v(-.29*(1-fold)-.035*fold,.63+.28*fold,.07+.26*fold));
    }else{
      const hold=ramp(t,.15,1.05)*(1-ramp(t,6.6,7.5)),step=ramp(t,1.15,2.5),down=ramp(t,5.6,6.65);
      const intoLeaves=ramp(t,2.5,3.3)*1.5;
      root.position.set(0,(step*.66+intoLeaves)*(1-down),radius+.48);root.rotation.y=Math.PI;
      bones.hips.position.y-=.08*hold;bones.chest.rotation.x+=.18*hold;bones.head.rotation.x-=.13*hold;
      const gripY=.93+step*.13,gripZ=(radius+.48)/1.5-radius*.33;
      hand('l',v(.27+radius*.12*hold,.65*(1-hold)+gripY*hold,.10*(1-hold)+gripZ*hold));
      hand('r',v(-.27-radius*.12*hold,.65*(1-hold)+(gripY+.08)*hold,.10*(1-hold)+gripZ*hold));
      const plant=ramp(t,.55,1.25),push=ramp(t,1.35,2.15),follow=ramp(t,1.85,2.55);
      leg('l',feet.l.clone().add(v(-.055*hold,(.38*plant-.25*push)*hold,.15*hold)));leg('r',feet.r.clone().add(v(.055*hold,(.06+.32*follow)*hold,.12*hold)));
      bones['footl'].rotation.x-=.35*hold;bones['footr'].rotation.x-=.3*hold;
      // Keep the actual actor visible: the canopy supplies occlusion during the camera pullback.
    }
    root.position.y+=slope*root.position.x+crossSlope*root.position.z;
    root.updateMatrixWorld(true);
  }
  return {root,body,bones,axe,update,dispose(){mixer.uncacheRoot(body);const sk=new Set();body.traverse(o=>{if(o.isSkinnedMesh)sk.add(o.skeleton);});sk.forEach(s=>s.dispose());axe.traverse(o=>{if(o.isMesh)o.geometry.dispose();});wood.dispose();metal.dispose();root.removeFromParent();}};
}
