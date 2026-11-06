import test from 'node:test';
import assert from 'node:assert/strict';
import {RARITY_VFX_PREFERENCE_KEY,WHIMSY_PREFERENCE_KEY,readRarityVfxPreference,writeRarityVfxPreference,readWhimsyPreference,writeWhimsyPreference} from '../src/app/display-preferences.ts';

test('whimsical performance and item rarity have independent saved display choices',()=>{
  const values=new Map<string,string>(),store={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  assert.equal(writeRarityVfxPreference('full',store),true);
  assert.equal(writeWhimsyPreference('off',store),true);
  assert.equal(readRarityVfxPreference(store),'full');assert.equal(readWhimsyPreference(store),'off');
  writeRarityVfxPreference('off',store);writeWhimsyPreference('simple',store);
  assert.equal(readRarityVfxPreference(store),'off');assert.equal(readWhimsyPreference(store),'simple');
  assert.notEqual(RARITY_VFX_PREFERENCE_KEY,WHIMSY_PREFERENCE_KEY);assert.equal(values.size,2);
});

test('missing or invalid visual preferences do not mutate a world or another setting',()=>{
  const values=new Map([[WHIMSY_PREFERENCE_KEY,'future-mode'],[RARITY_VFX_PREFERENCE_KEY,'simple']]);
  const store={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  assert.equal(readWhimsyPreference(store),'full');assert.equal(readRarityVfxPreference(store),'simple');
  assert.equal(writeWhimsyPreference('invalid' as never,store),false);assert.equal(values.get(WHIMSY_PREFERENCE_KEY),'future-mode');
  assert.equal(readWhimsyPreference(null),'full');assert.equal(writeWhimsyPreference('off',null),false);
});
