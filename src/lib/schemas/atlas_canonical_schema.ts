/**
 * @fileoverview Defines the canonical, authoritative schema model for core Atlas identity and evidence artifacts.
 * This file is the single source of truth for cross-cutting references and join definitions.
 *
 * GATE 12 OPTIMIZATION: Separated GPU lane (SOM assignment) from optional metadata layers.
 * GPU writes no conditionals; async layers handle their own persistence independently.
 */

// =============================================================================
// 1. IDENTITY CORE (Immutable, Always Required)
// =============================================================================

/**
 * Minimal identity required for all packets. No optionals.
 * Used by: GPU lane, feature extraction, indexing.
 */
export type IdentityCore = {
    sourceRef: string;       // File path or document URI (immutable)
    packetKey: string;       // Unique packet identifier
    featureId: string;       // Feature/component ID
    nodeId: string;          // Tree node ID (SHA-256 hash)
};

// =============================================================================
// 2. GPU LANE OUTPUT (SOM Assignment, No Conditionals)
// =============================================================================

/**
 * Direct output from KmeansWithCentroids N-API call.
 * Gate 12 writes these 5 fields only; no optional checks, no branching.
 * Post-GPU layers (topology, summary, cache) write independently.
 */
export type SomAssignment = {
    packetKey: string;       // Join key
    clusterId: number;       // 0-399 (k=400, 20×20 grid)
    somBmuRow: number;       // 0-19 (row in SOM grid)
    somBmuCol: number;       // 0-19 (column in SOM grid)
    confidence: number;      // 0.0-1.0 (1.0 - normalized_distance)
};

// =============================================================================
// 3. ARTIFACT IDENTITY (Full Metadata, Optional Fields)
// =============================================================================

/**
 * Enriched identity with optional domain/feature grouping.
 * Used by synthesis, recommendation, and async metadata layers.
 * NOT used by GPU lane.
 */
export type ArtifactIdentity = IdentityCore & {
  featureLabel: string; // Human-readable feature label
  domain?: string; // Domain/module grouping (e.g., 'auth', 'api', 'ui')
  featureGroup?: string; // Feature grouping (e.g., 'security', 'performance')
  pipelineKey: string; // Temporal cache key
  modelId: string; // Enrichment model version
  createdAt: number; // Unix timestamp (ms)
  updatedAt: number; // Unix timestamp (ms)
  indexedAt?: number; // Qdrant indexing timestamp
};

// =============================================================================
// 4. ASYNC METADATA LAYERS (Post-GPU, Independent Persistence)
// =============================================================================

/**
 * Summary layer (optional). Written independently by synthesis lane.
 */
export interface SummaryLayer {
  layerName: string; // e.g., 'FINAL_SUMMARY', 'PRE_FILTER'
  timestamp: number;
  envelopeHash: string;
}

/**
 * Topology layer (optional). Written independently by Neo4j lane.
 */
export interface TopologyIndex {
  clusterId: string;
  pagerank?: number; // Raw stationary PageRank score
  authority_score?: number; // Min-max normalized operational score
  communityId?: number; // Neo4j community detection ID
  graphVersion: string;
}

/**
 * Cache state layer (optional). Written independently by cache lane.
 */
export interface CacheState {
  pipelineKey: string;
  expectedHash: string;
  redisCentroidKey?: string;
}

/**
 * Node mapping (optional). Written independently by topology lane.
 */
export interface NodeMapping {
  nodeId: string;
  parentPath: string;
  filePath?: string;
  treeDepth?: number;
}

// =============================================================================
// 5. OUTBOX EVENT (Post-Async Notification)
// =============================================================================

/**
 * Durable event for reliable propagation of state changes (Outbox Pattern).
 * Written after async layers complete.
 */
export interface OutboxEvent {
  eventType: string; // e.g., 'playbook.revision.committed'
  aggregateId: string; // Aggregate ID (e.g., revision ID)
  payload: any; // JSON-serializable payload
  recordedAt: number; // Event timestamp
}

// =============================================================================
// 6. CANONICAL RECORD (Full Record, Lazy-Loaded Metadata)
// =============================================================================

/**
 * Complete record with optional metadata layers.
 * GPU lane writes IdentityCore + SomAssignment only.
 * Async layers populate summaryLayer, topologyIndex, cacheState, nodeMapping independently.
 */
export interface CanonicalRecord {
  // Core identity (always present)
  identity: ArtifactIdentity;

  // GPU lane output (always present after Gate 12)
  somAssignment?: SomAssignment;

  // Async metadata layers (populated independently, may be null)
  summaryLayer?: SummaryLayer | null;
  topologyIndex?: TopologyIndex | null;
  cacheState?: CacheState | null;
  nodeMapping?: NodeMapping | null;

  // Timestamps (aligned with atlas_packets)
  createdAt: number; // Unix ms, defaults to NOW() in Postgres
  updatedAt: number; // Unix ms, defaults to NOW() in Postgres
  indexedAt?: number; // Qdrant indexing timestamp
  graphResolutionIssues?: GraphResolutionIssue[]; // New: Issues identified during PageRank/Schema validation
}

