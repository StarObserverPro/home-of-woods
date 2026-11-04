import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AFFIX_COLOR_DUOS, AFFIX_COLOR_FAMILIES, AFFIX_SWATCHES, AFFIX_SWATCH_BY_ID,
  AFFIX_SWATCH_BY_INDEX, colorFrom256Index,
} from '../src/content/affix-vfx-palette.ts';
import {
  AFFIX_PARTICLE_SHAPES, AFFIX_EMISSION_PATTERNS, AFFIX_TRIGGER_LIBRARY,
  LOW_TIER_AFFIX_CANDIDATES, validateLowTierAffixLibrary,
} from '../src/content/affix-vfx-library.ts';
import { RARITIES } from '../src/content/rarities.ts';
import { ITEM_VFX } from '../src/content/item-vfx.ts';

test('48 named colors are a unique, exact subset of the deterministic 256-color palette',()=>{
  assert.equal(AFFIX_SWATCHES.length,48);
  assert.ok(AFFIX_SWATCHES.length <= Math.floor(256/3));
  assert.equal(AFFIX_COLOR_FAMILIES.length,8);
  assert.equal(new Set(AFFIX_SWATCHES.map(v=>v.id)).size,48);
  assert.equal(new Set(AFFIX_SWATCHES.map(v=>v.name)).size,48);
  assert.equal(new Set(AFFIX_SWATCHES.map(v=>v.paletteIndex)).size,48);
  assert.equal(AFFIX_SWATCH_BY_ID.size,48);
  assert.equal(AFFIX_SWATCH_BY_INDEX.size,48);
  for (const color of AFFIX_SWATCHES) {
    assert.equal(color.hex,colorFrom256Index(color.paletteIndex));
    assert.match(color.hex,/^#[0-9A-F]{6}$/);
    assert.ok(color.imagery.every(v=>typeof v==='string'&&v.length>0));
    assert.equal(AFFIX_SWATCH_BY_ID.get(color.id),color);
    assert.equal(AFFIX_SWATCH_BY_INDEX.get(color.paletteIndex),color);
  }
  assert.equal(colorFrom256Index(180),'#D7AF87');
  assert.equal(colorFrom256Index(159),'#AFFFFF');
  assert.equal(colorFrom256Index(254),'#E4E4E4');
  for (const bad of [-1,0,15,256,NaN,18.4])
    assert.throws(()=>colorFrom256Index(bad),/Invalid deterministic/);
});

test('duos are author-selected harmonious pairs, not duplicate or unregistered colors',()=>{
  assert.equal(AFFIX_COLOR_DUOS.length,8);
  assert.equal(new Set(AFFIX_COLOR_DUOS.map(v=>v.id)).size,8);
  for(const pair of AFFIX_COLOR_DUOS){
    assert.equal(pair.colors.length,2);
    assert.notEqual(pair.colors[0],pair.colors[1]);
    assert.ok(pair.colors.every(id=>AFFIX_SWATCH_BY_ID.has(id)));
    assert.ok(pair.name.length>=4&&pair.imagery.length>=6);
  }
});

test('simple and ornate particle shapes, whole-character staging, and triggers remain bounded',()=>{
  assert.equal(AFFIX_PARTICLE_SHAPES.length,11);
  assert.equal(AFFIX_PARTICLE_SHAPES.filter(s=>s.complexity==='simple').length,6);
  assert.equal(AFFIX_PARTICLE_SHAPES.filter(s=>s.complexity==='ornate').length,5);
  assert.equal(AFFIX_EMISSION_PATTERNS.length,8);
  assert.equal(AFFIX_TRIGGER_LIBRARY.length,14);
  for(const group of [AFFIX_PARTICLE_SHAPES,AFFIX_EMISSION_PATTERNS,AFFIX_TRIGGER_LIBRARY])
    assert.equal(new Set(group.map(x=>x.id)).size,group.length);
  for(const pattern of AFFIX_EMISSION_PATTERNS){
    assert.ok(pattern.widths>=1.1&&pattern.widths<=1.7);
    assert.ok(pattern.maxParticles<=12&&pattern.maxParticles>=8);
  }
  assert.deepEqual(AFFIX_TRIGGER_LIBRARY.filter(t=>t.readiness==='future-feature').map(t=>t.id),
    ['weather.rain-stops','weather.fog-enters']);
  assert.deepEqual(AFFIX_TRIGGER_LIBRARY.filter(t=>t.family==='time').map(t=>t.source),
    ['calendar','calendar','calendar','calendar','calendar','calendar']);
});

test('candidate wordings are distinct, stay dormant, and enforce low-tier combination rules',()=>{
  assert.doesNotThrow(validateLowTierAffixLibrary);
  assert.equal(LOW_TIER_AFFIX_CANDIDATES.length,13);
  assert.equal(new Set(LOW_TIER_AFFIX_CANDIDATES.map(x=>x.name)).size,13);
  for(const candidate of LOW_TIER_AFFIX_CANDIDATES){
    assert.equal(candidate.status,'candidate');
    assert.ok(['common','uncommon'].includes(candidate.complexity));
    assert.ok(candidate.imagery.length>8);
    const colors=candidate.colorIds.map(id=>AFFIX_SWATCH_BY_ID.get(id));
    assert.ok(colors.every(Boolean));
    if(candidate.complexity==='common')assert.equal(colors.length,1);
    else assert.ok(colors.length>=1&&colors.length<=2);
  }
  assert.ok(LOW_TIER_AFFIX_CANDIDATES.some(x=>x.visual.kind==='tint'));
  assert.ok(LOW_TIER_AFFIX_CANDIDATES.some(x=>x.visual.kind==='particles'));
});

test('the proposal library does not reassign the five item rarities or glow presentation',()=>{
  assert.deepEqual(RARITIES.map(r=>r.id),['common','uncommon','rare','epic','legendary']);
  assert.equal(ITEM_VFX.epic.tint,'#b34dff');
  assert.equal(ITEM_VFX.legendary.tint,'#ffb52e');
  // Rarity is item identity; neither rarity ID nor loot weights occur on color/shape entries.
  assert.equal(Object.hasOwn(AFFIX_SWATCHES[0],'rarityId'),false);
  assert.equal(Object.hasOwn(AFFIX_PARTICLE_SHAPES[0],'rarityId'),false);
  assert.equal(Object.hasOwn(LOW_TIER_AFFIX_CANDIDATES[0],'handlerId'),false);
});
