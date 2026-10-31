import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createTree} from './tree.js';
import {createActor} from './actor.js';
import {createWorld} from './world.js';
import {DURATIONS,phase,ramp} from './motion.js';
import './style.css';

const $=id=>document.getElementById(id),viewport=$('viewport');
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;viewport.append(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color('#dce4ce');scene.fog=new T.Fog('#dce4ce',28,65);
scene.add(new T.HemisphereLight('#fff8df','#738364',2.3));const sun=new T.DirectionalLight('#fff1ce',3.4);sun.position.set(-4,10,7);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:.1,far:35});sun.shadow.normalBias=.025;scene.add(sun);
const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#c6d1b8',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.65;floor.receiveShadow=true;scene.add(floor);
const camera=new T.PerspectiveCamera(37,1,.05,120),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minDistance=2;controls.maxDistance=23;controls.maxPolarAngle=Math.PI*.49;controls.target.set(1,2,0);
let action='fell',time=0,playing=true,speed=1,species='broadleaf',slope=0,direction=0,reduced=false,anchors=false,view='wide',autoCamera=true,destroyed=false,frame=0,last=0;
const rig=new T.Group();scene.add(rig);
const source=new Map(),loader=new GLTFLoader();let actor,tree,world;
function size(){const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(autoCamera)setCamera();}
const observer=new ResizeObserver(size);observer.observe(viewport);
function setCamera(){
  if(!actor)return;const mobile=camera.aspect<.85;
  let target,position;
  if(view==='cut'){target=new T.Vector3(.3,.9,0);position=new T.Vector3(-3.1,2.6,3.3);}
  else if(action==='fell'){
    target=new T.Vector3(1.5,view==='close'?1.05:2.25,0);position=view==='close'?new T.Vector3(-3.5,3.4,6):new T.Vector3(7,6.6,13);
  }else if(action==='climb'){
    const pull=reduced?0:ramp(time,2.4,3.5)*(1-ramp(time,6.2,7.3));target=new T.Vector3(0,1.3+pull*1.5,0);position=new T.Vector3(6+pull*3,3+pull*3.5,3+pull*6);if(view==='wide'){position.multiplyScalar(1.15);}
  }else if(action==='gather'){const orbit=ramp(time,.15,1.05);const a=-.7+orbit*(Math.PI+.45);target=new T.Vector3(0,.78,.35);position=new T.Vector3(Math.sin(a)*4.8,2.9,-Math.cos(a)*4.8);
  }else{target=new T.Vector3(0,.85,.3);position=view==='close'?new T.Vector3(2.7,2,-3):new T.Vector3(3.7,3,-4.3);}
  if(action==='fell'||action==='climb'){target.applyAxisAngle(new T.Vector3(0,1,0),direction);position.applyAxisAngle(new T.Vector3(0,1,0),direction);}
  if(action==='fell'&&!reduced&&time>4.15&&time<4.55){const age=time-4.15;position.y+=Math.sin(age*55)*.045*Math.exp(-age*10);}
  if(mobile&&view==='wide')position.sub(target).multiplyScalar(1.28).add(target);
  camera.position.copy(position);controls.target.copy(target);controls.update();
}
controls.addEventListener('start',()=>{autoCamera=false;});
function rebuild(){tree?.dispose();tree=createTree(source.get(species).scene,species);tree.setSlope(slope*Math.cos(direction),slope*Math.sin(direction));rig.add(tree.root);}
function render(){
  if(!actor||destroyed)return;
  const activeDirection=(action==='fell'||action==='climb')?direction:0;rig.rotation.y=activeDirection;rig.updateMatrixWorld(true);
  tree.root.visible=action==='fell'||action==='climb';tree.update(time,action,reduced,anchors);actor.update(action,time,{radius:tree.radius,slope:slope*Math.cos(activeDirection),crossSlope:slope*Math.sin(activeDirection)});world.update(action,time,slope,reduced,tree.radius,activeDirection,actor.bones.handslotr.getWorldPosition(new T.Vector3()));
  if(autoCamera)setCamera();controls.update();renderer.render(scene,camera);
  const [title,caption]=phase(action,time);$('phase').textContent=title;$('caption').textContent=caption+(anchors?' 蓝：树根 · 橙：断裂支点 · 黄：倒木参考中心':'');$('time').textContent=`${time.toFixed(2)} / ${DURATIONS[action].toFixed(2)} s`;$('timeline').value=time;
  $('play').setAttribute('aria-label',playing?'暂停':'播放');
  $('stats').textContent=`${renderer.info.render.calls} 次绘制 · ${(renderer.info.render.triangles/1000).toFixed(1)}k 三角形`;
}
function select(next){action=next;time=0;playing=true;autoCamera=true;view='wide';$('timeline').max=DURATIONS[action];$('play').textContent='暂停';document.querySelectorAll('[data-action]').forEach(b=>b.classList.toggle('active',b.dataset.action===action));$('cut').disabled=action!=='fell';render();}
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>select(b.dataset.action));
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'暂停':'播放';};
$('replay').onclick=()=>{time=0;playing=true;$('play').textContent='暂停';autoCamera=true;render();};
$('timeline').oninput=e=>{time=Number(e.target.value);playing=false;$('play').textContent='播放';render();};
$('speed').onchange=e=>speed=Number(e.target.value);$('species').onchange=e=>{species=e.target.value;rebuild();time=0;render();};$('slope').onchange=e=>{slope=Number(e.target.value);tree.setSlope(slope*Math.cos(direction),slope*Math.sin(direction));render();};
$('direction').onchange=e=>{direction=Number(e.target.value);tree.setSlope(slope*Math.cos(direction),slope*Math.sin(direction));time=0;autoCamera=true;render();};
$('anchors').onchange=e=>{anchors=e.target.checked;render();};$('reduced').onchange=e=>{reduced=e.target.checked;render();};
for(const id of ['wide','close','cut'])$(id).onclick=()=>{view=id;autoCamera=true;render();};
$('capture').onclick=()=>{render();const a=document.createElement('a');a.href=renderer.domElement.toDataURL('image/png');a.download=`action-lab-${action}-${species}-${time.toFixed(2)}.png`;a.click();};
document.addEventListener('visibilitychange',()=>{last=0;});
function tick(now){if(destroyed)return;frame=requestAnimationFrame(tick);const dt=last?Math.min((now-last)/1000,.05):0;last=now;if(playing&&!document.hidden){time+=dt*speed;if(time>DURATIONS[action]){if($('loop').checked)time=0;else{time=DURATIONS[action];playing=false;$('play').textContent='播放';}}}render();}
function dispose(){if(destroyed)return;destroyed=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();actor?.dispose();tree?.dispose();world?.dispose();const geometries=new Set(),materials=new Set(),textures=new Set();source.forEach(g=>g.scene.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}}}));geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());floor.geometry.dispose();floor.material.dispose();sun.shadow.dispose();renderer.dispose();}
window.addEventListener('pagehide',dispose,{once:true});
try{
  await Promise.all(['player','motions','pine','broadleaf','mushrooms'].map(async key=>{source.set(key,await loader.loadAsync(globalThis.__LAB_ASSETS__?.[key]??`./assets/${key}.glb`));}));
  actor=createActor(source.get('player').scene,source.get('motions').animations);rig.add(actor.root);rebuild();world=createWorld(scene,source.get('mushrooms').scene);size();render();frame=requestAnimationFrame(tick);
  // Read-only diagnostics plus deterministic sampling, confined to this sandbox.
  window.actionLab={sample(a,t,options={}){if(a!==action)select(a);playing=false;$('play').textContent='播放';time=t;if(options.species&&options.species!==species){species=options.species;$('species').value=species;rebuild();}if(options.slope!=null){slope=options.slope;$('slope').value=slope;tree.setSlope(slope*Math.cos(direction),slope*Math.sin(direction));}if(options.direction!=null){direction=options.direction;$('direction').value=direction;tree.setSlope(slope*Math.cos(direction),slope*Math.sin(direction));}view=options.view??'wide';autoCamera=true;render();return this.stats();},stats(){return {action,time,species,slope,direction,view,tree:tree.stats(),render:{...renderer.info.render},memory:{...renderer.info.memory},destroyed};},dispose};
}catch(error){$('phase').textContent='场景未能载入';$('caption').textContent=String(error);console.error(error);dispose();}
