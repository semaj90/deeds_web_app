import { describe, expect, it } from 'vitest';
import {
  type TournamentCandidateProposalV1,
  runOpenSpecWorkflowTournamentV1,
} from './openspec-workflow-tournament-v1.js';
import { authorizeTournamentPromotionV1 } from './openspec-promotion-gate-v1.js';
import type { SynthesizedWorkflowDagV1 } from '../workflow/workflow-synthesis-v1.js';

describe('OPSX-01 & PROMOTE-01: OpenSpec Workflow Tournament & Promotion Gate', () => {
  const dummySha = 'sha256:' + 'a'.repeat(64);
  const patchShaA = 'sha256:' + '1'.repeat(64);
  const patchShaB = 'sha256:' + '2'.repeat(64);
  const patchShaC = 'sha256:' + '3'.repeat(64);
  const workspaceRevision = 'sha256:' + 'b'.repeat(64);
  const rollbackSnapshotRevision = 'sha256:' + '0'.repeat(64);

  const mockDag: SynthesizedWorkflowDagV1 = {
    schema: 'atlas.synthesized-workflow-dag.v1',
    dagId: 'dag_mock_001',
    dagChecksum: dummySha,
    taskGoal: 'Repair deed validation function',
    rankedReceiptId: 'rec_mock',
    rankedReceiptChecksum: dummySha,
    workspaceRevision,
    actions: [],
    topologicalOrder: [],
    requiredPermissions: ['READ_ONLY', 'EXECUTE_TESTS'],
    writesPerformed: false,
    canonicalAuthority: false,
  };

  // Three competing agents from user prompt:
  // Agent A: Typecheck Pass, Unit tests Pass, Graph evidence Pass -> Eligible
  // Agent B: Typecheck Pass, Unit tests Pass, Graph evidence Pass -> Eligible (slower)
  // Agent C: Typecheck Pass, Unit tests Pass, Graph evidence Reject -> Rejected
  const candidateA: TournamentCandidateProposalV1 = {
    candidateId: 'candidate_agent_a',
    agentId: 'agent-atlas-codegen',
    dag: mockDag,
    patchDigest: patchShaA,
    toolVersions: { 'web-tree-sitter': '0.22.6', vitest: '3.2.7' },
    stages: {
      typecheck: { pass: true, diagnosticsCount: 0 },
      unitTests: { pass: true, passedTests: 12, failedTests: 0, suiteReceiptRef: 'vitest:run_101' },
      graphEvidence: { pass: true, unresolvedNodesCount: 0 },
      resourceUsage: { durationMs: 450, peakMemoryMb: 64 },
    },
  };

  const candidateB: TournamentCandidateProposalV1 = {
    candidateId: 'candidate_agent_b',
    agentId: 'agent-orion-patcher',
    dag: mockDag,
    patchDigest: patchShaB,
    toolVersions: { 'web-tree-sitter': '0.22.6', vitest: '3.2.7' },
    stages: {
      typecheck: { pass: true, diagnosticsCount: 0 },
      unitTests: { pass: true, passedTests: 10, failedTests: 0, suiteReceiptRef: 'vitest:run_102' },
      graphEvidence: { pass: true, unresolvedNodesCount: 0 },
      resourceUsage: { durationMs: 1200, peakMemoryMb: 110 }, // Slower and fewer tests
    },
  };

  const candidateC: TournamentCandidateProposalV1 = {
    candidateId: 'candidate_agent_c',
    agentId: 'agent-experimental-mutator',
    dag: mockDag,
    patchDigest: patchShaC,
    toolVersions: { 'web-tree-sitter': '0.22.6', vitest: '3.2.7' },
    stages: {
      typecheck: { pass: true, diagnosticsCount: 0 },
      unitTests: { pass: true, passedTests: 8, failedTests: 0 },
      graphEvidence: { pass: false, unresolvedNodesCount: 3 }, // Rejected by graph evidence!
      resourceUsage: { durationMs: 300 },
    },
  };

  it('Scenario OPSX-01: runs 3-agent tournament, filters candidate C on graph rejection, and selects candidate A as winner', () => {
    const tournamentReceipt = runOpenSpecWorkflowTournamentV1({
      tournamentId: 'tourn_20261017_001',
      taskGoal: 'Repair deed validation function',
      workspaceRevision,
      rollbackSnapshotRevision,
      candidates: [candidateA, candidateB, candidateC],
    });

    expect(tournamentReceipt.schema).toBe('atlas.tournament-winner-receipt.v1');
    expect(tournamentReceipt.evaluatedCandidates.length).toBe(3);

    // Check status of each candidate
    const outcomeA = tournamentReceipt.evaluatedCandidates.find((c) => c.candidateId === 'candidate_agent_a')!;
    const outcomeB = tournamentReceipt.evaluatedCandidates.find((c) => c.candidateId === 'candidate_agent_b')!;
    const outcomeC = tournamentReceipt.evaluatedCandidates.find((c) => c.candidateId === 'candidate_agent_c')!;

    expect(outcomeA.status).toBe('ELIGIBLE');
    expect(outcomeB.status).toBe('ELIGIBLE');
    expect(outcomeC.status).toBe('REJECTED');
    expect(outcomeC.rejectionReason).toContain('Graph evidence rejected');

    // Candidate A wins because it passed more tests with lower runtime
    expect(tournamentReceipt.winnerCandidateId).toBe('candidate_agent_a');
    expect(tournamentReceipt.winnerPatchDigest).toBe(patchShaA);

    // Initial state is PENDING_APPROVAL
    expect(tournamentReceipt.reviewStatus).toBe('PENDING_APPROVAL');
    expect(tournamentReceipt.canPromote).toBe(false);
  });

  it('Scenario PROMOTE-01: enforces operator approval and validates reindex scope without ranker retraining', () => {
    // 1. Run tournament with operator approval
    const tournamentReceiptApproved = runOpenSpecWorkflowTournamentV1({
      tournamentId: 'tourn_20261017_002',
      taskGoal: 'Repair deed validation function',
      workspaceRevision,
      rollbackSnapshotRevision,
      candidates: [candidateA, candidateB, candidateC],
      approvalDecision: {
        approved: true,
        approvedBy: 'operator:james',
      },
    });

    expect(tournamentReceiptApproved.reviewStatus).toBe('APPROVED');
    expect(tournamentReceiptApproved.approvedBy).toBe('operator:james');
    expect(tournamentReceiptApproved.canPromote).toBe(true);

    // 2. Authorize promotion through the promotion gate
    const promotionResult = authorizeTournamentPromotionV1({
      tournamentReceipt: tournamentReceiptApproved,
      appliedWorkspaceRevision: 'sha256:' + '9'.repeat(64),
      promotedAt: '2026-10-17T01:50:00.000Z',
    });

    expect(promotionResult.decision).toBe('ACCEPT');
    if (promotionResult.decision !== 'ACCEPT') return;

    expect(promotionResult.receipt.schema).toBe('atlas.promotion-execution-receipt.v1');
    expect(promotionResult.receipt.promotedCandidateId).toBe('candidate_agent_a');
    expect(promotionResult.receipt.rollbackSnapshotRevision).toBe(rollbackSnapshotRevision);
    expect(promotionResult.receipt.rollbackSafe).toBe(true);

    // Critical invariant: AST, Graph, and Embedding reindexing required, but ranker retraining is FALSE
    expect(promotionResult.receipt.reindexScope).toEqual({
      ast: true,
      graph: true,
      embedding: true,
      rankerRetrainRequired: false,
    });

    expect(promotionResult.receipt.writesPerformed).toBe(false);
    expect(promotionResult.receipt.canonicalAuthority).toBe(false);
  });

  it('rejects promotion if tournament receipt is unapproved', () => {
    const unapprovedReceipt = runOpenSpecWorkflowTournamentV1({
      tournamentId: 'tourn_20261017_003',
      taskGoal: 'Repair deed validation function',
      workspaceRevision,
      rollbackSnapshotRevision,
      candidates: [candidateA, candidateB],
    });

    const promotionResult = authorizeTournamentPromotionV1({
      tournamentReceipt: unapprovedReceipt,
      appliedWorkspaceRevision: 'sha256:' + '9'.repeat(64),
    });

    expect(promotionResult.decision).toBe('REJECT');
    if (promotionResult.decision === 'REJECT') {
      expect(promotionResult.rejectionReason).toBe('REVIEW_APPROVAL_REQUIRED');
    }
  });
});
