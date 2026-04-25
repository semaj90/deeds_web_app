/**
 * ACE Context Service - RAG+KAG Hybrid Context Retrieval
 *
 * Wires together:
 *   - VectorSearchService (pgvector cosine similarity)
 *   - Ollama embedding generation (embeddinggemma:latest)
 *   - PostgreSQL document_embeddings table
 *   - Optional Qdrant for secondary vector search
 *
 * Usage:
 *   const svc = new AceContextService();
 *   const bundle = await svc.buildContextBundle({ query, filters, limit });
 */

import { vectorSearchService } from '$lib/server/db/vector-search';
import { generateSingleEmbedding as generateEmbedding } from '$lib/server/grpc/embedding-client.js';
import { db } from '$lib/server/db/unified-client';
import { sql } from 'drizzle-orm';

// ── Types ──────────────────────────────────────────────

export interface ContextFilters {
  domain?: string;
  dateFrom?: Date;
  dateTo?: Date;
  tags?: string[];
  caseId?: string;
  documentType?: string;
}

export interface ContextChunk {
  id: string;
  content: string;
  relevanceScore: number;
  source: string;
  metadata?: Record<string, unknown>;
}

export interface ContextEntity {
  id: string;
  name: string;
  type: string;
  mentions: number;
}

export interface ContextEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

export interface ContextBundle {
  chunks: ContextChunk[];
  entities: ContextEntity[];
  edges: ContextEdge[];
  query: string;
  embedding?: number[];
  stats: {
    totalChunks: number;
    avgRelevance: number;
    searchTimeMs: number;
  };
}

interface BuildContextRequest {
  query: string;
  filters?: ContextFilters;
  limit?: number;
}

// ── Service ────────────────────────────────────────────

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'legal-documents';

export class AceContextService {

  /**
   * Build a full context bundle: chunks + entities + edges
   * Uses hybrid scoring: pgvector (primary) + Qdrant (secondary)
   */
  async buildContextBundle(request: BuildContextRequest): Promise<ContextBundle> {
    const startTime = performance.now();
    const { query, filters, limit = 10 } = request;

    // 1. Generate query embedding
    let embedding: number[] = [];
    try {
      embedding = await generateEmbedding(query);
    } catch (err) {
      console.warn('[ACE] Embedding generation failed, falling back to keyword search:', err);
    }

    // 2. Vector search via pgvector
    const pgChunks = await this.searchPgVector(query, filters, limit);

    // 3. Optional Qdrant search for hybrid scoring
    let qdrantChunks: ContextChunk[] = [];
    if (embedding.length > 0) {
      qdrantChunks = await this.searchQdrant(embedding, filters, limit);
    }

    // 4. Merge + deduplicate + re-rank
    const mergedChunks = this.mergeAndRank(pgChunks, qdrantChunks, limit);

    // 5. Extract entities from top chunks
    const entities = this.extractEntities(mergedChunks);

    // 6. Build relationship edges
    const edges = this.buildEdges(entities);

    const searchTimeMs = Math.round(performance.now() - startTime);
    const avgRelevance = mergedChunks.length > 0
      ? mergedChunks.reduce((sum, c) => sum + c.relevanceScore, 0) / mergedChunks.length
      : 0;

    return {
      chunks: mergedChunks,
      entities,
      edges,
      query,
      embedding: embedding.length > 0 ? embedding : undefined,
      stats: {
        totalChunks: mergedChunks.length,
        avgRelevance: Math.round(avgRelevance * 1000) / 1000,
        searchTimeMs
      }
    };
  }

  /**
   * Primary search: pgvector cosine similarity via VectorSearchService
   */
  private async searchPgVector(
    query: string,
    filters: ContextFilters | undefined,
    limit: number
  ): Promise<ContextChunk[]> {
    try {
      const results = await vectorSearchService.search(query, {
        limit,
        threshold: 0.5,
        caseId: filters?.caseId,
        documentType: filters?.documentType
      });

      return results.map(r => ({
        id: r.id,
        content: r.content,
        relevanceScore: r.relevanceScore,
        source: 'pgvector',
        metadata: { caseId: r.caseId }
      }));
    } catch (err) {
      console.warn('[ACE] pgvector search failed:', err);
      return [];
    }
  }

