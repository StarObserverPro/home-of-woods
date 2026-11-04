import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {characterModels} from './glb-fixtures.ts';
import {createCharacterWardrobe} from '../src/scene/character-wardrobe.ts';
import {DEFAULT_WARDROBE,resolveWardrobe,wardrobeForMountedItems,WARDROBE_CAPABILITIES} from '../src/content/wardrobe.ts';
import {createCharacters} from '../src/scene/characters.ts';
import {makeTrees} from '../src/world/layout.ts';
import {createState} from '../src/domain/state.ts';

test('the real KayKit rig accepts independent bone-following hair, outfits, hats and packs',async()=>{
  const {resources,models}=await characterModels();
  const first=models.clone('ranger'),other=models.clone('ranger');
  const wardrobe=createCharacterWardrobe(resources,first);
  const otherWardrobe=createCharacterWardrobe(resources,other);
  const root=first.getObjectByName('wardrobe:hair:ponytail:head')!;
  assert.ok(root instanceof THREE.Group);
  assert.ok(root.parent instanceof THREE.Bone);
  assert.equal(root.parent.name,'head');
  assert.equal(root.visible,false,'default keeps reviewed character model unchanged');
  const look=resolveWardrobe({
    hair:'ponytail',top:'work-jacket',bottom:'patched-trousers',
    footwear:'boots',headwear:'straw',back:'pack',
  });
  wardrobe.apply(look);
  for(const name of [
    'wardrobe:hair:ponytail:head',
    'wardrobe:top:work-jacket:chest',
    'wardrobe:top:work-jacket:upperarml',
    'wardrobe:top:work-jacket:lowerarmr',
    'wardrobe:bottom:patched-trousers:lowerlegr',
    'wardrobe:footwear:boots:footl',
    'wardrobe:headwear:straw:head',
    'wardrobe:back:pack:chest',
  ]){
    const object=first.getObjectByName(name);
    assert.ok(object,name);
    assert.equal(object!.visible,true,name);
  }
  assert.equal(other.getObjectByName('wardrobe:hair:ponytail:head')!.visible,false,
    'one actor never equips another');
  wardrobe.update(1.5,true,false);
  assert.equal(wardrobe.stats().look.hair,'ponytail');
  assert.deepEqual(otherWardrobe.stats().look,DEFAULT_WARDROBE);
  assert.equal(WARDROBE_CAPABILITIES.realClothSimulation,'unsupported');
  assert.throws(()=>resolveWardrobe({hair:'unregistered' as 'original'}),/Unknown wardrobe/);
  wardrobe.apply(DEFAULT_WARDROBE);
  assert.equal(root.visible,false);
  wardrobe.dispose();wardrobe.dispose();otherWardrobe.dispose();
  assert.equal(first.getObjectByName('wardrobe:hair:ponytail:head'),undefined);
  resources.dispose();
});

test('an actual mounted owned item overrides preview but keeps unique inventory source untouched',()=>{
  const base=resolveWardrobe({hair:'swept',headwear:'beanie',back:'none'});
  const instances=[
    {instanceId:'hat-a',definitionId:'travel.sun-hat',rarityId:'epic',
      traits:[{id:'future-shade',value:2}],location:{kind:'mounted',hostId:'player',slotId:'player:headwear'}},
    {instanceId:'pack-a',definitionId:'travel.backpack',
      location:{kind:'mounted',hostId:'player',slotId:'player:back-gear'}},
    {instanceId:'hat-b',definitionId:'travel.sun-hat',
      location:{kind:'inventory'}},
  ];
  const frozen=JSON.stringify(instances);
  const seen=wardrobeForMountedItems(base,instances);
  assert.equal(seen.headwear,'straw');assert.equal(seen.back,'pack');
  assert.equal(seen.hair,'swept');
  assert.equal(JSON.stringify(instances),frozen,'presentation does not write ownership or traits');
  assert.equal(base.headwear,'beanie');
});

test('the live player keeps a single wardrobe look across regular and procedural animations',async()=>{
  const {models,resources}=await characterModels(),trees=makeTrees(),forest=models.createForest(trees);
  const characters=createCharacters(resources,models,trees,forest.selections),state=createState(trees);
  characters.setWardrobe({top:'canvas-vest',hair:'bun',back:'pack'});
  characters.setInspection('wardrobe');characters.update(state);
  let stats=characters.stats();
  assert.equal(stats.mode,'idle');assert.equal(stats.inspection,'wardrobe');
  assert.equal(stats.wardrobe.standard.look.top,'canvas-vest');
  assert.equal(stats.wardrobe.action.look.top,'canvas-vest');
  assert.equal(characters.player.getObjectByName('forestry-hand-axe')!.visible,false);
  characters.setInspection(null);state.player.moving=true;state.time=.33;characters.update(state);
  stats=characters.stats();assert.equal(stats.mode,'walk');
  assert.equal(stats.wardrobe.action.look.hair,'bun');
  characters.dispose();resources.dispose();
});
