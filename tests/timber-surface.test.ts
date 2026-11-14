import test from 'node:test';
import assert from 'node:assert/strict';
import {timberShape, timberSurface} from '../src/ui/timber/surface.ts';
import type {TimberMaterial, TimberRole} from '../src/ui/timber/surface.ts';

test('same seed and dimensions reproduce the paint without global random state', () => {
  const first = timberSurface({width: 173, height: 48, material: 'plank', seed: 'warehouse:take'});
  timberSurface({width: 700, height: 600, seed: 'unrelated-window'});
  assert.deepEqual(timberSurface({width: 173, height: 48, material: 'plank', seed: 'warehouse:take'}), first);
  assert.notEqual(timberSurface({width: 173, height: 48, seed: 'warehouse:store'}).svg, first.svg);
  assert.equal(decodeURIComponent(first.dataUri.split(',').slice(1).join(',')), first.svg);
});

test('surface construction follows role before ratio and keeps cuts in CSS pixels', () => {
  assert.equal(timberShape(600, 600, 'panel'), 'panel');
  assert.equal(timberShape(1100, 100, 'panel'), 'panel');
  assert.equal(timberShape(44, 44), 'block');
  assert.equal(timberShape(160, 44), 'plank');
  assert.equal(timberShape(44, 160), 'post');
  const normal = timberSurface({width: 160, height: 48});
  const wide = timberSurface({width: 1600, height: 48});
  assert.equal(normal.corner, wide.corner);
  assert.equal(normal.depth, wide.depth);
  assert.ok(wide.corner <= 10 && wide.depth <= 10);
});

test('all material families remain bounded, self-contained vector paint at extreme sizes', () => {
  const materials: TimberMaterial[] = ['plank', 'endgrain', 'bark', 'shaving', 'recess'];
  const roles: TimberRole[] = ['button', 'panel', 'heading', 'slot', 'badge'];
  const sizes = [[16, 16], [44, 44], [320, 1000], [1600, 48], [Infinity, NaN], [-10, 1e10]];
  for (const material of materials) for (const role of roles) for (const [width, height] of sizes) {
    const surface = timberSurface({width, height, material, role, seed: 'test'});
    assert.ok(surface.width >= 16 && surface.width <= 4096);
    assert.ok(surface.height >= 16 && surface.height <= 4096);
    assert.ok(surface.svg.length < 16000, `${material}/${role} paint grew unbounded`);
    assert.ok(surface.facetCount <= 48);
    assert.doesNotMatch(surface.svg, /NaN|Infinity|<script|<image|<filter|<animate|<foreignObject|stroke=|onload|href=/);
    for (const points of surface.svg.matchAll(/points="([^"]+)"/g)) {
      for (const pair of points[1].split(' ')) {
        const [x, y] = pair.split(',').map(Number);
        assert.ok(x >= 0 && x <= surface.width && y >= 0 && y <= surface.height,
          `${material}/${role} facet left ${surface.width}×${surface.height}: ${pair}`);
      }
    }
  }
});

test('untrusted seed text is hashed, never inserted into SVG markup', () => {
  const surface = timberSurface({width: 160, height: 48, seed: '\"><script>alert(1)</script><image href="https://example.com"/>'});
  assert.doesNotMatch(surface.svg, /<script|<image|alert|example\.com/);
});
