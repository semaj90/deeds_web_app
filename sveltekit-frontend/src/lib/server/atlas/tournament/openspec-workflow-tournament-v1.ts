import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  type SynthesizedWorkflowDagV1,
  SynthesizedWorkflowDagV1Schema,
} from '../workflow/workflow-synthesis-v1.js';

export const TOURNAMENT_WINNER_RECEIPT_SCHEMA = 'atlas.tournament-winner-receipt.v1' as const;

export const EvaluationStageResultV1Schema = z
  .object({
    typecheck: z.object({
      pass: z.boolean(),
      diagnosticsCount: z.number().int().nonnegative(),
    }),
    unitTests: z.object({
      pass: z.boolean(),
      passedTests: z.number().int().nonnegative(),
      failedTests: z.number().int().nonnegative(),
      suiteReceiptRef: z.string().optional(),
    }),
    graphEvidence: z.object({
      pass: z.boolean(),
      unresolvedNodesCount: z.number().int().nonnegative(),
    }),
    resourceUsage: z.object({
      durationMs: z.number().nonnegative(),
      peakMemoryMb: z.number().nonnegative().optional(),
    }),
  })
  .strict();
export type EvaluationStageResultV1 = z.infer<typeof EvaluationStageResultV1Schema>;

export const CandidateEvaluationOutcomeV1Schema = z
  .object({
    candidateId: z.string().min(1),
    agentId: z.string().min(1),
    status: z.enum(['ELIGIBLE', 'REJECTED']),
    rejectionReason: z.string().nullable(),
    compositeScore: z.number().finite(),
    stages: EvaluationStageResultV1Schema,
  })
  .strict();
export type CandidateEvaluationOutcomeV1 = z.infer<typeof CandidateEvaluationOutcomeV1Schema>;

export const TournamentWinnerReceiptV1Schema = z
  .object({
    schema: z.literal(TOURNAMENT_WINNER_RECEIPT_SCHEMA),
    tournamentId: z.string().min(1),
    receiptChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    taskGoal: z.string().min(1),
    workspaceRevision: z.string().min(1),
    winnerCandidateId: z.string().min(1),
    winnerPatchDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    winnerEvaluation: EvaluationStageResultV1Schema,
    evaluatedCandidates: z.array(CandidateEvaluationOutcomeV1Schema).min(1),
    reviewStatus: z.enum(['PENDING_APPROVAL', 'APPROVED', 'REJECTED']),
    approvedBy: z.string().nullable(),
    rollbackSnapshotRevision: z.string().min(1),
    canPromote: z.boolean(),
    // Invariants
    writesPerformed: z.literal(false),
    canonicalStoreMutated: z.literal(false),
  })
  .strict();
export type TournamentWinnerReceiptV1 = z.infer<typeof TournamentWinnerReceiptV1Schema>;

export interface TournamentCandidateProposalV1 {
  candidateId: string;
  agentId: string;
  dag: SynthesizedWorkflowDagV1;
  patchDigest: string; // sha256:<64hex>
  toolVersions: Record<string, string>;
  stages: EvaluationStageResultV1;
}

export interface RunWorkflowTournamentInputV1 {
  tournamentId: string;
  taskGoal: string;
  workspaceRevision: string;
  rollbackSnapshotRevision: string;
  candidates: readonly TournamentCandidateProposalV1[];
  approvalDecision?: {
    approved: boolean;
    approvedBy: string;
  };
}

/**
 * OPSX-01: OpenSpec Workflow Tournament.
 * Evaluates competing repair candidates against identical source snapshots, tasks,
 * resource limits, and test suites (Typecheck, Unit tests, Graph evidence).
 * The winning candidate must generate an immutable, reviewable receipt.
 */
