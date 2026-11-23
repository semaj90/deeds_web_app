import assert from 'node:assert/strict';
import test from 'node:test';
import { routeRlmPromptsToErrorFixingV1 } from './route-rlm-prompts-to-error-fixing-v1.mjs';

test('routes RLM prompt packets across ACP/A2A lane phases without mutating state', () => {
  const res = routeRlmPromptsToErrorFixingV1([
    {
      idempotencyKey: 'k1',
      taskId: 'T1',
      sourceRef: 'a.ts',
      sourceSha256: `sha256:${'a'.repeat(64)}`,
      proposedDomains: ['graph'],
      boundedContextPrompt: 'Verify STALE_SOURCE_REVISION on graph',
    },
    {
      idempotencyKey: 'k2',
      taskId: 'T2',
      sourceRef: 'b.ts',
      sourceSha256: `sha256:${'b'.repeat(64)}`,
      proposedDomains: ['database.postgresql'],
      boundedContextPrompt: 'Inspect postgres table',
    },
    {
      idempotencyKey: 'k3',
      taskId: 'T3',
      sourceRef: 'c.ts',
      sourceSha256: `sha256:${'c'.repeat(64)}`,
      proposedDomains: ['retrieval'],
      boundedContextPrompt: 'Eval topk retrieval',
    },
    {
      idempotencyKey: 'k4',
      taskId: 'T4',
      sourceRef: 'd.ts',
      sourceSha256: `sha256:${'d'.repeat(64)}`,
      proposedDomains: ['compiler'],
      boundedContextPrompt: 'Run svelte-check',
    },
  ]);

  assert.equal(res.totalRouted, 4);
  assert.equal(res.routed[0].lanePhase, 'PHASE_1_INTAKE_AND_STALENESS_GATE');
  assert.equal(res.routed[0].blockedByStaleness, true);
  assert.equal(res.routed[1].lanePhase, 'PHASE_5_HUMAN_GATED_PROMOTION');
  assert.equal(res.routed[2].lanePhase, 'PHASE_2_STRUCTURAL_AND_LINEAGE_RETRIEVAL');
  assert.equal(res.routed[3].lanePhase, 'PHASE_3_ACP_A2A_PROPOSAL_AND_CONTEXT_MANIFEST');
  assert.equal(res.canonicalAuthority, false);
  assert.equal(res.writesPerformed, false);
});
