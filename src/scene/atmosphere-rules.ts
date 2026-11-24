import {ATMOSPHERE as C} from '../content/atmosphere.ts';
import {ENVIRONMENT_STYLE} from '../content/environment.ts';

const clamp01=(x:number)=>Math.max(0,Math.min(1,x));

/** Mean exponential density along a straight segment, including a below-base part. */
export function meanAtmosphereDensity(startHeightM:number,endHeightM:number,scaleHeightM:number):number {
  if(![startHeightM,endHeightM,scaleHeightM].every(Number.isFinite)||scaleHeightM<=0)throw new Error('Invalid atmosphere heights');
  const low=Math.min(startHeightM,endHeightM),high=Math.max(startHeightM,endHeightM);
  if(high<=0)return 1;
  if(high-low<1e-5)return Math.exp(-Math.max(0,low)/scaleHeightM);
  const positiveLow=Math.max(0,low),span=high-positiveLow;
  const positiveIntegral=scaleHeightM*Math.exp(-positiveLow/scaleHeightM)*(-Math.expm1(-span/scaleHeightM));
  return clamp01((Math.max(0,-low)+positiveIntegral)/(high-low));
}

export function atmosphereWeatherKey(cloud:number,rain:number) {
  const c=Math.round(clamp01(cloud)*C.weatherQuantization),r=Math.round(clamp01(rain)*C.weatherQuantization);
  return {key:`${c}:${r}`,cloud:c/C.weatherQuantization,rain:r/C.weatherQuantization};
}

export function atmosphereExtinction(cloud:number,rain:number) {
  return {
    rayleigh:C.rayleighPerMeter.map(b=>b*ENVIRONMENT_STYLE.rayleigh) as [number,number,number],
    aerosol:C.aerosolExtinctionPerMeter*(1+1.6*clamp01(cloud)+3.5*clamp01(rain)),
  };
}

/** Two rows, molecular and aerosol RGB transmittance. Quadratic spacing resolves near air. */
export function bakeTransmittanceLut(cloud:number,rain:number) {
  const {rayleigh,aerosol}=atmosphereExtinction(cloud,rain),data=new Float32Array(C.lutWidth*2*4);
  for(let row=0;row<2;row++)for(let x=0;x<C.lutWidth;x++){
    const path=(x/(C.lutWidth-1))**2*C.maxOpticalDistanceM,index=(row*C.lutWidth+x)*4;
    for(let channel=0;channel<3;channel++)data[index+channel]=Math.exp(-path*(row===0?rayleigh[channel]:aerosol));
    data[index+3]=1;
  }
  return data;
}

export function atmosphereSegment(distanceWorld:number,startY:number,endY:number,cloud:number,rain:number) {
  if(![distanceWorld,startY,endY].every(Number.isFinite)||distanceWorld<0)throw new Error('Invalid atmosphere segment');
  const {rayleigh,aerosol}=atmosphereExtinction(cloud,rain),meters=distanceWorld*C.metersPerWorldUnit;
  const a=(startY-C.baseY)*C.metersPerWorldUnit,b=(endY-C.baseY)*C.metersPerWorldUnit;
  const rayPath=meters*meanAtmosphereDensity(a,b,C.rayleighScaleHeightM);
  const aerosolPath=meters*meanAtmosphereDensity(a,b,C.aerosolScaleHeightM);
  return {rayPath,aerosolPath,transmittance:rayleigh.map(beta=>Math.exp(-beta*rayPath-aerosol*aerosolPath))};
}
