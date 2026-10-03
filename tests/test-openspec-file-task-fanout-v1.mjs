#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reportPath = 'docs/reports/openspec-file-task-fanout-v1.json';
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

assert.equal(report.schema, 'atlas.openspec-file-task-fanout.v1');
assert.ok(report.summary.linkedTaskFileReferences > 0);
assert.ok(report.summary.inventoryExcludedReferences > 0);
assert.ok(report.summary.unresolvedReferencesNotProvenPresent >= 0);
assert.equal(report.summary.genuinelyUnresolvedReferences, undefined);
assert.equal(report.policy.unresolvedDoesNotProveRepositoryAbsence, true);
assert.equal(report.policy.indexedInventoryIsNotACompleteRepositoryManifest, true);

const scopedTaskRef = report.inventoryExcluded.find((row) =>
  row.file.startsWith('openspec/changes/') && row.file.endsWith('/tasks.md'),
);
assert.ok(scopedTaskRef, 'change-local tasks.md references should resolve to their owning change');

for (const row of report.unresolved) {
  assert.ok(Array.isArray(row.reasons));
  assert.ok(row.reasons.includes('NOT_IN_INDEXED_INVENTORY_OR_UNSCOPED_REFERENCE') || row.reasons.includes('AMBIGUOUS_REPOSITORY_BASENAME'));
}

console.log('openspec-file-task-fanout-v1: PASS');
