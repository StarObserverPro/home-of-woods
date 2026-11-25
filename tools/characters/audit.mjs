import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectGlbFile} from './glb-inspect.mjs';
import {validateCharacterAssets} from './validate.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HELP = `Character asset audit (read-only; never publishes or rewrites models)

node --experimental-strip-types tools/characters/audit.mjs inspect <model.glb> [--json <report.json>]
node --experimental-strip-types tools/characters/audit.mjs validate [--config tools/characters/intake.json] [--strict] [--require-all] [--json <report.json>]

Config file paths are relative to the repository root, including when the config
is elsewhere. An absolute model path is accepted for a private local inspection.
--strict      exit 1 for ready-asset errors and damaged legacy assets
              pending/staging files are measured with issues, never called ready
              legacy budget/texture mismatches remain warnings
--require-all also block all pending assets, even when their source file exists
--json PATH   write the full measured report (use .cache/ for private reports)
JSON is printed to stdout when --json is omitted. Exit 2 means invalid CLI/config.
Use --strict --require-all when checking whether the entire batch is ready.
`;

function argumentsFor(args) {
  const [command, ...tail] = args, options = {command, config: 'tools/characters/intake.json', strict: false, requireAll: false};
  if (['--help', '-h', undefined].includes(command)) return {help: true};
  if (!['inspect', 'validate'].includes(command)) throw new Error(`Unknown command ${command}`);
  for (let i = 0; i < tail.length; i++) {
    const value = tail[i];
    if (value === '--strict') options.strict = true;
    else if (value === '--require-all') options.requireAll = true;
    else if (['--config', '--json'].includes(value)) {
      if (!tail[i + 1] || tail[i + 1].startsWith('--')) throw new Error(`${value} requires a path`);
      options[value.slice(2)] = tail[++i];
    } else if (!value.startsWith('-') && command === 'inspect' && !options.file) options.file = value;
    else throw new Error(`Unexpected argument ${value}`);
  }
  if (command === 'inspect' && !options.file) throw new Error('inspect needs a model.glb path');
  return options;
}

try {
  const options = argumentsFor(process.argv.slice(2));
  if (options.help) process.stdout.write(HELP);
  else {
    const report = options.command === 'inspect'
      ? await inspectGlbFile(path.resolve(ROOT, options.file))
      : await validateCharacterAssets(JSON.parse(await readFile(path.resolve(ROOT, options.config), 'utf8')), {root: ROOT, requireAll: options.requireAll});
    const json = JSON.stringify(report, null, 2) + '\n';
    if (options.json) {
      const destination = path.resolve(ROOT, options.json);
      await mkdir(path.dirname(destination), {recursive: true});
      await writeFile(destination, json);
      process.stdout.write(`${JSON.stringify(report.summary ?? report.totals)}\nReport: ${destination}\n`);
    } else process.stdout.write(json);
    if (options.strict && (report.strictFailure || report.issues?.length)) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`Character audit: ${error.message}\n`);
  process.exitCode = 2;
}
