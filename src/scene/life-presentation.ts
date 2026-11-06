import * as THREE from 'three';
import type {GameState} from '../domain/state.ts';
import type {Resources} from './resources.ts';
import {poseHandAt} from './seated-pose.ts';
import type {MealCommitted} from '../domain/food.ts';
import type {WhimsyMode} from '../content/whimsy-display.ts';
import type {RarityVfxMode} from '../content/item-vfx.ts';
import {createItemSurface} from './item-surface.ts';
import {itemProperties} from '../domain/item-properties.ts';

export type MealPresentationKind='soup'|'bread';
export const MEAL_PRESENTATION_SECONDS=3.6;

/** Local animation progress only. The domain has already consumed one real portion. */
export function mealPresentationAt(elapsed:number,reducedMotion=false){
  const progress=THREE.MathUtils.clamp(elapsed/MEAL_PRESENTATION_SECONDS,0,1);
  const lift=reducedMotion?.6:Math.sin(Math.PI*THREE.MathUtils.smoothstep(progress,.12,.88));
  return {progress,lift,done:progress>=1};
}

/**
 * One render adapter for the everyday bowl, bread and storybook. No item state,
 * gameplay clock, DOM listener or frame scheduler is owned here. Call
 * restorePose before characters.update, then update after it. Restoring the
 * previous overlay matters when the mixer skips identical paused samples.
 */