  /**
   * Secondary search: Qdrant vector database
   */
  private async searchQdrant(
    embedding: number[],
    filters: ContextFilters | undefined,
    limit: number
  ): Promise<ContextChunk[]> {
    try {
      const body: Record<string, unknown> = {
        vector: embedding,
        limit,
        with_payload: true,
        score_threshold: 0.6
      };

      // Build Qdrant filter
      if (filters?.domain || filters?.tags?.length) {
        const must: Array<Record<string, unknown>> = [];
        if (filters.domain) {
          must.push({ key: 'domain', match: { value: filters.domain } });
        }
        if (filters.tags?.length) {
          for (const tag of filters.tags) {
            must.push({ key: 'tags', match: { value: tag } });
          }
        }
        body.filter = { must };
      }

      const response = await fetch(
        QDRANT_URL + '/collections/' + QDRANT_COLLECTION + '/points/search',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );

      if (!response.ok) return [];

      const data = await response.json() as {
        result: Array<{
          id: string | number;
          score: number;
          payload?: Record<string, unknown>;
        }>;
      };

      return (data.result ?? []).map(r => ({
        id: String(r.id),
        content: String(r.payload?.content ?? r.payload?.text ?? ''),
        relevanceScore: r.score,
        source: 'qdrant',
        metadata: r.payload
      }));
    } catch (err) {
      console.warn('[ACE] Qdrant search failed (may not be running):', err);
      return [];
    }
  }

  /**
   * Merge pgvector + Qdrant results with reciprocal rank fusion
   */
  private mergeAndRank(
    pgChunks: ContextChunk[],
    qdrantChunks: ContextChunk[],
    limit: number
  ): ContextChunk[] {
    const seen = new Set<string>();
    const merged: ContextChunk[] = [];

    // Interleave: pgvector results weighted higher (primary source)
    const all = [
      ...pgChunks.map((c, i) => ({ ...c, fusionScore: c.relevanceScore + 1 / (i + 1) })),
      ...qdrantChunks.map((c, i) => ({ ...c, fusionScore: c.relevanceScore * 0.8 + 1 / (i + 1) * 0.5 }))
    ];

    all.sort((a, b) => b.fusionScore - a.fusionScore);

    for (const chunk of all) {
      // Deduplicate by content similarity (exact ID or content prefix)
      const key = chunk.id + '|' + chunk.content.slice(0, 100);
      if (seen.has(key)) continue;
      seen.add(key);

      merged.push({
        id: chunk.id,
        content: chunk.content,
        relevanceScore: chunk.fusionScore,
        source: chunk.source,
        metadata: chunk.metadata
      });

      if (merged.length >= limit) break;
    }

    return merged;
  }

  /**
   * Extract named entities from context chunks (lightweight regex-based)
   */
  private extractEntities(chunks: ContextChunk[]): ContextEntity[] {
    const entityMap = new Map<string, ContextEntity>();
    const allText = chunks.map(c => c.content).join(' ');

    // Legal entity patterns
    const patterns: Array<{ regex: RegExp; type: string }> = [
      { regex: /\b(?:Section|§)\s*\d+[A-Za-z]?(?:\.\d+)*/g, type: 'statute' },
      { regex: /\b\d+\s+U\.S\.C\.\s*§?\s*\d+/g, type: 'statute' },
      { regex: /\b[A-Z][a-z]+\s+v\.\s+[A-Z][a-z]+/g, type: 'case' },
      { regex: /\b(?:plaintiff|defendant|appellant|appellee|petitioner|respondent)\b/gi, type: 'party_role' },
      { regex: /\b(?:contract|tort|negligence|fraud|breach|liability|damages|injunction)\b/gi, type: 'legal_concept' }
    ];

    for (const { regex, type } of patterns) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(allText)) !== null) {
        const name = match[0].trim();
        const key = name.toLowerCase();
        const existing = entityMap.get(key);
        if (existing) {
          existing.mentions++;
        } else {
          entityMap.set(key, {
            id: crypto.randomUUID(),
            name,
            type,
            mentions: 1
          });
        }
      }
    }

    return Array.from(entityMap.values())
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 50);
  }

  /**
   * Build edges between entities based on co-occurrence in chunks
   */
  private buildEdges(entities: ContextEntity[]): ContextEdge[] {
    const edges: ContextEdge[] = [];

    // Simple co-occurrence: entities of different types that appear together
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        if (entities[i].type !== entities[j].type) {
          edges.push({
            source: entities[i].id,
            target: entities[j].id,
            relation: 'co_occurs_with',
            weight: Math.min(entities[i].mentions, entities[j].mentions)
          });
        }
      }
      if (edges.length >= 100) break; // Cap edges
    }

    return edges.sort((a, b) => b.weight - a.weight).slice(0, 50);
  }
}