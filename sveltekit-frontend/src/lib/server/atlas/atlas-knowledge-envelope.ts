/**
 * Atlas Knowledge Envelope — Canonical Contract
 *
 * A knowledge record answers six questions:
 *   What is it?       → identity
 *   Where did it come from? → source
 *   What does it do?  → semantics
 *   What structure?   → structure
 *   How does it relate? → topology (graph) + ontology (tuples)
 *   How reliable?     → provenance
 *
 * PostgreSQL owns this envelope.
 * Qdrant, Neo4j, and Valkey receive projections derived from it.
 *
 * The readable rendering (renderKnowledgePacket) is derived and hash-versioned.
 * The machine envelope is authoritative.
 */

export const ATLAS_KNOWLEDGE_ENVELOPE_VERSION = 'atlas-knowledge-envelope-v1' as const;

// ─── Core Envelope ───────────────────────────────────────────────────────────

export interface AtlasKnowledgeEnvelope {
  schemaVersion: typeof ATLAS_KNOWLEDGE_ENVELOPE_VERSION;

  /** Stable cross-store identity — all stores join on these fields */
  identity: {
    /** Stable human-readable ID, e.g. "ace:packet:auth:001" */
    packetKey: string;
    /** Postgres codebase_chunk_index.id UUID */
    chunkId: string;
    /** Postgres atlas_packets.id UUID (if linked) */
    packetId: string | null;
    /** SHA-256 of deterministic (sourceRef|language|kind|name|lines) */
    treeNodeId: string | null;
    /** Repository slug, e.g. "deeds-web-app" */
    repositoryId: string;
  };

  /** Provenance: where the content physically lives */
  source: {
    /** Canonical path relative to repo root, e.g. "src/lib/server/auth.ts" */
    sourceRef: string;
    sourceKind: 'repo' | 'url' | 'database' | 'artifact';
    filePath: string | null;
    /** Git commit SHA at extraction time */
    revision: string | null;
    startLine: number | null;
    endLine: number | null;
    /** SHA-256 of raw chunk content */
    contentHash: string;
  };

  /** AST-derived structural facts */
  structure: {
    language: string | null;
    /** 'function' | 'class' | 'interface' | 'variable' | 'import' | 'export' | 'type' | 'unknown' */
    symbolKind: string | null;
    symbolName: string | null;
    /** SHA-256 tree_node_id of the parent scope, if any */
    parentTreeNodeId: string | null;
    imports: string[];
    exports: string[];
    /** Raw AST fact tuples extracted by tree-sitter / ast-grep */
    astFacts: Record<string, unknown>[];
  };

  /** Semantic understanding — may come from deterministic rules, NB, XGBoost, or Gemma4 */
  semantics: {
    summary: string | null;
    purpose: string | null;
    keywords: string[];
    conceptIds: string[];
    usedConcepts: string[];
    domainClass: string | null;
    /** 0-1, corresponds to classifier tier (deterministic=0.95+, NB=0.7-0.9, XGB=0.85+, LLM=0.6-0.8) */
    domainConfidence: number | null;
    /** 'deterministic' | 'naive_bayes' | 'xgboost' | 'llm_fallback' */
    domainClassifierTier: 'deterministic' | 'naive_bayes' | 'xgboost' | 'llm_fallback' | null;
  };

  /**
   * Derived topology — independent model artifacts.
   * Each sub-object carries its own version so models can be retrained independently.
   */
  topology: {
    kmeans: {
      cluster: number;
      centroidDistance: number;
      secondClusterId: number | null;
      clusterMargin: number | null;
      version: string;  // e.g. "content384-spherical-k128-v1"
    } | null;
    som: {
      row: number;
      col: number;
      cell: number;
      version: string;  // e.g. "content384-som20x20-v2"
    } | null;
    latent: {
      dimension: number;
      version: string;  // e.g. "ae384-64-v1"
    } | null;
    communityId: string | null;
    pageRank: number | null;
  };

