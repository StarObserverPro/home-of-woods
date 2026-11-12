/** Cabin audit catalogue. Units and dimensions are shared by geometry, navigation and interaction. */
export const CABIN = {
  width: 8.4, depth: 7, height: 3.35, wallThickness: .18,
  doorWidth: 2.0, doorHeight: 2.95, doorThickness: .08,
  porchDepth: 2.4, porchWidth: 3.8, actorRadius: .92, floorY: 0,
} as const;

export type CabinDefinitionId = 'bed'|'table'|'stool'|'chest'|'shelf'|'stove'|'lantern'|'bowl'|'rug'|'plant';
export type CabinPreset = 'starter'|'full'|'empty';
export type CabinAction = 'rest'|'sit'|'open'|'light'|'inspect';
export type Point = {x:number;z:number};
export type FloorLocation = {kind:'floor';x:number;z:number;yaw:number};
export type SurfaceLocation = {kind:'surface';hostId:string;slotId:string};
export type ItemLocation = FloorLocation|SurfaceLocation|{kind:'stored'};
export type CabinItem = {
  instanceId:string; definitionId:CabinDefinitionId; location:ItemLocation;
  open:boolean; lit:boolean;
};
export type CabinState = {
  schemaVersion:1; preset:CabinPreset; items:CabinItem[];
  player:{x:number;z:number;facing:number;posture:'standing'|'seated'|'resting';usingId?:string};
  doorOpen:boolean;
};
export type SupportSlot = {id:string;position:readonly [number,number,number];halfSize:readonly [number,number]};
export type CabinDefinition = {
  id:CabinDefinitionId;label:string;category:'rest'|'work'|'storage'|'warmth'|'decoration';
  dimensions:readonly [number,number,number];movable:boolean;blocksNavigation:boolean;
  action:CabinAction;approach:Point;supports:readonly SupportSlot[];blueprintId:string;source:string;
  placementKind:'floor'|'surface';contactY?:number;
  motionEnvelope?:{min:readonly[number,number,number];max:readonly[number,number,number]};
};

const authored='项目原创程序模型';
const kaykit='KayKit Furniture Bits 1.0 · CC0，比例与材质按本展台修整';
export const ITEM_DEFINITIONS:readonly CabinDefinition[] = [
  {id:'bed',label:'林间木床',category:'rest',contactY:.5775,dimensions:[1.65,1.05,3.05],movable:true,blocksNavigation:true,action:'rest',approach:{x:1.815,z:.12},supports:[],blueprintId:'blueprint.cabin-bed',source:kaykit,placementKind:'floor'},
  {id:'table',label:'备餐木桌',category:'work',dimensions:[1.95,1.02,1.15],movable:true,blocksNavigation:true,action:'inspect',approach:{x:1.965,z:0},supports:[{id:'lamp',position:[-.55,1.02,0],halfSize:[.24,.25]},{id:'bowl',position:[.48,1.02,.05],halfSize:[.24,.25]}],blueprintId:'blueprint.cabin-table',source:kaykit,placementKind:'floor'},
  // The side approach keeps both the table edge and the bed foot clear. It rotates with the stool.
  {id:'stool',label:'矮木凳',category:'rest',contactY:.58,dimensions:[.75,.58,.75],movable:true,blocksNavigation:true,action:'sit',approach:{x:1.4,z:0},supports:[],blueprintId:'blueprint.cabin-stool',source:kaykit,placementKind:'floor'},
  {id:'chest',label:'收纳木箱',category:'storage',dimensions:[1.6,.85,.8],motionEnvelope:{min:[-.8,0,-.5],max:[.8,1.51,.4]},movable:true,blocksNavigation:true,action:'open',approach:{x:0,z:1.39},supports:[],blueprintId:'blueprint.cabin-chest',source:authored,placementKind:'floor'},
  // This diagonal approach reaches the shelf's open end without entering the stove footprint.
  {id:'shelf',label:'墙边置物架',category:'storage',dimensions:[1.8,1.9,.5],movable:false,blocksNavigation:true,action:'inspect',approach:{x:-1.25,z:1.45},supports:[{id:'plant',position:[.48,1.75,0],halfSize:[.3,.25]}],blueprintId:'blueprint.cabin-shelf',source:kaykit,placementKind:'floor'},
  {id:'stove',label:'铸铁暖炉',category:'warmth',dimensions:[1.15,2.9,1.3],movable:false,blocksNavigation:true,action:'light',approach:{x:-1.565,z:0},supports:[],blueprintId:'blueprint.cabin-stove',source:authored,placementKind:'floor'},
  {id:'lantern',label:'提灯',category:'warmth',dimensions:[.28,.55,.28],movable:false,blocksNavigation:false,action:'light',approach:{x:0,z:0},supports:[],blueprintId:'blueprint.cabin-lantern',source:authored,placementKind:'surface'},
  {id:'bowl',label:'木碗',category:'work',dimensions:[.32,.16,.32],movable:false,blocksNavigation:false,action:'inspect',approach:{x:0,z:0},supports:[],blueprintId:'blueprint.wooden-bowl',source:authored,placementKind:'surface'},
  {id:'rug',label:'编织地毯',category:'decoration',dimensions:[2.1,.04,2.4],movable:true,blocksNavigation:false,action:'inspect',approach:{x:0,z:0},supports:[],blueprintId:'blueprint.cabin-rug',source:kaykit,placementKind:'floor'},
  {id:'plant',label:'窗边绿植',category:'decoration',dimensions:[.5,.85,.5],movable:false,blocksNavigation:false,action:'inspect',approach:{x:0,z:0},supports:[],blueprintId:'blueprint.cabin-plant',source:authored,placementKind:'surface'},
];
export const DEFINITIONS = Object.fromEntries(ITEM_DEFINITIONS.map(d=>[d.id,d])) as Record<CabinDefinitionId,CabinDefinition>;
export const DEFINITION_IDS = ITEM_DEFINITIONS.map(d=>d.id);
export const STARTER_ITEMS:readonly CabinDefinitionId[]=['bed','table','stool','lantern'];
export const DEFAULT_LOCATIONS:Readonly<Record<CabinDefinitionId,FloorLocation|SurfaceLocation>>={
  bed:{kind:'floor',x:-2.85,z:-1.65,yaw:0},
  table:{kind:'floor',x:-2.65,z:1.75,yaw:0},
  stool:{kind:'floor',x:-2.55,z:.3,yaw:0},
  chest:{kind:'floor',x:0,z:-2.9,yaw:0},
  shelf:{kind:'floor',x:2.65,z:-3.1,yaw:0},
  stove:{kind:'floor',x:3,z:-1.3,yaw:0},
  lantern:{kind:'surface',hostId:'audit:table',slotId:'lamp'},
  bowl:{kind:'surface',hostId:'audit:table',slotId:'bowl'},
  rug:{kind:'floor',x:.2,z:.7,yaw:0},
  plant:{kind:'surface',hostId:'audit:shelf',slotId:'plant'},
};
export const ENTRY_POINT:Point={x:0,z:2.45};
export const PORCH_POINT:Point={x:0,z:4.9};
export const USE_DISTANCE=.3;
export const instanceIdFor=(id:CabinDefinitionId)=>`audit:${id}`;
export function definitionFor(id:CabinDefinitionId|string):CabinDefinition {
  const definition=DEFINITIONS[id as CabinDefinitionId];
  if(!definition)throw new Error(`Unknown cabin definition: ${id}`);
  return definition;
}
