import { z } from 'zod';

/**
 * JSONB metadata envelope schema for Qdrant points.
 * Validates structure, detects version mismatches, coerces v1→v2.
 */

export const metadataIdentitySchema = z.object({
  source: z.string().optional(),
  packet_key: z.string().nullable().optional(),
  source_ref_canonical: z.string().nullable().optional(),
  directory_path: z.string().nullable().optional(),
  lineage_version: z.string().optional(),
});

export const metadataEnrichmentSchema = z.object({
  som_cluster: z.number().nullable().optional(),
  som_bmu_col: z.number().nullable().optional(),
  som_bmu_row: z.number().nullable().optional(),
  gpu_kmeans_cluster: z.number().nullable().optional(),
  centroid_distance: z.number().nullable().optional(),
  glyph_id: z.string().nullable().optional(),
  glyph_type: z.string().nullable().optional(),
});

export const metadataRetrievalSchema = z.object({
  vector_source: z.string().optional(),
  vector_dim: z.number().optional(),
  signature_vector: z.boolean().optional(),
  error_vector: z.boolean().optional(),
  encoded_64_vector: z.boolean().optional(),
  last_vector_update: z.string().datetime().optional(),
});

export const metadataAISummarySchema = z.object({
  summary: z.string().nullable().optional(),
  summary_model: z.string().nullable().optional(),
  summary_generated_at: z.string().datetime().nullable().optional(),
  summary_confidence: z.number().nullable().optional(),
  keywords: z.array(z.string()).optional().default([]),
});

export const metadataQualitySchema = z.object({
  canonical: z.boolean().optional(),
  payload_version: z.string().optional(),
  payload_matched_at: z.string().datetime().optional(),
  ambiguity_score: z.number().optional(),
  needs_review: z.boolean().optional(),
});

// V2 schema (nested structure)
export const metadataV2Schema = z.object({
  version: z.literal(2),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  identity: metadataIdentitySchema.optional(),
  enrichment: metadataEnrichmentSchema.optional(),
  retrieval: metadataRetrievalSchema.optional(),
  ai_summary: metadataAISummarySchema.optional(),
  quality: metadataQualitySchema.optional(),
});

// V1 schema (flat structure, legacy)
export const metadataV1Schema = z.object({
  packet_identity_source: z.string().optional(),
  qdrant_payload_version: z.string().optional(),
  payload_backfilled_at: z.string().datetime().optional(),
  packet_key: z.string().nullable().optional(),
  source_ref: z.string().nullable().optional(),
  som_cluster: z.number().nullable().optional(),
  // ... other v1 fields
});

export type MetadataV2 = z.infer<typeof metadataV2Schema>;
export type MetadataV1 = z.infer<typeof metadataV1Schema>;

/**
 * Validate and coerce metadata from any version to V2.
 * Returns { valid: true, data: MetadataV2 } or { valid: false, errors: string[], version: 1|2 }
 */
export function validateQdrantMetadata(payload: any): {
  valid: boolean;
  data?: MetadataV2;
  errors?: string[];
  version?: number;
} {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Metadata is not an object'], version: 0 };
  }

  // Detect version
  const version = payload.version || 1;

  // Try V2 validation
  if (version === 2) {
    try {
      const data = metadataV2Schema.parse(payload);
      return { valid: true, data, version: 2 };
    } catch (err) {
      return {
        valid: false,
        errors: [(err as any).errors?.map((e: any) => e.message) || 'V2 validation failed'],
        version: 2,
      };
    }
  }

  // V1 validation (legacy fallback)
  try {
    const v1Data = metadataV1Schema.parse(payload);
    // Coerce to V2
    const v2Data: MetadataV2 = {
      version: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      identity: {
        source: v1Data.packet_identity_source,
        packet_key: v1Data.packet_key || null,
        source_ref_canonical: v1Data.source_ref || null,
        directory_path: null,
        lineage_version: 'packet-identity-v1',
      },
      enrichment: {
        som_cluster: v1Data.som_cluster || null,
      },
      retrieval: {
        vector_source: 'embeddinggemma:300m',
        vector_dim: 768,
      },
      quality: {
        payload_version: v1Data.qdrant_payload_version,
      },
    };
    return { valid: true, data: v2Data, version: 1 };
  } catch (err) {
    return {
      valid: false,
      errors: [(err as any).errors?.map((e: any) => e.message) || 'V1 validation failed'],
      version: 1,
    };
  }
}

/**
 * Type guard: ensure metadata is V2 or coercible.
 * Used on read: flag mismatched versions for repair.
 */
export function isValidQdrantMetadata(payload: any): payload is MetadataV2 {
  const result = validateQdrantMetadata(payload);
  return result.valid;
}
