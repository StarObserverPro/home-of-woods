import {CABIN,TENT} from './world.ts';
import type {Point} from './world.ts';
import {CAMP_PROPS} from './scene-props.ts';
import {WOODCRAFT} from './woodcraft.ts';
import {CABIN_REPAIR_BLUEPRINT,WORKBENCH,WORKBENCH_STOOL} from './workshop.ts';
import {WORKBENCH_BRACING,WORKBENCH_BRACING_BLUEPRINT} from './workshop-series.ts';

export type UpgradeMaterial={typeId:string;name:string;quantity:number;unit?:string};
export type UpgradePath={
  id:string;name:string;description:string;completionMessage:string;fromLevel:number;toLevel:number;
  blueprintId:string;durationSeconds:number;materials:readonly UpgradeMaterial[];
};
export type UpgradeProfile={
  id:string;title:string;initialLevel:number;stand:Point;position:Point;
  paths:readonly UpgradePath[];future:string;
  /** A fitted part is shown under its permanent host; it never replaces the host. */
  hostId?:string;
  /** Completed prerequisite profile IDs; used for building envelope and hearth sockets. */
  requires?:readonly string[];
  /** Several built parts may compete for one mutually exclusive physical socket. */
  mountSlot?:string;
};
export const FIRE_TOP_SLOT='camp-fire:top';
const log=(quantity:number):UpgradeMaterial=>({typeId:'wood.log',name:'原木',quantity,unit:'根'});
const branch=(quantity:number):UpgradeMaterial=>({typeId:'wood.branch',name:'枝杈',quantity,unit:'份'});
const supplied=(typeId:string,name:string,unit:string):UpgradeMaterial=>({typeId,name,quantity:1,unit});

