import type {OfferingMode} from './altar.ts';
export const REVIEW_PROPS = {
  fire: {id:'camp-fire',x:-37,z:10,radius:1.6},
  logs: {id:'camp-log-store',x:-25,z:-3,radius:2.1},
  altar: {id:'grove-altar',x:-10,z:45,radius:3.35},
} as const;
export const ALTAR_STATES = ['dormant','ready','answering','resting'] as const;
export type AltarState = typeof ALTAR_STATES[number];
export type ReviewState = {hour:number;cycle:boolean;fire:boolean;altar:AltarState;offering:OfferingMode;reflections:boolean;selected:string|null};
export const createReviewState=():ReviewState=>({hour:14,cycle:false,fire:false,altar:'ready',offering:'forest',reflections:true,selected:null});
export const VIEWS = {
  overview:{label:'山谷全景',target:[-5,24,15],yaw:-.13,elevation:.28,distance:120,zoom:.76},
  creek:{label:'溪流反光',target:[12,3,48],yaw:2.3,elevation:.36,distance:48,zoom:1},
  camp:{label:'营地篝火',target:[-35,22,3],yaw:-.75,elevation:.38,distance:38,zoom:1},
  fire:{label:'火焰近景',target:[-37,22.6,10],yaw:-.75,elevation:.30,distance:11,zoom:1},
  altar:{label:'林间祭坛',target:[-10,9.5,45],yaw:-.25,elevation:.54,distance:27,zoom:1},
  ritual:{label:'祭品与神谕',target:[-9.7,13,45.1],yaw:-.30,elevation:.30,distance:16,zoom:1.05},
  cliffs:{label:'折面山崖',target:[32,18,18],yaw:.42,elevation:.50,distance:86,zoom:.9},
  rim:{label:'崖顶接缝',target:[82,35.4,0],yaw:-.85,elevation:.30,distance:42,zoom:1.05},
  edge:{label:'地形封边',target:[105,8,90],yaw:1.1,elevation:.22,distance:130,zoom:.7},
} as const;
export type ReviewView=keyof typeof VIEWS;
export const WATER_BUDGET={desktopSize:512,mobileSize:256,interval:3,mobileInterval:4,splashCount:48,rapidRocks:9};
