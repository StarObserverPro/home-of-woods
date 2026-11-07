import routed from './landscape-routes.json' with {type:'json'};

export type LandscapeRoute = {
  id:string; name:string; width:number; points:number[][]; gate:number[]|null;
};
/** Visual route continuations only. Navigation and open regions remain world-owned. */
export const LANDSCAPE_ROUTES:LandscapeRoute[] = [
  {id:'pass',name:'宅后山口',width:2.2,...routed.pass},
  {id:'bridge',name:'东岸桥位',width:2.1,...routed.bridge},
  {id:'east',name:'东岸山脊',width:1.7,...routed.east},
  {id:'downstream',name:'下游旧林道',width:1.6,...routed.downstream},
];
