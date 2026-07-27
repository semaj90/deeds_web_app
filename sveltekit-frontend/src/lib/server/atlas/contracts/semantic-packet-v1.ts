/**
 * SemanticPacketV1 — Canonical Packet Contract (LOCKED)
 *
 * This is the immutable interface that ALL packet operations must conform to:
 * - Producers output SemanticPacketV1 objects (camelCase)
 * - Adapters convert to/from persistence at boundaries (snake_case)
 * - Consumers receive SemanticPacketV1 objects (camelCase)
 *
 * VERSION: 1.0 (LOCKED, June 26 2026)
 * DO NOT MODIFY without explicit schema versioning (v1.1, v2.0, etc.)
 *
 * Identity Policy (immutable):
 *   packetKey = hash(workspaceId + normalized_sourceRef + semanticAnchor)
 *   Always starts with 'pkt_' prefix
 *   Format: pkt_<32-char hex SHA256>
 *
 * Lineage Metadata (mutable):
 *   treeNodeId = hash(sourceRef + language + nodeKind + qualifiedName + signatureHash)
 *   Always starts with 'tree_' prefix
 *   Changes when code structure changes; does NOT affect packetKey
 *
 * Content Version (separate):
 *   contentHash = sha256(packet_content)
 *   Tracks version of actual packet content
 */

export interface SemanticPacketV1 {
  // ── STABLE LOGICAL IDENTITY (IMMUTABLE) ──────────────────────────
  // These fields define packet identity. Changing any = new packet_key.
  packetKey: string; // pkt_<32-char hex>, immutable canonical identity
  workspaceId: string; // tenant separator, immutable
  sourceRef: string; // normalized file path (POSIX, lowercase), immutable
  semanticAnchor: string; // semantic grouping (function/class/feature name)

  // ── SEMANTIC CLASSIFICATION (IMMUTABLE AFTER CREATION) ────────────
  featureId: string; // semantic grouping key (e.g., "auth.sessions")
  featureLabel: string; // human-readable label (e.g., "Authentication Sessions")
  titleId: string; // optional secondary semantic grouping (e.g., "session-management")
  domainClass: string; // domain classification (e.g., "infrastructure", "business-logic")

  // ── STRUCTURAL METADATA (MUTABLE LINEAGE) ────────────────────────
  // These change when code structure changes. Do NOT affect packetKey.
  treeNodeId?: string | null; // tree_<32-char hex>, structural identity
  language?: string; // 'typescript' | 'python' | 'rust' | etc
  nodeKind?: 'function' | 'class' | 'interface' | 'variable' | 'type' | 'unknown';
  qualifiedName?: string | null; // full scoped name (e.g., "AuthService.validateSession")
  signatureHash?: string | null; // hash of function signature (for overload detection)
  parentQualifiedName?: string | null; // parent class/module name

  // ── CONTENT VERSION (SEPARATE FROM IDENTITY) ──────────────────────
  contentHash?: string | null; // sha256(packet_content), full 64-char hex
  summary?: string | null; // semantic summary of packet
  summaryModel?: string | null; // which model generated this summary (e.g., "gemma4:v1")

  // ── WORKSPACE & ONTOLOGY VERSION ────────────────────────────────
  workspaceRevision?: string | null; // workspace schema version (e.g., "2026-07-26")
  ontologyId?: string | null; // ontology identifier (e.g., "legal-iq:v2.1")
  ontologyVersion?: string | null; // ontology version constraint (e.g., "v1.0", ">=v1.0,<v2.0")

  // ── VECTOR REPRESENTATIONS (MULTI-LANE RETRIEVAL) ────────────────
  // Same packet can have multiple embeddings in different dimensions/models
  embedding?: {
    semantic_384?: {
      values: number[]; // 384-dim canonical online retrieval
      modelVersion: string; // e.g., "embeddinggemma:384:v4"
      normalized: boolean; // L2-normalized
      qdrantPointId?: string | null;
      collectionName?: string; // "codebase_chunks_384"
    };
    legacy_768?: {
      values?: number[] | null; // 768-dim legacy recall reference (may be null)
      modelVersion?: string | null;
      normalized?: boolean;
      qdrantPointId?: string | null;
      collectionName?: string; // "codebase_chunks_768"
      status?: 'ACTIVE' | 'REFERENCE_ONLY' | 'MIGRATION_SOURCE' | 'SUPERSEDED';
    };
    latent_64?: {
      values?: number[] | null; // 64-dim routing/clustering (AE latent space)
      modelVersion?: string | null;
      geometry?: {
        kmeansClusterId?: number | null;
        centroidDistance?: number | null;
        somCellId?: number | null;
        somRow?: number | null;
        somCol?: number | null;
        hilbertOrder?: number | null;
      };
    };
    topology_4d?: number[] | null; // 4D topology projection (visualization)
  };

