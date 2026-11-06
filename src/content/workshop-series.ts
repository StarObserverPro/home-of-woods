/** A handwork facility tier is independent of an item's rolled rarity. */
export const WORKBENCH_BRACING={
  id:'camp-workbench:bracing',pathId:'upgrade.camp-workbench.bracing',blueprintId:'blueprint.workbench-bracing',
  prepareSeconds:3,finishSeconds:2,adjustPositionStep:.1,adjustHeightStep:.05,adjustAngleStep:.1,
} as const;
export const WORKBENCH_BRACING_BLUEPRINT={
  id:WORKBENCH_BRACING.blueprintId,kind:'upgrade',name:'工作台支架改良',
  description:'给粗木工作台加装斜撑、压条和定位靠山，便于对齐支撑与台面。',
  source:'走近工作台，展开支架改良图纸。',targetLabel:'工作台 · 支架与定位靠山',targetId:WORKBENCH_BRACING.id,
} as const;
export const WORKSHOP_SERIES_BLUEPRINTS=[
  {id:'blueprint.bench-guided',kind:'craft',name:'量身长凳',definitionId:'furniture.guest-bench',
    description:'按选定尺寸对齐两侧支撑与坐面，做成一张适合空地的长凳。',source:'工作台支架改良后学习基础装配图纸。',targetLabel:'改良工作台 · 对齐装配',traitId:'',traitName:'',value:0},
  {id:'blueprint.prep-side-table',kind:'craft',name:'备餐边桌',definitionId:'furniture.prep-side-table',
    description:'沿用长凳的支撑与面板结构，做成火塘旁可以放东西的窄边桌。',source:'工作台支架改良后学习基础装配图纸。',targetLabel:'改良工作台 · 对齐装配',traitId:'',traitName:'',value:0},
] as const;
export type SeriesDimension={key:'length'|'width'|'height'|'supportCount';label:string;min:number;max:number;step:number};
const dimension=(key:SeriesDimension['key'],label:string,min:number,max:number,step:number):SeriesDimension=>({key,label,min,max,step});
export const WORKSHOP_SERIES={
  'blueprint.bench-guided':{
    defaultParameters:{length:2,width:.7,height:.8,seatThickness:.15,supportCount:2,supportInset:.2},
    dimensions:[dimension('length','长度',1.6,2.4,.1),dimension('width','宽度',.55,.9,.05),dimension('height','高度',.65,.95,.05),dimension('supportCount','支撑数',2,3,1)],
    presets:[{id:'compact',name:'短凳',parameters:{length:1.6,width:.6,height:.7}},{id:'standard',name:'标准',parameters:{length:2,width:.7,height:.8}},{id:'wide',name:'舒展',parameters:{length:2.4,width:.85,height:.9}}],
  },
  'blueprint.prep-side-table':{
    defaultParameters:{length:1.4,width:.65,height:1.1,seatThickness:.15,supportCount:2,supportInset:.2},
    dimensions:[dimension('length','长度',1.2,2,.1),dimension('width','宽度',.5,.9,.05),dimension('height','高度',.8,1.2,.05),dimension('supportCount','支撑数',2,3,1)],
    presets:[{id:'compact',name:'窄桌',parameters:{length:1.2,width:.5,height:1}},{id:'standard',name:'标准',parameters:{length:1.4,width:.65,height:1.1}},{id:'wide',name:'宽面',parameters:{length:2,width:.85,height:1.2}}],
  },
} as const;
export const isGuidedBlueprint=(id:string):id is keyof typeof WORKSHOP_SERIES=>Object.hasOwn(WORKSHOP_SERIES,id);
export const workshopSeries=(id:string)=>isGuidedBlueprint(id)?WORKSHOP_SERIES[id]:null;
export const guidedBlueprint=(id:string)=>WORKSHOP_SERIES_BLUEPRINTS.find(plan=>plan.id===id);
