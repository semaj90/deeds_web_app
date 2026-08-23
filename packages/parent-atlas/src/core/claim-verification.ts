import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const CLAIM_TYPES = [
  'CALLS',
  'IMPORTS',
  'DEFINES',
  'DATA_FLOWS_TO',
  'AUTHORIZES_MUTATION',
  'VALIDATES',
  'READS',
  'WRITES',
  'DEPENDS_ON',
  'SEMANTICALLY_RELEVANT',
  'STRUCTURALLY_IMPORTANT',
  'PATCH_FIXES_FAILURE',
] as const;

export const EVIDENCE_KINDS = [
  'SOURCE_BYTES',
  'SOURCE_SPAN',
  'AST_FACT',
  'SYMBOL_FACT',
  'TYPE_FACT',
  'LEXICAL_POS',
  'GROUNDED_EXTRACTION',
  'DATAFLOW_PATH',
  'SCHEMA_READBACK',
  'DATABASE_READBACK',
  'TEST_RESULT',
  'COMPILER_DIAGNOSTIC',
  'RUNTIME_TRACE',
  'EXACT_VECTOR_DISTANCE',
  'GRAPH_MEASUREMENT',
  'RULE_PROOF',
  'MODEL_SCORE',
  'BUILD_ATTESTATION',
] as const;

export const evidenceObservationSchema = z.object({
  schema: z.literal('atlas.evidence-observation.v1').default('atlas.evidence-observation.v1'),
  evidence_id: id,
  evidence_revision: revision,
  subject_canonical_ids: z.array(id).min(1).max(4096),
  evidence_kind: z.enum(EVIDENCE_KINDS),
  source_ref: z.string().min(1),
  source_revision: revision,
  producer: z.string().min(1),
  producer_revision: revision,
  algorithm_revision: revision.nullable().default(null),
  input_checksums: z.array(checksum).max(4096).default([]),
  output_checksum: checksum,
  locator: z.object({
    byte_start: z.number().int().nonnegative().nullable().default(null),
    byte_end: z.number().int().positive().nullable().default(null),
    ast_path: z.array(z.number().int().nonnegative()).nullable().default(null),
    symbol_id: id.nullable().default(null),
    database_key: z.string().min(1).nullable().default(null),
    test_id: id.nullable().default(null),
    trace_id: id.nullable().default(null),
  }).strict().default({
    byte_start: null,
    byte_end: null,
    ast_path: null,
    symbol_id: null,
    database_key: null,
    test_id: null,
    trace_id: null,
  }),
  observed_value: z.unknown(),
  reproducible: z.boolean(),
  trust_class: z.enum(['SOURCE_GROUNDED', 'DETERMINISTIC_DERIVED', 'RUNTIME_OBSERVED', 'MODEL_DERIVED']),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.locator.byte_start !== null && value.locator.byte_end !== null && value.locator.byte_end <= value.locator.byte_start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['locator', 'byte_end'], message: 'byte_end must be greater than byte_start' });
  }
  if (value.evidence_kind === 'MODEL_SCORE' && value.trust_class !== 'MODEL_DERIVED') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['trust_class'], message: 'MODEL_SCORE must use MODEL_DERIVED trust class' });
  }
});
export type EvidenceObservationV1 = z.infer<typeof evidenceObservationSchema>;

