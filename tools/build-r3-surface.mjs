// Art-directed cleanup of annotated Atlas RGBD ground, not a survey or raw scan.
// XZ scale 6; height exaggerated 1.6x for the playable toy landscape.
import fs from 'node:fs';
const a=JSON.parse(fs.readFileSync('art/reference/r3-ground-annotations.json','utf8'));
const point=name=>{
 const v=a.anchors.find(p=>p.name===name).point;
 return [v[0]*6,(v[2]+24)*6,v[1]*9.6];
};
const selected=['cabin-front-ground','tent-front-ground','camp-open-ground','rear-path','camp-path','down-path-1','down-path-2','down-path-3','down-path-4','giant-foot','mid-slope','low-slope','low-path','camp-right-slope'];
const controls=selected.map(point);
// Occluded foreground, trunks, sky and opposite-path samples are explicitly excluded.
// Broad external contours extend only the reference's stated mountain/hill structure.
controls.push([-1,43,5.5],[-8,48,5],[3,48,3.8],[-14,55,4.7],
 [-85,-90,58],[-105,-20,51],[-85,50,27],[-65,85,7],[-20,80,2],
 [-42,-110,64],[-8,-80,41],[15,-35,24],[40,-10,29],[70,5,35],[90,35,32],[50,55,18],
 [0,70,1.2],[35,35,6],[55,-45,34],[95,-100,45],[-140,-140,65],[140,-140,49],[-140,140,10],[140,140,28]);
// RBF with a broad kernel and affine tail preserves large landforms without periodic noise.
const kernel=d=>Math.exp(-((d/30)**2));
const n=controls.length,N=n+3,m=Array.from({length:N},()=>Array(N+1).fill(0));
for(let i=0;i<n;i++){
 const [x,z,h]=controls[i];
 for(let j=0;j<n;j++)m[i][j]=kernel(Math.hypot(x-controls[j][0],z-controls[j][1]));
 m[i][i]+=.002; m[i][n]=m[n][i]=1; m[i][n+1]=m[n+1][i]=x; m[i][n+2]=m[n+2][i]=z; m[i][N]=h;
}
for(let k=0;k<N;k++){
 let p=k;for(let j=k+1;j<N;j++)if(Math.abs(m[j][k])>Math.abs(m[p][k]))p=j;
 [m[k],m[p]]=[m[p],m[k]];
 const v=m[k][k]; if(Math.abs(v)<1e-10)throw new Error('Singular surface fit');
 for(let j=k;j<=N;j++)m[k][j]/=v;
 for(let i=0;i<N;i++)if(i!==k){const f=m[i][k];for(let j=k;j<=N;j++)m[i][j]-=f*m[k][j];}
}
const weights=m.map(row=>row[N]);
const grid=[];
for(let z=-150;z<=150;z+=2)for(let x=-150;x<=150;x+=2){
 let h=weights[n]+weights[n+1]*x+weights[n+2]*z;
 for(let i=0;i<n;i++)h+=weights[i]*kernel(Math.hypot(x-controls[i][0],z-controls[i][1]));
 grid.push(Math.round(Math.max(.6,Math.min(80,h))*1000)/1000);
}
const data={layoutVersion:'r3-atlas-cleanup-1',source:'c428daff-5a22-41d8-91bb-e5a82a0ea49a:3',poseOperation:'3508c9b3ae2c4da79088f28c220c37c6',transform:{xzScale:6,verticalExaggeration:1.6,zOffset:24},excluded:'foreground-tree, tree trunks, sky, occluded opposite-bank samples',min:-150,max:150,step:2,controls,heights:grid};
fs.writeFileSync('src/content/valley-r3.json',JSON.stringify(data));
console.log(JSON.stringify({vertices:grid.length,min:Math.min(...grid),max:Math.max(...grid),controls:controls.length}));
