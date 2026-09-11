/**
 * Package-local retrieval contracts used by the CrossEncoder adapter.
 *
 * These types deliberately do not make this package the TurboVec, Qdrant, or
 * fusion owner. Application layers may adapt their canonical retrieval hits
 * into this minimal shape and may inject a base reranker when desired.
 */

export interface RetrievalHitPayload {
  content?: unknown;
  text?: unknown;
  [key: string]: unknown;
}

export interface RetrievalHit {
  id: string | number;
  score: number;
  payload?: RetrievalHitPayload | null;
  [key: string]: unknown;
}

/** Compatibility name retained for existing CrossEncoder call sites. */
export type QdrantHit = RetrievalHit;

export interface RerankTrace {
  query: string;
  beforeIds: string[];
  afterIds: string[];
  scoreDeltas: Record<string, number>;
}

export interface RerankOptions {
  query: string;
  hits: RetrievalHit[];
}

export interface RerankResult {
  ok: boolean;
  hits: RetrievalHit[];
  latencyMs: number;
  error?: string;
  trace?: RerankTrace;
}

/**
 * Optional application-owned base reranker. For Parent Atlas today this can
 * wrap the live SvelteKit TurboVec/rerank owner without copying it here.
 */
export type BaseReranker = (options: RerankOptions) => Promise<RerankResult>;
