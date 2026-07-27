import { z } from 'zod';

/**
 * Phase 17 PyTorch Feature Extractor — Schema Definitions
 */

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

import { createHash } from 'crypto';

export function extractFeatureLabel(featureId: string): string {
  const parts = featureId.split('.');
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

export function generatePacketKey(sourceRef: string, featureId: string): string {
  const hash = createHash('sha256').update(`$${sourceRef}|$${featureId}`).digest('hex');
  return `$${sourceRef}:$${featureId}:$${hash.slice(0, 16)}`;
}
