import * as THREE from 'three';
import {V, VegetationBuilder, vegetationNoise as noise} from './expedition-vegetation-geometry.ts';
import type {VegetationQuality} from './expedition-vegetation-geometry.ts';

export type ExpeditionVegetationFeature = {
  id: string;
  kind: 'fallen-log' | 'nurse-log' | 'root-plate' | 'moss-curtain' | 'fern' | 'moss-rock' | 'shrub';
  x: number; y: number; z: number; rotation?: number;
  /** Logs run along local +X, Y is up, all dimensions are world units. */
  length?: number; radius?: number; height?: number; variant?: number;
};

function endGrain(wood:VegetationBuilder,x:number,y:number,z:number,radius:number,facing:number) {
  const cap=new THREE.CircleGeometry(radius,wood.quality==='near'?9:6);
  cap.rotateY(facing*Math.PI/2);cap.translate(x,y,z);wood.add(cap,'#c2a179',0);
  if(wood.quality==='far')return;
  for(let i=0;i<3;i++){
    const outer=radius*(.3+i*.23);
    const ring=new THREE.RingGeometry(outer*.92,outer,wood.quality==='near'?9:6);
    ring.rotateY(facing*Math.PI/2);ring.translate(x+facing*.008,y,z);wood.add(ring,'#987a58',0);
  }
}

function rootPlate(wood:VegetationBuilder,moss:VegetationBuilder,seed:number,radius:number,height:number) {
  const count=10,positions:number[]=[],indices:number[]=[];
  const depth=radius*.19,cy=height*.49;
  for(const side of [-1,1]){
    positions.push(side*depth,cy,0);
    for(let i=0;i<count;i++){
      const angle=i/count*Math.PI*2;
      const uneven=.87+noise(seed+i)*.18;
      positions.push(side*depth,cy+Math.sin(angle)*height*.51*uneven,Math.cos(angle)*radius*uneven);
    }
  }
  const row=count+1;
  for(let i=0;i<count;i++){
    const a=1+i,b=1+(i+1)%count;
    indices.push(0,b,a,row,row+a,row+b,a,b,row+a,b,row+b,row+a);
  }
  const disk=new THREE.BufferGeometry();disk.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));disk.setIndex(indices);disk.computeVertexNormals();
  wood.add(disk,'#69614c',0);
  for(let i=0;i<7;i++){
    const angle=(i+.2)/7*Math.PI*2,z=Math.cos(angle)*radius,y=cy+Math.sin(angle)*height*.47;
    wood.branch([V(depth*.8,cy,0),V(depth*1.2,(cy+y)*.5,z*.6),V(depth*1.2,y,z)],
      [radius*.13,radius*.075,radius*.018],'#9a7c56');
    if(i<4)moss.cluster(V(depth*1.1,Math.max(.1,y*.78),z*.6),V(depth*.7,height*.12,radius*.23),'#7d9154',seed+i,0);
  }
  wood.branch([V(-depth,cy,0),V(-radius*1.4,cy*.68,0)],[radius*.35,radius*.26],'#8a6c4b');
}

function fallenLog(wood:VegetationBuilder,green:VegetationBuilder,moss:VegetationBuilder,spec:ExpeditionVegetationFeature,seed:number) {
  const length=spec.length??8,radius=spec.radius??.65,cy=radius*.78;
  const a=V(-length/2,cy,0),mid=V(0,cy+radius*.11,radius*.09),b=V(length/2,cy*.98,0);
  wood.branch([a,mid,b],[radius,radius*.91,radius*.77],'#866c4d');
  endGrain(wood,-length/2-.008,cy,0,radius*.96,-1);
  endGrain(wood,length/2+.008,cy*.98,0,radius*.74,1);
  for(let i=0;i<3;i++){
    const x=-length*.29+i*length*.26,side=i%2?1:-1;
    wood.branch([V(x,cy+radius*.18,side*radius*.4),V(x+radius*.45,cy+radius*.7,side*radius*1.2)],
      [radius*.20,radius*.04],'#866c4d');
  }
  const nurse=spec.kind==='nurse-log';
  for(let i=0;i<(nurse?7:3);i++){
    const x=-length*.4+i*length*(nurse?.135:.31),z=(noise(seed+i)-.5)*radius*.5;
    moss.cluster(V(x,cy+radius*.82,z),V(length*(nurse?.11:.10),radius*.18,radius*.62),'#829554',seed+i,0);
  }
  if(nurse){
    for(let i=0;i<3;i++){
      const x=-length*.29+i*length*.29,y=cy+radius*.94,h=(spec.height??1.8)*(.7+noise(seed+i+9)*.4);
      wood.branch([V(x,y,0),V(x+.04,y+h,0)],[.055,.009],'#907854');
      for(let tier=0;tier<3;tier++)green.cone(V(x,y+h*(.4+tier*.21),0),h*(.26-tier*.064),h*.48,'#708850');
      // Seedling roots visibly follow the outside of the log into the forest floor.
      for(const side of [-1,1])wood.branch([V(x,y,.05),V(x+.07,cy+radius*.3,side*radius*.95),V(x+.14,-.035,side*radius*1.25)],
        [.055,.038,.011],'#8c7854');
    }
  }
}

