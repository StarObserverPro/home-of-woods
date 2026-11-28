import {MOVEMENT} from '../content/world.ts';
import type {Point} from '../content/world.ts';

/** Route steps stop at the current waypoint, including when running downhill. */
export function movementOffset(direction:Point,loadSpeed:number,running:boolean,dt:number,remainingDistance=Infinity,walkSpeed=MOVEMENT.speed,runSpeed=walkSpeed*MOVEMENT.runMultiplier):Point {
  const speed=(running?runSpeed:walkSpeed)*loadSpeed;
  const distance=Math.min(speed*dt,remainingDistance);
  return {x:direction.x*distance,z:direction.z*distance};
}
