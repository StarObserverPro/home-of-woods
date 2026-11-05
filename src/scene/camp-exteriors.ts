import * as THREE from 'three';
import type {Resources} from './resources.ts';
import type {WorkshopState} from '../domain/workshop.ts';

type Parent = THREE.Object3D;
type Point3 = [number,number,number];

/**
 * Exterior fittings stay attached to the existing tent, cabin and hearth roots.
 * All parts are original, low-poly geometry; the Resources owner releases GPU data.
 * No replacement building, interior scene or independent simulation loop is created.
 */
export function createCampExteriors(r:Resources,tent:THREE.Group,cabin:THREE.Group,fire:THREE.Group){
  const groups=new Map<string,THREE.Group>();
  const owners=[tent,cabin,fire].map(root=>{const g=new THREE.Group();g.name='exterior-fittings';root.add(g);return g;});
  const part=(id:string,parent:Parent)=>{
    const g=new THREE.Group();g.name='fitting-'+id;g.visible=false;parent.add(g);groups.set(id,g);return g;
  };
  const material=(color:string)=>r.material(color,.86);
  const box=(parent:Parent,name:string,p:Point3,s:Point3,color:string)=>{
    const mesh=new THREE.Mesh(r.own(new THREE.BoxGeometry(...s)),material(color));
    mesh.name=name;mesh.position.set(...p);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  const rod=(parent:Parent,name:string,a:Point3,b:Point3,width:number,color:string)=>{
    const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),mesh=new THREE.Mesh(r.own(new THREE.CylinderGeometry(width,width,v.length(),6)),material(color));
    mesh.name=name;mesh.position.copy(new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());
    mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };

  // The canvas is a removable covering on the SAME tent, not a second tent mesh.
  const canvas=part('tent:canvas',owners[0]),baseCanvas:THREE.Mesh[]=[],newCanvas:THREE.Mesh[]=[];
  tent.traverse(object=>{
    if(object instanceof THREE.Mesh && /^(canvas_panel|canvas_back)/.test(object.name))baseCanvas.push(object);
  });
  for(const base of baseCanvas){
    const overlay=base.clone();overlay.name='replaced-sage-canvas-'+base.name;
    overlay.material=material('#829b7a');overlay.visible=false;
    base.parent!.add(overlay);newCanvas.push(overlay);
  }
  for(const z of [-2.25,2.25])rod(canvas,'canvas-edge-binding',[-2.5,.28,z],[0,3.88,z],.075,'#c6a575');
  rod(canvas,'canvas-front-seam',[-2.4,.25,2.53],[2.4,.25,2.53],.055,'#d5b783');

  const ropes=part('tent:ropes',owners[0]);
  for(const x of [-1,1])for(const z of [-1,1]){
    rod(ropes,'taut-guy-line',[x*2.36,2.25,z*2.18],[x*4.03,.18,z*3.65],.047,'#ded2a5');
    rod(ropes,'wooden-tent-peg',[x*4.03,.04,z*3.65],[x*4.03,.60,z*3.65],.12,'#88643e');
  }
  const poles=part('tent:poles',owners[0]);
  for(const z of [-2.54,2.54]){
    rod(poles,'reinforced-side-pole',[-2.59,.21,z],[0,3.87,z],.13,'#95734b');
    rod(poles,'reinforced-side-pole',[2.59,.21,z],[0,3.87,z],.13,'#95734b');
    box(poles,'ridge-binding',[0,3.84,z],[.54,.17,.38],'#c2a079');
  }
  const ornament=part('tent:ornament',owners[0]);
  rod(ornament,'chime-loop',[.6,3.83,2.89],[.6,3.27,2.89],.035,'#e0d1aa');
  for(const [i,x] of [-.15,.15,.45].entries()){
    rod(ornament,'hanging-wood-chime',[x+.6,3.20,2.91],[x+.6,2.92-(i%2)*.15,2.91],.07,'#a87b4b');
  }
  box(ornament,'chime-crossbar',[.76,3.23,2.9],[.93,.08,.09],'#c29f6c');

  // Existing cabin repair remains the prerequisite for later envelope work.
  const roof=part('cabin:roof',owners[1]);
  rod(roof,'new-ridge-cap',[0,6.20,-3.5],[0,6.20,3.55],.18,'#d3a16b');
  for(const side of [-1,1]){
    rod(roof,'new-eave-trim',[side*4.65,3.97,-3.5],[side*4.65,3.97,3.5],.16,'#c2925b');
    for(const z of [-2.5,0,2.5])rod(roof,'roof-strap',[side*3.2,4.65,z],[side*.25,6.12,z],.07,'#aa7749');
  }
  const windows=part('cabin:windows',owners[1]);
  for(const x of [1.33,3.58]){
    box(windows,'open-window-shutter',[x,2.55,3.63],[.47,1.48,.15],'#af8254');
    for(const y of [2.12,2.88])box(windows,'shutter-crossbar',[x,y,3.74],[.51,.12,.10],'#d9b17b');
  }
  const entry=part('cabin:entry',owners[1]);
  for(const x of [-2.02,.85])rod(entry,'porch-post',[x,.45,4.55],[x,3.58,4.55],.18,'#a87b4b');
  box(entry,'porch-canopy',[-.60,3.65,4.05],[3.40,.22,2.45],'#bf915d');
  box(entry,'house-name-board',[-.60,3.00,3.66],[1.70,.38,.12],'#e4c493');

  // Re-stack the hearth's original stones first; outside supports can then be mounted.
  const stones=part('camp-fire:stones',owners[2]);
  for(let i=0;i<13;i++){
    const theta=(i+.5)/13*Math.PI*2;
    const stone=new THREE.Mesh(r.own(new THREE.IcosahedronGeometry(.36,0).scale(1.14,.8,.87)),material(i%3===0?'#a5aa9e':'#858d83'));
    stone.name='raised-hearth-stone';stone.position.set(Math.cos(theta)*1.27,.48,Math.sin(theta)*1.27);stone.castShadow=stone.receiveShadow=true;stones.add(stone);
  }
  const support=part('camp-fire:support',owners[2]);
  for(const x of [-1.9,1.9]){
    rod(support,'outside-fire-support',[x,.10,0],[x,2.60,0],.16,'#8d7050');
    rod(support,'support-brace',[x,.3,-.55],[x,2.12,0],.10,'#816044');
  }
  rod(support,'cooking-crossbeam',[-2.02,2.60,0],[2.02,2.60,0],.12,'#5c625f');

  // These three parts share exactly one top socket. Unmounted parts remain owned.
  const hook=part('camp-fire:hook',owners[2]);
  rod(hook,'pot-suspension-chain',[0,2.57,0],[0,1.28,0],.035,'#4e5554');
  rod(hook,'curved-pot-hook',[0,1.27,0],[.26,1.16,0],.065,'#535956');
  const pot=part('camp-fire:pot',owners[2]);
  const potBody=new THREE.Mesh(r.own(new THREE.CylinderGeometry(.74,.62,.62,10)),material('#747b75'));
  potBody.name='cooking-pot-body';potBody.position.y=1.04;potBody.castShadow=potBody.receiveShadow=true;pot.add(potBody);
  const potRim=new THREE.Mesh(r.own(new THREE.TorusGeometry(.73,.075,4,10)),material('#adb5a6'));
  potRim.name='cooking-pot-rim';potRim.rotation.x=Math.PI/2;potRim.position.y=1.38;pot.add(potRim);
  rod(pot,'cooking-pot-bail',[-.70,1.39,0],[0,1.75,0],.045,'#b9bfad');
  rod(pot,'cooking-pot-bail',[0,1.75,0],[.70,1.39,0],.045,'#b9bfad');
  const grill=part('camp-fire:grill',owners[2]);
  for(const x of [-.92,.92])rod(grill,'grill-frame',[x,1.40,-.90],[x,1.40,.90],.08,'#646b68');
  for(const z of [-.90,.90])rod(grill,'grill-frame',[-.92,1.40,z],[.92,1.40,z],.08,'#646b68');
  for(let i=-4;i<=4;i++)rod(grill,'removable-grill-bar',[i*.20,1.43,-.88],[i*.20,1.43,.88],.033,'#a0a7a0');
  const smoker=part('camp-fire:smoker',owners[2]);
  const dome=new THREE.Mesh(r.own(new THREE.CylinderGeometry(.55,1.07,.76,10)),material('#777d74'));
  dome.name='removable-smoke-hood';dome.position.y=1.69;dome.castShadow=dome.receiveShadow=true;smoker.add(dome);
  rod(smoker,'smoke-vent',[0,2.07,0],[0,2.45,0],.13,'#606862');
  box(smoker,'smoke-hood-handle',[0,2.51,0],[.52,.12,.18],'#d1b27f');

  let disposed=false;
  return {
    parts:groups,
    update(workshop:WorkshopState){
      if(disposed)return;
      const fitted=(id:string)=>!!workshop.upgrades[id]&&workshop.upgrades[id].level>=1;
      for(const [id,group] of groups){
        group.visible=fitted(id)&&(id==='camp-fire:pot'
          ? workshop.mounted?.['camp-fire:top']==='camp-fire:hook'
          : !['camp-fire:hook','camp-fire:grill','camp-fire:smoker'].includes(id)||workshop.mounted?.['camp-fire:top']===id);
      }
      const changed=fitted('tent:canvas');
      for(const mesh of baseCanvas)mesh.visible=!changed;
      for(const mesh of newCanvas)mesh.visible=changed;
    },
    stats:()=>({parts:groups.size,installed:[...groups.keys()].filter(id=>groups.get(id)!.visible)}),
    dispose(){if(disposed)return;disposed=true;for(const o of owners){o.removeFromParent();o.clear();}for(const o of newCanvas)o.removeFromParent();groups.clear();},
  };
}
