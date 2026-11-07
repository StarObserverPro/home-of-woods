import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createJob,
  cut,
  markCut,
  clearMark,
  idealMark,
  trialFit,
  finish,
  recordTrial,
  pare,
  restoreJob,
  CUTS,
  profile,
  endAt,
} from '../src/domain.ts'
import type { Job, CutId, Mark } from '../src/domain.ts'
function marked(job: Job, id: CutId, offset = 0, tilt = 0): Job {
  const mark = idealMark(job, id)
  return markCut(job, id, {
    ...mark,
    a: { ...mark.a, u: mark.a.u + offset },
    b: { ...mark.b, u: mark.b.u + offset + tilt },
  })
}
function sample(offsets: Partial<Record<CutId, number>> = {}): Job {
  let job = createJob()
  for (const id of CUTS) job = cut(marked(job, id, offsets[id]), id)
  return job
}
test('marks can be replaced or cleared until the actual irreversible cut', () => {
  const blank = createJob(),
    first = marked(blank, 'trim', 1)
  assert.throws(() => cut(blank, 'trim'))
  assert.throws(() => marked(blank, 'cheekNear'))
  assert.throws(() => cut(clearMark(first, 'trim'), 'trim'))
  const trimmed = cut(marked(first, 'trim', -1, 2), 'trim')
  assert.equal(endAt(trimmed, 0), 79)
  assert.equal(endAt(trimmed, 30), 81)
  assert.equal(endAt(blank, 0), 90)
  assert.throws(() => marked(trimmed, 'trim'))
  assert.throws(() => marked(trimmed, 'shoulderNear'))
  assert.equal(profile(trimmed).nearReleased, false)
})
test('invalid traces and impossible stock cannot enter the geometry', () => {
  const job = createJob(),
    ideal = idealMark(job, 'trim')
  for (const mark of [
    { ...ideal, face: 'end' },
    { ...ideal, a: { u: NaN, v: 0 } },
    { ...ideal, b: { u: 80, v: 1 } },
  ] as Mark[])
    assert.throws(() => markCut(job, 'trim', mark))
  assert.throws(() => createJob({ ...job.design, tenonWidth: 31 }, job.stock))
})
test('trial identifies both interfering walls and each pared face consumes real material', () => {
  let job = sample({ cheekNear: -0.75, cheekFar: 0.75 })
  assert.deepEqual(trialFit(job).repair, ['near', 'far'])
  assert.throws(() => pare(job, 'near'))
  job = pare(recordTrial(job), 'near', 0.75)
  assert.deepEqual(trialFit(job).repair, ['far'])
  job = pare(job, 'far', 0.75)
  assert.equal(trialFit(job).fits, true)
  assert.throws(() => finish(job))
  assert.equal(finish(recordTrial(job)).score, 100)
  job = pare(pare(job, 'near', 1), 'near', 1)
  assert.equal(trialFit(job).fits, false)
  assert.throws(() => pare(job, 'near', -1))
})
test('short, bottomed, asymmetric and loose joints cannot be finalized', () => {
  for (const offsets of [{ trim: -3 }, { trim: 1 }, { shoulderNear: 3 }, { cheekFar: -2 }]) {
    const job = recordTrial(sample(offsets))
    assert.equal(trialFit(job).fits, false)
    assert.throws(() => finish(job))
  }
})
test('dimensions and score are derived from geometry, independent of paint', () => {
  const job = recordTrial(sample({ trim: -0.25, cheekNear: 0.2 })),
    base = finish(job),
    painted = finish(job, '#654321')
  assert.ok(base.score < 100)
  assert.equal(base.envelope.length, 79.75)
  assert.equal(base.envelope.tenonWidth, 13.8)
  assert.deepEqual({ ...painted, paint: null }, base)
  assert.ok(!('cuts' in base))
  assert.ok(!('stock' in base))
})
test('depth fence leaves waste attached when shoulder misses the rip cut', () => {
  const job = cut(marked(cut(marked(createJob(), 'trim'), 'trim'), 'cheekNear'), 'cheekNear')
  const missed = marked(job, 'shoulderNear', -2)
  assert.throws(() => cut(missed, 'shoulderNear'), /不相交/)
  assert.equal(profile(missed).nearReleased, false)
  assert.equal(profile(cut(marked(missed, 'shoulderNear'), 'shoulderNear')).nearReleased, true)
})
test('restore validates a half-built blank and the full finished envelope keeps actual planes', () => {
  const blank = cut(marked(createJob(), 'trim', 0, 0.25), 'trim')
  const waiting = marked(blank, 'cheekNear', 0, 0.25)
  assert.deepEqual(restoreJob(JSON.parse(JSON.stringify(waiting))), waiting)
  assert.throws(() => restoreJob({ ...waiting, cuts: { shoulderNear: idealMark(waiting, 'shoulderNear') } }))
  assert.throws(() => restoreJob({ ...waiting, trials: 5 }))
  assert.throws(() => restoreJob({ ...waiting, needsTrial: false }))
  let job = cut(waiting, 'cheekNear')
  for (const id of ['cheekFar', 'shoulderNear', 'shoulderFar'] as const) job = cut(marked(job, id), id)
  const item = finish(restoreJob(recordTrial(job)))
  assert.deepEqual(item.envelope.end, [80, 80.25])
  assert.deepEqual(item.envelope.nearCheek, [8, 8.25])
})
