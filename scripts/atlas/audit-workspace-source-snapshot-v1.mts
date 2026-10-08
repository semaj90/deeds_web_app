import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { validateSnapshot } from './lib/workspace-snapshot-capture-v1.mts';
const { values, positionals } = parseArgs({
  options: { manifest: { type: 'string' }, report: { type: 'string' }, 'digest-cache': { type: 'string' } },
  allowPositionals: true,
});
const manifest = values.manifest ?? positionals[0];
if (!manifest) throw new Error('--manifest must name the exact captured artifact');
const snapshot = JSON.parse(readFileSync(manifest, 'utf8'));
const digestCachePath = values['digest-cache'] ?? path.join(snapshot.repositoryRoot, '.tmp', 'atlas', 'workspace-digest-cache-v1.json');
const report = validateSnapshot(snapshot, { digestCachePath });
if (values.report) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { dirname, resolve } = await import('node:path');
  const reportPath = resolve(values.report);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify(report, null, 2));
if (report.violations.length) process.exitCode = 1;
