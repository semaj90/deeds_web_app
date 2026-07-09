#!/usr/bin/env node

/**
 * Shared library for packet identity enrichment.
 * Both extract-ast-keywords.mjs and extract-source-kind-features.mjs import this.
 *
 * Responsibilities:
 * - Feature identity inference (feature_id, feature_label, tree_node_id)
 * - HMM state classification (CANONICAL, RECOVERABLE, UNKNOWN)
 * - Semantic title ID derivation (HyperRAG lookups)
 *
 * This keeps identity logic DRY and ensures both extraction lanes use identical rules.
 */

/**
 * Infer feature identity from packet signals
 */
export function inferFeatureIdentity(input) {
  const { source_ref, source_kind, predicted_domain, keywords = [] } = input;

  // Normalize path: remove prefix, strip extension
  const cleanPath = source_ref
    .replace(/^sveltekit-frontend\//, '')
    .replace(/^scripts\/atlas\//, '')
    .replace(/^docs\//, '')
    .replace(/\.[^.]+$/, '');

  // Top keyword as semantic signal
  const topKeyword = keywords.length > 0 ? keywords[0] : 'general';

  // feature_id: canonical identity for XGBoost + RRF
  const feature_id = `${predicted_domain}.${topKeyword}.${cleanPath}`
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '_');

  // feature_label: human-readable label
  const feature_label = `${predicted_domain} · ${topKeyword}`;

  // tree_node_id: hierarchical position in feature taxonomy
  const tree_node_id = `${source_kind}/${predicted_domain}/${topKeyword}`;

  return { feature_id, feature_label, tree_node_id };
}

/**
 * Infer HMM state: validates identity before routing
 * Returns state AFTER identity is inferred (not before)
 */
export function inferHmmState(input) {
  const { source_kind, feature_id, tree_node_id, domain_confidence = 0.5, qdrant_point_id = null, has_keywords = false } = input;

  // Missing identity signals: unrecoverable
  if (!feature_id || !tree_node_id) return 'UNKNOWN';

  // Low confidence: recoverable (fallback to rules)
  if (domain_confidence < 0.35) return 'RECOVERABLE';

  // Code files without embeddings: recoverable (can extract AST)
  if (!qdrant_point_id && source_kind === 'code') return 'RECOVERABLE';

  // High confidence + keywords: canonical
  if (has_keywords && domain_confidence >= 0.7) return 'CANONICAL';

  // Default: recoverable (try fallback rules)
  return 'RECOVERABLE';
}

/**
 * Derive semantic title ID for HyperRAG lookups
 */
export function deriveSemanticTitleId(packet) {
  const { source_ref, feature_id = 'unknown', derived_title = '' } = packet;

  // Combine identity signals for stable HyperRAG identifier
  const base = [feature_id, derived_title, source_ref]
    .join('|')
    .toLowerCase();

  // Use first 8 chars of base + last 8 chars (avoid full hash for readability)
  const prefix = base.slice(0, 8).replace(/[^a-z0-9]/g, '_');
  const suffix = base.slice(-8).replace(/[^a-z0-9]/g, '_');

  return `hyperrag:rpc:semantic_title_id:${prefix}_${suffix}`;
}

/**
 * Unified enrichment pipeline
 * Call this from extraction scripts after domain classification
 * Ensures both lanes use identical identity inference
 */
export function enrichPacketIdentity(input) {
  const { source_ref, source_kind, predicted_domain, keywords, domain_confidence, qdrant_point_id, derived_title } = input;

  // Step 1: Infer feature identity
  const identity = inferFeatureIdentity({
    source_ref,
    source_kind,
    predicted_domain,
    keywords
  });

  // Step 2: Infer HMM state (validates identity)
  const hmm_state = inferHmmState({
    source_kind,
    feature_id: identity.feature_id,
    tree_node_id: identity.tree_node_id,
    domain_confidence,
    qdrant_point_id,
    has_keywords: keywords && keywords.length > 0
  });

  // Step 3: Derive semantic title ID
  const semantic_title_id = deriveSemanticTitleId({
    source_ref,
    feature_id: identity.feature_id,
    derived_title
  });

  return {
    feature_id: identity.feature_id,
    feature_label: identity.feature_label,
    tree_node_id: identity.tree_node_id,
    hmm_state,
    semantic_title_id
  };
}
