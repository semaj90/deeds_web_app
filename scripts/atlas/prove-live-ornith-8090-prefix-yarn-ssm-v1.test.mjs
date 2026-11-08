import test from 'node:test';
import assert from 'node:assert/strict';
import { runLiveOrnithAndGovernanceAudit } from './prove-live-ornith-8090-prefix-yarn-ssm-v1.mjs';

test('Ornith 8090 live prefix-cache/CLI audit, 13,619 vs 13,655 workboard reconciliation, and 300-example/Valkey admission gates pass', async () => {
  const report = await runLiveOrnithAndGovernanceAudit();

  assert.equal(report.status, 'PASS');
  assert.equal(report.canonicalAuthority, false);
  assert.equal(report.writesPerformed, false);
  assert.equal(report.serviceRestarted, false);

  // 13,619 vs 13,655 reconciliation (now exact 0 discrepancy across all 5 disjoint open buckets)
  const wb = report.workboard13619Vs13655Reconciliation;
  assert.equal(wb.totalTasks, 13619);
  assert.equal(wb.completedTasks + wb.openTasks, 13619);
  assert.equal(wb.openSubcategories.openSubcategorySum, 5605);
  assert.equal(wb.disjointPortfolioSum, 13619);
  assert.equal(wb.discrepancyDelta, 0);

  // Valkey centroid & 300-example (10 * 30) threshold
  const adm = report.valkeyCentroidAndAutoencoderAdmission;
  assert.equal(adm.centroidContractVerified, true);
  assert.equal(adm.negativeGates.notSafeToProjectBlocked, true);
  assert.equal(adm.negativeGates.unadmittedWorkspaceBlocked, true);
  assert.equal(
    adm.domainClassifierAndAutoencoderAdmissionGate.requiredMinimumReviewedGoldExamples,
    300
  );
  assert.equal(adm.domainClassifierAndAutoencoderAdmissionGate.trainingAuthorityProven, false);
});
