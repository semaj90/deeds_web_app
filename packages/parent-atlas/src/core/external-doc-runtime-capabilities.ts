import { z } from 'zod';

const revision = z.string().min(1);
const semver = z.string().regex(/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);

export const qdrantExternalDocsCapabilityProfileSchema = z.object({
  schema: z.literal('atlas.qdrant-external-docs-capability-profile.v1').default('atlas.qdrant-external-docs-capability-profile.v1'),
  probed_at: z.string().datetime(),
  qdrant_version: semver,
  qdrant_commit: z.string().min(1).nullable().default(null),
  supports_sparse_vectors: z.boolean(),
  supports_idf_modifier: z.boolean(),
  supports_hybrid_query_api: z.boolean(),
  supports_named_vector_schema_update: z.boolean(),
  supports_memory_tiers_v119: z.boolean(),
  native_bm25_inference: z.enum(['UNPROBED', 'SUPPORTED', 'UNSUPPORTED']),
  current_collection_exists: z.boolean(),
  shadow_collection_exists: z.boolean(),
  current_collection_vector_mode: z.enum(['UNKNOWN', 'UNNAMED_DENSE', 'NAMED_DENSE', 'HYBRID_DENSE_SPARSE']),
  shadow_collection_vector_mode: z.enum(['MISSING', 'UNKNOWN', 'HYBRID_DENSE_SPARSE']),
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.native_bm25_inference === 'SUPPORTED' && !value.supports_sparse_vectors) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['native_bm25_inference'], message: 'native BM25 requires sparse-vector support' });
  }
  if (value.shadow_collection_vector_mode === 'HYBRID_DENSE_SPARSE' && !value.shadow_collection_exists) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['shadow_collection_exists'], message: 'hybrid shadow mode requires existing shadow collection' });
  }
});
export type QdrantExternalDocsCapabilityProfileV1 = z.infer<typeof qdrantExternalDocsCapabilityProfileSchema>;

export const externalDocsHybridProofGateSchema = z.object({
  schema: z.literal('atlas.external-docs-hybrid-proof-gate.v1').default('atlas.external-docs-hybrid-proof-gate.v1'),
  gate_id: z.string().min(1),
  gate_revision: revision,
  capability_profile: qdrantExternalDocsCapabilityProfileSchema,
  required: z.object({
    sparse_vectors: z.literal(true).default(true),
    idf_modifier: z.literal(true).default(true),
    hybrid_query_api: z.literal(true).default(true),
    native_bm25_inference: z.boolean().default(true),
  }).default({ sparse_vectors: true, idf_modifier: true, hybrid_query_api: true, native_bm25_inference: true }),
  status: z.enum(['READY', 'BLOCKED']),
  blockers: z.array(z.enum([
    'SPARSE_VECTORS_UNAVAILABLE',
    'IDF_MODIFIER_UNAVAILABLE',
    'HYBRID_QUERY_API_UNAVAILABLE',
    'NATIVE_BM25_UNPROBED',
    'NATIVE_BM25_UNAVAILABLE',
  ])).default([]),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const shouldBeReady = value.blockers.length === 0;
  if ((value.status === 'READY') !== shouldBeReady) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'READY iff blockers is empty' });
  }
});
export type ExternalDocsHybridProofGateV1 = z.infer<typeof externalDocsHybridProofGateSchema>;

export type ParsedSemver = { major: number; minor: number; patch: number };

export function parseSemver(value: string): ParsedSemver {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (!match) throw new Error(`INVALID_SEMVER:${value}`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function semverAtLeast(value: string, minimum: string): boolean {
  const actual = parseSemver(value);
  const wanted = parseSemver(minimum);
  if (actual.major !== wanted.major) return actual.major > wanted.major;
  if (actual.minor !== wanted.minor) return actual.minor > wanted.minor;
  return actual.patch >= wanted.patch;
}

export function deriveQdrantVersionCapabilities(version: string) {
  const hybridBaseline = semverAtLeast(version, '1.10.0');
  return {
    // Atlas intentionally uses 1.10 as the minimum for this production path:
    // that release introduced Universal Query API hybrid fusion plus the IDF
    // modifier needed by our lexical_bm25 contract. Older sparse support is
    // not treated as sufficient evidence for this exact workflow.
    supports_sparse_vectors: hybridBaseline,
    supports_idf_modifier: hybridBaseline,
    supports_hybrid_query_api: hybridBaseline,
    // Qdrant 1.18 added create/delete named-vector schema APIs. Atlas still
    // uses a shadow collection for migration because schema existence does not
    // populate newly added vectors on historical points.
    supports_named_vector_schema_update: semverAtLeast(version, '1.18.0'),
    // Qdrant 1.19 introduces memory: pinned|cached|cold; older versions use
    // on_disk/on_disk_payload compatibility parameters.
    supports_memory_tiers_v119: semverAtLeast(version, '1.19.0'),
  } as const;
}

export function buildExternalDocsHybridProofGate(input: {
  gateId: string;
  gateRevision: string;
  profile: QdrantExternalDocsCapabilityProfileV1;
  requireNativeBm25?: boolean;
}): ExternalDocsHybridProofGateV1 {
  const blockers: ExternalDocsHybridProofGateV1['blockers'] = [];
  if (!input.profile.supports_sparse_vectors) blockers.push('SPARSE_VECTORS_UNAVAILABLE');
  if (!input.profile.supports_idf_modifier) blockers.push('IDF_MODIFIER_UNAVAILABLE');
  if (!input.profile.supports_hybrid_query_api) blockers.push('HYBRID_QUERY_API_UNAVAILABLE');
  if (input.requireNativeBm25 ?? true) {
    if (input.profile.native_bm25_inference === 'UNPROBED') blockers.push('NATIVE_BM25_UNPROBED');
    if (input.profile.native_bm25_inference === 'UNSUPPORTED') blockers.push('NATIVE_BM25_UNAVAILABLE');
  }
  return externalDocsHybridProofGateSchema.parse({
    gate_id: input.gateId,
    gate_revision: input.gateRevision,
    capability_profile: input.profile,
    required: {
      sparse_vectors: true,
      idf_modifier: true,
      hybrid_query_api: true,
      native_bm25_inference: input.requireNativeBm25 ?? true,
    },
    status: blockers.length === 0 ? 'READY' : 'BLOCKED',
    blockers,
    canonical_authority: false,
  });
}
