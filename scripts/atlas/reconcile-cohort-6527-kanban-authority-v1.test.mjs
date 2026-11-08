import test from 'node:test';
import assert from 'node:assert/strict';
import { runKanbanAuthorityReconciliation } from './reconcile-cohort-6527-kanban-authority-v1.mjs';

test('KANBAN-01 & KANBAN-02: 6,527 cohort authority bridge reconciles with public.kanban_tasks and passes 4 adversarial probes in ROLLBACK rehearsal', async () => {
  const report = await runKanbanAuthorityReconciliation();

  assert.equal(report.status, 'PASS');
  assert.equal(report.canonicalAuthority, false);
  assert.equal(report.writesPerformed, false);
  assert.equal(report.cohortAuthorityJoin.cohortOrdinalsTotal, 6527);
  assert.equal(report.cohortAuthorityJoin.uniqueCanonicalTaskKeys, 6527);
  assert.equal(report.cohortAuthorityJoin.syntheticTaskOrdinalIds, 0);
  assert.equal(
    report.cohortAuthorityJoin.matchedInLiveKanbanTasks +
      report.cohortAuthorityJoin.unseededSecondaryOrNewTasks,
    6527
  );
  assert.ok(
    report.cohortAuthorityJoin.matchedInLiveKanbanTasks >= 4300,
    `Expected >= 4300 cohort tasks matched in live public.kanban_tasks, got ${report.cohortAuthorityJoin.matchedInLiveKanbanTasks}`
  );
  assert.ok(
    report.cohortAuthorityJoin.readyActionableZeroUnmetDeps > 0,
    'Expected at least 1 dependency-ready actionable task in public.kanban_tasks'
  );
  assert.equal(report.transactionalRehearsal.zeroPersistentMutation, true);
  assert.equal(report.adversarialProbes.adv_01_synthetic_ordinal_rejected.passed, true);
  assert.equal(report.adversarialProbes.adv_02_canonical_authority_true_rejected.passed, true);
  assert.equal(report.adversarialProbes.adv_03_duplicate_concurrent_claim_rejected.passed, true);
  assert.equal(report.adversarialProbes.adv_04_expired_lease_reclaim_and_event_correlation.passed, true);
});
