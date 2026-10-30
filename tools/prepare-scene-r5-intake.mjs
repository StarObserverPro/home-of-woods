import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {makeTrees} from '../src/world/layout.ts';
import {createState} from '../src/domain/state.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {serializeWorldSave} from '../src/domain/world-save.ts';
import {inventoryTransaction} from '../src/domain/inventory.ts';
const root=resolve(import.meta.dirname,'..'),folder=resolve(root,'evidence/scene-r5');
const files=['src/world/layout.ts','src/world/surface.ts','src/scene/create-scene.ts','src/scene/terrain.ts','src/scene/environment.ts','src/scene/ground-material.ts','src/app/runtime.ts','src/ui/App.tsx','src/ui/style.css','src/domain/save-context.ts','vite.config.ts'];
const records=[];await mkdir(folder,{recursive:true});
try{await readFile(resolve(folder,'intake.json'));throw new Error('Intake already exists; do not overwrite original source evidence');}catch(error){if(error.code!=='ENOENT')throw error;}
for(const path of files){const source=resolve(root,path),backup=resolve(root,'.cache/scene-r5-before',path);const bytes=await readFile(source);await mkdir(dirname(backup),{recursive:true});await copyFile(source,backup);records.push({path,sha256:createHash('sha256').update(bytes).digest('hex')});}
const trees=makeTrees(),state=createState(trees);state.time=12;state.selected='tree-slot-5-26';
state.inventory=inventoryTransaction(state.inventory,[{itemId:'wood',qualityId:'ordinary',delta:6},{itemId:'branch',qualityId:'ordinary',delta:4},{itemId:'mushroom',qualityId:'ordinary',delta:3}]);
await writeFile(resolve(folder,'before-trees.json'),JSON.stringify(trees,null,2));
await writeFile(resolve(folder,'before-save.json'),await serializeWorldSave(state,createSaveContext(trees),{sequence:1,savedAt:0}));
await writeFile(resolve(folder,'intake.json'),JSON.stringify({date:'2026-10-30',scope:'authorized local scene integration; no PR, merge or deployment',syntheticSave:true,treeCount:trees.length,files:records},null,2));
console.log(`Captured ${records.length} owning files, ${trees.length} fixed trees and a synthetic pre-integration save.`);
