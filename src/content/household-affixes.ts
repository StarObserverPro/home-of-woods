import type {AffixDescriptor} from './affix-vfx-library.ts';
import {BROOM} from './broom.ts';

/** Only these reviewed, executable household representatives are awarded here. */
export const HOUSEHOLD_AFFIX_DEFINITIONS:ReadonlyMap<string,AffixDescriptor>=new Map([
  [BROOM.markTraitId,{id:BROOM.markTraitId,grade:'common',category:'color'}],
  [BROOM.willfulTraitId,{id:BROOM.willfulTraitId,grade:'epic',category:'motion'}],
  ['food.curtain-call',{id:'food.curtain-call',grade:'epic',category:'interaction'}],
]);
export type ItemOracleRite={id:string;name:string;ownerDefinitionId:string;traitId:string;durationSeconds:number};
export const ITEM_ORACLE_RITES:readonly ItemOracleRite[]=[
  {id:BROOM.oracleRiteId,name:'问一问扫帚的脾气',ownerDefinitionId:BROOM.definitionId,traitId:BROOM.willfulTraitId,durationSeconds:3},
  {id:'oracle.meal-curtain',name:'为饭后留一声谢幕',ownerDefinitionId:'vessel.wooden-bowl',traitId:'food.curtain-call',durationSeconds:3},
];
export const itemOracleRite=(id:string)=>ITEM_ORACLE_RITES.find(rite=>rite.id===id);
export const isOracleHouseholdItem=(definitionId:string)=>ITEM_ORACLE_RITES.some(rite=>rite.ownerDefinitionId===definitionId);