  // ── DERIVED PARAMETERS (CACHED COMPUTATIONS) ───────────────────
  derivedParameters?: {
    // Static indexed (offline, stable)
    domainClassScore?: number; // domain class authority [0, 1]
    globalPageRankPercentile?: number; // authority percentile [0, 100]

    // Query dynamic (per-query, short TTL)
    cosine384?: number; // cosine similarity to query in 384-dim
    cosine768?: number; // cosine similarity to query in 768-dim
    bm25Score?: number; // lexical BM25 score
    bm42Score?: number; // extended BM25 with field weighting
    centroidSimilarity?: number; // similarity to cluster centroid
    graphPathScore?: number; // graph traversal authority
    logisticProbability?: number; // logistic regression calibrated probability
    xgboostScore?: number; // XGBoost reranker score

    // Learned model parameters (stored in registry, loaded at runtime)
    logisticVersion?: string; // model version (e.g., "logistic:v2.1")
    xgboostVersion?: string; // model version (e.g., "xgboost:phase18:v3")
    fusionStrategy?: 'RRF' | 'LOGISTIC' | 'XGBOOST' | 'HYBRID'; // rank fusion strategy
    calibrationModelId?: string; // reference to calibration model in registry
  };

  // ── RANK FUSION (MULTI-LANE COMBINATION) ──────────────────────
  rankFusion?: {
    rffScore?: number; // Reciprocal Rank Fusion: sum(1 / (k + rank_in_lane)) for k=60
    fusedRanks?: {
      semantic_384?: number;
      legacy_768?: number;
      bm25?: number;
      graph?: number;
      routing?: number;
    };
  };

  // ── AUDIT & LIFECYCLE ──────────────────────────────────────────
  createdAt: Date;
  updatedAt: Date;
  identityLane?: 'canonical' | 'recoverable' | 'quarantine'; // identity validation state
  identityConfidence?: number; // confidence [0, 1] that identity is correct

  // ── LINEAGE TRACKING (STRUCTURAL CHANGES) ──────────────────────
  // tree_node_id may change; these track the changes
  previousTreeNodeId?: string | null; // prior tree_node_id (for audit trail)
  structuralRevision?: string | null; // structural change version (e.g., "2026-07-26:refactor-auth")
  changeType?: 'MOVED' | 'RENAMED' | 'REFACTORED' | 'DELETED' | 'CREATED';
}

/**
 * Zod schema for runtime validation (optional, can be added later)
 *
 * import { z } from 'zod';
 *
 * export const SemanticPacketV1Schema = z.object({
 *   packetKey: z.string().regex(/^pkt_[a-f0-9]{32}$/),
 *   workspaceId: z.string().min(1),
 *   sourceRef: z.string().min(1),
 *   semanticAnchor: z.string().min(1),
 *   featureId: z.string().min(1),
 *   // ... rest of fields
 * });
 */

/**
 * Factory function: create a minimal valid SemanticPacketV1
 *
 * Use this when constructing packets from known identity fields.
 */
export function createSemanticPacketV1(input: {
  packetKey: string;
  workspaceId: string;
  sourceRef: string;
  semanticAnchor: string;
  featureId: string;
  featureLabel: string;
  titleId?: string;
  domainClass?: string;
}): SemanticPacketV1 {
  return {
    packetKey: input.packetKey,
    workspaceId: input.workspaceId,
    sourceRef: input.sourceRef,
    semanticAnchor: input.semanticAnchor,
    featureId: input.featureId,
    featureLabel: input.featureLabel,
    titleId: input.titleId ?? '',
    domainClass: input.domainClass ?? 'unknown',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Verify SemanticPacketV1 required fields.
 *
 * Returns violations (missing fields) rather than throwing.
 */
export function validateSemanticPacketV1(
  packet: Partial<SemanticPacketV1>
): { isValid: boolean; violations: string[] } {
  const violations: string[] = [];

  // Required fields for identity
  if (!packet.packetKey) violations.push('packetKey is required');
  else if (!packet.packetKey.startsWith('pkt_')) violations.push('packetKey must start with pkt_');

  if (!packet.workspaceId) violations.push('workspaceId is required');
  if (!packet.sourceRef) violations.push('sourceRef is required');
  if (!packet.semanticAnchor) violations.push('semanticAnchor is required');
  if (!packet.featureId) violations.push('featureId is required');
  if (!packet.featureLabel) violations.push('featureLabel is required');

  // Required for timestamps
  if (!packet.createdAt) violations.push('createdAt is required');
  if (!packet.updatedAt) violations.push('updatedAt is required');

  return {
    isValid: violations.length === 0,
    violations,
  };
}
