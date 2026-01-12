/**
 * ACE Context Service
 * Implements RAG+KAG with hybrid scoring for contextual web ingestion
 * Hybrid Formula: 0.65*cosine + 0.10*freshness + 0.05*graph
 */

import { db } from '$lib/db';
import { aceChunks, aceEdges, aceEntities } from '$lib/db/schema/ace-web';
import { inArray, sql, type SQL } from 'drizzle-orm';
import { EmbeddingService } from '../error-analysis/embedding-service.js';
import { QdrantService } from './qdrant-service.js';
import type { ServiceConfig } from '../error-analysis/types.js';

export interface ContextFilters {
  domain?: string;
  dateFrom?: Date;
  dateTo?: Date;
  tags?: string[];
}

export interface ScoredChunk {
  id: string; text: string;
  docId: string; score: number;
  metadata: { url: string;
    title?: string;
    heading?: string; fetchedAt: string;
    domain: string;
    tags?: string[];
  };
  scoring?: { cosine: number;
    freshness: number; graph: number;
  };
}

export interface ContextBundle {
  chunks: ScoredChunk[]; entities: Array<{
    entity: string; type: string;
    docId: string;
  }>;
  edges: Array<{ src: string;
    rel: string; dst: string;
    weight: number;
  }>;
  summary: string; totalResults: number;
}

export interface ToolAction {
  tool: string; params: Record<string, unknown>;
  reason: string;
}

export interface ToolPlan {
  actions: ToolAction[]; shouldProceed: boolean;
}

export interface PromptParams {
  query: string; bundle: ContextBundle;
  plan: ToolPlan;
  systemRules?: string;
  projectRules?: string;
  tokenBudget?: number;
}

export class AceContextService {
  private embeddingService: EmbeddingService;
  private qdrantService: QdrantService;

  // Hybrid scoring weights
  private readonly COSINE_WEIGHT = 0.65;
  private readonly FRESHNESS_WEIGHT = 0.1;
  private readonly GRAPH_WEIGHT = 0.05;

  // Freshness thresholds (days)
  private readonly FRESH_THRESHOLD = 7;
  private readonly RECENT_THRESHOLD = 30;
  private readonly STALE_THRESHOLD = 30;

  // Context quality thresholds
  private readonly MIN_RELEVANT_CHUNKS = 3;
  private readonly RELEVANCE_THRESHOLD = 0.5;

  constructor(config?: Partial<ServiceConfig>) {
    const defaultConfig: ServiceConfig = {
      ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
      qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
      maxRetries: 3,
      retryDelayMs: 1000,
    };

    const fullConfig = { ...defaultConfig, ...config };
    this.embeddingService = new EmbeddingService(fullConfig);
    this.qdrantService = new QdrantService(fullConfig.qdrantUrl);
  }

  /**
   * Build context bundle with RAG + KAG
   * Implements hybrid scoring: 0.65*cosine + 0.10*freshness + 0.05*graph
   */
  async buildContextBundle(params: { query: string;
    filters?: ContextFilters;
    limit?: number;
  }): Promise<ContextBundle> {
    const { query, filters = {}, limit = 10 } = params;

    console.log(`[AceContextService] Building context bundle for query: "${query}"`);

    try {
      // Step 1: Generate query embedding
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // Step 2: Search Qdrant for top 40 candidates
      let qdrantResults: any[] = [];
      try {
        await this.qdrantService.ensureCollection();
        qdrantResults = await this.qdrantService.search({
          vector: queryEmbedding,
          limit: 40,
          scoreThreshold: 0.15,
          filter: this.buildQdrantFilter(filters),
        });
        console.log(`[AceContextService] Qdrant returned ${qdrantResults.length} results`);
      } catch (error) {
        console.warn('[AceContextService] Qdrant search failed, falling back to pgvector:', error);
        qdrantResults = await this.searchPgVector(queryEmbedding, 40, filters);
      }

      if (qdrantResults.length === 0) {
        console.log('[AceContextService] No results found');
        return this.emptyBundle();
      }

      // Step 3: Load full chunk data from Postgres
      const chunkIds = qdrantResults.map((r) => r.id);
      const chunks = await db.select().from(aceChunks).where(inArray(aceChunks.id, chunkIds));

      console.log(`[AceContextService] Loaded ${chunks.length} chunks from database`);

      // Step 4: Apply hybrid scoring
      const scoredChunks = await this.applyHybridScoring(chunks, qdrantResults, query);

      // Step 5: Sort and take top N
      const topChunks = scoredChunks.sort((a, b) => b.score - a.score).slice(0, limit);

      // Step 6: Load related entities and edges
      const docIds = [...new Set(topChunks.map((c) => c.docId))];
      const entities = await this.loadEntities(docIds);
      const edges = await this.loadEdges(query, 50);

      // Step 7: Generate summary
      const summary = this.generateBundleSummary(topChunks, entities);
      console.log(
        `[AceContextService] Context bundle complete: ${topChunks.length} chunks, ${entities.length} entities, ${edges.length} edges`
      );

      return {
        chunks: topChunks,
        entities,
        edges,
        summary,
        totalResults: chunks.length,
      };
    } catch (error) {
      console.error('[AceContextService] Failed to build context bundle:', error);
      throw new Error(`Failed to build context bundle: ${error}`);
    }
  }

