/**
 * Field Resolution Model
 *
 * Tracks how each packet field was resolved and from which source.
 * Supports domain, lexical, structural, and ontology fields with field-specific precedence.
 * Does NOT perform semantic inference or binding creation.
 */

export type FieldResolutionKind =
  | 'normalized-primary'
  | 'compatibility-fallback'
  | 'unresolved';

export type FieldResolutionSource =
  | 'feature_domain_facts'
  | 'feature_lexical_facts'
  | 'feature_structural_facts'
  | 'feature_ontology_tuples'
  | 'atlas_packets.domain_class'
  | 'atlas_packets.payload'
  | null;

export interface FieldResolution<T = unknown> {
  value: T | null;
  source: FieldResolutionSource;
  resolutionKind: FieldResolutionKind;
  fallbackUsed: boolean;
  unresolvedReason: string | null;
}

export interface LaneProvenance {
  source: FieldResolutionSource;
  resolutionKind: FieldResolutionKind;
  fallbackUsed: boolean;
  unresolvedReason: string | null;
}

export interface FeatureLoadProvenance {
  packetKey: string;
  lanes: {
    domain: LaneProvenance;
    lexical: LaneProvenance;
    structural: LaneProvenance;
    ontology: LaneProvenance;
  };
  fallbackUsed: boolean;
  fallbackReasons: string[];
  unresolvedReasons: string[];
  contentIdentity: {
    value: string | null;
    kind: 'canonical-source-sha256' | 'derived-summary-hash' | 'missing';
  };
  processingPassId: string;
}

/**
 * Field-specific precedence chains.
 * Each field has its own resolution strategy; no cross-lane fallback.
 */
export const FIELD_PRECEDENCE = {
  domain: [
    'feature_domain_facts',
    'atlas_packets.domain_class',
    null
  ],
  lexical: [
    'feature_lexical_facts',
    null
  ],
  structural: [
    'feature_structural_facts',
    null
  ],
  ontology: [
    'feature_ontology_tuples',
    null
  ]
} as const;