export const claimSchema = z.object({
  schema: z.literal('atlas.claim.v1').default('atlas.claim.v1'),
  claim_id: id,
  claim_revision: revision,
  claim_type: z.enum(CLAIM_TYPES),
  subject_canonical_ids: z.array(id).min(1).max(64),
  evidence_refs: z.array(id).max(4096).default([]),
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict();
export type ClaimV1 = z.infer<typeof claimSchema>;

export const evidenceClaimPolicySchema = z.object({
  schema: z.literal('atlas.evidence-claim-policy.v1').default('atlas.evidence-claim-policy.v1'),
  policy_revision: revision,
  claim_type: z.enum(CLAIM_TYPES),
  allowed_evidence_kinds: z.array(z.enum(EVIDENCE_KINDS)).min(1),
  required_evidence_kinds: z.array(z.enum(EVIDENCE_KINDS)).default([]),
  forbidden_as_sole_evidence: z.array(z.enum(EVIDENCE_KINDS)).default([]),
  minimum_distinct_evidence: z.number().int().positive().default(1),
  require_source_grounded_evidence: z.boolean().default(false),
  producer_revision: revision,
}).strict();
export type EvidenceClaimPolicyV1 = z.infer<typeof evidenceClaimPolicySchema>;

export const claimVerificationReceiptSchema = z.object({
  schema: z.literal('atlas.claim-verification-receipt.v1').default('atlas.claim-verification-receipt.v1'),
  receipt_id: id,
  claim_id: id,
  claim_revision: revision,
  policy_revision: revision,
  evidence_refs: z.array(id).max(4096),
  evidence_checksums: z.array(checksum).max(4096),
  verdict: z.enum(['VERIFIED', 'REJECTED', 'INSUFFICIENT_EVIDENCE']),
  satisfied_required_kinds: z.array(z.enum(EVIDENCE_KINDS)).default([]),
  missing_required_kinds: z.array(z.enum(EVIDENCE_KINDS)).default([]),
  deterministic_rule_proof_ref: id.nullable().default(null),
  codeql_path_evidence_ref: id.nullable().default(null),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.evidence_refs.length !== value.evidence_checksums.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence_checksums'], message: 'every evidence ref must have one checksum' });
  }
  if (value.verdict === 'VERIFIED' && value.missing_required_kinds.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['missing_required_kinds'], message: 'VERIFIED receipt cannot have missing required evidence kinds' });
  }
  if (value.verdict === 'VERIFIED' && value.evidence_refs.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence_refs'], message: 'VERIFIED receipt requires admitted evidence' });
  }
});
export type ClaimVerificationReceiptV1 = z.infer<typeof claimVerificationReceiptSchema>;

export function buildDefaultEvidenceClaimPolicies(revisionValue: string): EvidenceClaimPolicyV1[] {
  const make = (claim_type: EvidenceClaimPolicyV1['claim_type'], values: Omit<z.input<typeof evidenceClaimPolicySchema>, 'schema' | 'policy_revision' | 'claim_type' | 'producer_revision'>) =>
    evidenceClaimPolicySchema.parse({
      policy_revision: revisionValue,
      claim_type,
      producer_revision: revisionValue,
      ...values,
    });

  return [
    make('CALLS', {
      allowed_evidence_kinds: ['SOURCE_SPAN', 'AST_FACT', 'SYMBOL_FACT', 'DATAFLOW_PATH', 'RULE_PROOF'],
      required_evidence_kinds: ['AST_FACT'],
      forbidden_as_sole_evidence: ['EXACT_VECTOR_DISTANCE', 'GRAPH_MEASUREMENT', 'MODEL_SCORE'],
      minimum_distinct_evidence: 1,
      require_source_grounded_evidence: true,
    }),
    make('DATA_FLOWS_TO', {
      allowed_evidence_kinds: ['SOURCE_SPAN', 'AST_FACT', 'SYMBOL_FACT', 'TYPE_FACT', 'DATAFLOW_PATH', 'RULE_PROOF'],
      required_evidence_kinds: ['DATAFLOW_PATH'],
      forbidden_as_sole_evidence: ['EXACT_VECTOR_DISTANCE', 'GRAPH_MEASUREMENT', 'MODEL_SCORE'],
      minimum_distinct_evidence: 1,
      require_source_grounded_evidence: true,
    }),
    make('AUTHORIZES_MUTATION', {
      allowed_evidence_kinds: ['SOURCE_SPAN', 'AST_FACT', 'SYMBOL_FACT', 'TYPE_FACT', 'SCHEMA_READBACK', 'DATABASE_READBACK', 'TEST_RESULT', 'DATAFLOW_PATH', 'RULE_PROOF'],
      required_evidence_kinds: ['RULE_PROOF'],
      forbidden_as_sole_evidence: ['EXACT_VECTOR_DISTANCE', 'GRAPH_MEASUREMENT', 'MODEL_SCORE', 'GROUNDED_EXTRACTION'],
      minimum_distinct_evidence: 2,
      require_source_grounded_evidence: true,
    }),
    make('SEMANTICALLY_RELEVANT', {
      allowed_evidence_kinds: ['SOURCE_SPAN', 'GROUNDED_EXTRACTION', 'EXACT_VECTOR_DISTANCE', 'GRAPH_MEASUREMENT', 'MODEL_SCORE'],
      required_evidence_kinds: [],
      forbidden_as_sole_evidence: [],
      minimum_distinct_evidence: 1,
      require_source_grounded_evidence: false,
    }),
    make('PATCH_FIXES_FAILURE', {
      allowed_evidence_kinds: ['SOURCE_BYTES', 'SOURCE_SPAN', 'AST_FACT', 'SYMBOL_FACT', 'TYPE_FACT', 'TEST_RESULT', 'COMPILER_DIAGNOSTIC', 'RUNTIME_TRACE', 'DATABASE_READBACK', 'BUILD_ATTESTATION'],
      required_evidence_kinds: ['TEST_RESULT'],
      forbidden_as_sole_evidence: ['MODEL_SCORE', 'EXACT_VECTOR_DISTANCE', 'GRAPH_MEASUREMENT'],
      minimum_distinct_evidence: 2,
      require_source_grounded_evidence: true,
    }),
  ];
}

