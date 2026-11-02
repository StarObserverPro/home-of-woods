import * as THREE from 'three';
import { WILDLIFE, WILDLIFE_DEFINITIONS } from '../content/wildlife.ts';
import type { WildlifeDefinitionId } from '../content/wildlife.ts';
import type { WildlifeView } from '../domain/wildlife.ts';
import { wildlifeDay } from '../domain/wildlife.ts';
import type { Models } from './models.ts';
import type { Resources } from './resources.ts';

type Clip = 'idle'|'walk'|'survey';
type Instance = {
  root:THREE.Group; model:THREE.Group; mixer:THREE.AnimationMixer;
  actions:Record<Clip,THREE.AnimationAction>; clip:Clip;
  materials:THREE.Material[]; skeletons:THREE.Skeleton[]; meshes:THREE.Mesh[];
  head:THREE.Object3D|null; bones:number;
};
/** Presentation owns no spawn decisions, terrain, clocks, interaction targets or inventory. */
export function createWildlifePresentation(resources:Resources, models:Models) {
  const group=new THREE.Group();group.name='wildlife';
  const instances=new Map<string,Instance>();
  const available=WILDLIFE_DEFINITIONS.filter(d=>models.templates.has(d.model) &&
    ['idle','walk'].every(name=>models.animations.get(d.model)?.some(a=>a.name===name))).map(d=>d.id);
  const projected=new THREE.Vector3(), observed=new Set<string>();
  let inFrame=0,destroyed=false,lastTime:number|null=null,created=0,released=0;
  function remove(id:string){
    const i=instances.get(id);if(!i)return;
    i.mixer.stopAllAction();i.mixer.uncacheRoot(i.model);
    i.root.removeFromParent();i.root.clear();
    i.skeletons.forEach(s=>resources.releaseOwned(s));
    i.materials.forEach(m=>resources.releaseOwned(m));
    instances.delete(id);released++;observed.delete(id);
  }
  function add(view:WildlifeView){
    const d=WILDLIFE_DEFINITIONS.find(d=>d.id===view.definitionId)!;
    const root=new THREE.Group(),model=models.clone(d.model);
    model.scale.setScalar(d.visualScale);
    root.name=view.id;root.userData.targetRef=view.targetRef;root.add(model);
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
    const idle=get('idle'),walk=get('walk'),survey=clips.some(c=>c.name==='survey')?get('survey'):idle;
    idle.play();
    instances.set(view.id,{root,model,mixer,actions:{idle,walk,survey},clip:'idle',materials:[...materials.values()],skeletons:[...skeletons],meshes,head,bones});
    group.add(root);created++;
  }
  return {
    group,
    available:()=>[...available] as WildlifeDefinitionId[],
    /** A frame-late camera observation, consumed by domain on the next fixed step. */
    observedIds:()=>[...observed],
    update(views:readonly WildlifeView[],time:number,hour:number,camera:THREE.Camera,reducedMotion:boolean){
      if(destroyed)return;
      const dt=lastTime===null?0:Math.max(0,Math.min(.1,time-lastTime));lastTime=time;
      inFrame=0;observed.clear();
      const ids=new Set(views.map(v=>v.id));
      for(const id of [...instances.keys()])if(!ids.has(id))remove(id);
      for(const v of views){
        if(!available.includes(v.definitionId))continue;
        if(!instances.has(v.id))add(v);
        const i=instances.get(v.id)!,d=WILDLIFE_DEFINITIONS.find(d=>d.id===v.definitionId)!;
        const landmark=d.category==='landmark';
        i.root.position.set(v.x,v.y,v.z);i.root.rotation.y=v.facing;
        i.root.visible=wildlifeDay(hour)&&v.opacity>.001&&i.root.position.distanceTo(camera.position)<WILDLIFE.landmarkMaxCameraDistance;
        projected.set(v.x,v.y+(landmark?2.2:.55),v.z).project(camera);
        if(i.root.visible&&Math.abs(projected.x)<.93&&Math.abs(projected.y)<.92&&projected.z>-1&&projected.z<1){inFrame++;if(landmark)observed.add(v.id);}
        const clip:Clip=v.motionTag==='wildlife.move'?'walk':v.motionTag==='wildlife.survey'?'survey':'idle';
        if(clip!==i.clip){
          if(i.actions[i.clip]!==i.actions[clip]){i.actions[i.clip].fadeOut(.18);i.actions[clip].reset().fadeIn(.18).play();}
          i.clip=clip;
        }
        const rate=clip==='walk'?Math.max(.60,Math.min(1.7,v.speed/(landmark?.85:1.1))):1;
        i.mixer.update(dt*rate);
        const active=time*1.4+v.revision*.25;
        // Goat uses its real leg rig for the short ledge step; add a restrained torso lift.
        i.model.position.y=landmark&&d.id==='wildlife.goat'&&clip==='walk'?.09*Math.abs(Math.sin(active*3.2)):0;
        if(landmark&&d.id==='wildlife.goat'&&i.head&&clip==='survey'&&!reducedMotion){i.head.rotation.x+=Math.sin(active*.7)*.14;i.head.rotation.y+=Math.sin(active*.48)*.1;}
        // Stag uses its native 38-bone survey and wide-stride clips, not tiny random twitching.
        if(reducedMotion&&clip==='idle'){i.actions.idle.time=0;i.mixer.update(0);}
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
      ids:[...instances.keys()],destroyed}),
    dispose(){if(destroyed)return;destroyed=true;inFrame=0;observed.clear();for(const id of [...instances.keys()])remove(id);group.clear();group.removeFromParent();},
  };
}