export function createLifePresentation(r:Resources,player:THREE.Group,options:{curtainTargets?:(event:MealCommitted,state:GameState)=>{pot:THREE.Object3D|null;spoon:THREE.Object3D|null}}={}){
  const surfaces=createItemSurface(r);
  const group=new THREE.Group();group.name='camp-life-held-props';player.add(group);
  const mesh=(key:string,make:()=>THREE.BufferGeometry,color:string)=>
    new THREE.Mesh(r.geometry('camp-life:'+key,make),r.material(color,.86));
  const bowl=new THREE.Group();bowl.name='meal-wooden-bowl';
  const bowlBody=mesh('bowl',()=>new THREE.CylinderGeometry(.24,.16,.15,10),'#b48754');
  const rim=mesh('bowl-rim',()=>new THREE.TorusGeometry(.24,.029,4,10),'#ead2a4');
  rim.rotation.x=Math.PI/2;rim.position.y=.083;
  const soup=mesh('soup',()=>new THREE.CircleGeometry(.214,10),'#cd9e59');
  soup.rotation.x=-Math.PI/2;soup.position.y=.082;
  bowl.add(bowlBody,rim,soup);group.add(bowl);
  bowl.scale.setScalar(.76);
  const bread=new THREE.Group();bread.name='meal-black-bread';
  const loaf=mesh('bread',()=>new THREE.SphereGeometry(.22,8,5),'#75523a');
  loaf.scale.set(1.25,.65,.76);
  const crumb=mesh('bread-cut',()=>new THREE.CircleGeometry(.13,7),'#d7ba80');
  crumb.position.set(0,.01,.165);bread.add(loaf,crumb);group.add(bread);
  bread.scale.setScalar(.70);
  const book=new THREE.Group();book.name='forest-storybook';
  const cover=mesh('book-cover',()=>new THREE.BoxGeometry(.48,.038,.27),'#5c7753');
  const pages=mesh('book-pages',()=>new THREE.BoxGeometry(.44,.025,.24),'#f0dfb8');
  pages.position.y=.028;
  const spine=mesh('book-spine',()=>new THREE.BoxGeometry(.026,.038,.25),'#b29762');
  spine.position.y=.04;book.add(cover,pages,spine);group.add(book);
  const turningPage=mesh('book-page-turn',()=>new THREE.BoxGeometry(.21,.008,.23),'#fcf0d1');
  const leaf=new THREE.Group();leaf.position.y=.05;turningPage.position.x=.105;leaf.add(turningPage);book.add(leaf);
  // Find the standard animation body, before the hidden procedural-action body.
  const body=player.children.find(child=>child!==group&&!!child.getObjectByName('hips'));
  const bones=new Map<string,THREE.Bone>();
  body?.traverse(node=>{if(node instanceof THREE.Bone)bones.set(node.name.replaceAll('.',''),node);});
  const overlay=new Map<THREE.Bone,THREE.Quaternion>();
  const objectOverlay=new Map<THREE.Object3D,{position:THREE.Vector3;quaternion:THREE.Quaternion}>(),seenMeals=new Set<string>();
  let reading=false,meal:MealPresentationKind|null=null,elapsed=0,readingTime=0,disposed=false,mealEvent:MealCommitted|null=null,whimsy:WhimsyMode='full',curtainPlaying=false;
  const turn=(id:string,axis:'x'|'y'|'z',angle:number)=>{
    const b=bones.get(id);if(!b)return;
    if(!overlay.has(b))overlay.set(b,b.quaternion.clone());
    b.rotation[axis]+=angle;
  };
  function handsTo(halfWidth:number,y:number,z:number,gripX:number,gripY:number,gripZ:number){
    for(const side of ['l','r'] as const){
      for(const name of ['upperarm','lowerarm','hand']){
        const bone=bones.get(name+side);if(bone&&!overlay.has(bone))overlay.set(bone,bone.quaternion.clone());
      }
      const sign=side==='l'?1:-1;
      poseHandAt(player,bones,side,new THREE.Vector3(sign*halfWidth,y,z),new THREE.Vector3(sign*gripX,gripY,gripZ));
    }
  }
  function restorePose(){
    for(const [bone,quaternion] of overlay)bone.quaternion.copy(quaternion);overlay.clear();
    for(const [object,pose] of objectOverlay){object.position.copy(pose.position);object.quaternion.copy(pose.quaternion);}objectOverlay.clear();
  }
  function cancelMeal(){restorePose();meal=null;mealEvent=null;curtainPlaying=false;surfaces.release(bowl);bowl.visible=bread.visible=false;}
  function remember(object:THREE.Object3D){if(!objectOverlay.has(object))objectOverlay.set(object,{position:object.position.clone(),quaternion:object.quaternion.clone()});}
  const left=new THREE.Vector3(),right=new THREE.Vector3(),handCenter=new THREE.Vector3();
  function hands(){
    const a=bones.get('handl'),b=bones.get('handr');
    if(a&&b){a.getWorldPosition(left);b.getWorldPosition(right);handCenter.copy(left).add(right).multiplyScalar(.5);player.worldToLocal(handCenter);}
    else handCenter.set(0,.55,.29);
    return handCenter;
  }
  function update(state:GameState,dt:number,reducedMotion:boolean,paused=false){
    if(disposed)return;
    restorePose();
    const step=paused?0:Math.max(0,Math.min(.1,dt));
    if(meal!==null)elapsed+=step;
    if(reading)readingTime+=step;
    surfaces.update(step,reducedMotion);
    const owner=mealEvent?.bowlId?state.inventory.instances?.find(item=>item.instanceId===mealEvent!.bowlId&&item.definitionId==='vessel.wooden-bowl'&&item.location.kind==='inventory'):null;
    if(mealEvent?.bowlId&&!owner){meal=null;mealEvent=null;surfaces.release(bowl);}
    const canCurtain=!!mealEvent?.curtain&&!!owner&&mealEvent.curtain.ownerId===owner.instanceId&&itemProperties(owner).traits.some(trait=>trait.id==='food.curtain-call'&&trait.value>0)&&whimsy!=='off'&&!reducedMotion;
    const curtainSeconds=Math.min(1.4,mealEvent?.curtain?.durationSeconds??0);
    curtainPlaying=!!meal&&elapsed>=MEAL_PRESENTATION_SECONDS&&canCurtain&&elapsed<MEAL_PRESENTATION_SECONDS+curtainSeconds;
    const pose=mealPresentationAt(elapsed,reducedMotion);if(curtainPlaying)pose.lift=0;
    if(meal&&pose.done&&!curtainPlaying){meal=null;mealEvent=null;surfaces.release(bowl);}
    bowl.visible=meal==='soup';bread.visible=meal==='bread';book.visible=reading&&meal===null;
    if(bowl.visible){bowl.userData.instanceId=owner?.instanceId??null;if(owner)surfaces.apply(bowl,owner);else surfaces.release(bowl);}
    // The pre-existing reading bowl is replaced by the book; food is only held
    // while the explicit, successful meal command is being presented.
    const oldBowl=player.getObjectByName('reading-bowl');if(oldBowl)oldBowl.visible=false;
    if(meal){
      const held=meal==='soup'?bowl:bread;
      handsTo(.28,.49+.08*pose.lift,.395+.02*pose.lift,.20,.47+.08*pose.lift,.50+.02*pose.lift);
      turn('head','x',-.04*pose.lift);
      held.position.copy(hands());held.position.y-=.025;held.position.z=Math.max(.55,held.position.z+(meal==='soup'?.155:.12));
      held.rotation.set(-.10*pose.lift,0,meal==='bread'?.12:0);
      if(curtainPlaying&&mealEvent){
        const progress=(elapsed-MEAL_PRESENTATION_SECONDS)/curtainSeconds,wave=Math.sin(Math.PI*progress),strength=whimsy==='simple'?.45:1;
        bowl.rotation.x+=wave*.10*strength;
        const targets=options.curtainTargets?.(mealEvent,state);
        if(targets?.pot){remember(targets.pot);targets.pot.rotation.x+=wave*.035*strength;}
        if(targets?.spoon){remember(targets.spoon);targets.spoon.position.y+=wave*.06*strength;}
      }
    }
    if(book.visible){
      handsTo(.31,.43,.38,.24,.405,.46);
      book.position.set(0,.41,.47);book.rotation.set(.25,0,0);
      // Infrequent page movement is purely ambient, including at a stopped hourglass.
      const page=reducedMotion?0:Math.max(0,Math.sin(readingTime*.42));
      leaf.rotation.z=page>.985?Math.PI*(page-.985)/.015:0;
    }
    group.updateMatrixWorld(true);
  }
  bowl.visible=bread.visible=book.visible=false;
  return {
    group,update,restorePose,
    presentMeal(kind:MealPresentationKind,event?:MealCommitted){if(disposed||event&&seenMeals.has(event.id))return false;restorePose();if(event)seenMeals.add(event.id);mealEvent=event?structuredClone(event):null;meal=kind;elapsed=0;return true;},
    setReading(value:boolean){reading=value;readingTime=0;},
    isMealPlaying:()=>meal!==null,
    cancelMeal,
    // A replaced world may legitimately commit the same sequence again. Merely
    // cancelling movement must keep the duplicate-pulse guard intact.
    resetPresentationHistory(){cancelMeal();elapsed=0;seenMeals.clear();},
    setWhimsyMode(mode:WhimsyMode){whimsy=mode;},setRarityVfxMode(mode:RarityVfxMode){surfaces.setMode(mode);},
    stats:()=>({reading,meal,elapsed,curtain:curtainPlaying,whimsy,owner:mealEvent?.bowlId??null,disposed,meshes:9}),
    dispose(){if(disposed)return;restorePose();surfaces.dispose();disposed=true;group.removeFromParent();group.clear();bones.clear();seenMeals.clear();},
  };
}
