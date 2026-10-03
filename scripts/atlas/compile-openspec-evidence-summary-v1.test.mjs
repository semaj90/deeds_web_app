import assert from 'node:assert/strict';
import test from 'node:test';

import { compileOpenSpecEvidenceSummaryV1 } from './compile-openspec-evidence-summary-v1.mjs';

test('keeps missing declared IDs separate from unresolved canonical identities', () => {
  const report = compileOpenSpecEvidenceSummaryV1(
    {
      schema: 'atlas.openspec-evidence-portfolio-census.v2',
      source: { workspaceRevision: 'sha256:workspace', workspaceRevisionScope: 'OpenSpec change artifacts' },
      summary: { totalChanges: 2, totalTasks: 4, checkedTasks: 2, checkedWithEvidence: 0, uncheckedButProven: 0, checkedWithoutEvidence: 2, taskIdMissing: 3, receipts_total: 1, dependencyChangeLevelReferenceCount: 1 },
      dependencyCycles: [],
      checksum: 'sha256:census',
    },
    { summary: { taskCount: 4, canonicalKeyAdmittedCount: 3, canonicalKeyCoverageCount: 4, identityStateCounts: { CONFLICTING: 1 } }, checksum: 'sha256:identity' },
    { summary: {}, checksum: 'sha256:types' },
    { summary: {}, checksum: 'sha256:bindings' },
  );

  assert.equal(report.counts.declaredIdMissing, 3);
  assert.equal(report.counts.unstableIdentity, 1);
  assert.equal(report.workspaceRevisionScope, 'OpenSpec change artifacts');
  assert.equal(report.dependencies.changeLevelReferences, 1);
});
