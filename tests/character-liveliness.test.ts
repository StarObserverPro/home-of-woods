import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCharacterLiveliness,characterBlinkAt,characterMotionSeed} from '../src/scene/character-liveliness.ts';
import {CHARACTER_MOTION} from '../src/content/character-motion.ts';
import {createCharacters} from '../src/scene/characters.ts';
import {createJ01Player} from '../src/scene/j01-player.ts';
import {createVillagers} from '../src/scene/villagers.ts';
import {createBroomPresentation} from '../src/scene/broom-presentation.ts';
import {createLifePresentation} from '../src/scene/life-presentation.ts';
import {createState,createStarterState} from '../src/domain/state.ts';
import {useBroom} from '../src/domain/broom.ts';
import {diningReadingSpot} from '../src/domain/housing.ts';
import {BROOM,CAMP_LEAF_PATCHES} from '../src/content/broom.ts';
import {VISUAL_DAY_SECONDS} from '../src/content/scene-props.ts';
import {HOME} from '../src/content/world.ts';
import {characterModels} from './glb-fixtures.ts';

function simpleRig(native=false){
  const root=new THREE.Group(),bones=new Map<string,THREE.Bone>();
  const names:Record<string,string>={hips:'Pelvis',spine:'spine_01',chest:'spine_02',
    upperarml:'upperarm_l',lowerarml:'lowerarm_l',handl:'hand_l',upperarmr:'upperarm_r',lowerarmr:'lowerarm_r',handr:'hand_r',
    upperlegl:'thigh_l',lowerlegl:'calf_l',footl:'foot_l',upperlegr:'thigh_r',lowerlegr:'calf_r',footr:'foot_r'};
  function bone(name:string,parent:THREE.Object3D,x:number,y:number,z=0){
    const node=new THREE.Bone();node.name=native?(names[name]??name):name;node.position.set(x,y,z);parent.add(node);bones.set(name,node);return node;
  }
  const hips=bone('hips',root,0,1),spine=bone('spine',hips,0,.2),chest=bone('chest',spine,0,.2),head=bone('head',chest,0,.25);
  for(const side of ['l','r'] as const){
    const sign=side==='l'?1:-1,upper=bone('upperarm'+side,chest,sign*.2,.1),lower=bone('lowerarm'+side,upper,sign*.1,-.26);
    const hand=bone('hand'+side,lower,sign*.08,-.22);bone('middle_01_'+side,hand,0,-.08);
    const thigh=bone('upperleg'+side,hips,sign*.14,-.08),calf=bone('lowerleg'+side,thigh,0,-.43);bone('foot'+side,calf,0,-.4,.07);
  }
  root.updateMatrixWorld(true);return {root,bones,head};
}
const pose=(root:THREE.Object3D)=>{
  const result:unknown[]=[];
  root.traverse(node=>result.push([node.name,node.position.toArray(),node.quaternion.toArray(),node.scale.toArray()]));return result;
};
const feet=(rig:ReturnType<typeof simpleRig>)=>['footl','footr'].map(name=>rig.bones.get(name)!.getWorldPosition(new THREE.Vector3()).toArray());

test('seeded human blinks fully close, hold open, replay exactly and do not synchronize actors',()=>{
  const a=characterMotionSeed('player'),b=characterMotionSeed('camp-visitor'),first:number[]=[],second:number[]=[];
  for(let index=0;index<3600;index++){
    const t=index/120,value=characterBlinkAt(t,a);assert.ok(value>=0&&value<=1);assert.equal(value,characterBlinkAt(t,a));
    first.push(value);second.push(characterBlinkAt(t,b));
  }
  assert.ok(first.includes(1));assert.ok(first.filter(value=>value===0).length>first.length*.9);assert.notDeepEqual(first,second);
  assert.equal(characterBlinkAt(NaN,a),characterBlinkAt(0,a));
});

