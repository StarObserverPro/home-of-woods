import * as T from 'three';
// Original sandbox mesh: five curved ribbons packed into one 25-triangle tuft.
export function grassTuft(){
 const positions=[];
 for(let blade=0;blade<5;blade++){
  const angle=blade*2.399, h=.24+(blade%3)*.075, bend=.10+(blade%2)*.045;
  const point=(t,side)=>{const width=.028*(1-t)*side;return [Math.cos(angle)*bend*t*t-Math.sin(angle)*width,h*(t-.16*t*t),Math.sin(angle)*bend*t*t+Math.cos(angle)*width];};
  for(let j=0;j<3;j++){const a=point(j/3,-1),b=point(j/3,1),c=point((j+1)/3,-1),d=point((j+1)/3,1);positions.push(...a,...b,...c);if(j<2)positions.push(...b,...d,...c);}
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.computeVertexNormals();return g;
}
export const SHADE_THRESHOLD=.42;
// Elliptical canopy projection with a soft outer boundary; overlapping crowns accumulate.
export function canopyMask(x,z,crowns){let light=1;for(const c of crowns){const d=Math.hypot((x-c.x)/c.rx,(z-c.z)/c.rz);const t=Math.max(0,Math.min(1,(1-d)/.50));const coverage=t*t*(3-2*t)*.88;light*=1-coverage;}return 1-light;}
export function colonyField(x,z,shade){const edge=Math.max(0,Math.min(1,(shade-SHADE_THRESHOLD)/.40));const variation=.78+.15*Math.sin(x*2.2+z*.9)+.07*Math.cos(z*3-x);return edge*variation;}
