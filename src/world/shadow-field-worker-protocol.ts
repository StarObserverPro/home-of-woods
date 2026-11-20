import type {ProjectedCanopy,ProjectedCanopyField,ShadowBounds,ShadowPoint} from './shadow-field.ts';
export type ShadowBakeRequest={id:number;revision:number;canopies:readonly ProjectedCanopy[];bounds:ShadowBounds;direction:ShadowPoint};
export type ShadowBakeResponse=
  | {id:number;revision:number;field:ProjectedCanopyField;elapsedMs:number}
  | {id:number;revision:number;error:string};
/** Narrow worker surface also permits deterministic, GPU-free lifecycle/queue tests. */
export type ShadowBakeWorker={
  onmessage:((event:MessageEvent<ShadowBakeResponse>)=>void)|null;
  onerror:((event:ErrorEvent)=>void)|null;
  postMessage:(message:ShadowBakeRequest)=>void;
  terminate:()=>void;
};
