import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const cabinTests = ['tests/local-occlusion*.test.ts', 'tests/cabin-interior.test.ts'];
const timberTests = ['tests/timber-surface.test.ts'];

const suites = {
  'wood-tone': {
    script: 'wood-tone-browser.mjs',
    output: 'WOOD_EVIDENCE_DIR',
    tests: ['tests/wood-tones.test.ts', 'tests/wood-grain.test.ts', ...cabinTests],
  },
  lighting: {
    script: 'lighting-review.mjs',
    output: 'LIGHTING_EVIDENCE_DIR',
    tests: cabinTests,
  },
  'timber-desktop': timber('desktop'),
  'timber-mobile': timber('mobile'),
  'timber-modules': timber('modules'),
  'timber-baseline': timber('baseline'),
};

function timber(scope) {
  return {
    script: scope === 'baseline' ? 'timber-ui-baseline.mjs' : 'timber-ui-browser.mjs',
    output: 'TIMBER_EVIDENCE_DIR',
    tests: timberTests,
    env: { TIMBER_REVIEW_SCOPE: scope },
  };
}

const selection = [...new Set(process.argv.slice(2))];
if (selection.length === 0 || selection.some(name => !Object.hasOwn(suites, name))) {
  console.error('Usage: npm run verify:browser -- ' + Object.keys(suites).join(' | '));
  process.exit(2);
}

const npm = process.env.npm_execpath;
if (!npm) {
  console.error('Start this review with npm run verify:browser.');
  process.exit(2);
}

function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function requireSuccess(args) {
  const status = run(args);
  if (status !== 0) process.exit(status);
}

const output = process.env.HOW_REVIEW_EVIDENCE_DIR
  ? path.resolve(process.env.HOW_REVIEW_EVIDENCE_DIR)
  : mkdtempSync(path.join(tmpdir(), 'how-browser-review-'));
mkdirSync(output, { recursive: true });
console.log('Browser review evidence: ' + output);
console.log('Node ' + process.version);

const selectedSuites = selection.map(name => suites[name]);
if (selectedSuites.some(suite => suite.tests === timberTests)) {
  requireSuccess([npm, 'run', 'verify:ui']);
}
const tests = [...new Set(selectedSuites.flatMap(suite => suite.tests))];
requireSuccess(['--experimental-strip-types', '--test', '--test-concurrency=4', ...tests]);
if (selection.includes('lighting')) requireSuccess([npm, 'run', 'verify:cabin-assets']);
if (selection.some(name => name !== 'timber-baseline')) requireSuccess([npm, 'run', 'build']);
if (selection.includes('timber-modules')) {
  requireSuccess([npm, '--prefix', 'sandbox/woodworking', 'run', 'build']);
}

let failed = false;
for (const name of selection) {
  const suite = suites[name];
  console.log('Browser review: ' + name);
  const status = run(['tools/verification/' + suite.script], {
    ...process.env,
    ...suite.env,
    [suite.output]: path.join(output, name),
  });
  if (status !== 0) {
    console.error(name + ' failed (exit ' + status + ')');
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
