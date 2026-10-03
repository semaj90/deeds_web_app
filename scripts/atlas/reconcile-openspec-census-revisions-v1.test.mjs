import test from 'node:test';
import assert from 'node:assert/strict';

import { reconcileOpenSpecCensusRevisionsV1 } from './reconcile-openspec-census-revisions-v1.mjs';

test('preserves baseline objective counts and labels strict diagnostic deltas', () => {
  const report = reconcileOpenSpecCensusRevisionsV1({
    baseline: {
      schema: 'atlas.openspec-evidence-portfolio-census.v1',
      summary: {
        totalChanges: 1,
        totalTasks: 2,
        checkedTasks: 1,
        checkedWithEvidence: 0,
        orphanReceiptCount: 3,
        taskIdMissing: 1,
        duplicateTaskIds: 2,
        dependencyCycleCount: 0,
      },
    },
    census: {
      schema: 'atlas.openspec-evidence-portfolio-census.v2',
      source: { workspaceRevision: 'sha256:workspace' },
      summary: { totalChanges: 1, totalTasks: 2, checkedTasks: 1, checkedWithEvidence: 0, taskIdMissing: 2, duplicateTaskIds: 4, dependencyCycleCount: 0 },
    },
    identity: { summary: { identityStateCounts: { AMBIGUOUS: 1, CONFLICTING: 0 }, canonicalKeyCoverageCount: 2, canonicalKeyAdmittedCount: 1, canonicalKeyCollisionGroupCount: 1, duplicateDiagnosticGroupCount: 1, duplicateClassCounts: {} } },
    typeReport: { summary: { receiptCount: 3, schemaOrFieldTypedCount: 1, candidateTypeCount: 1, unknownCount: 1 } },
    orphan: { summary: { missingTaskCount: 2, trueOrphanCount: 1, ambiguousCount: 0, staleRevisionCount: 0 } },
    predicates: { summary: { blockedTaskCount: 0, proofStateCounts: { PROVEN: 0 } } },
    source: { censusPath: 'docs/reports/openspec-evidence/test/census-v1.json' },
  });

  assert.deepEqual(report.baselineParity, { changes: true, tasks: true, checked: true, dependencyCycles: true });
  assert.equal(report.deltas.tasks, 0);
  assert.equal(report.diagnosticDeltas.duplicateIds, 2);
  assert.equal(report.comparability.duplicateIds, 'BASELINE_GROUP_COUNT_VS_STRICT_PAIR_COUNT');
  assert.equal(report.strictCurrent.duplicateDiagnosticGroups, 1);
});
