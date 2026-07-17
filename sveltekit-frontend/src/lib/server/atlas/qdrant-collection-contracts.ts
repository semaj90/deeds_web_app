/**
 * Qdrant collection contracts — canonical schema for Atlas retrieval projections.
 *
 * Rules:
 *  - Postgres JSONB owns the complete canonical semantic record.
 *  - Qdrant payload is a compact, validated projection for retrieval routing.
 *  - Only index fields that participate in filter or routing queries.
 *  - Do NOT index: summary, purpose, full source text, large ontology objects,
 *    complete AST JSON, large feature arrays — those live in Postgres.
 *  - setPayload() for incremental enrichment; overwritePayload() for full
 *    canonical reconciliation (so stale fields cannot survive).
 */

// ── Collection contracts ──────────────────────────────────────────────────────

export const COLLECTION_CONTRACTS = {
  codebase_chunks_384_hybrid: {
    contractVersion: 'atlas-qdrant-384-hybrid-v1' as const,
    vectors: {
      content_384: {
        size: 384,
        distance: 'Cosine' as const,
      },
      summary_384: {
        size: 384,
        distance: 'Cosine' as const,
      },
    },
    sparseVectors: {
      bm42: {},
    },
    /** Fields that must exist on every valid point. */
    requiredPayloadFields: [
      'packet_key',
      'source_ref',
      'postgres_id',
      'content_hash',
      'contract_version',
      'metadata_schema',
      'metadata_version',
      'file_path',
      'language',
      'embedding_model',
      'embedding_dimension',
    ] as const,
    /**
     * Only these fields are indexed in Qdrant.
     * Routing/filter fields only — never large text or nested objects.
     */
    indexedPayloadFields: {
      packet_key:       'keyword',
      source_ref:       'keyword',
      content_hash:     'keyword',
      language:         'keyword',
      domain_class:     'keyword',
      concepts:         'keyword',   // array of strings
      som_cluster:      'integer',
      kmeans_cluster:   'integer',
      metadata_version: 'integer',
    } as const,
    /**
     * Fields present in payload but NOT indexed.
     * Returned in search results but not filterable.
     */
    nonIndexedPayloadFields: [
      'postgres_id',
      'content_hash',
      'contract_version',
      'metadata_schema',
      'file_path',
      'kmeans_model_version',
      'kmeans_vector_contract',
      'cluster_margin',
      'embedding_model',
      'embedding_dimension',
      'indexed_at',
    ] as const,
  },
} as const;

export type CollectionName = keyof typeof COLLECTION_CONTRACTS;
export type CollectionContract<N extends CollectionName = 'codebase_chunks_384_hybrid'> =
  typeof COLLECTION_CONTRACTS[N];

// ── Payload type ──────────────────────────────────────────────────────────────

/**
 * The validated Qdrant payload projection for codebase_chunks_384_hybrid.
 *
 * This is a SUBSET of AtlasKnowledgeEnvelope — compact retrieval data only.
 * Postgres JSONB holds the full canonical record.
 */
export interface QdrantChunkPayload {
  // Identity — required, indexed
  packet_key:  string;
  source_ref:  string;
  postgres_id: string;    // codebase_chunk_index.id (UUID as text)
  content_hash: string;

  // Contract version — required, not indexed
  contract_version:  'atlas-qdrant-384-hybrid-v1';
  metadata_schema:   'atlas-semantic-metadata-v1';
  metadata_version:  number;

  // Source metadata — required
  file_path:  string;
  language:   string;

  // Routing signals — optional, indexed
  domain_class?:  string;
  concepts?:      string[];
  som_cluster?:   number;
  kmeans_cluster?: number;

  // Cluster provenance — not indexed
  kmeans_model_version?:   string;
  kmeans_vector_contract?: string;  // e.g. "legacy-content-768-v1"
  cluster_margin?:         number;

  // Embedding provenance — not indexed
  embedding_model:     string;
  embedding_dimension: 384;
  indexed_at:          string; // ISO timestamp
}

// ── Projection hash ───────────────────────────────────────────────────────────

import { createHash } from 'crypto';

/**
 * Deterministic SHA-256 of the canonical payload.
 * Used to detect whether Qdrant is in sync with Postgres.
 */
export function hashQdrantPayload(payload: QdrantChunkPayload): string {
  return createHash('sha256')
    .update(JSON.stringify(payload, Object.keys(payload).sort()))
    .digest('hex');
}

// ── Reconciliation helper ─────────────────────────────────────────────────────

/**
 * Decide whether a point needs to be re-projected.
 * Returns true if the stored hash differs from the canonical hash.
 */
export function needsProjection(
  canonicalPayload: QdrantChunkPayload,
  storedHash: string | null | undefined
): boolean {
  if (!storedHash) return true;
  return hashQdrantPayload(canonicalPayload) !== storedHash;
}

// ── Payload validator ─────────────────────────────────────────────────────────

export class PayloadValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string
  ) {
    super(`PayloadValidationError [${field}]: ${message}`);
    this.name = 'PayloadValidationError';
  }
}

/**
 * Validates a QdrantChunkPayload against the collection contract.
 * Throws PayloadValidationError on the first missing required field.
 */
export function validateQdrantPayload(
  payload: Partial<QdrantChunkPayload>
): asserts payload is QdrantChunkPayload {
  const contract = COLLECTION_CONTRACTS.codebase_chunks_384_hybrid;
  for (const field of contract.requiredPayloadFields) {
    const val = (payload as Record<string, unknown>)[field];
    if (val === undefined || val === null || val === '') {
      throw new PayloadValidationError(field, `Required field is missing or empty`);
    }
  }
  if (payload.embedding_dimension !== 384) {
    throw new PayloadValidationError('embedding_dimension', `Expected 384, got ${payload.embedding_dimension}`);
  }
}

// ── Qdrant index creation SQL helper ────────────────────────────────────────────

/**
 * Returns the Qdrant HTTP payload to create a field index.
 * Call POST /collections/{name}/index for each entry.
 */
export function buildFieldIndexRequests(
  collection: CollectionName = 'codebase_chunks_384_hybrid'
): Array<{ field_name: string; field_schema: string }> {
  const contract = COLLECTION_CONTRACTS[collection];
  return Object.entries(contract.indexedPayloadFields).map(([field, schema]) => ({
    field_name:   field,
    field_schema: schema,
  }));
}
