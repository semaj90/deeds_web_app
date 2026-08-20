export type ResidentCuvsAlgorithm = 'brute_force' | 'cagra' | 'ivf_flat' | 'ivf_pq';
export type ResidentCuvsMetric = 'cosine' | 'sqeuclidean' | 'inner_product';

export type ResidentCorpusRow = {
  packetKey: string;
  sourceRevision: string;
  symbolVersionId?: string | null;
  vector: number[];
};

export type ResidentIndexBuildRequest = {
  indexId: string;
  algorithm: ResidentCuvsAlgorithm;
  representationId: string;
  representationRevision: string;
  workspaceRevision: string;
  datasetChecksumSha256: string;
  metric: ResidentCuvsMetric;
  dimension: number;
  corpus: ResidentCorpusRow[];
  buildParams?: Record<string, unknown>;
  replace?: boolean;
};

export type ResidentIndexMetadata = {
  indexId: string;
  algorithm: ResidentCuvsAlgorithm | 'hnsw_from_cagra';
  representationId: string;
  representationRevision: string;
  workspaceRevision: string;
  datasetChecksumSha256: string;
  metric: ResidentCuvsMetric;
  dimension: number;
  rows: number;
  memoryTier: 'GPU' | 'CPU_RAM';
  exact: boolean;
  mutable: boolean;
  builtAt: string;
  datasetBytes: number;
  sourceIndexId?: string | null;
  buildParams: Record<string, unknown>;
};

export type ResidentIndexSearchHit = {
  rank: number;
  ordinal: number;
  packetKey: string;
  sourceRevision: string;
  symbolVersionId?: string | null;
  distance: number;
};

function assertSha256(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field} must be lowercase sha256`);
}

function assertBuild(input: ResidentIndexBuildRequest): void {
  if (!input.indexId || !input.representationId || !input.representationRevision || !input.workspaceRevision) {
    throw new Error('resident index identity/revisions required');
  }
  assertSha256(input.datasetChecksumSha256, 'datasetChecksumSha256');
  if (!Number.isInteger(input.dimension) || input.dimension <= 0) throw new Error('resident index dimension must be positive');
  if (input.corpus.length === 0) throw new Error('resident index corpus must be non-empty');
  const seen = new Set<string>();
  for (const row of input.corpus) {
    if (!row.packetKey || !row.sourceRevision) throw new Error('resident index canonical identity required');
    if (row.vector.length !== input.dimension) throw new Error(`resident index dimension mismatch for ${row.packetKey}`);
    const identity = `${row.packetKey}\0${row.sourceRevision}`;
    if (seen.has(identity)) throw new Error(`duplicate resident index identity ${identity}`);
    seen.add(identity);
  }
}

export function createAtlasRapidsResidentIndexClient(
  baseUrl = process.env.ATLAS_RAPIDS_SIDECAR_URL ?? 'http://127.0.0.1:8098',
) {
  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, init);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`ATLAS_RAPIDS_RESIDENT_HTTP_${response.status}${body ? `: ${body}` : ''}`);
    }
    return await response.json() as T;
  }

  return {
    list: () => json<{ indexes: ResidentIndexMetadata[] }>('/v1/indexes'),
    get: (indexId: string) => json<ResidentIndexMetadata>(`/v1/indexes/${encodeURIComponent(indexId)}`),
    build: async (input: ResidentIndexBuildRequest) => {
      assertBuild(input);
      return json<{ index: ResidentIndexMetadata; identityOrderChecksumSha256: string; canonicalWrites: false }>(
        '/v1/indexes/build',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...input, buildParams: input.buildParams ?? {}, replace: input.replace ?? false }),
        },
      );
    },
    search: async (input: {
      indexId: string;
      representationRevision: string;
      datasetChecksumSha256: string;
      queries: number[][];
      topK: number;
      searchParams?: Record<string, unknown>;
    }) => {
      if (!input.indexId || !input.representationRevision) throw new Error('resident search identity/revision required');
      assertSha256(input.datasetChecksumSha256, 'datasetChecksumSha256');
      if (!Number.isInteger(input.topK) || input.topK <= 0) throw new Error('topK must be positive');
      return json<{
        index: ResidentIndexMetadata;
        queryCount: number;
        topK: number;
        results: ResidentIndexSearchHit[][];
        canonicalWrites: false;
        exactPromotionRequired: boolean;
      }>(`/v1/indexes/${encodeURIComponent(input.indexId)}/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          representationRevision: input.representationRevision,
          datasetChecksumSha256: input.datasetChecksumSha256,
          queries: input.queries,
          topK: input.topK,
          searchParams: input.searchParams ?? {},
        }),
      });
    },
    convertCagraToHnsw: (input: {
      indexId: string;
      targetIndexId: string;
      hierarchy?: 'none' | 'cpu';
      releaseSource?: boolean;
      buildParams?: Record<string, unknown>;
    }) => json<{ index: ResidentIndexMetadata; canonicalWrites: false; exactPromotionRequired: true }>(
      `/v1/indexes/${encodeURIComponent(input.indexId)}/convert/hnsw`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetIndexId: input.targetIndexId,
          hierarchy: input.hierarchy ?? 'none',
          releaseSource: input.releaseSource ?? false,
          buildParams: input.buildParams ?? {},
        }),
      },
    ),
    drop: (indexId: string) => json<{ indexId: string; dropped: boolean }>(
      `/v1/indexes/${encodeURIComponent(indexId)}`,
      { method: 'DELETE' },
    ),
  };
}
