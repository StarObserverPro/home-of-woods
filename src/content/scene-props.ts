import type {OfferingMode} from './altar.ts';
import {runtimeModelEnabled} from './assets.ts';
export const CAMP_PROPS = {
  // Keep a clear open strip between the hearth, canvas and both wood stores.
  fire: {id:'camp-fire',x:-35,z:14,radius:1.6},
  logs: {id:'camp-log-store',x:-25,z:-3,radius:2.1},
  dryer: {id:'camp-drying-rack',x:-40,z:18,radius:1.3},
  altar: {id:'grove-altar',x:-10,z:45,radius:3.35},
} as const;
export const DINING_SEAT = {x:CAMP_PROPS.fire.x+2.6,z:CAMP_PROPS.fire.z+2.1,height:.64,facing:2.85} as const;
export const ALTAR_STATES = ['dormant','ready','answering','resting'] as const;
export type AltarState = typeof ALTAR_STATES[number];
export type SceneAppearance = {hour:number;fire:boolean;altar:AltarState;offering:OfferingMode;reflections:boolean};
/** Visual candidate only; the M2 calendar and resource renewal use their own explicit rules. */
export const VISUAL_DAY_SECONDS=1200;
export const VIEWS = {
  wildlife:{label:'林间动物',target:[-36.5,22.2,1],yaw:-.3,elevation:.50,distance:25,zoom:1},
  stagVista:{label:'远坡雄鹿 · 检视',target:[70,39.8,-40],yaw:-.75,elevation:.28,distance:32,zoom:1},
  goatVista:{label:'崖上山羊 · 检视',target:[55,16.8,36],yaw:-.72,elevation:.28,distance:26,zoom:1},
  squirrel:{label:'松鼠近景',target:[-43,22.05,-4],yaw:-.55,elevation:.35,distance:6,zoom:1},
  hare:{label:'野兔近景',target:[-31,22.05,1],yaw:.5,elevation:.35,distance:6,zoom:1},

  woodcraft:{label:'营地木料堆',target:[-29,22,7],yaw:-.65,elevation:.6,distance:14,zoom:1},
  understory:{label:'树形与林下',target:[-67,28,10],yaw:-.65,elevation:.36,distance:17,zoom:1},
  overview:{label:'山谷全景',target:[-5,24,15],yaw:-.13,elevation:.28,distance:120,zoom:.76},
  creek:{label:'溪流反光',target:[12,3,48],yaw:2.3,elevation:.36,distance:48,zoom:1},
  camp:{label:'营地篝火',target:[-35,22,3],yaw:-.75,elevation:.38,distance:38,zoom:1},
  meal:{label:'篝火边读故事',target:[DINING_SEAT.x,22.5,DINING_SEAT.z],yaw:-.55,elevation:.30,distance:11,zoom:1},
  fire:{label:'火焰近景',target:[CAMP_PROPS.fire.x,22.6,CAMP_PROPS.fire.z],yaw:-.75,elevation:.30,distance:11,zoom:1},
  altar:{label:'林间祭坛',target:[-10,9.5,45],yaw:-.25,elevation:.54,distance:27,zoom:1},
  ritual:{label:'祭品与神谕',target:[-9.7,13,45.1],yaw:-.30,elevation:.30,distance:16,zoom:1.05},
  cliffs:{label:'折面山崖',target:[32,18,18],yaw:.42,elevation:.50,distance:86,zoom:.9},
  rim:{label:'崖顶接缝',target:[82,35.4,0],yaw:-.85,elevation:.30,distance:42,zoom:1.05},
  edge:{label:'地形封边',target:[105,8,90],yaw:1.1,elevation:.22,distance:130,zoom:.7},
} as const;
export type SceneViewPreset=keyof typeof VIEWS;
export const INSPECTABLE_VIEWS=Object.entries(VIEWS).filter(([id])=>id!=='goatVista'||runtimeModelEnabled('mountain-goat'));
export const WATER_BUDGET={desktopSize:512,mobileSize:256,interval:3,mobileInterval:4,splashCount:48,rapidRocks:9};

