import { z } from 'zod';

/**
 * Phase 17 PyTorch Feature Extractor — Schema Definitions
 *
 * Defines the input/output contracts for feature extraction pipeline.
 * Input: ReconciliationResult from Phase 10-19
 * Output: task_semantic_packets row
 */

// ══════════════════════════════════════════════════════════════
// INPUT SCHEMA
// ══════════════════════════════════════════════════════════════

export const phase17InputSchema = z.object({
  reconciliationResult: z.object({
    aliasId: z.string().min(1),
    queryHash: z.string().min(1),
    sourceRefs: z.array(z.string()),
    featureIds: z.array(z.string()),
    clusterCards: z.array(
      z.object({
        centroidId: z.string(),
        sourceRefs: z.array(z.string()),
        authorityScore: z.number().min(0).max(1),
        clusterSummary: z.string().optional(),
      })
    ),
    packets: z.array(
      z.object({
        packetKey: z.string(),
        sourceRef: z.string(),
        featureId: z.string(),
        aliasId: z.string(),
      })
    ),
    scoreProfile: z.object({
      qdrant: z.number().min(0).max(1),
      cluster: z.number().min(0).max(1),
      topological: z.number().min(0).max(1),
      fusion: z.number().min(0).max(1),
    }),
  }),
  sourceRef: z.string().min(1),
  featureId: z.string().min(1),
  aliasId: z.string().min(1),
});

export type Phase17Input = z.infer<typeof phase17InputSchema>;

// ══════════════════════════════════════════════════════════════
// EXTRACTED FEATURES SCHEMA
// ══════════════════════════════════════════════════════════════

export const extractedFeaturesSchema = z.object({
  qdrant_score: z.number().min(0).max(1),
  cluster_score: z.number().min(0).max(1),
  topological_score: z.number().min(0).max(1),
  fusion_score: z.number().min(0).max(1),
  metadata: z.object({
    authority_score: z.number().min(0).max(1),
    member_count: z.number().int().min(0),
    summary_length: z.number().int().min(0),
    source_ref_depth: z.number().int().min(0),
    is_core_library: z.boolean(),
    is_test_file: z.boolean(),
    has_packets: z.boolean(),
    packet_count: z.number().int().min(0),
    avg_packet_authority: z.number().min(0).max(1),
  }),
  semantic_vector: z.array(z.number()).optional(),
});

export type ExtractedFeatures = z.infer<typeof extractedFeaturesSchema>;

// ══════════════════════════════════════════════════════════════
// OUTPUT SCHEMA (task_semantic_packets row)
// ══════════════════════════════════════════════════════════════

export const phase17OutputSchema = z.object({
  packet_key: z.string().min(1),
  source_ref: z.string().min(1),
  feature_id: z.string().min(1),
  feature_label: z.string().min(1),
  alias_id: z.string().min(1),
  extracted_features: extractedFeaturesSchema,
  validation_status: z.enum(['pending', 'valid', 'invalid']),
  error_message: z.string().nullable(),
});

export type Phase17Output = z.infer<typeof phase17OutputSchema>;

/**
 * Phase 17 provider admission is a derived feature boundary. Providers may
 * report an unavailable/degraded result, but they cannot invent lineage or
 * turn a partial observation into a current feature snapshot.
 */
export const phase17FeatureProviderStatusSchema = z.enum([
  'AVAILABLE',
  'DEGRADED',
  'BLOCKED',
  'UNAVAILABLE',
]);

export const revisionQualifiedFeatureInputSchema = z.object({
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1).nullable(),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  representationRevision: z.string().min(1).nullable(),
  graphRevision: z.string().min(1).nullable(),
  evidenceRefs: z.array(z.string().min(1)),
}).strict();

export type RevisionQualifiedFeatureInputV1 = z.infer<typeof revisionQualifiedFeatureInputSchema>;

export const phase17FeatureProviderSchema = z.object({
  providerId: z.string().min(1),
  providerRevision: z.string().min(1),
  requiredInputs: z.array(z.string().min(1)),
  producedFeatures: z.array(z.string().min(1)),
  status: phase17FeatureProviderStatusSchema,
}).strict();

export type Phase17FeatureProviderV1 = z.infer<typeof phase17FeatureProviderSchema>;

export type Phase17FeatureAdmissionV1 =
  | { status: 'ADMITTED'; provider: Phase17FeatureProviderV1; input: RevisionQualifiedFeatureInputV1 }
  | { status: 'BLOCKED' | 'UNAVAILABLE'; provider: Phase17FeatureProviderV1; input: RevisionQualifiedFeatureInputV1; reason: string };

/** Pure admission check for a provider invocation; it performs no persistence. */
export function admitPhase17FeatureProviderV1(input: {
  provider: z.input<typeof phase17FeatureProviderSchema>;
  featureInput: z.input<typeof revisionQualifiedFeatureInputSchema>;
}): Phase17FeatureAdmissionV1 {
  const provider = phase17FeatureProviderSchema.parse(input.provider);
  const featureInput = revisionQualifiedFeatureInputSchema.parse(input.featureInput);
  if (provider.status === 'UNAVAILABLE') {
    return { status: 'UNAVAILABLE', provider, input: featureInput, reason: 'PROVIDER_UNAVAILABLE' };
  }
  if (provider.status !== 'AVAILABLE') {
    return { status: 'BLOCKED', provider, input: featureInput, reason: `PROVIDER_${provider.status}` };
  }
  if (provider.requiredInputs.includes('packetKey') && featureInput.packetKey === null) {
    return { status: 'BLOCKED', provider, input: featureInput, reason: 'PACKET_KEY_REQUIRED' };
  }
  if (provider.requiredInputs.includes('representationRevision') && featureInput.representationRevision === null) {
    return { status: 'BLOCKED', provider, input: featureInput, reason: 'REPRESENTATION_REVISION_REQUIRED' };
  }
  if (provider.requiredInputs.includes('graphRevision') && featureInput.graphRevision === null) {
    return { status: 'BLOCKED', provider, input: featureInput, reason: 'GRAPH_REVISION_REQUIRED' };
  }
  return { status: 'ADMITTED', provider, input: featureInput };
}

// ══════════════════════════════════════════════════════════════
// HELPER: Generate human-readable feature labels
// ══════════════════════════════════════════════════════════════

export function extractFeatureLabel(featureId: string): string {
  const parts = featureId.split('.');
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

// ══════════════════════════════════════════════════════════════
// HELPER: Generate stable packet key
// ══════════════════════════════════════════════════════════════

import { createHash } from 'crypto';

export function generatePacketKey(sourceRef: string, featureId: string): string {
  const hash = createHash('sha256')
    .update(`${sourceRef}|${featureId}`)
    .digest('hex');
  return `${sourceRef}:${featureId}:${hash.slice(0, 16)}`;
}
