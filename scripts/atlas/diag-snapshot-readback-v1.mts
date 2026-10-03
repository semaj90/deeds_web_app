#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateSnapshot } from './lib/workspace-snapshot-capture-v1.mts';

const snapshotPath = resolve('docs/reports/workspace-source-snapshots/6288726b73626ae58905b5ebdea42e709cb1af67b3e16186bcd8b2b88a89d98b.json');
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const readback = validateSnapshot(snapshot);
const out = {
  status: readback.status,
  sourceCount: readback.sourceCount,
  exactMatches: readback.exactMatches,
  violationCounts: readback.violationCounts,
  totalViolations: readback.violations.length,
  sampleViolations: readback.violationDetails.slice(0, 15),
};
writeFileSync('scripts/atlas/diag-snapshot-readback-v1.output.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
