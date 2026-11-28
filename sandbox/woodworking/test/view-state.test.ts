import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOME_VIEW, rotateView, zoomView, worldPerPixel } from '../src/view-state.ts'
test('view rotations preserve zoom and a fixed stock defines scale independently of pose/cuts',()=>{
 let v={...HOME_VIEW};const ruler=worldPerPixel(90,30,30,868,660,v.zoom)
 for(let i=0;i<80;i++){v=rotateView(v,.2,-.1);assert.equal(v.zoom,1);assert.equal(worldPerPixel(90,30,30,868,660,v.zoom),ruler)}
 assert.equal(zoomView(v,2).zoom,1.75);assert.equal(zoomView(v,.01).zoom,.65)
})
