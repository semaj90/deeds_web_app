/**
 * Canonical Feature Envelope — Single Source of Truth for Packet Shape
 *
 * All writers (feature extraction, summary building, ACE assembly, cache warmers, Qdrant sync)
 * must call buildCanonicalFeatureEnvelope(packet) to ensure deterministic shape.
 *
 * Hard Requirements (FAIL if omitted):
 *   - packet_key, source_ref_key, feature_id, title_id, tree_node_id, used_concepts
 *
 * Soft Requirements (WARN if omitted):
 *   - qdrant_point_id, community_id, som_cluster, domain_class
 */

import { z } from 'zod';

/**
 * Hard requirement: these fields MUST be present and non-null for envelope validity
 */
const REQUIRED_FIELDS = [
  'packet_key',
  'source_ref_key',
  'feature_id',
  'title_id',
  'tree_node_id',
  'used_concepts',
] as const;

/**
 * Soft requirement: warn if omitted, but don't fail
 */
const RECOMMENDED_FIELDS = [
  'qdrant_point_id',
  'community_id',
  'som_cluster',
  'domain_class',
] as const;

/**
 * Canonical Feature Envelope — Zod schema for runtime validation
 */
export const CanonicalFeatureEnvelopeSchema = z.object({
  // Identity (REQUIRED)
  packet_key: z.string().min(1, 'packet_key required'),
  source_ref: z.string().min(1, 'source_ref required'),
  source_ref_key: z.string().min(1, 'source_ref_key required'),
  feature_id: z.string().min(1, 'feature_id required'),
  feature_label: z.string().nullable().optional(),
  title_id: z.string().nullable().optional(),
  tree_node_id: z.string().uuid().nullable().optional(),

  // Classification & Topology (Soft)
  domain_class: z.string().nullable().optional(),
  ontology_label: z.string().nullable().optional(),
  topology_label: z.string().nullable().optional(),

  // Feature Enrichment (REQUIRED)
  used_concepts: z.array(z.string()).min(0),

  // Mirrors & Cache Pointers (Soft)
  qdrant_point_id: z.union([z.string(), z.number()]).nullable().optional(),

  // Graph & Community (Soft)
  community_id: z.number().int().nullable().optional(),
  graph_community_id: z.number().int().nullable().optional(),

  // Topology (Soft)
  som_cluster: z.string().nullable().optional(),
  som_row: z.number().int().nullable().optional(),
  som_col: z.number().int().nullable().optional(),

  // Metrics (Soft)
  page_rank_score: z.number().nullable().optional(),
  cheirank_score: z.number().nullable().optional(),
  betweenness_centrality: z.number().nullable().optional(),
  closeness_centrality: z.number().nullable().optional(),
  k_core: z.number().int().nullable().optional(),

  // Confidence & Provenance (Soft)
  classification_source: z.enum(['heuristic', 'lexical', 'llm', 'external', 'unknown']).nullable().optional(),
  classification_confidence: z.number().min(0).max(1).nullable().optional(),

  // Metadata (Soft)
  created_at: z.date().nullable().optional(),
  updated_at: z.date().nullable().optional(),
  summary: z.string().nullable().optional(),
});

export type CanonicalFeatureEnvelope = z.infer<typeof CanonicalFeatureEnvelopeSchema>;

/**
 * Builder function — ensures all writers produce identical shape
 *
 * @param packet Raw packet row from Postgres
 * @returns Canonical envelope with all required fields present, optional fields safe
 */
