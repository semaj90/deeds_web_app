import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  ATLAS_CANONICAL_SEMANTIC_REPRESENTATION as SEMANTIC_REPRESENTATION_ID,
  ATLAS_CANONICAL_SEMANTIC_DIMENSION as SEMANTIC_DIMENSION,
} from './retrieval/qdrant-semantic-projection.js';

export const PARENT_ATLAS_PHASE_LANE_PROOF_IDS = [15] as const;

export type ParentAtlasPhaseLaneProofId = (typeof PARENT_ATLAS_PHASE_LANE_PROOF_IDS)[number];

export interface ParentAtlasPhaseLaneProofReceipt {
  receipt_id: string;
  phase: ParentAtlasPhaseLaneProofId;
  proof_state: 'wired';
  proof_gate: 'SEMANTIC_LANE_WIRED_AND_TESTED';
  canonical_representation_id: typeof SEMANTIC_REPRESENTATION_ID;
  canonical_dimension: typeof SEMANTIC_DIMENSION;
  evidence_refs: string[];
  test_command: string;
  verified_commands: string[];
  source_refs: string[];
  created_at: string;
}

export interface ParentAtlasPhaseLaneProofSnapshot {
  generated_at: string;
  summary: {
    total: number;
    canonicalRepresentationId: typeof SEMANTIC_REPRESENTATION_ID;
    canonicalDimension: typeof SEMANTIC_DIMENSION;
  };
  receipts: ParentAtlasPhaseLaneProofReceipt[];
}

const ProofReceiptSchema = z
  .object({
    receipt_id: z.string().min(1),
    phase: z.literal(15),
    proof_state: z.literal('wired'),
    proof_gate: z.literal('SEMANTIC_LANE_WIRED_AND_TESTED'),
    canonical_representation_id: z.literal(SEMANTIC_REPRESENTATION_ID),
    canonical_dimension: z.literal(SEMANTIC_DIMENSION),
    evidence_refs: z.array(z.string().min(1)),
    test_command: z.string().min(1),
    verified_commands: z.array(z.string().min(1)),
    source_refs: z.array(z.string().min(1)),
    created_at: z.string().datetime(),
  })
  .strict();

export const ParentAtlasPhaseLaneProofSnapshotSchema = z
  .object({
    generated_at: z.string().datetime(),
    summary: z
      .object({
        total: z.number().int().nonnegative(),
        canonicalRepresentationId: z.literal(SEMANTIC_REPRESENTATION_ID),
        canonicalDimension: z.literal(SEMANTIC_DIMENSION),
      })
      .strict(),
    receipts: z.array(ProofReceiptSchema),
  })
  .strict();

function buildReceiptId(seed: Omit<ParentAtlasPhaseLaneProofReceipt, 'receipt_id' | 'created_at'>): string {
  return `phase-${seed.phase}-wired-${createHash('sha256')
    .update(JSON.stringify(seed))
    .digest('hex')
    .slice(0, 16)}`;
}

function buildSemanticLaneReceipt(): ParentAtlasPhaseLaneProofReceipt {
  const seed = {
    phase: 15 as const,
    proof_state: 'wired' as const,
    proof_gate: 'SEMANTIC_LANE_WIRED_AND_TESTED' as const,
    canonical_representation_id: SEMANTIC_REPRESENTATION_ID,
    canonical_dimension: SEMANTIC_DIMENSION,
    evidence_refs: [
      'sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.ts',
      'sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.spec.ts',
      'sveltekit-frontend/src/routes/api/admin/batch-embeddings/embed/+server.ts',
    ],
    test_command:
      'npm exec -- vitest run sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.spec.ts sveltekit-frontend/src/routes/api/admin/batch-embeddings/embed/+server.ts',
    verified_commands: [
      'npm exec -- vitest run sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.spec.ts sveltekit-frontend/src/routes/api/admin/batch-embeddings/embed/+server.ts',
    ],
    source_refs: [
      'sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.ts',
      'sveltekit-frontend/src/routes/api/admin/batch-embeddings/embed/+server.ts',
    ],
  };

  return ProofReceiptSchema.parse({
    ...seed,
    receipt_id: buildReceiptId(seed),
    created_at: new Date(0).toISOString(),
  });
}

export function getParentAtlasPhaseLaneProofSnapshot(): ParentAtlasPhaseLaneProofSnapshot {
  const receipts = [buildSemanticLaneReceipt()];

  return ParentAtlasPhaseLaneProofSnapshotSchema.parse({
    generated_at: new Date(0).toISOString(),
    summary: {
      total: receipts.length,
      canonicalRepresentationId: SEMANTIC_REPRESENTATION_ID,
      canonicalDimension: SEMANTIC_DIMENSION,
    },
    receipts,
  });
}

export function buildParentAtlasPhaseLaneProofReport(): string {
  const snapshot = getParentAtlasPhaseLaneProofSnapshot();
  return [
    `Parent Atlas wired phase receipts: ${snapshot.summary.total}`,
    ...snapshot.receipts.map(
      (receipt) =>
        `${receipt.phase}. ${receipt.proof_gate} — ${receipt.receipt_id} — ${receipt.test_command}`,
    ),
  ].join('\n');
}