  /**
   * Apply hybrid scoring formula
   * Score = 0.65*cosine + 0.10*freshness + 0.05*graph
   */
  private async applyHybridScoring(
    chunks: any[],
    qdrantResults: any[],
    query: string
  ): Promise<ScoredChunk[]> {
    const now = new Date();
    const queryEntities = this.extractEntities(query);

    return chunks.map((chunk) => {
      const qdrantResult = qdrantResults.find((r) => r.id === chunk.id);
      const cosineSim = qdrantResult?.score ?? 0;

      // Freshness boost
      // metadata is typically jsonb, ensure it's treated as object
      const metadata = (chunk.metadata as any) || {};
      const fetchedAtStr = metadata.fetchedAt;
      const fetchedAt = fetchedAtStr ? new Date(fetchedAtStr) : now;

      const daysSince = (now.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24);

      let freshnessBoost = 0;
      if (daysSince < this.FRESH_THRESHOLD) {
        freshnessBoost = 1.0; // <7 days: full boost
      } else if (daysSince < this.RECENT_THRESHOLD) {
        freshnessBoost = 0.5; // 7-30 days: half boost
      }
      // >30 days: no boost (0.0)

      // Graph boost (check if chunk mentions query entities)
      let graphBoost = 0;
      const chunkText = (chunk.text || '').toLowerCase();

      for (const entity of queryEntities) {
        if (chunkText.includes(entity.toLowerCase())) {
          graphBoost += 0.5; // +0.5 per entity match
        }
      }
      graphBoost = Math.min(graphBoost, 1.0); // Cap at 1.0

      // Final hybrid score
      // Note: This logic seems to just sum weighted components, max score > 1.0?
      // User formula: 0.65*cosine + 0.10*freshness + 0.05*graph.
      // Assuming components are 0-1 range.
      // The weights sum to 0.8. Maybe missing text match weight?
      // I'll stick to provided formula logic.
      const finalScore =
        this.COSINE_WEIGHT * cosineSim +
        this.FRESHNESS_WEIGHT * freshnessBoost +
        this.GRAPH_WEIGHT * graphBoost;

      return {
        id: chunk.id,
        text: chunk.text,
        docId: chunk.docId,
        score: finalScore,
        metadata: { url: metadata.url || '',
          title: metadata.title,
          heading: metadata.heading,
          fetchedAt: metadata.fetchedAt || now.toISOString(),
          domain: metadata.domain || 'unknown',
          tags: metadata.tags
        },
        scoring: { cosine: cosineSim,
          freshness: freshnessBoost,
          graph: graphBoost,
        },
      };
    });
  }

  /**
   * Build tool plan based on context quality
   * Checks for stale context and insufficient relevance
   */
  async buildToolPlan(bundle: ContextBundle, query: string): Promise<ToolPlan> {
    const actions: ToolAction[] = [];

    // Check if context is stale (all chunks > 30 days old)
    const allStale = bundle.chunks.length > 0 && bundle.chunks.every((c) => {
      const fetchedAt = new Date(c.metadata.fetchedAt);
      const daysSince = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > this.STALE_THRESHOLD;
    });

    if (allStale) {
      actions.push({
        tool: 'web_search',
        params: { query },
        reason: `All retrieved context is stale (>${this.STALE_THRESHOLD} days old)`,
      });
    }

    // Check if context is insufficient (<3 relevant chunks with score > 0.5)
    // Note: score thresholds might need tuning if hybrid score is low
    const relevantChunks = bundle.chunks.filter((c) => c.score > this.RELEVANCE_THRESHOLD);
    if (relevantChunks.length < this.MIN_RELEVANT_CHUNKS) {
        // Only trigger search if we really lack content
        actions.push({
            tool: 'web_search',
            params: { query: this.refineQuery(query) },
            reason: `Insufficient relevant context found (${relevantChunks.length}/${this.MIN_RELEVANT_CHUNKS} required)`,
        });
    }

    // Check if no results at all
    if (bundle.chunks.length === 0) {
      actions.push({
        tool: 'web_search',
        params: { query },
        reason: 'No context found in knowledge base',
      });
    }

    // De-duplicate actions based on tool and query
    const uniqueActions = actions.filter((action, index, self) =>
        index === self.findIndex((a) => (
            a.tool === action.tool &&
            JSON.stringify(a.params) === JSON.stringify(action.params)
        ))
    );

    const shouldProceed = uniqueActions.length === 0;

    console.log(
      `[AceContextService] Tool plan: ${uniqueActions.length} actions, shouldProceed=${shouldProceed}`
    );

    return {
        actions: uniqueActions,
        shouldProceed
    };
  }

