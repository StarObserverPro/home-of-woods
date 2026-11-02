import type * as Rapier from '@dimforge/rapier3d-compat';
import { WOODCRAFT } from '../content/woodcraft.ts';
import { heightAt } from '../world/surface.ts';
import { woodShape } from '../domain/woodcraft.ts';
import type { WoodcraftState, LooseWood } from '../domain/woodcraft.ts';
let library: Promise<typeof Rapier> | null = null;
async function loadRapier() {
  library ??= import('@dimforge/rapier3d-compat').then(async r => {await r.init();return r;}).catch(e=>{library=null;throw e;});
  return library;
}
/** No RAF, timers, inventory writes or renderer references. The app supplies real fixed steps. */
export async function createWoodPhysics() {
  const R=await loadRapier(), world=new R.World({x:0,y:-9.81,z:0});
  world.timestep=WOODCRAFT.fixedStep;
  const bodies=new Map<string,Rapier.RigidBody>();
  const g=WOODCRAFT.ground, vertices:number[]=[], indices:number[]=[], cols=(g.maxX-g.minX)/g.step+1;
  for(let z=g.minZ;z<=g.maxZ;z+=g.step)for(let x=g.minX;x<=g.maxX;x+=g.step)vertices.push(x,heightAt(x,z),z);
  for(let z=0;z<cols-1;z++)for(let x=0;x<cols-1;x++){const a=z*cols+x;indices.push(a,a+cols,a+1,a+1,a+cols,a+cols+1);}
  world.createCollider(R.ColliderDesc.trimesh(new Float32Array(vertices),new Uint32Array(indices)).setFriction(.95));
  const floor=heightAt(WOODCRAFT.x,WOODCRAFT.z), h=WOODCRAFT.railHeight, w=WOODCRAFT.railWidth;
  for(const side of [-1,1]) {
    world.createCollider(R.ColliderDesc.cuboid(w/2,h/2,WOODCRAFT.halfZ+w).setTranslation(WOODCRAFT.x+side*(WOODCRAFT.halfX+w/2),floor+h/2,WOODCRAFT.z).setFriction(.95));
    world.createCollider(R.ColliderDesc.cuboid(WOODCRAFT.halfX,h/2,w/2).setTranslation(WOODCRAFT.x,floor+h/2,WOODCRAFT.z+side*(WOODCRAFT.halfZ+w/2)).setFriction(.95));
  }
  let disposed=false, releaseIn=0, steps=0, maxStepMs=0;
  function logHull(halfLength:number,radius:number) {
    // Same nine-sided profile and axis as the visible CylinderGeometry.
    const vertices:number[]=[];
    for(const y of [-halfLength,halfLength])for(let i=0;i<9;i++)vertices.push(Math.sin(i*Math.PI*2/9)*radius,y,Math.cos(i*Math.PI*2/9)*radius);
    const collider=R.ColliderDesc.convexHull(new Float32Array(vertices));
    if(!collider)throw new Error('Invalid wood collision hull');
    return collider;
  }
  function add(piece:LooseWood) {
    const {length,radius,fork}=woodShape(piece.source);
    const b=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(piece.position.x,piece.position.y,piece.position.z)
      .setRotation(piece.rotation).setLinvel(piece.linear.x,piece.linear.y,piece.linear.z).setAngvel(piece.angular)
      .setLinearDamping(.35).setAngularDamping(.8).setCanSleep(true).setCcdEnabled(true));
    world.createCollider(logHull(length/2,radius).setDensity(450).setFriction(.95).setRestitution(.02),b);
    if(fork)world.createCollider(logHull(length*.28,radius*.7).setTranslation(length*.17,length*.19,0)
      .setRotation({x:0,y:0,z:-Math.sin(.65/2),w:Math.cos(.65/2)}).setDensity(450).setFriction(.95).setRestitution(.02),b);
    if(piece.sleeping)b.sleep();
    bodies.set(piece.id,b);
  }
  return {
    step(state:WoodcraftState,dt:number) {
      if(disposed)throw new Error('Physics owner destroyed');
      if(Math.abs(dt-WOODCRAFT.fixedStep)>1e-8)throw new Error('Physics requires an unscaled fixed step');
      const live=new Set(state.pieces.map(p=>p.id));let removed=false;
      for(const [id,b] of bodies)if(!live.has(id)){world.removeRigidBody(b);bodies.delete(id);removed=true;}
      if(removed)for(const b of bodies.values())b.wakeUp();
      releaseIn-=dt;
      const queued=state.pieces.find(p=>p.phase==='queued');
      if(queued && releaseIn<=0) {
        const top=state.pieces.reduce((top,p)=>p.phase==='loose'?Math.max(top,p.position.y+woodShape(p.source).radius):top,floor);
        queued.position.y=Math.max(queued.position.y,Math.min(floor+10,top+1.15));
        queued.phase='loose';queued.linear={x:0,y:-.3,z:0};releaseIn=WOODCRAFT.releaseInterval;
      }
      for(const p of state.pieces)if(p.phase==='loose'&&!bodies.has(p.id))add(p);
      const moving=[...bodies.values()].some(b=>!b.isSleeping());
      if(moving){const start=performance.now();world.step();maxStepMs=Math.max(maxStepMs,performance.now()-start);steps++;}
      const escaped:string[]=[];
      for(const p of state.pieces) {
        const b=bodies.get(p.id);if(!b)continue;
        const pos=b.translation(), q=b.rotation(), v=b.linvel(), a=b.angvel();
        if(![pos.x,pos.y,pos.z,q.x,q.y,q.z,q.w,v.x,v.y,v.z,a.x,a.y,a.z].every(Number.isFinite)||pos.x<g.minX||pos.x>g.maxX||pos.z<g.minZ||pos.z>g.maxZ||pos.y<heightAt(pos.x,pos.z)-1||pos.y>floor+13||Math.hypot(v.x,v.y,v.z)>55||Math.hypot(a.x,a.y,a.z)>95){escaped.push(p.id);continue;}
        p.position={x:pos.x,y:pos.y,z:pos.z};p.rotation={x:q.x,y:q.y,z:q.z,w:q.w};
        p.linear={x:v.x,y:v.y,z:v.z};p.angular={x:a.x,y:a.y,z:a.z};p.sleeping=b.isSleeping();
      }
      return escaped;
    },
    stats(){return {bodies:bodies.size,awake:disposed?0:[...bodies.values()].filter(b=>!b.isSleeping()).length,colliders:disposed?0:world.colliders.len(),steps,maxStepMs,disposed};},
    dispose(){if(disposed)return;disposed=true;bodies.clear();world.free();},
  };
}
export type WoodPhysics=Awaited<ReturnType<typeof createWoodPhysics>>;