test('upper-body overlay stays bounded, feet/root stay fixed, and unchanged mixer tracks never accumulate',()=>{
  const rig=simpleRig(),motion=createCharacterLiveliness(rig.root,{id:'stable-actor'});
  const clip=new THREE.AnimationClip('constant',2,[new THREE.QuaternionKeyframeTrack('head.quaternion',[0,2],[0,0,0,1,0,0,0,1])]);
  const mixer=new THREE.AnimationMixer(rig.root);mixer.clipAction(clip).play();
  const rootPosition=rig.root.position.toArray(),grounded=feet(rig),neutral=pose(rig.root);
  let sawGesture=false;
  for(let frame=0;frame<120*20;frame++){
    const time=frame/20;motion.beforeAnimation();mixer.update(0);motion.update(time,false,true);
    const stats=motion.stats();
    assert.ok(Math.abs(stats.chestPitch)<=CHARACTER_MOTION.breathing.pitch+CHARACTER_MOTION.sway.pitch+1e-10);
    assert.ok(Math.abs(stats.swayRoll)<=CHARACTER_MOTION.sway.roll+1e-10);
    assert.deepEqual(rig.root.position.toArray(),rootPosition);assert.deepEqual(feet(rig),grounded);
    if(stats.gestureWeight>.9){
      sawGesture=true;const sampled=pose(rig.root),detail=motion.stats();
      for(let repeat=0;repeat<5;repeat++){motion.beforeAnimation();mixer.update(0);motion.update(time,false,true);}
      assert.deepEqual(pose(rig.root),sampled,'repeated paused samples are bit-for-bit stable');assert.deepEqual(motion.stats(),detail);
    }
  }
  assert.ok(sawGesture,'the admitted upper-arm/forearm/hand chain performs occasional gestures');
  motion.dispose();motion.dispose();assert.deepEqual(pose(rig.root),neutral);mixer.stopAllAction();mixer.uncacheRoot(rig.root);
});

test('sampling is frame-rate independent and action, hands-busy and reduced-motion priorities restore authored poses',()=>{
  const a=simpleRig(),b=simpleRig(),ma=createCharacterLiveliness(a.root,{id:'same'}),mb=createCharacterLiveliness(b.root,{id:'same'});
  const neutral=pose(a.root);
  for(let i=0;i<=15*12;i++){ma.beforeAnimation();ma.update(i/15,false,true);}
  for(let i=0;i<=120*12;i++){mb.beforeAnimation();mb.update(i/120,false,true);}
  assert.deepEqual(pose(a.root),pose(b.root));assert.deepEqual(ma.stats(),mb.stats());
  for(let time=13;time<80;time+=.1){
    ma.beforeAnimation();ma.update(time,false,true,false);
    assert.equal(ma.stats().gesture,'none');assert.equal(ma.stats().suppressed,'hands-busy');
    assert.deepEqual(a.bones.get('upperarml')!.quaternion.toArray(),[0,0,0,1]);
  }
  ma.beforeAnimation();ma.update(81,false,false);assert.deepEqual(pose(a.root),neutral);assert.equal(ma.stats().suppressed,'action-or-locomotion');
  ma.beforeAnimation();ma.update(82,true,true);assert.deepEqual(pose(a.root),neutral);assert.equal(ma.stats().blink,0);
  assert.equal(ma.stats().suppressed,'reduced-motion');ma.dispose();mb.dispose();
});

test('real KayKit player shares idle in camp and cabin, freezes paused, yields to tools/carry and keeps skin soles grounded',async()=>{
  const {resources,models}=await characterModels(),characters=createCharacters(resources,models,[],new Map()),state=createState([]);
  const tick=(time:number,reduced=false,holding=false)=>{characters.update(state,reduced,time);characters.present(time,reduced,holding);};
  try{
    tick(0);const soles=characters.footContacts().filter(foot=>foot.id.startsWith('player:')).map(foot=>foot.position.toArray());
    tick(3);const idle=pose(characters.player),info=characters.stats().liveliness.player;
    assert.ok(info.idleWeight>.9);assert.deepEqual(info.eyeSupport,{blink:'none',gaze:'none'});assert.equal(info.blink,0);
    for(let i=0;i<20;i++)tick(3);
    assert.deepEqual(pose(characters.player),idle);assert.deepEqual(characters.stats().liveliness.player,info);
    assert.deepEqual(characters.footContacts().filter(foot=>foot.id.startsWith('player:')).map(foot=>foot.position.toArray()),soles);
    state.inventory.stacks=[{itemId:'branch',qualityId:'common',quantity:1,transport:{kind:'carried'}}];
    tick(4);assert.equal(characters.stats().liveliness.player.suppressed,'hands-busy');assert.equal(characters.stats().liveliness.player.gesture,'none');
    state.inventory.stacks=[];tick(5,false,true);assert.equal(characters.stats().liveliness.player.idleWeight,0);
    state.player.moving=true;tick(6);assert.equal(characters.stats().liveliness.player.idleWeight,0);
    state.player.moving=false;characters.setInspection('horizontal');tick(7);assert.equal(characters.stats().liveliness.player.gesture,'none');
    assert.equal(characters.stats().liveliness.player.idleWeight,0);characters.setInspection(null);
    characters.updateInCabin(state,{x:0,z:0,facing:.3,moving:false},0,false,0);
    characters.updateInCabin(state,{x:0,z:0,facing:.3,moving:false},0,false,3);
    assert.ok(characters.stats().liveliness.player.idleWeight>.9);const cabin=pose(characters.player);
    characters.updateInCabin(state,{x:0,z:0,facing:.3,moving:false},0,false,3);assert.deepEqual(pose(characters.player),cabin);
    tick(9,true);assert.equal(characters.stats().liveliness.player.idleWeight,0);
  }finally{characters.dispose();resources.dispose();}
});