function fernFrond(builder:VegetationBuilder,angle:number,height:number,reach:number,seed:number) {
  const dir=V(Math.cos(angle),0,Math.sin(angle)),side=V(-dir.z,0,dir.x);
  const positions:number[]=[],indices:number[]=[];
  for(let i=0;i<=6;i++){
    const t=i/6,center=dir.clone().multiplyScalar(reach*t);
    center.y=Math.sin(t*Math.PI*.83)*height;
    const width=Math.sin(t*Math.PI)*reach*(i%2?.16:.22);
    const left=center.clone().addScaledVector(side,width),right=center.clone().addScaledVector(side,-width);
    positions.push(left.x,left.y,left.z,center.x,center.y+.035,center.z,right.x,right.y,right.z);
    if(i<6){const base=i*3;indices.push(base,base+1,base+3,base+1,base+4,base+3,base+1,base+2,base+4,base+2,base+5,base+4);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  // A second geometric side avoids transparent cards and reads correctly from a low camera.
  const reverse=geometry.clone(),index=reverse.getIndex()!;
  for(let i=0;i<index.count;i+=3){const a=index.getX(i);index.setX(i,index.getX(i+2));index.setX(i+2,a);}reverse.computeVertexNormals();
  builder.add(geometry,new THREE.Color('#7d9b59').offsetHSL(0,0,(noise(seed)-.5)*.07));builder.add(reverse,'#67844b');
}

export function compileExpeditionFeature(spec:ExpeditionVegetationFeature,quality:VegetationQuality) {
  const wood=new VegetationBuilder(quality),green=new VegetationBuilder(quality),moss=new VegetationBuilder(quality);
  const seed=1071+(spec.variant??0)*193;
  switch(spec.kind){
    case 'fallen-log':case 'nurse-log':fallenLog(wood,green,moss,spec,seed);break;
    case 'root-plate':rootPlate(wood,moss,seed,spec.radius??1.7,spec.height??3.4);break;
    case 'moss-curtain':{
      const length=spec.length??5,height=spec.height??4,radius=spec.radius??.18;
      const start=V(-length*.5,height*.83,0),mid=V(0,height,.08),end=V(length*.5,height*.92,.1);
      wood.branch([start,mid,end],[radius,radius*.7,radius*.18],'#8a7758');
      const count=quality==='near'?13:quality==='mid'?8:4;
      for(let i=0;i<count;i++){
        const t=i/(count-1),anchor=t<.5?start.clone().lerp(mid,t*2):mid.clone().lerp(end,(t-.5)*2);
        moss.pendant(anchor,height*(.25+noise(seed+i)*.36),.13+noise(seed+i+4)*.13,'#95a469',seed+i);
      }
      break;
    }
    case 'fern':{
      const height=spec.height??.85,reach=spec.radius??1.05,count=quality==='far'?5:7;
      for(let i=0;i<count;i++)fernFrond(green,(i+noise(seed+i)*.23)/count*Math.PI*2,height*(.8+noise(seed+i+9)*.25),reach*(.8+noise(seed+i+41)*.2),seed+i);
      moss.cluster(V(0,.08,0),V(.16,.1,.16),'#6b8247',seed,0);break;
    }
    case 'moss-rock':{
      const radius=spec.radius??1.2,height=spec.height??.85;
      wood.cluster(V(0,height*.35,0),V(radius,height*.61,radius*.83),'#8a9482',seed,quality==='near'?1:0);
      moss.cluster(V(-radius*.12,height*.8,-radius*.08),V(radius*.83,height*.15,radius*.63),'#859854',seed+11,0);break;
    }
    case 'shrub':{
      const height=spec.height??1.7,radius=spec.radius??1.3;
      for(let i=0;i<5;i++){
        const angle=i*2.37,tip=V(Math.cos(angle)*radius*.63,height*(.62+noise(seed+i)*.15),Math.sin(angle)*radius*.63);
        wood.branch([V(0,-.02,0),tip.clone().multiplyScalar(.6).add(V(0,height*.15,0)),tip],[.085,.045,.01],'#887656');
        green.cluster(tip,V(radius*.6,height*.32,radius*.56),'#879e5d',seed+i);
      }
      break;
    }
  }
  return {wood:wood.finish(),green:green.finish(),moss:moss.finish()};
}
