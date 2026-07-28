/**
 * Search Backend Contract — Backend-neutral ANN candidate generation
 *
 * Defines the interface that Qdrant, TurboVec, and Rust N-API backends implement.
 * All backends return normalized candidate rows with packet_key (resolved from slot manifest).
 * Identity validation, fusion, and ACE assembly happen downstream.
 */

export type SearchBackendKind = 'qdrant' | 'turbovec' | 'rust_napi';

export type SearchVectorName =
  | 'dense_768'
  | 'dense_384_custom'
  | 'latent_64'
  | 'bm42'; // sparse, for lexical/BM42 routes

export interface SearchFilter {
  workspaceRevision?: string;
  packetKeys?: readonly string[];
  featureIds?: readonly string[];
  sourceRefPrefixes?: readonly string[];
  artifactKinds?: readonly string[];
  domainIds?: readonly string[];
}

export interface SearchBackendRequest {
  queryVector: Float32Array;
  vectorName: SearchVectorName;
  limit: number;
  candidateMultiplier?: number; // e.g., 2 → fetch 2×limit, return top limit
  filter?: SearchFilter;
  includePayload?: boolean;
  includeVector?: boolean;
  retrievalRunId?: string;
  queryHash?: string;
  signal?: AbortSignal;
}

export interface SearchBackendCandidate {
  candidateId: string; // Opaque ID from backend (slot, point_id, etc.)
  packetKey: string | null;
  featureId: string | null;
  treeNodeId: string | null;
  sourceRef: string | null;
  contentHash: string | null;
  workspaceRevision: string | null;
  rawScore: number;
  distance: number | null;
  backend: SearchBackendKind;
  vectorName: SearchVectorName;
  payload?: Record<string, unknown>;
}

export interface SearchBackendResult {
  backend: SearchBackendKind;
  vectorName: SearchVectorName;
  candidates: SearchBackendCandidate[];
  durationMs: number;
  visitedCount: number | null;
  indexVersion: string | null;
  embeddingModelVersion?: string | null;
  warnings: string[];
}

export interface SearchBackendHealth {
  healthy: boolean;
  indexVersion: string | null;
  details: Record<string, unknown>;
}

export interface SearchBackend {
  readonly kind: SearchBackendKind;
  health(): Promise<SearchBackendHealth>;
  search(request: SearchBackendRequest): Promise<SearchBackendResult>;
  close(): Promise<void>;
}
