import * as T from 'three';import {loadModel} from './load-model.js';import {createActor} from '../src/actor.js';import {createTree} from '../src/tree.js';
const [p,m]=await Promise.all([loadModel('player'),loadModel('motions')]);const actor=createActor(p.scene,m.animations);
for(const action of ['gather','pray','climb','fell']){actor.update(action,action==='fell'?1.49:1.5,{radius:.5});console.log(action,Object.fromEntries(['hips','upperarml','handslotl','handslotr','footl','footr'].map(k=>[k,actor.bones[k].getWorldPosition(new T.Vector3()).toArray().map(n=>+n.toFixed(3))])));}
for(const k of ['pine','broadleaf']){const t=createTree((await loadModel(k)).scene,k);t.update(5,'fell',false,false);console.log(k,t.stats());}
