import { WILDLIFE, WILDLIFE_DEFINITIONS } from '../content/wildlife.ts';
import type { WildlifeDefinitionId } from '../content/wildlife.ts';
import type { Point } from '../content/world.ts';
import type { Collider } from '../world/layout.ts';
import { WILDLIFE_ANCHORS } from '../world/wildlife-layout.ts';
import type { WildlifeAnchor } from '../world/wildlife-layout.ts';
import { canStand, move } from './navigation.ts';
import { sceneAppearanceAt } from './scene-props.ts';
import { heightAt, slopeAt, cliffFaceAt } from '../world/surface.ts';

export type WildlifeBehavior = 'idle' | 'walk' | 'watch' | 'alert' | 'flee' | 'sentinel' | 'survey' | 'stride' | 'perch' | 'step';
export type WildlifeEncounter = Point & {
  id: string; definitionId: WildlifeDefinitionId; anchorId: string; window: number;
  bornAt: number; expiresAt: number; exitAt: number | null; facing: number;
  behavior: WildlifeBehavior; until: number; target: Point | null; sequence: number; revision: number;
  /** Landmark attention is transient. Camera sight never creates a gameplay target or economic state. */
  lastVisibleAt?: number | null;
};
/** Decorative encounters are transient; deterministic windows are based on the existing saved clock. */
export type WildlifeState = {
  version: 1; lastTime: number; plannedWindow: number; landmarkWindow: number; encounters: WildlifeEncounter[];
};
export type WildlifeView = Point & {
  id: string; targetRef: { kind: 'wildlife'; encounterId: string }; definitionId: WildlifeDefinitionId;
  y: number; facing: number; motionTag: 'wildlife.idle' | 'wildlife.move' | 'wildlife.survey'; behavior: WildlifeBehavior;
  speed: number; opacity: number; capabilities: readonly string[]; revision: number;
};
const byId = new Map(WILDLIFE_DEFINITIONS.map(d => [d.id, d]));
const byAnchor = new Map(WILDLIFE_ANCHORS.map(a => [a.id, a]));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
function random(seed: number, label: string) {
  let n = seed >>> 0;
  for (let i = 0; i < label.length; i++) n = Math.imul(n ^ label.charCodeAt(i), 16777619) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 2246822507) >>> 0;
  return (n ^ (n >>> 13)) >>> 0;
}
export function wildlifeDay(hour: number) { return hour >= WILDLIFE.dayStart && hour < WILDLIFE.dayEnd; }
export function createWildlife(time: number): WildlifeState {
  return { version: 1, lastTime: time, plannedWindow: -1, landmarkWindow: -1, encounters: [] };
}
export function validateWildlifeRegistry(assetIds: readonly string[]) {
  const ids = new Set<string>(), anchors = new Set<string>();
  for (const d of WILDLIFE_DEFINITIONS) {
    if (ids.has(d.id) || !assetIds.includes(d.assetId) || d.walkSpeed <= 0 || d.fleeSpeed <= 0 || d.visualScale <= 0)
      throw new Error(`Invalid wildlife definition: ${d.id}`);
    ids.add(d.id);
  }
  for (const a of WILDLIFE_ANCHORS) {
    const d = byId.get(a.definitionId);
    if (anchors.has(a.id) || !d || d.habitat !== a.habitat || !Number.isFinite(a.x + a.z))
      throw new Error(`Invalid wildlife anchor: ${a.id}`);
    if (d.category === 'landmark' && (!a.patrol || !landmarkRouteLegal(a)))
      throw new Error(`Unsafe landmark anchor: ${a.id}`);
    anchors.add(a.id);
  }
}
/** Mammal counting includes entrances and exits. Only one landmark takes a global slot. */
export function wildlifeHasCapacity(state: WildlifeState, definitionId: WildlifeDefinitionId) {
  const d = byId.get(definitionId)!;
  return state.encounters.length < WILDLIFE.maxMammals &&
    state.encounters.filter(e => e.definitionId === definitionId).length < WILDLIFE.perSpecies &&
    (d.category !== 'landmark' || state.encounters.filter(e => byId.get(e.definitionId)?.category === 'landmark').length < WILDLIFE.maxLandmarks);
}
function legalSegment(from: Point, to: Point, colliders: Collider[]) {
  const steps = Math.max(1, Math.ceil(distance(from, to) / .15));
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    if (!canStand({ x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k }, colliders)) return false;
  }
  return true;
}
/** Cliff scenery is outside normal player navigation: validate a flat, solid mini-route instead. */
export function landmarkRouteLegal(anchor: WildlifeAnchor) {
  if (!anchor.patrol) return false;
  if (distance(anchor, anchor.patrol) > 2.8 || distance(anchor, anchor.patrol) < .25) return false;
  const baseline = heightAt(anchor.x, anchor.z);
  for (let i = 0; i <= 12; i++) {
    const k = i / 12, x = anchor.x + (anchor.patrol.x - anchor.x) * k,
      z = anchor.z + (anchor.patrol.z - anchor.z) * k;
    if (!Number.isFinite(heightAt(x,z)) || cliffFaceAt(x,z) || slopeAt(x,z) > 1.25 ||
        Math.abs(heightAt(x,z) - baseline) > .85 || heightAt(x,z) < 2) return false;
  }
  return true;
}
function chooseTarget(e: WildlifeEncounter, anchor: WildlifeAnchor, player: Point, seed: number, colliders: Collider[], flee: boolean) {
  const n = random(seed, `${e.id}:${e.sequence++}`);
  const base = flee ? Math.atan2(e.z - player.z, e.x - player.x) : n / 4294967296 * Math.PI * 2;
  const length = flee ? 3.4 : 1 + (n % 200) / 100;
  for (const turn of [0, .55, -.55, 1.1, -1.1, 1.57, -1.57]) {
    const p = { x: e.x + Math.cos(base + turn) * length, z: e.z + Math.sin(base + turn) * length };
    if (distance(p, anchor) > WILDLIFE.roamRadius || distance(p, player) < 1.3) continue;
    if (flee && distance(p, player) <= distance(e, player) + .5) continue;
    if (legalSegment(e, p, colliders)) return p;
  }
  return null;
}
function advanceLandmark(e: WildlifeEncounter, anchor: WildlifeAnchor, time: number, dt: number, colliders: Collider[]) {
  const def = byId.get(e.definitionId)!;
  if (time >= e.until) {
    if (e.behavior === 'survey') {
      const dest = distance(e, anchor) < .2 ? anchor.patrol! : anchor;
      e.target = def.id === 'wildlife.stag' && !legalSegment(e, dest, colliders) ? null : dest;
      e.behavior = e.target ? (def.id === 'wildlife.goat' ? 'step' : 'stride') : 'sentinel';
      e.until = time + (def.id === 'wildlife.goat' ? 4 : 6);
    } else if (e.behavior === 'stride' || e.behavior === 'step') {
      e.target = null; e.behavior = def.id === 'wildlife.goat' ? 'perch' : 'sentinel';
      e.until = time + 5;
    } else {
      e.target = null; e.behavior = 'survey'; e.until = time + 3.5;
    }
    e.revision++;
  }
  if (e.target && (e.behavior === 'stride' || e.behavior === 'step')) {
    const len = distance(e, e.target);
    if (len < .08) { e.x = e.target.x; e.z = e.target.z; e.target = null; e.behavior = def.id === 'wildlife.goat' ? 'perch' : 'sentinel'; e.until = time + 4; e.revision++; }
    else {
      const dx = (e.target.x - e.x) / len, dz = (e.target.z - e.z) / len,
        step = Math.min(len, def.walkSpeed * Math.min(Math.max(0,dt), .1));
      const next = def.id === 'wildlife.goat' ? {x:e.x+dx*step,z:e.z+dz*step} : move(e,dx*step,dz*step,colliders);
      if (distance(next,e) < .00001) {e.target = null;e.behavior='sentinel';e.until=time+4;}
      else {e.x=next.x;e.z=next.z;e.facing=Math.atan2(dx,dz);}
    }
  } else if (anchor.facing !== undefined) {
    // A stable viewing direction keeps the antlers broad against the skyline.
    e.facing += Math.atan2(Math.sin(anchor.facing-e.facing),Math.cos(anchor.facing-e.facing)) * Math.min(.08,dt*1.5);
  }
}
/** Observed IDs come from the one existing camera. No new clock, RAF or raycast world. */
export function advanceWildlife(
  state: WildlifeState, time: number, seed: number, player: Point,
  colliders: Collider[], available: readonly WildlifeDefinitionId[], observed: readonly string[] = [],
) {
  if (!Number.isFinite(time) || time < 0) throw new Error('Invalid wildlife time');
  const dt = time - state.lastTime, window = Math.floor(time / WILDLIFE.windowSeconds),
    rareWindow = Math.floor(time / WILDLIFE.landmarkWindowSeconds);
  const daylight = wildlifeDay(sceneAppearanceAt(time).hour);
  if (dt < 0 || dt > .5) { state.encounters = []; state.plannedWindow = -1; state.landmarkWindow = -1; }
  state.lastTime = time;
  state.encounters = state.encounters.filter(e => e.exitAt === null || time - e.exitAt < WILDLIFE.fadeSeconds);
  const visible = new Set(observed);
  for (const e of state.encounters) {
    const anchor = byAnchor.get(e.anchorId), def = byId.get(e.definitionId);
    if (!anchor || !def || !available.includes(e.definitionId) || !daylight ||
      (def.category==='common' && (time >= e.expiresAt || !canStand(e, colliders))) ||
      (def.category==='landmark' && !landmarkRouteLegal(anchor))) {
      e.exitAt ??= time; e.target = null; continue;
    }
    if (e.exitAt !== null || dt <= 0) continue;
    if (def.category === 'landmark') {
      const seen = visible.has(e.id);
      if (seen) e.lastVisibleAt = time;
      const hasBeenSeen = e.lastVisibleAt !== null && e.lastVisibleAt !== undefined;
      if ((hasBeenSeen && !seen && time - e.lastVisibleAt! >= WILDLIFE.landmarkLostSeconds) ||
          (!hasBeenSeen && time - e.bornAt > WILDLIFE.landmarkUnseenSeconds) ||
          (time >= e.expiresAt && !seen) || time >= e.bornAt + WILDLIFE.landmarkMaxHoldSeconds) {
        e.exitAt = time; e.target = null; e.revision++; continue;
      }
      advanceLandmark(e,anchor,time,dt,colliders);
      continue;
    }
    const near = distance(e, player);
    if (near < WILDLIFE.fleeDistance && e.behavior !== 'flee' && e.behavior !== 'alert') {
      e.behavior = 'alert'; e.until = time + .45; e.target = null; e.revision++;
    }
    if (e.behavior === 'alert' && time >= e.until) {
      e.target = chooseTarget(e, anchor, player, seed, colliders, true);
      e.behavior = e.target ? 'flee' : 'watch'; e.until = time + 1.8; e.revision++;
    } else if (time >= e.until) {
      if (near < WILDLIFE.noticeDistance) {e.behavior='watch';e.target=null;e.until=time+1.2;}
      else if (e.behavior === 'idle' || e.behavior === 'watch') {
        e.target = chooseTarget(e, anchor, player, seed, colliders, false);
        e.behavior = e.target ? 'walk' : 'idle'; e.until = time + 3;
      } else {e.behavior='idle';e.target=null;e.until=time+2+random(seed,`${e.id}:rest:${e.sequence}`)%400/100;}
      e.revision++;
    }
    if (e.behavior === 'watch' || e.behavior === 'alert') e.facing = Math.atan2(player.x-e.x,player.z-e.z);
    if (e.target && (e.behavior === 'walk' || e.behavior === 'flee')) {
      const length=distance(e,e.target),speed=e.behavior==='flee'?def.fleeSpeed:def.walkSpeed;
      if (length < .08) {e.target=null;e.behavior='idle';e.until=time+2;e.revision++;}
      else {
        const step=Math.min(length,speed*Math.min(dt,.1)),dx=(e.target.x-e.x)/length,dz=(e.target.z-e.z)/length;
        const next=move(e,dx*step,dz*step,colliders);
        if (distance(next,e)<.00001){e.target=null;e.behavior='idle';e.until=time+2;}
        else {e.x=next.x;e.z=next.z;e.facing=Math.atan2(dx,dz);}
      }
    }
  }
  if (daylight && state.plannedWindow !== window && time - window * WILDLIFE.windowSeconds < WILDLIFE.visitSeconds) {
    state.plannedWindow = window;
    for (const def of WILDLIFE_DEFINITIONS.filter(d => d.category === 'common')) {
      if (state.encounters.filter(e=>byId.get(e.definitionId)?.category==='common').length >= WILDLIFE.targetMammals ||
          !wildlifeHasCapacity(state, def.id) || !available.includes(def.id)) continue;
      const candidates = WILDLIFE_ANCHORS.filter(a => a.definitionId === def.id), anchor = candidates[window % candidates.length];
      if (!anchor || !canStand(anchor, colliders) || distance(anchor, player) < 2.5) continue;
      state.encounters.push({ id:`wildlife:v1:${seed}:${anchor.id}:${window}`,definitionId:def.id,anchorId:anchor.id,window,
        x:anchor.x,z:anchor.z,facing:Math.PI/4,bornAt:time,expiresAt:window*WILDLIFE.windowSeconds+WILDLIFE.visitSeconds,
        exitAt:null,behavior:'idle',until:time+3+random(seed,anchor.id)%200/100,target:null,sequence:0,revision:0 });
    }
  }
  // Rare slot is time-window deterministic; turning away consumes it for this session.
  if (!daylight || state.landmarkWindow === rareWindow ||
      time - rareWindow * WILDLIFE.landmarkWindowSeconds >= WILDLIFE.landmarkAdmitSeconds) return;
  state.landmarkWindow = rareWindow;
  const rolled = random(seed,`landmark-window-v2:${rareWindow}`);
  if (rolled%100 >= WILDLIFE.landmarkChancePercent) return;
  const definitions = WILDLIFE_DEFINITIONS.filter(d=>d.category==='landmark');
  const def=definitions[rareWindow%definitions.length];
  if (!wildlifeHasCapacity(state,def.id) || !available.includes(def.id)) return;
  const anchors=WILDLIFE_ANCHORS.filter(a=>a.definitionId===def.id);
  const anchor=anchors[Math.floor(rolled/1000)%anchors.length];
  if (!anchor || !landmarkRouteLegal(anchor) || distance(anchor,player) < WILDLIFE.landmarkMinPlayerDistance ||
      (def.id==='wildlife.stag'&&!canStand(anchor,colliders))) return;
  state.encounters.push({id:`wildlife:vista:${seed}:${anchor.id}:${rareWindow}`,definitionId:def.id,anchorId:anchor.id,
    window:rareWindow,x:anchor.x,z:anchor.z,facing:anchor.facing??0,bornAt:time,
    expiresAt:time+WILDLIFE.landmarkVisitSeconds,exitAt:null,
    behavior:def.id==='wildlife.goat'?'perch':'sentinel',until:time+6,target:null,sequence:0,revision:0,lastVisibleAt:null});
}
export function wildlifeViews(state: WildlifeState | undefined, time: number): WildlifeView[] {
  return (state?.encounters ?? []).map(e => {
    const d=byId.get(e.definitionId)!;
    const moving=['walk','flee','stride','step'].includes(e.behavior), survey=e.behavior==='survey';
    return {id:e.id,targetRef:{kind:'wildlife',encounterId:e.id},definitionId:e.definitionId,
      x:e.x,z:e.z,y:heightAt(e.x,e.z),facing:e.facing,behavior:e.behavior,
      motionTag:survey?'wildlife.survey':moving?'wildlife.move':'wildlife.idle',
      speed:e.behavior==='flee'?d.fleeSpeed:moving?d.walkSpeed:0,
      opacity:Math.max(0,Math.min(1,(time-e.bornAt)/WILDLIFE.fadeSeconds,
        e.exitAt===null?1:1-(time-e.exitAt)/WILDLIFE.fadeSeconds)),capabilities:d.capabilities,revision:e.revision};
  });
}
/** Inspection only; no encounter admission, budget mutation or persistent identity. */
export function landmarkInspectionView(species:'wildlife.stag'|'wildlife.goat',time:number):WildlifeView {
  const a=WILDLIFE_ANCHORS.find(x=>x.definitionId===species)!;
  return {id:`wildlife:inspect:${species}`,targetRef:{kind:'wildlife',encounterId:`wildlife:inspect:${species}`},
    definitionId:species,x:a.x,z:a.z,y:heightAt(a.x,a.z),facing:a.facing??0,
    motionTag:'wildlife.survey',behavior:'survey',speed:0,opacity:1,capabilities:[],revision:Math.floor(time)};
}
export function wildlifeCapabilities(state: WildlifeState | undefined, encounterId: string) {
  return state?.encounters.some(e=>e.id===encounterId&&e.exitAt===null)?{targetRef:{kind:'wildlife' as const,encounterId},capabilities:[] as string[]}:null;
}