export function buildCanonicalFeatureEnvelope(packet: {
  packet_key?: string | null;
  source_ref?: string | null;
  source_ref_key?: string | null;
  feature_id?: string | null;
  feature_label?: string | null;
  title_id?: string | null;
  tree_node_id?: string | null;
  domain_class?: string | null;
  ontology_label?: string | null;
  topology_label?: string | null;
  used_concepts?: string[] | null;
  qdrant_point_id?: string | number | null;
  community_id?: number | null;
  graph_community_id?: number | null;
  som_cluster?: string | null;
  som_row?: number | null;
  som_col?: number | null;
  page_rank_score?: number | null;
  cheirank_score?: number | null;
  betweenness_centrality?: number | null;
  closeness_centrality?: number | null;
  k_core?: number | null;
  classification_source?: string | null;
  classification_confidence?: number | null;
  created_at?: Date | null;
  updated_at?: Date | null;
  summary?: string | null;
}): { envelope: CanonicalFeatureEnvelope; validation: ValidationResult } {
  const validation: ValidationResult = {
    isValid: true,
    hardFailures: [],
    softWarnings: [],
  };

  // Check hard requirements
  const hardRequiredValues = {
    packet_key: packet.packet_key,
    source_ref_key: packet.source_ref_key,
    feature_id: packet.feature_id,
    title_id: packet.title_id,
    tree_node_id: packet.tree_node_id,
    used_concepts: packet.used_concepts,
  };

  for (const [field, value] of Object.entries(hardRequiredValues)) {
    if (!value || (Array.isArray(value) && value.length === 0 && field !== 'used_concepts')) {
      validation.hardFailures.push(`${field}: required but missing or empty`);
      validation.isValid = false;
    }
  }

  // Check soft recommendations
  const softRecommendedValues = {
    qdrant_point_id: packet.qdrant_point_id,
    community_id: packet.community_id,
    som_cluster: packet.som_cluster,
    domain_class: packet.domain_class,
  };

  for (const [field, value] of Object.entries(softRecommendedValues)) {
    if (value === null || value === undefined) {
      validation.softWarnings.push(`${field}: recommended but missing`);
    }
  }

  // Build envelope (safe to proceed even with soft warnings)
  const envelope: CanonicalFeatureEnvelope = {
    packet_key: packet.packet_key || '',
    source_ref: packet.source_ref || '',
    source_ref_key: packet.source_ref_key || '',
    feature_id: packet.feature_id || '',
    feature_label: packet.feature_label || null,
    title_id: packet.title_id || null,
    tree_node_id: packet.tree_node_id || null,

    domain_class: packet.domain_class || null,
    ontology_label: packet.ontology_label || null,
    topology_label: packet.topology_label || null,

    used_concepts: packet.used_concepts || [],

    qdrant_point_id: packet.qdrant_point_id || null,

    community_id: packet.community_id || null,
    graph_community_id: packet.graph_community_id || null,

    som_cluster: packet.som_cluster || null,
  };

  return { envelope, validation };
}

/**
 * Validation result from envelope building
 */
export interface ValidationResult {
  isValid: boolean;
  hardFailures: string[];
  softWarnings: string[];
}

/**
 * Validate envelope against canonical schema
 *
 * @param envelope Envelope to validate
 * @returns Validation result with error details
 */
export function validateCanonicalEnvelope(envelope: unknown): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    hardFailures: [],
    softWarnings: [],
  };

  try {
    CanonicalFeatureEnvelopeSchema.parse(envelope);
  } catch (err) {
    result.isValid = false;
    if (err instanceof z.ZodError) {
      err.errors.forEach((e) => {
        const path = e.path.join('.');
        result.hardFailures.push(`${path}: ${e.message}`);
      });
    }
  }

  // Check hard requirements explicitly
  const env = envelope as Partial<CanonicalFeatureEnvelope>;
  for (const field of REQUIRED_FIELDS) {
    const value = env[field as keyof CanonicalFeatureEnvelope];
    if (!value || (field === 'used_concepts' && Array.isArray(value) && value.length === 0)) {
      if (!result.hardFailures.find((f) => f.includes(field))) {
        result.hardFailures.push(`${field}: required but missing or empty`);
        result.isValid = false;
      }
    }
  }

  // Check soft recommendations
  for (const field of RECOMMENDED_FIELDS) {
    const value = env[field as keyof CanonicalFeatureEnvelope];
    if (!value) {
      result.softWarnings.push(`${field}: recommended but missing`);
    }
  }

  return result;
}

/**
 * Report validation errors (hard fail on hard failures, log soft warnings)
 *
 * @param validation Validation result
 * @param packet Packet key for debugging
 * @throws Error if hard failures detected
 */
export function reportValidation(validation: ValidationResult, packetKey: string): void {
  if (validation.hardFailures.length > 0) {
    throw new Error(
      `Canonical envelope validation failed for ${packetKey}:\n${validation.hardFailures.join('\n')}`
    );
  }

  if (validation.softWarnings.length > 0) {
    console.warn(`Canonical envelope warnings for ${packetKey}:`, validation.softWarnings);
  }
}