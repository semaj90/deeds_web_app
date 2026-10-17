import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  type TournamentWinnerReceiptV1,
  TournamentWinnerReceiptV1Schema,
} from './openspec-workflow-tournament-v1.js';

export const PROMOTION_EXECUTION_RECEIPT_SCHEMA = 'atlas.promotion-execution-receipt.v1' as const;

export const ReindexScopeV1Schema = z
  .object({
    ast: z.literal(true),
    graph: z.literal(true),
    embedding: z.literal(true),
    // Critical architectural invariant: Source edits never force ML ranker retraining
    rankerRetrainRequired: z.literal(false),
  })
  .strict();
export type ReindexScopeV1 = z.infer<typeof ReindexScopeV1Schema>;

export const PromotionExecutionReceiptV1Schema = z
  .object({
    schema: z.literal(PROMOTION_EXECUTION_RECEIPT_SCHEMA),
    promotionId: z.string().min(1),
    promotionChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    tournamentReceiptChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    promotedCandidateId: z.string().min(1),
    promotedPatchDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    appliedWorkspaceRevision: z.string().min(1),
    rollbackSnapshotRevision: z.string().min(1),
    reindexScope: ReindexScopeV1Schema,
    approvedBy: z.string().min(1),
    promotedAt: z.string().datetime(),
    rollbackSafe: z.literal(true),
    writesPerformed: z.literal(false),
    canonicalAuthority: z.literal(false),
  })
  .strict();
export type PromotionExecutionReceiptV1 = z.infer<typeof PromotionExecutionReceiptV1Schema>;

export type PromotionGateRejectionReason =
  | 'PROMOTION_NOT_AUTHORIZED'
  | 'REVIEW_APPROVAL_REQUIRED'
  | 'MISSING_ROLLBACK_SNAPSHOT'
  | 'UNVERIFIED_EVALUATION';

export type PromotionGateResultV1 =
  | {
      decision: 'ACCEPT';
      receipt: PromotionExecutionReceiptV1;
    }
  | {
      decision: 'REJECT';
      rejectionReason: PromotionGateRejectionReason;
      message: string;
    };

/**
 * PROMOTE-01: Reviewed Change, Reindex, Checksum, and Rollback Proof Gate.
 * Enforces that only an approved tournament winner passing Typecheck, Unit tests,
 * and Graph evidence can be scheduled for promotion.
 *
 * Separates repository reindexing (AST, Graph, Embedding = true) from model retraining
 * (rankerRetrainRequired = false), ensuring production indexing does not block on ML loops.
 */
export function authorizeTournamentPromotionV1(input: {
  tournamentReceipt: TournamentWinnerReceiptV1;
  appliedWorkspaceRevision: string;
  promotedAt?: string;
}): PromotionGateResultV1 {
  const tReceipt = TournamentWinnerReceiptV1Schema.parse(input.tournamentReceipt);
  const now = input.promotedAt ?? new Date().toISOString();

  // 1. Review approval gate
  if (tReceipt.reviewStatus !== 'APPROVED' || !tReceipt.approvedBy) {
    return {
      decision: 'REJECT',
      rejectionReason: 'REVIEW_APPROVAL_REQUIRED',
      message: `Tournament receipt status is '${tReceipt.reviewStatus}'; explicit operator approval is required`,
    };
  }

  // 2. Can-promote gate
  if (!tReceipt.canPromote) {
    return {
      decision: 'REJECT',
      rejectionReason: 'PROMOTION_NOT_AUTHORIZED',
      message: 'Tournament winner does not satisfy all verification requirements for promotion',
    };
  }

  // 3. Rollback snapshot gate
  if (!tReceipt.rollbackSnapshotRevision.trim()) {
    return {
      decision: 'REJECT',
      rejectionReason: 'MISSING_ROLLBACK_SNAPSHOT',
      message: 'Promotion refused: rollback snapshot revision is missing',
    };
  }

  // 4. Hard verification checks
  if (
    !tReceipt.winnerEvaluation.typecheck.pass ||
    !tReceipt.winnerEvaluation.unitTests.pass ||
    !tReceipt.winnerEvaluation.graphEvidence.pass
  ) {
    return {
      decision: 'REJECT',
      rejectionReason: 'UNVERIFIED_EVALUATION',
      message: 'Promotion refused: winner evaluation has failing verification stages',
    };
  }

  // 5. Generate promotion receipt
  const payloadToHash = JSON.stringify({
    tournamentReceiptChecksum: tReceipt.receiptChecksum,
    promotedPatchDigest: tReceipt.winnerPatchDigest,
    appliedWorkspaceRevision: input.appliedWorkspaceRevision,
    rollbackSnapshotRevision: tReceipt.rollbackSnapshotRevision,
    approvedBy: tReceipt.approvedBy,
  });
  const hash = createHash('sha256').update(payloadToHash, 'utf8').digest('hex');
  const promotionChecksum = `sha256:${hash}`;
  const promotionId = `prom_${hash.slice(0, 16)}`;

  return {
    decision: 'ACCEPT',
    receipt: PromotionExecutionReceiptV1Schema.parse({
      schema: PROMOTION_EXECUTION_RECEIPT_SCHEMA,
      promotionId,
      promotionChecksum,
      tournamentReceiptChecksum: tReceipt.receiptChecksum,
      promotedCandidateId: tReceipt.winnerCandidateId,
      promotedPatchDigest: tReceipt.winnerPatchDigest,
      appliedWorkspaceRevision: input.appliedWorkspaceRevision,
      rollbackSnapshotRevision: tReceipt.rollbackSnapshotRevision,
      reindexScope: {
        ast: true,
        graph: true,
        embedding: true,
        rankerRetrainRequired: false,
      },
      approvedBy: tReceipt.approvedBy,
      promotedAt: now,
      rollbackSafe: true,
      writesPerformed: false,
      canonicalAuthority: false,
    }),
  };
}
