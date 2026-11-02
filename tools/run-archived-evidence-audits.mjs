/**
 * The project no longer keeps bulky screenshots in the current tree.
 * Historical audits still verify the exact original binary receipts from a
 * pinned, reachable pre-cleanup commit. Files are restored only temporarily.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

const archive = '79f4375ec2ddd3a4528eab0c6a9f34c4c203502e';
const image = /\.(?:png|jpe?g|webp|gif)$/i;
const evidence = /^(?:evidence\/|sandbox\/[^/]+\/evidence\/)/;
const git = (...args) => execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024 });

const restored = [];
let result = 1;
try {
  const paths = git('ls-tree', '-r', '--name-only', archive).toString('utf8')
    .split('\n').filter(path => evidence.test(path) && image.test(path));
  if (paths.length !== 193) throw new Error('Archived screenshot inventory has changed');
  for (const path of paths) {
    if (existsSync(path)) continue;
    const bytes = git('show', `${archive}:${path}`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    restored.push(path);
  }
  console.log(`Checking ${paths.length} original screenshots against immutable historical receipts (temporary restore)`);
  const check = spawnSync('npm', ['run', 'verify:evidence:raw'], { stdio: 'inherit' });
  if (check.error) throw check.error;
  result = check.status ?? 1;
} finally {
  for (const path of restored.reverse()) unlinkSync(path);
}
process.exitCode = result;
