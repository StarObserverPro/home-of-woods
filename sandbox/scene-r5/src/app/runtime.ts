import type {ReviewView,AltarState} from '../content/scene-review.ts';
import {inventoryTransaction} from '../domain/inventory.ts';
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
import { upgradeSessionInventory } from './inventory-session.ts';
export type Snapshot = {
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
};
export async function createRuntime(
  host: HTMLElement,
  publish: (value: Snapshot) => void,
  initialState?:GameState,
) {
  const trees = makeTrees(),
    state = initialState??createState(trees),
    treeById=new Map(trees.map(t=>[t.id,t])),
    colliders = makeColliders(trees);
  const registry = createGatheringRegistry({ assetIds: RUNTIME_MODELS.map(a => a.assetId) });
  const inventoryLoad = upgradeSessionInventory(state);
  if (inventoryLoad.decision === 'protected') throw new Error(`库存兼容保护：${inventoryLoad.diagnostics.join('；')}`);
  for (const source of registry.sources.values()) if (!interactionRoute({ player: { ...START, facing: 0, moving: false } }, source, registry, colliders).reachable) throw new Error(`Unreachable source: ${source.sourceId}`);
  synchronizeGatheringHosts(state, registry);
  let message = "沿着小路，认识你的新家。",
    manualPause = false,
    interfaceOpen = false,
    inspectionOpen = false,
    contextLost = false,
    destroyed = false,
    accumulator = 0,
    reportTime = 0;
  const keys = new Set<string>(),
    stick = { x: 0, z: 0 };
  const activeColliders=()=>forestryColliders(colliders,treeById,state.forestry,state.time);
  const navigate = (p: Point) => {
    const cancelled=cancelPlayerAction(state);if(cancelled)message=cancelled;
    const route = findPath(state.player, p, activeColliders());
    state.route = route;
    message = route.length
      ? "沿小路前往目的地"
      : "这里暂时无法到达，请选择小路或空地。";
  };
  const view = await createScene(host, trees, (event) => {
    if (manualPause || interfaceOpen || inspectionOpen || contextLost || destroyed) return;
    if (event.kind === "select") {
      const cancelled=cancelPlayerAction(state);if(cancelled)message=cancelled;
      state.selected = event.id;
      state.route = [];
      message = "已选中目标，可以查看详情。";
    } else {
      state.selected = null;
      navigate(event);
    }
  }, registry);
  const frameTimes: number[] = [];
  let lastSampleAt:number|null=null;
  const tick = (dt: number, now:number) => {
    accumulator += dt;
    while (accumulator >= MOVEMENT.fixedStep) {
      state.time+=MOVEMENT.fixedStep;
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
      if (sx || sz) {
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
          dx * MOVEMENT.speed * MOVEMENT.fixedStep,
          dz * MOVEMENT.speed * MOVEMENT.fixedStep,
          activeColliders(),
        );
      const travelled = Math.hypot(p.x - old.x, p.z - old.z);
      state.player = {
        ...p,
        // The exported ranger's face points along local +Z.
        facing: travelled > 0.001 ? Math.atan2(dx, dz) : old.facing,
        moving: travelled > 0.001,
      };
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
      accumulator -= MOVEMENT.fixedStep;
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
    return {
      ...view.stats(),
      loop: loop.stats(),
      samples: sorted.length,
      frameMsP50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      frameMsP95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      seed: state.seed,
      routeNodes: state.route.length,
      player: { ...state.player, y: heightAt(state.player.x, state.player.z) },
      gameTime:state.time,
      forestry:forestrySnapshot(state,treeById),
      gathering: gatheringSnapshot(state,registry,activeColliders()),
      gatheringSources: state.gathering.sources,
      warehouse: warehouseSnapshot(state, registry),
    };
  };
  function publishSnapshot() {
    publish({
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
      forestry:forestrySnapshot(state,treeById),
      gathering: gatheringSnapshot(state,registry,activeColliders()),
      warehouse: warehouseSnapshot(state, registry),
    });
  }
  const syncPause = () => {
    loop.setPaused(manualPause || interfaceOpen || inspectionOpen || contextLost || document.hidden);
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
      if(e.code==='Escape'){e.preventDefault();inspectionOpen=false;view.inspectCharacter(null);syncPause();view.render(state,0);}
      return;
    }
    if (e.code === "Escape") {
      e.preventDefault();
      manualPause = !manualPause;
      syncPause();
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
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  window.addEventListener("blur", blur);
  document.addEventListener("visibilitychange", syncPause);
  view.canvas.addEventListener("webglcontextlost", lost);
  view.canvas.addEventListener("webglcontextrestored", restored);
  view.render(state, 0);
  loop.setPaused(document.hidden);
  publishSnapshot();
  return {
    review:view.review,
    setReview(patch:Partial<typeof view.review>){Object.assign(view.review,patch);view.render(state,0);publishSnapshot();},
    setReviewView(value:ReviewView){view.setReviewView(value);view.render(state,0);publishSnapshot();},
    setReviewWood(quantity:number){
      const deltas=state.inventory.stacks.filter(s=>s.itemId==='wood').map(s=>({itemId:s.itemId,qualityId:s.qualityId,delta:-s.quantity}));
      deltas.push({itemId:'wood',qualityId:'ordinary',delta:quantity});state.inventory=inventoryTransaction(state.inventory,deltas);view.render(state,0);publishSnapshot();
    },
    capture:()=>view.capture(state),
    navigate(id: string) {
      if (destroyed||manualPause||interfaceOpen||inspectionOpen||contextLost||document.hidden) return;
      const wp = WAYPOINTS.find((p) => p.id === id);
      if (wp) {
        state.selected = null;
        navigate(wp);
        publishSnapshot();
      }
    },
    select(id: string | null) {
      if(destroyed)return;
      const cancelled=cancelPlayerAction(state);if(cancelled)message=cancelled;
      state.selected = id;
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
      const result=startPlayerChop(state,state.selected?treeById.get(state.selected):undefined);message=result.message;publishSnapshot();
    },
    cancelChop(){
      if(destroyed)return;const result=cancelChop(state);if(result.message)message=result.message;publishSnapshot();
    },
    targetAction(id: 'gather' | 'cancel-gather') {
      if(destroyed||manualPause||interfaceOpen||inspectionOpen||contextLost||document.hidden)return;
      if(id==='cancel-gather') { const cancelled=cancelPlayerAction(state);if(cancelled)message=cancelled; }
      else if(state.selected) { const result=startPlayerGather(state,state.selected,registry,activeColliders());message=result.message; }
      publishSnapshot();
    },
    selectGathering(kind: 'branch' | 'mushroom') {
      const source=[...registry.sources.values()].find(s=>registry.definitions.get(s.definitionId)?.itemId===kind && state.gathering.sources[s.sourceId].remaining>0);
      if(source){cancelPlayerAction(state);state.selected=source.sourceId;state.route=[];publishSnapshot();}
    },
    getState:()=>state,
    inspectCharacter(kind:'horizontal'|'vertical'|null){
      if(destroyed||contextLost||interfaceOpen)return;
      if(kind&&(state.forestry.active||gatheringBusy(state.gathering))){message='先完成或取消当前动作，再检视角色。';publishSnapshot();return;}
      inspectionOpen=kind!==null;view.inspectCharacter(kind);syncPause();view.render(state,0);publishSnapshot();
    },
    setInterfaceOpen(value: boolean) {
      if(destroyed)return;
      if(value&&inspectionOpen){inspectionOpen=false;view.inspectCharacter(null);}
      interfaceOpen=value;syncPause();
    },
    pause(value: boolean) {
      if(destroyed)return;
      manualPause = value;
      if(!value&&inspectionOpen){inspectionOpen=false;view.inspectCharacter(null);}
      syncPause();
    },
    camera(action: "reset" | "left" | "right" | "in" | "out") {
      if(destroyed)return;
      if (action === "reset") view.resetCamera();
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
    setReducedMotion(value: boolean) {
      if(destroyed)return;
      view.setReducedMotion(value);
    },
    stats,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelPlayerAction(state);
      loop.destroy();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", syncPause);
      view.canvas.removeEventListener("webglcontextlost", lost);
      view.canvas.removeEventListener("webglcontextrestored", restored);
      keys.clear();
      view.destroy();
    },
  };
}
export type Runtime = Awaited<ReturnType<typeof createRuntime>>;
