import {RIVER_KNOTS} from '../content/world.ts';
/** The accepted river centerline, shared by water, the banks and the cliff section. */
export function riverX(z:number){
  const next=RIVER_KNOTS.findIndex(p=>p.z>z),i=next<0?RIVER_KNOTS.length-2:Math.max(0,next-1),a=RIVER_KNOTS[i],b=RIVER_KNOTS[i+1];
  return a.x+(b.x-a.x)*(z-a.z)/(b.z-a.z);
}
