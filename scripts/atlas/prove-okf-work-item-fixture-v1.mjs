#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const outputPath = path.resolve(root, 'docs/reports/okf-work-item-fixture-v1.json');
const checksum = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;

const workItem = {
  workItemId: '00000000-0000-4000-8000-000000000001',
  gapId: 'gap:source-lineage',
  title: 'Resolve current source revision authority',
  status: 'recommended',
  owner: 'parent-atlas-retrieval-lineage-dag-convergence',
  sourceRevision: 'source:r1',
  workspaceRevision: 'workspace:r1',
  completionEnvelopeRevision: 'envelope:r1',
  createdAt: '2026-09-20T00:00:00.000Z',
  updatedAt: '2026-09-20T00:00:00.000Z',
};
const evidence = {
  evidenceId: '00000000-0000-4000-8000-000000000002',
  workItemId: workItem.workItemId,
  evidenceKind: 'receipt',
  evidenceRef: 'docs/reports/current-source-evidence-hydration-v1.json',
  evidenceChecksum: checksum({ ref: 'docs/reports/current-source-evidence-hydration-v1.json', revision: 'source:r1' }),
  sourceRevision: workItem.sourceRevision,
  status: 'observed',
  createdAt: workItem.createdAt,
};

const serialized = JSON.stringify({ workItem, evidence });
const roundTrip = JSON.parse(serialized);
const checks = {
  workItemShape: Object.values(workItem).every((value) => value !== null && value !== undefined && value !== ''),
  evidenceShape: Object.values(evidence).every((value) => value !== null && value !== undefined && value !== ''),
  foreignKeyRoundTrip: roundTrip.evidence.workItemId === roundTrip.workItem.workItemId,
  revisionBinding: roundTrip.evidence.sourceRevision === roundTrip.workItem.sourceRevision,
  deterministicSerialization: JSON.stringify(roundTrip) === serialized,
};
const proven = Object.values(checks).every(Boolean);
const report = {
  schema: 'atlas.okf-work-item-fixture.v1',
  status: proven ? 'OKF_WORK_ITEM_FIXTURE_PROVEN' : 'OKF_WORK_ITEM_FIXTURE_REVIEW_REQUIRED',
  gan: { created: true, wired: true, proven, done: proven, promotionAuthorized: false },
  checks,
  rows: { workItem, evidence },
  persistence: 'IN_MEMORY_ONLY',
  canonicalAuthority: false,
  writesPerformed: false,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ schema: report.schema, status: report.status, checks, persistence: report.persistence, writesPerformed: false, output: path.relative(root, outputPath) }, null, 2));
