import { CAMP_FOREST_TRAIL } from '../content/forest-expedition.ts';
import { campWithExpedition, nearCampForestTrail, nearExpeditionExit, openCampExpedition, campExpeditionContext } from '../domain/camp-expedition.ts';
import type { ForestExpeditionState } from '../domain/forest-expedition.ts';
import { isCarried } from '../domain/transport-location.ts';
import {travelAccess,regionAt,blessingAt} from '../world/regions.ts';
import {createNpcSession} from './npc-session.ts';
import type {NeighbourView} from './npc-session.ts';
import type {NpcVisitInteraction} from '../domain/npc-visit.ts';
import {RIDGE_NEIGHBOUR} from '../content/npcs/ridge-neighbour/profile.ts';
import {travelHeightAt} from '../world/traversal.ts';
import {CREEK_BRIDGE} from '../content/regions.ts';
import {unpackFoodSack} from '../domain/food.ts';
import {housingSnapshot,learnHousingBlueprint,beginHousingCraft,mountHousingItem,detachHousingItem,ringHousingBell,safeBenchReadingSpot,safeDiningReadingSpot,seatingColliders} from '../domain/housing.ts';
import {isHousingBlueprint} from '../content/housing.ts';
import {WORKBENCH_BRACING} from '../content/workshop-series.ts';
import {guidedWorkshopSnapshot,learnWorkshopPlan,beginGuidedCraft,setGuidedCraftDimensions,adjustGuidedPart,submitGuidedPart,finishGuidedCraft,cancelGuidedCraft} from '../domain/workshop-guided.ts';
import type {GuidedPartAdjustment} from '../domain/workshop-guided.ts';
import {potFoundationSnapshot,learnPotFoundation} from '../domain/pot-foundation.ts';
import {mealVesselsSnapshot,learnMealVessel,beginMealVesselCraft} from '../domain/meal-vessels.ts';
import {broomSnapshot,learnBroomBlueprint,beginBroomCraft,approachBroomPatch,useBroom} from '../domain/broom.ts';
import {itemOracleSnapshot,beginItemOracle} from '../domain/item-oracle.ts';
import {wardrobeSnapshot,changeWardrobe} from '../domain/wardrobe.ts';
import type {WardrobeView,WardrobeIntent} from '../domain/wardrobe.ts';
import {currentLoad,carryingSnapshot,changeCarrying,approachGround} from '../domain/carrying.ts';
import type {CarryingSnapshot,CarryIntent} from '../domain/carrying.ts';
import { createWildlife, advanceWildlife, validateWildlifeRegistry, wildlifeViews } from '../domain/wildlife.ts';
import type {RarityVfxMode} from '../content/item-vfx.ts';
import {isWhimsyMode} from '../content/whimsy-display.ts';
import type {WhimsyMode} from '../content/whimsy-display.ts';
import {createWoodcraftSession} from './woodcraft-session.ts';
import type {WoodcraftSnapshot} from './woodcraft-session.ts';
import {WOODCRAFT} from '../content/woodcraft.ts';
import {createItemTransfers} from './item-transfers.ts';
import {interactionAccess,approachInteraction} from '../domain/interaction-access.ts';
import type {InteractionAccess,ItemTransferIntent} from '../domain/interaction-access.ts';
import {beginUpgrade,approachUpgrade,mountFireTop} from '../domain/upgrades.ts';
import {beginWorkshop,advanceWorkshop,workshopSnapshot,tradeBlueprint,tradeSupply,workshopBusy} from '../domain/workshop.ts';
import {merchantSnapshot,exchangeMerchant} from '../domain/merchant.ts';
import type {MerchantOrder,MerchantSnapshot} from '../domain/merchant.ts';
import type {WorkshopSnapshot} from '../domain/workshop.ts';
import {CLOCK_SPEEDS} from '../domain/local-clock.ts';
import {advanceToEveningStop,sleepUntilSunrise,dayCycleSnapshot,readingReason,campExitPoint} from '../domain/day-cycle.ts';
import {advanceFood,foodSnapshot,startDryMushrooms,startMushroomSoup,startGrainPorridge,consumeMeal} from '../domain/food.ts';
import {FOOD_SOUP_ITEM_ID,FOOD_PORRIDGE_ITEM_ID} from '../content/food.ts';
import type {FoodGrain} from '../content/food.ts';
import type {ClockSpeed} from '../domain/local-clock.ts';
import {workstationColliders,furnitureColliders,placementReason,placeFurniture,packFurniture,suggestFurniturePlacement} from '../domain/furniture-placement.ts';
import type {PlacementDraft} from '../domain/furniture-placement.ts';
import {CAMP_VISITOR} from '../content/characters.ts';
import type {WardrobeLook} from '../content/wardrobe-preview.ts';
import {beginRitual,advanceRitual,ritualBusy} from '../domain/ritual.ts';
import { MOVEMENT, WAYPOINTS } from "../content/world.ts";
import { CABIN_PORTAL, CABIN_ROOM } from '../content/cabin.ts';
import {FORESTRY} from '../content/forestry.ts';
import type { Point } from "../content/world.ts";
import { createStarterState } from "../domain/state.ts";
import type {GameState} from '../domain/state.ts';
import {startChop,cancelChop,advanceForestry,forestrySnapshot,forestryColliders} from '../domain/forestry.ts';
import type {ForestrySnapshot} from '../domain/forestry.ts';
import { findPath, move,canStand } from "../domain/navigation.ts";
import {movementOffset} from '../domain/movement.ts';
import { atCabinEntrance, cabinActionPoint, cabinApproachRoute, makeCabinVisit, nearCabinAction, stepCabinVisit } from '../domain/cabin.ts';
import type { CabinAction, CabinVisit } from '../domain/cabin.ts';
import { makeColliders, makeTrees } from "../world/layout.ts";
import { heightAt, zoneName } from "../world/surface.ts";
import { createScene } from "../scene/create-scene.ts";
import { createLoop } from "./runtime-loop.ts";
import { RUNTIME_MODELS } from '../content/assets.ts';
import { START,TENT } from '../content/world.ts';
import { createGatheringRegistry } from '../domain/gathering-registry.ts';
import { gatheringBusy, synchronizeGatheringHosts } from '../domain/gathering.ts';
import { gatheringSnapshot } from '../domain/gathering-view.ts';
import type { GatheringSnapshot } from '../domain/gathering-view.ts';
import { cancelPlayerAction, startPlayerChop, startPlayerGather, advancePlayerGather } from './player-actions.ts';
import { warehouseSnapshot } from '../domain/warehouse-view.ts';
import type { WarehouseView } from '../domain/warehouse-view.ts';
import { validateWorldSession } from './session-upgrade.ts';
import { createSaveContext } from '../domain/save-context.ts';
import { createBrowserWorldSaveStore } from './world-save-store.ts';
import { createSaveController } from './save-controller.ts';
import type { SaveController, SaveStatus } from './save-controller.ts';
import type {SceneAppearance,SceneViewPreset} from '../content/scene-props.ts';
import {CAMP_PROPS} from '../content/scene-props.ts';
import {ALTAR_LAYOUT} from '../content/altar.ts';
import {advanceWeather,weatherSnapshot,setWeather as chooseWeather,setWeatherIntensity as changeWeatherIntensity,setWeatherAutomatic as changeWeatherAutomatic} from '../domain/weather.ts';
export type Snapshot = {
  cabin: { inside: boolean; atDoor: boolean; crossing: boolean; lampOn: boolean };
  neighbour:NeighbourView;
  weather:ReturnType<typeof weatherSnapshot>|null;
  carrying:CarryingSnapshot;
  interaction:InteractionAccess|null;
  woodcraft:WoodcraftSnapshot;
  workshop:WorkshopSnapshot;
  merchant:MerchantSnapshot;
  food:ReturnType<typeof foodSnapshot>;
  dayCycle:ReturnType<typeof dayCycleSnapshot>;
  housing:ReturnType<typeof housingSnapshot>;
  guidedWorkshop:ReturnType<typeof guidedWorkshopSnapshot>;
  potFoundation:ReturnType<typeof potFoundationSnapshot>;
  mealVessels:ReturnType<typeof mealVesselsSnapshot>;
  broom:ReturnType<typeof broomSnapshot>;
  itemOracle:ReturnType<typeof itemOracleSnapshot>;
  life:{mealPlaying:boolean;broomPlaying:boolean};
  placement:PlacementDraft|null;
  zone: string;
  x: number;
  z: number;
  height: number;
  selected: string | null;
  moving: boolean;
  running: boolean;
  visited: string[];
  paused: boolean;
  message: string;
  stats: Record<string, unknown>;
  forestry:ForestrySnapshot;
  gathering: GatheringSnapshot;
  warehouse: WarehouseView;
  wardrobe:WardrobeView;
  save: SaveStatus;
  appearance:SceneAppearance;
};
export async function createRuntime(
  host: HTMLElement,
  publish: (value: Snapshot) => void,
  initialState?:GameState,
  saveOwner?: SaveController,
  initialRarityVfxMode:RarityVfxMode = 'full',
  initialWhimsyMode:WhimsyMode = 'full',
) {
  const trees = makeTrees(),
    treeById=new Map(trees.map(t=>[t.id,t])),
    colliders = makeColliders(trees);
  const registry = createGatheringRegistry({ assetIds: RUNTIME_MODELS.map(a => a.assetId) });
  const saveContext = createSaveContext(trees, registry);
  const persistence = saveOwner ?? createSaveController(createBrowserWorldSaveStore(), saveContext);
  const savedState = await persistence.load();
  const state = initialState ?? savedState ?? createStarterState(trees);
  validateWorldSession(state, saveContext);
  advanceWeather(state);
  // Source registration is validated above; compute navigation when the player
  // chooses an action instead of synchronously auditing every source on startup.
  synchronizeGatheringHosts(state, registry);
  validateWildlifeRegistry(RUNTIME_MODELS.map(a => a.assetId));
  let message = "沿着小路，认识你的新家。",
    manualPause = !state.expedition?.active && (!initialState && savedState !== null || !persistence.status().canSave),
    forestTransition = false,
    interfaceOpen = false,
    menuOpen = false,
    inspectionOpen = false,
    contextLost = false,
    destroyed = false,
    accumulator = 0,
    reportTime = 0;
  let placement:PlacementDraft|null=null;
  let cabin:CabinVisit|null=null;
  let crossing:{entering:boolean;elapsed:number;switched:boolean}|null=null;
  let reducedMotion=false;
  let reading=false;
  let captureAt:number|null=null;
  let captureHoldToken:number|null=null;
  let restoringCaptureHold=false;
  const keys = new Set<string>(),
    stick = { x: 0, z: 0 };
  let runToggle=false;
  const running=()=>runToggle||keys.has('ShiftLeft')||keys.has('ShiftRight');
  const inForest=()=>forestTransition||state.expedition?.active===true;
  const resetMovementInput=()=>{keys.clear();stick.x=stick.z=0;runToggle=false;};
  const woodcraft=createWoodcraftSession(state,m=>{message=m;});
  if(state.selected===WOODCRAFT.id||state.woodcraft.pieces.some(p=>p.id===state.selected))woodcraft.activate();
  const activeColliders=()=>[...((state.workshop.upgrades[CAMP_PROPS.dryer.id]?.level??0)>0?[{id:CAMP_PROPS.dryer.id,x:CAMP_PROPS.dryer.x,z:CAMP_PROPS.dryer.z,radius:.95}]:[]),{id:WOODCRAFT.id,x:WOODCRAFT.x,z:WOODCRAFT.z,halfX:WOODCRAFT.halfX+.2,halfZ:WOODCRAFT.halfZ+.2},...forestryColliders(colliders,treeById,state.forestry,state.time),...workstationColliders(),...furnitureColliders(state),...seatingColliders()];
  const neighbour=createNpcSession(state,activeColliders,value=>{message=value;});
  const cabinSnapshot=()=>({inside:!!cabin,atDoor:!cabin&&atCabinEntrance(state.player),crossing:!!crossing,lampOn:view.cabinLampOn()});
  const inputBlocked=()=>destroyed||inForest()||manualPause||interfaceOpen||inspectionOpen||contextLost||document.hidden||!!crossing;
  // Recover this prototype's previous waking point if it left the player inside
  // the tent collision. Preserve the earned world, clock and all inventories.
  if(state.dayCycle.wokeAt!==null&&Math.hypot(state.player.x-TENT.x,state.player.z-TENT.z)<8&&!canStand(state.player,activeColliders())){
    const exit=campExitPoint(activeColliders());
    if(exit){state.player={...state.player,...exit,moving:false};state.route=[];message='已经走到帐篷出口，可以继续探索。';}
  }
  const navigate = (p: Point) => {
    woodcraft.cancelDrop();view.setWoodcraftDrop(false);view.inspectScene(null);
    const cancelled=cancelPlayerAction(state);if(cancelled)message=cancelled;
    const route = findPath(state.player, p, activeColliders(),travelAccess(state));
    state.route = route;
    message = route.length
      ? "沿小路前往目的地"
      : "这里暂时无法到达，请选择小路或空地。";
  };
  const view = await createScene(host, trees, (event) => {
    const propSelection=inspectionOpen&&event.kind==='select'&&(Object.values(CAMP_PROPS).some(p=>p.id===event.id)||event.id===ALTAR_LAYOUT.oracle.id);
    if ((manualPause || inspectionOpen)&&!propSelection || interfaceOpen || contextLost || destroyed || crossing || inForest()) return;
    if(cabin){
      if(event.kind==='cabin-door')requestCabinAction('exit');
      else if(event.kind==='cabin-lamp')requestCabinAction('lamp');
      else if(event.kind==='move'){
        resetMovementInput();cabin.action=null;cabin.destination={x:event.x,z:event.z};
      }
      return;
    }
    if(event.kind==='cabin-door'||event.kind==='cabin-lamp')return;
    if(event.kind==='wood-drop'){woodcraft.drop(event);view.setWoodcraftDrop(woodcraft.isDropping());publishSnapshot();return;}
    if(placement){if(event.kind==='move'){const point={x:event.x,z:event.z};placement={...placement,point,reason:placementReason(state,placement.instanceId,point,activeColliders())};view.setPlacement(placement);publishSnapshot();}return;}
    if (event.kind === "select") {
      if(event.id!==RIDGE_NEIGHBOUR.id)neighbour.closeConversation();
      const cancelled=cancelPlayerAction(state);if(cancelled)message=cancelled;
      state.selected = event.id;
      if(event.id===WOODCRAFT.id||state.woodcraft.pieces.some(p=>p.id===event.id))woodcraft.activate();
      state.route = [];
      message = "已选中目标，可以查看详情。";
    } else {
      neighbour.closeConversation();
      state.selected = null;
      navigate(event);
    }
  }, registry,activeColliders);
  view.setRarityVfxMode(initialRarityVfxMode);
  view.setWhimsyMode(initialWhimsyMode);

  function switchCabinSpace(entering:boolean){
    // World coordinates are always legal camp coordinates, including in a save
    // taken inside the room. Walking and picking indoors use a local pose.
    state.player={...CABIN_PORTAL.landing,facing:CABIN_PORTAL.outwardFacing,moving:false};
    state.route=[];
    state.selected=null;
    if(entering){
      cabin=makeCabinVisit();
      view.enterCabin(cabin.player,state);
      message='走进了旧木屋。';
    }else{
      cabin=null;
      view.leaveCabin(true);
      message='回到了木屋门前。';
    }
  }

  function beginCabinCrossing(entering:boolean){
    resetMovementInput();
    state.route=[];
    state.player.moving=false;
    if(cabin){
      cabin.destination=null;
      cabin.action=null;
      cabin.player.moving=false;
      cabin.player.facing=0;
    }
    if(reducedMotion||window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      switchCabinSpace(entering);
      view.render(state,0);
      view.canvas.focus({preventScroll:true});
    }else crossing={entering,elapsed:0,switched:false};
    publishSnapshot();
  }

  function requestCabinEntry(){
    if(inputBlocked()||cabin||placement||reading||woodcraft.isDropping())return;
    if(workshopBusy(state)||state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state)||view.isMealPlaying()||view.isBroomPlaying()){
      message='先做完手头的活，再进屋。';
      publishSnapshot();
      return;
    }
    const colliders=activeColliders(),access=travelAccess(state);
    if(!atCabinEntrance(state.player)){
      resetMovementInput();
      state.selected='cabin';
      state.route=cabinApproachRoute(state.player,colliders,access);
      message=state.route.length?'走到木屋门前。':'暂时走不到木屋门前。';
      publishSnapshot();
      return;
    }
    if(!canStand(CABIN_PORTAL.landing,colliders,undefined,access)){
      message='门前堵住了，先把通道腾出来。';
      publishSnapshot();
      return;
    }
    try{view.prepareCabin();}
    catch(error){
      console.error('Cabin interior could not be prepared',error);
      message='屋内暂时打不开。';
      publishSnapshot();
      return;
    }
    woodcraft.cancelRequest();
    view.setWoodcraftDrop(false);
    view.inspectScene(null);
    beginCabinCrossing(true);
  }

  function finishCabinAction(action:CabinAction){
    if(!cabin)return;
    cabin.action=null;
    cabin.destination=null;
    cabin.player.moving=false;
    if(action==='lamp'){
      view.setCabinLamp(!view.cabinLampOn());
      publishSnapshot();
      return;
    }
    if(!canStand(CABIN_PORTAL.landing,activeColliders(),undefined,travelAccess(state))){
      message='屋外的落脚处被挡住了。';
      publishSnapshot();
      return;
    }
    beginCabinCrossing(false);
  }

  function requestCabinAction(action:CabinAction){
    if(inputBlocked()||!cabin)return;
    resetMovementInput();
    if(nearCabinAction(cabin.player,action))finishCabinAction(action);
    else{
      cabin.destination=cabinActionPoint(action);
      cabin.action=action;
    }
  }

  function advanceCabinCrossing(dt:number){
    if(!crossing)return false;
    const half=.16;
    crossing.elapsed+=dt;
    if(!crossing.switched&&crossing.elapsed>=half){
      crossing.elapsed=half;
      crossing.switched=true;
      view.cabinFade(1);
      switchCabinSpace(crossing.entering);
      return true;
    }
    if(crossing.elapsed>=2*half){
      crossing=null;
      view.cabinFade(0);
      view.canvas.focus({preventScroll:true});
      return true;
    }
    const ramp=crossing.switched?2-crossing.elapsed/half:crossing.elapsed/half;
    view.cabinFade(ramp*ramp*(3-2*ramp));
    return false;
  }

  function resetCabinVisit(){
    crossing=null;
    cabin=null;
    view.cabinFade(0);
    view.setCabinLamp(false);
    view.leaveCabin();
  }
  const synchronizeWildlife = () => {
    state.wildlife ??= createWildlife(state.time);
    advanceWildlife(state.wildlife, state.time, state.seed, state.player, activeColliders(), view.wildlifeAvailable(), view.wildlifeObserved());
  };
  synchronizeWildlife();
  const frameTimes: number[] = [];
  let lastSampleAt:number|null=null;
  const tick = (dt: number, now:number) => {
    accumulator += dt;
    while (accumulator >= MOVEMENT.fixedStep) {
      // An open inventory freezes walking and the world clock, while nearby wood can settle.
      if(interfaceOpen){if(!cabin)woodcraft.step(MOVEMENT.fixedStep);accumulator-=MOVEMENT.fixedStep;continue;}
      if(crossing){accumulator-=MOVEMENT.fixedStep;continue;}
      neighbour.guardClock();
      const stoppedAtDinner=advanceToEveningStop(state,MOVEMENT.fixedStep);
      advanceWeather(state);
      if(stoppedAtDinner)message='18:00，傍晚到了。沙漏已停下：可以回营地做饭、看故事，或继续夜间探索。';
      let sx =
          stick.x +
          (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
          (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0),
        sz =
          stick.z +
          (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) -
          (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0);
      let dx = 0,
        dz = 0;
      let routeDistance=Infinity;
      if(placement||woodcraft.isDropping()){sx=sz=0;state.route=[];}
      if (sx || sz) {
        if(!cabin){
          view.inspectScene(null);
          const cancelled=cancelPlayerAction(state);if(cancelled)message=cancelled;
        }
        state.route = [];
        const length = Math.max(1, Math.hypot(sx, sz));
        sx /= length;
        sz /= length;
        const yaw = view.getYaw();
        dx = sx * Math.cos(yaw) + sz * Math.sin(yaw);
        dz = -sx * Math.sin(yaw) + sz * Math.cos(yaw);
      } else if (!cabin && state.route.length) {
        const p = state.route[0],
          distance = Math.hypot(p.x - state.player.x, p.z - state.player.z);
        if (distance < 0.18) state.route.shift();
        else {
          dx = (p.x - state.player.x) / distance;
          dz = (p.z - state.player.z) / distance;
          routeDistance=distance;
        }
      }
      const loadSpeed=currentLoad(state.inventory).speed;
      if(cabin){
        stepCabinVisit(cabin,{x:dx,z:dz},MOVEMENT.fixedStep,loadSpeed,running());
        if(cabin.action&&nearCabinAction(cabin.player,cabin.action))finishCabinAction(cabin.action);
      }else{
        const step=movementOffset({x:dx,z:dz},loadSpeed,running(),MOVEMENT.fixedStep,routeDistance);
        const old = state.player,
          p = move(old,step.x,step.z,activeColliders(),travelAccess(state));
        const travelled = Math.hypot(p.x - old.x, p.z - old.z);
        state.player = {
          ...p,
          // The exported ranger's face points along local +Z.
          facing: travelled > 0.001 ? Math.atan2(dx, dz) : old.facing,
          moving: travelled > 0.001,
        };
      }
      neighbour.tick(MOVEMENT.fixedStep);
      const workshopMessage=advanceWorkshop(state);if(workshopMessage)message=workshopMessage;
      const foodMessage=advanceFood(state);if(foodMessage)message=foodMessage;
      const ritualMessage=advanceRitual(state);if(ritualMessage)message=ritualMessage;
      const forestryMessage=advanceForestry(state,treeById);if(forestryMessage)message=forestryMessage;
      synchronizeGatheringHosts(state, registry);
      if(!cabin){
        const gatheringMessage=advancePlayerGather(state,registry,activeColliders());if(gatheringMessage)message=gatheringMessage;
        for (const wp of WAYPOINTS)
          if (Math.hypot(state.player.x - wp.x, state.player.z - wp.z) < 5 && !state.visited.includes(wp.id)) {
            state.visited.push(wp.id);
            message = `发现了${wp.name}。`;
          }
        synchronizeWildlife();
        woodcraft.step(MOVEMENT.fixedStep);
      }
      accumulator -= MOVEMENT.fixedStep;
      if(captureAt!==null){
        const started=state.gathering.action?.phase==='performing'?state.gathering.action.startedAt:state.forestry.active?.startedAt??(state.ritual?.phase==='performing'?state.ritual.startedAt:null);
        if(started!==null && started!==undefined && state.time-started>=captureAt){captureAt=null;inspectionOpen=true;loop.setPaused(true);accumulator=0;message='动作已停帧；结束动作检视后继续。';publishSnapshot();break;}
      }
    }
    const crossed=advanceCabinCrossing(dt);
    view.render(state, dt);
    if (lastSampleAt!==null && dt > 0) {
      frameTimes.push(now-lastSampleAt);
      if (frameTimes.length > 360) frameTimes.shift();
    }
    lastSampleAt=now;
    reportTime += dt;
    if (crossed || reportTime > 0.15) {
      reportTime = 0;
      publishSnapshot();
    }
  };
  const loop = createLoop(
    tick,
    {
      request: (cb) => requestAnimationFrame(cb),
      cancel: (id) => cancelAnimationFrame(id),
    },
    () => {
      if(!restoringCaptureHold){accumulator=0;resetMovementInput();}
      lastSampleAt=null;
    },
  );
  const dayCycleView=()=>{
    const snapshot=dayCycleSnapshot(state),reason=neighbour.sleepReason();
    return snapshot.canSleep&&reason?{...snapshot,canSleep:false,sleepReason:reason}:snapshot;
  };
  const stats = () => {
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const sceneStats=view.stats();
    return {
      ...sceneStats,
      cabinVisit:cabin?{player:{...cabin.player,y:CABIN_ROOM.floorY},action:cabin.action,destination:cabin.destination}:null,
      presentations:{broom:sceneStats.broom,life:sceneStats.life,neighbour:sceneStats.neighbour},
      rarityVfx:sceneStats.workshop.surfaces,
      physics:woodcraft.stats(),
      loop: loop.stats(),
      samples: sorted.length,
      frameMsP50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      frameMsP95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      seed: state.seed,
      routeNodes: state.route.length,
      running: running(),
      region:{id:regionAt(state.player.x,state.player.z),openLinks:travelAccess(state).openLinks,blessed:blessingAt(state,state.player)},
      player: { ...state.player, y: travelHeightAt(state.player.x,state.player.z,travelAccess(state)) },
      gameTime:state.time,
      neighbour:neighbour.snapshot(),
      weather:weatherSnapshot(state),
      carrying:carryingSnapshot(state),
      wildlifeState: state.wildlife,
      wildlifeViews: wildlifeViews(state.wildlife, state.time),
      forestry:forestrySnapshot(state,treeById,registry.catalog),
      gathering: gatheringSnapshot(state,registry,activeColliders()),
      gatheringSources: state.gathering.sources,
      warehouse: warehouseSnapshot(state, registry),
      wardrobe:wardrobeSnapshot(state.inventory),
      workshop:workshopSnapshot(state),
      merchant:merchantSnapshot(state),
      food:foodSnapshot(state),
      dayCycle:dayCycleView(),
      housing:housingSnapshot(state),
      guidedWorkshop:guidedWorkshopSnapshot(state),
      potFoundation:potFoundationSnapshot(state),
      mealVessels:mealVesselsSnapshot(state),
      broom:broomSnapshot(state,activeColliders()),
      itemOracle:itemOracleSnapshot(state),
      life:{mealPlaying:view.isMealPlaying(),broomPlaying:view.isBroomPlaying()},
      placement:placement?structuredClone(placement):null,
      save: persistence.status(),
      appearance:view.getAppearance(),
      worldState: new URLSearchParams(window.location.search).has('inspect') ? structuredClone(state) : undefined,
    };
  };
  function publishSnapshot() {
    if(!inForest())persistence.observe(state);
    const pose=cabin?.player??state.player;
    publish({
      cabin:cabinSnapshot(),
      neighbour:neighbour.snapshot(),
      weather:weatherSnapshot(state),
      carrying:carryingSnapshot(state),
      interaction:interactionAccess(state,state.selected),
      woodcraft:woodcraft.snapshot(),
      zone: cabin?'木屋内':zoneName(state.player.x, state.player.z),
      x: pose.x,
      z: pose.z,
      height: cabin?CABIN_ROOM.floorY:travelHeightAt(pose.x,pose.z,travelAccess(state)),
      selected: state.selected,
      moving: pose.moving,
      running: running(),
      visited: [...state.visited],
      paused: manualPause,
      message,
      stats: stats(),
      forestry:forestrySnapshot(state,treeById,registry.catalog),
      gathering: gatheringSnapshot(state,registry,activeColliders()),
      warehouse: warehouseSnapshot(state, registry),
      wardrobe:wardrobeSnapshot(state.inventory),
      workshop:workshopSnapshot(state),
      merchant:merchantSnapshot(state),
      food:foodSnapshot(state),
      dayCycle:dayCycleView(),
      housing:housingSnapshot(state),
      guidedWorkshop:guidedWorkshopSnapshot(state),
      potFoundation:potFoundationSnapshot(state),
      mealVessels:mealVesselsSnapshot(state),
      broom:broomSnapshot(state,activeColliders()),
      itemOracle:itemOracleSnapshot(state),
      life:{mealPlaying:view.isMealPlaying(),broomPlaying:view.isBroomPlaying()},
      placement:placement?structuredClone(placement):null,
      save: persistence.status(),
      appearance:view.getAppearance(),
    });
  }
  const loopPauseRequired=()=>captureHoldToken!==null||manualPause||inspectionOpen||contextLost||document.hidden||destroyed||inForest();
  const syncPause = () => {
    loop.setPaused(loopPauseRequired());
    resetMovementInput();
    state.player.moving = false;
    if(cabin)cabin.player.moving=false;
    publishSnapshot();
  };
  const editable = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    !!target.closest("input,select,textarea,[contenteditable]");
  const keyDown = (e: KeyboardEvent) => {
    if (inForest() || e.defaultPrevented || interfaceOpen || editable(e.target) ||
      (menuOpen && e.code!=="Escape" && !(e.code==='KeyE'&&state.selected==='cabin'))) return;
    if(inspectionOpen){
      if(e.code==='Escape'){e.preventDefault();inspectionOpen=false;view.inspectCharacter(null);view.inspectScene(null);syncPause();view.render(state,0);}
      return;
    }
    if(e.code==='Escape'&&woodcraft.isDropping()){e.preventDefault();woodcraft.cancelDrop();view.setWoodcraftDrop(false);publishSnapshot();return;}
    if(e.code==='Escape'&&placement){e.preventDefault();placement=null;view.setPlacement(null);publishSnapshot();return;}
    if (e.code === "Escape") {
      e.preventDefault();
      manualPause = !manualPause;
      syncPause();
      if (manualPause) void persistence.saveNow(state);
      return;
    }
    if(crossing)return;
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ShiftLeft",
        "ShiftRight",
      ].includes(e.code)
    ) {
      e.preventDefault();
      if (!manualPause) keys.add(e.code);
    }
    if (e.code === "KeyR") view.resetCamera();
    if (e.code === 'KeyE' && !e.repeat && !manualPause && !contextLost && !document.hidden) {
      if(cabin){
        if(nearCabinAction(cabin.player,'exit'))requestCabinAction('exit');
        else if(nearCabinAction(cabin.player,'lamp'))requestCabinAction('lamp');
        return;
      }
      if(state.selected==='cabin'||!state.selected&&atCabinEntrance(state.player)){requestCabinEntry();return;}
      if (state.selected && registry.sources.has(state.selected)) { const result=startPlayerGather(state,state.selected,registry,activeColliders());message=result.message;publishSnapshot(); }
    }
  };
  const keyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  const blur = () => {
    resetMovementInput();
    state.player.moving=false;
    if(cabin)cabin.player.moving=false;
    publishSnapshot();
  };
  const lost = (e: Event) => {
    e.preventDefault();
    contextLost = true;
    message = "图形上下文暂时中断，恢复后继续。";
    syncPause();
  };
  const restored = () => {
    contextLost = false;
    syncPause();
  };
  const saveOnHide = () => { syncPause(); if (document.hidden&&!inForest()) void persistence.saveNow(state); };
  const saveOnExit = () => { if(!inForest())void persistence.saveNow(state); };
  const unsubscribeSave = persistence.subscribe(() => {
    if (destroyed) return;
    if (persistence.status().state === 'protected' || persistence.status().state === 'conflict') {
      manualPause = true; loop.setPaused(true);
    }
    publishSnapshot();
  });
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  window.addEventListener("blur", blur);
  document.addEventListener("visibilitychange", saveOnHide);
  window.addEventListener('pagehide', saveOnExit);
  view.canvas.addEventListener("webglcontextlost", lost);
  view.canvas.addEventListener("webglcontextrestored", restored);
  view.render(state, 0);
  const blocked=()=>inputBlocked()||!!cabin;
  const prepareDiningSeat=()=>{
    const access=safeDiningReadingSpot(state,activeColliders());
    if(access.code==='ready')return true;
    message=access.code==='approach'?approachInteraction(state,CAMP_PROPS.fire.id,activeColliders(),'sit'):access.reason;
    publishSnapshot();return false;
  };
  const performMeal=(itemId:string,bowlId?:string)=>{
    if(blocked()||placement||view.isMealPlaying()||!prepareDiningSeat())return;
    const result=consumeMeal(state,itemId,bowlId);message=result.message;
    if(result.ok&&result.committed){state.route=[];state.player.moving=false;view.presentMeal(result.committed.kind,result.committed);}
    view.render(state,0);publishSnapshot();
  };
  const transferBlocked=()=>destroyed||manualPause||inspectionOpen||contextLost||document.hidden||!!cabin||!!crossing||!!placement||workshopBusy(state)||!!state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state);
  const itemTransfers=createItemTransfers(state,woodcraft,view,activeColliders,transferBlocked);
  const clearPlacement=()=>{placement=null;view.setPlacement(null);};
  loop.setPaused(loopPauseRequired());
  publishSnapshot();
  // DEV inspection advances the existing fixed-step owner between captured frames.
  // It neither changes movement speed nor creates a second clock/RAF in the shipped game.
  function createCaptureHoldInspection(){
    let nextToken=0;
    const read=()=>({loop:loop.stats(),owners:{manualPause,inspectionOpen,contextLost,hidden:document.hidden,destroyed}});
    const snapshot=()=>({...read(),world:JSON.stringify(state),accumulator,input:{keys:[...keys],stick:{...stick},runToggle}});
    return {
      read,
      begin(){
        if(destroyed||captureHoldToken!==null)throw new Error('Capture hold unavailable or already active');
        const before=snapshot(),token=++nextToken;
        captureHoldToken=token;loop.setPaused(true);
        return {token,before,held:read()};
      },
      end(token:number){
        const held=snapshot();
        if(token!==captureHoldToken)return {released:false,held,after:snapshot()};
        captureHoldToken=null;
        // Capture release keeps the fixed-step remainder and input intent. Only
        // the existing loop's wall-time/sampling baselines restart after the hold.
        restoringCaptureHold=true;
        try{loop.setPaused(loopPauseRequired());}
        finally{restoringCaptureHold=false;}
        return {released:true,held,after:snapshot()};
      },
    };
  }
  type InspectionWindow=Window&{
    __HOW_ADVANCE_SIMULATION__?:(seconds:number)=>void;
    __HOW_CAPTURE_HOLD__?:ReturnType<typeof createCaptureHoldInspection>;
  };
  const inspectionWindow=window as InspectionWindow;
  let advanceInspection:((seconds:number)=>void)|undefined;
  let captureInspection:ReturnType<typeof createCaptureHoldInspection>|undefined;
  if(import.meta.env.DEV&&new URLSearchParams(window.location.search).has('inspect')){
    captureInspection=createCaptureHoldInspection();
    inspectionWindow.__HOW_CAPTURE_HOLD__=captureInspection;
    advanceInspection=seconds=>{
      if(captureHoldToken!==null||inputBlocked()||!Number.isFinite(seconds)||seconds<=0||seconds>5)throw new Error('Inspection step unavailable');
      loop.setPaused(true);
      try{tick(seconds,performance.now());}
      finally{loop.setPaused(loopPauseRequired());publishSnapshot();}
    };
    inspectionWindow.__HOW_ADVANCE_SIMULATION__=advanceInspection;
  }
  return {
    requestCabinEntry,
    requestCabinExit:()=>requestCabinAction('exit'),
    toggleCabinLamp:()=>requestCabinAction('lamp'),
    neighbourAction(action:NpcVisitInteraction,activityId?:string){if(blocked()||placement)return;cancelPlayerAction(state);neighbour.command(action,activityId);state.route=[];publishSnapshot();},
    talkToNeighbour(input:string){if(blocked()||placement)return;cancelPlayerAction(state);neighbour.talk(input);state.route=[];publishSnapshot();},
    promiseNeighbourWoodwork(){if(blocked()||placement)return;cancelPlayerAction(state);neighbour.promiseWoodwork();state.route=[];publishSnapshot();},
    approachNeighbour(){if(blocked()||placement||workshopBusy(state))return;cancelPlayerAction(state);neighbour.approach();publishSnapshot();},
    /** Full-screen woodworking can mark attention without pausing the world like inventory does. */
    setNpcHostFocused(value:boolean){if(destroyed)return;neighbour.setHostFocused(value);publishSnapshot();},
    requestNeighbourDialogue(input:string){if(blocked()||placement)return null;const request=neighbour.dialogueRequest(input);publishSnapshot();return request;},
    acceptNeighbourDialogue(value:unknown){if(blocked())return false;const accepted=neighbour.acceptDialogue(value);publishSnapshot();return accepted;},
    failNeighbourDialogue(){if(blocked())return false;const handled=neighbour.failDialogue();publishSnapshot();return handled;},
    requestNeighbourPlan:neighbour.planRequest,
    acceptNeighbourPlan:neighbour.acceptPlan,
    requestNeighbourMemory:neighbour.memoryRequest,
    acceptNeighbourMemory:neighbour.acceptMemory,
    carry(intent:CarryIntent){if(transferBlocked())return;try{message=changeCarrying(state,intent,activeColliders());}catch(error){message=error instanceof Error?error.message:'本次搬运未完成。';}view.render(state,0);publishSnapshot();},
    approachMaterial(id:string){if(blocked()||placement||workshopBusy(state))return;cancelPlayerAction(state);message=approachGround(state,id,activeColliders());publishSnapshot();},
    openWoodcraft(){if(blocked()||placement||workshopBusy(state)||state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state))return;
      cancelPlayerAction(state);state.selected=WOODCRAFT.id;message=approachInteraction(state,WOODCRAFT.id,activeColliders());
      view.inspectScene('woodcraft');woodcraft.activate();publishSnapshot();},
    transferAllWood(collect=false){if(transferBlocked())return;woodcraft.transferAll(collect);publishSnapshot();},
    prepareWoodcraft(){if(blocked()||placement||workshopBusy(state)||state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state))return;woodcraft.requestPrepare();publishSnapshot();},
    beginWoodDrop(key?:string){if(blocked()||placement||workshopBusy(state)||state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state))return;if(woodcraft.beginDrop(key)){state.route=[];view.setWoodcraftDrop(true);view.inspectScene('woodcraft');}publishSnapshot();},
    cancelWoodDrop(){woodcraft.cancelDrop();view.setWoodcraftDrop(false);publishSnapshot();},
    collectWood(id:string){if(blocked()||placement||workshopBusy(state)||state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state))return;woodcraft.collect(id);publishSnapshot();},
    closeWoodcraft(){woodcraft.cancelRequest();view.setWoodcraftDrop(false);view.inspectScene(null);state.selected=null;publishSnapshot();},
    focusWoodcraft(){if(blocked())return;woodcraft.activate();view.inspectScene('woodcraft');view.render(state,0);publishSnapshot();},
    approachTarget(id:string){if(blocked()||placement||workshopBusy(state))return;cancelPlayerAction(state);state.selected=id;message=approachInteraction(state,id,activeColliders());if(id===WOODCRAFT.id||state.woodcraft.pieces.some(p=>p.id===id))woodcraft.activate();publishSnapshot();},
    approachUpgrade(id:string){if(blocked()||placement)return;message=approachUpgrade(state,id,activeColliders());publishSnapshot();},
    upgrade(id:string){if(blocked()||placement)return;message=beginUpgrade(state,id);publishSnapshot();},
    mountExterior(id:string|null){if(blocked()||placement)return;message=mountFireTop(state,id);view.render(state,0);publishSnapshot();},
    changeWear(intent:WardrobeIntent){
      // Allow wardrobe transactions while its inventory panel is open, without world time passing.
      if(destroyed||contextLost||!interfaceOpen)return;
      try{const next=changeWardrobe(state.inventory,intent);state.inventory=next.inventory;message=next.message;}
      catch(error){message=error instanceof Error?error.message:'换装没有完成，原来的衣物保持不变。';}
      view.render(state,0);publishSnapshot();
    },
    previewTransfer:itemTransfers.preview,
    worldTransferItem(x:number,y:number){
      const item=itemTransfers.worldItem(x,y);
      if(item){state.route=[];resetMovementInput();state.player.moving=false;publishSnapshot();}
      return item;
    },
    transferItem(item:ItemTransferIntent,x:number,y:number,toWarehouse:boolean){
      const result=itemTransfers.commit(item,x,y,toWarehouse);message=result.reason;view.render(state,0);publishSnapshot();return result;
    },
    setClockSpeed(speed:ClockSpeed){if(inputBlocked()||!CLOCK_SPEEDS.includes(speed))return;const reason=neighbour.clockReason(speed);if(reason){message=reason;publishSnapshot();return;}state.clock={speed};publishSnapshot();},
    setWeather(kind:Parameters<typeof chooseWeather>[1]){
      if(destroyed||contextLost||document.hidden)return;
      chooseWeather(state,kind);
      view.render(state,0);publishSnapshot();
      void persistence.saveNow(state);
    },
    setWeatherIntensity(value:number){
      if(destroyed||contextLost||document.hidden)return;
      changeWeatherIntensity(state,value);
      view.render(state,0);publishSnapshot();
    },
    setWeatherAutomatic(value:boolean){
      if(destroyed||contextLost||document.hidden)return;
      changeWeatherAutomatic(state,value);
      view.render(state,0);publishSnapshot();
      void persistence.saveNow(state);
    },
    returnToTent(){
      if(blocked()||placement)return;
      const exit=campExitPoint(activeColliders());
      if(!exit){message='帐篷门前暂时没有可走的出口，请先挪开附近家具。';publishSnapshot();return;}
      navigate(exit);
      publishSnapshot();
    },
    sleepToDawn(){
      if(blocked()||placement||woodcraft.isDropping())return;
      const guestReason=neighbour.sleepReason();if(guestReason){message=guestReason;publishSnapshot();return;}
      if(view.isMealPlaying()){message='先慢慢吃完这一口，再结束一天。';publishSnapshot();return;}
      const count=state.dayCycle.nightsSlept;
      message=sleepUntilSunrise(state,activeColliders());
      if(state.dayCycle.nightsSlept!==count){
        neighbour.afterSleep();
        advanceWeather(state);
        view.cancelBroom();
        resetMovementInput();
        const foodMessage=advanceFood(state);if(foodMessage)message+=' '+foodMessage;
        const forestryMessage=advanceForestry(state,treeById);if(forestryMessage)message+=' '+forestryMessage;
        synchronizeGatheringHosts(state,registry);
        synchronizeWildlife();
        view.inspectScene(null);
      }
      view.render(state,0);publishSnapshot();
    },
    setReading(value:boolean,seatId?:string):boolean{
      if(destroyed||contextLost)return false;
      if(value){
        if(reading)return true;
        if(blocked()||woodcraft.isDropping()||placement){message='先放下手头的活，再坐下来。';publishSnapshot();return false;}
        const access=seatId?safeBenchReadingSpot(state,seatId,activeColliders()):safeDiningReadingSpot(state,activeColliders());
        if(access.code==='approach'){message=approachInteraction(state,seatId??CAMP_PROPS.fire.id,activeColliders(),'sit');publishSnapshot();return false;}
        const seatItem=seatId?state.inventory.instances?.find(i=>i.instanceId===seatId):null;
        const reason=access.reason||(seatId?(access.spot&&seatItem?.location.kind==='world'?readingReason(state,seatItem.location):'先把长凳摆好，再坐下来。'):readingReason(state));
        if(reason||!access.spot){message=reason||'这里暂时不适合坐下。';publishSnapshot();return false;}
        state.route=[];state.player.moving=false;resetMovementInput();
        reading=true;view.setReading(true,access.spot.seat);
      }else if(reading){reading=false;view.setReading(false);}
      view.render(state,0);publishSnapshot();return true;
    },
    offer(){if(blocked()||placement)return;message=beginWorkshop(state,'offering',activeColliders());publishSnapshot();},
    learnHousing(id:string){if(blocked()||placement)return;message=learnHousingBlueprint(state,id);publishSnapshot();},
    learnWorkshopPlan(id:string){if(blocked()||placement)return;message=learnWorkshopPlan(state,id);publishSnapshot();},
    learnPotFoundation(id:string){if(blocked()||placement)return;message=learnPotFoundation(state,id);publishSnapshot();},
    learnMealVessel(id:string){if(blocked()||placement)return;message=learnMealVessel(state,id);publishSnapshot();},
    craftMealVessel(id:string){if(blocked()||placement)return;message=beginMealVesselCraft(state,id,activeColliders());if(state.workshop.job&&state.clock.speed===0)state.clock={speed:1};view.render(state,0);publishSnapshot();},
    learnBroom(){if(blocked()||placement)return;message=learnBroomBlueprint(state);publishSnapshot();},
    craftBroom(mark:boolean){if(blocked()||placement)return;message=beginBroomCraft(state,{mark:mark?'leaf':null});if(state.workshop.job&&state.clock.speed===0)state.clock={speed:1};view.render(state,0);publishSnapshot();},
    approachBroomPatch(patchId:string){if(blocked()||placement||view.isBroomPlaying())return;message=approachBroomPatch(state,patchId,activeColliders());publishSnapshot();},
    sweepBroom(id:string,patchId:string){if(blocked()||placement||view.isBroomPlaying()||view.isMealPlaying())return;const result=useBroom(state,id,patchId,activeColliders());message=result.message;if(result.ok&&result.event)view.presentBroom(result.event);view.render(state,0);publishSnapshot();},
    offerItemOracle(id:string,riteId:string){if(blocked()||placement)return;message=beginItemOracle(state,id,riteId);if(state.workshop.job&&state.clock.speed===0)state.clock={speed:1};view.render(state,0);publishSnapshot();},
    braceWorkbench(){if(blocked()||placement)return;message=beginUpgrade(state,WORKBENCH_BRACING.id);if(state.workshop.job&&state.clock.speed===0)state.clock={speed:1};publishSnapshot();},
    beginGuidedCraft(id:string,parameters:Readonly<Record<string,unknown>>={}){if(blocked()||placement)return;message=beginGuidedCraft(state,id,parameters);if(state.workshop.job&&state.clock.speed===0)state.clock={speed:1};view.render(state,0);publishSnapshot();},
    setGuidedCraftDimensions(parameters:Readonly<Record<string,unknown>>){if(blocked()||placement)return;message=setGuidedCraftDimensions(state,parameters);view.render(state,0);publishSnapshot();},
    adjustGuidedPart(action:GuidedPartAdjustment){if(blocked()||placement)return;message=adjustGuidedPart(state,action);view.render(state,0);publishSnapshot();},
    fitGuidedPart(){if(blocked()||placement)return;message=submitGuidedPart(state);view.render(state,0);publishSnapshot();},
    finishGuidedCraft(){if(blocked()||placement)return;message=finishGuidedCraft(state);if(state.workshop.job?.assembly?.phase==='finishing'&&state.clock.speed===0)state.clock={speed:1};view.render(state,0);publishSnapshot();},
    cancelGuidedCraft(){if(blocked()||placement)return;message=cancelGuidedCraft(state);view.render(state,0);publishSnapshot();},
    craft(id:string){if(blocked()||placement)return;message=isHousingBlueprint(id)?beginHousingCraft(state,id,activeColliders()):beginWorkshop(state,'craft',activeColliders(),id);if(state.workshop.job&&state.clock.speed===0)state.clock={speed:1};publishSnapshot();},
    mountHousing(id:string){if(blocked()||placement)return;message=mountHousingItem(state,id);view.render(state,0);publishSnapshot();},
    detachHousing(id:string){if(blocked()||placement)return;message=detachHousingItem(state,id);view.render(state,0);publishSnapshot();},
    ringHousing(id:string){if(blocked()||placement)return;message=ringHousingBell(state,id);if(message.startsWith('叮咚'))view.ringHousingBell(id);view.render(state,0);publishSnapshot();},
    trade(id:string){if(blocked()||placement)return;message=tradeBlueprint(state,id);publishSnapshot();},
    tradeSupply(id:string){if(blocked()||placement)return;message=tradeSupply(state,id);publishSnapshot();},
    merchantCheckout(order:MerchantOrder){if(blocked()||placement)return false;const result=exchangeMerchant(state,order);message=result.message;publishSnapshot();return result.ok;},
    dryMushrooms(){if(blocked()||placement)return;message=startDryMushrooms(state);view.render(state,0);publishSnapshot();},
    cookSoup(grain:FoodGrain){if(blocked()||placement)return;const before=state.food.cooking;message=startMushroomSoup(state,grain);if(!before&&state.food.cooking&&state.clock.speed===0)state.clock={speed:1};view.render(state,0);publishSnapshot();},
    cookPorridge(grain:FoodGrain){if(blocked()||placement)return;const before=state.food.cooking;message=startGrainPorridge(state,grain);if(!before&&state.food.cooking&&state.clock.speed===0)state.clock={speed:1};view.render(state,0);publishSnapshot();},
    eatSoup(bowlId?:string){performMeal(FOOD_SOUP_ITEM_ID,bowlId);},
    eatPorridge(bowlId?:string){performMeal(FOOD_PORRIDGE_ITEM_ID,bowlId);},
    unpackFoodSack(){if(blocked()||placement)return;message=unpackFoodSack(state);view.render(state,0);publishSnapshot();},
    eatBread(){performMeal('food-black-bread');},
    approachMerchant(){if(blocked()||placement)return;cancelPlayerAction(state);state.selected=CAMP_VISITOR.id;
      const target={x:CAMP_VISITOR.x+2,z:CAMP_VISITOR.z+1};
      if(Math.hypot(state.player.x-CAMP_VISITOR.x,state.player.z-CAMP_VISITOR.z)<=3)message='已经在行商身边，可以交换图纸。';
      else{state.route=findPath(state.player,target,activeColliders(),travelAccess(state));message=state.route.length?'走到行商身边。':'暂时无法走到行商身边。';}publishSnapshot();},
    beginPlacement(id:string){if(blocked()||workshopBusy(state)||state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state))return;
      const item=state.inventory.instances?.find(i=>i.instanceId===id);if(!item)return;
      view.cancelMeal();view.cancelBroom();
      state.selected=null;state.route=[];keys.clear();stick.x=stick.z=0;const point=suggestFurniturePlacement(state,id,activeColliders());placement={instanceId:id,point,rotation:item.location.kind==='world'?item.location.rotation:0,reason:''};view.setPlacement(placement);view.render(state,0);publishSnapshot();},
    rotatePlacement(){if(blocked()||!placement)return;placement={...placement,rotation:placement.rotation+Math.PI/4};view.setPlacement(placement);publishSnapshot();},
    cancelPlacement(){clearPlacement();publishSnapshot();},
    confirmPlacement(){if(blocked()||!placement?.point)return;const reason=placementReason(state,placement.instanceId,placement.point,activeColliders());
      if(reason){placement={...placement,reason};view.setPlacement(placement);publishSnapshot();return;}
      message=placeFurniture(state,placement.instanceId,placement.point,placement.rotation,activeColliders());clearPlacement();publishSnapshot();},
    packFurniture(id:string){if(blocked()||workshopBusy(state)||state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state))return;message=packFurniture(state,id);clearPlacement();publishSnapshot();},
    navigate(id: string) {
      if (blocked()) return;
      clearPlacement();
      if(id==='east-bank'&&!travelAccess(state).openLinks.includes(CREEK_BRIDGE.id)){state.selected=CREEK_BRIDGE.id;state.route=[];message='先在溪谷修好木桥，才能到东岸。';publishSnapshot();return;}
      const wp = WAYPOINTS.find((p) => p.id === id);
      if (wp) {
        state.selected = null;
        navigate(wp);
        if(wp.id==='bridge')state.selected=CREEK_BRIDGE.id;
        publishSnapshot();
      }
    },
    select(id: string | null) {
      if(destroyed||cabin||crossing)return;
      if(id!==RIDGE_NEIGHBOUR.id)neighbour.closeConversation();
      clearPlacement();
      const cancelled=cancelPlayerAction(state);if(cancelled)message=cancelled;
      woodcraft.cancelRequest();view.setWoodcraftDrop(false);if(id===null)view.inspectScene(null);
      state.selected = id;
      if(id===WOODCRAFT.id||state.woodcraft.pieces.some(p=>p.id===id))woodcraft.activate();
      state.route = [];
      publishSnapshot();
    },
    approachSelected(){
      if(blocked())return;
      const tree=state.selected?treeById.get(state.selected):undefined;
      const life=tree?state.forestry.slots[tree.id]:undefined;
      if(!tree||tree.role!=='managed'||life?.status!=='standing'||state.forestry.active||gatheringBusy(state.gathering)){message='当前目标不能走近采伐。';publishSnapshot();return;}
      // A visible front quarter gives both the ranger and the falling silhouette room.
      const direction=Math.atan2(Math.cos(view.getYaw()),Math.sin(view.getYaw()))+Math.PI/4,radius=FORESTRY.preferredStandOffset+(tree.kind==='pine'?.43:.66)*tree.scale;
      const blockers=activeColliders();let route:ReturnType<typeof findPath>=[];
      for(const offset of [0,.55,-.55,1.1,-1.1,Math.PI/2,-Math.PI/2,Math.PI]){
        const p={x:tree.x+Math.cos(direction+offset)*radius,z:tree.z+Math.sin(direction+offset)*radius};
        if(!canStand(p,blockers,undefined,travelAccess(state)))continue;route=findPath(state.player,p,blockers,travelAccess(state));if(route.length)break;
      }
      state.route=route;message=route.length?'走近树干后，按“砍树”开始挥斧。':'这棵树附近暂时没有可到达的立足点。';publishSnapshot();
    },
    chopSelected(){
      if(blocked())return;
      const result=startPlayerChop(state,state.selected?treeById.get(state.selected):undefined,activeColliders());message=result.message;publishSnapshot();
    },
    cancelChop(){
      if(destroyed)return;const result=cancelChop(state);if(result.message)message=result.message;publishSnapshot();
    },
    captureActionAt(age:number){
      if(!new URLSearchParams(window.location.search).has('inspect')||!Number.isFinite(age)||age<0)return;
      captureAt=age;message=`下一动作在 ${age} 秒停帧；结束动作检视后继续。`;publishSnapshot();
    },
    ritual(kind:'prayer'|'offering'){
      if(blocked())return;
      if(placement)return;
      message=kind==='offering'?beginWorkshop(state,'offering',activeColliders()):beginRitual(state,activeColliders(),kind).message;publishSnapshot();
    },
    cancelAction(){const result=cancelPlayerAction(state);if(result)message=result;publishSnapshot();},
    selectTreeBranches(){
      if(!state.selected||cabin||crossing)return;
      const source=registry.sources.get(`gather.${state.selected}.branches`);
      if(source){cancelPlayerAction(state);state.selected=source.sourceId;message=startPlayerGather(state,source.sourceId,registry,activeColliders()).message;publishSnapshot();}
    },
    targetAction(id: 'gather' | 'cancel-gather') {
      if(destroyed)return;
      if(id==='cancel-gather'){const cancelled=cancelPlayerAction(state);if(cancelled)message=cancelled;inspectionOpen=false;captureAt=null;syncPause();view.render(state,0);publishSnapshot();return;}
      if(blocked())return;
      if(state.selected) { const result=startPlayerGather(state,state.selected,registry,activeColliders()).message;message=result; }
      publishSnapshot();
    },
    selectGathering(kind: 'branch' | 'mushroom' | 'scrap') {
      if(cabin||crossing)return;
      const source=[...registry.sources.values()].find(s=>registry.items.get(registry.definitions.get(s.definitionId)!.itemId)?.typeId===({branch:'wood.branch',mushroom:'fungus.fresh',scrap:'wood.scrap'} as const)[kind] && state.gathering.sources[s.sourceId].remaining>0);
      if(source){cancelPlayerAction(state);state.selected=source.sourceId;state.route=[];publishSnapshot();}
    },
    getState:()=>state,
    async enterForest() {
      if(blocked())return false;
      if(!nearCampForestTrail(state.player)) {
        state.selected=null;
        navigate(CAMP_FOREST_TRAIL.point);
        publishSnapshot();
        return false;
      }
      if(placement||woodcraft.isDropping()||workshopBusy(state)||state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state)||state.food.cooking) {
        message='先完成手头的活，再进林地。';publishSnapshot();return false;
      }
      if(state.inventory.stacks.some(stack=>isCarried(stack)&&stack.harvest)) {
        message='先把手里的原木送到营地原木架。';publishSnapshot();return false;
      }
      forestTransition=true;
      state.player.moving=false;state.route=[];state.selected=null;accumulator=0;
      syncPause();
      try {
        const candidate=campWithExpedition(state,openCampExpedition(state),true);
        if(!await persistence.saveNow(candidate)) {
          message='林地行程没能保存，先留在营地。';return false;
        }
        Object.assign(state,candidate);
        return true;
      } catch {message='林地暂时打不开，先留在营地。';return false;} finally {forestTransition=false;syncPause();}
    },
    readForestTrip() {return openCampExpedition(state);},
    forestContext() {return campExpeditionContext(state.inventory);},
    async checkpointForest(forest: ForestExpeditionState) {
      if(destroyed||forestTransition||!state.expedition?.active)return false;
      Object.assign(state,campWithExpedition(state,forest,true));
      return persistence.saveNow(state);
    },
    async leaveForest(forest: ForestExpeditionState) {
      if(destroyed||forestTransition||!state.expedition?.active||forest.action||!nearExpeditionExit(forest,campExpeditionContext(state.inventory)))return false;
      forestTransition=true;
      try {
        const candidate=campWithExpedition(state,forest,false);
        if(!await persistence.saveNow(candidate))return false;
        Object.assign(state,candidate);
        advanceWeather(state);
        message='已回到营地。带回的林产还在手上，可以到原木架存放。';
        manualPause=false;menuOpen=false;accumulator=0;
        return true;
      } finally {forestTransition=false;syncPause();}
    },
    stepReviewSimulation(seconds:number){
      if(!import.meta.env.DEV||!new URLSearchParams(window.location.search).has('inspect')||captureHoldToken!==null||inputBlocked()||placement||!Number.isFinite(seconds)||seconds<=0||seconds>20)return;
      // Reuse the sole fixed-step simulation, including walking, calendar stops
      // and ordinary transactions; no direct position or material assignments.
      tick(seconds,performance.now());publishSnapshot();
    },
    saveWorld: () => persistence.saveNow(state),
    exportWorldRecord: (which: 'primary' | 'backup') => persistence.exportRaw(which),
    async reloadWorld() {
      const loaded = await persistence.reload();
      if (!loaded || destroyed) return false;
      resetCabinVisit();
      reading=false;view.setReading(false);view.resetPresentationHistory();
      woodcraft.reset();view.setWoodcraftDrop(false);clearPlacement();delete state.wildlife;delete state.expedition;Object.assign(state, loaded);neighbour.reset();advanceWeather(state);synchronizeWildlife(); accumulator = 0; lastSampleAt = null;
      manualPause = !loaded.expedition?.active; keys.clear(); stick.x = stick.z = 0; syncPause(); view.render(state, 0); return true;
    },
    async restoreWorldCopy() {
      const loaded = await persistence.restoreValidCopy();
      if (!loaded || destroyed) return false;
      resetCabinVisit();
      reading=false;view.setReading(false);view.resetPresentationHistory();
      woodcraft.reset();view.setWoodcraftDrop(false);clearPlacement();delete state.wildlife;delete state.expedition;Object.assign(state, loaded);neighbour.reset();advanceWeather(state);synchronizeWildlife(); accumulator = 0; lastSampleAt = null;
      manualPause = !loaded.expedition?.active; keys.clear(); stick.x = stick.z = 0; syncPause(); view.render(state,0); return true;
    },
    inspectCharacter(kind:'horizontal'|'vertical'|'wardrobe'|null){
      if(destroyed||contextLost||interfaceOpen||cabin||crossing)return;
      if(kind&&(state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state))){message='先完成或取消当前动作，再检视角色。';publishSnapshot();return;}
      view.inspectScene(null);inspectionOpen=kind!==null;view.inspectCharacter(kind);syncPause();view.render(state,0);publishSnapshot();
    },
    inspectScene(preset:SceneViewPreset|null,overrides:Partial<SceneAppearance>={}){
      if(destroyed||contextLost||interfaceOpen||cabin||crossing)return;
      if(preset&&(state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state))){message='先完成或取消当前动作，再检视场景。';publishSnapshot();return;}
      view.inspectCharacter(null);inspectionOpen=preset!==null;view.inspectScene(preset,overrides);syncPause();view.render(state,0);publishSnapshot();
    },
    previewWardrobe(patch:Partial<WardrobeLook>){
      if(destroyed||contextLost)return;
      view.setWardrobe(patch);
      view.render(state,0);publishSnapshot();
    },
    setAmbientOcclusion(enabled:boolean){if(destroyed||contextLost)return;view.setAmbientOcclusion(enabled);view.render(state,0);publishSnapshot();},
    captureScene(){const image=view.capture(state),data=stats();const {worldState,...sceneStats}=data;void worldState;return {image,stats:sceneStats};},
    setMenuOpen(value:boolean) {
      menuOpen=value;
      if(value){resetMovementInput();publishSnapshot();}
    },
    setInterfaceOpen(value: boolean) {
      if(destroyed||inForest()||value&&(cabin||crossing))return;
      if(value&&inspectionOpen){inspectionOpen=false;view.inspectCharacter(null);view.inspectScene(null);}
      if(value){woodcraft.cancelRequest();view.setWoodcraftDrop(false);clearPlacement();}
      interfaceOpen=value;syncPause();
      if(value&&woodcraft.snapshot().near)woodcraft.activate();
      if (value) void persistence.saveNow(state);
    },
    pause(value: boolean) {
      if(destroyed)return;
      manualPause = value;
      if(!value&&inspectionOpen){inspectionOpen=false;view.inspectCharacter(null);view.inspectScene(null);}
      syncPause();
      if (value) void persistence.saveNow(state);
    },
    camera(action: "reset" | "left" | "right" | "in" | "out") {
      if(destroyed||crossing)return;
      if (action === "reset") {view.inspectScene(null);if(inspectionOpen){inspectionOpen=false;view.inspectCharacter(null);view.inspectScene(null);syncPause();}view.resetCamera();}
      else if (action === "left" || action === "right")
        view.rotate(action === "left" ? -0.35 : 0.35);
      else view.zoomBy(action === "in" ? 1.18 : 1 / 1.18);
      if (manualPause || inspectionOpen) view.render(state, 0);
      publishSnapshot();
    },
    setStick(x: number, z: number) {
      if(menuOpen||inputBlocked())return;
      stick.x = x;
      stick.z = z;
    },
    setRunning(value:boolean) {
      if(inputBlocked()||menuOpen||placement||woodcraft.isDropping())return;
      runToggle=value;
      publishSnapshot();
    },
    setRarityVfxMode(mode:RarityVfxMode){
      if(destroyed)return;
      view.setRarityVfxMode(mode);
      if(!contextLost){view.render(state,0);publishSnapshot();}
    },
    setWhimsyMode(mode:WhimsyMode){
      if(destroyed||!isWhimsyMode(mode))return;
      view.setWhimsyMode(mode);
      if(!contextLost){view.render(state,0);publishSnapshot();}
    },
    setReducedMotion(value: boolean) {
      if(destroyed)return;
      reducedMotion=value;
      view.setReducedMotion(value);
    },
    stats,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if(import.meta.env.DEV&&inspectionWindow.__HOW_ADVANCE_SIMULATION__===advanceInspection)delete inspectionWindow.__HOW_ADVANCE_SIMULATION__;
      if(import.meta.env.DEV&&inspectionWindow.__HOW_CAPTURE_HOLD__===captureInspection)delete inspectionWindow.__HOW_CAPTURE_HOLD__;
      captureHoldToken=null;
      unsubscribeSave();
      if(!inForest())void persistence.saveNow(state);
      loop.destroy();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", saveOnHide);
      window.removeEventListener('pagehide', saveOnExit);
      view.canvas.removeEventListener("webglcontextlost", lost);
      view.canvas.removeEventListener("webglcontextrestored", restored);
      keys.clear();
      woodcraft.dispose();
      view.destroy();
    },
  };
}
export type Runtime = Awaited<ReturnType<typeof createRuntime>>;
