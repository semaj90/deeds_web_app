/**
 * LangChain Qdrant Retriever Bridge
 * Connects your embedding service, Qdrant vector search, and Redis cache into
 * a Retriever-like interface usable by aiAssistantMachine.
 */

import VectorSearchService from '$lib/server/vector-search-service';
import { redis } from '$lib/server/cache/redis';
import getEmbeddingFromGemma from '$lib/server/ai/embeddinggemma-service';
import { Document } from 'langchain/document';

const COLLECTION_NAME = process.env.QDRANT_COLLECTION || 'legal_documents';
const EMBED_MODEL = process.env.EMBED_MODEL || 'embeddinggemma:latest';

export class LangchainQdrantRetriever {
  topK: number;

  constructor(topK = 5) {
    this.topK = topK;
  }

  private async embed(query: string): Promise<number[] | null> {
    return getEmbeddingFromGemma(query);
  }

  async search(
    query: string,
    filters: Record<string, unknown> = {},
    useCache = true
  ): Promise<Document[]> {
    const cacheKey = `retriever:${COLLECTION_NAME}:${query}:${JSON.stringify(filters)}`;
    if (useCache) {
      const cached = await redis.cacheGet(cacheKey);
      if (cached) {
        try {
          const parsed: any[] = JSON.parse(cached);
          return parsed.map(
            (p) => ({ pageContent: p.pageContent, metadata: p.metadata }) as unknown as Document
          );
        } catch (err) {
          // continue
        }
      }
    }

    const embedding = await this.embed(query);
    const points = await VectorSearchService.searchByEmbedding(embedding || new Float32Array(0), {
      limit: this.topK,
      collectionName: COLLECTION_NAME,
    });

    const docs: Document[] = points.map(
      (p) =>
        ({
          pageContent: p.snippet || '',
          metadata: { id: p.id, score: p.score, source: p.source },
        }) as unknown as Document
    );

    if (docs.length) await redis.cacheSet(cacheKey, JSON.stringify(docs), 60);
    return docs;
  }

  async rerank(docs: Document[], query: string): Promise<Document[]> {
    // Placeholder: simple numeric sort
    return docs
      .sort((a, b) => (b.metadata?.score || 0) - (a.metadata?.score || 0))
      .slice(0, this.topK);
  }

  async retrieve(query: string, filters: Record<string, unknown> = {}): Promise<Document[]> {
    const docs = await this.search(query, filters);
    return this.rerank(docs, query);
  }
}

export const legalRetriever = new LangchainQdrantRetriever(5);

export async function retrieveLegalPrecedent(query: string) {
  return legalRetriever.retrieve(query);
}