  /**
   * Projection contracts — what is written to each store and under what contract.
   * projectionHash changes when any contract field changes, invalidating caches.
   */
  projection: {
    /** e.g. "embeddinggemma-384-v1" */
    embeddingContract: string;
    /** e.g. "bm42-v1" or null if not indexed */
    sparseContract: string | null;
    /** Collection + named vector, e.g. "codebase_chunks_384_hybrid:content" */
    qdrantContract: string;
    /** Neo4j label + relationship type, e.g. "CodeChunk:SIMILAR_TOPOLOGY" */
    graphContract: string | null;
    /** SHA-256 of (embeddingContract|sparseContract|qdrantContract) — cache invalidation key */
    projectionHash: string;
  };

  /** Audit trail for classification and embedding decisions */
  provenance: {
    /** Map of tool → version, e.g. { "tree-sitter": "0.22.0", "atlas-ast-facts": "v2" } */
    extractorVersions: Record<string, string>;
    classifierVersion: string | null;
    generatedAt: string;   // ISO-8601
    validatedAt: string | null;
  };
}

// ─── Classifier Tiers ────────────────────────────────────────────────────────

/** Confidence thresholds per tier */
export const CLASSIFIER_THRESHOLDS = {
  deterministic: 0.95,
  naive_bayes:   0.70,
  xgboost:       0.85,
  llm_fallback:  0.60,
} as const;

/** Tier selection logic: accept the highest-confidence tier that meets its threshold */
export function selectClassifierTier(
  deterministicConf: number | null,
  nbConf: number | null,
  xgbConf: number | null,
): AtlasKnowledgeEnvelope['semantics']['domainClassifierTier'] {
  if (deterministicConf != null && deterministicConf >= CLASSIFIER_THRESHOLDS.deterministic) {
    return 'deterministic';
  }
  if (xgbConf != null && xgbConf >= CLASSIFIER_THRESHOLDS.xgboost) {
    return 'xgboost';
  }
  if (nbConf != null && nbConf >= CLASSIFIER_THRESHOLDS.naive_bayes) {
    return 'naive_bayes';
  }
  return 'llm_fallback';
}

// ─── Ontology Tuples ─────────────────────────────────────────────────────────

/**
 * Canonical relational ontology tuple.
 * Maps to the atlas_ontology_tuples table.
 *
 * Examples:
 *   function:validateSession CALLS function:getSession
 *   packet:auth:001 USES_CONCEPT retrieval.hybrid
 *   file:src/lib/server/auth.ts IMPORTS package:lucia
 */
export interface OntologyTuple {
  subjectId: string;   // e.g. "function:validateSession"
  predicate: string;   // e.g. "CALLS" | "IMPLEMENTS" | "USES_CONCEPT" | "IMPORTS" | "TESTS"
  objectId: string;    // e.g. "function:getSession"

  sourceRef: string | null;
  /** 'ast' | 'import_graph' | 'llm' | 'xgboost' | 'manual' */
  origin: string;
  confidence: number;  // 0-1
  version: string;     // e.g. "atlas-ast-facts-v2"

  metadata: Record<string, unknown>;
}

// ─── Qdrant Payload Projection ────────────────────────────────────────────────

/**
 * The subset of envelope fields written into Qdrant payload.
 * Must include sourceRef, packetKey, and all filterable fields.
 * Per-point metrics (centroidDistance, clusterMargin) stay in Postgres.
 */
export interface QdrantPayloadProjection {
  // Identity
  packet_key: string;
  chunk_id: string;
  source_ref: string;
  file_path: string | null;
  repository_id: string;
  tree_node_id: string | null;
  content_hash: string;

  // Structure
  language: string | null;
  symbol_kind: string | null;
  symbol_name: string | null;

  // Semantics
  domain_class: string | null;
  domain_confidence: number | null;
  keywords: string[];
  concept_ids: string[];

  // Topology (filterable cluster identity — NOT per-point metrics)
  kmeans_cluster: number | null;
  kmeans_model_version: string | null;
  second_cluster_id: number | null;
  som_cell: number | null;
  community_id: string | null;

  // Projection provenance
  embedding_contract: string;
  sparse_contract: string | null;
  projection_hash: string;
}

// ─── Human-readable Rendering ────────────────────────────────────────────────

/**
 * Render a validated envelope as a structured text packet for ACE/Gemma4.
 * This is what gets packed into the LLM context window.
 */
