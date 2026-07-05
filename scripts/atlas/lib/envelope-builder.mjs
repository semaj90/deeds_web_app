/**
 * Canonical Feature Envelope Builder — Shared across all writers
 *
 * All writers (feature extraction, summary building, ACE assembly, cache warmers, Qdrant sync)
 * must use buildCanonicalFeatureEnvelope() to ensure deterministic shape.
 */

/**
 * Hard requirements: MUST be present for envelope validity
 *
 * Note: tree_node_id can be NULL (not all packets have tree nodes)
 * but must be a defined field in the envelope
 */
const REQUIRED_FIELDS = [
  'packet_key',
  'source_ref_key',
  'feature_id',
  'title_id',
  'used_concepts',
];

/**
 * Fields that must be defined (can be NULL)
 */
const NULLABLE_FIELDS = [
  'tree_node_id',
];

/**
 * Soft requirements: warn if missing, but don't fail
 */
const RECOMMENDED_FIELDS = [
  'qdrant_point_id',
  'community_id',
  'som_cluster',
  'domain_class',
];

/**
 * Build canonical feature envelope from packet row
 *
 * @param {Object} packet Raw packet from Postgres or cache
 * @returns {Object} Canonical envelope with validation result
 */
export function buildCanonicalFeatureEnvelope(packet) {
  const validation = {
    isValid: true,
    hardFailures: [],
    softWarnings: [],
  };

  // Normalize packet input
  const normalized = normalizePacket(packet);

  // Check hard requirements
  for (const field of REQUIRED_FIELDS) {
    const value = normalized[field];
    if (
      value === null ||
      value === undefined ||
      (field === 'used_concepts' && Array.isArray(value) && value.length === 0)
    ) {
      // Only fail for truly required fields
      if (field !== 'used_concepts' || packet.used_concepts !== undefined) {
        validation.hardFailures.push(`${field}: required but missing or empty`);
        validation.isValid = false;
      }
    }
  }

  // Check soft recommendations
  for (const field of RECOMMENDED_FIELDS) {
    const value = normalized[field];
    if (value === null || value === undefined) {
      validation.softWarnings.push(`${field}: recommended but missing`);
    }
  }

  // Build envelope
  const envelope = {
    // Identity (REQUIRED)
    packet_key: normalized.packet_key || '',
    source_ref: normalized.source_ref || '',
    source_ref_key: normalized.source_ref_key || normalized.source_ref || '',
    feature_id: normalized.feature_id || '',
    feature_label: normalized.feature_label || null,
    title_id: normalized.title_id || null,
    tree_node_id: normalized.tree_node_id || null,

    // Classification & Topology (Soft)
    domain_class: normalized.domain_class || null,
    ontology_label: normalized.ontology_label || null,
    topology_label: normalized.topology_label || null,

    // Feature Enrichment (REQUIRED)
    used_concepts: normalized.used_concepts || [],

    // Mirrors & Cache Pointers (Soft)
    qdrant_point_id: normalized.qdrant_point_id || null,

    // Graph & Community (Soft)
    community_id: normalized.community_id || null,
    graph_community_id: normalized.graph_community_id || null,

    // Topology (Soft)
    som_cluster: normalized.som_cluster || null,
    som_row: normalized.som_row || null,
    som_col: normalized.som_col || null,

    // Metrics (Soft)
    page_rank_score: normalized.page_rank_score || null,
    cheirank_score: normalized.cheirank_score || null,
    betweenness_centrality: normalized.betweenness_centrality || null,
    closeness_centrality: normalized.closeness_centrality || null,
    k_core: normalized.k_core || null,

    // Confidence & Provenance (Soft)
    classification_source: normalized.classification_source || null,
    classification_confidence: normalized.classification_confidence || null,

    // Metadata (Soft)
    created_at: normalized.created_at || new Date(),
    updated_at: normalized.updated_at || new Date(),
    summary: normalized.summary || null,
  };

  return { envelope, validation };
}

/**
 * Normalize packet input to canonical field names
 *
 * Handles both raw Postgres rows and partially-populated objects
 */
