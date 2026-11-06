import type {OwnedItemDefinition} from './owned-item-definitions.ts';
import type {CraftProfile,GeometryTemplate} from './parametric-crafting.ts';

export const WOODEN_BOWL_ID='vessel.wooden-bowl';
export const MEAL_CURTAIN_TRAIT_ID='food.curtain-call';
export const MEAL_CURTAIN_RULES={durationSeconds:1.4,qualifiedMealsBetween:3,presenceRadius:7} as const;
export const MEAL_VESSEL_BLUEPRINTS=[{
  id:'blueprint.wooden-bowl',kind:'craft',name:'手作木碗',definitionId:WOODEN_BOWL_ID,
  description:'从一段实心原木刻出圆润木碗，带到火塘旁盛汤或粥。',
  source:'走近工作台，展开日用木碗图纸。',targetLabel:'工作台 · 日用器具',traitId:'',traitName:'',value:0,
}] as const;
export const MEAL_VESSEL_DEFINITIONS:readonly OwnedItemDefinition[]=[{
  definitionId:WOODEN_BOWL_ID,name:'手作木碗',category:'tableware',status:'active',
  blueprintIds:['blueprint.wooden-bowl'],mountKinds:[],presentationId:'meal.wooden-bowl',
}];
export const MEAL_VESSEL_GEOMETRY_TEMPLATES:Readonly<Record<string,GeometryTemplate>>={
  'bowl.wooden':{id:'bowl.wooden',version:1,family:'solid',parameters:{
    diameter:{kind:'number',default:.48,min:.40,max:.56,step:.04},
    height:{kind:'number',default:.16,min:.12,max:.2,step:.02},
    silhouette:{kind:'choice',default:'bowl',choices:['bowl']},
  }},
};
export const MEAL_VESSEL_PROFILES:Readonly<Record<string,CraftProfile>>={
  'blueprint.wooden-bowl':{blueprintId:'blueprint.wooden-bowl',status:'active',recipeId:'recipe.wooden-bowl',
    method:'transform',geometryTemplateId:'bowl.wooden',rarityTier:'common',
    steps:[{id:'carve',moduleId:'workbench.preset.v1'}],
    inputs:[{typeIds:['wood.log'],quantity:1,handling:'consume'}],
  },
};
export const isMealVesselBlueprint=(id:string)=>MEAL_VESSEL_BLUEPRINTS.some(plan=>plan.id===id);
