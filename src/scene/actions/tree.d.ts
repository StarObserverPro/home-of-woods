import * as T from 'three';
export function createTree(source:T.Object3D,kind:string):{root:T.Group;upper:T.Group;crown:T.Group;radius:number;pivot:T.Vector3;update(t:number,action:string,reduced:boolean,showAnchors:boolean):void;setGround(fn:(x:number,z:number)=>number):void;setSlope(v:number,z?:number):void;stats():Record<string,unknown>;dispose():void};
