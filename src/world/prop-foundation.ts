import {heightAt} from './surface.ts';
export function planStoneFoundation(x:number,z:number,radius=3.15){
  const samples:{x:number;z:number;height:number}[]=[];
  const sample=(px:number,pz:number)=>samples.push({x:px,z:pz,height:heightAt(px,pz)});
  for(let dz=-radius;dz<=radius;dz+=.4)for(let dx=-radius;dx<=radius;dx+=.4)if(Math.hypot(dx,dz)<=radius)sample(x+dx,z+dz);
  for(let i=0;i<64;i++){const a=i/64*Math.PI*2;sample(x+Math.cos(a)*radius,z+Math.sin(a)*radius);}
  sample(x,z);
  const low=Math.min(...samples.map(p=>p.height)),high=Math.max(...samples.map(p=>p.height));
  return {x,z,radius,levelY:high+.22,low,high,samples};
}
