import {CLIFF} from '../content/cliffs.ts';
import {WORLD} from '../content/world.ts';
import {riverX} from './river.ts';
export function gorgeSection(x:number,z:number){
  const river=riverX(z),side=x<river?-1:1,knots=CLIFF.rimOffsets;
  const next=knots.findIndex(p=>p[0]>z),i=next<0?knots.length-2:Math.max(0,next-1),a=knots[i],b=knots[i+1];
  const offset=a[1]+(b[1]-a[1])*(z-a[0])/(b[0]-a[0]);
  const bank=river+side*CLIFF.bankWidth,rim=river+side*(CLIFF.rimWidth+offset*(side>0?1:-.6));
  return {side,bank,rim,width:(rim-bank)*side,inset:(x-bank)*side};
}
export function legacyGorgeHeight(x:number,z:number,plateau:(x:number,z:number)=>number){
  const t=Math.max(0,Math.min(1,(Math.abs(x-riverX(z))-3.2)/(20-3.2))),weight=t*t*(3-2*t);
  return .7*(1-weight)+plateau(x,z)*weight;
}
export function cutGorgeHeight(x:number,z:number,plateau:(x:number,z:number)=>number){
  const section=gorgeSection(x,z),top=plateau(section.rim,z),start=section.width-6;
  if(section.inset<start)return legacyGorgeHeight(x,z,plateau);
  if(section.inset>=section.width)return plateau(x,z);
  const foot=legacyGorgeHeight(section.bank+section.side*start,z,plateau);
  // Change only the final six metres of the shoulder; the accepted lower gorge/banks stay intact.
  return foot+(top-foot)*(section.inset-start)/6;
}
