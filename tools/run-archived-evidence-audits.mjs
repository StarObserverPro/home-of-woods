/** Run old evidence checks in a detached historical worktree, without restoring old receipts to main. */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const archive = '5911ac2fdf3ca25615a8292180207ef3ead9f758';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = mkdtempSync(join(tmpdir(), 'how-historical-evidence-'));
const worktree = join(base, 'checkout');
let attached = false;
let status = 1;
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
try {
  try { git('cat-file', '-e', archive + '^{commit}'); }
  catch { throw new Error('Archived evidence commit missing: ' + archive + '. Fetch full Git history before running this optional audit.'); }
  git('worktree', 'add', '--detach', worktree, archive);
  attached = true;
  console.log('Auditing original historical receipts in detached checkout ' + archive.slice(0, 7));
  const run = spawnSync(process.execPath, ['tools/run-archived-evidence-audits.mjs'], { cwd: worktree, stdio: 'inherit' });
  if (run.error) throw run.error;
  status = run.status ?? 1;
} finally {
  if (attached) {
    const cleanup = spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: root, encoding: 'utf8' });
    if (cleanup.status !== 0) console.error('Could not remove temporary historical worktree:', cleanup.stderr);
  }
  rmSync(base, { recursive: true, force: true });
}
process.exitCode = status;
