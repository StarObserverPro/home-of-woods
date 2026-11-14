import {mountTimberTheme} from '../../../src/ui/timber/mount.ts'
import type {TimberRole,TimberMaterial,TimberTone} from '../../../src/ui/timber/surface.ts'

function mark(node:HTMLElement,role:TimberRole,material:TimberMaterial,tone:TimberTone,seed:string){
  const attrs={timberSurface:role,timberMaterial:material,timberTone:tone,timberSeed:seed}
  for(const [key,value] of Object.entries(attrs))if(node.dataset[key]!==value)node.dataset[key]=value
}

/** Only the host's UI roles live here. Materials and observers remain shared with the game. */
export function mountWoodworkingTimber(shell:HTMLElement,shadow:ShadowRoot){
  shell.dataset.howUi='timber'
  function refresh(){
    const surfaces:readonly [string,TimberRole,TimberMaterial,TimberTone][]=[
      ['header','heading','plank','dark'],
      ['.seal','badge','endgrain','warm'],
      ['.stamp','badge','plank','moss'],
      ['.panel','panel','bark','dark'],
      ['.bar','heading','plank','warm'],
      ['.tag','badge','recess','dark'],
      ['.rail li','badge','plank','moss'],
      ['.note','slot','recess','dark'],
      ['dialog','panel','bark','dark'],
    ]
    for(const [selector,role,material,tone] of surfaces)
      shell.querySelectorAll<HTMLElement>(selector).forEach((node,index)=>mark(node,role,material,tone,`woodworking:${selector}:${index}`))
    shell.querySelectorAll<HTMLElement>('button,summary').forEach(node=>{
      const swatch=node.classList.contains('swatch')
      mark(node,'button',swatch?'endgrain':'plank',node.classList.contains('primary')?'warm':'moss',`woodworking:${node.dataset.a??node.dataset.paint??node.id??'summary'}`)
      if(node instanceof HTMLButtonElement)node.type='button'
      if(node.classList.contains('discard'))node.dataset.timberIntent='danger'
    })
    shell.querySelectorAll<HTMLElement>('.rail li').forEach(node=>{
      const current=node.classList.contains('current')
      node.classList.toggle('is-selected',current)
      if(current)node.setAttribute('aria-current','step')
      else node.removeAttribute('aria-current')
    })
  }
  refresh()
  const dispose=mountTimberTheme(shadow)
  return {refresh,dispose}
}
