import {CREEK_BRIDGE} from '../content/regions.ts';
import type {SaveContext} from './save-context.ts';
import {createForestry} from './forestry.ts';
import {createGathering} from './gathering.ts';
import {object} from './save-validation.ts';

/** Only the immediately preceding authored valley: add eastern records, preserve all existing ones. */
export function expandPreviousValley(raw:unknown,context:SaveContext){
  const world=structuredClone(object(raw,'world')),forestry=object(world.forestry,'forestry'),gathering=object(world.gathering,'gathering');
  const slots={...object(forestry.slots,'forestry.slots')},sources={...object(gathering.sources,'gathering.sources')};
  const initialForestry=createForestry([...context.trees.values()]),initialGathering=createGathering(context.registry);
  for(const [id,tree] of context.trees)if(tree.regionId==='east-woodland'&&!Object.hasOwn(slots,id))slots[id]=initialForestry.slots[id];
  for(const [id,source] of context.registry.sources)if(source.region==='east-woodland'&&!Object.hasOwn(sources,id))sources[id]=initialGathering.sources[id];
  const workshop=object(world.workshop,'workshop');
  return {...world,forestry:{...forestry,slots},gathering:{...gathering,sources},workshop:{...workshop,
    blueprints:Array.isArray(workshop.blueprints)&&!workshop.blueprints.includes(CREEK_BRIDGE.blueprintId)?[...workshop.blueprints,CREEK_BRIDGE.blueprintId]:workshop.blueprints}};
}