test('native J01 bone names and existing blink atlas are wired through the shared layer (synthetic export fixture)',async()=>{
  const {resources,models}=await characterModels(),rig=simpleRig(true);
  const open=resources.own(new THREE.Texture()),closed=resources.own(new THREE.Texture());
  function part(name:string,map?:THREE.Texture){
    const group=new THREE.Group();group.userData.j01Part=name;
    const geometry=resources.own(new THREE.BoxGeometry(.1,.1,.1));
    if(name==='face'){
      const target=geometry.getAttribute('position').clone();target.name='blink';geometry.morphAttributes.position=[target];
    }
    const mesh=new THREE.Mesh(geometry,resources.own(new THREE.MeshStandardMaterial(map?{map}:{})));group.add(mesh);rig.root.add(group);return mesh;
  }
  part('face',open);part('blink-atlas',closed);part('shirt-indigo');part('trousers');
  rig.root.userData.j01WalkDuration=.7;rig.root.userData.j01IdleTime=.8;
  const clip=new THREE.AnimationClip('native-fixture',1,[new THREE.QuaternionKeyframeTrack('spine_02.quaternion',[0,1],[0,0,0,1,0,0,0,1])]);
  models.templates.set('j01',rig.root);models.animations.set('j01',[clip]);
  const player=new THREE.Group(),driver=models.clone('ranger');player.add(driver);
  const native=createJ01Player(resources,models,player,[driver]);assert.ok(native);
  const actor=native.root.children[0],face=actor.children.find(child=>child.userData.j01Part==='face')!.children[0] as THREE.Mesh;
  const original=pose(native.root);let blinked=false;
  try{
    for(let i=0;i<600;i++){
      native.present(driver,null,true,i/60,false,false,false);
      const stats=native.stats().liveliness;
      assert.equal(stats.eyeSupport.blink,'atlas+morph');assert.equal(stats.bones.arms,2);
      if(stats.blink>=.5){assert.equal((face.material as THREE.MeshStandardMaterial).map,closed);assert.equal(face.morphTargetInfluences![0],stats.blink);blinked=true;}
    }
    assert.ok(blinked);assert.notDeepEqual(pose(native.root),original);
    const paused=pose(native.root),stats=native.stats();
    for(let i=0;i<20;i++)native.present(driver,null,true,599/60,false,false,false);
    assert.deepEqual(pose(native.root),paused);assert.deepEqual(native.stats(),stats);
    native.present(driver,null,true,10,true,false,false);assert.equal((face.material as THREE.MeshStandardMaterial).map,open);
    assert.equal(native.stats().liveliness.idleWeight,0);assert.equal(native.stats().liveliness.blink,0);
  }finally{native.dispose();resources.dispose();}
});