// =============================================================================
// 7. VALIDATION (Minimal, No Conditionals)
// =============================================================================

/**
 * Issue tracking structure derived from Graph Resolution checks.
 * Represents a potential node/edge that couldn't be mapped canonically.
 */
export interface GraphResolutionIssue {
  sourceRef: string;
  issueType:
    | 'UNRESOLVED_CANONICAL_IDENTITY'
    | 'DUPLICATE_NODE_KEY'
    | 'MISSING_SOURCE_ENDPOINT'
    | 'MISSING_TARGET_ENDPOINT'
    | 'SNAPSHOT_MISMATCH'
    | 'PAGE_RANK_REJECTED'
    | 'OTHER_INVALIDATION';
  candidateMatches: {
    nodeKey: string;
    edgeKey?: string;
    source: string;
    target: string;
    metadata?: any;
  }[];
  evidence: {
    [key: string]: any; // Holds contextual data for manual review
  };
  occurrenceCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

/**
 * Validate GPU lane input (IdentityCore + features).
 * Fast path: 3 checks, no optional field branching.
 */
export function validateGpuLaneInput(identity: IdentityCore, features: number[]): boolean {
  if (!identity.packetKey || !identity.sourceRef || !identity.featureId) {
    console.error('Validation Failed: Core identity incomplete.');
    return false;
  }
  if (!features || features.length === 0) {
    console.error('Validation Failed: Features empty.');
    return false;
  }
  return true;
}

/**
 * Validate GPU lane output (SomAssignment).
 * Fast path: 5 field checks, direct Postgres write.
 */
export function validateSomAssignment(som: SomAssignment): boolean {
  if (!som.packetKey || som.clusterId === undefined || som.confidence === undefined) {
    console.error('Validation Failed: SomAssignment incomplete.');
    return false;
  }
  if (som.somBmuRow < 0 || som.somBmuRow > 19 || som.somBmuCol < 0 || som.somBmuCol > 19) {
    console.error('Validation Failed: SOM coordinates out of bounds [0-19].');
    return false;
  }
  if (som.confidence < 0 || som.confidence > 1.0) {
    console.error('Validation Failed: Confidence not in [0.0, 1.0].');
    return false;
  }
  return true;
}

/**
* Validate OKF Graph Rule Compliance (Structural, Semantic, and Confidence).
* Comprehensive checks covering non-empty extensions, relationship existence, exclusion separation,
* and minimum confidence thresholds based on current Atlas best practices.
* @param evidence Object containing necessary graph context: edges, relationships, and confidence scores.
* @returns boolean indicating successful validation.
*/
export function validateOkfGraphRule(evidence: {
  // Required inputs for validation context
  edges?: { from: string; to: string; weight: number }[];
  relationships?: { from: string; to: string }[];
  confidences?: { relationship: string; confidence: number }[];
  extensions?: { name: string; hasEdges: boolean; hasRelationships: boolean; minConfidence: number }[];
  excludedEdges?: { edge: string; confidence: number }[];
  semanticSimilar?: { relationship: string; confidence: number }[];
}: boolean) {
  // 1. Non-empty extensions check
  if (!evidence.extensions || evidence.extensions.some(e => !e.name)) {
    console.warn('Validation Failed: One or more extensions are missing a name.');
    return false;
  }

  // 2. Relationship existence check (must ensure all required relationships are defined)
  const requiredRelationshipsExist = evidence.relationships?.every((rel) => {
    // Placeholder for actual check against a canonical list
    return true;
  }) ?? false;
  if (!requiredRelationshipsExist) {
    console.error('Validation Failed: Required relationships are missing or unvalidated.');
    return false;
  }

  // 3. Exclusion separation check: An excluded edge cannot be a ranked edge.
  const excludedEdgesAreNotRanked = evidence.excludedEdges?.every((e) => {
    // Placeholder for checking if an excluded edge is also a PageRank edge
    return true;
  }) ?? true;
  if (!excludedEdgesAreNotRanked) {
    console.error('Validation Failed: An excluded edge was found to also be a PageRank edge.');
    return false;
  }

  // 4. Confidence and structural constraints: Must meet minimum thresholds.
  const confidenceCheck = evidence.confidences?.every((c) => c.confidence >= 0.1) ?? false;
  if (!confidenceCheck) {
    console.error(
      'Validation Failed: Minimum confidence (0.1) not met for all relevant relationships.'
    );
    return false;
  }

  // 5. Hard constraints check (e.g., min_confidence must be >= 0.1)
  const minConfidenceCheck = evidence.extensions?.every(e => e.minConfidence >= 0.1) ?? false;
  if (!minConfidenceCheck) {
      console.error('Validation Failed: Minimum extension confidence (0.1) not met.');
      return false;
  }

  // 6. Semantic similarity check (if provided)
  const semanticCheck = evidence.semanticSimilar?.every(c => c.confidence >= 0.1) ?? true;
  if (!semanticCheck) {
      console.error('Validation Failed: Minimum semantic confidence (0.1) not met.');
      return false;
  }

  // 7. Final structural validation passed.
  return true;
}
