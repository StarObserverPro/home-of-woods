import {configureForestBark} from './bark-surface.ts';
import {createAtmosphereLite} from './atmosphere-lite.ts';
import type {AtmosphereDebug} from './atmosphere-lite.ts';
import {RAINIER_CAMP} from '../content/rainier-ecology.ts';
import {createOverlookOptics,applyNavigationOptics,overlookAmount} from './overlook-optics.ts';
import type {OverlookOpticsMode} from '../content/overlook-optics.ts';
import {loadImpostorAtlas} from './impostors/runtime.ts';
import type {ImpostorAtlas} from './impostors/runtime.ts';
import {createAnchoredOverlook} from './anchored-overlook.ts';
import {OVERLOOK} from '../content/camera.ts';
import {positionNavigationCamera,updateNavigationForecast} from './camera-forecast.ts';
import {navigationZoomForProjection} from './overlook-optics-rules.ts';
import {createCampOcclusion} from './lighting/camp-occlusion.ts';
import {createCampShadows} from './lighting/camp-shadows.ts';
import {createCharacterContactShadows} from './lighting/character-contact-shadows.ts';
import {createStreamedForest} from './streamed-forest.ts';
import {createForestViewPlanner} from './forest-view-plan.ts';
import {createFrameWorkQueue} from './frame-work-queue.ts';
import {FRAME_WORK_BUDGET} from '../content/frame-budget.ts';
import {createCreekBridge} from './creek-bridge.ts';
import {CREEK_BRIDGE} from '../content/regions.ts';
import {travelAccess} from '../world/regions.ts';
import {travelHeightAt} from '../world/traversal.ts';
import {createHaulPresentation} from './haul-presentation.ts';
import {createWildlifePresentation} from './wildlife-presentation.ts';
import {wildlifeViews,landmarkInspectionView,foxInspectionView} from '../domain/wildlife.ts';
import type {FoxReviewPose} from './fox-expression.ts';
import type {RarityVfxMode} from '../content/item-vfx.ts';
import {createWoodcraftPresentation} from './woodcraft-presentation.ts';
import {WOODCRAFT,insideWoodcraft} from '../content/woodcraft.ts';
import {createWorkshopPresentation} from './workshop-presentation.ts';
import {createHousingPresentation} from './housing-presentation.ts';
import {createLifePresentation} from './life-presentation.ts';
import {createBroomPresentation} from './broom-presentation.ts';
import type {BroomUseEvent} from '../domain/broom.ts';
import type {MealCommitted} from '../domain/food.ts';
import type {WhimsyMode} from '../content/whimsy-display.ts';
import {diningReadingSpot} from '../domain/housing.ts';
import type {SeatContact} from './seated-pose.ts';
import {SEAT_DEFINITION,WORKBENCH} from '../content/workshop.ts';
import {HOUSING,isHousingFurniture} from '../content/housing.ts';
import {createMerchantWagon} from './merchant-wagon.ts';
import type {PlacementDraft} from '../domain/furniture-placement.ts';
import {CAMP_VISITOR} from '../content/characters.ts';
import {createUnderstory} from './understory.js';
import {treeVisual} from '../world/tree-appearance.ts';
import * as THREE from "three";
import { CABIN, CAMERA, GIANT, HOME, TENT, WORLD } from "../content/world.ts";
import { CABIN_EXTERIOR, CABIN_PORTAL, CABIN_ROOM } from '../content/cabin.ts';
import type { CabinPlayer } from '../domain/cabin.ts';
import { TENT_SCALE, TENT_SHAPE } from '../content/tent.ts';
import type { TentDebugMode } from '../content/tent.ts';
import { TENT_PORTAL, TENT_ROOM } from '../content/tent-room.ts';
import type { TentPlayer } from '../domain/tent.ts';
import type { GameState } from "../domain/state.ts";
import {makeColliders} from "../world/layout.ts";
import type { Collider,Tree } from "../world/layout.ts";
import { heightAt, clamp } from "../world/surface.ts";
import { Resources } from "./resources.ts";
import { Models } from "./models.ts";
import {createSign} from "./wayfinding-sign.ts";
import { createScenery, createTerrain } from "./terrain.ts";
import {createEnvironment} from './environment.ts';
import {createWeatherPresentation} from './weather-presentation.ts';
import {weatherSnapshot} from '../domain/weather.ts';
import {createHorizon} from './horizon.ts';
import {createCreek} from './creek.ts';
import {createCampProps} from './camp-props.ts';
import {createSelectionMarker} from './selection-marker.ts';
import {createCabinRepair} from './cabin-repair.ts';
import {createCabinRoom} from './cabin/room.ts';
import {createTentExterior} from './tent/exterior.ts';
import {createTentRoom} from './tent/room.ts';
import {createSkySample,sampleSkyLight} from './lighting/sky-light.ts';
import {createCampExteriors} from './camp-exteriors.ts';
import {VIEWS,CAMP_PROPS,DINING_SEAT} from '../content/scene-props.ts';
import type {SceneAppearance,SceneViewPreset} from '../content/scene-props.ts';
import {sceneAppearanceAt,daylightAt} from '../domain/scene-props.ts';
import {createForestryPresentation} from './forestry-presentation.ts';
import { createGatheringPresentation } from './gathering-presentation.ts';
import type { GatheringRegistry } from '../domain/gathering-registry.ts';
import {ramp} from './actions/motion.js';
import {createCharacters} from './characters.ts';
import {createNeighbourPresentation} from './neighbour.ts';
import {createVillagers} from './villagers.ts';
import {RIDGE_NEIGHBOUR} from '../content/npcs/ridge-neighbour/profile.ts';
import type {CharacterInspection} from './characters.ts';
import type {WardrobeLook} from '../content/wardrobe-preview.ts';

export type SceneIntent =
  | { kind: "wood-drop"; x:number; y:number; z:number }
  | { kind: 'cabin-door' }
  | { kind: 'cabin-lamp' }
  | { kind: 'tent-door' }
  | { kind: "select"; id: string }
  | { kind: "move"; x: number; z: number };
