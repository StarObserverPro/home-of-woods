import test from "node:test";
import assert from "node:assert/strict";
import { WORLD } from "../src/content/world.ts";
import { riverX } from "../src/world/surface.ts";
import { Resources } from "../src/scene/resources.ts";
import { createTerrain } from "../src/scene/terrain.ts";

test("water stays within the stream corridor instead of flooding unrelated low terrain", () => {
  const resources = new Resources();
  const { water } = createTerrain(resources);
  const points = water.geometry.getAttribute("position");
  const normals = water.geometry.getAttribute("normal");
  for (let i = 0; i < points.count; i++) {
    assert.ok(
      Math.abs(points.getX(i) - riverX(points.getZ(i))) <=
        WORLD.riverHalfWidth + 0.00001,
    );
    assert.equal(points.getY(i) + water.position.y, WORLD.waterY);
    assert.ok(normals.getY(i) > 0.99);
  }
  resources.dispose();
});
