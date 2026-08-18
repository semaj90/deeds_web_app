import { z } from 'zod';

const revision = z.string().min(1);

export const proofGateStatusSchema = z.enum(['PENDING', 'PASS', 'FAIL', 'BLOCKED']);

export const featureIntelligenceProofGateSchema = z.object({
  gate_id: z.string().min(1),
  description: z.string().min(1),
  status: proofGateStatusSchema,
  evidence_refs: z.array(z.string().min(1)).default([]),
  command: z.string().min(1).nullable().optional(),
  report_ref: z.string().min(1).nullable().optional(),
}).strict();

export const featureIntelligenceProofReceiptSchema = z.object({
  schema: z.literal('atlas.feature-intelligence-proof-receipt.v1').default('atlas.feature-intelligence-proof-receipt.v1'),
  branch_revision: revision,
  source_snapshot_revision: revision,
  gates: z.array(featureIntelligenceProofGateSchema),
  overall_status: proofGateStatusSchema,
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.overall_status === 'PASS' && value.gates.some((gate) => gate.status !== 'PASS')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'overall PASS requires every gate PASS', path: ['overall_status'] });
  }
});

export type FeatureIntelligenceProofReceiptV1 = z.infer<typeof featureIntelligenceProofReceiptSchema>;

export const DEFAULT_FEATURE_INTELLIGENCE_PROOF_GATES = [
  'PACKAGE_BUILD',
  'UNIT_CONTRACT_TESTS',
  'POSTGRES_MIGRATION_APPLIED',
  'CANONICAL_IDENTITY_READBACK',
  'NARY_RELATIONSHIP_READBACK',
  'ACE_PACKET_V2_CONSTRUCTION',
  'DYNAMIC_HYPEREDGE_NON_PROMOTION',
  'PPR_CPU_GPU_PARITY',
  'RELATIONSHIP_ANN_RECALL',
  'LIVE_HYPERRAG_ADOPTION',
] as const;

/** TODO: proof runner should populate this receipt from actual command/database/GPU evidence; never infer PASS from file existence. */
