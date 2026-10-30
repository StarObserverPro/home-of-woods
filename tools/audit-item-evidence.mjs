import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { verifiedSourceReader } from './read-verified-source.mjs';

const root = 'evidence/item-stack-compatibility/';
const read = file => JSON.parse(fs.readFileSync(root + file, 'utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const freeze = read('source-freeze.json');
assert.equal(sha(JSON.stringify(freeze.files)), freeze.runtimeFingerprint);
const source = verifiedSourceReader(root + 'verified-source.zip', false);
for (const file of [...freeze.files, ...freeze.supportFiles]) {
  assert.equal(sha(source(file.file)), file.sha256, `Frozen inventory source mismatch: ${file.file}`);
}
const build = read('verified-build.json');
assert.equal(build.runtimeFingerprint, freeze.runtimeFingerprint);
assert.equal(sha(fs.readFileSync(root + 'verified-source.zip')), build.sourceArchiveSha256);
assert.equal(sha(fs.readFileSync(root + 'verified-build.zip')), build.buildArchiveSha256);
const bundle = verifiedSourceReader(root + 'verified-build.zip', false);
for (const file of build.files) assert.equal(sha(bundle(file.file)), file.sha256);
for (const file of build.evidenceFiles) assert.equal(sha(fs.readFileSync(root + file.file)), file.sha256, `Evidence changed: ${file.file}`);

const log = fs.readFileSync(root + 'check.log', 'utf8');
assert.match(log, new RegExp(`# tests ${build.checks.tests}\\s+# suites 0\\s+# pass ${build.checks.tests}\\s+# fail 0`));
assert.match(log, /built in/);
const ui = read('ui-checks.json');
assert.deepEqual(ui.viewports.map(v => [v.width, v.height]), [[320,844],[390,844],[1280,720],[844,390]]);
for (const view of ui.viewports) {
  assert.equal(view.scrollWidth, view.width);
  assert.ok(view.dialog.width <= view.width && view.dialog.height <= view.height);
  assert.equal(view.dialog.scrollWidth, view.dialog.clientWidth);
  for (const button of view.buttons) assert.ok(button.width >= 43.99 && button.height >= 43.99);
  assert.equal(fs.readFileSync(root + view.file).subarray(0,2).toString('hex'), 'ffd8');
}
assert.equal(ui.game.collectedOrdinaryMushrooms, 2);
assert.equal(ui.game.afterOneReentry, 2);
assert.equal(ui.game.escapeCloses, true);
assert.equal(ui.game.bOpens, true);
assert.deepEqual(ui.game.consoleErrors, []);
assert.equal(ui.fixture.totalBefore, 27);
assert.equal(ui.fixture.totalAfterJsonReloadAndDefinitionRecovery, 27);
assert.equal(ui.fixture.ordinaryMushroomQuantity, 6);
assert.equal(ui.fixture.fineMushroomQuantity, 2);
assert.equal(ui.fixture.ungradedMushroomQuantity, 4);
assert.equal(ui.fixture.unknownItemQuantity, 7);
assert.equal(ui.fixture.unknownQualityQuantity, 3);
console.log(JSON.stringify({version:freeze.version,runtimeFingerprint:freeze.runtimeFingerprint,tests:build.checks.tests,viewports:4,result:'passed',mode:'frozen inventory source, build and UI evidence; live behavior checked by npm test'}));
