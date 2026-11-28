#!/usr/bin/env tsx
/**
 * CURRENT-WORKSPACE-FRAME-ADMISSION-01 follow-up (parent-atlas-gate2-chunk-lineage-convergence,
 * task group 1). Read-only: validates the freshly-sealed snapshot's byte readback and records
 * the result. Does not seal (capture-workspace-source-snapshot-v1.mts already does that and is
 * reused, not duplicated) and does not admit.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { validateSnapshot } from './lib/workspace-snapshot-capture-v1.mts';

const { values } = parseArgs({ options: {
  root: { type: 'string' },
  snapshot: { type: 'string' },
  report: { type: 'string' },
  'source-read-root': { type: 'string' },
} });
if (!values.snapshot) throw new Error('--snapshot <path> must be supplied');
const root = path.resolve(values.root ?? process.cwd());
const snapshotPath = path.resolve(root, values.snapshot);
const outPath = path.resolve(root, values.report ?? 'docs/reports/workspace-snapshot-reseal-v1.json');
const relativeOutput = path.relative(root, outPath);
if (!relativeOutput || relativeOutput === '..' || relativeOutput.startsWith(`..${path.sep}`) || path.isAbsolute(relativeOutput)) {
  throw new Error('--report must resolve inside --root');
}
if (values['source-read-root'] && !relativeOutput.startsWith(`.tmp${path.sep}`)) {
  throw new Error('--source-read-root requires --report under .tmp');
}
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const sourceReadRoot = values['source-read-root'] ? path.resolve(root, values['source-read-root']) : undefined;
const readback = validateSnapshot(snapshot, { sourceReadRoot });
const exactReadback = readback.status === 'SNAPSHOT_BYTES_READBACK_PROVEN';

const report = {
  schema: 'atlas.workspace-snapshot-reseal.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  snapshotPath: path.relative(root, snapshotPath).split(path.sep).join('/'),
  ...(sourceReadRoot ? { sourceReadRoot, canonicalAuthority: false } : {}),
  snapshotRevision: snapshot.snapshotRevision,
  sourceCount: readback.sourceCount,
  exactMatches: readback.exactMatches,
  violationCounts: readback.violationCounts,
  totalViolations: readback.violations.length,
  readbackStatus: readback.status,
  writesPerformed: false,
  status: sourceReadRoot
    ? (exactReadback ? 'ALTERNATE_SOURCE_READBACK_MATCHED' : 'ALTERNATE_SOURCE_READBACK_BLOCKED')
    : (exactReadback ? 'RESEAL_READBACK_PROVEN' : 'RESEAL_READBACK_BLOCKED'),
};

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
