import test from "node:test";
import assert from "node:assert/strict";
import { createLoop } from "../src/app/runtime-loop.ts";
import { Resources } from "../src/scene/resources.ts";
import * as THREE from "three";
test("one frame chain, bounded delta, pause/resume baseline and terminal destruction", () => {
  let next = 0;
  const pending = new Map<number, (time: number) => void>(),
    deltas: number[] = [];
  const loop = createLoop((dt) => deltas.push(dt), {
    request: (cb) => {
      pending.set(++next, cb);
      return next;
    },
    cancel: (id) => {
      pending.delete(id);
    },
  });
  const advance = (time: number) => {
    const entry = [...pending.entries()][0];
    assert.ok(entry);
    pending.delete(entry[0]);
    entry[1](time);
  };
  loop.setPaused(false);
  loop.setPaused(false);
  assert.equal(pending.size, 1);
  advance(0);
  advance(16);
  assert.equal(pending.size, 1);
  assert.equal(deltas[0], 0);
  loop.setPaused(true);
  assert.equal(pending.size, 0);
  loop.setPaused(false);
  advance(60_000);
  assert.equal(deltas.at(-1), 0);
  advance(99_000);
  assert.equal(deltas.at(-1), 0.1);
  loop.destroy();
  loop.destroy();
  loop.setPaused(false);
  assert.equal(pending.size, 0);
  assert.ok(loop.stats().destroyed);
});
test("shared geometry/material cache disposes each allocation once and cannot resurrect", () => {
  const r = new Resources();
  let geometryDisposals = 0,
    materialDisposals = 0,
    extraDisposals = 0;
  const g = r.geometry("tree", () => new THREE.BoxGeometry());
  g.addEventListener("dispose", () => geometryDisposals++);
  assert.equal(
    r.geometry("tree", () => {
      throw new Error("duplicate allocation");
    }),
    g,
  );
  const m = r.material("#abcdef");
  m.addEventListener("dispose", () => materialDisposals++);
  assert.equal(r.material("#abcdef"), m);
  const extra = {
    dispose() {
      extraDisposals++;
    },
  };
  r.own(extra);
  r.own(extra);
  r.own(g);
  r.own(m);
  r.dispose();
  r.dispose();
  assert.deepEqual(
    [geometryDisposals, materialDisposals, extraDisposals],
    [1, 1, 1],
  );
  assert.deepEqual(r.stats(), {
    geometries: 0,
    materials: 0,
    extras: 0,
    disposed: true,
  });
  assert.throws(() => r.geometry("new", () => new THREE.BoxGeometry()));
});