export function renderKnowledgePacket(e: AtlasKnowledgeEnvelope): string {
  const lines: string[] = [];

  const kind = e.structure.symbolKind ?? 'chunk';
  const symbol = e.structure.symbolName ?? '(anonymous)';

  lines.push(`TITLE: ${symbol} [${kind}]`);
  lines.push(`SOURCE: ${e.source.sourceRef}${e.source.startLine != null ? `#L${e.source.startLine}-${e.source.endLine}` : ''}`);
  if (e.structure.language) lines.push(`LANGUAGE: ${e.structure.language}`);
  lines.push(`KIND: ${kind}`);
  lines.push(`SYMBOL: ${symbol}`);
  lines.push('');

  if (e.semantics.purpose || e.semantics.summary) {
    lines.push('PURPOSE:');
    lines.push(e.semantics.purpose ?? e.semantics.summary ?? '');
    lines.push('');
  }

  if (e.semantics.keywords.length > 0) {
    lines.push('KEYWORDS:');
    lines.push(e.semantics.keywords.join(', '));
    lines.push('');
  }

  if (e.semantics.conceptIds.length > 0) {
    lines.push('CONCEPTS:');
    lines.push(e.semantics.conceptIds.join(', '));
    lines.push('');
  }

  const structural: string[] = [];
  if (e.structure.imports.length > 0) {
    structural.push(...e.structure.imports.map(i => `- imports ${i}`));
  }
  if (e.structure.exports.length > 0) {
    structural.push(...e.structure.exports.map(x => `- exports ${x}`));
  }
  if (structural.length > 0) {
    lines.push('STRUCTURE:');
    lines.push(...structural);
    lines.push('');
  }

  lines.push('PROVENANCE:');
  const extractors = Object.entries(e.provenance.extractorVersions)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  lines.push(extractors || 'unknown');
  if (e.projection.embeddingContract) {
    lines.push(`Embedding: ${e.projection.embeddingContract}`);
  }
  if (e.projection.sparseContract) {
    lines.push(`Sparse: ${e.projection.sparseContract}`);
  }
  lines.push(`Envelope: ${e.schemaVersion}`);

  return lines.join('\n');
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Hard-fail conditions — reject before writing to any store */
export function validateEnvelope(e: AtlasKnowledgeEnvelope): string[] {
  const errors: string[] = [];
  if (!e.identity.packetKey?.trim()) errors.push('missing identity.packetKey');
  if (!e.identity.chunkId?.trim())   errors.push('missing identity.chunkId');
  if (!e.source.sourceRef?.trim())   errors.push('missing source.sourceRef');
  if (!e.source.contentHash?.trim()) errors.push('missing source.contentHash');
  if (!e.projection.embeddingContract?.trim()) errors.push('missing projection.embeddingContract');
  if (!e.projection.qdrantContract?.trim())    errors.push('missing projection.qdrantContract');
  if (!e.projection.projectionHash?.trim())    errors.push('missing projection.projectionHash');
  return errors;
}

export function isValidEnvelope(e: AtlasKnowledgeEnvelope): boolean {
  return validateEnvelope(e).length === 0;
}

// ─── Projection Builder ───────────────────────────────────────────────────────

/** Extract the Qdrant-writable payload subset from a validated envelope */
export function toQdrantPayload(e: AtlasKnowledgeEnvelope): QdrantPayloadProjection {
  return {
    packet_key:         e.identity.packetKey,
    chunk_id:           e.identity.chunkId,
    source_ref:         e.source.sourceRef,
    file_path:          e.source.filePath,
    repository_id:      e.identity.repositoryId,
    tree_node_id:       e.identity.treeNodeId,
    content_hash:       e.source.contentHash,
    language:           e.structure.language,
    symbol_kind:        e.structure.symbolKind,
    symbol_name:        e.structure.symbolName,
    domain_class:       e.semantics.domainClass,
    domain_confidence:  e.semantics.domainConfidence,
    keywords:           e.semantics.keywords,
    concept_ids:        e.semantics.conceptIds,
    kmeans_cluster:     e.topology.kmeans?.cluster ?? null,
    kmeans_model_version: e.topology.kmeans?.version ?? null,
    second_cluster_id:  e.topology.kmeans?.secondClusterId ?? null,
    som_cell:           e.topology.som?.cell ?? null,
    community_id:       e.topology.communityId,
    embedding_contract: e.projection.embeddingContract,
    sparse_contract:    e.projection.sparseContract,
    projection_hash:    e.projection.projectionHash,
  };
}
