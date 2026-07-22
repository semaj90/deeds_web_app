/**
 * Phase 107 F — Field-Level Resolution Types
 *
 * Canonical packet identity + provenance tracking with field-specific precedence chains.
 * NO cross-lane fallback. NO semantic inference. NO binding creation.
 *
 * FieldResolution is used per-field (domain, lexical, structural, ontology).
 * Each field has a separate precedence chain with no cross-lane fallback.
 *
 * LaneProvenance tracks which source provided each field during resolution.
 *
 * FeatureLoadProvenance is the complete audit trail for a packet's field resolution.
 */

export type FieldResolutionKind = 'normalized-primary' | 'compatibility-fallback' | 'unresolved';

export interface FieldResolution<T = unknown> {
  value: T | null;
  source: string | null;
  resolutionKind: FieldResolutionKind;
  fallbackUsed: boolean;
}

export interface LaneProvenance {
  source: string | null;
  resolutionKind: FieldResolutionKind;
  fallbackUsed: boolean;
  value: unknown;
}

export interface ContentIdentity {
  value: string | null;
  kind: 'canonical-source-sha256' | 'derived-summary-hash' | 'synthetic-migration-hash' | 'missing';
  algorithm: 'sha256' | null;
  inputContract: string | null;
  canonical: boolean;
}

export interface FeatureLoadProvenance {
  packetKey: string;
  lanes: {
    domain: LaneProvenance;
    lexical: LaneProvenance;
    structural: LaneProvenance;
    ontology: LaneProvenance;
  };
  contentIdentity: ContentIdentity;
  processingPassId: string;
  fallbackUsed: boolean;
  fallbackReasons: string[];
  unresolvedReasons: string[];
}

/**
 * Field-specific precedence chains (NO cross-lane fallback)
 *
 * Domain: feature_domain_facts → atlas_packets.domain_class → unresolved
 * Lexical: feature_lexical_facts → unresolved
 * Structural: feature_structural_facts → unresolved
 * Ontology: feature_ontology_tuples → unresolved
 */
export const FIELD_PRECEDENCE = {
  domain: {
    sources: ['feature_domain_facts', 'atlas_packets_fallback'] as const
  },
  lexical: {
    sources: ['feature_lexical_facts'] as const
  },
  structural: {
    sources: ['feature_structural_facts'] as const
  },
  ontology: {
    sources: ['feature_ontology_tuples'] as const
  }
};