export async function createScene(
  host: HTMLElement,
  trees: Tree[],
  intent: (value: SceneIntent) => void,
  gatheringRegistry: GatheringRegistry,
  campColliders:()=>Collider[]=()=>makeColliders(trees),
) {
  const r = new Resources(),
    models = new Models(r);
  try {
    await models.load();
  } catch (error) {
    r.dispose();
    throw error;
  }
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch (error) {
    r.dispose();
    throw error;
  }
  renderer.setPixelRatio(1);
  let shaderErrors=0;
  renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{
    shaderErrors++;
    console.error('Scene shader compilation',gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment));
  };
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const canvas = renderer.domElement;
  const gl=renderer.getContext(),debugRenderer=gl.getExtension('WEBGL_debug_renderer_info');
  const graphicsBackend=debugRenderer ? gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "森林之家可玩山谷");
  canvas.setAttribute("role", "application");
  host.appendChild(canvas);
  const fade = document.createElement('div');
  fade.className = 'scene-fade';
  fade.setAttribute('aria-hidden', 'true');
  host.appendChild(fade);
  const scene = new THREE.Scene();
  const renderParams=new URLSearchParams(window.location.search);
  const airMode=renderParams.get('atmosphere')??'final';
  const atmosphere=createAtmosphereLite((['off','transmittance','inscatter'].includes(airMode)?airMode:'final') as AtmosphereDebug);
  const opticsMode=renderParams.get('optics')??'final';
  const optics=createOverlookOptics(renderer,(['off','depth','coc'].includes(opticsMode)?opticsMode:'final') as OverlookOpticsMode);
  const environment=createEnvironment(r,{renderer,sharedAtmosphere:true});
  const light=environment.lighting;
  scene.add(environment.group);
  scene.environment=environment.environmentMap;
  scene.environmentIntensity=light.environmentIntensity;
  renderer.toneMappingExposure=light.recommendedExposure;
  scene.fog = null; // Shared height-integrated air owns surface scattering, including mountains.
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 3200);
  const overlook=createAnchoredOverlook(),forecastCamera=camera.clone();
  const forecastCameras=OVERLOOK.forecastSeconds.map(()=>camera.clone());
  let cameraOwner='navigation';
  let followTargetPending=false;
  let overlookSelection:string|null|undefined;
  let releasedHousingId:string|null|undefined;
  let yaw = CAMERA.yaw,
    elevation = CAMERA.elevation,
    zoom: number = CAMERA.zoom,
    destroyed = false,
    reducedMotion = false,
    elapsed = 0,
    ambientTime = 0,
    mobile = false;
  const overview = new THREE.Vector3(HOME.x + 35, 29, HOME.z + 31);
  const target = new THREE.Vector3(HOME.x + 25, 27, HOME.z + 25);
  const desired = new THREE.Vector3(),
    offset = new THREE.Vector3();
  const followTarget=new THREE.Vector3();
  const forecastTarget=new THREE.Vector3();
  const followPlayer=new THREE.Vector3();
  const navigationTarget=(poseZoom:number,out:THREE.Vector3)=>{
    const framing=Math.min(1,(CAMERA.zoom/poseZoom)**2);
    return out.set(followPlayer.x,followPlayer.y+1.5,followPlayer.z).lerp(overview,
      (mobile?.12:.75)*framing*clamp(1-(Math.hypot(followPlayer.x-HOME.x,followPlayer.z-HOME.z)-20)/50,0,1));
  };
  const hemi = new THREE.HemisphereLight(light.skyColor, light.groundColor, light.ambientIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(light.sunColor, light.sunIntensity);
  scene.add(sun, sun.target);
  const { ground, water } = createTerrain(r);
  // Visual-only forest is replaceable without changing the playable world.
  const requestedForest=renderParams.get('farForest');
  const forestMode=requestedForest==='trees'?'trees':requestedForest==='impostor'?'impostor':'mass';
  let forestAtlas:ImpostorAtlas|undefined,impostorLoadError:string|null=null;
  if(forestMode==='impostor'){
    try{forestAtlas=await loadImpostorAtlas('/assets/forest-impostors/rainier-conifer-cluster.json');}
    catch(error){impostorLoadError=error instanceof Error?error.message:String(error);}
  }
  const horizon=createHorizon(r,ground.geometry,trees,forestMode,forestAtlas);
  // Batches are registered before their shared atlas, so teardown releases users first.
  if(forestAtlas)r.own(forestAtlas);
  scene.add(horizon.group);
  const river=createCreek(r,water,horizon.riverExtensions),camp=createCampProps(r,models.clone('drying-vessels'));
  const bridge=createCreekBridge(r);
  scene.add(river.group,camp.group,bridge.group);
  const auditParams=new URLSearchParams(window.location.search),auditHour=auditParams.has('inspect')&&auditParams.has('hour')?Number(auditParams.get('hour')):NaN;
  let appearance=sceneAppearanceAt(0),scenePreset:SceneViewPreset|null=null,sceneOverrides:Partial<SceneAppearance>={};
  let foxReview:FoxReviewPose={seconds:0,blink:0,gaze:[0,0]};
  let cabinRoom:ReturnType<typeof createCabinRoom>|null=null;
  let cabinPlayer:CabinPlayer|null=null;
  let tentRoom:ReturnType<typeof createTentRoom>|null=null;
  let tentPlayer:TentPlayer|null=null;
  const activeInterior=()=>tentPlayer?tentRoom:cabinPlayer?cabinRoom:null;
  const inside=()=>!!tentPlayer||!!cabinPlayer;
  let cabinTime=0, lastCabinLightAt=0, outsideFrames=0;
  let tentTime=0, lastTentLightAt=0, tentDoorOpen=true;
  let fadeAmount=0, returnDoorView=false, returnTentView=false, snapOutdoorTarget=false;
  let schedulePresentation=()=>{};
  let presentationDirty=false;
  const requestPresentation=()=>{presentationDirty=true;schedulePresentation();};
  const cabinSky=createSkySample();
  let sceneCamera:{yaw:number;elevation:number;zoom:number;target:THREE.Vector3}|null=null;
  scene.add(ground, water);
  const scenery = createScenery(r);
  scene.add(scenery.group);
  const forest = models.createForest(trees,true);
  scene.add(forest.group);
  const understory=createUnderstory(r,trees,forest.selections);scene.add(understory.group);
  const frameWork=createFrameWorkQueue();
  const streaming=createStreamedForest(forest,trees,frameWork);
  const forestViewPlanner=createForestViewPlanner(forest.sceneryBatches);
  let forestViewStats:ReturnType<typeof forestViewPlanner.plan>['stats']|null=null;
  let forestViewReady=true,frameViewRepairs=0;
  const props = new Map<string, THREE.Object3D>();
  const tent=createTentExterior(r);
  const tentMode=renderParams.get('tentMaterial');
  const tentDebug=(['clay','wireframe','normals'].includes(tentMode??'')?tentMode:'final') as TentDebugMode;
  tent.setDebugMode(tentDebug);
  const fixedTentWind=auditParams.has('inspect')&&auditParams.has('tentWindTime')?Number(auditParams.get('tentWindTime')):NaN;
  const buildingSources=new Map(models.templates);
  buildingSources.set('tent',tent.group.clone(true));
  for (const [name, p] of [
    ["cabin", CABIN],
    ["tent", TENT],
  ] as const) {
    const model = name==='tent'?tent.group:models.staticClone(name);
    model.scale.setScalar(name==='cabin'?CABIN_EXTERIOR.scale:TENT_SCALE);
    if(name==='cabin')model.rotation.y=CABIN_EXTERIOR.yaw;
    model.position.set(p.x, heightAt(p.x, p.z), p.z);
    scene.add(model);
    props.set(name, model);
  }
  const cabinRepair=createCabinRepair(models);
  props.get('cabin')!.add(cabinRepair.group);
  const campExteriors=createCampExteriors(r,props.get('tent')! as THREE.Group,props.get('cabin')! as THREE.Group,camp.roots.get(CAMP_PROPS.fire.id)!,changed=>tent.setCanvasVariant(changed?'sage':'warm'));
  const housing=createHousingPresentation(r,props.get('cabin')!);
  scene.add(housing.group);
  const propFades = new Map<
    THREE.Object3D,
    {
      center: THREE.Vector3;
      radius: number;
      materials: {
        mesh: THREE.Mesh;
        opaque: THREE.Material;
        fade: THREE.Material;
      }[];
    }
  >();
  props.forEach((root) => {
    // Cloth, doorway and debug materials are owned by the tent presentation.
    // A generic material swap would overwrite its door state and surface channels.
    if(root===tent.group)return;
    const box = new THREE.Box3().setFromObject(root),
      center = box.getCenter(new THREE.Vector3()),
      radius = box.getSize(new THREE.Vector3()).length() / 2,
      materials: {
        mesh: THREE.Mesh;
        opaque: THREE.Material;
        fade: THREE.Material;
      }[] = [];
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const opaque = o.material as THREE.Material,
          fade = r.own(opaque.clone());
        fade.transparent = true;
        fade.opacity = 0.22;
        fade.depthWrite = false;
        materials.push({ mesh: o, opaque, fade });
      }
    });
    propFades.set(root, { center, radius, materials });
  });
  const characters=createCharacters(r,models,trees,forest.selections),player=characters.player;
  const neighbour=createNeighbourPresentation(r,models);scene.add(neighbour.group);
  const villagers=createVillagers(models,campColliders);scene.add(villagers.group);
  const visibleObject=(object:THREE.Object3D|undefined|null)=>{if(!object)return null;for(let current:THREE.Object3D|null=object;current;current=current.parent)if(!current.visible)return null;return object;};
  const life=createLifePresentation(r,player,{curtainTargets(event,state){
    const cue=event.curtain;if(!cue)return {pot:null,spoon:null};
    const hook=visibleObject(campExteriors.parts.get(cue.hookId));
    const pot=state.workshop.mounted['camp-fire:top']===cue.hookId&&(state.workshop.upgrades[cue.potId]?.level??0)>=1&&hook?visibleObject(campExteriors.parts.get(cue.potId)):null;
    const table=cue.spoonTableId?state.inventory.instances?.find(item=>item.instanceId===cue.spoonTableId&&item.definitionId==='furniture.prep-side-table'&&item.location.kind==='world'):null;
    const spoon=table?visibleObject(housing.object(table.instanceId)?.getObjectByName('prep-wooden-spoon')):null;
    return {pot,spoon};
  }});
  const broom=createBroomPresentation(r,player);scene.add(broom.group);
  let readingFocus:SeatContact|null=null;
  let readingMode=false,mealFraming=false;
  let lastState:GameState|null=null;
  scene.add(player,characters.visitor);
  const merchantWagon=createMerchantWagon(r,models.clone('merchant-wagon'));scene.add(merchantWagon.group);
  const wildlife=createWildlifePresentation(r,models);scene.add(wildlife.group);
  const workshop=createWorkshopPresentation(r,models);scene.add(workshop.group);workshop.hits.register(characters.visitor,CAMP_VISITOR.id);workshop.hits.register(merchantWagon.group,CAMP_VISITOR.id);
  workshop.hits.register(neighbour.group,RIDGE_NEIGHBOUR.id);
  const woodcraft=createWoodcraftPresentation(r);scene.add(woodcraft.group);
  let woodDropMode=false;
  let placementMode=false;
  let inspectionCamera:{yaw:number;elevation:number;zoom:number;target:THREE.Vector3}|null=null;
  const forestry=createForestryPresentation({models,resources:r,forestGroup:forest.group,trees,selections:forest.selections,
    bindTreeSurface(root){weather.bind(root,'tree');outdoorShadows.bindTree(root);localOcclusion.bind(root);atmosphere.bind(root);},
  });
  const gathering = createGatheringPresentation(r, models, gatheringRegistry);
  scene.add(gathering.group);
  const hauling=createHaulPresentation(r,models);scene.add(hauling.group);
  const signs = [
    { x: -24, z: -37, label: "宅后望台 ↑" },
    { x: -31, z: 12, label: "溪谷小径 ↓" },
    { x: 47, z: 34, label: "东岸林地 →" },
  ];
  for (const p of signs) {
    const sign = createSign(r, p.label);
    sign.position.set(p.x, heightAt(p.x, p.z), p.z);
    scene.add(sign);
  }
  const marker = createSelectionMarker(r);
  scene.add(marker.object);
  const destination = new THREE.Mesh(
    r.geometry("destination-ring", () => new THREE.RingGeometry(0.3, 0.42, 32)),
    r.own(
      new THREE.MeshBasicMaterial({
        color: "#fff4c9",
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    ),
  );
  destination.rotation.x = -Math.PI / 2;
  destination.visible = false;
  scene.add(destination);
  const ray = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    treeById = new Map(trees.map((t) => [t.id, t]));
  const fadeMat = r.own(forest.material.clone());
  fadeMat.transparent = true;
  fadeMat.opacity = 0.2;
  fadeMat.depthWrite = false;
  configureForestBark(fadeMat,models.barkSurface,true);
  const weather=createWeatherPresentation(r,scene,props);
  weather.bind(ground,'ground');weather.bind(forest.group,'tree');weather.bindMaterial(fadeMat,'tree');
  weather.bind(bridge.group);weather.bind(gathering.group);
  weather.bind(horizon.group);weather.bind(scenery.group);weather.bind(camp.group);
  props.forEach(root=>weather.bind(root));
  propFades.forEach(({materials})=>materials.forEach(({fade})=>weather.bindMaterial(fade)));
  weather.addDynamicSurface(housing.group);weather.addDynamicSurface(workshop.group);
  weather.addDynamicSurface(broom.group);weather.addDynamicSurface(woodcraft.group);
  const projectedCorner=new THREE.Vector3(), occluderCenter=new THREE.Vector3();
  const occlusionRay=new THREE.Raycaster(),headWorld=new THREE.Vector3(),headDirection=new THREE.Vector3(),localHit=new THREE.Vector3();
  const inverseTreeMatrix=new THREE.Matrix4();
  const crownBounds=new Map<string,THREE.Box3>();
  forest.selections.forEach((object,id)=>{
    const mesh=object as THREE.Mesh;
    mesh.geometry.computeBoundingBox();
    const bounds=mesh.geometry.boundingBox!.clone();
    bounds.min.y=2.4;
    crownBounds.set(id,bounds);
    mesh.updateWorldMatrix(true,false);
  });
  const screenRay = (clientX: number, clientY: number) => {
    const activeRoom=activeInterior();
    const activeCamera=activeRoom?.camera??camera;
    (activeRoom?.scene??scene).updateMatrixWorld(true);activeCamera.updateMatrixWorld(true);
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((clientY - rect.top) / rect.height) * 2,
    );
    ray.setFromCamera(pointer, activeCamera);
  };
  const interactionHit=()=>ray.intersectObjects([...bridge.hits.objects(),...broom.hits.objects(),...housing.hits.objects(),...hauling.hits.objects(),...woodcraft.hits.objects(),...workshop.hits.objects(),...forestry.getPickTargets(),...props.values(),...gathering.hits.objects(),...camp.hits.filter(o=>o.userData.propActive!==false)], true).find(hit=>{let o:THREE.Object3D|null=hit.object;while(o){if(!o.visible)return false;o=o.parent;}return true;});
  const walkableObjects=()=>bridge.built.visible?[ground,bridge.built]:[ground];
  const terrainHit=()=>ray.intersectObjects(walkableObjects(),true)[0];
  const pick = (clientX: number, clientY: number) => {
    screenRay(clientX,clientY);
    if(cabinPlayer&&cabinRoom){
      const hit=cabinRoom.pick(ray);
      if(hit)intent(hit);
      return;
    }
    if(tentPlayer&&tentRoom){
      const hit=tentRoom.pick(ray);
      if(hit)intent(hit);
      return;
    }
    const hit = interactionHit(),
      surfaceHit = terrainHit();
    if(woodDropMode){const drop=ray.intersectObjects([...woodcraft.hits.objects(),...walkableObjects()],true)[0];if(drop)intent({kind:'wood-drop',x:drop.point.x,y:drop.point.y,z:drop.point.z});return;}
    if(placementMode){if(surfaceHit)intent({kind:'move',x:surfaceHit.point.x,z:surfaceHit.point.z});return;}
    const doorwayHit=ray.intersectObjects(tent.doorTargets,true)[0];
    if(doorwayHit&&(!hit||doorwayHit.distance<=hit.distance+.12)&&(!surfaceHit||doorwayHit.distance<surfaceHit.distance+.2)){
      intent({kind:'tent-door'});return;
    }
    if(surfaceHit&&insideWoodcraft(surfaceHit.point,0)&&(!hit||hit.distance>surfaceHit.distance+.2)){intent({kind:'select',id:WOODCRAFT.id});return;}
    if (hit && (!surfaceHit || hit.distance < surfaceHit.distance + 0.2)) {
      const bridgeId=bridge.hits.resolve(hit.object);if(bridgeId){intent({kind:'select',id:bridgeId});return;}
      const haulId=hauling.hits.resolve(hit.object);if(haulId){intent({kind:'select',id:haulId});return;}
      const looseId=woodcraft.hits.resolve(hit.object);if(looseId){intent({kind:'select',id:looseId});return;}
      const ownedId=workshop.hits.resolve(hit.object);if(ownedId){intent({kind:'select',id:ownedId});return;}
      const housingId=housing.hits.resolve(hit.object);if(housingId){intent({kind:'select',id:housingId});return;}
      const broomId=broom.hits.resolve(hit.object);if(broomId){intent({kind:'select',id:broomId});return;}
      if(hit.object.userData.propId){intent({kind:'select',id:hit.object.userData.propId});return;}
      const sourceId = gathering.hits.resolve(hit.object);
      if (sourceId) { intent({ kind: 'select', id: sourceId }); return; }
      let root: THREE.Object3D = hit.object;
      while (
        root.parent &&
        root.parent !== scene &&
        root.parent !== forest.group
      )
        root = root.parent;
      const id =
        [...props.entries()].find(([, o]) => o === root)?.[0] ??
        (treeById.has(root.name) ? root.name : null);
      if (id) intent({ kind: "select", id });
      return;
    }
    if (surfaceHit)
      intent({ kind: "move", x: surfaceHit.point.x, z: surfaceHit.point.z });
  };
  let cameraAction='',cameraOverride='';
  const manualCamera=()=>{cameraOverride=cameraAction;};
  const borrowedOutdoorCamera=()=>!!scenePreset||characters.getInspection()!==null;
  const cameraInputChanged=()=>{
    if(!overlook.groundReady()&&overlookSelection===undefined)overlookSelection=lastState?.selected??null;
    requestPresentation();
  };
  const releaseHousingFocus=()=>{
    if(cameraOwner!=='housing'||!overlook.groundReady())return;
    const viewOffset=camera.position.clone().sub(target);
    const releasedElevation=Math.atan2(viewOffset.y,Math.hypot(viewOffset.x,viewOffset.z));
    overlook.releaseFocus({yaw:Math.atan2(viewOffset.x,viewOffset.z),
      elevation:releasedElevation,
      zoom:navigationZoomForProjection(camera.zoom,releasedElevation,camera.aspect,mobile),distance:viewOffset.length()},target);
    releasedHousingId=lastState?.selected??null;
    cameraOwner='navigation';
  };
  const pointers = new Map<
    number,
    { x: number; y: number; sx: number; sy: number; drag: boolean }
  >();
  let multi = false,
    lastPinch = 0;
  const pointerDown = (e: PointerEvent) => {
    if (destroyed || fadeAmount>0) return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      drag: false,
    });
    if (pointers.size > 1) {
      multi = true;
      const p = [...pointers.values()];
      lastPinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    }
  };
  const pointerMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) p.drag = true;
    if (pointers.size === 2) {
      const ps = [...pointers.values()],
        dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      if (lastPinch > 0) view.zoomBy(dist / lastPinch);
      lastPinch = dist;
      view.rotate(-dx*.003);
    } else if (p.drag) {
      const room=activeInterior();
      if(room){room.orbit(dx*.006,dy*.003);requestPresentation();}
      else {
        view.rotate(-dx*.006);
        view.elevate(dy*.003);
      }
    }
  };
  const pointerUp = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (e.type !== "pointercancel" && !p.drag && !multi && fadeAmount===0)
      pick(e.clientX, e.clientY);
    pointers.delete(e.pointerId);
    if (!pointers.size) {
      multi = false;
      lastPinch = 0;
    }
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    if(!fadeAmount)view.zoomBy(Math.exp(-e.deltaY*.001));
  };
  const contextMenu = (e: Event) => e.preventDefault();
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("contextmenu", contextMenu);
  const resize = () => {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h || destroyed) return;
    renderer.setSize(w, h);
    const aspect = w / h;
    mobile = aspect < 0.8;
    camera.aspect=aspect;
    camera.updateProjectionMatrix();
    if(cabinRoom){
      cabinRoom.camera.aspect=aspect;
      cabinRoom.camera.updateProjectionMatrix();
    }
    if(tentRoom){tentRoom.camera.aspect=aspect;tentRoom.camera.updateProjectionMatrix();}
    if(inside()&&lastState)view.render(lastState,0);
    // A paused outdoor loop must repaint the cleared canvas through its normal
    // presentation scheduler, including the resized HDR/depth buffers.
    if(!inside()){river.invalidate();requestPresentation();}
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const outdoorShadows=createCampShadows({resources:r,renderer,sun,scene,models,forest,ground:ground.geometry});
  outdoorShadows.bind(scene);outdoorShadows.bindMaterial(fadeMat);
  propFades.forEach(({materials})=>materials.forEach(({fade})=>outdoorShadows.bindMaterial(fade)));
  const characterContacts=createCharacterContactShadows(r,{surfaceAt:(x,z)=>lastState?travelHeightAt(x,z,travelAccess(lastState)):heightAt(x,z)});
  const localOcclusion=createCampOcclusion({resources:r,scene,trees:forest.canopyTrees,props,buildingSources,campRoots:camp.roots,interactionRoots:()=>[...housing.hits.objects(),...workshop.hits.objects()],outerSeeds:horizon.canopySeeds,surfaceAt:horizon.surfaceAt});
  localOcclusion.bind(scene);
  // Prebind variants that are not on a mesh until occlusion first fades a crown or building.
  localOcclusion.bindMaterial(fadeMat);
  propFades.forEach(({materials})=>materials.forEach(({fade})=>localOcclusion.bindMaterial(fade)));
  atmosphere.bind(scene);atmosphere.bindMaterial(fadeMat);
  propFades.forEach(({materials})=>materials.forEach(({fade})=>atmosphere.bindMaterial(fade)));
  let airScannedRevision=-1;
  const dynamicSurfaceRoots=[housing.group,housing.mountedGroup,workshop.group,woodcraft.group,hauling.group,gathering.group,broom.group,wildlife.group];
  const view = {
    hasPendingPresentation:()=>!inside()&&(frameWork.stats().pending>0||overlook.pending()||followTargetPending)||presentationDirty,
    setPresentationScheduler(callback:()=>void){schedulePresentation=callback;},
    setCameraAdvanceScale(value:number){overlook.setAdvanceScale(value);},
    prepareForMovement(){
      if(scenePreset)view.inspectScene(null);
      const ready=overlook.requestFollow();
      if(!ready)requestPresentation();
      return ready;
    },
    getCameraPlan(){
      const plan=overlook.plan();
      // A borrowed view can return between frames, before cameraOwner is
      // reassigned by render. Its resumed high rig still needs a forecast now.
      const navigation=!inside()&&!borrowedOutdoorCamera()&&(cameraOwner==='navigation'||!overlook.groundReady());
      const destination=plan.destination??navigationTarget(plan.desired.zoom,forecastTarget);
      const desiredTarget=[destination.x,destination.y,destination.z];
      if(navigation){
        updateNavigationForecast(forecastCamera,camera,plan.desired,destination,mobile);
        for(let index=0;index<forecastCameras.length;index++){
          const sample=overlook.forecast(OVERLOOK.forecastSeconds[index],target,pose=>navigationTarget(pose.zoom,forecastTarget));
          updateNavigationForecast(forecastCameras[index],camera,sample.pose,sample.target,mobile);
        }
      }
      else forecastCamera.copy(activeInterior()?.camera??camera);
      return {...plan,owner:cameraOwner,currentCamera:activeInterior()?.camera??camera,
        desiredCamera:forecastCamera,forecastCameras:navigation?forecastCameras:[],
        currentTarget:target.toArray(),desiredTarget};
    },
    setAmbientOcclusion:(enabled:boolean)=>(activeInterior()?.occlusion??localOcclusion).setEnabled(enabled),
    setCanopyShadows:(enabled:boolean)=>outdoorShadows.setEnabled(enabled),
    setCharacterContacts:(enabled:boolean)=>characterContacts.setEnabled(enabled),
    setAtmosphereMode:(mode:AtmosphereDebug)=>{atmosphere.setDebug(mode);river.invalidate();requestPresentation();},
    setOpticsMode:(mode:OverlookOpticsMode)=>{optics.setMode(mode);requestPresentation();},
    getAppearance:()=>({...appearance}),
    wildlifeAvailable:()=>wildlife.available(),
    wildlifeObserved:()=>wildlife.observedIds(),
    sampleFox(pose:FoxReviewPose){
      if(scenePreset!=='fox')throw Error('Select the fox scene inspector before sampling');
      foxReview={...pose};
    },
    inspectScene(preset:SceneViewPreset|null,overrides:Partial<SceneAppearance>={}){
      // Resetting a room camera must keep its borrowed camp rig untouched.
      if(inside())return;
      if(preset&&!sceneCamera)sceneCamera={yaw,elevation,zoom,target:target.clone()};
      if(!preset&&sceneCamera){({yaw,elevation,zoom}=sceneCamera);target.copy(sceneCamera.target);sceneCamera=null;}
      scenePreset=preset;sceneOverrides=preset?{...overrides}:{};
      overlook.setBorrower(preset?'scene':characters.getInspection()!==null?'character':null);
      if(preset){const p=VIEWS[preset];yaw=p.yaw;elevation=p.elevation;zoom=p.zoom;target.fromArray(p.target);}river.invalidate();
    },
    capture(state:GameState){view.render(state,0);return canvas.toDataURL('image/png');},
    canvas,
    camera,
    renderer,
    getYaw: () => activeInterior()?.view.yaw??yaw,
    cabinLampOn:()=>cabinRoom?.lampOn??false,
    setCabinLamp:(value:boolean)=>cabinRoom?.setLamp(value),
    cabinFade(value:number){fadeAmount=value;fade.style.opacity=String(value);},
    tentFade(value:number){fadeAmount=value;fade.style.opacity=String(value);},
    setTentDoorOpen(value:boolean){
      tentDoorOpen=value;
      tent.setDoorOpen(value,true);
      tentRoom?.setDoorOpen(value);
      requestPresentation();
    },
    prepareTent(){
      if(tentRoom)return;
      tentRoom=createTentRoom();
      tentRoom.camera.aspect=camera.aspect;
      tentRoom.camera.updateProjectionMatrix();
      tentRoom.occlusion.setEnabled(auditParams.get('ao')!=='off');
      tentRoom.setDoorOpen(tentDoorOpen);
      tentRoom.setDebugMode(tentDebug);
    },
    enterTent(pose:TentPlayer,state:GameState){
      if(!tentRoom)return;
      tentRoom.bindActor(player);
      tentRoom.scene.add(player);
      characters.resetLocomotion();tentPlayer=pose;
      overlook.setBorrower('tent');cameraOwner='tent';followTargetPending=false;
      tentTime=0;lastTentLightAt=state.time;
      tentRoom.resetCamera();
      const conditions=weatherSnapshot(state);
      const hour=Number.isFinite(auditHour)&&auditHour>=0&&auditHour<=24?auditHour:sceneAppearanceAt(state.time).hour;
      tentRoom.setLighting(sampleSkyLight(cabinSky,hour,conditions.cloud,conditions.rain),hour);
      tentRoom.setCanvasVariant((state.workshop.upgrades['tent:canvas']?.level??0)>0?'sage':'warm');
      canvas.setAttribute('aria-label','帐篷内');
    },
    leaveTent(focusDoor=false){
      if(!tentPlayer||!tentRoom)return;
      tentRoom.releaseActor();
      scene.add(player);outdoorShadows.bind(player);localOcclusion.bind(player);atmosphere.bind(player);
      characters.resetLocomotion();tentPlayer=null;
      overlook.setBorrower(scenePreset?'scene':characters.getInspection()!==null?'character':null);
      if(focusDoor)overlook.requestFollow();
      returnTentView=focusDoor;snapOutdoorTarget=focusDoor;
      canvas.setAttribute('aria-label','森林之家可玩山谷');river.invalidate();
    },
    prepareCabin(){
      if(cabinRoom)return;
      cabinRoom=createCabinRoom(models.templates.get('cabin')!);
      cabinRoom.camera.aspect=camera.aspect;
      cabinRoom.camera.updateProjectionMatrix();
      cabinRoom.occlusion.setEnabled(auditParams.get('ao')!=='off');
    },
    enterCabin(pose:CabinPlayer,state:GameState){
      if(!cabinRoom)return;
      atmosphere.unbind(player);
      localOcclusion.unbind(player);
      outdoorShadows.unbind(player);
      cabinRoom.scene.add(player);
      characters.resetLocomotion();
      cabinPlayer=pose;
      overlook.setBorrower('cabin');cameraOwner='cabin';followTargetPending=false;
      cabinTime=0;
      lastCabinLightAt=state.time;
      cabinRoom.resetCamera();
      cabinRoom.setLighting(light,appearance.hour);
      canvas.setAttribute('aria-label','木屋室内');
    },
    leaveCabin(focusDoor=false){
      if(!cabinPlayer||!cabinRoom)return;
      cabinRoom.occlusion.unbind(player);
      scene.add(player);
      outdoorShadows.bind(player);
      localOcclusion.bind(player);
      atmosphere.bind(player);
      characters.resetLocomotion();
      cabinPlayer=null;
      overlook.setBorrower(scenePreset?'scene':characters.getInspection()!==null?'character':null);
      if(focusDoor)overlook.requestFollow();
      returnDoorView=focusDoor;
      snapOutdoorTarget=focusDoor;
      canvas.setAttribute('aria-label','森林之家可玩山谷');
      river.invalidate();
    },
    transferPoint(clientX:number,clientY:number,wood:boolean){
      const rect=canvas.getBoundingClientRect();
      if(clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom)return null;
      screenRay(clientX,clientY);
      const hit=wood?ray.intersectObjects([...woodcraft.hits.objects(),...walkableObjects()],true)[0]:terrainHit();
      return hit?{x:hit.point.x,y:hit.point.y,z:hit.point.z}:null;
    },
    transferItemAt(clientX:number,clientY:number){
      screenRay(clientX,clientY);
      const hit=interactionHit(),terrain=terrainHit();
      if(!hit||(terrain&&hit.distance>terrain.distance+.2))return null;
      const woodId=woodcraft.hits.resolve(hit.object);
      if(woodId)return {kind:'loose-wood' as const,id:woodId};
      const id=workshop.hits.resolve(hit.object)??housing.hits.resolve(hit.object)??broom.hits.resolve(hit.object);
      return id&&id!==CAMP_VISITOR.id?{kind:'furniture' as const,id}:null;
    },
    setWoodcraftDrop(value:boolean){woodDropMode=value;},
    setPlacement(value:PlacementDraft|null){placementMode=!!value;if(value)overlook.requestFollow();workshop.setPreview(value&&lastState?.inventory.instances?.find(i=>i.instanceId===value.instanceId)?.definitionId===SEAT_DEFINITION?value:null);housing.setPreview(value);broom.setPreview(value);},
    resetCamera() {
      const room=activeInterior();
      if(room){room.resetCamera();requestPresentation();return;}
      if(borrowedOutdoorCamera()){yaw=CAMERA.yaw;elevation=CAMERA.elevation;zoom=CAMERA.zoom;}
      else overlook.reset();
      cameraInputChanged();
    },
    rotate(amount: number) {
      const room=activeInterior();
      if(room){room.orbit(-amount,0);requestPresentation();return;}
      manualCamera();
      if(borrowedOutdoorCamera())yaw+=amount;else overlook.rotate(amount);
      cameraInputChanged();
    },
    elevate(amount:number){
      if(inside()||cameraOwner==='action'||cameraOwner==='placement')return;
      manualCamera();
      if(amount>0)releaseHousingFocus();
      if(borrowedOutdoorCamera())elevation=clamp(elevation+amount,CAMERA.minElevation,OVERLOOK.maxElevation);
      else overlook.elevate(amount,target);
      cameraInputChanged();
    },
    zoomBy(amount: number) {
      const room=activeInterior();
      if(room){room.zoomBy(amount);requestPresentation();return;}
      if(amount<1&&(cameraOwner==='action'||cameraOwner==='placement'))return;
      manualCamera();
      if(amount<1)releaseHousingFocus();
      if(borrowedOutdoorCamera())zoom=clamp(zoom*amount,CAMERA.minZoom,CAMERA.maxZoom);
      else overlook.zoomBy(amount,target);
      cameraInputChanged();
    },
    setReading(value:boolean,seat?:SeatContact){if(value)broom.cancel();readingMode=value;readingFocus=value&&seat?seat:null;life.cancelMeal();mealFraming=false;characters.setReading(value,seat);life.setReading(value);view.inspectScene(value?'meal':null);if(value)yaw=(seat?.facing??DINING_SEAT.facing)-.55;},
    presentMeal(kind:'soup'|'bread',event?:MealCommitted){broom.cancel();const seat=diningReadingSpot().seat;readingFocus=seat;life.presentMeal(kind,event);mealFraming=true;characters.setReading(true,seat);view.inspectScene('meal');yaw=DINING_SEAT.facing-.55;},
    presentBroom(event:BroomUseEvent){view.cancelMeal();readingMode=false;readingFocus=null;life.setReading(false);characters.setReading(false);view.inspectScene(null);return broom.present(event);},
    isBroomPlaying:()=>broom.isPlaying(),cancelBroom:()=>broom.cancel(),
    resetPresentationHistory(){streaming.reset();view.cancelMeal();life.resetPresentationHistory();broom.resetPresentationHistory();},
    isMealPlaying:()=>life.isMealPlaying(),
    cancelMeal(){if(!mealFraming)return;life.cancelMeal();mealFraming=false;if(!readingMode){readingFocus=null;characters.setReading(false);view.inspectScene(null);}},
    ringHousingBell(id:string){housing.ring(id);},
    setRarityVfxMode(mode:RarityVfxMode){workshop.setRarityVfxMode(mode);housing.setRarityVfxMode(mode);broom.setRarityVfxMode(mode);life.setRarityVfxMode(mode);},
    setWhimsyMode(mode:WhimsyMode){broom.setWhimsyMode(mode);life.setWhimsyMode(mode);},
    setReducedMotion(value: boolean) {
      reducedMotion = value;
    },
    setWardrobe(patch:Partial<WardrobeLook>){characters.setWardrobe(patch);},
    inspectCharacter(value:CharacterInspection){
      if(value&&!inspectionCamera){inspectionCamera={yaw,elevation,zoom,target:target.clone()};yaw=player.rotation.y-(value==='wardrobe'?.34:.6);elevation=value==='wardrobe'?.16:.24;zoom=1;}
      if(!value&&inspectionCamera){({yaw,elevation,zoom}=inspectionCamera);target.copy(inspectionCamera.target);inspectionCamera=null;}
      characters.setInspection(value);
      overlook.setBorrower(value?'character':scenePreset?'scene':null);
    },
    render(state: GameState, dt: number, presentationDt = dt, prepareWork = false) {
      if (destroyed) return;
      presentationDirty=false;
      lastState=state;
      if(tentPlayer&&tentRoom){
        optics.suspend();
        tentTime+=Math.max(0,Math.min(dt,.1));
        if(Math.abs(state.time-lastTentLightAt)>=6){
          const conditions=weatherSnapshot(state);
          const hour=Number.isFinite(auditHour)&&auditHour>=0&&auditHour<=24?auditHour:sceneAppearanceAt(state.time).hour;
          tentRoom.setLighting(sampleSkyLight(cabinSky,hour,conditions.cloud,conditions.rain),hour);
          lastTentLightAt=state.time;
        }
        characters.updateInCabin(state,tentPlayer,TENT_ROOM.floorY,reducedMotion,tentTime);
        tentRoom.bindActor(player);
        tentRoom.update(tentTime,dt,reducedMotion);
        tentRoom.occlusion.updateCamera(tentRoom.camera,host.clientHeight);
        renderer.toneMappingExposure=tentRoom.exposure;
        renderer.info.reset();renderer.info.autoReset=false;
        renderer.render(tentRoom.scene,tentRoom.camera);
        schedulePresentation();return;
      }
      if(cabinPlayer&&cabinRoom){
        optics.suspend();
        cabinTime+=Math.max(0,Math.min(dt,.1));
        if(Math.abs(state.time-lastCabinLightAt)>=6){
          const conditions=weatherSnapshot(state);
          const hour=Number.isFinite(auditHour)&&auditHour>=0&&auditHour<=24?auditHour:sceneAppearanceAt(state.time).hour;
          cabinRoom.setLighting(sampleSkyLight(cabinSky,hour,conditions?.cloud??.12,conditions?.rain??0),hour);
          lastCabinLightAt=state.time;
        }
        characters.updateInCabin(state,cabinPlayer,CABIN_ROOM.floorY,reducedMotion,cabinTime);
        cabinRoom.occlusion.bind(player);
        cabinRoom.update(state.workshop.upgrades.cabin?.level??0);
        renderer.toneMappingExposure=cabinRoom.exposure;
        renderer.info.reset();renderer.info.autoReset=false;
        renderer.render(cabinRoom.scene,cabinRoom.camera);
        schedulePresentation();
        return;
      }
      renderer.toneMappingExposure=light.recommendedExposure;
      elapsed = state.time;
      ambientTime += Math.max(0,Math.min(dt,.1));
      appearance={...sceneAppearanceAt(state.time),...(Number.isFinite(auditHour)&&auditHour>=0&&auditHour<=24?{hour:auditHour}:{}),...sceneOverrides};
      if(state.ritual?.startedAt!=null&&state.time-state.ritual.startedAt<8){if(state.ritual.phase==='completed')appearance.altar='resting';else if(state.ritual.phase==='performing'&&state.time-state.ritual.startedAt>3.5)appearance.altar='answering';}
      if((sceneOverrides.hour!==undefined||Number.isFinite(auditHour))&&sceneOverrides.fire===undefined)appearance.fire=daylightAt(appearance.hour).night>.5;
      // A real cooking job lights the hearth even when the daily decorative fire is off.
      if(state.food.cooking&&sceneOverrides.fire===undefined)appearance.fire=true;
      weather.setWeather(weatherSnapshot(state),dt);
      environment.setWeather(weather.profile);
      const sky=environment.setHour(appearance.hour);
      hemi.color.copy(light.skyColor);hemi.groundColor.copy(light.groundColor);hemi.intensity=light.ambientIntensity;
      sun.color.copy(light.sunColor);sun.intensity=light.sunIntensity;
      scene.environmentIntensity=light.environmentIntensity;
      atmosphere.update(light,weather.profile.cloud,weather.profile.rain);
      if(state.workshop.job?.kind==='offering'&&state.workshop.job.phase==='working')appearance.altar='answering';
      camp.update(ambientTime,appearance,state.inventory,sky.night,reducedMotion,!!state.food.drying,(state.workshop.upgrades[CAMP_PROPS.dryer.id]?.level??0)>0);
      const { x, z, facing, moving } = state.player,
        y = travelHeightAt(x,z,travelAccess(state));
      followPlayer.set(x,y,z);
      streaming.update(state);
      // Immediate UI/capture redraws can reconcile state but cannot consume
      // another allowance. Only the main frame owner grants this slice.
      if(prepareWork)frameWork.run({budgetMs:mobile?FRAME_WORK_BUDGET.compactMs:FRAME_WORK_BUDGET.desktopMs,maxSteps:FRAME_WORK_BUDGET.maxSteps});
      bridge.update(state);
      forestry.update(state,reducedMotion);understory.update(state,streaming.activeChunks,streaming.residencyRevision);
      if(mealFraming&&(state.player.moving||state.route.length||state.workshop.job||state.forestry.active||state.gathering.action?.phase==='performing'))view.cancelMeal();
      life.restorePose();
      broom.restorePose();
      characters.update(state,reducedMotion,ambientTime);
      neighbour.update(state,reducedMotion,ambientTime);
      villagers.update(state,reducedMotion);
      life.update(state,dt,reducedMotion);
      broom.update(state,dt,reducedMotion,sky.night);
      if(mealFraming&&!life.isMealPlaying())view.cancelMeal();
      housing.update(state,dt,reducedMotion,sky.night);
      merchantWagon.update(state.time,reducedMotion);
      forestry.alignContact(characters.getImpact());
      gathering.update(state.gathering,streaming.activeChunks);
      hauling.update(state.inventory,state.player,travelAccess(state));
      cabinRepair.update(state.workshop.upgrades?.cabin?.level??0);
      campExteriors.update(state.workshop);
      tent.update({time:Number.isFinite(fixedTentWind)?fixedTentWind:ambientTime,delta:dt,reducedMotion,
        windStrength:.35+weather.profile.rain*.35+weather.profile.snowfall*.15,windDirection:{x:.8,z:.3}});
      const action=state.gathering.action,ritual=state.ritual,craft=state.workshop.job;
      const sweeping=broom.action();
      characters.present(ambientTime,reducedMotion,!!sweeping||life.isMealPlaying());
      cameraAction=sweeping?.id??(craft?.phase==='working'?craft.id:action?.phase==='performing'?action.actionId:ritual?.phase==='performing'?`prayer-${ritual.startedAt}`:'');
      const guidedCraft=craft?.phase==='working'&&!!craft.assembly;
      const inspection=characters.getInspection(),inspecting=inspection!==null;
      const wardrobeCamera=inspection==='wardrobe';
      const wantsFraming=!!cameraAction && cameraOverride!==cameraAction && (!reducedMotion||guidedCraft||sweeping) && !scenePreset && !inspecting;
      if(wantsFraming)overlook.requestFollow();
      overlook.setBorrower(scenePreset?'scene':inspecting?'character':null);
      navigationTarget(overlook.plan().current.zoom,followTarget);
      if(overlook.plan().mode==='overlook'&&overlook.pending()&&!scenePreset&&!inspecting){
        // Recheck new input before advancing, including the first high-view
        // frame. Continuous drag can proceed whenever its next views are ready.
        sun.updateMatrixWorld();sun.target.updateMatrixWorld();sun.shadow.updateMatrices(sun);
        const upcoming=forestViewPlanner.plan({camera,state,forecastCameras:view.getCameraPlan().forecastCameras,
          shadowCamera:sun.shadow.camera,mirrorY:WORLD.waterY,guard:5});
        streaming.requestView(upcoming.wantedIDs);
        // The solid horizon already exists: keep aerial turns at the requested rate.
        overlook.setAdvanceScale(1);
      }
      const wasReturning=overlook.plan().mode==='returning';
      overlook.update(presentationDt,followTarget);
      const cameraPlan=overlook.plan();
      if(wasReturning&&cameraPlan.groundReady&&!scenePreset&&!inspecting)target.copy(followTarget);
      if(!scenePreset&&!inspecting)({yaw,elevation,zoom}=cameraPlan.current);
      if(cameraPlan.groundReady)overlookSelection=undefined;
      const framed=wantsFraming&&cameraPlan.groundReady;
      const actionTime=sweeping?.elapsed??(craft?.phase==='working'?state.time-craft.startedAt!:action?.phase==='performing'?state.time-action.startedAt!:ritual?.phase==='performing'?state.time-ritual.startedAt!:0);
      const actionLength=sweeping?.duration??(craft?.phase==='working'?craft.durationSeconds:action?.phase==='performing'?action.durationSeconds:5.5);
      const guidedBlend=!guidedCraft?0:reducedMotion?1:craft.assembly!.phase==='preparing'?ramp(actionTime,0,.65):craft.assembly!.phase==='finishing'?1-ramp(actionTime,actionLength-.65,actionLength):1;
      const blend=framed?(guidedCraft?guidedBlend:sweeping&&reducedMotion?1:ramp(actionTime,0,.65)*(1-ramp(actionTime,actionLength-.75,actionLength))):0;
      const climbing=action?.phase==='performing'&&action.motionTag==='gather.climb';
      const rear=action?.phase==='performing'&&action.motionTag==='gather.pluck';
      const actionYaw=player.rotation.y+(sweeping?sweeping.yawOffset:Math.PI+(guidedCraft?-1.12:rear?0:-.8));
      const viewYaw=yaw+Math.atan2(Math.sin(actionYaw-yaw),Math.cos(actionYaw-yaw))*blend;
      const viewElevation=THREE.MathUtils.lerp(elevation,guidedCraft?.44:sweeping?.40:climbing?THREE.MathUtils.lerp(.10,.28,ramp(actionTime,2,3.2)):.28,blend);
      const housingItem=state.inventory.instances?.find(i=>i.instanceId===state.selected);
      const distanceToDoor=Math.hypot(x-CABIN_PORTAL.landing.x,z-CABIN_PORTAL.landing.z);
      if(distanceToDoor>3||state.selected&&state.selected!=='cabin')returnDoorView=false;
      const focusDoor=(state.selected==='cabin'||returnDoorView)&&distanceToDoor<4;
      const distanceToTent=Math.hypot(x-TENT_PORTAL.landing.x,z-TENT_PORTAL.landing.z);
      if(distanceToTent>3||state.selected&&state.selected!=='tent')returnTentView=false;
      const focusTent=(state.selected==='tent'||returnTentView)&&distanceToTent<4;
      const housingPoint=focusDoor?CABIN_PORTAL.threshold:focusTent?TENT_PORTAL.threshold:housingItem?.definitionId===HOUSING.doorbell.definitionId&&housingItem.location.kind==='mounted'?HOUSING.doorbell.point:
        state.selected===WORKBENCH.id?WORKBENCH:housingItem&&isHousingFurniture(housingItem.definitionId)&&housingItem.location.kind==='world'?housingItem.location:null;
      if(releasedHousingId!==undefined&&state.selected!==releasedHousingId)releasedHousingId=undefined;
      const requestedHousing=!scenePreset&&!framed&&!inspecting&&releasedHousingId===undefined&&housingPoint&&Math.hypot(state.player.x-housingPoint.x,state.player.z-housingPoint.z)<6?housingPoint:null;
      if(requestedHousing&&!cameraPlan.groundReady&&state.selected!==overlookSelection)overlook.requestFollow();
      const focusHousing=cameraPlan.groundReady?requestedHousing:null;
      const focusPlacement=placementMode&&!scenePreset&&!framed&&!inspecting&&cameraPlan.groundReady;
      cameraOwner=scenePreset?'scene':inspecting?'character':framed?'action':focusPlacement?'placement':focusHousing?'housing':'navigation';
      const actionDistance=guidedCraft?(mobile?13:11.5):sweeping?(mobile?13:11):climbing?THREE.MathUtils.lerp(9,22,ramp(actionTime,2,3.2)):10;
      const framing = Math.min(1, (CAMERA.zoom / zoom) ** 2);
      desired.set(x,y+(inspecting?1.25:1.5),z).lerp(overview,inspecting?0:(mobile ? .12 : .75)*framing*clamp(1-(Math.hypot(x-HOME.x,z-HOME.z)-20)/50,0,1));
      if(focusHousing){
        const focusHeight=focusDoor?heightAt(CABIN.x,CABIN.z)+CABIN_EXTERIOR.threshold.y*CABIN_EXTERIOR.scale+1.6:focusTent?heightAt(TENT.x,TENT.z)+2.3:
          focusHousing===HOUSING.doorbell.point?props.get('cabin')!.localToWorld(new THREE.Vector3(HOUSING.doorbell.anchor.x,HOUSING.doorbell.anchor.y,HOUSING.doorbell.anchor.z)).y:heightAt(focusHousing.x,focusHousing.z)+1.2;
        desired.set(focusHousing.x,focusHeight,focusHousing.z);
      }
      if(focusPlacement)desired.set(x,y+.7,z);
      if(inspecting||snapOutdoorTarget&&!cameraPlan.anchor)target.copy(desired);else if(scenePreset){target.fromArray(VIEWS[scenePreset].target);if(scenePreset==='altar')target.y=camp.foundation.levelY+1.9;if(scenePreset==='ritual')target.y=camp.foundation.levelY+2.5;}else if(cameraPlan.anchor)target.copy(cameraPlan.anchor);else target.lerp(desired,reducedMotion?1:1-Math.exp(-presentationDt*5));
      snapOutdoorTarget=false;
      if(scenePreset==='meal'&&readingFocus){target.set(readingFocus.x,heightAt(readingFocus.x,readingFocus.z)+1.1,readingFocus.z);}
      desired.copy(player.position).add(new THREE.Vector3(0,climbing?THREE.MathUtils.lerp(.85,2.3,ramp(actionTime,2,3.2)):1,0));target.lerp(desired,blend);if(mobile)target.y-=1.1*blend;
      if(guidedCraft&&framed)target.set(WORKBENCH.x,heightAt(WORKBENCH.x,WORKBENCH.z)+1.55,WORKBENCH.z);
      if(sweeping&&framed)target.set(sweeping.focus.x,heightAt(sweeping.focus.x,sweeping.focus.z)+.85,sweeping.focus.z);
      followTargetPending=cameraOwner==='navigation'&&!cameraPlan.anchor&&target.distanceTo(navigationTarget(zoom,followTarget))>OVERLOOK.targetEpsilon;
      offset
        .set(
          Math.sin(viewYaw) * Math.cos(viewElevation),
          Math.sin(viewElevation),
          Math.cos(viewYaw) * Math.cos(viewElevation),
        )
        .multiplyScalar(wardrobeCamera?7.5:inspecting?11:scenePreset?VIEWS[scenePreset].distance:focusPlacement?22:focusHousing?21:THREE.MathUtils.lerp(cameraPlan.current.distance,actionDistance,blend));
      camera.position.copy(target).add(offset);
      if(cameraOwner==='navigation')positionNavigationCamera(camera,cameraPlan.current,target);
      else if(camera.position.x>WORLD.minX&&camera.position.x<WORLD.maxX&&camera.position.z>WORLD.minZ&&camera.position.z<WORLD.maxZ)camera.position.y=Math.max(camera.position.y,heightAt(camera.position.x,camera.position.z)+(scenePreset==='fox'?.6:wardrobeCamera?.8:THREE.MathUtils.lerp(3,.4,blend)));
      if(scenePreset)for(const tree of trees)if(Math.hypot(camera.position.x-tree.x,camera.position.z-tree.z)<3*tree.scale)camera.position.y=Math.max(camera.position.y,heightAt(tree.x,tree.z)+9*tree.scale);
      camera.lookAt(target);
      workshop.update(state,camera,dt,reducedMotion,sky.night);woodcraft.update(state.woodcraft);
      camera.zoom = THREE.MathUtils.lerp(zoom,1,blend) * (mobile ? scenePreset?.8:THREE.MathUtils.lerp(1.45,.9,blend) : 1);
      if(focusHousing)camera.zoom=1;
      if(focusPlacement)camera.zoom=1.05;
      if((readingMode||mealFraming)&&camera.aspect>=1&&host.clientWidth<1000){camera.setViewOffset(host.clientWidth,host.clientHeight,host.clientWidth*.24,0,host.clientWidth,host.clientHeight);}
      else if((guidedCraft||sweeping)&&framed&&mobile&&camera.aspect>=1){camera.setViewOffset(host.clientWidth,host.clientHeight,-host.clientWidth*.20,0,host.clientWidth,host.clientHeight);}
      else if((readingMode||mealFraming||focusHousing||(guidedCraft||sweeping)&&framed)&&mobile&&camera.aspect<1){camera.setViewOffset(host.clientWidth,host.clientHeight,0,host.clientHeight*((readingMode||mealFraming) ? .25 : (guidedCraft||sweeping)&&framed ? .22 : .16),host.clientWidth,host.clientHeight);}
      else camera.clearViewOffset();
      if(['wildlife','stagVista','goatVista'].includes(scenePreset??'')&&camera.aspect<1)camera.zoom*=camera.aspect;
      camera.fov=40;
      if(cameraOwner==='navigation')applyNavigationOptics(camera,cameraPlan.current,mobile);
      camera.updateProjectionMatrix();
      environment.update(ambientTime,dt,camera.position,reducedMotion);
      scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
      river.update(ambientTime,sky.day,reducedMotion,appearance.reflections,host.clientWidth<600||host.clientHeight<500);
      const selected = state.selected
        ? ((state.selected===RIDGE_NEIGHBOUR.id?neighbour.point():null) ?? (state.selected===CREEK_BRIDGE.id?CREEK_BRIDGE.stand:null) ?? broom.point(state.selected) ?? housing.point(state.selected) ?? hauling.point(state.selected) ?? woodcraft.point(state.selected) ?? workshop.point(state.selected) ?? (state.selected===CAMP_VISITOR.id?CAMP_VISITOR:null) ?? gatheringRegistry.sources.get(state.selected) ?? treeById.get(state.selected) ??
          (state.selected === "cabin"
            ? CABIN
            : state.selected === "tent"
              ? TENT
              : Object.values(CAMP_PROPS).find(p=>p.id===state.selected)??null))
        : null;
      marker.update(state.selected,selected,(x,z)=>travelHeightAt(x,z,travelAccess(state)));
      destination.visible = state.route.length > 0;
      if (state.route.length) {
        const p = state.route[state.route.length - 1];
        destination.position.set(p.x, travelHeightAt(p.x,p.z,travelAccess(state))+.09, p.z);
      }
      // Project the actual crown bounds; large landmark scale must not trigger early fading.
      // Bark stays opaque. Stable tree coordinates and colliders never change.
      const playerScreen = new THREE.Vector3(x, y + 1.7, z).project(camera),
        screen = new THREE.Vector3();
      headWorld.set(x,y+1.7,z);headDirection.copy(headWorld).sub(camera.position);
      occlusionRay.set(camera.position,headDirection.clone().normalize());occlusionRay.far=headDirection.length()-.15;
      forest.selections.forEach((o, id) => {
        if(!o.visible||o.userData.forestrySelectable===false){(o as THREE.Mesh).material=forest.material;return;}
        const bounds=crownBounds.get(id)!;
        let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
        for(const xx of [bounds.min.x,bounds.max.x])
          for(const yy of [bounds.min.y,bounds.max.y])
            for(const zz of [bounds.min.z,bounds.max.z]){
              projectedCorner.set(xx,yy,zz).applyMatrix4(o.matrixWorld).project(camera);
              left=Math.min(left,projectedCorner.x);right=Math.max(right,projectedCorner.x);
              bottom=Math.min(bottom,projectedCorner.y);top=Math.max(top,projectedCorner.y);
            }
        bounds.getCenter(occluderCenter).applyMatrix4(o.matrixWorld).project(camera);
        const possible=playerScreen.x>left && playerScreen.x<right && playerScreen.y>bottom && playerScreen.y<top && occluderCenter.z<playerScreen.z;
        const hit=possible ? occlusionRay.intersectObject(o,false)[0] : undefined;
        const overlap=!!hit && localHit.copy(hit.point).applyMatrix4(inverseTreeMatrix.copy(o.matrixWorld).invert()).y>2.4;
        (o as THREE.Mesh).material = overlap ? fadeMat : forest.material;
      });
      propFades.forEach(({ center, radius, materials }) => {
        screen.copy(center).project(camera);
        const aspect=camera.aspect,
          halfH = camera.position.distanceTo(center)*Math.tan(camera.fov*Math.PI/360)/camera.zoom;
        const overlap =
          Math.abs(screen.x - playerScreen.x) < radius / (halfH * aspect) &&
          Math.abs(screen.y - playerScreen.y) < radius / halfH &&
          screen.z < playerScreen.z;
        materials.forEach(({ mesh, opaque, fade }) => {
          mesh.material = overlap ? fade : opaque;
        });
      });
      const wildlifeSeen=wildlifeViews(state.wildlife,state.time).filter(v=>scenePreset!=='fox'||v.definitionId!=='wildlife.fox');
      if(scenePreset==='stagVista')wildlifeSeen.push(landmarkInspectionView('wildlife.stag',state.time));
      if(scenePreset==='goatVista')wildlifeSeen.push(landmarkInspectionView('wildlife.goat',state.time));
      if(scenePreset==='fox')wildlifeSeen.push(foxInspectionView());
      wildlife.update(wildlifeSeen,state.time,appearance.hour,camera,reducedMotion,headWorld,scenePreset==='fox'?foxReview:undefined);
      weather.update(ambientTime,dt,state.player,camera,host.clientWidth<600||host.clientHeight<500,reducedMotion);
      outdoorShadows.update(state,dt,light.sunDirection,sky.night,player.position);
      // Shadow cameras are normally refreshed by Three during the draw. The
      // visibility plan must consume this frame's sun and target instead.
      sun.updateMatrixWorld();sun.target.updateMatrixWorld();sun.shadow.updateMatrices(sun);
      const forestView=forestViewPlanner.plan({camera,state,forecastCameras:view.getCameraPlan().forecastCameras,
        shadowCamera:sun.shadow.camera,mirrorY:WORLD.waterY,guard:5});
      streaming.requestView(forestView.wantedIDs);
      frameViewRepairs=streaming.ensureCurrentView(forestView.currentIDs);
      forestViewReady=streaming.isViewReady(forestView.wantedIDs);
      // Keep readiness in diagnostics; do not stall the camera for fine scenic trees.
      overlook.setAdvanceScale(1);
      forestViewStats=forestView.stats;
      localOcclusion.update(state,dt,camera,sky.night);
      localOcclusion.updateCamera(camera,host.clientHeight);
      characterContacts.update([...characters.footContacts(),...villagers.footContacts()]);
      localOcclusion.setCharacterContacts(characterContacts.contacts());
      if(airScannedRevision!==streaming.residencyRevision){
        outdoorShadows.bindTree(forest.group);localOcclusion.bind(forest.group);atmosphere.bind(forest.group);
        airScannedRevision=streaming.residencyRevision;
      }
      // Small dynamic roots may acquire new materials during ordinary gameplay.
      for(const root of dynamicSurfaceRoots){
        outdoorShadows.bind(root);localOcclusion.bind(root);atmosphere.bind(root);
      }
      renderer.info.reset();renderer.info.autoReset=false;
      optics.render(scene,camera,{amount:cameraOwner==='navigation'?overlookAmount(cameraPlan.current):0,
        focusDistance:camera.position.distanceTo(target),compact:host.clientWidth<600||host.clientHeight<500});
      weather.renderLens(renderer);
      outsideFrames++;
      schedulePresentation();
    },
    stats() {
      const doorHitPoint=tent.group.localToWorld(new THREE.Vector3(0,2.25,TENT_SHAPE.doorZ+.03));
      const doorNdc=doorHitPoint.clone().project(camera);
      const doorScreenPoint={x:(doorNdc.x+1)*canvas.clientWidth/2,y:(1-doorNdc.y)*canvas.clientHeight/2,
        visible:!inside()&&Math.abs(doorNdc.x)<1&&Math.abs(doorNdc.y)<1&&doorNdc.z>-1&&doorNdc.z<1};
      const floorNdc=tentRoom?new THREE.Vector3(0,TENT_ROOM.floorY,.3).project(tentRoom.camera):null;
      return {
        life:life.stats(),broom:broom.stats(),housing:housing.stats(),woodcraft:woodcraft.stats(),workshop:workshop.stats(),understory:understory.stats(),treeShapes:trees.reduce((counts,t)=>{const name=treeVisual(t).name;counts[name]=(counts[name]??0)+1;return counts;},{} as Record<string,number>),appearance:{...appearance},scenePreset,camp:camp.stats(),terrain:ground.geometry.userData,shaderErrors,
        resources: r.stats(),
        occlusion:(activeInterior()?.occlusion??localOcclusion).stats(),
        tentExterior:{...tent.stats(),doorHitPoint:doorHitPoint.toArray(),doorScreenPoint},
        sceneSpace:{active:tentPlayer?'tent':cabinPlayer?'cabin':'outdoor',outsideFrames,fade:fadeAmount,cabin:cabinRoom?.stats()??null,
          tent:tentRoom?{...tentRoom.stats(),floorTapScreenPoint:floorNdc?{x:(floorNdc.x+1)*canvas.clientWidth/2,y:(1-floorNdc.y)*canvas.clientHeight/2}:null}:null,
          outdoorCamera:{yaw,elevation,zoom,target:target.toArray(),position:camera.position.toArray(),fov:camera.getEffectiveFOV(),aspect:camera.aspect,owner:cameraOwner,overlook:overlook.plan()}},
        shadows:outdoorShadows.stats(),characterContacts:characterContacts.stats(),
        wildlife:wildlife.stats(),
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        gpu: { ...renderer.info.memory },
        zoom,
        yaw,
        elevation,
        canvas: { width: canvas.width, height: canvas.height },
        treeCount: trees.length,
        fadedTreeIds: [...forest.selections].filter(([,object])=>(object as THREE.Mesh).material===fadeMat).map(([id])=>id),
        graphicsBackend,
        managedTrees: trees.filter((t) => t.role === "managed").length,
        hauling:hauling.stats(),
        streaming:streaming.stats(),
        frameWork:frameWork.stats(),
        forestView:{...forestViewStats,ready:forestViewReady,frameRepairs:frameViewRepairs},
        gatheringHits: gathering.hits.size,
        characters:characters.stats(),
        neighbour:neighbour.stats(),
        villagers:villagers.stats(),
        gatheringPresentation: gathering.stats(),
        environment:environment.stats(),
        atmosphere:atmosphere.stats(),optics:optics.stats(),campRegion:RAINIER_CAMP.id,
        weatherPresentation:weather.stats(),
        horizon:{...horizon.stats(),impostorLoadError},
        river:river.stats(),
        destroyed,
        contextLost: renderer.getContext().isContextLost(),
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      frameWork.dispose();
      schedulePresentation=()=>{};
      observer.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("contextmenu", contextMenu);
      pointers.clear();
      cabinRoom?.dispose();
      tentRoom?.dispose();
      atmosphere.dispose();
      optics.dispose();
      localOcclusion.dispose();
      characterContacts.dispose();outdoorShadows.dispose();
      weather.dispose();
      woodcraft.dispose();
      workshop.dispose();
      housing.dispose();
      broom.dispose();
      life.dispose();
      forestry.dispose();
      streaming.dispose();bridge.dispose();
      characters.dispose();
      neighbour.dispose();
      villagers.dispose();
      merchantWagon.dispose();
      wildlife.dispose();
      gathering.dispose();
      campExteriors.dispose();
      hauling.dispose();
      cabinRepair.dispose();
      river.dispose();
      camp.dispose();
      environment.dispose();
      horizon.dispose();
      scene.environment=null;
      scene.clear();
      props.clear();
      forest.selections.clear();
      models.clear();
      r.dispose();
      sun.shadow.map?.depthTexture?.dispose();
      sun.shadow.map?.dispose();
      sun.shadow.mapPass?.dispose();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      fade.remove();
    },
  };
  return view;
}
export type SceneView = Awaited<ReturnType<typeof createScene>>;
