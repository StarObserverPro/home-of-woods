/** Prototype costs and durations; not the final economy. */
export const WORKBENCH = {id:'camp-workbench', x:-44, z:12.6, halfX:1.7, halfZ:.7, tier:1, stand:{x:-44,z:14.4}} as const;
export const WORKBENCH_STOOL = {id:'camp-workbench-stool',x:-47,z:12.8,radius:.6,tier:1} as const;
export const WORKSHOP_RULES = {offeringSeconds:1.8,craftSeconds:3,seatRadius:.65,maxPlacementSlope:.22,daysPerSeason:7} as const;
export const CRAFT_BLUEPRINTS = [
  {id:'blueprint.stump-cozy',kind:'craft',name:'暖木墩',description:'圆润的原木坐墩，适合围着篝火坐一会儿。',source:'向行商交换，或在祭坛供奉蘑菇。',targetLabel:'工作台 · 制作家具',traitId:'comfort',traitName:'舒适',value:2},
  {id:'blueprint.stump-sturdy',kind:'craft',name:'稳木墩',description:'同样的原木轮廓，保留更厚实的支撑。',source:'向行商交换，或在祭坛供奉蘑菇。',targetLabel:'工作台 · 制作家具',traitId:'stability',traitName:'稳固',value:2},
] as const;
export const CABIN_REPAIR_BLUEPRINT = {
  id:'blueprint.cabin-repair',kind:'upgrade',name:'木屋修缮·第一阶段',
  description:'补好两处屋顶缺口，加固门边支撑。整屋翻修还需后续图纸。',
  source:'营地自带的旧屋修缮图纸。',targetLabel:'旧木屋 · 屋顶补板与入口加固',targetId:'cabin',
} as const;
export const BLUEPRINTS = [...CRAFT_BLUEPRINTS,CABIN_REPAIR_BLUEPRINT] as const;
export const STARTER_BLUEPRINTS = [CABIN_REPAIR_BLUEPRINT.id] as const;
export const SEAT_DEFINITION = 'furniture.stump-seat';
export const findBlueprint = (id:string) => BLUEPRINTS.find(b=>b.id===id);
export const findCraftBlueprint = (id:string) => CRAFT_BLUEPRINTS.find(b=>b.id===id);
export const traitLabel = (id:string) => ({comfort:'舒适',stability:'稳固'}[id] ?? id);