// Costs and durations are playable examples, not the final balancing pass.
export const CABIN_REPAIR={
  id:'upgrade.cabin.entrance',name:'木屋修缮·第一阶段',
  description:'补好两处屋顶缺口，加固门边支撑。',fromLevel:0,toLevel:1,
  completionMessage:'木屋修缮·第一阶段已完成。两处屋顶缺口与门边支撑已修整，其余墙体、屋面仍待后续图纸。',
  blueprintId:CABIN_REPAIR_BLUEPRINT.id,durationSeconds:4,materials:[log(2),branch(3)],
} as const satisfies UpgradePath;
export const CABIN_REPAIR_STAND={x:CABIN.x-2.4,z:CABIN.z+10};
const tentStand={x:TENT.x+5.4,z:TENT.z+1.3}; // Clear east-side approach, away from the workbench corridor.
const fireStand={x:CAMP_PROPS.fire.x,z:CAMP_PROPS.fire.z+2.8};
type ModuleArgs={
  id:string;hostId:string;title:string;description:string;materials:readonly UpgradeMaterial[];
  stand:Point;position:Point;requires?:readonly string[];mountSlot?:string;durationSeconds?:number;
};
const moduleProfile=({id,hostId,title,description,materials,stand,position,requires,mountSlot,durationSeconds=3}:ModuleArgs):UpgradeProfile=>({
  id,hostId,title,initialLevel:0,stand,position,requires,mountSlot,
  paths:[{id:'upgrade.'+id.replace(':','.'),name:title,description,
    completionMessage:`「${title}」已做好，安装在原来的${hostId==='tent'?'帐篷':hostId==='cabin'?'木屋':'火塘'}上。`,
    fromLevel:0,toLevel:1,blueprintId:'blueprint.'+id.replace(':','-'),durationSeconds,materials}],
  future:'部件已经制成，可以继续使用；更多样式留待后续图纸。',
});
export const EXTERIOR_PROFILES:readonly UpgradeProfile[]=[
  moduleProfile({id:'tent:canvas',hostId:'tent',title:'苔绿色换帐布',description:'用从行商处换来的帆布卷替换旧布面，给帐篷添上暖色包边。',materials:[supplied('supply.canvas','帆布卷','卷'),branch(1)],stand:tentStand,position:TENT}),
  moduleProfile({id:'tent:ropes',hostId:'tent',title:'四角绷绳与木桩',description:'增加四角绷绳和地钉，让帐篷边缘看起来更利落。',materials:[branch(2)],stand:tentStand,position:TENT}),
  moduleProfile({id:'tent:poles',hostId:'tent',title:'外露加固撑杆',description:'在帐篷的前后端加装斜撑和脊杆绑扎。',materials:[log(1),branch(2)],stand:tentStand,position:TENT}),
  moduleProfile({id:'tent:chimes',hostId:'tent',title:'帐门风铃',description:'把短木片挂在帐门外侧，风吹过时轻轻摆动的装饰（本轮为静态外观）。',materials:[branch(1)],stand:tentStand,position:TENT}),
  moduleProfile({id:'cabin:roof',hostId:'cabin',title:'屋脊与檐口包边',description:'第一轮修缮之后，给屋脊和两边檐口补上收边木条。',materials:[log(2),branch(2)],stand:CABIN_REPAIR_STAND,position:CABIN,requires:['cabin']}),
  moduleProfile({id:'cabin:windows',hostId:'cabin',title:'外开木窗板',description:'在正面旧窗两侧装上可辨认的木质外窗板。',materials:[branch(3)],stand:CABIN_REPAIR_STAND,position:CABIN,requires:['cabin']}),
  moduleProfile({id:'cabin:entry',hostId:'cabin',title:'门前遮雨檐',description:'修整入口后加立柱、短雨檐和门楣挂板。',materials:[log(1),branch(2)],stand:CABIN_REPAIR_STAND,position:CABIN,requires:['cabin']}),
  moduleProfile({id:'camp-fire:stones',hostId:'camp-fire',title:'重垒挡风石圈',description:'重新摆放火塘旁现有的散石，垒出较高的外圈；无需额外耗材。',materials:[],stand:fireStand,position:CAMP_PROPS.fire,durationSeconds:3}),
  moduleProfile({id:'camp-fire:support',hostId:'camp-fire',title:'双柱横梁锅架',description:'在火塘外侧立双柱，把承重横梁架在火焰上方；先有架子，才可挂其他烹饪附件。',materials:[log(1),branch(2)],stand:fireStand,position:CAMP_PROPS.fire,requires:['camp-fire:stones']}),
  moduleProfile({id:'camp-fire:hook',hostId:'camp-fire',title:'悬锅吊钩',description:'装在横梁下的吊链和锅钩；锅具本身日后另行制作。',materials:[branch(1)],stand:fireStand,position:CAMP_PROPS.fire,requires:['camp-fire:support'],mountSlot:FIRE_TOP_SLOT}),
  moduleProfile({id:'camp-fire:pot',hostId:'camp-fire',title:'基础悬挂汤锅',description:'使用行商五金件制成一只可挂在吊钩上的基础汤锅，供营地煮菌汤。',materials:[supplied('supply.hardware','五金包','套')],stand:fireStand,position:CAMP_PROPS.fire,requires:['camp-fire:hook']}),
  moduleProfile({id:'camp-fire:grill',hostId:'camp-fire',title:'可收起的烧烤网',description:'用行商换来的五金件拼出烤网；与吊钩共用同一个火塘上部接口。',materials:[supplied('supply.hardware','五金包','套')],stand:fireStand,position:CAMP_PROPS.fire,requires:['camp-fire:support'],mountSlot:FIRE_TOP_SLOT}),
  moduleProfile({id:'camp-fire:smoker',hostId:'camp-fire',title:'焖烤烟罩',description:'用五金件装一个有出烟口的罩体；暂作外观与安装预留，食谱系统另做。',materials:[supplied('supply.hardware','五金包','套'),branch(1)],stand:fireStand,position:CAMP_PROPS.fire,requires:['camp-fire:support'],mountSlot:FIRE_TOP_SLOT}),
];
export const UPGRADE_PROFILES:readonly UpgradeProfile[]=[
  {id:'cabin',title:'旧木屋',initialLevel:0,position:CABIN,stand:CABIN_REPAIR_STAND,paths:[CABIN_REPAIR],future:'屋顶补板和入口加固已完成；其余墙体、屋面仍待后续图纸修整。'},
  {id:'tent',title:'帐篷',initialLevel:1,position:TENT,stand:tentStand,paths:[],future:'内部床铺、收纳和私人空间以后另行开放。'},
  {id:CAMP_PROPS.fire.id,title:'营地篝火',initialLevel:1,position:CAMP_PROPS.fire,stand:fireStand,paths:[],future:'火塘基座和烹饪附件由外部部件分别改装。'},
  {id:CAMP_PROPS.dryer.id,title:'蘑菇晾晒架',initialLevel:0,position:CAMP_PROPS.dryer,stand:{x:CAMP_PROPS.dryer.x,z:CAMP_PROPS.dryer.z+2.5},
    paths:[{id:'upgrade.camp-drying-rack.frame',name:'搭建蘑菇晾晒架',description:'按基础图纸用两份枝杈搭成可晾干菌类的小木架。',
      completionMessage:'蘑菇晾晒架已搭好，可以挂上鲜菌。',fromLevel:0,toLevel:1,
      blueprintId:'blueprint.camp-drying-rack',durationSeconds:3,materials:[branch(2)]}],
    future:'架子已搭好，遮雨布棚等扩展以后再做。'},

  ...EXTERIOR_PROFILES,
  {id:CAMP_PROPS.logs.id,title:'原木架',initialLevel:1,position:CAMP_PROPS.logs,stand:{x:CAMP_PROPS.logs.x,z:CAMP_PROPS.logs.z+3.2},paths:[],future:'后续可按图纸增设防雨顶棚和储存空间，升级路径尚未开放。'},
  {id:WOODCRAFT.id,title:'营地木料堆',initialLevel:1,position:WOODCRAFT,stand:WOODCRAFT.stand,paths:[],future:'后续可按图纸改良木料围框和搬运设施，升级路径尚未开放。'},
  {id:WORKBENCH.id,title:'粗木工作台',initialLevel:1,position:WORKBENCH,stand:WORKBENCH.stand,paths:[],future:'可加装支架与定位靠山，继续使用原工作台完成装配。'},
  {id:WORKBENCH_BRACING.id,hostId:WORKBENCH.id,title:WORKBENCH_BRACING_BLUEPRINT.name,initialLevel:0,position:WORKBENCH,stand:WORKBENCH.stand,
    paths:[{id:WORKBENCH_BRACING.pathId,name:WORKBENCH_BRACING_BLUEPRINT.name,description:WORKBENCH_BRACING_BLUEPRINT.description,
      completionMessage:'工作台支架与定位靠山已经装好，可以按尺寸对齐支撑和面板。',fromLevel:0,toLevel:1,
      blueprintId:WORKBENCH_BRACING.blueprintId,durationSeconds:3,materials:[log(2),branch(2)]}],
    future:'支架与定位靠山已安装，量身长凳和备餐边桌可在这里装配。'},
  {id:WORKBENCH_STOOL.id,title:'工作台小凳',initialLevel:1,position:WORKBENCH_STOOL,stand:{x:WORKBENCH_STOOL.x,z:WORKBENCH_STOOL.z+1.7},paths:[],future:'后续可按图纸改良支撑与坐面，升级路径尚未开放。'},
  {id:CAMP_PROPS.altar.id,title:'林间祭坛',initialLevel:1,position:CAMP_PROPS.altar,stand:{x:CAMP_PROPS.altar.x,z:CAMP_PROPS.altar.z+5},paths:[],future:'后续可依神谕图纸修整供台、增添仪式设施，升级路径尚未开放。'},
];
export const findUpgradeProfile=(id:string)=>UPGRADE_PROFILES.find(p=>p.id===id);
export const findUpgradePath=(targetId:string,pathId:string)=>findUpgradeProfile(targetId)?.paths.find(p=>p.id===pathId);
export const upgradeHostId=(targetId:string)=>findUpgradeProfile(targetId)?.hostId??targetId;
export const exteriorProfilesFor=(hostId:string)=>EXTERIOR_PROFILES.filter(profile=>profile.hostId===hostId);
