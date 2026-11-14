import {mountTimberTheme} from '../../../src/ui/timber/mount.ts'

/** UI decoration only; use the same material/spacing/focus owner as the main game. */
export function mountWoodworkingTimber(shell:HTMLElement,shadow:ShadowRoot){
  shell.dataset.howUi='timber';shell.dataset.uiGridRoot='module'
  function refresh(){
    const roles:readonly [string,string,string,string][]=[
      ['.title-plaque','heading','plank','dark'],['.stamp','badge','plank','moss'],
      ['.controls,dialog','panel','bark','dark'],['.tool-dock','panel','bark','dark'],
      ['.message,.stage-readout','badge','recess','dark'],
    ]
    for(const [selector,role,material,tone]of roles)shell.querySelectorAll<HTMLElement>(selector).forEach(el=>{
      const attrs={timberSurface:role,timberMaterial:material,timberTone:tone,timberSeed:`woodworking:${el.id||el.className}`}
      for(const[k,v]of Object.entries(attrs))if(el.dataset[k]!==v)el.dataset[k]=v
    })
    shell.querySelectorAll<HTMLElement>('button:not([data-how-camera]),summary').forEach(el=>{
      const attrs={timberSurface:'button',timberMaterial:el.dataset.step?'endgrain':'plank',timberTone:el.classList.contains('primary')?'warm':'moss',timberSeed:`woodworking:${el.dataset.a||el.dataset.stage||el.dataset.task||el.dataset.step||el.textContent}`}
      for(const[k,v]of Object.entries(attrs))if(el.dataset[k]!==v)el.dataset[k]=v
      if(el instanceof HTMLButtonElement&&!el.closest('form'))el.type='button'
      if(el.classList.contains('danger'))el.dataset.timberIntent='danger'
    })
  }
  refresh();const dispose=mountTimberTheme(shadow);return{refresh,dispose}
}
