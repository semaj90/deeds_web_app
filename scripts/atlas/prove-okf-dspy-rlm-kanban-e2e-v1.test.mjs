import test from 'node:test';
import assert from 'node:assert/strict';
import { runOkfDspyRlmKanbanE2eProof } from './prove-okf-dspy-rlm-kanban-e2e-v1.mjs';

test('CONTEXT-01, ORNITH-01 & TASK-E2E-01: .okf + DSPy + RLM 4-turn sequential rehearsal and 5-task canary pass with 4 adversarial probes', async () => {
  const report = await runOkfDspyRlmKanbanE2eProof();

  assert.equal(report.status, 'PASS');
  assert.equal(report.canonicalAuthority, false);
  assert.equal(report.writesPerformed, false);
  assert.ok(report.okfCorpusSummary.verifiedChunksTotal >= 100);
  assert.equal(report.okfCorpusSummary.checksumMismatches, 0);
  assert.equal(report.okfCorpusSummary.canonicalAuthorityTrueCount, 0);

  const turns = report.primaryTaskContextAndPromptPlan.sequentialTurns;
  assert.equal(turns.length, 4);
  assert.deepEqual(
    turns.map((t) => t.role),
    ['PLANNER', 'RETRIEVAL_HELPER', 'PATCH_PROPOSER', 'INDEPENDENT_VERIFIER']
  );

  assert.equal(report.fiveTaskCanaryExecutionRehearsal.canaryTasksCompletedInTx, 5);
  assert.equal(report.fiveTaskCanaryExecutionRehearsal.zeroPersistentMutation, true);
  for (const traj of report.fiveTaskCanaryExecutionRehearsal.trajectories) {
    assert.equal(traj.rlReward.rewardEligible, true);
    assert.ok(traj.rlReward.reward > 0.8);
  }

  assert.equal(report.adversarialProbes.adv_01_unverified_turn4_blocks_completion.passed, true);
  assert.equal(report.adversarialProbes.adv_02_hallucinated_okf_citation_rejected.passed, true);
  assert.equal(report.adversarialProbes.adv_03_token_budget_overflow_rejected.passed, true);
  assert.equal(
    report.adversarialProbes.adv_04_workspace_revision_drift_invalidates_rl_reward.passed,
    true
  );
});
