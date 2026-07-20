/**
 * Phase 3 Unified Retrieval Module
 *
 * Consolidates retrieval logic from 5+ endpoints into unified pipeline:
 * 1. embedQuery() - Cached embedding via Bifrost L1/L2
 * 2. unifiedSearch() - Multi-lane orchestrator (GPU + Qdrant + BM25)
 * 3. SearchLaneRegistry - Pluggable lane registration
 *
 * Backward compatible with existing RawCandidate type
 */

export type {
  SearchResult,
  SearchRequest,
  SearchResponse,
  SearchLane,
  SearchFilter,
  SearchLaneConfig,
  EmbeddingResult,
} from './types.js';

export { unifiedSearch, initRetrievalService } from './service.js';

export { embedQuery, initEmbeddingService, getEmbeddingServiceConfig } from './embedding-service.js';

export { getSearchLaneRegistry, SearchLaneRegistry, type ISearchLane } from './search-lanes.js';

export {
  getUnifiedRetrievalResult,
  searchCodebase,
  searchByEmbedding,
  executeUnifiedCrossRanking,
  fetchCanonicalRecords,
  type LegacyRetrievalRequest,
} from './unified-orchestrator.js';

// Re-export legacy RawCandidate for backward compatibility
export type RawCandidate = {
  score: number;
  lane: 'qdrant_atlas_index';
  data: {
    packet_key: string | null;
    source_ref: string | null;
    canonical_source_ref: string | null;
    source_ref_key: string | null;
    file_path: string | null;
    feature_id: string | null;
    qdrant_point_id: string | null;
    qdrant_collection: string;
    payload: any;
    fusion_score: number;
  };
};

type AceEnv = {
  openaiBaseUrl: string;
  openaiApiKey: string;
  embeddingModel: string;
  embeddingDimension: number;
  qdrantUrl: string;
  qdrantCollection: string;
};

export async function getQdrantSearch(
  query: string,
  limit = 10
): Promise<RawCandidate[]> {
  const env = loadAceEnv();

  if (!query?.trim()) {
    throw new Error('getQdrantSearch(query): query is required');
  }

  const embedding = await createEmbedding(query, env);

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('Qdrant search blocked: embedding call returned no vector');
  }

  if (embedding.length !== env.embeddingDimension) {
    console.warn(
      `[Qdrant] Embedding dimension ${embedding.length} does not match env EMBEDDING_DIMENSION=${env.embeddingDimension}`
    );
  }

  const url = `${env.qdrantUrl.replace(/\/$/, '')}/collections/${env.qdrantCollection}/points/search`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      vector: embedding,
      limit,
      with_payload: true,
      with_vector: false
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[Qdrant] Search failed ${res.status}: ${text}`);
  }

  const json = await res.json();
  const rows = Array.isArray(json?.result) ? json.result : [];

  return rows.map((point: any): RawCandidate => {
    const payload = point.payload ?? {};

    const sourceRef = normalizeSourceRef(
      payload.canonical_source_ref ??
        payload.source_ref_key ??
        payload.source_ref ??
        payload.sourceRef ??
        payload.file_path ??
        payload.path
    );

    const featureId = deriveFeatureId({
      featureId: payload.feature_id ?? payload.featureId,
      sourceRef,
      packet: payload
    });

    return {
      score: Number(point.score ?? 0),
      lane: 'qdrant_atlas_index',
      data: {
        packet_key:
          payload.packet_key ??
          payload.packetKey ??
          payload.nes_chrom_packet_key ??
          null,

        source_ref: sourceRef,
        canonical_source_ref: sourceRef,
        source_ref_key: sourceRef,
        file_path: sourceRef ? sourceRef.replace(/^file:/, '') : null,

        feature_id: featureId,

        qdrant_point_id: String(point.id),
        qdrant_collection: env.qdrantCollection,

        payload: {
          ...payload,
          qdrant_point_id: String(point.id),
          qdrant_collection: env.qdrantCollection
        },

        fusion_score: Number(point.score ?? 0)
      }
    };
  });
}

async function createEmbedding(query: string, env: AceEnv): Promise<number[]> {
  const url = `${env.openaiBaseUrl.replace(/\/$/, '')}/embeddings`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.openaiApiKey}`
    },
    body: JSON.stringify({
      model: env.embeddingModel,
      input: query
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[Embedding] Failed ${res.status}: ${text}`);
  }

  const json = await res.json();
  return json?.data?.[0]?.embedding ?? [];
}

function loadAceEnv(): AceEnv {
  return {
    openaiBaseUrl:
      process.env.OPENAI_BASE_URL ??
      process.env.BIFROST_URL?.replace(/\/$/, '') + '/v1' ??
      'http://127.0.0.1:3040/v1',

    openaiApiKey: process.env.OPENAI_API_KEY ?? '_',

    embeddingModel:
      process.env.OLLAMA_EMBED_MODEL ??
      process.env.EMBEDDING_MODEL ??
      'embeddinggemma:latest',

    embeddingDimension: Number(process.env.EMBEDDING_DIMENSION ?? 768),

    qdrantUrl: process.env.QDRANT_URL ?? 'http://127.0.0.1:6333',

    qdrantCollection: process.env.QDRANT_COLLECTION ?? 'legal_documents'
  };
}

function normalizeSourceRef(value: unknown): string | null {
  if (!value) return null;

  const normalized = String(value)
    .replaceAll('\\', '/')
    .replace(/^file:\/+/, 'file:')
    .replace(/^\.\//, '')
    .trim();

  if (!normalized) return null;
  return normalized.startsWith('file:') ? normalized : `file:${normalized}`;
}

function deriveFeatureId(input: {
  featureId?: string | null;
  sourceRef?: string | null;
  packet?: any;
}): string | null {
  if (input.packet?.feature_id) return String(input.packet.feature_id);
  if (input.packet?.featureId) return String(input.packet.featureId);
  if (input.featureId) return String(input.featureId);
  
  const ref = normalizeSourceRef(
    input.sourceRef ??
    input.packet?.canonical_source_ref ??
    input.packet?.source_ref ??
    input.packet?.sourceRef
  );
  
  return ref ? `feature:${ref}` : null;
}