/**
 * Knowledge Searcher
 * Phase 76 - Knowledge Search Engine
 *
 * Core search component that combines:
 * - Qdrant semantic search (cosine similarity)
 * - TF-IDF keyword ranking
 * - MinIO full content retrieval
 * - Redis result caching
 *
 * Implements hybrid scoring: 0.7 * semantic + 0.3 * tfidf
 */

import type { SearchOptions, SearchResult,
  FullDocument, CollectionStats } from './types.js';
import { getQdrantKnowledgeStore } from './QdrantKnowledgeStore.js';
import { getTfIdfRanker } from './TfIdfRanker.js';
import { getMinioKnowledgeStore } from './MinioKnowledgeStore.js';
import { getRedisCacheService } from './RedisCacheService.js';

export class KnowledgeSearcher {
  private qdrant = getQdrantKnowledgeStore();
  private tfidf = getTfIdfRanker();
  private minio = getMinioKnowledgeStore();
  private cache = getRedisCacheService();

  /**
   * Search knowledge base with hybrid ranking
   * Property 2: Results SHALL be sorted by combined score (0.7*semantic + 0.3*tfidf)
   * Property 3: Results SHALL contain all required fields
   * Property 8: Repeated queries SHALL use cache
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const {
      topK = 10,
      threshold = 0.5,
      filters,
      includeContent = false,
      useCache = true,
      synthesize = false,
      llmProvider = 'ollama',
    } = options;

    // Check cache first
    if (useCache) {
      const cached = await this.cache.getCachedResults(query);
      if (cached) {
        return cached;
      }
    }

    // Perform semantic search in Qdrant
    const semanticResults = await this.qdrant.search(query, { topK: topK * 2, threshold });

    const hybridResults: SearchResult[] = [];

    for (const result of semanticResults) {
      // Get TF-IDF vector from payload
      const tfIdfVector = (result as any).payload?.tfIdfVector as
        | Record<string, number>
        | undefined;

      if (!tfIdfVector) {
        hybridResults.push({
          id: result.id.toString(),
          title: result.title || '',
          url: result.url || '',
          summary: result.summary || '',
          tags: result.tags ?? [],
          scores: {
            semantic: result.scores?.semantic ?? 0,
            tfidf: 0,
            combined: result.scores?.combined ?? 0,
          },
        });
        continue;
      }

      // Convert to Map for TF-IDF scoring
      const tfIdfMap = new Map(Object.entries(tfIdfVector));
      const tfidfScore = this.tfidf.score(query, tfIdfMap);

      // Calculate hybrid score: 0.7 * semantic + 0.3 * tfidf
      const semanticScore = result.scores?.semantic ?? 0;
      const combinedScore = 0.7 * semanticScore + 0.3 * tfidfScore;

      hybridResults.push({
        id: result.id.toString(),
        title: result.title || '',
        url: result.url || '',
        summary: result.summary || '',
        tags: result.tags ?? [],
        scores: {
          semantic: semanticScore,
          tfidf: tfidfScore,
          combined: combinedScore,
        },
      });
    }

    // Sort by combined score (Property 2)
    hybridResults.sort((a: any, b: any) => b.scores.combined - a.scores.combined);

    // Take top K
    const topResults = hybridResults.slice(0, topK);

    // Fetch full content from MinIO if requested
    if (includeContent) {
      await Promise.all(
        topResults.map(async (result: any) => {
          try {
            const doc = await this.getDocument(result.id);
            if (doc) {
              result.content = doc.content;
            }
          } catch (error) {
            console.warn(`Failed to fetch content for ${result.id}:`, error);
          }
        })
      );
    }

    // Cache results
    if (useCache) {
      await this.cache.cacheSearchResults(query, topResults);
    }

    // Synthesize answer with LLM if requested
    if (synthesize && topResults.length > 0) {
      try {
        const synthesizedAnswer = await this.synthesizeAnswer(query, topResults, llmProvider);
        if (topResults[0]) {
          (topResults[0] as any).synthesizedAnswer = synthesizedAnswer;
        }
      } catch (error) {
        console.warn('Failed to synthesize answer:', error);
      }
    }

    return topResults;
  }

  /**
   * Get full document by ID with content from MinIO
   * Property 4: Storage round-trip SHALL return identical content
   */
  async getDocument(id: string): Promise<FullDocument | null> {
    try {
      const point = await this.qdrant.getDocument(id);
      if (!point) {
        return null;
      }

      const minioKey = point.payload?.minioKey as string;
      if (!minioKey) {
        console.warn(`No MinIO key for document ${id}`);
        return null;
      }

      const content = await this.minio.getDocument(minioKey);

      return {
        id: point.id.toString(),
        title: (point.payload?.title as string) || '',
        url: (point.payload?.url as string) || '',
        content: content || '',
        summary: (point.payload?.summary as string) || '',
        entities: (point.payload?.entities as string[]) ?? [],
        tags: (point.payload?.tags as string[]) ?? [],
        scrapedAt: new Date(point.payload?.scrapedAt as string),
        minioKey,
      };
    } catch (error) {
      console.error(`Error fetching document ${id}:`, error);
      return null;
    }
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<CollectionStats> {
    try {
      const qdrantStats = await this.qdrant.getStats();

      return {
        totalDocuments: qdrantStats.points,
        indexedVectors: qdrantStats.points,
        collections: {
          qdrant: {
            points: qdrantStats.points,
            status: qdrantStats.status,
          },
          postgres: {
            rows: 0,
          },
          minio: {
            objects: 0,
            size: '0 MB',
          },
        },
        lastIndexed: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error fetching stats:', error);
      throw error;
    }
  }

  /**
   * Invalidate cache for specific query or all queries
   */
  async invalidateCache(queryHash?: string): Promise<void> {
    await this.cache.invalidateCache(queryHash);
  }

  /**
   * Synthesize answer using LLM with search results as context
   * Property 16: LLM Synthesis Context Injection
   */
  private async synthesizeAnswer(
    query: string,
    results: SearchResult[],
    _provider: 'ollama' = 'ollama'
  ): Promise<string> {
    const context = results
      .slice(0, 5)
      .map((r: any, idx: number) => {
        const content = r?.content || r.summary;
        return `[${idx + 1}] ${r.title}\nURL: ${r.url}\n${content}\n`;
      })
      .join('\n---\n\n');

    const prompt = `Based on the following context, answer the question concisely and accurately.

Context:
${context}

Question: ${query}

Answer:`;

    return await this.callOllama(prompt);
  }

  /**
   * Call Ollama API (gemma4-legal:latest)
   */
  private async callOllama(prompt: string): Promise<string> {
    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4-legal:latest',
          prompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            num_predict: 500,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data?.response ?? 'No response generated';
    } catch (error) {
      console.error('Ollama API error:', error);
      throw error;
    }
  }
}

// Singleton instance
let instance: KnowledgeSearcher | null = null;

export function getKnowledgeSearcher(): KnowledgeSearcher {
  if (!instance) {
    instance = new KnowledgeSearcher();
  }
  return instance;
}