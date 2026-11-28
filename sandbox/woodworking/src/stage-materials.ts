import * as THREE from 'three'

/** Shared visual meaning with scene wood-grain: longitudinal fibre, end grain, broad warm tones.
 * Coordinates are ORIGINAL stock millimetres, so newly exposed surfaces reveal the same wood.
 */
export function workpieceMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: '#d9af75', roughness: .73, metalness: 0 })
  material.name = 'woodworking-stock-continuous-grain'
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vStock; varying vec3 vStockNormal;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvStock = position; vStockNormal = normal;')
    shader.fragmentShader = 'varying vec3 vStock; varying vec3 vStockNormal;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 crossSection = (vStock.yz + vec2(22., 18.)) * vec2(1., .92);
      float ring = length(crossSection) * .62 + .12*sin(vStock.x*.043) + .065*sin(vStock.x*.12+vStock.z*.09);
      float aa = max(.04, fwidth(ring));
      float late = 1. - smoothstep(.10-aa, .24+aa, abs(fract(ring)-.62));
      float broad = .5 + .5*sin(ring*6.28318);
      float endGrain = abs(vStockNormal.x);
      float fibre = sin(vStock.z*11.2 + vStock.y*12.7 + .35*sin(vStock.x*.07));
      float detail = 1.-smoothstep(.3,1.5,fwidth(vStock.y)+fwidth(vStock.z));
      diffuseColor.rgb *= 1.03 - broad*.075 - late*mix(.075,.14,endGrain) + fibre*.018*detail;
      diffuseColor.rgb *= mix(vec3(1.), vec3(.96,.93,.87), endGrain);
    `)
  }
  material.customProgramCacheKey = () => 'how-stock-grain-v1'
  return material
}

export function grainTexture(seed = 1): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256
  const g = canvas.getContext('2d')!
  g.fillStyle = '#ab7e4f'; g.fillRect(0,0,512,256)
  for (let n=0;n<55;n++) {
    const y = (n*39.731 + seed*17.1)%256
    g.beginPath(); g.moveTo(0,y)
    g.bezierCurveTo(130,y+Math.sin(n)*10,330,y+Math.cos(n)*7,512,y+Math.sin(n*2)*4)
    g.strokeStyle = n%3 ? '#89603a24' : '#ebbd7b36'; g.lineWidth = n%4+1; g.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  return texture
}
