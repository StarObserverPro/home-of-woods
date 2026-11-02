/** Run with node --experimental-strip-types; outputs synthetic current-format data only. */
import {createState} from '../../src/domain/state.ts';
import {createSaveContext} from '../../src/domain/save-context.ts';
import {serializeWorldSave} from '../../src/domain/world-save.ts';
import {inventoryTransaction} from '../../src/domain/inventory.ts';
import {RARITIES} from '../../src/content/rarities.ts';
import {BLUEPRINTS,WORKBENCH,SEAT_DEFINITION} from '../../src/content/workshop.ts';
const state=createState();state.player={...WORKBENCH.stand,facing:0,moving:false};
state.workshop.blueprints=BLUEPRINTS.map(p=>p.id);
state.inventory=inventoryTransaction(state.inventory,[{itemId:'wood',qualityId:'ordinary',delta:3}]);
state.inventory.instances=RARITIES.map(r=>({instanceId:`visual-${r.id}`,definitionId:SEAT_DEFINITION,blueprintId:BLUEPRINTS[0].id,createdAt:0,rarityId:r.id,traits:[{id:'comfort',value:2}],futureFinish:{decal:'fern',version:7},location:{kind:'inventory'}}));
console.log(await serializeWorldSave(state,createSaveContext(),{sequence:1,savedAt:0}));
