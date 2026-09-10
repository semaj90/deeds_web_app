import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
// Keep the capture entrypoint bound to the maintained TypeScript implementation.
// A stale JavaScript sibling must never silently become a second snapshot owner.
import { observeSnapshot, sealSnapshot } from './lib/workspace-snapshot-capture-v1.mts';

const { values } = parseArgs({ options: { root: { type: 'string' }, 'workspace-id': { type: 'string' } } });
if (!values['workspace-id']) throw new Error('--workspace-id must be supplied; no identity is inferred');
const root = path.resolve(values.root ?? process.cwd());
const first = observeSnapshot(root, values['workspace-id']);
const report = sealSnapshot(first, observeSnapshot(root, values['workspace-id']));
const directory = path.join(root, 'docs/reports/workspace-source-snapshots');
mkdirSync(directory, { recursive: true });
const artifactPath = path.join(directory, `${report.snapshotRevision.slice(7)}.json`);
const serialized = `${JSON.stringify(report, null, 2)}\n`;
try { writeFileSync(artifactPath, serialized, { flag: 'wx' }); }
catch (error: any) { if (error.code !== 'EEXIST' || readFileSync(artifactPath, 'utf8') !== serialized) throw error; }
console.log(JSON.stringify({ status: report.status, snapshotRevision: report.snapshotRevision,
  sources: report.sources.length, repositories: report.repositories.length,
  violations: report.violations, canonicalAuthority: false, localArtifactWritten: true, artifactPath }, null, 2));
if (report.violations.length) process.exitCode = 1;
