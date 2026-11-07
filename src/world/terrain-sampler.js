// Read the actual rendered triangles for scenery placement. This is a spatial
// index over geometry owned by the scene, not an alternative terrain generator.
export function createTerrainSampler(geometries,cellSize=16){
 const cells=new Map(),triangles=[];
 for(const geometry of geometries){
  const p=geometry.getAttribute('position'),ix=geometry.index;
  for(let i=0;i<(ix?.count??p.count);i+=3){
   const ids=[0,1,2].map(j=>ix?ix.getX(i+j):i+j),v=ids.map(j=>[p.getX(j),p.getY(j),p.getZ(j)]),[a,b,c]=v;
   const det=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
   if(Math.abs(det)<1e-7||Math.max(a[1],b[1],c[1])<-40)continue;
   const n=triangles.length;triangles.push({a,b,c,det});
   const x0=Math.floor(Math.min(a[0],b[0],c[0])/cellSize),x1=Math.floor(Math.max(a[0],b[0],c[0])/cellSize),z0=Math.floor(Math.min(a[2],b[2],c[2])/cellSize),z1=Math.floor(Math.max(a[2],b[2],c[2])/cellSize);
   for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(n);}
  }
 }
 return (x,z)=>{
  let height=-Infinity;
  for(const i of cells.get(Math.floor(x/cellSize)+':'+Math.floor(z/cellSize))??[]){
   const {a,b,c,det}=triangles[i],u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/det,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/det,w=1-u-v;
   if(Math.min(u,v,w)>=-1e-6)height=Math.max(height,u*a[1]+v*b[1]+w*c[1]);
  }
  return height;
 };
}