export function runOpenSpecWorkflowTournamentV1(
  input: RunWorkflowTournamentInputV1
): TournamentWinnerReceiptV1 {
  if (input.candidates.length === 0) {
    throw new Error('TOURNAMENT_CANDIDATES_EMPTY: at least 1 candidate proposal required');
  }

  // 1. Evaluate each candidate against hard gates
  const outcomes: CandidateEvaluationOutcomeV1[] = [];

  for (const c of input.candidates) {
    // Validate proposal DAG
    SynthesizedWorkflowDagV1Schema.parse(c.dag);

    // Hard gate checks: Typecheck must pass, Unit tests must pass, Graph evidence must pass
    let status: 'ELIGIBLE' | 'REJECTED' = 'ELIGIBLE';
    let rejectionReason: string | null = null;

    if (!c.stages.typecheck.pass) {
      status = 'REJECTED';
      rejectionReason = `Typecheck failed with ${c.stages.typecheck.diagnosticsCount} diagnostics`;
    } else if (!c.stages.unitTests.pass) {
      status = 'REJECTED';
      rejectionReason = `Unit tests failed with ${c.stages.unitTests.failedTests} failing tests`;
    } else if (!c.stages.graphEvidence.pass) {
      status = 'REJECTED';
      rejectionReason = `Graph evidence rejected: ${c.stages.graphEvidence.unresolvedNodesCount} unresolved nodes`;
    }

    // Composite scoring for eligible candidates:
    // Rewards passed tests and faster execution duration
    let compositeScore = 0;
    if (status === 'ELIGIBLE') {
      const testReward = c.stages.unitTests.passedTests * 10;
      const speedPenalty = Math.min(c.stages.resourceUsage.durationMs / 1000, 10);
      compositeScore = Number((testReward - speedPenalty).toFixed(4));
    }

    outcomes.push({
      candidateId: c.candidateId,
      agentId: c.agentId,
      status,
      rejectionReason,
      compositeScore,
      stages: c.stages,
    });
  }

  // 2. Select winner: among ELIGIBLE candidates, highest compositeScore
  const eligible = outcomes.filter((o) => o.status === 'ELIGIBLE');
  if (eligible.length === 0) {
    throw new Error('NO_ELIGIBLE_TOURNAMENT_WINNER: all candidates failed hard gates');
  }

  eligible.sort((a, b) => b.compositeScore - a.compositeScore);
  const winningOutcome = eligible[0];
  const winningProposal = input.candidates.find((c) => c.candidateId === winningOutcome.candidateId)!;

  // 3. Review approval state
  const isApproved = input.approvalDecision?.approved === true;
  const reviewStatus = isApproved ? 'APPROVED' : 'PENDING_APPROVAL';
  const approvedBy = isApproved ? input.approvalDecision!.approvedBy : null;

  // Promotion is authorized ONLY if approved and all 3 hard verification gates passed
  const canPromote =
    isApproved &&
    winningOutcome.stages.typecheck.pass &&
    winningOutcome.stages.unitTests.pass &&
    winningOutcome.stages.graphEvidence.pass;

  // 4. Compute immutable tournament receipt checksum
  const payloadToHash = JSON.stringify({
    tournamentId: input.tournamentId,
    workspaceRevision: input.workspaceRevision,
    winnerCandidateId: winningOutcome.candidateId,
    winnerPatchDigest: winningProposal.patchDigest,
    outcomes: outcomes.map((o) => ({ id: o.candidateId, status: o.status, score: o.compositeScore })),
    reviewStatus,
    rollbackSnapshotRevision: input.rollbackSnapshotRevision,
  });
  const hash = createHash('sha256').update(payloadToHash, 'utf8').digest('hex');
  const receiptChecksum = `sha256:${hash}`;

  return TournamentWinnerReceiptV1Schema.parse({
    schema: TOURNAMENT_WINNER_RECEIPT_SCHEMA,
    tournamentId: input.tournamentId,
    receiptChecksum,
    taskGoal: input.taskGoal,
    workspaceRevision: input.workspaceRevision,
    winnerCandidateId: winningOutcome.candidateId,
    winnerPatchDigest: winningProposal.patchDigest,
    winnerEvaluation: winningOutcome.stages,
    evaluatedCandidates: outcomes,
    reviewStatus,
    approvedBy,
    rollbackSnapshotRevision: input.rollbackSnapshotRevision,
    canPromote,
    writesPerformed: false,
    canonicalStoreMutated: false,
  });
}
