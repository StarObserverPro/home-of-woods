// Isolated GPU contract probe, complementary to the actual game camera review.
// The unlit color chart checks transfer/blur/depth only; it is not a lighting scene.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const out=path.resolve(process.env.EVIDENCE_DIR??path.join(os.tmpdir(),'how-overlook-optics-probe'));
assert.ok(out!==root&&!out.startsWith(root+path.sep),'Keep verification images outside the source tree');
const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:5194';
const port=new URL(origin).port||'80';
let server,browser,serverLog='',report={result:'running',origin,errors:[]};
await fs.mkdir(out,{recursive:true});
try{
  if(!process.env.TEST_ORIGIN){
    server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',port,'--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']});
    for(const stream of [server.stdout,server.stderr])stream.on('data',data=>{serverLog=(serverLog+data.toString()).slice(-12000);});
  }
  let ready=false;
  for(let attempt=0;attempt<120;attempt++){
    try{const response=await fetch(origin,{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{}
    if(server&&server.exitCode!==null)throw new Error(`Vite exited: ${serverLog}`);
    await delay(250);
  }
  assert.ok(ready,`Vite did not become available at ${origin}: ${serverLog}`);
  browser=await chromium.launch({headless:true,
    ...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),
    args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:640,height:400},deviceScaleFactor:1});
  page.on('pageerror',error=>report.errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.route('**/__optics-probe',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0}</style></head><body></body></html>'}));
  await page.goto(origin+'/__optics-probe');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createOverlookOptics}=await import('/src/scene/overlook-optics.ts');
    // Disable canvas MSAA so an HDR interior-color equality check does not
    // confuse sampling/coverage differences with transfer-function mistakes.
    const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
    renderer.setSize(640,400);document.body.appendChild(renderer.domElement);
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.75;
    const shaderErrors=[];
    renderer.debug.onShaderError=(gl,program,vs,fs)=>shaderErrors.push([gl.getProgramInfoLog(program),gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs)]);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1.6,.1,3200);
    // A geometry sky, like the game's Sky, receives the same final transfer as
    // the geometry. A plain clear color would not be tone-mapped on the direct path.
    const resources=[];
    const plane=(width,height,color,x,y,z)=>{
      const geometry=new THREE.PlaneGeometry(width,height),material=new THREE.MeshBasicMaterial({color});
      const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);scene.add(mesh);resources.push(geometry,material);return mesh;
    };
    const background=plane(8000,8000,new THREE.Color(.04,.04,.04),0,0,-3000);
    background.material.depthWrite=false;
    const swatches=[
      {x:-40,color:[.02,.02,.02]},{x:-20,color:[.18,.18,.18]},
      {x:0,color:[.2,.5,.8]},{x:20,color:[1,1,1]},{x:40,color:[4,2,.5]},
    ];
    for(const swatch of swatches)plane(18,18,new THREE.Color(...swatch.color),swatch.x,0,-110);
    const checker=new Uint8Array(64*64*4);
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const i=(y*64+x)*4,c=(Math.floor(x/2)+Math.floor(y/2))%2?230:12;
      checker[i]=checker[i+1]=checker[i+2]=c;checker[i+3]=255;
    }
    const texture=new THREE.DataTexture(checker,64,64);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;resources.push(texture);
    const near=plane(12,12,new THREE.Color(1,1,1),-14,-9,-25);
    const far=plane(280,360,new THREE.Color(1,1,1),330,90,-600);
    near.material.map=texture;far.material.map=texture;
    const gl=renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
    const graphicsBackend=extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    const pixels=()=>{
      const bytes=new Uint8Array(renderer.domElement.width*renderer.domElement.height*4);
      gl.readPixels(0,0,renderer.domElement.width,renderer.domElement.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;
    };
    renderer.render(scene,camera);const direct=pixels(),directPNG=renderer.domElement.toDataURL();
    const baselineMemory={...renderer.info.memory},optics=createOverlookOptics(renderer);
    optics.render(scene,camera,{amount:0,focusDistance:110});const zero=pixels(),zeroStats=optics.stats();
    let zeroDifferentBytes=0;for(let i=0;i<direct.length;i++)if(direct[i]!==zero[i])zeroDifferentBytes++;
    renderer.autoClear=false;
    optics.render(scene,camera,{amount:1,focusDistance:110});const final=pixels(),finalPNG=renderer.domElement.toDataURL();
    const stateRestored=renderer.getRenderTarget()===null&&renderer.autoClear===false&&renderer.getViewport(new THREE.Vector4()).equals(new THREE.Vector4(0,0,640,400));
    const swatchResults=swatches.map(swatch=>{
      const p=new THREE.Vector3(swatch.x,0,-110).project(camera);
      const cx=Math.floor((p.x*.5+.5)*640),cy=Math.floor((p.y*.5+.5)*400);
      let maxDifference=0;
      for(let y=cy-3;y<=cy+3;y++)for(let x=cx-3;x<=cx+3;x++)for(let c=0;c<3;c++){
        const i=(y*640+x)*4+c;maxDifference=Math.max(maxDifference,Math.abs(direct[i]-final[i]));
      }
      const offset=(cy*640+cx)*4;
      return {linearColor:swatch.color,direct:Array.from(direct.slice(offset,offset+4)),composite:Array.from(final.slice(offset,offset+4)),maxDifference};
    });
    const nearEdge=new THREE.Vector3(near.position.x+6,near.position.y,-25).project(camera);
    const nearEdgeX=Math.ceil((nearEdge.x*.5+.5)*640),nearEdgeY=Math.floor((nearEdge.y*.5+.5)*400);
    let foregroundOutsideChangedPixels=0;
    for(let y=Math.max(0,nearEdgeY-15);y<=Math.min(399,nearEdgeY+15);y++)for(let x=nearEdgeX;x<nearEdgeX+4;x++){
      const i=(y*640+x)*4;
      if(Math.max(Math.abs(direct[i]-final[i]),Math.abs(direct[i+1]-final[i+1]),Math.abs(direct[i+2]-final[i+2]))>3)foregroundOutsideChangedPixels++;
    }
    let changedPixels=0,opaquePixels=0;
    for(let i=0;i<direct.length;i+=4){
      if(direct[i]!==final[i]||direct[i+1]!==final[i+1]||direct[i+2]!==final[i+2])changedPixels++;
      if(final[i+3]===255)opaquePixels++;
    }
    const activeStats=optics.stats();
    optics.setMode('coc');optics.render(scene,camera,{amount:1,focusDistance:110});
    const coc=pixels(),cocPNG=renderer.domElement.toDataURL();let nearMaskPixels=0,farMaskPixels=0,clearMaskPixels=0;
    for(let i=0;i<coc.length;i+=4){
      if(coc[i+2]>coc[i]+40)nearMaskPixels++;
      if(coc[i]>coc[i+2]+40)farMaskPixels++;
      if(coc[i]+coc[i+1]+coc[i+2]===0)clearMaskPixels++;
    }
    optics.setMode('depth');optics.render(scene,camera,{amount:1,focusDistance:110});const depthPNG=renderer.domElement.toDataURL();
    renderer.setPixelRatio(2);renderer.setSize(390,844);camera.aspect=390/844;camera.updateProjectionMatrix();
    optics.setMode('final');optics.render(scene,camera,{amount:1,focusDistance:110,compact:true});const portraitStats=optics.stats();
    optics.setMode('off');optics.render(scene,camera,{amount:1,focusDistance:110,compact:true});const disabledStats=optics.stats();
    optics.setEnabled(true);optics.render(scene,camera,{amount:1,focusDistance:110,compact:true});const reenabledStats=optics.stats();
    optics.suspend();const suspended=optics.stats();optics.dispose();optics.dispose();const disposed=optics.stats(),finalMemory={...renderer.info.memory};
    const glError=gl.getError();for(const resource of resources)resource.dispose();renderer.dispose();
    return {graphicsBackend,zeroDifferentBytes,zeroStats,swatchResults,changedPixels,foregroundOutsideChangedPixels,opaquePixels,stateRestored,shaderErrors,glError,
      activeStats,portraitStats,disabledStats,reenabledStats,suspended,disposed,baselineMemory,finalMemory,
      nearMaskPixels,farMaskPixels,clearMaskPixels,directPNG,finalPNG,cocPNG,depthPNG};
  });
  for(const key of ['directPNG','finalPNG','cocPNG','depthPNG']){
    await fs.writeFile(path.join(out,key+'.png'),Buffer.from(result[key].split(',')[1],'base64'));delete result[key];
  }
  report={...report,...result,rendererNote:'Software WebGL validates shader behavior, transfers and lifecycle; it is not a physical-device GPU-time benchmark.'};
  assert.deepEqual(report.errors,[],'Browser errors');assert.deepEqual(result.shaderErrors,[],'GLSL compilation/linking');assert.equal(result.glError,0,'No WebGL error');
  assert.equal(result.zeroDifferentBytes,0,'Disabled/amount-zero output is byte identical');
  assert.equal(result.zeroStats.targets,0,'Ordinary navigation allocates no post buffers');
  assert.ok(result.activeStats.supported&&result.activeStats.active,'Actual HDR/depth path ran');
  for(const swatch of result.swatchResults)assert.ok(swatch.maxDifference<=1,`Focus-band color must retain one tone map/transfer: ${JSON.stringify(swatch)}`);
  assert.ok(result.changedPixels>100,'Near/far checker patterns are actually filtered');
  assert.ok(result.foregroundOutsideChangedPixels>5,'Foreground blur extends past its silhouette');
  assert.equal(result.opaquePixels,640*400,'RGBA output alpha is opaque');assert.ok(result.stateRestored,'Renderer target/viewport/autoClear restored');
  assert.ok(result.nearMaskPixels>100&&result.farMaskPixels>100&&result.clearMaskPixels>100,'CoC debug identifies near, sharp and far');
  assert.deepEqual(result.portraitStats.sceneResolution,[780,1688],'Resize uses real drawing-buffer size at DPR 2');
  assert.deepEqual(result.portraitStats.blurResolution,[390,844],'Reduced buffer is one quarter of the pixels');
  assert.equal(result.disabledStats.active,false);assert.equal(result.reenabledStats.mode,'final');assert.equal(result.reenabledStats.active,true);
  assert.equal(result.suspended.active,false);assert.equal(result.disposed.disposed,true);assert.equal(result.disposed.targets,0);
  assert.equal(result.finalMemory.textures,result.baselineMemory.textures,'Offscreen textures are released');
  assert.equal(result.finalMemory.geometries,result.baselineMemory.geometries,'Fullscreen geometry is released');
  report.result='passed';
}catch(error){report.result='failed';report.failure=String(error);report.serverLog=serverLog;process.exitCode=1;}
finally{
  await fs.writeFile(path.join(out,'overlook-optics-probe.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));await browser?.close();server?.kill('SIGTERM');
}
