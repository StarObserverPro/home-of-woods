import {CREEK_BRIDGE} from '../content/regions.ts';
import {MOVEMENT,WORLD} from '../content/world.ts';
import {heightAt,slopeAt} from './surface.ts';
import {bridgeOpen,CLOSED_ACCESS,regionAt,regionOpen} from './regions.ts';
import type {TravelAccess} from './regions.ts';

export function onBridge(x:number,z:number,radius=0){
  return x>=CREEK_BRIDGE.west.x&&x<=CREEK_BRIDGE.east.x&&Math.abs(z-CREEK_BRIDGE.west.z)<=CREEK_BRIDGE.width/2-radius;
}
/** Ends blend into the same terrain triangles used by the banks. No hidden teleports. */
export function bridgeHeightAt(x:number,z:number){
  const {west,east}=CREEK_BRIDGE,t=(x-west.x)/(east.x-west.x);
  const center=heightAt(west.x,west.z)*(1-t)+heightAt(east.x,east.z)*t+.12*Math.sin(Math.PI*t);
  const blend=Math.max(0,Math.min(1,(x-west.x)/3,(east.x-x)/3));
  const smooth=blend*blend*(3-2*blend);
  return heightAt(x,z)*(1-smooth)+center*smooth;
}
export function travelHeightAt(x:number,z:number,access:TravelAccess=CLOSED_ACCESS){
  return bridgeOpen(access)&&onBridge(x,z)?bridgeHeightAt(x,z):heightAt(x,z);
}
export function canTraverse(x:number,z:number,access:TravelAccess=CLOSED_ACCESS,radius=MOVEMENT.radius){
  if(bridgeOpen(access)&&onBridge(x,z,radius)){
    const slope=Math.hypot((bridgeHeightAt(x+.15,z)-bridgeHeightAt(x-.15,z))/.3,(bridgeHeightAt(x,z+.15)-bridgeHeightAt(x,z-.15))/.3);
    return slope<=MOVEMENT.maxSlope;
  }
  // A raised deck has railings: don't step sideways through it onto the water or bank below.
  if(bridgeOpen(access)&&onBridge(x,z)&&x>CREEK_BRIDGE.west.x+.5&&x<CREEK_BRIDGE.east.x-.5)return false;
  const region=regionAt(x,z);
  return !!region&&regionOpen(region,access)&&heightAt(x,z)>WORLD.waterY+.15&&slopeAt(x,z)<=MOVEMENT.maxSlope;
}
