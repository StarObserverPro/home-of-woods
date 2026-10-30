import {readFile,writeFile} from 'node:fs/promises';
const root=import.meta.dirname;
async function edit(file,fn){const p=`${root}/${file}`;await writeFile(p,fn(await readFile(p,'utf8')));}
await edit('src/scene/terrain.ts',s=>{
  s="import {buildClosedTerrain} from '../world/closed-terrain.ts';\n"+s;
  const a=s.indexOf('  const positions: number[]'),b=s.indexOf('  const mat = createGroundMaterial');
  return s.slice(0,a)+`  const geo = r.geometry('r5-closed-adaptive-terrain',buildClosedTerrain);\n`+s.slice(b);
});
await edit('src/world/surface.ts',s=>{
  s=s.replace('function rawHeight(x: number, z: number)', 'function baseHeight(x: number, z: number)');
  const pos=s.indexOf('// Mesh vertices');
  return s.slice(0,pos)+`// Large planar facets on the gorge; every gameplay consumer shares the result.
function rawHeight(x:number,z:number){
  const original=baseHeight(x,z);
  if(pathDistance(x,z)<7||Math.hypot(x-HOME.x,z-HOME.z)<22)return original;
  const slope=Math.hypot((baseHeight(x+2,z)-baseHeight(x-2,z))/4,(baseHeight(x,z+2)-baseHeight(x,z-2))/4);
  if(slope<.58)return original;
  const step=8,ax=Math.floor(x/step)*step,az=Math.floor(z/step)*step,u=(x-ax)/step,v=(z-az)/step;
  const a=baseHeight(ax,az),b=baseHeight(ax+step,az),c=baseHeight(ax,az+step),d=baseHeight(ax+step,az+step);
  const plane=u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
  const blend=smooth(.58,1.1,slope);
  return original*(1-blend)+plane*blend;
}
`+s.slice(pos);
});
await edit('src/scene/ground-material.ts',s=>{
  s=s.replace('varying float vGroundUp;','varying float vGroundUp;\nvarying vec3 vGroundWorld;');
  s=s.replace(`return mix(cover,\${rgb(PALETTE.path)},1.-smoothstep(2.4,2.65,roadD));`,`float vergeNoise=(patchNoise(p*.65)-.5)*.24;
 float road=1.-smoothstep(2.24+vergeNoise,2.55+vergeNoise,roadD);
 float centerWear=1.-smoothstep(.7,1.9,roadD);
 float gravel=step(.92,patchHash(floor(p*7.)))*.10;
 vec3 trail=mix(\${rgb(PALETTE.path)},\${rgb('#c5a077')},centerWear*.38);
 trail*=.97+patchNoise(p*2.4)*.06+gravel;
 return mix(cover,trail,road);`);
  s=s.replace(`'varying vec2 vGroundXZ;varying float vGroundUp;\\n'`,`'varying vec2 vGroundXZ;varying float vGroundUp;varying vec3 vGroundWorld;\\n'`);
  s=s.replace('vGroundXZ=position.xz;vGroundUp=abs(normal.y);','vGroundXZ=position.xz;vGroundUp=abs(normal.y);vGroundWorld=(modelMatrix*vec4(position,1.)).xyz;');
  s=s.replace("    shader.fragmentShader=helpers+",`    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\\nvec3 facet=normalize(cross(dFdx(vGroundWorld),dFdy(vGroundWorld)));facet*=gl_FrontFacing?1.:-1.;if(abs(facet.y)<.76)normal=normalize(mat3(viewMatrix)*facet);');
    shader.fragmentShader=helpers+`);
  return s.replace('r4-planned-ground-','r5-faceted-trail-');
});
await edit('src/world/layout.ts',s=>"import {REVIEW_PROPS} from '../content/scene-review.ts';\n"+s.replace('  return [\n    { id: "cabin"','  return [\n    ...Object.values(REVIEW_PROPS).map(p=>({id:p.id,x:p.x,z:p.z,radius:p.radius})),\n    { id: "cabin"'));
await edit('src/scene/environment.ts',s=>{
  s="import {daylightAt} from '../domain/scene-review.ts';\n"+s;
  s=s.replace('  u.pnwSkyRadianceScale=', '  u.reviewNight={value:0};\n  u.pnwSkyRadianceScale=');
  s=s.replace("sky.material.fragmentShader='uniform float pnwSkyRadianceScale;", "sky.material.fragmentShader='uniform float reviewNight;uniform float pnwSkyRadianceScale;");
  s=s.replace('texColor * pnwSkyTint * pnwSkyRadianceScale, 1.0','mix(texColor * pnwSkyTint * pnwSkyRadianceScale,vec3(.008,.015,.038)+vec3(.015,.024,.045)*max(0.,normalize(vWorldPosition).y),reviewNight), 1.0');
  s=s.replace('    group,lighting,environmentMap:',`    setHour(hour:number){
      const {day,night,warm,altitude}=daylightAt(hour);
      sunDirection.set(-.6,Math.max(.08,altitude),-.32).normalize();
      u.sunPosition.value.copy(sunDirection);u.reviewNight.value=night;
      u.pnwSkyTint.value.setRGB(.68+warm*.30,.84-warm*.2,1-warm*.42);
      lighting.sunColor.set('#fff1d3').lerp(new THREE.Color('#f4a46c'),warm*.75).lerp(new THREE.Color('#9aafff'),night);
      lighting.sunIntensity=.20*night+2.1*day;
      lighting.skyColor.set('#a3bfd5').lerp(new THREE.Color('#5d76ac'),night);
      lighting.groundColor.set('#71784f').lerp(new THREE.Color('#17273e'),night);
      lighting.ambientIntensity=.32+day*.73;
      lighting.environmentIntensity=.065+day*.235;
      lighting.haze.set('#819eaf').lerp(new THREE.Color('#171f39'),night);
      airUniforms.pnwSnowDiffuseFloor.value.fromArray(ENVIRONMENT_STYLE.snowDiffuseFloor).multiplyScalar(.12+.88*day);
      airUniforms.pnwIceDiffuseFloor.value.fromArray(ENVIRONMENT_STYLE.iceDiffuseFloor).multiplyScalar(.12+.88*day);
      return {day,night};
    },
    group,lighting,environmentMap:`);
  return s;
});
await edit('src/scene/create-scene.ts',s=>{
  s="import {createCreek} from './creek.ts';\nimport {createCampProps} from './camp-props.ts';\nimport {createReviewState,VIEWS,REVIEW_PROPS} from '../content/scene-review.ts';\nimport type {ReviewView} from '../content/scene-review.ts';\n"+s;
  s=s.replace('antialias: true,','antialias: true,');
  s=s.replace('  const river=createRiverAppearance(r,water);','  const river=createCreek(r,water);\n  const review=createReviewState(),camp=createCampProps(r);\n  scene.add(river.group,camp.group);\n  let reviewView:ReviewView=\'overview\';\n  let renderingCapture=false;');
  s=s.replace('...gathering.hits.objects()]','...gathering.hits.objects(),...camp.hits]');
  s=s.replace('      const sourceId = gathering.hits.resolve(hit.object);',"      if(hit.object.userData.reviewId){review.selected=hit.object.userData.reviewId;intent({kind:'select',id:review.selected!});return;}\n      const sourceId = gathering.hits.resolve(hit.object);");
  s=s.replace('    canvas,\n    camera,','    review,\n    setReviewView(value:ReviewView){reviewView=value;const preset=VIEWS[value];yaw=preset.yaw;elevation=preset.elevation;zoom=preset.zoom;target.fromArray(preset.target);river.invalidate();},\n    capture(state:GameState){renderingCapture=true;try{view.render(state,0);return canvas.toDataURL(\'image/png\');}finally{renderingCapture=false;}},\n    canvas,\n    camera,');
  s=s.replace('      elapsed += dt;',`      elapsed = state.time;
      const sky=environment.setHour(review.hour);
      if(review.cycle)review.hour=(review.hour+dt*.15)%24;
      hemi.color.copy(light.skyColor);hemi.groundColor.copy(light.groundColor);hemi.intensity=light.ambientIntensity;
      sun.color.copy(light.sunColor);sun.intensity=light.sunIntensity;sun.position.copy(sun.target.position).addScaledVector(light.sunDirection,135);
      scene.environmentIntensity=light.environmentIntensity;(scene.fog as THREE.Fog).color.copy(light.haze);
      camp.update(elapsed,review,state.inventory,sky.night,reducedMotion);`);
  s=s.replace('      if(inspecting)target.copy(desired);else target.lerp(desired, reducedMotion ? 1 : 1 - Math.exp(-dt * 5));',`      if(inspecting)target.copy(desired);else target.fromArray(VIEWS[reviewView].target);`);
  s=s.replace('.multiplyScalar(inspecting?11:110);','.multiplyScalar(inspecting?11:VIEWS[reviewView].distance);');
  s=s.replace('      river.update(elapsed,dt,reducedMotion);','      river.update(elapsed,sky.day,reducedMotion,review.reflections,host.clientWidth<600);');
  s=s.replace('      renderer.render(scene, camera);','      renderer.info.reset();\n      renderer.info.autoReset=false;\n      renderer.render(scene, camera);');
  s=s.replace('        resources: r.stats(),','        review:{...review,view:reviewView},\n        camp:camp.stats(),\n        terrain:ground.geometry.userData,\n        shaderErrors:renderer.info.programs?.filter(p=>p.diagnostics&&p.diagnostics.runnable===false).length??0,\n        resources: r.stats(),');
  s=s.replace('      river.dispose();','      river.dispose();\n      camp.dispose();');
  return s;
});
await edit('src/app/runtime.ts',s=>{
  s="import type {ReviewView,AltarState} from '../content/scene-review.ts';\nimport {inventoryTransaction} from '../domain/inventory.ts';\n"+s;
  s=s.replace('  return {\n    navigate(id: string)',`  return {
    review:view.review,
    setReview(patch:Partial<typeof view.review>){Object.assign(view.review,patch);view.render(state,0);publishSnapshot();},
    setReviewView(value:ReviewView){view.setReviewView(value);view.render(state,0);publishSnapshot();},
    setReviewWood(quantity:number){
      const deltas=state.inventory.stacks.filter(s=>s.itemId==='wood').map(s=>({itemId:s.itemId,qualityId:s.qualityId,delta:-s.quantity}));
      deltas.push({itemId:'wood',qualityId:'ordinary',delta:quantity});state.inventory=inventoryTransaction(state.inventory,deltas);view.render(state,0);publishSnapshot();
    },
    capture:()=>view.capture(state),
    navigate(id: string)`);
  return s;
});
console.log('R5 candidate upgraded in independent snapshot.');
