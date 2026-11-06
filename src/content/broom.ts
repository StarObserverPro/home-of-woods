export const BROOM={
  definitionId:'tool.branch-broom',blueprintId:'blueprint.branch-broom',presentationId:'housing.branch-broom',
  geometry:{diameter:.5,height:1.5,silhouette:'broom'},radius:.45,
  useSeconds:3.6,siteReach:.22,actionClearance:1.2,mischiefEverySweeps:3,
  cameraYawOffset:-.55,
  markTraitId:'home.maker-mark',willfulTraitId:'home.broom-willful',oracleRiteId:'oracle.broom-will',
} as const;
export const BROOM_BLUEPRINTS=[{
  id:BROOM.blueprintId,kind:'craft',name:'枝扫帚',definitionId:BROOM.definitionId,
  description:'把两份枝料修成木柄与细枝刷头，能将营地落叶扫到一旁。',
  source:'走近工作台，展开枝扫帚基础图纸。',targetLabel:'工作台 · 手工束枝',traitId:'',traitName:'',value:0,
}] as const;
export type CampLeafPatch={id:string;name:string;center:{x:number;z:number};stand:{x:number;z:number;facing:number};leafCount:number;scatterHalfWidth:number;scatterHalfDepth:number;pileOffset:number;cameraYawOffset?:number};
/** A finite set of decorative leaves. Gathering sources and inventory are never touched. */
export const CAMP_LEAF_PATCHES:readonly CampLeafPatch[]=[
  {id:'camp-leaves:hearth',name:'火边落叶',center:{x:-37.5,z:17.1},stand:{x:-37.5,z:18,facing:Math.PI},leafCount:12,scatterHalfWidth:.4,scatterHalfDepth:.075,pileOffset:.45,cameraYawOffset:-2},
  {id:'camp-leaves:workbench',name:'工台旁落叶',center:{x:-40.1,z:11.8},stand:{x:-39.2,z:11.8,facing:-Math.PI/2},leafCount:12,scatterHalfWidth:.4,scatterHalfDepth:.075,pileOffset:.45,cameraYawOffset:.55},
  {id:'camp-leaves:clearing',name:'营地空地落叶',center:{x:-24.7,z:11.2},stand:{x:-23.8,z:11.2,facing:-Math.PI/2},leafCount:12,scatterHalfWidth:.4,scatterHalfDepth:.075,pileOffset:.45},
];
export const campLeafPatch=(id:string)=>CAMP_LEAF_PATCHES.find(patch=>patch.id===id);
export const leafPilePoint=(patch:CampLeafPatch,side:0|1)=>{
  const offset=side===0?-patch.pileOffset:patch.pileOffset;
  return {x:patch.center.x+Math.cos(patch.stand.facing)*offset,z:patch.center.z-Math.sin(patch.stand.facing)*offset};
};
