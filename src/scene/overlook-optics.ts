import * as THREE from 'three';
import {OVERLOOK_OPTICS as O} from '../content/overlook-optics.ts';
import type {OverlookOpticsMode} from '../content/overlook-optics.ts';
import type {OrbitPose} from './anchored-overlook.ts';
import {navigationOpticsProjection,overlookBufferSize,overlookFocusBands} from './overlook-optics-rules.ts';

export {navigationOpticsProjection,overlookAmount} from './overlook-optics-rules.ts';

/** Call only for navigation. Borrowed cameras retain their own projection. */
export function applyNavigationOptics(camera:THREE.PerspectiveCamera,pose:Pick<OrbitPose,'elevation'|'zoom'>,mobile:boolean){
  const lens=navigationOpticsProjection(pose,camera.aspect,mobile);
  camera.fov=lens.fov;camera.zoom=lens.zoom;
  return lens;
}

const vertexShader=/* glsl */`
varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}
`;

const depthFunctions=/* glsl */`
uniform sampler2D tDepth;
uniform float nearClip,farClip,amount;
uniform vec4 focusBand;
uniform vec2 radiusPx,edgeRange;
#include <packing>
float viewDepth(float raw){return -perspectiveDepthToViewZ(raw,nearClip,farClip);}
float coc(float distance,float raw){
  if(raw>=.9999999)return 0.;
  float foreground=1.-smoothstep(focusBand.x,focusBand.y,distance);
  float background=smoothstep(focusBand.z,focusBand.w,distance);
  return (background-foreground)*amount;
}
float edgeWeight(float centerDepth,float sampleDepth){
  float delta=abs(centerDepth-sampleDepth)/max(focusBand.x,min(centerDepth,sampleDepth));
  return 1.-smoothstep(edgeRange.x,edgeRange.y,delta);
}
`;

const blurFragment=/* glsl */`
varying vec2 vUv;
uniform sampler2D tColor;
uniform vec2 sourceTexel;
${depthFunctions}
void nearCandidate(inout float nearMagnitude,inout float nearCoverage,vec2 pixelOffset){
  vec2 uv=clamp(vUv+pixelOffset*sourceTexel,sourceTexel*.5,vec2(1.)-sourceTexel*.5);
  float raw=texture2D(tDepth,uv).x;
  float candidate=max(-coc(viewDepth(raw),raw),0.);
  float reach=1.-smoothstep(.45,1.1,length(pixelOffset)/max(.0001,candidate*radiusPx.x));
  nearMagnitude=max(nearMagnitude,candidate*step(.0001,reach));
  nearCoverage=max(nearCoverage,candidate*reach);
}
void gather(inout vec3 sum,inout float total,vec2 offset,float baseWeight,float centerDepth,float nearMagnitude){
  vec2 uv=clamp(vUv+offset,sourceTexel*.5,vec2(1.)-sourceTexel*.5);
  float raw=texture2D(tDepth,uv).x;
  // A defocused foreground contour must cross its silhouette. Restrict that
  // mixing to the small, explicitly expanded near CoC. Far-only blur remains
  // bilateral, so a sharp near trunk never collects blurred mountain color.
  float weight=baseWeight*mix(edgeWeight(centerDepth,viewDepth(raw)),1.,step(.0001,nearMagnitude));
  sum+=texture2D(tColor,uv).rgb*weight;total+=weight;
}
void main(){
  float raw=texture2D(tDepth,vUv).x,distance=viewDepth(raw);
  float signedBlur=coc(distance,raw);
  float nearMagnitude=max(-signedBlur,0.),nearCoverage=nearMagnitude;
  float search=radiusPx.x*amount;
  nearCandidate(nearMagnitude,nearCoverage,search*vec2(.75,0.));
  nearCandidate(nearMagnitude,nearCoverage,search*vec2(-.75,0.));
  nearCandidate(nearMagnitude,nearCoverage,search*vec2(0.,.75));
  nearCandidate(nearMagnitude,nearCoverage,search*vec2(0.,-.75));
  nearCandidate(nearMagnitude,nearCoverage,search*vec2(.53,.53));
  nearCandidate(nearMagnitude,nearCoverage,search*vec2(-.53,.53));
  nearCandidate(nearMagnitude,nearCoverage,search*vec2(.53,-.53));
  nearCandidate(nearMagnitude,nearCoverage,search*vec2(-.53,-.53));
  float radius=max(nearMagnitude*radiusPx.x,max(signedBlur,0.)*radiusPx.y);
  vec2 stepUV=sourceTexel*radius;
  vec3 sum=texture2D(tColor,vUv).rgb*2.;float total=2.;
  if(radius>.0001){
    gather(sum,total,stepUV*vec2(1.,0.),1.,distance,nearMagnitude);
    gather(sum,total,stepUV*vec2(-1.,0.),1.,distance,nearMagnitude);
    gather(sum,total,stepUV*vec2(0.,1.),1.,distance,nearMagnitude);
    gather(sum,total,stepUV*vec2(0.,-1.),1.,distance,nearMagnitude);
    gather(sum,total,stepUV*vec2(.7071,.7071),.75,distance,nearMagnitude);
    gather(sum,total,stepUV*vec2(-.7071,.7071),.75,distance,nearMagnitude);
    gather(sum,total,stepUV*vec2(.7071,-.7071),.75,distance,nearMagnitude);
    gather(sum,total,stepUV*vec2(-.7071,-.7071),.75,distance,nearMagnitude);
  }
  // Signed CoC retains the expanded near-field coverage for the full-res pass.
  gl_FragColor=vec4(sum/total,nearCoverage>.0001?-nearCoverage:signedBlur);
}
`;

