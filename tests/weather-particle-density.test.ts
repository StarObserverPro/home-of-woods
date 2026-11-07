import test from 'node:test';
import assert from 'node:assert/strict';
import {seedArray} from '../src/scene/weather-particle-seeds.js';

test('light precipitation retains particles in every spatial region',()=>{
  const seeds=seedArray(10000);
  const bins=new Array<number>(16).fill(0);
  let lightCount=0,heavyCount=0;
  for(let i=0;i<seeds.density.length;i++){
    if(seeds.density[i]<.8)heavyCount++;
    if(seeds.density[i]>=.2)continue;
    const x=seeds.values[i*3],z=seeds.values[i*3+2];
    bins[Math.floor(x*4)*4+Math.floor(z*4)]++;
    lightCount++;
  }
  assert.ok(lightCount>1800&&lightCount<2200);
  assert.ok(heavyCount>7700&&heavyCount<8300);
  assert.ok(bins.every(count=>count>80&&count<180),'all sixteen regions retain comparable density');
  assert.deepEqual(seedArray(10000),seeds);
});

test('rain endpoints share their density and spatial seeds',()=>{
  const seeds=seedArray(1800,true);
  for(let i=0;i<1800;i++){
    assert.equal(seeds.density[i*2],seeds.density[i*2+1]);
    assert.equal(seeds.tips[i*2],0);
    assert.equal(seeds.tips[i*2+1],1);
    for(let axis=0;axis<3;axis++)assert.equal(seeds.values[i*6+axis],seeds.values[i*6+3+axis]);
  }
});
