import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const host=document.querySelector('#canvas'), scene=new THREE.Scene();scene.background=new THREE.Color('#c7dbd0');scene.fog=new THREE.Fog('#c7dbd0',100,190);
const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,300),renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.append(renderer.domElement);
scene.add(new THREE.HemisphereLight('#f5f8df','#778b6b',2));const sun=new THREE.DirectionalLight('#fff1d1',2.4);sun.position.set(-35,65,40);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-65,right:65,top:65,bottom:-65,near:1,far:150});sun.shadow.bias=-.0002;scene.add(sun);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.48;controls.minDistance=12;controls.maxDistance=125;
const rand=(n)=>{let x=Math.sin(n*127.1+311.7)*43758.5453123;return x-Math.floor(x)};
const river=x=>3*Math.sin(x*.055);const height=(x,z)=>{let d=Math.abs(z-river(x));return .2+Math.min(19,Math.pow(d/10,1.25)*2.35)+1.2*Math.sin(x*.055)*Math.min(d/20,1)};
const ground=new THREE.PlaneGeometry(132,112,80,70);ground.rotateX(-Math.PI/2);let p=ground.attributes.position;const colors=[];for(let i=0;i<p.count;i++){let x=p.getX(i),z=p.getZ(i),h=height(x,z);p.setY(i,h);let d=Math.abs(z-river(x));let c=new THREE.Color(d<5?'#b8b391':h>12?'#849b69':d<14?'#9fb67a':'#91aa70');c.multiplyScalar(.95+rand(i)*.1);colors.push(c.r,c.g,c.b)}ground.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));ground.computeVertexNormals();const terrain=new THREE.Mesh(ground,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}));terrain.receiveShadow=true;scene.add(terrain);
const water=new THREE.PlaneGeometry(132,6,80,1);water.rotateX(-Math.PI/2);const wp=water.attributes.position;for(let i=0;i<wp.count;i++){let x=wp.getX(i),z=wp.getZ(i);wp.setZ(i,z+river(x));wp.setY(i,.48)}water.computeVertexNormals();const creek=new THREE.Mesh(water,new THREE.MeshStandardMaterial({color:'#7db8b1',roughness:.3,metalness:.08}));creek.receiveShadow=true;scene.add(creek);
const forest=new THREE.Group(),lineup=new THREE.Group(),pair=new THREE.Group(),pineView=new THREE.Group();scene.add(forest,lineup,pair,pineView);lineup.visible=false;pair.visible=false;pineView.visible=false;
const species=['松','云杉','冷杉','栎','桦','杨','榆','鹅掌楸'];
const foliage=['#57763c','#416658','#536b53','#718e42','#9bac60','#8baf5e','#648b4d','#799950'];
const bark=['#876444','#6f5c4b','#858377','#786248','#d6d3bf','#a4a99a','#756857','#82765e'];
const ballGeo=new THREE.IcosahedronGeometry(1,1),coneGeo=new THREE.ConeGeometry(1,1,9),woodGeo=new THREE.CylinderGeometry(.55,1,1,7), markGeo=new THREE.BoxGeometry(1,1,1);
function branch(group,mat,a,b,r){const dir=new THREE.Vector3().subVectors(b,a);let m=new THREE.Mesh(woodGeo,mat);m.position.copy(a).add(b).multiplyScalar(.5);m.scale.set(r,dir.length(),r);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());m.castShadow=true;group.add(m);}
function crown(group,mat,x,y,z,sx,sy,sz,shapeSeed){
 shapeSeed ??= group.userData.treeSeed*17+(group.userData.crownIndex++);
 let geometry=ballGeo;
 if(shapeSeed!==undefined){
  geometry=new THREE.IcosahedronGeometry(1,2);const p=geometry.attributes.position,phase=rand(shapeSeed*31)*6.28;
  for(let i=0;i<p.count;i++){let x=p.getX(i),y=p.getY(i),z=p.getZ(i),v=1+.13*Math.sin(x*3.4+z*2.1+phase)*Math.cos(y*3.0-phase*.7)+.07*Math.sin(z*5.1-y*3.7+phase*1.6)+.045*Math.cos(x*6.1+y*4.2+z*3.0+phase);p.setXYZ(i,x*v+.09*(y*y-.3),y*v,z*v)}
  geometry.computeVertexNormals();
 }
 let m=new THREE.Mesh(geometry,mat);m.name='foliage';m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;group.add(m)
}
function cone(group,mat,y,r,h,offset=0){let m=new THREE.Mesh(coneGeo,mat);m.name='foliage';m.position.set(offset,y,0);m.scale.set(r,h,r);m.castShadow=true;group.add(m)}
function makeTree(kind,id){
 const g=new THREE.Group(),wood=new THREE.MeshStandardMaterial({color:bark[kind],roughness:.92}),leaves=new THREE.MeshStandardMaterial({color:foliage[kind],roughness:.86,flatShading:true});
 g.userData.treeSeed=id;g.userData.crownIndex=0;
 leaves.color.offsetHSL((rand(id*41)-.5)*.075,(rand(id*47)-.5)*.08,(rand(id*43)-.5)*.10);wood.color.offsetHSL(0,0,(rand(id*59)-.5)*.05);
 const V=(x,y,z)=>new THREE.Vector3(x,y,z), trunk=(h,r)=>branch(g,wood,V(0,0,0),V(0,h,0),r);
 if(kind===0){ // pine: open, irregular branches and flattened needle masses
  const bend=(rand(id*71)-.5)*.3;branch(g,wood,V(0,0,0),V(bend,3.4,0),.43);branch(g,wood,V(bend,3.4,0),V(-bend*.4,6.65,0),.29);
  for(let i=0;i<6;i++){let a=i*2.4+.35+(rand(id*13+i)-.5)*.38,y=4.1+(i%3)*.8+(rand(id*19+i)-.5)*.25,r=1.15+rand(id*23+i)*.8,x=Math.cos(a)*r,z=Math.sin(a)*r;
   const mid=V(x*.52,y-.38,z*.52);branch(g,wood,V(bend*.4,y-.85,0),mid,.14);branch(g,wood,mid,V(x,y,z),.085);
   crown(g,leaves,x,y+.24,z,1.0+rand(id*29+i)*.3,.53+rand(id*31+i)*.17,.85+rand(id*37+i)*.25)}
  crown(g,leaves,-bend*.4,6.6,0,1.05,.65,1.0);
 }else if(kind===1){ // spruce: blue-green, broad branch layers
  trunk(6.8,.32);for(let i=0;i<5;i++){let y=1.65+i*1.05,r=2.0-i*.29;cone(g,leaves,y,r,2.05)}
 }else if(kind===2){ // fir: dense narrow spire, smooth gray bark
  trunk(7.1,.29);for(let i=0;i<6;i++){let y=1.35+i*.98,r=1.47-i*.195;cone(g,leaves,y,r,1.85)}
 }else if(kind===3){ // oak: short irregular trunk and massive, spreading limbs
  branch(g,wood,V(0,0,0),V(.12,2.2,0),.76);branch(g,wood,V(.12,2.2,0),V(-.15,3.5,0),.55);
  for(let i=0;i<5;i++){let a=i*Math.PI*2/5,r=2.0+(i%2)*.5,x=Math.cos(a)*r,z=Math.sin(a)*r,y=3.9+(i%3)*.38;branch(g,wood,V(.1,2.3+(i%2)*.35,0),V(x,y,z),.32);crown(g,leaves,x,y+.45,z,1.55,.9,1.3)}crown(g,leaves,0,4.85,0,1.65,1,1.5);
 }else if(kind===4){ // birch: slim, slightly bent stem and fine drooping limbs
  branch(g,wood,V(0,0,0),V(.12,3.7,0),.25);branch(g,wood,V(.12,3.7,0),V(-.12,7.15,0),.17);let marks=new THREE.MeshStandardMaterial({color:'#777b6c'});for(let i=0;i<7;i++){let m=new THREE.Mesh(markGeo,marks);m.position.set(.04,1+i*.68,.24);m.scale.set(.28,.055,.045);g.add(m)}for(let i=0;i<5;i++){let a=i*2.4,r=1.0+(i%2)*.35,x=Math.cos(a)*r,z=Math.sin(a)*r,y=4.4+(i%3)*.7;branch(g,wood,V(.08,y-.1,0),V(x,y-.45,z),.07);crown(g,leaves,x,y-.15,z,.7,1,.65)}crown(g,leaves,-.1,6.65,0,.8,1,.75);
 }else if(kind===5){ // upright poplar: continuous tapering stem, ascending limbs enter an uneven narrow crown
  branch(g,wood,V(0,0,0),V(.04,4.5,0),.38);branch(g,wood,V(.04,4.5,0),V(.0,8.9,0),.25);
  for(let i=0;i<6;i++){let a=i*2.4+.2,r=.68+(i%3)*.10,x=Math.cos(a)*r,z=Math.sin(a)*r,y=4.0+i*.34;
   branch(g,wood,V(.03,y,0),V(x*.55,y+.95,z*.55),.105);branch(g,wood,V(x*.55,y+.95,z*.55),V(x,y+1.85,z),.065)}
  crown(g,leaves,.12,7.15,0,1.02,2.25,1.0,id);
 }else if(kind===6){ // elm: vase of exposed rising major limbs with a wide high canopy
  trunk(2.9,.52);for(let i=0;i<5;i++){let a=i*Math.PI*2/5,r=2.25,x=Math.cos(a)*r,z=Math.sin(a)*r,y=5.4+(i%2)*.3;branch(g,wood,V(0,2.3,0),V(x,y,z),.23);crown(g,leaves,x,y+.28,z,1.42,.8,1.14)}crown(g,leaves,0,6.0,0,1.5,.85,1.35);
 }else{ // tuliptree: clear bole with a tapered leader and asymmetrical rising branches
  branch(g,wood,V(0,0,0),V(.04,4.8,0),.55);branch(g,wood,V(.04,4.8,0),V(.12,8.8,0),.37);
  for(let i=0;i<6;i++){let a=i*2.35+.35,r=1.55+(i%3)*.2,x=Math.cos(a)*r,z=Math.sin(a)*r,y=5.05+(i%3)*.32;
   const mid=V(x*.55,y+.8,z*.55),end=V(x,y+1.95+(i%2)*.25,z);
   branch(g,wood,V(.05,y,0),mid,.20);branch(g,wood,mid,end,.11);
   let side=V(x*1.12,y+2.25,z*1.12);branch(g,wood,V(x*.78,y+1.4,z*.78),side,.065);
  }
  crown(g,leaves,.18,8.05,0,2.1,1.65,1.8,id);crown(g,leaves,-1.05,7.55,.12,1.05,.85,1.0,id+91);crown(g,leaves,1.0,7.75,-.18,1.0,1.0,.95,id+107);

 }
 return g;
}
// Art-directed environmental weights. These are regional analogues, not a botanical distribution map.
function chooseSpecies(id,x,z,h,d){let bank=Math.max(0,1-(d-6)/22),high=Math.min(1,h/15),opening=.5+.5*Math.sin(x*.09+z*.04);let weights=[1.1+high*.9, .45+high*1.5, .3+high*1.4,1.05*(1-high*.45),.45+opening*.65,.18+bank*1.7,.2+bank*1.35,.18+bank*.45];let sum=weights.reduce((a,b)=>a+b,0),n=rand(id*11)*sum;for(let i=0;i<weights.length;i++){n-=weights[i];if(n<=0)return i}return 7}
let counts=Array(8).fill(0);
for(let row=0;row<14;row++)for(let col=0;col<16;col++){
 let id=row*16+col+1,x=-58+col*7.7+(rand(id*3)-.5)*3,z=-48+row*7.2+(rand(id*5)-.5)*3,d=Math.abs(z-river(x));if(d<6||rand(id*7)<.13)continue;
 let h=height(x,z),kind=chooseSpecies(id,x,z,h,d),tree=makeTree(kind,id),size=.75+rand(id*13)*.33,heightFactor=.88+rand(id*17)*.25,widthFactor=.88+rand(id*19)*.24,leanChance=rand(id*23),lean=leanChance<.18?(kind===3||kind===6?.15:.09)*(.45+rand(id*29)*.55):.018*rand(id*29),angle=rand(id*31)*Math.PI*2;
 tree.position.set(x,h,z);tree.rotation.set(Math.cos(angle)*lean,rand(id*37)*Math.PI*2,Math.sin(angle)*lean,'YXZ');tree.scale.set(size*widthFactor,size*heightFactor,size*widthFactor);forest.add(tree);counts[kind]++;
}
for(let kind=0;kind<8;kind++){let x=(kind-3.5)*6.5,tree=makeTree(kind,1000+kind);tree.position.set(x,height(x,10),10);lineup.add(tree)}
for(const [i,kind] of [5,7].entries()){let x=(i-.5)*9,tree=makeTree(kind,1500+kind);tree.position.set(x,height(x,10),10);pair.add(tree)}
const pineExample=makeTree(0,1510);pineExample.position.set(0,height(0,10),10);pineView.add(pineExample);
const views={pine:{pos:[9,17,24],target:[0,6.6,10],title:'松树近看',text:'树干略有弯曲，枝条伸向不同方向，针叶团的轮廓和疏密各有变化。'},pair:{pos:[0,21,30],target:[0,5,10],title:'杨树与鹅掌楸',text:'左：主干贯通、枝条向上的杨树；右：长净干、逐级分枝的鹅掌楸。可隐藏树冠查看枝架。'},lineup:{pos:[0,40,46],target:[0,4,10],title:'八种树形对照',text:'从左到右：松、云杉、冷杉、栎、桦、杨、榆、鹅掌楸。'},overview:{pos:[72,67,92],target:[0,4,0],title:'坡地 → 溪谷',text:'山坡上针叶树较多；低处混入阔叶树，靠近溪谷的开阔地更常见杨和榆。'},slope:{pos:[-35,31,48],target:[-18,12,33],title:'山坡混交林',text:'松的树冠较疏展，云杉和冷杉保留不同的塔形轮廓；桦树散生于林间。'},valley:{pos:[29,21,32],target:[10,3,4],title:'溪谷混交',text:'溪谷周围增加杨、榆和阔叶混交，树种比例随距离逐渐变化。'},detail:{pos:[-12,17,35],target:[-24,10,26],title:'树形近看',text:'每类树保留自己的轮廓，再产生适度的色调、比例与姿态差异。'}};
function view(name){let v=views[name];forest.visible=!['lineup','pair','pine'].includes(name);lineup.visible=name==='lineup';pair.visible=name==='pair';pineView.visible=name==='pine';camera.position.set(...v.pos);controls.target.set(...v.target);if((name==='lineup'||name==='pair') && innerWidth/innerHeight<1){camera.position.sub(controls.target).multiplyScalar(name==='pair'?1.45:1.75).add(controls.target);}controls.update();document.querySelector('#place').textContent=v.title;document.querySelector('#description').textContent=v.text;document.querySelectorAll('button[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name))}document.querySelectorAll('button[data-view]').forEach(b=>b.addEventListener('click',()=>view(b.dataset.view)));view('overview');let showFoliage=true;document.querySelector('#foliage-toggle').addEventListener('click',e=>{showFoliage=!showFoliage;scene.traverse(o=>{if(o.name==='foliage')o.visible=showFoliage});e.currentTarget.textContent=showFoliage?'查看枝架':'显示树冠';e.currentTarget.setAttribute('aria-pressed',String(!showFoliage));});window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});window.labStats=counts;renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera)});
