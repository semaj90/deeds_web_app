import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { validateSnapshot } from './lib/workspace-snapshot-capture-v1.mjs';
const { values, positionals } = parseArgs({
  options: { manifest: { type: 'string' } },
  allowPositionals: true,
});
const manifest = values.manifest ?? positionals[0];
if (!manifest) throw new Error('--manifest must name the exact captured artifact');
const report = validateSnapshot(JSON.parse(readFileSync(manifest, 'utf8')));
console.log(JSON.stringify(report, null, 2));
if (report.violations.length) process.exitCode = 1;
