/**
 * Vector Search Service
 * ---------------------
 * Abstracts vector search operations, integrating with Qdrant or pgvector.
 * Provides mock data for development when endpoints are unreachable.
 */

import { getQdrantUrl, getPgVectorUrl } from '$lib/server/utils/env';
import { cacheGet, cacheSet, formatError } from '$lib/server/cache/redis';

interface SearchOptions {
  limit?: number;
  collection?: string;
  threshold?: number;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

const QDRANT_HEALTH_PATH = '/health';
const QDRANT_SEARCH_PATH = '/collections/{collection_name}/points/search';

let qdrantHealthy = false;
let lastQdrantHealthCheck = 0;
const HEALTHCHECK_INTERVAL = 30_000; // 30 seconds

/* -------------------------------------------------------------------------- */
/*  Health Check for Qdrant                                                   */
/* -------------------------------------------------------------------------- */
async function checkQdrantHealth(): Promise<boolean> {
  const now = Date.now();
  if (now - lastQdrantHealthCheck < HEALTHCHECK_INTERVAL) {
    return qdrantHealthy;
  }
  lastQdrantHealthCheck = now;

  const qdrantUrl = getQdrantUrl();
  try {
    const response = await fetch(`${qdrantUrl}${QDRANT_HEALTH_PATH}`);
    qdrantHealthy = response.ok;
    if (!qdrantHealthy) {
      console.warn(`Qdrant health check failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error checking Qdrant health:', formatError(error));
    qdrantHealthy = false;
  }
  return qdrantHealthy;
}

/* -------------------------------------------------------------------------- */
/*  Mock Data for Fallback                                                    */
/* -------------------------------------------------------------------------- */
function generateMockResults(limit: number): VectorSearchResult[] {
  const mockData = [
    {
      id: 'doc-101',
      score: 0.95,
      payload: {
        title: 'Landmark Case: Roe v. Wade',
        date: '1973-01-22',
        summary: 'Summary of Roe v. Wade...',
      },
    },
    {
      id: 'doc-102',
      score: 0.92,
      payload: {
        title: 'Contract Dispute: Acme Corp v. Beta Inc.',
        date: '2021-03-15',
        summary: 'Details of a contract dispute...',
      },
    },
    {
      id: 'doc-103',
      score: 0.88,
      payload: {
        title: 'Patent Infringement: Tech Innovations',
        date: '2022-07-01',
        summary: 'Analysis of a patent infringement claim...',
      },
    },
    {
      id: 'doc-104',
      score: 0.85,
      payload: {
        title: 'Environmental Law: Green Earth Coalition',
        date: '2020-11-10',
        summary: 'Case related to environmental regulations...',
      },
    },
    {
      id: 'doc-105',
      score: 0.8,
      payload: {
        title: 'Criminal Defense: State v. John Doe',
        date: '2023-02-28',
        summary: 'Summary of a criminal defense case...',
      },
    },
  ];
  return mockData.slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/*  Vector Search Service Implementation                                      */
/* -------------------------------------------------------------------------- */
export class VectorSearchService {
  /**
   * Performs a vector search using the provided embedding.
   * Falls back to mock data if Qdrant is unreachable or embedding is empty.
   * @param embedding The vector embedding to search with.
   * @param options Search options like limit, collection, and threshold.
   * @returns An array of VectorSearchResult.
   */
  static async searchByEmbedding(
    embedding: number[] | Float32Array,
    options: SearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const { limit = 5, collection = 'legal_documents', threshold = 0.7 } = options;

    if (!embedding || embedding.length === 0) {
      console.warn('[VectorSearchService] Empty embedding provided, returning mock data.');
      return generateMockResults(limit);
    }

    const embeddingArray = Array.from(embedding); // Ensure it's a plain array for JSON serialization

    const cacheKey = `vector_search:${collection}:${embeddingArray.slice(0, 10).join(',')}:${limit}:${threshold}`;
    const cached = await cacheGet<VectorSearchResult[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const isQdrantHealthy = await checkQdrantHealth();

    if (isQdrantHealthy) {
      try {
        const qdrantUrl = getQdrantUrl();
        const searchUrl = `${qdrantUrl}${QDRANT_SEARCH_PATH.replace('{collection_name}', collection)}`;

        const response = await fetch(searchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: embeddingArray,
            limit: limit,
            with_payload: true,
            score_threshold: threshold,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          console.error(
            `Qdrant search failed: ${response.status} ${response.statusText} - ${errorBody}`
          );
          // Fallback to mock data on Qdrant error
          return generateMockResults(limit);
        }

        const data = await response.json();
        const results: VectorSearchResult[] = data.result.map((item: any) => ({
          id: item.id,
          score: item.score,
          payload: item.payload,
        }));

        await cacheSet(cacheKey, results, 60 * 1000); // Cache for 1 minute
        return results;
      } catch (error) {
        console.error('Error during Qdrant search:', formatError(error));
        // Fallback to mock data on network/parsing error
        return generateMockResults(limit);
      }
    } else {
      console.warn('[VectorSearchService] Qdrant endpoint unhealthy, returning mock data.');
      return generateMockResults(limit);
    }
  }

  /**
   * Placeholder for hybrid search (Qdrant + pgvector).
   * For now, it just calls searchByEmbedding.
   */
  static async hybridVectorSearch(
    embedding: number[] | Float32Array,
    options: SearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    // In a real implementation, this would combine results from Qdrant and pgvector
    // and potentially re-rank them.
    console.log('Performing hybrid vector search (currently Qdrant only with mock fallback)');
    return this.searchByEmbedding(embedding, options);
  }
}
