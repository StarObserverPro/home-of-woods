import * as T from 'three';
export function createActor(model:T.Object3D,motions:T.AnimationClip[]):{root:T.Group;body:T.Object3D;bones:Record<string,T.Bone>;axe:T.Group;update(action:string,t:number,options?:{radius?:number;slope?:number;crossSlope?:number}):void;dispose():void};