const compositeFragment=/* glsl */`
varying vec2 vUv;
uniform sampler2D tColor,tBlur;
uniform vec2 blurSize,sourceTexel;
uniform int debugMode;
${depthFunctions}
void upsample(inout vec3 sum,inout float total,inout float nearCoverage,vec2 pixel,float bilinearWeight,float distance,float centerCoC){
  vec2 uv=(clamp(pixel,vec2(0.),blurSize-1.)+.5)/blurSize;
  vec4 sampleValue=texture2D(tBlur,uv);
  float sampleNear=max(-sampleValue.a,0.);
  float sampleDepth=viewDepth(texture2D(tDepth,uv).x);
  float weight=bilinearWeight*mix(edgeWeight(distance,sampleDepth),1.,step(.0001,sampleNear+max(-centerCoC,0.)));
  sum+=sampleValue.rgb*weight;total+=weight;
  nearCoverage+=sampleNear*bilinearWeight;
}
void main(){
  float raw=texture2D(tDepth,vUv).x,distance=viewDepth(raw);
  float signedBlur=coc(distance,raw);
  vec3 sharp=texture2D(tColor,vUv).rgb;
  if(debugMode==1){
    float value=log2(1.+distance)/log2(1.+farClip);
    gl_FragColor=vec4(raw>=.9999999?vec3(0.):vec3(value),1.);
  }else if(debugMode==2){
    gl_FragColor=vec4(max(-signedBlur,0.)*vec3(.08,.35,1.)+max(signedBlur,0.)*vec3(1.,.25,.035),1.);
  }else{
    vec2 pixel=vUv*blurSize-.5,base=floor(pixel),f=fract(pixel);
    vec3 sum=vec3(0.);float total=0.,nearCoverage=0.;
    upsample(sum,total,nearCoverage,base,(1.-f.x)*(1.-f.y),distance,signedBlur);
    upsample(sum,total,nearCoverage,base+vec2(1.,0.),f.x*(1.-f.y),distance,signedBlur);
    upsample(sum,total,nearCoverage,base+vec2(0.,1.),(1.-f.x)*f.y,distance,signedBlur);
    upsample(sum,total,nearCoverage,base+vec2(1.,1.),f.x*f.y,distance,signedBlur);
    vec3 blurred=total>.00001?sum/total:sharp;
    // A broad focused zone retains the exact full-resolution source.
    gl_FragColor=vec4(mix(sharp,blurred,smoothstep(0.,.4,max(abs(signedBlur),nearCoverage))),1.);
    #include <tonemapping_fragment>
  }
  #include <colorspace_fragment>
}
`;

