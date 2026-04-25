/**
 * SvelteKit API Endpoint: Document Search
 * Provides semantic search with RAG ranking and PostgreSQL vector storage
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler, RequestEvent } from './$types';

import { gemmaEmbeddingService } from '../../../../lib/services/gemma-embedding-service.js';
import { ragRankingSystem } from '../../../../lib/services/rag-ranking-system.js';
import { postgresqlVectorStorage } from '../../../../lib/services/postgresql-vector-storage.js';
import type { RankingContext } from '../../../../lib/services/rag-ranking-system.js';

interface SearchRequest {
  query: string;
  context?: RankingContext;
  options?: {
    limit?: number;
    threshold?: number;
    includeContent?: boolean;
    searchChunks?: boolean;
  };
  filters?: {
    document_type?: string[];
    practice_area?: string[];
    jurisdiction?: string[];
    confidence_min?: number;
  };
  ranking?: {
    weights?: any;
    strategy?: string;
  };
}

interface SearchResponse {
  success: boolean;
  query: string;
  results: any[];
  metadata: {
    total_found: number;
    search_time_ms: number;
    embedding_time_ms: number;
    ranking_time_ms: number;
    model_used: string;
    ranking_strategy: string;
  };
  analytics?: any;
}

/**
 * POST: Perform semantic search
 */
