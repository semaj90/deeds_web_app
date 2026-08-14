import { SEMANTIC_DIMENSION } from '$lib/server/embedding/embedding-contract-768.js';

export type AtlasKnnCorpusRow = {
  packetKey: string;
  sourceRevision: string;
  symbolVersionId?: string | null;
  vector: number[];
};

export type AtlasKnnRequest = {
  vector: number[];
  representationId: 'semantic_768';
  dimension: typeof SEMANTIC_DIMENSION;
  corpus: AtlasKnnCorpusRow[];
  topK: number;
  deadlineMs?: number;
};

export type AtlasKnnHit = {
  rank: number;
  packetKey: string;
  sourceRevision: string;
  symbolVersionId?: string | null;
  distance: number;
};

export type AtlasKnnResponse = {
  operation: 'knn.exact' | 'knn.cagra';
  backend: string;
  representationId: 'semantic_768';
  dimension: typeof SEMANTIC_DIMENSION;
  results: AtlasKnnHit[];
  corpusRows: number;
  durationMs: number;
  truncated: boolean;
};

function assertRequest(input: AtlasKnnRequest): void {
  if (input.dimension !== SEMANTIC_DIMENSION || input.vector.length !== SEMANTIC_DIMENSION) {
    throw new Error(`ATLAS_KNN_DIMENSION_MISMATCH: expected ${SEMANTIC_DIMENSION}`);
  }
  if (input.representationId !== 'semantic_768') {
    throw new Error('ATLAS_KNN_REPRESENTATION_MISMATCH: expected semantic_768');
  }
  if (input.corpus.length === 0 || input.topK < 1 || input.topK > input.corpus.length) {
    throw new Error('ATLAS_KNN_INVALID_TOPK_OR_EMPTY_CORPUS');
  }
  const seen = new Set<string>();
  for (const row of input.corpus) {
    if (!row.packetKey || !row.sourceRevision) {
      throw new Error('ATLAS_KNN_CANONICAL_IDENTITY_REQUIRED');
    }
    if (row.vector.length !== SEMANTIC_DIMENSION) {
      throw new Error(`ATLAS_KNN_CORPUS_DIMENSION_MISMATCH: ${row.packetKey}`);
    }
    const identity = `${row.packetKey}\0${row.sourceRevision}`;
    if (seen.has(identity)) throw new Error(`ATLAS_KNN_DUPLICATE_CORPUS_IDENTITY: ${identity}`);
    seen.add(identity);
  }
}

export function createAtlasRapidsKnnClient(baseUrl = process.env.ATLAS_RAPIDS_SIDECAR_URL ?? 'http://127.0.0.1:8098') {
  async function search(input: AtlasKnnRequest, mode: 'exact' | 'cagra'): Promise<AtlasKnnResponse> {
    assertRequest(input);
    const response = await fetch(`${baseUrl}/v1/knn/${mode}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: { vector: input.vector, representationId: input.representationId, dimension: input.dimension }, corpus: input.corpus, topK: input.topK, deadlineMs: input.deadlineMs }),
      signal: AbortSignal.timeout(input.deadlineMs ?? 15_000),
    });
    if (!response.ok) throw new Error(`ATLAS_RAPIDS_KNN_HTTP_${response.status}`);
    return await response.json() as AtlasKnnResponse;
  }

  return {
    exact: (input: AtlasKnnRequest) => search(input, 'exact'),
    cagra: (input: AtlasKnnRequest) => search(input, 'cagra'),
  };
}
