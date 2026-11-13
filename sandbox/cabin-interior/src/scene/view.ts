import {createCabinOcclusion} from './occlusion.ts';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Resources} from '../../../../src/scene/resources.ts';
import {CABIN,ITEM_DEFINITIONS,definitionFor} from '../content.ts';
import type {CabinState,FloorLocation} from '../content.ts';
import {itemPose,approachPoint} from '../domain.ts';
import {createCabinShell,roofSurfaceAt} from './shell.ts';
import type {CutMode} from './shell.ts';
import {loadFurnitureAssets} from './furniture.ts';
import {createCabinCharacter} from './character.ts';

export type CameraView='room'|'opposite'|'plan'|'inside'|'detail';
export type ViewSettings={cut:CutMode;light:'day'|'evening';material:'normal'|'clay'|'wire';spaces:boolean;quality:'balanced'|'fine';occlusion?:boolean;};
export type PlacementPreview={id:string;location:FloorLocation;valid:boolean};
export type ViewCallbacks={pick:(id:string)=>void;floor:(x:number,z:number)=>void;hover:(x:number,z:number)=>void;};
export async function createCabinView(host:HTMLElement,callbacks:ViewCallbacks){
  const resources=new Resources();
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e8e4d9');
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.16;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.domElement.className='cabin-canvas';renderer.domElement.setAttribute('aria-label','可以旋转查看的木屋内部，点选物品或空地');renderer.domElement.tabIndex=0;host.append(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(38,1,.08,100);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.1;controls.minDistance=3.2;controls.maxDistance=30;controls.minPolarAngle=.001;controls.maxPolarAngle=Math.PI*.485;controls.enablePan=true;controls.maxTargetRadius=6;
  controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  const ambient=new THREE.HemisphereLight('#fff3d9','#8a8a74',2.1);scene.add(ambient);
  const sunlight=new THREE.DirectionalLight('#fff1d5',3.0);sunlight.position.set(-7,12,8);sunlight.castShadow=true;
  sunlight.shadow.mapSize.set(1024,1024);sunlight.shadow.camera.left=-9;sunlight.shadow.camera.right=9;sunlight.shadow.camera.top=9;sunlight.shadow.camera.bottom=-9;sunlight.shadow.camera.near=.5;sunlight.shadow.camera.far=35;sunlight.shadow.normalBias=.035;sunlight.shadow.bias=-.00008;scene.add(sunlight);
  const fill=new THREE.DirectionalLight('#d8e9e6',.8);fill.position.set(6,5,-4);scene.add(fill);
  const lampLight=new THREE.PointLight('#ffc272',0,7,2),stoveLight=new THREE.PointLight('#ff964d',0,5,2);scene.add(lampLight,stoveLight);
  const ground=new THREE.Mesh(resources.geometry('backdrop',()=>new THREE.PlaneGeometry(180,180)),resources.material('#d6d4c5',.96));ground.rotation.x=-Math.PI/2;ground.position.y=-.60;ground.receiveShadow=true;ground.name='backdrop';scene.add(ground);
  let disposed=false;
  const shell=createCabinShell(resources);scene.add(shell.root);
  const [furniture,character]=await Promise.all([loadFurnitureAssets(resources),createCabinCharacter(resources)]).catch(error=>{resources.dispose();renderer.dispose();controls.dispose();renderer.domElement.remove();throw error;});
  if(disposed)throw new Error('Cabin view was disposed while loading');
  scene.add(character.root);
  const items=new Map<string,ReturnType<typeof furniture.createItemVisual>>();
  for(const d of ITEM_DEFINITIONS){const visual=furniture.createItemVisual(d.id,d.dimensions);visual.root.userData.pickId=`audit:${d.id}`;scene.add(visual.root);items.set(`audit:${d.id}`,visual);}
  // The stove asset owns its lower flue; this connector owns the building junction.
  const flue=new THREE.Group();flue.name='registered-stove-roof-connection';scene.add(flue);
  const iron=resources.material('#383d35',.74);
  const pipe=new THREE.Mesh(resources.geometry('upper-stove-flue',()=>new THREE.CylinderGeometry(.10,.10,1.55,12)),iron);pipe.position.y=.775;flue.add(pipe);
  const flashing=new THREE.Mesh(resources.geometry('flue-flashing',()=>new THREE.BoxGeometry(.56,.035,.56)),iron);flue.add(flashing);
  const boot=new THREE.Mesh(resources.geometry('flue-boot',()=>new THREE.CylinderGeometry(.112,.20,.22,12)),iron);flue.add(boot);
  const cap=new THREE.Mesh(resources.geometry('rain-cowl',()=>new THREE.ConeGeometry(.20,.14,12)),iron);cap.position.y=1.58;flue.add(cap);
  flue.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=true;});

  const overlay=new THREE.Group();overlay.name='spatial-registration';scene.add(overlay);
  const selection=new THREE.Group();selection.name='selected-footprint';scene.add(selection);
  const previewGroup=new THREE.Group();previewGroup.name='placement-preview';scene.add(previewGroup);
  const clay=resources.own(new THREE.MeshStandardMaterial({color:'#d9ccb3',roughness:.92}));
  const wire=resources.own(new THREE.MeshBasicMaterial({color:'#4b675b',wireframe:true}));
  const localOcclusion=createCabinOcclusion(resources,scene);localOcclusion.bindMaterial(clay);
  const originalMaterials=new WeakMap<THREE.Mesh,THREE.Material|THREE.Material[]>();
  let currentState:CabinState|null=null,settings:ViewSettings={cut:'auto',light:'day',material:'normal',spaces:false,quality:'balanced'},selected:string|null=null,placing:PlacementPreview|null=null;
  let currentCamera:CameraView='room',stateKey='',materialKey='';
  let transition:{from:THREE.Vector3;to:THREE.Vector3;fromQ:THREE.Quaternion;toQ:THREE.Quaternion;fromTarget:THREE.Vector3;target:THREE.Vector3;time:number}|null=null;
  const tempCamera=new THREE.PerspectiveCamera();
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),floorPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  const transientResources=new Map<THREE.Group,{dispose:()=>void}[]>();
  function clearGroup(group:THREE.Group){for(const resource of transientResources.get(group)??[])resource.dispose();transientResources.set(group,[]);group.clear();}
  function transient<T extends {dispose():void}>(group:THREE.Group,resource:T):T{const list=transientResources.get(group)??[];list.push(resource);transientResources.set(group,list);return resource;}
  function line(group:THREE.Group,points:THREE.Vector3[],color:string){const geometry=transient(group,new THREE.BufferGeometry().setFromPoints(points));const material=transient(group,new THREE.LineBasicMaterial({color,transparent:true,opacity:.88,depthTest:group!==overlay}));const obj=new THREE.Line(geometry,material);obj.renderOrder=20;group.add(obj);return obj;}
  function rect(group:THREE.Group,x:number,z:number,w:number,d:number,yaw:number,color:string,y=.025){const points=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2],[-w/2,-d/2]].map(([a,b])=>new THREE.Vector3(x+a*Math.cos(yaw)+b*Math.sin(yaw),y,z-a*Math.sin(yaw)+b*Math.cos(yaw)));return line(group,points,color);}
  function circle(group:THREE.Group,x:number,z:number,r:number,color:string,y=.035){return line(group,Array.from({length:33},(_,i)=>new THREE.Vector3(x+Math.cos(i/32*Math.PI*2)*r,y,z+Math.sin(i/32*Math.PI*2)*r)),color);}
  function syncOverlays(){
    clearGroup(overlay);clearGroup(selection);clearGroup(previewGroup);
    if(!currentState)return;
    if(settings.spaces){
      rect(overlay,0,0,CABIN.width,CABIN.depth,0,'#376d61');
      rect(overlay,0,CABIN.depth/2+CABIN.porchDepth/2,CABIN.porchWidth,CABIN.porchDepth,0,'#376d61');
      for(let x=-4;x<=4;x+=.5)line(overlay,[new THREE.Vector3(x,.015,-3.5),new THREE.Vector3(x,.015,3.5)],'#b4b49c');
      for(let z=-3.5;z<=3.5;z+=.5)line(overlay,[new THREE.Vector3(-4.2,.015,z),new THREE.Vector3(4.2,.015,z)],'#b4b49c');
      const arc=Array.from({length:25},(_,i)=>new THREE.Vector3(-CABIN.doorWidth/2+Math.cos(i/24*Math.PI/2)*CABIN.doorWidth,.055,CABIN.depth/2+Math.sin(i/24*Math.PI/2)*CABIN.doorWidth));
      line(overlay,arc,'#bf7c38');
      circle(overlay,currentState.player.x,currentState.player.z,CABIN.actorRadius,'#3b7966');
    }
    for(const item of currentState.items){
      const pose=itemPose(currentState,item);if(!pose)continue;const def=definitionFor(item.definitionId);
      if(item.instanceId===selected)rect(selection,pose.x,pose.z,def.dimensions[0]+.08,def.dimensions[2]+.08,pose.yaw,'#f3d28c',pose.y+.035);
      if(settings.spaces){
        rect(overlay,pose.x,pose.z,def.dimensions[0],def.dimensions[2],pose.yaw,def.blocksNavigation?'#bd654a':'#598d78',pose.y+.04);
        const approach=approachPoint(currentState,item);if(approach){circle(overlay,approach.x,approach.z,.15,'#4d83a1');line(overlay,[new THREE.Vector3(approach.x,.06,approach.z),new THREE.Vector3(pose.x,pose.y+.06,pose.z)],'#7294a0');}
        for(const slot of def.supports){const [x,y,z]=slot.position;const px=pose.x+x*Math.cos(pose.yaw)+z*Math.sin(pose.yaw),pz=pose.z-x*Math.sin(pose.yaw)+z*Math.cos(pose.yaw);rect(overlay,px,pz,slot.halfSize[0]*2,slot.halfSize[1]*2,pose.yaw,'#bf9e46',pose.y+y+.03);}
      }
    }
    if(placing){
      const item=currentState.items.find(i=>i.instanceId===placing!.id)!;const d=definitionFor(item.definitionId),p=placing.location,color=placing.valid?'#80b79a':'#ce745d';
      const g=transient(previewGroup,new THREE.BoxGeometry(...d.dimensions));
      const m=transient(previewGroup,new THREE.MeshStandardMaterial({color,transparent:true,opacity:.28,depthWrite:false}));
      const ghost=new THREE.Mesh(g,m);ghost.position.set(p.x,d.dimensions[1]/2,p.z);ghost.rotation.y=p.yaw;previewGroup.add(ghost);
      rect(previewGroup,p.x,p.z,d.dimensions[0],d.dimensions[2],p.yaw,color);
    }
  }
  function applyMaterial(){
    if(materialKey===settings.material)return;materialKey=settings.material;
    for(const root of [shell.root,...[...items.values()].map(i=>i.root),flue])root.traverse(o=>{if(o instanceof THREE.Mesh){if(!originalMaterials.has(o))originalMaterials.set(o,o.material);o.material=settings.material==='clay'?clay:settings.material==='wire'?wire:originalMaterials.get(o)!;}});
  }
  function setView(view:CameraView,instant=false){
    currentCamera=view;const aspect=Math.max(.5,camera.aspect),factor=Math.max(1,Math.min(1.6,1.25/aspect));
    let position:THREE.Vector3,target=new THREE.Vector3(0,1.0,.55);
    if(view==='opposite')position=new THREE.Vector3(-11,10,-12).multiplyScalar(factor);
    else if(view==='plan'){position=new THREE.Vector3(0,20*factor,.551);target.set(0,0,.55);}
    else if(view==='inside'){position=new THREE.Vector3(0,2.55,2.6);target.set(-.4,1.65,-2.4);}
    else if(view==='detail'&&currentState&&selected&&selected!=='door'){
      const item=currentState.items.find(i=>i.instanceId===selected),pose=item&&itemPose(currentState,item);
      if(pose&&item){
        const bounds=new THREE.Box3().setFromObject(items.get(selected)!.root,true);
        // A seat close-up must frame its occupant; host close-ups include supported props.
        if(currentState.player.usingId===selected)bounds.expandByObject(character.root,true);
        for(const child of currentState.items)if(child.location.kind==='surface'&&child.location.hostId===selected)bounds.expandByObject(items.get(child.instanceId)!.root,true);
        bounds.getCenter(target);
        const radius=bounds.getSize(new THREE.Vector3()).length()/2;
        const verticalHalf=THREE.MathUtils.degToRad(camera.fov/2),horizontalHalf=Math.atan(Math.tan(verticalHalf)*camera.aspect);
        const distance=Math.max(controls.minDistance,radius/Math.sin(Math.min(verticalHalf,horizontalHalf))*1.12);
        const occupied=currentState.player.usingId===selected;
        const actorBounds=new THREE.Box3().setFromObject(character.root,true).expandByScalar(.18);
        const candidates=[[1.3,.9,1.55],[1.55,1.1,.7],[1.55,1.1,-.9],[-1.55,1.1,.7],[-1.3,1.2,-1.55]];
        position=target.clone().add(new THREE.Vector3(...candidates[0]).normalize().multiplyScalar(distance));
        for(const direction of candidates){
          const candidate=target.clone().add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance));
          const ray=new THREE.Ray(candidate,target.clone().sub(candidate).normalize());
          const obstruction=occupied?null:ray.intersectBox(actorBounds,new THREE.Vector3());
          // The entrance actor can stand exactly where the table's first close-up would land.
          if(!obstruction||candidate.distanceTo(obstruction)>distance){position=candidate;break;}
        }
      }else position=new THREE.Vector3(10.5,10,13.5).multiplyScalar(factor);
    }else position=new THREE.Vector3(10.5,10,13.5).multiplyScalar(factor);
    tempCamera.position.copy(position);tempCamera.up.set(0,1,0);tempCamera.lookAt(target);
    if(instant){camera.position.copy(position);camera.quaternion.copy(tempCamera.quaternion);controls.target.copy(target);controls.update();transition=null;}
    else transition={from:camera.position.clone(),to:position,fromQ:camera.quaternion.clone(),toQ:tempCamera.quaternion.clone(),fromTarget:controls.target.clone(),target,time:0};
  }
  function resize(){const rect=host.getBoundingClientRect();camera.aspect=Math.max(1,rect.width)/Math.max(1,rect.height);camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio||1,settings.quality==='fine'?2:1.35));renderer.setSize(rect.width,rect.height,false);if(currentCamera!=='detail')setView(currentCamera,true);}
  const observer=new ResizeObserver(resize);observer.observe(host);resize();setView('room',true);
  const abort=new AbortController();const signal=abort.signal;
  let pointerStart:{x:number;y:number;id:number}|null=null,activePointers=new Set<number>(),hadMultiTouch=false;
  function pointerRay(event:PointerEvent){const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);}
  renderer.domElement.addEventListener('pointerdown',event=>{activePointers.add(event.pointerId);if(activePointers.size>1)hadMultiTouch=true;pointerStart={x:event.clientX,y:event.clientY,id:event.pointerId};if(transition){transition=null;controls.update();}},{signal});
  renderer.domElement.addEventListener('pointermove',event=>{if(!placing)return;pointerRay(event);const point=raycaster.ray.intersectPlane(floorPlane,new THREE.Vector3());if(point)callbacks.hover(point.x,point.z);},{signal});
  const isVisible=(obj:THREE.Object3D)=>{for(let o:THREE.Object3D|null=obj;o;o=o.parent)if(!o.visible)return false;return true;};
  renderer.domElement.addEventListener('pointerup',event=>{
    const start=pointerStart;activePointers.delete(event.pointerId);const multi=hadMultiTouch;if(activePointers.size===0)hadMultiTouch=false;pointerStart=null;
    if(!start||start.id!==event.pointerId||Math.hypot(event.clientX-start.x,event.clientY-start.y)>7||multi||event.button!==0)return;
    pointerRay(event);
    if(placing){const point=raycaster.ray.intersectPlane(floorPlane,new THREE.Vector3());if(point)callbacks.floor(point.x,point.z);return;}
    const hits=raycaster.intersectObjects([shell.root,...[...items.values()].map(v=>v.root)],true).filter(h=>isVisible(h.object));
    const hit=hits[0];if(!hit)return;
    let id:string|null=null,isFloor=false;for(let o:THREE.Object3D|null=hit.object;o;o=o.parent){if(o.userData.pickId)id=o.userData.pickId;if(o.name==='continuous-floor-and-porch')isFloor=true;}
    if(id)callbacks.pick(id);else if(isFloor)callbacks.floor(hit.point.x,hit.point.z);
  },{signal});
  const cancelPointer=(event:PointerEvent)=>{activePointers.delete(event.pointerId);pointerStart=null;if(!activePointers.size)hadMultiTouch=false;};
  renderer.domElement.addEventListener('pointercancel',cancelPointer,{signal});

  function sync(state:CabinState,next:ViewSettings,selectionId:string|null,preview:PlacementPreview|null){
    localOcclusion.sync(state,next.light==='evening',next.occlusion??new URLSearchParams(window.location.search).get('ao')!=='off');
    currentState=state;selected=selectionId;placing=preview;
    const previousQuality=settings.quality;settings=next;
    if(previousQuality!==next.quality){sunlight.shadow.mapSize.setScalar(next.quality==='fine'?2048:1024);sunlight.shadow.map?.dispose();sunlight.shadow.map=null;resize();}
    controls.enabled=!placing;
    for(const item of state.items){const v=items.get(item.instanceId)!;const pose=itemPose(state,item);v.root.visible=!!pose;if(pose){v.root.position.set(pose.x,pose.y,pose.z);v.root.rotation.y=pose.yaw;}}
    const stove=state.items.find(i=>i.definitionId==='stove')!,stovePose=itemPose(state,stove);flue.visible=!!stovePose;
    if(stovePose){
      const c=Math.cos(stovePose.yaw),s=Math.sin(stovePose.yaw);
      flue.position.set(stovePose.x+.18*c-.16*s,stovePose.y+2.9,stovePose.z-.18*s-.16*c);
      const roof=roofSurfaceAt(flue.position.x),roofY=roof.height-flue.position.y;
      const pipeLength=next.cut==='closed'?Math.max(.5,roofY+.65):.465;
      pipe.scale.y=pipeLength/1.55;pipe.position.y=pipeLength/2;
      flashing.position.y=roofY+.012;flashing.rotation.z=roof.rotationZ;
      boot.position.y=roofY+.11;cap.position.y=pipeLength+.03;
      flashing.visible=boot.visible=cap.visible=next.cut==='closed';
    }
    if(next.light==='day'){ambient.intensity=2.1;sunlight.intensity=3;fill.intensity=.8;scene.background=new THREE.Color('#e8e4d9');ground.material.color.set('#d6d4c5');renderer.toneMappingExposure=1.16;}
    else{ambient.intensity=.66;sunlight.intensity=.45;fill.intensity=.75;scene.background=new THREE.Color('#243b41');ground.material.color.set('#334a47');renderer.toneMappingExposure=1.12;}
    const key=JSON.stringify([state.items,next.spaces?Math.round(state.player.x*10):0,next.spaces?Math.round(state.player.z*10):0,next.spaces,selected,preview]);
    if(stateKey!==key){stateKey=key;syncOverlays();}
    overlay.visible=settings.spaces;applyMaterial();
  }
  function update(dt:number,moving:boolean){
    if(disposed||!currentState)return;
    if(transition){transition.time=Math.min(1,transition.time+dt/.55);const t=transition.time,alpha=t*t*(3-2*t);camera.position.lerpVectors(transition.from,transition.to,alpha);camera.quaternion.slerpQuaternions(transition.fromQ,transition.toQ,alpha);controls.target.lerpVectors(transition.fromTarget,transition.target,alpha);if(t===1){transition=null;controls.update();}}
    else controls.update();
    shell.setCut(settings.cut,camera.position);shell.setDoor(currentState.doorOpen,dt);
    for(const item of currentState.items)items.get(item.instanceId)!.setState({open:item.open,lit:item.lit},dt);
    const player=currentState.player,using=currentState.items.find(i=>i.instanceId===player.usingId),pose=using&&itemPose(currentState,using);
    const def=using&&definitionFor(using.definitionId);
    character.update({x:pose&&player.posture!=='standing'?pose.x:player.x,z:pose&&player.posture!=='standing'?pose.z:player.z,facing:pose&&player.posture!=='standing'?pose.yaw:player.facing,posture:player.posture,moving,seatY:def?.contactY,bedY:def?.contactY},dt);
    const lamp=currentState.items.find(i=>i.definitionId==='lantern')!,lampPose=itemPose(currentState,lamp);
    lampLight.intensity=lamp.lit&&lampPose?(settings.light==='day'?1.4:4.5):0;if(lampPose)lampLight.position.set(lampPose.x,lampPose.y+.3,lampPose.z);
    const stove=currentState.items.find(i=>i.definitionId==='stove')!,stovePose=itemPose(currentState,stove);stoveLight.intensity=stove.lit&&stovePose?2.5:0;if(stovePose)stoveLight.position.set(stovePose.x+.7*Math.sin(stovePose.yaw),stovePose.y+.45,stovePose.z+.7*Math.cos(stovePose.yaw));
    renderer.render(scene,camera);
  }
  function stats(){const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,viewport:[renderer.domElement.width,renderer.domElement.height],dpr:renderer.getPixelRatio(),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),camera:currentCamera,cameraPosition:camera.position.toArray(),cameraTarget:controls.target.toArray(),cameraQuaternion:camera.quaternion.toArray(),settings:{...settings},shell:shell.stats(),assets:typeof furniture.stats==='function'?furniture.stats():furniture.stats,renderTargets:[{purpose:'directional shadow',size:sunlight.shadow.mapSize.toArray()}],postProcessing:false,occlusion:localOcclusion.stats()};}
  function capture(){return renderer.domElement.toDataURL('image/png');}
  function project(x:number,y:number,z:number){const p=new THREE.Vector3(x,y,z).project(camera),bounds=renderer.domElement.getBoundingClientRect();return {x:bounds.left+(p.x+1)*bounds.width/2,y:bounds.top+(1-p.y)*bounds.height/2};}
  function movementVector(x:number,z:number){const forward=camera.getWorldDirection(new THREE.Vector3());forward.y=0;if(forward.lengthSq()<.001)forward.set(0,0,-1);forward.normalize();const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0));return forward.multiplyScalar(-z).addScaledVector(right,x).normalize();}
  function dispose(){if(disposed)return;disposed=true;abort.abort();observer.disconnect();for(const group of [overlay,selection,previewGroup])clearGroup(group);localOcclusion.dispose();character.dispose();controls.dispose();sunlight.shadow.map?.dispose();resources.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}
  return {sync,update,setView,stats,capture,project,movementVector,dispose,canvas:renderer.domElement};
}
