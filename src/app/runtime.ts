import {currentLoad,carryingSnapshot,changeCarrying,approachGround} from '../domain/carrying.ts';
import type {CarryingSnapshot,CarryIntent} from '../domain/carrying.ts';
import { createWildlife, advanceWildlife, validateWildlifeRegistry, wildlifeViews } from '../domain/wildlife.ts';
import type {RarityVfxMode} from '../content/item-vfx.ts';
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
import {advanceLocalClock,CLOCK_SPEEDS} from '../domain/local-clock.ts';
import type {ClockSpeed} from '../domain/local-clock.ts';
import {workstationColliders,furnitureColliders,placementReason,placeFurniture,packFurniture} from '../domain/furniture-placement.ts';
import type {PlacementDraft} from '../domain/furniture-placement.ts';
import {CAMP_VISITOR} from '../content/characters.ts';
import {beginRitual,advanceRitual,ritualBusy} from '../domain/ritual.ts';
import { MOVEMENT, WAYPOINTS } from "../content/world.ts";
import {FORESTRY} from '../content/forestry.ts';
import type { Point } from "../content/world.ts";
import { createState } from "../domain/state.ts";
import type {GameState} from '../domain/state.ts';
import {startChop,cancelChop,advanceForestry,forestrySnapshot,forestryColliders} from '../domain/forestry.ts';
import type {ForestrySnapshot} from '../domain/forestry.ts';
import { findPath, move,canStand } from "../domain/navigation.ts";
import { makeColliders, makeTrees } from "../world/layout.ts";
import { heightAt, zoneName } from "../world/surface.ts";
import { createScene } from "../scene/create-scene.ts";
import { createLoop } from "./runtime-loop.ts";
import { RUNTIME_MODELS } from '../content/assets.ts';
import { START } from '../content/world.ts';
import { createGatheringRegistry } from '../domain/gathering-registry.ts';
import { interactionRoute, gatheringBusy, synchronizeGatheringHosts } from '../domain/gathering.ts';
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
export type Snapshot = {
  carrying:CarryingSnapshot;
  interaction:InteractionAccess|null;
  woodcraft:WoodcraftSnapshot;
  workshop:WorkshopSnapshot;
  merchant:MerchantSnapshot;
  placement:PlacementDraft|null;
  zone: string;
  x: number;
  z: number;
  height: number;
  selected: string | null;
  moving: boolean;
  visited: string[];
  paused: boolean;
  message: string;
  stats: Record<string, unknown>;
  forestry:ForestrySnapshot;
  gathering: GatheringSnapshot;
  warehouse: WarehouseView;
  save: SaveStatus;
  appearance:SceneAppearance;
};
export async function createRuntime(
  host: HTMLElement,
  publish: (value: Snapshot) => void,
  initialState?:GameState,
  saveOwner?: SaveController,
  initialRarityVfxMode:RarityVfxMode = 'full',
) {
  const trees = makeTrees(),
    treeById=new Map(trees.map(t=>[t.id,t])),
    colliders = makeColliders(trees);
  const registry = createGatheringRegistry({ assetIds: RUNTIME_MODELS.map(a => a.assetId) });
  const saveContext = createSaveContext(trees, registry);
  const persistence = saveOwner ?? createSaveController(createBrowserWorldSaveStore(), saveContext);
  const savedState = await persistence.load();
  const state = initialState ?? savedState ?? createState(trees);
  validateWorldSession(state, saveContext);
  for (const source of registry.sources.values()) if (!interactionRoute({ player: { ...START, facing: 0, moving: false } }, source, registry, colliders).reachable) throw new Error(`Unreachable source: ${source.sourceId}`);
  synchronizeGatheringHosts(state, registry);
  validateWildlifeRegistry(RUNTIME_MODELS.map(a => a.assetId));
  let message = "沿着小路，认识你的新家。",
    manualPause = !initialState && savedState !== null || !persistence.status().canSave,
    interfaceOpen = false,
    inspectionOpen = false,
    contextLost = false,
    destroyed = false,
    accumulator = 0,
    reportTime = 0;
  let placement:PlacementDraft|null=null;
  let captureAt:number|null=null;
  const keys = new Set<string>(),
    stick = { x: 0, z: 0 };
  const woodcraft=createWoodcraftSession(state,m=>{message=m;});
  if(state.selected===WOODCRAFT.id||state.woodcraft.pieces.some(p=>p.id===state.selected))woodcraft.activate();
  const activeColliders=()=>[{id:WOODCRAFT.id,x:WOODCRAFT.x,z:WOODCRAFT.z,halfX:WOODCRAFT.halfX+.2,halfZ:WOODCRAFT.halfZ+.2},...forestryColliders(colliders,treeById,state.forestry,state.time),...workstationColliders(),...furnitureColliders(state)];
  const navigate = (p: Point) => {
    woodcraft.cancelDrop();view.setWoodcraftDrop(false);view.inspectScene(null);
    const cancelled=cancelPlayerAction(state);if(cancelled)message=cancelled;
    const route = findPath(state.player, p, activeColliders());
    state.route = route;
    message = route.length
      ? "沿小路前往目的地"
      : "这里暂时无法到达，请选择小路或空地。";
  };
  const view = await createScene(host, trees, (event) => {
    const propSelection=inspectionOpen&&event.kind==='select'&&(Object.values(CAMP_PROPS).some(p=>p.id===event.id)||event.id===ALTAR_LAYOUT.oracle.id);
    if ((manualPause || inspectionOpen)&&!propSelection || interfaceOpen || contextLost || destroyed) return;
    if(event.kind==='wood-drop'){woodcraft.drop(event);view.setWoodcraftDrop(woodcraft.isDropping());publishSnapshot();return;}
    if(placement){if(event.kind==='move'){const point={x:event.x,z:event.z};placement={...placement,point,reason:placementReason(state,placement.instanceId,point,activeColliders())};view.setPlacement(placement);publishSnapshot();}return;}
    if (event.kind === "select") {
      const cancelled=cancelPlayerAction(state);if(cancelled)message=cancelled;
      state.selected = event.id;
      if(event.id===WOODCRAFT.id||state.woodcraft.pieces.some(p=>p.id===event.id))woodcraft.activate();
      state.route = [];
      message = "已选中目标，可以查看详情。";
    } else {
      state.selected = null;
      navigate(event);
    }
  }, registry);
  view.setRarityVfxMode(initialRarityVfxMode);
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
      if(interfaceOpen){woodcraft.step(MOVEMENT.fixedStep);accumulator-=MOVEMENT.fixedStep;continue;}
      advanceLocalClock(state,MOVEMENT.fixedStep);
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
      if(placement||woodcraft.isDropping()){sx=sz=0;state.route=[];}
      if (sx || sz) {
        view.inspectScene(null);
        const cancelled=cancelPlayerAction(state);if(cancelled)message=cancelled;
        state.route = [];
        const length = Math.max(1, Math.hypot(sx, sz));
        sx /= length;
        sz /= length;
        const yaw = view.getYaw();
        dx = sx * Math.cos(yaw) + sz * Math.sin(yaw);
        dz = -sx * Math.sin(yaw) + sz * Math.cos(yaw);
      } else if (state.route.length) {
        const p = state.route[0],
          distance = Math.hypot(p.x - state.player.x, p.z - state.player.z);
        if (distance < 0.18) state.route.shift();
        else {
          dx = (p.x - state.player.x) / distance;
          dz = (p.z - state.player.z) / distance;
        }
      }
      const old = state.player,
        p = move(
          old,
          dx * MOVEMENT.speed * currentLoad(state.inventory).speed * MOVEMENT.fixedStep,
          dz * MOVEMENT.speed * currentLoad(state.inventory).speed * MOVEMENT.fixedStep,
          activeColliders(),
        );
      const travelled = Math.hypot(p.x - old.x, p.z - old.z);
      state.player = {
        ...p,
        // The exported ranger's face points along local +Z.
        facing: travelled > 0.001 ? Math.atan2(dx, dz) : old.facing,
        moving: travelled > 0.001,
      };
      const workshopMessage=advanceWorkshop(state);if(workshopMessage)message=workshopMessage;
      const ritualMessage=advanceRitual(state);if(ritualMessage)message=ritualMessage;
      const forestryMessage=advanceForestry(state,treeById);if(forestryMessage)message=forestryMessage;
      synchronizeGatheringHosts(state, registry);
      const gatheringMessage=advancePlayerGather(state,registry,activeColliders());if(gatheringMessage)message=gatheringMessage;
      for (const wp of WAYPOINTS)
        if (
          Math.hypot(p.x - wp.x, p.z - wp.z) < 5 &&
          !state.visited.includes(wp.id)
        ) {
          state.visited.push(wp.id);
          message = `发现了${wp.name}。`;
        }
      synchronizeWildlife();
      woodcraft.step(MOVEMENT.fixedStep);
      accumulator -= MOVEMENT.fixedStep;
      if(captureAt!==null){
        const started=state.gathering.action?.phase==='performing'?state.gathering.action.startedAt:state.forestry.active?.startedAt??(state.ritual?.phase==='performing'?state.ritual.startedAt:null);
        if(started!==null && started!==undefined && state.time-started>=captureAt){captureAt=null;inspectionOpen=true;loop.setPaused(true);accumulator=0;message='动作已停帧；结束动作检视后继续。';publishSnapshot();break;}
      }
    }
    view.render(state, dt);
    if (lastSampleAt!==null && dt > 0) {
      frameTimes.push(now-lastSampleAt);
      if (frameTimes.length > 360) frameTimes.shift();
    }
    lastSampleAt=now;
    reportTime += dt;
    if (reportTime > 0.15) {
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
      accumulator = 0;
      lastSampleAt=null;
      keys.clear();
      stick.x = stick.z = 0;
    },
  );
  const stats = () => {
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const sceneStats=view.stats();
    return {
      ...sceneStats,
      rarityVfx:sceneStats.workshop.surfaces,
      physics:woodcraft.stats(),
      loop: loop.stats(),
      samples: sorted.length,
      frameMsP50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      frameMsP95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      seed: state.seed,
      routeNodes: state.route.length,
      player: { ...state.player, y: heightAt(state.player.x, state.player.z) },
      gameTime:state.time,
      carrying:carryingSnapshot(state),
      wildlifeState: state.wildlife,
      wildlifeViews: wildlifeViews(state.wildlife, state.time),
      forestry:forestrySnapshot(state,treeById,registry.catalog),
      gathering: gatheringSnapshot(state,registry,activeColliders()),
      gatheringSources: state.gathering.sources,
      warehouse: warehouseSnapshot(state, registry),
      workshop:workshopSnapshot(state),
      merchant:merchantSnapshot(state),
      placement:placement?structuredClone(placement):null,
      save: persistence.status(),
      appearance:view.getAppearance(),
      worldState: new URLSearchParams(window.location.search).has('inspect') ? structuredClone(state) : undefined,
    };
  };
  function publishSnapshot() {
    persistence.observe(state);
    publish({
      carrying:carryingSnapshot(state),
      interaction:interactionAccess(state,state.selected),
      woodcraft:woodcraft.snapshot(),
      zone: zoneName(state.player.x, state.player.z),
      x: state.player.x,
      z: state.player.z,
      height: heightAt(state.player.x, state.player.z),
      selected: state.selected,
      moving: state.player.moving,
      visited: [...state.visited],
      paused: manualPause,
      message,
      stats: stats(),
      forestry:forestrySnapshot(state,treeById,registry.catalog),
      gathering: gatheringSnapshot(state,registry,activeColliders()),
      warehouse: warehouseSnapshot(state, registry),
      workshop:workshopSnapshot(state),
      merchant:merchantSnapshot(state),
      placement:placement?structuredClone(placement):null,
      save: persistence.status(),
      appearance:view.getAppearance(),
    });
  }
  const syncPause = () => {
    loop.setPaused(manualPause || inspectionOpen || contextLost || document.hidden);
    keys.clear();
    stick.x = stick.z = 0;
    state.player.moving = false;
    publishSnapshot();
  };
  const editable = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    !!target.closest("input,select,textarea,[contenteditable]");
  const keyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || interfaceOpen || editable(e.target)) return;
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
      ].includes(e.code)
    ) {
      e.preventDefault();
      if (!manualPause) keys.add(e.code);
    }
    if (e.code === "KeyR") view.resetCamera();
    if (e.code === 'KeyE' && !e.repeat && !manualPause && !contextLost && !document.hidden) {
      if (state.selected && registry.sources.has(state.selected)) { const result=startPlayerGather(state,state.selected,registry,activeColliders());message=result.message;publishSnapshot(); }
    }
  };
  const keyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  const blur = () => {
    keys.clear();
    stick.x = stick.z = 0;
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
  const saveOnHide = () => { syncPause(); if (document.hidden) void persistence.saveNow(state); };
  const saveOnExit = () => { void persistence.saveNow(state); };
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
  const blocked=()=>destroyed||manualPause||interfaceOpen||inspectionOpen||contextLost||document.hidden;
  const transferBlocked=()=>destroyed||manualPause||inspectionOpen||contextLost||document.hidden||!!placement||workshopBusy(state)||!!state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state);
  const itemTransfers=createItemTransfers(state,woodcraft,view,activeColliders,transferBlocked);
  const clearPlacement=()=>{placement=null;view.setPlacement(null);};
  loop.setPaused(manualPause || document.hidden);
  publishSnapshot();
  return {
    carry(intent:CarryIntent){if(transferBlocked())return;try{message=changeCarrying(state,intent,activeColliders());}catch(error){message=error instanceof Error?error.message:'本次搬运未完成。';}view.render(state,0);publishSnapshot();},
    approachMaterial(id:string){if(blocked()||placement||workshopBusy(state))return;cancelPlayerAction(state);message=approachGround(state,id,activeColliders());publishSnapshot();},
    openWoodcraft(){if(blocked()||placement||workshopBusy(state)||state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state))return;
      cancelPlayerAction(state);state.selected=WOODCRAFT.id;message=approachInteraction(state,WOODCRAFT.id,activeColliders());
      view.inspectScene('woodcraft');woodcraft.activate();publishSnapshot();},
    prepareWoodcraft(){if(blocked()||placement||workshopBusy(state)||state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state))return;woodcraft.requestPrepare();publishSnapshot();},
    beginWoodDrop(key?:string){if(blocked()||placement||workshopBusy(state)||state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state))return;if(woodcraft.beginDrop(key)){state.route=[];view.setWoodcraftDrop(true);view.inspectScene('woodcraft');}publishSnapshot();},
    cancelWoodDrop(){woodcraft.cancelDrop();view.setWoodcraftDrop(false);publishSnapshot();},
    collectWood(id:string){if(blocked()||placement||workshopBusy(state)||state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state))return;woodcraft.collect(id);publishSnapshot();},
    closeWoodcraft(){woodcraft.cancelRequest();view.setWoodcraftDrop(false);view.inspectScene(null);state.selected=null;publishSnapshot();},
    focusWoodcraft(){if(destroyed||manualPause||contextLost)return;woodcraft.activate();view.inspectScene('woodcraft');view.render(state,0);publishSnapshot();},
    approachTarget(id:string){if(blocked()||placement||workshopBusy(state))return;cancelPlayerAction(state);state.selected=id;message=approachInteraction(state,id,activeColliders());if(id===WOODCRAFT.id||state.woodcraft.pieces.some(p=>p.id===id))woodcraft.activate();publishSnapshot();},
    approachUpgrade(id:string){if(blocked()||placement)return;message=approachUpgrade(state,id,activeColliders());publishSnapshot();},
    upgrade(id:string){if(blocked()||placement)return;message=beginUpgrade(state,id);publishSnapshot();},
    mountExterior(id:string|null){if(blocked()||placement)return;message=mountFireTop(state,id);view.render(state,0);publishSnapshot();},
    previewTransfer:itemTransfers.preview,
    worldTransferItem:itemTransfers.worldItem,
    transferItem(item:ItemTransferIntent,x:number,y:number,toWarehouse:boolean){
      const result=itemTransfers.commit(item,x,y,toWarehouse);message=result.reason;view.render(state,0);publishSnapshot();return result;
    },
    setClockSpeed(speed:ClockSpeed){if(blocked()||!CLOCK_SPEEDS.includes(speed))return;state.clock={speed};publishSnapshot();},
    offer(){if(blocked()||placement)return;message=beginWorkshop(state,'offering',activeColliders());publishSnapshot();},
    craft(id:string){if(blocked()||placement)return;message=beginWorkshop(state,'craft',activeColliders(),id);publishSnapshot();},
    trade(id:string){if(blocked()||placement)return;message=tradeBlueprint(state,id);publishSnapshot();},
    tradeSupply(id:string){if(blocked()||placement)return;message=tradeSupply(state,id);publishSnapshot();},
    merchantCheckout(order:MerchantOrder){if(blocked()||placement)return false;const result=exchangeMerchant(state,order);message=result.message;publishSnapshot();return result.ok;},
    approachMerchant(){if(blocked()||placement)return;cancelPlayerAction(state);state.selected=CAMP_VISITOR.id;
      const target={x:CAMP_VISITOR.x+2,z:CAMP_VISITOR.z+1};
      if(Math.hypot(state.player.x-CAMP_VISITOR.x,state.player.z-CAMP_VISITOR.z)<=3)message='已经在行商身边，可以交换图纸。';
      else{state.route=findPath(state.player,target,activeColliders());message=state.route.length?'走到行商身边。':'暂时无法走到行商身边。';}publishSnapshot();},
    beginPlacement(id:string){if(blocked()||workshopBusy(state)||state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state))return;
      const item=state.inventory.instances?.find(i=>i.instanceId===id);if(!item)return;
      state.selected=null;state.route=[];keys.clear();stick.x=stick.z=0;placement={instanceId:id,point:null,rotation:item.location.kind==='world'?item.location.rotation:0,reason:''};view.setPlacement(placement);publishSnapshot();},
    rotatePlacement(){if(blocked()||!placement)return;placement={...placement,rotation:placement.rotation+Math.PI/4};view.setPlacement(placement);publishSnapshot();},
    cancelPlacement(){clearPlacement();publishSnapshot();},
    confirmPlacement(){if(blocked()||!placement?.point)return;const reason=placementReason(state,placement.instanceId,placement.point,activeColliders());
      if(reason){placement={...placement,reason};view.setPlacement(placement);publishSnapshot();return;}
      message=placeFurniture(state,placement.instanceId,placement.point,placement.rotation,activeColliders());clearPlacement();publishSnapshot();},
    packFurniture(id:string){if(blocked()||workshopBusy(state)||state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state))return;message=packFurniture(state,id);clearPlacement();publishSnapshot();},
    navigate(id: string) {
      if (destroyed||manualPause||interfaceOpen||inspectionOpen||contextLost||document.hidden) return;
      clearPlacement();
      const wp = WAYPOINTS.find((p) => p.id === id);
      if (wp) {
        state.selected = null;
        navigate(wp);
        publishSnapshot();
      }
    },
    select(id: string | null) {
      if(destroyed)return;
      clearPlacement();
      const cancelled=cancelPlayerAction(state);if(cancelled)message=cancelled;
      woodcraft.cancelRequest();view.setWoodcraftDrop(false);if(id===null)view.inspectScene(null);
      state.selected = id;
      if(id===WOODCRAFT.id||state.woodcraft.pieces.some(p=>p.id===id))woodcraft.activate();
      state.route = [];
      publishSnapshot();
    },
    approachSelected(){
      if(destroyed||manualPause||interfaceOpen||inspectionOpen||contextLost||document.hidden)return;
      const tree=state.selected?treeById.get(state.selected):undefined;
      const life=tree?state.forestry.slots[tree.id]:undefined;
      if(!tree||tree.role!=='managed'||life?.status!=='standing'||state.forestry.active||gatheringBusy(state.gathering)){message='当前目标不能走近采伐。';publishSnapshot();return;}
      // A visible front quarter gives both the ranger and the falling silhouette room.
      const direction=Math.atan2(Math.cos(view.getYaw()),Math.sin(view.getYaw()))+Math.PI/4,radius=FORESTRY.preferredStandOffset+(tree.kind==='pine'?.43:.66)*tree.scale;
      const blockers=activeColliders();let route:ReturnType<typeof findPath>=[];
      for(const offset of [0,.55,-.55,1.1,-1.1,Math.PI/2,-Math.PI/2,Math.PI]){
        const p={x:tree.x+Math.cos(direction+offset)*radius,z:tree.z+Math.sin(direction+offset)*radius};
        if(!canStand(p,blockers))continue;route=findPath(state.player,p,blockers);if(route.length)break;
      }
      state.route=route;message=route.length?'走近树干后，按“砍树”开始挥斧。':'这棵树附近暂时没有可到达的立足点。';publishSnapshot();
    },
    chopSelected(){
      if(destroyed||manualPause||interfaceOpen||inspectionOpen||contextLost||document.hidden)return;
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
      if(destroyed||manualPause||interfaceOpen||inspectionOpen||contextLost||document.hidden)return;
      if(placement)return;
      message=kind==='offering'?beginWorkshop(state,'offering',activeColliders()):beginRitual(state,activeColliders(),kind).message;publishSnapshot();
    },
    cancelAction(){const result=cancelPlayerAction(state);if(result)message=result;publishSnapshot();},
    selectTreeBranches(){
      if(!state.selected)return;
      const source=registry.sources.get(`gather.${state.selected}.branches`);
      if(source){cancelPlayerAction(state);state.selected=source.sourceId;message=startPlayerGather(state,source.sourceId,registry,activeColliders()).message;publishSnapshot();}
    },
    targetAction(id: 'gather' | 'cancel-gather') {
      if(destroyed)return;
      if(id==='cancel-gather'){const cancelled=cancelPlayerAction(state);if(cancelled)message=cancelled;inspectionOpen=false;captureAt=null;syncPause();view.render(state,0);publishSnapshot();return;}
      if(manualPause||interfaceOpen||inspectionOpen||contextLost||document.hidden)return;
      if(state.selected) { const result=startPlayerGather(state,state.selected,registry,activeColliders()).message;message=result; }
      publishSnapshot();
    },
    selectGathering(kind: 'branch' | 'mushroom' | 'scrap') {
      const source=[...registry.sources.values()].find(s=>registry.items.get(registry.definitions.get(s.definitionId)!.itemId)?.typeId===({branch:'wood.branch',mushroom:'fungus.fresh',scrap:'wood.scrap'} as const)[kind] && state.gathering.sources[s.sourceId].remaining>0);
      if(source){cancelPlayerAction(state);state.selected=source.sourceId;state.route=[];publishSnapshot();}
    },
    getState:()=>state,
    saveWorld: () => persistence.saveNow(state),
    exportWorldRecord: (which: 'primary' | 'backup') => persistence.exportRaw(which),
    async reloadWorld() {
      const loaded = await persistence.reload();
      if (!loaded || destroyed) return false;
      woodcraft.reset();view.setWoodcraftDrop(false);clearPlacement();delete state.wildlife;Object.assign(state, loaded);synchronizeWildlife(); accumulator = 0; lastSampleAt = null;
      manualPause = true; keys.clear(); stick.x = stick.z = 0; syncPause(); view.render(state, 0); return true;
    },
    async restoreWorldCopy() {
      const loaded = await persistence.restoreValidCopy();
      if (!loaded || destroyed) return false;
      woodcraft.reset();view.setWoodcraftDrop(false);clearPlacement();delete state.wildlife;Object.assign(state, loaded);synchronizeWildlife(); accumulator = 0; lastSampleAt = null;
      manualPause = true; keys.clear(); stick.x = stick.z = 0; syncPause(); view.render(state,0); return true;
    },
    inspectCharacter(kind:'horizontal'|'vertical'|null){
      if(destroyed||contextLost||interfaceOpen)return;
      if(kind&&(state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state))){message='先完成或取消当前动作，再检视角色。';publishSnapshot();return;}
      view.inspectScene(null);inspectionOpen=kind!==null;view.inspectCharacter(kind);syncPause();view.render(state,0);publishSnapshot();
    },
    inspectScene(preset:SceneViewPreset|null,overrides:Partial<SceneAppearance>={}){
      if(destroyed||contextLost||interfaceOpen)return;
      if(preset&&(state.forestry.active||gatheringBusy(state.gathering)||ritualBusy(state))){message='先完成或取消当前动作，再检视场景。';publishSnapshot();return;}
      view.inspectCharacter(null);inspectionOpen=preset!==null;view.inspectScene(preset,overrides);syncPause();view.render(state,0);publishSnapshot();
    },
    captureScene(){const image=view.capture(state),data=stats();const {worldState,...sceneStats}=data;void worldState;return {image,stats:sceneStats};},
    setInterfaceOpen(value: boolean) {
      if(destroyed)return;
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
      if(destroyed)return;
      if (action === "reset") {view.inspectScene(null);if(inspectionOpen){inspectionOpen=false;view.inspectCharacter(null);view.inspectScene(null);syncPause();}view.resetCamera();}
      else if (action === "left" || action === "right")
        view.rotate(action === "left" ? -0.35 : 0.35);
      else view.zoomBy(action === "in" ? 1.18 : 1 / 1.18);
      if (manualPause || inspectionOpen) view.render(state, 0);
      publishSnapshot();
    },
    setStick(x: number, z: number) {
      if(destroyed||manualPause||interfaceOpen||inspectionOpen||contextLost||document.hidden)return;
      stick.x = x;
      stick.z = z;
    },
    setRarityVfxMode(mode:RarityVfxMode){
      if(destroyed)return;
      view.setRarityVfxMode(mode);
      if(!contextLost){view.render(state,0);publishSnapshot();}
    },
    setReducedMotion(value: boolean) {
      if(destroyed)return;
      view.setReducedMotion(value);
    },
    stats,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribeSave();
      void persistence.saveNow(state);
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