function normalizePacket(packet) {
  if (!packet || typeof packet !== 'object') {
    return {};
  }

  // Extract from metadata JSONB if present
  const metadata = packet.metadata && typeof packet.metadata === 'object' ? packet.metadata : {};
  const payload = packet.payload && typeof packet.payload === 'object' ? packet.payload : {};

  // Priority chain: payload > packet > metadata > fallback
  return {
    packet_key: packet.packet_key || payload.packet_key || metadata.packet_key,
    source_ref: packet.source_ref || payload.source_ref || metadata.source_ref,
    source_ref_key: packet.source_ref_key || payload.source_ref_key || metadata.source_ref_key,
    feature_id: packet.feature_id || payload.feature_id || metadata.feature_id,
    feature_label: packet.feature_label || payload.feature_label || metadata.feature_label,
    title_id: packet.title_id || payload.title_id || metadata.title_id,
    tree_node_id: packet.tree_node_id || payload.tree_node_id || metadata.tree_node_id,

    domain_class: packet.domain_class || payload.domain_class || metadata.domain_class,
    ontology_label: packet.ontology_label || payload.ontology_label || metadata.ontology_label,
    topology_label: packet.topology_label || payload.topology_label || metadata.topology_label,

    used_concepts: packet.used_concepts || payload.used_concepts || metadata.used_concepts,
    qdrant_point_id:
      packet.qdrant_point_id || payload.qdrant_point_id || metadata.qdrant_point_id,

    community_id: packet.community_id || payload.community_id || metadata.community_id,
    graph_community_id:
      packet.graph_community_id || payload.graph_community_id || metadata.graph_community_id,

    som_cluster: packet.som_cluster || payload.som_cluster || metadata.som_cluster,
    som_row: packet.som_row || payload.som_row || metadata.som_row,
    som_col: packet.som_col || payload.som_col || metadata.som_col,

    page_rank_score: packet.page_rank_score || payload.page_rank_score || metadata.page_rank_score,
    cheirank_score: packet.cheirank_score || payload.cheirank_score || metadata.cheirank_score,
    betweenness_centrality:
      packet.betweenness_centrality ||
      payload.betweenness_centrality ||
      metadata.betweenness_centrality,
    closeness_centrality:
      packet.closeness_centrality || payload.closeness_centrality || metadata.closeness_centrality,
    k_core: packet.k_core || payload.k_core || metadata.k_core,

    classification_source:
      packet.classification_source || payload.classification_source || metadata.classification_source,
    classification_confidence:
      packet.classification_confidence ||
      payload.classification_confidence ||
      metadata.classification_confidence,

    created_at: packet.created_at || payload.created_at || metadata.created_at,
    updated_at: packet.updated_at || payload.updated_at || metadata.updated_at,
    summary: packet.summary || payload.summary || metadata.summary,
  };
}

/**
 * Validate envelope against canonical schema
 *
 * @param {Object} envelope Envelope to validate
 * @returns {Object} Validation result
 */
export function validateCanonicalEnvelope(envelope) {
  const result = {
    isValid: true,
    hardFailures: [],
    softWarnings: [],
  };

  if (!envelope || typeof envelope !== 'object') {
    result.isValid = false;
    result.hardFailures.push('envelope is not an object');
    return result;
  }

  // Check hard requirements
  for (const field of REQUIRED_FIELDS) {
    const value = envelope[field];
    if (
      value === null ||
      value === undefined ||
      (field === 'used_concepts' && Array.isArray(value) && value.length === 0)
    ) {
      if (field !== 'used_concepts') {
        result.hardFailures.push(`${field}: required but missing or empty`);
        result.isValid = false;
      }
    }
  }

  // Check soft recommendations
  for (const field of RECOMMENDED_FIELDS) {
    const value = envelope[field];
    if (value === null || value === undefined) {
      result.softWarnings.push(`${field}: recommended but missing`);
    }
  }

  return result;
}

/**
 * Report validation errors
 *
 * Hard failures throw; soft warnings log
 *
 * @param {Object} validation Validation result
 * @param {string} packetKey Packet key for debugging
 * @throws {Error} If hard failures detected
 */
export function reportValidation(validation, packetKey) {
  if (validation.hardFailures.length > 0) {
    const msg = `Canonical envelope validation failed for ${packetKey}:\n${validation.hardFailures.join('\n')}`;
    throw new Error(msg);
  }

  if (validation.softWarnings.length > 0) {
    console.warn(`Canonical envelope warnings for ${packetKey}:`, validation.softWarnings);
  }
}