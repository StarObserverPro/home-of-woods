import * as THREE from 'three';
import { WILDLIFE, WILDLIFE_DEFINITIONS } from '../content/wildlife.ts';
import type { WildlifeDefinitionId } from '../content/wildlife.ts';
import type { WildlifeView } from '../domain/wildlife.ts';
import { wildlifeDay } from '../domain/wildlife.ts';
import type { Models } from './models.ts';
import type { Resources } from './resources.ts';
import {createFoxExpression} from './fox-expression.ts';
import type {FoxReviewPose} from './fox-expression.ts';

type Clip = 'idle'|'walk'|'run'|'survey';
type Instance = {
  root:THREE.Group; model:THREE.Group; mixer:THREE.AnimationMixer;
  actions:Record<Clip,THREE.AnimationAction>; clip:Clip;
  materials:THREE.Material[]; skeletons:THREE.Skeleton[]; meshes:THREE.Mesh[];
  head:THREE.Object3D|null; bones:number; expression:ReturnType<typeof createFoxExpression>|null;
};
/** Presentation owns no spawn decisions, terrain, clocks, interaction targets or inventory. */
export function createWildlifePresentation(resources:Resources, models:Models) {
  const group=new THREE.Group();group.name='wildlife';
  const instances=new Map<string,Instance>();
  const available=WILDLIFE_DEFINITIONS.filter(d=>models.templates.has(d.model) &&
    (d.id==='wildlife.fox'?['idle','walk','run']:['idle','walk']).every(name=>models.animations.get(d.model)?.some(a=>a.name===name))&&
    (d.id!=='wildlife.fox'||['Head','Lids'].every(name=>models.templates.get(d.model)?.getObjectByName(name)))).map(d=>d.id);
  const projected=new THREE.Vector3(), observed=new Set<string>();
  let inFrame=0,destroyed=false,lastTime:number|null=null,created=0,released=0;
  function remove(id:string){
    const i=instances.get(id);if(!i)return;
    i.expression?.dispose();i.mixer.stopAllAction();i.mixer.uncacheRoot(i.model);
    i.root.removeFromParent();i.root.clear();
    i.skeletons.forEach(s=>resources.releaseOwned(s));
    i.materials.forEach(m=>resources.releaseOwned(m));
    instances.delete(id);released++;observed.delete(id);
  }
  function add(view:WildlifeView){
    const d=WILDLIFE_DEFINITIONS.find(d=>d.id===view.definitionId)!;
    const root=new THREE.Group(),model=models.clone(d.model);
    model.scale.setScalar(d.visualScale);
    root.name=view.id;root.userData.targetRef=view.targetRef;root.rotation.y=view.facing;root.add(model);
    const materials=new Map<THREE.Material,THREE.Material>(),skeletons=new Set<THREE.Skeleton>(),meshes:THREE.Mesh[]=[];
    let head:THREE.Object3D|null=null,bones=0;
    model.traverse(object=>{
      if (object instanceof THREE.SkinnedMesh){skeletons.add(object.skeleton);bones=Math.max(bones,object.skeleton.bones.length);object.frustumCulled=false;}
      if (object.name.toLowerCase()==='head' && !head) head=object;
      if(object instanceof THREE.Mesh){
        meshes.push(object);
        const use=(source:THREE.Material)=>{if(!materials.has(source))materials.set(source,resources.own(source.clone()));return materials.get(source)!;};
        object.material=Array.isArray(object.material)?object.material.map(use):use(object.material);
      }
    });
    const mixer=new THREE.AnimationMixer(model),clips=models.animations.get(d.model)!;
    const get=(name:string)=>mixer.clipAction(clips.find(c=>c.name===name)!);
    const idle=get('idle'),walk=get('walk'),run=clips.some(c=>c.name==='run')?get('run'):walk,survey=clips.some(c=>c.name==='survey')?get('survey'):idle;
    idle.play();
    const expression=d.id==='wildlife.fox'?createFoxExpression(model,root,[...materials.values()],view.id):null;
    instances.set(view.id,{root,model,mixer,actions:{idle,walk,run,survey},clip:'idle',materials:[...materials.values()],skeletons:[...skeletons],meshes,head,bones,expression});
    group.add(root);created++;
  }
  return {
    group,
    available:()=>[...available] as WildlifeDefinitionId[],
    /** A frame-late camera observation, consumed by domain on the next fixed step. */
    observedIds:()=>[...observed],
    update(views:readonly WildlifeView[],time:number,hour:number,camera:THREE.Camera,reducedMotion:boolean,player?:THREE.Vector3,inspection?:FoxReviewPose){
      if(destroyed)return;
      const dt=lastTime===null?0:Math.max(0,Math.min(.1,time-lastTime));lastTime=time;
      inFrame=0;observed.clear();
      const ids=new Set(views.map(v=>v.id));
      for(const id of [...instances.keys()])if(!ids.has(id))remove(id);
      for(const v of views){
        if(!available.includes(v.definitionId))continue;
        if(!instances.has(v.id))add(v);
        const i=instances.get(v.id)!,d=WILDLIFE_DEFINITIONS.find(d=>d.id===v.definitionId)!;
        const landmark=d.category==='landmark',review=v.id==='wildlife:inspect:wildlife.fox'?inspection:undefined;
        i.root.position.set(v.x,v.y,v.z);
        if(i.expression&&!review&&!reducedMotion){
          const turn=Math.atan2(Math.sin(v.facing-i.root.rotation.y),Math.cos(v.facing-i.root.rotation.y));
          i.root.rotation.y+=turn*(1-Math.exp(-(v.behavior==='flee'?16:7)*dt));
        }else i.root.rotation.y=v.facing;
        i.root.visible=wildlifeDay(hour)&&v.opacity>.001&&i.root.position.distanceTo(camera.position)<WILDLIFE.landmarkMaxCameraDistance;
        projected.set(v.x,v.y+(landmark?2.2:.55),v.z).project(camera);
        if(i.root.visible&&Math.abs(projected.x)<.93&&Math.abs(projected.y)<.92&&projected.z>-1&&projected.z<1){inFrame++;if(landmark)observed.add(v.id);}
        const clip:Clip=review?.motion??(v.motionTag==='wildlife.move'?(i.expression&&v.behavior==='flee'?'run':'walk'):v.motionTag==='wildlife.survey'?'survey':'idle');
        i.expression?.beforeAnimation();
        if(clip!==i.clip){
          if(i.actions[i.clip]!==i.actions[clip]){i.actions[i.clip].fadeOut(.18);i.actions[clip].reset().fadeIn(.18).play();}
          i.clip=clip;
        }
        // The rebuilt mountain goat already has 21 articulated joints and authored
        // weight-shift, front-hoof lift, head survey and two-step gait. Do not add
        // procedural torso bounce or duplicate head rotations on top of its clip.
        const rate=clip==='walk'?(d.id==='wildlife.goat'?1:Math.max(.60,Math.min(1.7,v.speed/(d.id==='wildlife.fox'?.9:landmark?.85:1.1)))):
          clip==='run'?Math.max(.8,Math.min(1.4,v.speed/d.fleeSpeed)):1;
        if(review){
          // Fixed diagnostic samples are exact poses, not a second running clock.
          i.mixer.stopAllAction();i.actions[clip].reset().setEffectiveWeight(1).play();i.mixer.setTime(review.seconds);
        }else i.mixer.update(dt*rate);
        // Stag uses its own 38-bone survey and wide-stride clips.
        if(reducedMotion&&clip==='idle'){i.actions.idle.time=0;i.mixer.update(0);}
        i.expression?.update(v,time,dt,reducedMotion,player,review);
        const fading=v.opacity<.999;
        for(const material of i.materials){
          if(material.transparent!==fading){material.transparent=fading;material.depthWrite=!fading;material.needsUpdate=true;}
          material.opacity=v.opacity;
        }
        for(const mesh of i.meshes)mesh.castShadow=!fading&&!landmark&&i.root.position.distanceTo(camera.position)<60;
      }
    },
    stats:()=>({active:instances.size,inFrame,observed:[...observed],visible:[...instances.values()].filter(i=>i.root.visible).length,
      created,released,available:[...available],bones:[...instances.values()].reduce((sum,i)=>sum+i.bones,0),
      ids:[...instances.keys()],expressions:[...instances].filter(([,i])=>i.expression).map(([id,i])=>({id,clip:i.clip,...i.expression!.stats()})),destroyed}),
    dispose(){if(destroyed)return;destroyed=true;inFrame=0;observed.clear();for(const id of [...instances.keys()])remove(id);group.clear();group.removeFromParent();},
  };
}