export const POST: RequestHandler = async ({ request }: RequestEvent) => {
  const startTime = Date.now();

  try {
    const body: SearchRequest = await request.json();

    if (!body.query || body.query.trim().length === 0) {
      throw error(400, 'Query is required');
    }

    console.log(`🔍 Processing search query: "${body.query.substring(0, 100)}..."`);

    // Step 1: Generate query embedding
    const embeddingStartTime = Date.now();
    const queryEmbedding = await gemmaEmbeddingService.generateEmbedding(body.query);
    const embeddingTime = Date.now() - embeddingStartTime;

    console.log(`🧠 Generated embedding in ${embeddingTime}ms`);

    // Step 2: Perform vector search
    const searchStartTime = Date.now();

    const searchOptions = {
      limit: body.options?.limit || 20,
      threshold: body.options?.threshold || 0.5,
      includeContent: body.options?.includeContent !== false,
      filters: body.filters || {},
    };

    // Choose search method based on options
    let rawResults;
    if (body.options?.searchChunks) {
      rawResults = await postgresqlVectorStorage.searchChunks(queryEmbedding, searchOptions);
    } else {
      rawResults = await postgresqlVectorStorage.semanticSearch(queryEmbedding, searchOptions);
    }

    const searchTime = Date.now() - searchStartTime;
    console.log(`🎯 Found ${rawResults.length} candidates in ${searchTime}ms`);

    // Step 3: Apply RAG ranking
    const rankingStartTime = Date.now();

    // Convert raw results to SimilarityResult format for ranking
    const candidatesForRanking = rawResults.map((result) => ({
      document_id: result.document.id,
      chunk_id: result.chunk?.id || result.document.id,
      content: result.document.content,
      similarity_score: result.similarity_score,
      metadata: {
        document_title: result.document.title,
        legal_area: result.document.metadata?.legal_area || 'general',
        document_type: result.document.metadata?.document_type || 'document',
        jurisdiction: result.document.metadata?.jurisdiction || 'general',
        chunk_metadata: result.chunk?.metadata || {},
      },
      legal_concepts: result.chunk?.metadata?.legal_concepts || [],
    }));

    // Apply ranking with context
    const rankingContext: RankingContext = {
      query: body.query,
      legal_area: body.context?.legal_area,
      document_type: body.context?.document_type,
      jurisdiction: body.context?.jurisdiction,
      user_expertise_level: body.context?.user_expertise_level || 'intermediate',
      search_intent: body.context?.search_intent || 'research',
      temporal_relevance: body.context?.temporal_relevance || 'any',
    };

    const rankedResults = await ragRankingSystem.rankResults(
      candidatesForRanking,
      rankingContext,
      body.ranking?.weights
    );

    const rankingTime = Date.now() - rankingStartTime;
    console.log(`📊 Ranked results in ${rankingTime}ms`);

    // Step 4: Generate analytics
    const totalTime = Date.now() - startTime;
    const analytics = ragRankingSystem.generateAnalytics(rankedResults, rankingTime);

    // Step 5: Format response
    const response: SearchResponse = {
      success: true,
      query: body.query,
      results: rankedResults.map((result) => ({
        id: result.document_id,
        title: result.metadata.document_title,
        content: body.options?.includeContent !== false ? result.content : undefined,
        snippet: result.content.substring(0, 300) + (result.content.length > 300 ? '...' : ''),
        similarity_score: result.similarity_score,
        final_score: result.final_score,
        confidence_level: result.confidence_level,
        recommended_action: result.recommended_action,
        ranking_explanation: result.ranking_explanation,
        metadata: {
          legal_area: result.metadata.legal_area,
          document_type: result.metadata.document_type,
          jurisdiction: result.metadata.jurisdiction,
          legal_concepts: result.legal_concepts,
        },
        ranking_components: result.ranking_components,
        chunk_info: body.options?.searchChunks
          ? {
              chunk_id: result.chunk_id,
              chunk_type: result.metadata.chunk_metadata?.chunk_type,
            }
          : undefined,
      })),
      metadata: {
        total_found: rankedResults.length,
        search_time_ms: searchTime,
        embedding_time_ms: embeddingTime,
        ranking_time_ms: rankingTime,
        model_used: gemmaEmbeddingService.getModelInfo().current,
        ranking_strategy: 'multi_factor_legal_rag',
      },
      analytics,
    };

    console.log(`✅ Search completed in ${totalTime}ms`);
    return json(response);
  } catch (err) {
    console.error('❌ Search failed:', err);
    // SvelteKit `error` expects a status and a string/Error — don't pass arbitrary objects
    throw error(500, 'Search failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
  }
};

/**
 * GET: Get search suggestions and autocomplete
 */
export const GET: RequestHandler = async ({ url }: RequestEvent) => {
  try {
    const query = url.searchParams.get('q') || '';
    const type = url.searchParams.get('type') || 'suggestions';

    if (type === 'suggestions') {
      // Generate search suggestions based on common legal queries
      const suggestions = generateSearchSuggestions(query);

      return json({
        success: true,
        query,
        suggestions,
        type: 'suggestions',
      });
    } else if (type === 'filters') {
      // Get available filter values from database
      const filterOptions = await getFilterOptions();

      return json({
        success: true,
        filters: filterOptions,
        type: 'filters',
      });
    } else if (type === 'stats') {
      // Get search statistics
      const stats = await postgresqlVectorStorage.getStorageStatistics();

      return json({
        success: true,
        statistics: stats,
        type: 'stats',
      });
    }

    throw error(400, 'Invalid request type');
  } catch (err) {
    console.error('❌ GET request failed:', err);
    // Return a simple string message to satisfy overloads
    throw error(500, 'Request failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
  }
};

/**
 * Helper functions
 */
function generateSearchSuggestions(query: string): string[] {
  const legalSuggestions = [
    'contract law elements',
    'negligence tort liability',
    'constitutional due process',
    'criminal procedure rights',
    'employment discrimination law',
    'real estate property rights',
    'corporate governance rules',
    'intellectual property patents',
    'family law custody',
    'bankruptcy proceedings',
    'securities regulation compliance',
    'environmental law violations',
    'immigration visa requirements',
    'tax law deductions',
    'insurance coverage disputes',
  ];

  if (!query || query.length < 2) {
    return legalSuggestions.slice(0, 10);
  }

  const queryLower = query.toLowerCase();

  // Filter suggestions that contain query terms
  const filtered = legalSuggestions.filter((suggestion) =>
    suggestion.toLowerCase().includes(queryLower)
  );

  // Add query-specific suggestions
  const specific = [];

  if (queryLower.includes('contract')) {
    specific.push(
      <any>(<any>'contract breach remedies'),
      'contract formation elements',
      'contract termination clauses'
    );
  }

  if (queryLower.includes('tort')) {
    specific.push(
      <any>(<any>'tort negligence standard'),
      'tort intentional infliction',
      'tort strict liability'
    );
  }

  if (queryLower.includes('criminal')) {
    specific.push(
      <any>(<any>'criminal constitutional rights'),
      'criminal evidence rules',
      'criminal sentencing guidelines'
    );
  }

  return [...filtered, ...specific].slice(0, 10);
}

async function getFilterOptions(): Promise<{
  document_types: string[];
  practice_areas: string[];
  jurisdictions: string[];
}> {
  try {
    const stats = await postgresqlVectorStorage.getStorageStatistics();

    return {
      document_types: Object.keys(stats.by_document_type),
      practice_areas: Object.keys(stats.by_practice_area),
      jurisdictions: Object.keys(stats.by_jurisdiction),
    };
  } catch (error) {
    console.error('Failed to get filter options:', error);

    // Return default options
    return {
      document_types: ['case-law', 'statute', 'regulation', 'constitutional', 'legal-guide'],
      practice_areas: [
        'contract-law',
        'tort-law',
        'criminal-law',
        'constitutional-law',
        'business-law',
      ],
      jurisdictions: ['federal', 'state', 'international'],
    };
  }
}
