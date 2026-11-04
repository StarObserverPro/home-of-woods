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
const exteriorPlan=(id:string,name:string,description:string,targetId:string,targetLabel:string,starter=false)=>({
  id,kind:'upgrade' as const,name,description,targetId,targetLabel,
  source:starter?'营地旧物箱中留存的基础装配图纸。':'林间行商常备的外部改造图纸，可用一份木料交换。',
});
/** A blueprint learns a fitting method; physical materials are consumed only when installing. */
export const CAMP_EXTERIOR_BLUEPRINTS=[
  exteriorPlan('blueprint.tent-canvas','苔绿色换帐布','帆布卷需先从行商处另行换取，再改装帐篷布面。','tent:canvas','帐篷 · 布面'),
  exteriorPlan('blueprint.tent-ropes','四角绷绳与木桩','把侧绷绳和木桩加装在现有帐篷外。','tent:ropes','帐篷 · 绳与桩',true),
  exteriorPlan('blueprint.tent-poles','外露加固撑杆','在帐篷正反两侧加装支撑。','tent:poles','帐篷 · 外撑'),
  exteriorPlan('blueprint.tent-chimes','帐门风铃','给帐篷入口添一串短木铃。','tent:chimes','帐篷 · 挂饰'),
  exteriorPlan('blueprint.cabin-roof','屋脊与檐口包边','木屋基础修缮后再收整屋顶轮廓。','cabin:roof','木屋 · 屋面'),
  exteriorPlan('blueprint.cabin-windows','外开木窗板','木屋基础修缮后加装外窗板。','cabin:windows','木屋 · 窗'),
  exteriorPlan('blueprint.cabin-entry','门前遮雨檐','木屋基础修缮后增设入口遮雨结构。','cabin:entry','木屋 · 门与外廊'),
  exteriorPlan('blueprint.camp-fire-stones','重垒挡风石圈','重新堆好现有火塘散石，不增加新石材。','camp-fire:stones','篝火 · 火塘',true),
  exteriorPlan('blueprint.camp-fire-support','双柱横梁锅架','火塘外围立柱与横梁，是烹饪上部接口的前提。','camp-fire:support','篝火 · 支架'),
  exteriorPlan('blueprint.camp-fire-hook','悬锅吊钩','留出吊锅位置，锅具以后另行制作。','camp-fire:hook','篝火 · 可换上部件'),
  exteriorPlan('blueprint.camp-fire-pot','基础悬挂汤锅','在悬锅吊钩上安装简易金属汤锅，制作菌菇汤。','camp-fire:pot','篝火 · 汤锅'),
  exteriorPlan('blueprint.camp-fire-grill','可收起的烧烤网','从行商换五金包，再做可收起的网架。','camp-fire:grill','篝火 · 可换上部件'),
  exteriorPlan('blueprint.camp-fire-smoker','焖烤烟罩','从行商换五金包，再做可拆的带烟口罩。','camp-fire:smoker','篝火 · 可换上部件'),
] as const;
export const BLUEPRINTS = [...CRAFT_BLUEPRINTS,CABIN_REPAIR_BLUEPRINT,...CAMP_EXTERIOR_BLUEPRINTS] as const;
export const STARTER_BLUEPRINTS = [CABIN_REPAIR_BLUEPRINT.id,'blueprint.tent-ropes','blueprint.camp-fire-stones'] as const;
export const SEAT_DEFINITION = 'furniture.stump-seat';
export const findBlueprint = (id:string) => BLUEPRINTS.find(b=>b.id===id);
export const findCraftBlueprint = (id:string) => CRAFT_BLUEPRINTS.find(b=>b.id===id);
export const traitLabel = (id:string) => ({comfort:'舒适',stability:'稳固'}[id] ?? id);