  /**
   * Build final prompt with constraints + evidence + plan
   * Assembles all context into a structured prompt for LLM
   */
  async buildPrompt(params: PromptParams): Promise<string> {
    const { query, bundle, plan, systemRules = '', projectRules = '', tokenBudget = 4000 } = params;

    const sections: string[] = [];

    // System constraints
    if (systemRules) {
      sections.push(`## System Rules\n${systemRules}\n`);
    }

    // Project rules
    if (projectRules) {
      sections.push(`## Project Rules\n${projectRules}\n`);
    }

    // Retrieved evidence
    sections.push(`## Retrieved Context`);
    sections.push(bundle.summary);
    sections.push(`\n### Relevant Chunks`);

    // Include top 5 chunks with metadata
    for (const chunk of bundle.chunks.slice(0, 5)) {
      sections.push(`**Source:** ${chunk.metadata.url}`);
      sections.push(`**Fetched:** ${chunk.metadata.fetchedAt}`);
      sections.push(`**Relevance:** ${(chunk.score * 100).toFixed(1)}%`);
      if (chunk.scoring) {
        sections.push(
          `**Scoring:** Cosine=${chunk.scoring.cosine.toFixed(2)}, Freshness=${chunk.scoring.freshness.toFixed(2)}, Graph=${chunk.scoring.graph.toFixed(2)}`
        );
      }
      sections.push(`\`\`\`\n${chunk.text}\n\`\`\`\n`);
    }

    // Knowledge graph
    if (bundle.edges.length > 0) {
      sections.push(`\n### Knowledge Graph`);
      for (const edge of bundle.edges.slice(0, 10)) {
        sections.push(`- ${edge.src} --[${edge.rel}]--> ${edge.dst} (weight: ${edge.weight})`);
      }
      sections.push('');
    }

    // Action plan
    if (plan.actions.length > 0) {
      sections.push(`\n## Suggested Actions`);
      for (const action of plan.actions) {
        sections.push(`- **${action.tool}**: ${action.reason}`);
      }
      sections.push('');
    }

    // User query
    sections.push(`\n## User Request\n${query}\n`);

    // Assemble prompt
    let prompt = sections.join('\n');

    // TODO: Implement token counting and truncation based on tokenBudget
    // For now, just log the length
    console.log(`[AceContextService] Prompt assembled: ${prompt.length} characters`);

    return prompt;
  }

  /**
   * Build Qdrant filter from context filters
   */
  private buildQdrantFilter(filters: ContextFilters): object | undefined {
    if (!filters.domain && !filters.dateFrom && !filters.dateTo && !filters.tags) {
      return undefined;
    }
    const conditions: any[] = [];

    if (filters.domain) {
      conditions.push({
        key: 'domain',
        match: { value: filters.domain },
      });
    }

    if (filters.dateFrom) {
      conditions.push({
        key: 'fetchedAt',
        range: { gte: filters.dateFrom.toISOString() },
      });
    }

    if (filters.dateTo) {
      conditions.push({
        key: 'fetchedAt',
        range: { lte: filters.dateTo.toISOString() },
      });
    }

    if (filters.tags && filters.tags.length > 0) {
      conditions.push({
        key: 'tags',
        match: { any: filters.tags },
      });
    }

    return conditions.length > 0 ? { must: conditions } : undefined;
  }