test('final presentation yields to actual broom and meal hand contacts after leaving idle',async()=>{
  const {resources,models}=await characterModels(),actors=createCharacters(resources,models,[],new Map()),state=createStarterState([]);
  const broom=createBroomPresentation(resources,actors.player),life=createLifePresentation(resources,actors.player),patch=CAMP_LEAF_PATCHES[1];
  const body=actors.player.children[0],hands=()=>['l','r'].map(side=>body.getObjectByName('handslot'+side)!.getWorldPosition(new THREE.Vector3()).toArray());
  state.player={...patch.stand,moving:false};
  state.inventory.instances!.push({instanceId:'liveliness-broom',definitionId:BROOM.definitionId,blueprintId:BROOM.blueprintId,createdAt:0,
    location:{kind:'inventory'},rarityId:'common',traits:[{id:BROOM.markTraitId,value:1,markId:'leaf',category:'utility'}]});
  try{
    actors.update(state,false,0);actors.present(0,false,false);actors.update(state,false,2);actors.present(2,false,false);
    assert.ok(actors.stats().liveliness.player.idleWeight>.9);
    const use=useBroom(state,'liveliness-broom',patch.id,[]);assert.ok(use.event);assert.equal(broom.present(use.event),true);
    for(let frame=0;frame<25;frame++){
      const time=3+frame*.1;broom.restorePose();actors.update(state,false,time);broom.update(state,.1,false);
      const contact=hands();actors.present(time,false,!!broom.action());
      assert.deepEqual(hands(),contact,'the final overlay cannot displace the broom solver');assert.equal(actors.stats().liveliness.player.idleWeight,0);
    }
    broom.cancel();broom.restorePose();
    const spot=diningReadingSpot();state.player={...spot.stand,facing:spot.seat.facing,moving:false};actors.setReading(true,spot.seat);life.presentMeal('soup');
    for(let frame=0;frame<25;frame++){
      const time=7+frame*.1;life.restorePose();actors.update(state,false,time);life.update(state,.1,false);
      const contact=hands();actors.present(time,false,life.isMealPlaying());
      assert.deepEqual(hands(),contact,'the final overlay cannot displace the bowl solver');assert.equal(actors.stats().liveliness.player.gesture,'none');
    }
  }finally{life.dispose();broom.dispose();actors.dispose();resources.dispose();}
});

test('local villagers keep the existing route/idle contract and consume unscaled scene seconds (synthetic export fixture)',async()=>{
  const {resources,models}=await characterModels(),rig=simpleRig(true),id='villager-j01';
  Object.assign(rig.root.userData,{np120WalkDuration:.7,np120IdleTime:.8,np120Stride:.7});
  const clip=new THREE.AnimationClip('villager-fixture',1,[new THREE.QuaternionKeyframeTrack('spine_02.quaternion',[0,1],[0,0,0,1,0,0,0,1])]);
  models.templates.set(id,rig.root);models.animations.set(id,[clip]);
  const view=createVillagers(models,()=>[]),state=createState([]);state.player.x=HOME.x;state.player.z=HOME.z;
  const visitStart=(15.25-14)/24*VISUAL_DAY_SECONDS;let parkedAt:number|null=null;
  try{
    assert.deepEqual(view.stats().available,[id]);
    for(let elapsed=0;elapsed<27;elapsed+=.2){
      state.time=visitStart+elapsed;view.update(state,false,elapsed);
      if(view.stats().model===id&&!view.stats().moving){parkedAt=elapsed;break;}
    }
    assert.notEqual(parkedAt,null,'the admitted fixture reaches the existing stop');
    const root=view.group.getObjectByName(id)!,legs=['foot_l','foot_r'].map(name=>root.getObjectByName(name)!);
    const feetBefore=legs.map(bone=>bone.getWorldPosition(new THREE.Vector3()).toArray());
    view.update(state,false,parkedAt!+2);assert.ok(view.stats().liveliness!.idleWeight>.9);
    const idle=pose(view.group),stats=view.stats();
    for(let repeat=0;repeat<20;repeat++)view.update(state,false,parkedAt!+2);
    assert.deepEqual(pose(view.group),idle);assert.deepEqual(view.stats(),stats);
    assert.deepEqual(legs.map(bone=>bone.getWorldPosition(new THREE.Vector3()).toArray()),feetBefore);
    view.update(state,true,parkedAt!+3);assert.equal(view.stats().liveliness!.idleWeight,0);
    state.time=visitStart;view.update(state,false,parkedAt!+4);assert.equal(view.stats().moving,true);
    assert.equal(view.stats().liveliness!.gesture,'none');assert.equal(view.stats().liveliness!.idleWeight,0);
  }finally{view.dispose();resources.dispose();}
});