export function verifyClaimAgainstPolicy(input: {
  claim: ClaimV1;
  evidence: readonly EvidenceObservationV1[];
  policy: EvidenceClaimPolicyV1;
  receipt_id: string;
  producer_revision: string;
}): ClaimVerificationReceiptV1 {
  const claim = claimSchema.parse(input.claim);
  const policy = evidenceClaimPolicySchema.parse(input.policy);
  if (policy.claim_type !== claim.claim_type) throw new Error('CLAIM_POLICY_TYPE_MISMATCH');

  const evidenceById = new Map(input.evidence.map((item) => [item.evidence_id, evidenceObservationSchema.parse(item)] as const));
  const selected = claim.evidence_refs.map((ref) => evidenceById.get(ref)).filter((item): item is EvidenceObservationV1 => Boolean(item));
  const allowed = new Set(policy.allowed_evidence_kinds);
  const considered = selected.filter((item) => allowed.has(item.evidence_kind));
  const kinds = new Set(considered.map((item) => item.evidence_kind));
  const missing = policy.required_evidence_kinds.filter((kind) => !kinds.has(kind));
  const hasGrounded = considered.some((item) => item.trust_class === 'SOURCE_GROUNDED' || item.trust_class === 'RUNTIME_OBSERVED');
  const soleForbidden = considered.length > 0 && considered.every((item) => policy.forbidden_as_sole_evidence.includes(item.evidence_kind));
  const enough = considered.length >= policy.minimum_distinct_evidence && missing.length === 0 && (!policy.require_source_grounded_evidence || hasGrounded) && !soleForbidden;

  return claimVerificationReceiptSchema.parse({
    receipt_id: input.receipt_id,
    claim_id: claim.claim_id,
    claim_revision: claim.claim_revision,
    policy_revision: policy.policy_revision,
    evidence_refs: considered.map((item) => item.evidence_id),
    evidence_checksums: considered.map((item) => item.output_checksum),
    verdict: enough ? 'VERIFIED' : 'INSUFFICIENT_EVIDENCE',
    satisfied_required_kinds: policy.required_evidence_kinds.filter((kind) => kinds.has(kind)),
    missing_required_kinds: missing,
    deterministic_rule_proof_ref: considered.find((item) => item.evidence_kind === 'RULE_PROOF')?.evidence_id ?? null,
    codeql_path_evidence_ref: considered.find((item) => item.evidence_kind === 'DATAFLOW_PATH')?.evidence_id ?? null,
    canonical_authority: false,
    producer_revision: input.producer_revision,
  });
}
