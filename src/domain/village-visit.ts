import {VILLAGER_MODELS} from '../content/characters.ts';
import {VISUAL_DAY_SECONDS} from '../content/scene-props.ts';
import type {Point} from '../content/world.ts';
import {calendarAt} from './local-clock.ts';

export function scheduledVillager(time:number){
  const {day,hour}=calendarAt(time);
  const index=day-1;
  if(index%3!==0||hour<15.25||hour>=18)return null;
  return {day,model:VILLAGER_MODELS[(index/3)%VILLAGER_MODELS.length],elapsed:(hour-15.25)*VISUAL_DAY_SECONDS/24};
}

export function villageRoute(points:readonly Point[]){
  const segments=points.slice(1).map((to,index)=>{
    const from=points[index],length=Math.hypot(to.x-from.x,to.z-from.z);
    return {from,to,length};
  }).filter(segment=>segment.length>.0001);
  return {segments,length:segments.reduce((sum,segment)=>sum+segment.length,0)};
}

export function villagePose(route:ReturnType<typeof villageRoute>,elapsed:number,speed:number){
  const travel=route.length/speed,stay=12;
  if(!route.length||elapsed<0||elapsed>=2*travel+stay)return null;
  const returning=elapsed>=travel+stay;
  const moving=elapsed<travel||returning;
  const walked=returning?(elapsed-stay)*speed:Math.min(elapsed,travel)*speed;
  let distance=returning?2*route.length-walked:walked;
  for(const {from,to,length} of route.segments){
    if(distance<=length+.0001){
      const mix=Math.max(0,Math.min(1,distance/length));
      return {x:from.x+(to.x-from.x)*mix,z:from.z+(to.z-from.z)*mix,
        facing:Math.atan2(to.x-from.x,to.z-from.z)+(returning?Math.PI:0),moving,walked};
    }
    distance-=length;
  }
  return null;
}
