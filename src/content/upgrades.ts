import {CABIN,TENT} from './world.ts';
import type {Point} from './world.ts';
import {CAMP_PROPS} from './scene-props.ts';
import {WOODCRAFT} from './woodcraft.ts';
import {CABIN_REPAIR_BLUEPRINT,WORKBENCH,WORKBENCH_STOOL} from './workshop.ts';

export type UpgradeMaterial = {typeId:string;name:string;quantity:number};
export type UpgradePath = {
  id:string;name:string;description:string;completionMessage:string;fromLevel:number;toLevel:number;
  blueprintId:string;durationSeconds:number;materials:readonly UpgradeMaterial[];
};
export type UpgradeProfile = {
  id:string;title:string;initialLevel:number;stand:Point;position:Point;
  paths:readonly UpgradePath[];future:string;
};

// Costs and duration are the first playable repair step, not the final building economy.
export const CABIN_REPAIR = {
  id:'upgrade.cabin.entrance',name:'木屋修缮·第一阶段',
  description:'补好两处屋顶缺口，加固门边支撑。',fromLevel:0,toLevel:1,
  completionMessage:'木屋修缮·第一阶段已完成。两处屋顶缺口与门边支撑已修整，其余墙体、屋面仍待后续图纸。',
  blueprintId:CABIN_REPAIR_BLUEPRINT.id,durationSeconds:4,
  materials:[{typeId:'wood.log',name:'原木',quantity:2},{typeId:'wood.branch',name:'枝杈',quantity:3}],
} as const satisfies UpgradePath;
export const CABIN_REPAIR_STAND = {x:CABIN.x-2.4,z:CABIN.z+10};
export const UPGRADE_PROFILES:readonly UpgradeProfile[] = [
  {id:'cabin',title:'旧木屋',initialLevel:0,position:CABIN,stand:CABIN_REPAIR_STAND,paths:[CABIN_REPAIR],future:'屋顶补板和入口加固已完成；其余墙体、屋面仍待后续图纸修整。'},
  {id:'tent',title:'帐篷',initialLevel:1,position:TENT,stand:{x:TENT.x,z:TENT.z+5.4},paths:[],future:'后续可按图纸改善遮雨和休息条件，升级路径尚未开放。'},
  {id:CAMP_PROPS.fire.id,title:'营地篝火',initialLevel:1,position:CAMP_PROPS.fire,stand:{x:CAMP_PROPS.fire.x,z:CAMP_PROPS.fire.z+2.8},paths:[],future:'后续可按图纸改建火塘与烹饪设施，升级路径尚未开放。'},
  {id:CAMP_PROPS.logs.id,title:'原木架',initialLevel:1,position:CAMP_PROPS.logs,stand:{x:CAMP_PROPS.logs.x,z:CAMP_PROPS.logs.z+3.2},paths:[],future:'后续可按图纸增设防雨顶棚和储存空间，升级路径尚未开放。'},
  {id:WOODCRAFT.id,title:'营地木料堆',initialLevel:1,position:WOODCRAFT,stand:WOODCRAFT.stand,paths:[],future:'后续可按图纸改良木料围框和搬运设施，升级路径尚未开放。'},
  {id:WORKBENCH.id,title:'粗木工作台',initialLevel:1,position:WORKBENCH,stand:WORKBENCH.stand,paths:[],future:'后续可按图纸改善工作台，解锁更多加工方式；升级路径尚未开放。'},
  {id:WORKBENCH_STOOL.id,title:'工作台小凳',initialLevel:1,position:WORKBENCH_STOOL,stand:{x:WORKBENCH_STOOL.x,z:WORKBENCH_STOOL.z+1.7},paths:[],future:'后续可按图纸改良支撑与坐面，升级路径尚未开放。'},
  {id:CAMP_PROPS.altar.id,title:'林间祭坛',initialLevel:1,position:CAMP_PROPS.altar,stand:{x:CAMP_PROPS.altar.x,z:CAMP_PROPS.altar.z+5},paths:[],future:'后续可依神谕图纸修整供台、增添仪式设施，升级路径尚未开放。'},
];
export const findUpgradeProfile=(id:string)=>UPGRADE_PROFILES.find(p=>p.id===id);
export const findUpgradePath=(targetId:string,pathId:string)=>findUpgradeProfile(targetId)?.paths.find(p=>p.id===pathId);
