/**
 * Decorative distant woodland: merge a few adjacent crowns into a solid
 * visual volume. This layer owns no tree slots, collision or save state.
 */
export const DISTANT_MASS = Object.freeze({
  cellSize: 48, mergeWithin: 22, minMembers: 3,
  maxMembers: 4, keepIndividualInside: 240,
});
const extent = point => Math.max(Math.abs(point.x), Math.abs(point.z));
const conifer = kind => kind === 'pine' || kind === 'spruce' || kind === 'fir';
const crownRadius = t => (t.kind === 'oak' ? 2.65 : t.kind === 'pine' ? 2.45 : t.kind === 'poplar' ? 1.45 : 2.05) * t.width;
function massFrom(trees) {
  const count = trees.length;
  const x = trees.reduce((n,t) => n+t.x,0)/count, z = trees.reduce((n,t) => n+t.z,0)/count;
  let low=Infinity, high=-Infinity, rx=0, rz=0;
  for(const t of trees) {
    const r=crownRadius(t);
    rx=Math.max(rx,Math.abs(t.x-x)+r);
    rz=Math.max(rz,Math.abs(t.z-z)+r);
    low=Math.min(low,t.y+1.4*t.height);
    high=Math.max(high,t.y+8.1*t.height);
  }
  return {x,y:(low+high)/2,z,rx,ry:Math.max(1,(high-low)/2),rz,
    conifer:trees.filter(t=>conifer(t.kind)).length>count/2,
    tone:trees.reduce((n,t)=>n+t.tone,0)/count,members:count};
}
export function clusterDistantForest(placements,options={}) {
  if(options.enabled===false)return {singles:placements.slice(),masses:[],mergedTrees:0};
  const cfg={...DISTANT_MASS,...options},cells=new Map();
  for(const tree of placements){
    const key=Math.floor(tree.x/cfg.cellSize)+':'+Math.floor(tree.z/cfg.cellSize);
    if(!cells.has(key))cells.set(key,[]);
    cells.get(key).push(tree);
  }
  const singles=[],masses=[];
  for(const members of cells.values()){
    if(members.length<cfg.minMembers+1){singles.push(...members);continue;}
    // Preserve the highest crown in every cell, including apparent skylines.
    const top=members.reduce((best,t)=>t.y+8.1*t.height>best.y+8.1*best.height?t:best);
    singles.push(top);
    const pending=members.filter(t=>t!==top);
    while(pending.length){
      const anchor=pending.shift();
      if(extent(anchor)<cfg.keepIndividualInside){singles.push(anchor);continue;}
      const near=pending.map((tree,index)=>({tree,index,d:Math.hypot(tree.x-anchor.x,tree.z-anchor.z)}))
        .filter(t=>t.d<=cfg.mergeWithin).sort((a,b)=>a.d-b.d||a.index-b.index).slice(0,cfg.maxMembers-1);
      if(near.length+1<cfg.minMembers){singles.push(anchor);continue;}
      const group=[anchor,...near.map(t=>t.tree)];
      for(const item of [...near].sort((a,b)=>b.index-a.index))pending.splice(item.index,1);
      masses.push(massFrom(group));
    }
  }
  return {singles,masses,mergedTrees:masses.reduce((sum,m)=>sum+m.members,0)};
}
