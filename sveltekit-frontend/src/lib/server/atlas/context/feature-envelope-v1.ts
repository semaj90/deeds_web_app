/**
 * FeatureEnvelopeV1 — pure contract (no I/O, no persistence, no model call).
 *
 * One derived feature, bound to an existing canonical entity, a source span and two revisions.
 * The packetKey comes from the authorized identity owner (UUIDv5); this module validates it and never mints it.
 * Model-derived features are proposals: they are never OBSERVED and never self-admitted.
 * Checksums use the Atlas canonical encoder (prefill/canonical-hash-v1), not JSON bytes.
 */
import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';

export const FEATURE_KINDS = [
  'IDENTIFIER',
  'SYMBOL',
  'AST_PATTERN',
  'CST_PATTERN',
  'DIAGNOSTIC',
  'DOMAIN_PROPOSAL',
  'CONCEPT_PROPOSAL',
  'CLUSTER_PROPOSAL',
] as const;

export type FeatureKindV1 = (typeof FEATURE_KINDS)[number];

const PROPOSAL_KINDS: ReadonlySet<FeatureKindV1> = new Set(['DOMAIN_PROPOSAL', 'CONCEPT_PROPOSAL', 'CLUSTER_PROPOSAL']);
// Kinds that must point at an exact byte span in the source.
const SPAN_REQUIRED_KINDS: ReadonlySet<FeatureKindV1> = new Set(['SYMBOL', 'AST_PATTERN', 'CST_PATTERN', 'DIAGNOSTIC']);

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_REVISION = /^sha256:[0-9a-f]{64}$/;

const nonblank = z.string().refine((value) => value.trim().length > 0, 'must be non-blank');

const FeatureEnvelopeBodySchema = z.object({
  schema: z.literal('atlas.feature-envelope.v1'),
  canonicalId: nonblank,
  packetKey: z.string().regex(UUID_V5, 'packetKey must be an existing UUIDv5'),
  sourceRevision: z.string().regex(SHA256_REVISION, 'sourceRevision must be sha256:<64 hex>'),
  workspaceRevision: z.string().regex(SHA256_REVISION, 'workspaceRevision must be sha256:<64 hex>'),
  featureKind: z.enum(FEATURE_KINDS),
  featureName: nonblank,
  featureValue: z.union([z.string(), z.number().finite(), z.boolean()]),
  sourceSpan: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).optional(),
  evidenceRefs: z.array(nonblank).min(1),
  producerRevision: nonblank,
  featureRevision: nonblank,
  modelRevision: nonblank.optional(),
  /** Required for COMPILER_QUALIFIED: digest of the exact toolchain/tsconfig/lock evidence that produced the result. */
  toolchainBindingChecksum: sha256HexSchema.optional(),
  authority: z.enum(['DETERMINISTIC', 'COMPILER_QUALIFIED', 'MODEL_PROPOSAL']),
  reviewStatus: z.enum(['OBSERVED', 'UNRESOLVED', 'REVIEWED']),
}).strict();

export type FeatureEnvelopeBodyV1 = z.infer<typeof FeatureEnvelopeBodySchema>;

export const FeatureEnvelopeV1Schema = FeatureEnvelopeBodySchema
  .extend({ contentChecksum: z.string().regex(SHA256_REVISION, 'contentChecksum must be sha256:<64 hex>') })
  .superRefine((envelope, ctx) => {
    if (envelope.sourceSpan && envelope.sourceSpan[1] <= envelope.sourceSpan[0]) {
      ctx.addIssue({ code: 'custom', path: ['sourceSpan'], message: 'sourceSpan end must be greater than start' });
    }
    if (SPAN_REQUIRED_KINDS.has(envelope.featureKind) && !envelope.sourceSpan) {
      ctx.addIssue({ code: 'custom', path: ['sourceSpan'], message: `${envelope.featureKind} requires an exact sourceSpan` });
    }
    if (envelope.authority === 'MODEL_PROPOSAL' && !envelope.modelRevision) {
      ctx.addIssue({ code: 'custom', path: ['modelRevision'], message: 'MODEL_PROPOSAL requires modelRevision' });
    }
    if (envelope.authority === 'COMPILER_QUALIFIED' && !envelope.toolchainBindingChecksum) {
      ctx.addIssue({ code: 'custom', path: ['toolchainBindingChecksum'], message: 'COMPILER_QUALIFIED requires toolchainBindingChecksum' });
    }
    // A model output or an unreviewed proposal is never "observed" evidence.
    if ((envelope.authority === 'MODEL_PROPOSAL' || PROPOSAL_KINDS.has(envelope.featureKind)) && envelope.reviewStatus === 'OBSERVED') {
      ctx.addIssue({ code: 'custom', path: ['reviewStatus'], message: 'proposals cannot be OBSERVED' });
    }
  });

export type FeatureEnvelopeV1 = z.infer<typeof FeatureEnvelopeV1Schema>;

/** Checksum over every field except contentChecksum, using the Atlas canonical encoder (key order independent). */
export function computeFeatureContentChecksumV1(body: FeatureEnvelopeBodyV1): string {
  // Optional fields that are absent must not be encoded as undefined (the canonical encoder rejects it).
  const present = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
  return `sha256:${canonicalSha256V1(present)}`;
}

export type FeatureEnvelopeValidationV1 =
  | { ok: true; envelope: FeatureEnvelopeV1 }
  | { ok: false; issues: string[] };

export function validateFeatureEnvelopeV1(raw: unknown): FeatureEnvelopeValidationV1 {
  const parsed = FeatureEnvelopeV1Schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    };
  }
  const { contentChecksum, ...body } = parsed.data;
  const expected = computeFeatureContentChecksumV1(body);
  if (contentChecksum !== expected) {
    return { ok: false, issues: [`contentChecksum: CONTENT_CHECKSUM_MISMATCH (expected ${expected})`] };
  }
  return { ok: true, envelope: parsed.data };
}

/** A derived feature is current only while its source revision still matches the workspace snapshot. */
export function isFeatureCurrentForSourceRevision(envelope: FeatureEnvelopeV1, currentSourceRevision: string): boolean {
  return envelope.sourceRevision === currentSourceRevision;
}