export type OverlookFrame={amount:number;focusDistance:number;compact?:boolean};

/**
 * One full-resolution HDR scene/depth capture, one half-resolution bilateral
 * gather with bounded foreground CoC expansion, one depth-aware output
 * composite. No scene-depth redraw or RAF.
 * Scene materials write linear HDR in the target; the final material owns the
 * renderer's tone mapping and output transfer exactly once. DOM HUD and the
 * existing weather lens are composed afterwards by their respective owners.
 */
export function createOverlookOptics(renderer:THREE.WebGLRenderer,mode:OverlookOpticsMode='final'){
  let enabled=mode!=='off',debugMode:OverlookOpticsMode=mode,disposed=false,active=false,frames=0;
  let capture:THREE.WebGLRenderTarget|null=null,blur:THREE.WebGLRenderTarget|null=null;
  let size=overlookBufferSize(1,1,false),lastFocus=110,lastAmount=0;
  const supported=renderer.extensions.has('EXT_color_buffer_float');
  const drawingSize=new THREE.Vector2(),savedViewport=new THREE.Vector4(),savedScissor=new THREE.Vector4();
  const uniforms={
    tColor:{value:null as THREE.Texture|null},tDepth:{value:null as THREE.Texture|null},tBlur:{value:null as THREE.Texture|null},
    nearClip:{value:.1},farClip:{value:3200},amount:{value:0},focusBand:{value:new THREE.Vector4()},
    radiusPx:{value:new THREE.Vector2()},edgeRange:{value:new THREE.Vector2(O.edgeRelativeStart,O.edgeRelativeEnd)},
    sourceTexel:{value:new THREE.Vector2(1,1)},blurSize:{value:new THREE.Vector2(1,1)},debugMode:{value:0},
  };
  const gatherMaterial=new THREE.ShaderMaterial({name:'overlook-depth-aware-gather',uniforms,vertexShader,fragmentShader:blurFragment,depthTest:false,depthWrite:false,toneMapped:false});
  const compositeMaterial=new THREE.ShaderMaterial({name:'overlook-depth-aware-output',uniforms,vertexShader,fragmentShader:compositeFragment,depthTest:false,depthWrite:false,toneMapped:true});
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,2,0,0,2],2));
  const triangle=new THREE.Mesh(geometry,gatherMaterial);triangle.frustumCulled=false;
  const passScene=new THREE.Scene();passScene.add(triangle);
  const passCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);

  const resize=(width:number,height:number,compact=false)=>{
    if(disposed||!supported)return;
    size=overlookBufferSize(width,height,compact);
    // ResizeObserver may run before the first aerial frame. Keep that path free
    // of framebuffer allocations, just like ordinary amount-zero navigation.
    if(!capture&&!active)return;
    if(!capture){
      capture=new THREE.WebGLRenderTarget(size.width,size.height,{type:THREE.HalfFloatType,depthBuffer:true,stencilBuffer:false,generateMipmaps:false});
      capture.texture.name='overlook-linear-hdr';capture.texture.colorSpace=THREE.LinearSRGBColorSpace;
      capture.depthTexture=new THREE.DepthTexture(size.width,size.height,THREE.UnsignedIntType);
      capture.depthTexture.name='overlook-scene-depth';
      blur=new THREE.WebGLRenderTarget(size.blurWidth,size.blurHeight,{type:THREE.HalfFloatType,depthBuffer:false,stencilBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false});
      blur.texture.name='overlook-filtered-hdr-signed-coc';blur.texture.colorSpace=THREE.LinearSRGBColorSpace;
      uniforms.tColor.value=capture.texture;uniforms.tDepth.value=capture.depthTexture;uniforms.tBlur.value=blur.texture;
    }else{
      capture.setSize(size.width,size.height);blur!.setSize(size.blurWidth,size.blurHeight);
    }
    uniforms.sourceTexel.value.set(1/size.width,1/size.height);
    uniforms.blurSize.value.set(size.blurWidth,size.blurHeight);
  };

  return {
    setEnabled(value:boolean){enabled=value;if(value&&debugMode==='off')debugMode='final';if(!value)active=false;},
    setMode(value:OverlookOpticsMode){debugMode=value;enabled=value!=='off';},
    suspend(){active=false;lastAmount=0;},
    resize,
    render(scene:THREE.Scene,camera:THREE.PerspectiveCamera,frame:OverlookFrame){
      if(disposed)return;
      lastAmount=THREE.MathUtils.clamp(Number.isFinite(frame.amount)?frame.amount:0,0,1);
      lastFocus=overlookFocusBands(frame.focusDistance).focus;
      active=supported&&enabled&&(lastAmount>.0001||debugMode==='depth'||debugMode==='coc');
      if(!active){renderer.render(scene,camera);return;}
      renderer.getDrawingBufferSize(drawingSize);
      const requested=overlookBufferSize(drawingSize.x,drawingSize.y,!!frame.compact);
      if(!capture||size.width!==requested.width||size.height!==requested.height||size.blurWidth!==requested.blurWidth||size.blurHeight!==requested.blurHeight)
        resize(drawingSize.x,drawingSize.y,!!frame.compact);
      const bands=overlookFocusBands(lastFocus);
      uniforms.focusBand.value.set(bands.nearFull,bands.nearSharp,bands.farSharp,bands.farFull);
      uniforms.nearClip.value=camera.near;uniforms.farClip.value=camera.far;uniforms.amount.value=lastAmount;
      uniforms.radiusPx.value.set(frame.compact?O.compactNearRadiusPx:O.nearRadiusPx,frame.compact?O.compactFarRadiusPx:O.farRadiusPx);
      uniforms.debugMode.value=debugMode==='depth'?1:debugMode==='coc'?2:0;
      const previousTarget=renderer.getRenderTarget(),previousAutoClear=renderer.autoClear,previousScissorTest=renderer.getScissorTest();
      renderer.getViewport(savedViewport);renderer.getScissor(savedScissor);
      try{
        renderer.autoClear=true;renderer.setScissorTest(false);
        renderer.setRenderTarget(capture);renderer.render(scene,camera);
        if(debugMode==='final'){
          triangle.material=gatherMaterial;renderer.setRenderTarget(blur);renderer.render(passScene,passCamera);
        }
        triangle.material=compositeMaterial;renderer.setRenderTarget(previousTarget);
        renderer.setViewport(savedViewport);renderer.setScissor(savedScissor);renderer.setScissorTest(previousScissorTest);
        renderer.render(passScene,passCamera);frames++;
      }finally{
        renderer.setRenderTarget(previousTarget);renderer.setViewport(savedViewport);renderer.setScissor(savedScissor);
        renderer.setScissorTest(previousScissorTest);renderer.autoClear=previousAutoClear;
      }
    },
    stats(){return {enabled,mode:debugMode,active,supported,frames,amount:lastAmount,focusDistance:lastFocus,
      focusBand:overlookFocusBands(lastFocus),targets:capture?2:0,sceneResolution:capture?[size.width,size.height]:null,
      blurResolution:blur?[size.blurWidth,size.blurHeight]:null,estimatedBytes:capture?size.estimatedBytes:0,
      sceneFormat:'RGBA16F + depth24',blurFormat:'RGBA16F (RGB + signed CoC)',samples:0,
      extraFullscreenPasses:active?(debugMode==='final'?2:1):0,blurTaps:9,nearCoCDepthTaps:8,
      depthPrepass:false,disposed};},
    dispose(){
      if(disposed)return;disposed=true;active=false;
      capture?.dispose();blur?.dispose();capture=null;blur=null;
      uniforms.tColor.value=uniforms.tDepth.value=uniforms.tBlur.value=null;
      geometry.dispose();gatherMaterial.dispose();compositeMaterial.dispose();passScene.clear();
    },
  };
}