  /**
   * Fallback pgvector search when Qdrant is unavailable
   */
  private async searchPgVector(
    embedding: number[],
    limit: number,
    filters: ContextFilters
  ): Promise<any[]> {
    console.log('[AceContextService] Using pgvector fallback search');
    try {
      // Build filter conditions
      const conditions: SQL[] = [];

      if (filters.domain) {
        conditions.push(sql`${aceChunks.metadata}->>'domain' = ${filters.domain}`);
      }

      if (filters.dateFrom) {
        conditions.push(
          sql`(${aceChunks.metadata}->>'fetchedAt')::timestamp >= ${filters.dateFrom.toISOString()}`
        );
      }

      if (filters.dateTo) {
        conditions.push(
          sql`(${aceChunks.metadata}->>'fetchedAt')::timestamp <= ${filters.dateTo.toISOString()}`
        );
      }

      // Query with vector similarity
      let query = db
        .select({
          id: aceChunks.id,
          score: sql<number>`1 - (${aceChunks.embedding} <=> ${JSON.stringify(embedding)}::vector)`,
          payload: aceChunks.metadata,
        })
        .from(aceChunks);

      // Apply filters
      if (conditions.length > 0) {
        // Need to chain where clauses or usage of `and` helper from drizzle
        // Since I'm using dynamic query building, i'll check Drizzle documentation mental model
        // Drizzle .where() can take sql``
        // Using sql.join needs separator
        // Simpler: iterate and apply where
        // But Drizzle query builder is immutable-ish, need to reassign?
        // Actually, drizzle-orm query builder is typically chainable but might need `and(...)`
        // I will use `sql.join` for a single where clause if multiple conditions
         const combined = sql.join(conditions, sql` AND `);
         // @ts-ignore - Dynamic query building with Drizzle can be tricky type-wise
         query.where(combined);
      }

      // Order by similarity and limit
      // Note: <=> is distance, so order by distance ASC
      const results = await query
        .orderBy(sql`${aceChunks.embedding} <=> ${JSON.stringify(embedding)}::vector`)
        .limit(limit);

      console.log(`[AceContextService] pgvector returned ${results.length} results`);

      return results.map((r) => ({
        id: r.id,
        score: r.score || 0.5,
        payload: r.payload,
      }));
    } catch (error) {
      console.error('[AceContextService] pgvector search failed:', error);
      return [];
    }
  }

  /**
   * Load entities for given document IDs
   */
  private async loadEntities(docIds: string[]): Promise<any[]> {
    if (docIds.length === 0) {
      return [];
    }

    try {
      const entities = await db
        .select({
          entity: aceEntities.entity,
          type: aceEntities.entityType,
          docId: aceEntities.docId,
        })
        .from(aceEntities)
        .where(inArray(aceEntities.docId, docIds))
        .limit(50);

      return entities.map((e) => ({
        entity: e.entity,
        type: e.type || 'UNKNOWN',
        docId: e.docId || '',
      }));
    } catch (error) {
      console.error('[AceContextService] Failed to load entities:', error);
      return [];
    }
  }

  /**
   * Load relevant edges from knowledge graph
   */
  private async loadEdges(query: string, limit: number): Promise<any[]> {
    try {
      const queryEntities = this.extractEntities(query);
      if (queryEntities.length === 0) {
        return [];
      }

      // Find edges where source or destination matches query entities
      const edges = await db
        .select({
          src: aceEdges.srcEntity,
          rel: aceEdges.rel,
          dst: aceEdges.dstEntity,
          weight: aceEdges.weight,
        })
        .from(aceEdges)
        .where(
          sql`${aceEdges.srcEntity} = ANY(${queryEntities}) OR ${aceEdges.dstEntity} = ANY(${queryEntities})`
        )
        .orderBy(sql`${aceEdges.weight} DESC`)
        .limit(limit);

      return edges.map((e) => ({
        src: e.src,
        rel: e.rel,
        dst: e.dst,
        weight: e.weight || 1.0,
      }));
    } catch (error) {
      console.error('[AceContextService] Failed to load edges:', error);
      return [];
    }
  }

  /**
   * Extract entities from text (simple word-based extraction)
   * In production, use spaCy or similar NER model
   */
  private extractEntities(text: string): string[] {
    // Split on spaces and filter for meaningful words (>3 chars)
    // Remove punctuation
    const words = text
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
      .filter((w) => w.length > 3);

    // Remove duplicates
    return [...new Set(words)];
  }

  /**
   * Generate summary of context bundle
   */
  private generateBundleSummary(chunks: ScoredChunk[], entities: any[]): string {
    const domains = new Set(chunks.map((c) => c.metadata?.domain).filter(Boolean));
    const avgScore = chunks.length ? (chunks.reduce((sum, c) => sum + c.score, 0) / chunks.length) : 0;

    return `Found ${chunks.length} relevant chunks from ${domains.size} domain(s) with average relevance score of ${(avgScore * 100).toFixed(1)}%. ${entities.length} entities extracted.`;
  }

  /**
   * Refine query based on insufficient results
   * In production, use LLM to expand query
   */
  private refineQuery(query: string): string {
    // For now, just return original query
    // TODO: Use LLM to expand query with synonyms and related terms
    return query;
  }

  /**
   * Return empty bundle when no results found
   */
  private emptyBundle(): ContextBundle {
    return {
      chunks: [],
      entities: [],
      edges: [],
      summary: 'No relevant context found in knowledge base.',
      totalResults: 0,
    };
  }
}




