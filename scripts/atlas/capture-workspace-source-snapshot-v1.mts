import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
// Keep the capture entrypoint bound to the maintained TypeScript implementation.
// A stale JavaScript sibling must never silently become a second snapshot owner.
import { captureStableSnapshot } from './lib/workspace-snapshot-capture-v1.mts';

const { values } = parseArgs({ options: { root: { type: 'string' }, 'workspace-id': { type: 'string' }, 'no-digest-cache': { type: 'boolean' }, output: { type: 'string' } } });
if (!values['workspace-id']) throw new Error('--workspace-id must be supplied; no identity is inferred');
const root = path.resolve(values.root ?? process.cwd());
// Derived per-file digest cache (never authority); --no-digest-cache forces a full byte read.
const digestCachePath = values['no-digest-cache'] ? undefined : path.join(root, '.tmp', 'atlas', 'workspace-digest-cache-v1.json');
const startedAt = Date.now();
let scanStats: Array<{ reused: number; rehashed: number }> = [];
const report = captureStableSnapshot(root, values['workspace-id'], { maxAttempts: 3, digestCachePath, onDigestStats: (s) => { scanStats = s; } });
console.error(JSON.stringify({ captureMs: Date.now() - startedAt, digestCache: digestCachePath ? 'ON' : 'OFF', scans: scanStats }));
const defaultArtifactPath = path.join(root, 'docs/reports/workspace-source-snapshots', `${report.snapshotRevision.slice(7)}.json`);
const artifactPath = values.output ? path.resolve(root, values.output) : defaultArtifactPath;
const relativeArtifactPath = path.relative(root, artifactPath);
if (relativeArtifactPath === '..' || relativeArtifactPath.startsWith(`..${path.sep}`) || path.isAbsolute(relativeArtifactPath)) {
  throw new Error('--output must resolve inside --root');
}
mkdirSync(path.dirname(artifactPath), { recursive: true });
const serialized = `${JSON.stringify(report, null, 2)}\n`;
try { writeFileSync(artifactPath, serialized, { flag: 'wx' }); }
catch (error: any) { if (error.code !== 'EEXIST' || readFileSync(artifactPath, 'utf8') !== serialized) throw error; }
console.log(JSON.stringify({ status: report.status, snapshotRevision: report.snapshotRevision,
  sources: report.sources.length, repositories: report.repositories.length,
  violations: report.violations, canonicalAuthority: false, localArtifactWritten: true, artifactPath }, null, 2));
if (report.violations.length) process.exitCode = 1;
