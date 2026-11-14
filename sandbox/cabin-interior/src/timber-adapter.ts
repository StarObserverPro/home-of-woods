import {mountTimberTheme} from '../../../src/ui/timber/mount.ts';
import type {TimberRole as Surface,TimberMaterial as Material,TimberTone as Tone} from '../../../src/ui/timber/surface.ts';

function surface(element:HTMLElement,role:Surface,material:Material,tone:Tone,seed:string){
  const values={timberSurface:role,timberMaterial:material,timberTone:tone,timberSeed:seed};
  for(const [key,value] of Object.entries(values))if(element.dataset[key]!==value)element.dataset[key]=value;
}

/** This adapter supplies UI roles only; the shared owner generates and releases every surface. */
export function mountCabinTimber(root:HTMLElement){
  root.dataset.howUi='timber';
  function refresh(){
    const panels:readonly [string,Surface,Material,Tone][]=[
      ['.masthead','heading','plank','dark'],
      ['.collection','panel','bark','dark'],
      ['.collection-title','heading','plank','warm'],
      ['.inspector','slot','recess','dark'],
      ['.view-dock','panel','recess','dark'],
      ['.placement-panel','panel','bark','dark'],
      ['.stage-caption','badge','recess','dark'],
      ['#navigation-hint','badge','recess','dark'],
      ['#stage-count','badge','endgrain','warm'],
      ['.toast','badge','plank','moss'],
      ['#collection-total','badge','endgrain','warm'],
    ];
    for(const [selector,role,material,tone] of panels){
      const element=root.querySelector<HTMLElement>(selector);
      if(element)surface(element,role,material,tone,`cabin:${selector}`);
    }
    root.querySelectorAll<HTMLElement>('button,summary').forEach(element=>{
      const item=element.dataset.select;
      const iconOnly=element.matches('.add-item,[data-nudge]');
      const key=element.id||item||element.dataset.restore||element.dataset.action||element.dataset.preset||element.dataset.camera||element.dataset.nudge||element.parentElement?.className||'control';
      surface(element,item?'slot':'button',item?'recess':iconOnly?'endgrain':'plank',element.classList.contains('primary')?'warm':item?'dark':'moss',`cabin:${key}`);
      if(element instanceof HTMLButtonElement)element.type='button';
    });
  }
  refresh();
  const dispose=mountTimberTheme(root);
  return {refresh,dispose};
}
