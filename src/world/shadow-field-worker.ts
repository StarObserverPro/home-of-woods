import {bakeProjectedCanopyField} from './shadow-field.ts';
import type {ShadowBakeRequest,ShadowBakeResponse} from './shadow-field-worker-protocol.ts';
const scope=globalThis as unknown as {
  onmessage:((event:MessageEvent<ShadowBakeRequest>)=>void)|null;
  postMessage:(response:ShadowBakeResponse,transfer?:Transferable[])=>void;
};
scope.onmessage=({data})=>{
  try{
    const start=performance.now(),field=bakeProjectedCanopyField(data.canopies,data.bounds,data.direction);
    scope.postMessage({id:data.id,revision:data.revision,field,elapsedMs:performance.now()-start},[field.data.buffer]);
  }catch(error){scope.postMessage({id:data.id,revision:data.revision,error:error instanceof Error?error.message:'Canopy bake failed'});}
};
