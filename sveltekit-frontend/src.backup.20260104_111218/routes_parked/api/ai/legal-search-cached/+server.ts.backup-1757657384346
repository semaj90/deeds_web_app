/**
 * Cached Legal Search API Endpoint
 * High-performance legal document search with Redis caching
 * Optimized for legal research queries and case law searches
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVectorCache, setVectorCache, getEmbeddingCache, setEmbeddingCache } from '$lib/server/vector-cache';
import { cachedJson, CACHE_STRATEGIES } from '$lib/server/http-cache-headers';
import { redisService } from '$lib/server/redis-service';

// Legal search specialization cache keys
const LEGAL_CACHE_PREFIX = 'legal-search:';
const CASE_LAW_CACHE_PREFIX = 'case-law:';
const LEGAL_ANALYSIS_CACHE_PREFIX = 'legal-analysis:';

interface LegalSearchRequest {
  query: string;
  searchType: 'general' | 'case-law' | 'contracts' | 'regulations' | 'precedents';
  jurisdiction?: string;
  practiceArea?: string;
  dateRange?: {
    start?: string;
    end?: string;
  };
  options?: {
    limit?: number;
    includeAnalysis?: boolean;
    includeSimilarCases?: boolean;
    confidenceThreshold?: number;
  };
}

// POST: Cached legal search
export const POST: RequestHandler = async ({ request }) => {
  const startTime = performance.now();

  try {
    const searchRequest: LegalSearchRequest = await request.json();
    const { query, searchType, jurisdiction, practiceArea, dateRange, options = {} } = searchRequest;

    if (!query) {
      return json({
        success: false,
        error: 'Search query is required'
      }, { status: 400 });
    }

    // Generate specialized cache key based on legal search context
    const cacheKey = await generateLegalSearchKey(searchRequest);
    const embeddingCacheKey = `${searchType}:${query.toLowerCase().trim()}`;

    // Check cache first
    const cachedResults = await redisService.get(cacheKey);
    if (cachedResults) {
      console.log('[LegalSearchCached] Cache hit for legal search');
      
      return cachedJson(
        {
          success: true,
          ...cachedResults,
          metadata: {
            ...cachedResults.metadata,
            fromCache: true,
            cacheKey,
            totalResponseTime: `${(performance.now() - startTime).toFixed(2)}ms`
          }
        },
        'VECTOR_SEARCH'
      );
    }

    // Get or generate embedding
    let embedding: number[];
    let embeddingFromCache = false;

    const cachedEmbedding = await getEmbeddingCache(embeddingCacheKey, 'legal-nomic-embed');
    if (cachedEmbedding.entry) {
      embedding = cachedEmbedding.entry.embedding;
      embeddingFromCache = true;
    } else {
      // Generate legal-specific embedding
      embedding = await generateLegalEmbedding(query, searchType, practiceArea);
      await setEmbeddingCache(embeddingCacheKey, embedding, 'legal-nomic-embed');
    }

    // Perform specialized legal search
    const searchResults = await performLegalSearch({
      query,
      embedding,
      searchType,
      jurisdiction,
      practiceArea,
      dateRange,
      options
    });

    const totalTime = performance.now() - startTime;

    const response = {
      success: true,
      results: searchResults.results,
      metadata: {
        query,
        searchType,
        jurisdiction,
        practiceArea,
        totalResults: searchResults.totalResults,
        searchTime: searchResults.searchTime,
        embeddingFromCache,
        totalResponseTime: `${totalTime.toFixed(2)}ms`,
        fromCache: false
      },
      legalContext: searchResults.legalContext,
      relatedCases: searchResults.relatedCases,
      practiceAreaInsights: searchResults.practiceAreaInsights
    };

    // Cache the results with legal-specific TTL
    const cacheTTL = getLegalCacheTTL(searchType);
    await redisService.set(cacheKey, response, cacheTTL);

    return cachedJson(response, 'VECTOR_SEARCH');

  } catch (error: any) {
    const totalTime = performance.now() - startTime;
    
    return json({
      success: false,
      error: error.message,
      responseTime: `${totalTime.toFixed(2)}ms`,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};

// GET: Legal search statistics and health
export const GET: RequestHandler = async ({ url }) => {
  const action = url.searchParams.get('action') || 'stats';

  switch (action) {
    case 'stats':
      const redisStats = redisService.getStats();
      const redisInfo = await redisService.getRedisInfo();
      
      // Get legal search cache statistics
      const legalCacheKeys = await redisService.keys(`${LEGAL_CACHE_PREFIX}*`);
      const caseLawKeys = await redisService.keys(`${CASE_LAW_CACHE_PREFIX}*`);
      
      return cachedJson({
        success: true,
        redis: redisStats,
        cacheStatistics: {
          legalSearchEntries: legalCacheKeys.length,
          caseLawEntries: caseLawKeys.length,
          totalCachedSearches: legalCacheKeys.length + caseLawKeys.length
        },
        redisMemory: redisInfo?.memory,
        keyspace: redisInfo?.keyspace,
        timestamp: new Date().toISOString()
      }, 'REALTIME');

    case 'health':
      const isRedisHealthy = redisService.isHealthy();
      
      return json({
        success: true,
        health: {
          redis: isRedisHealthy,
          caching: true,
          legalSearchOptimized: true
        },
        timestamp: new Date().toISOString()
      });

    case 'clear-cache':
      try {
        const legalKeys = await redisService.keys(`${LEGAL_CACHE_PREFIX}*`);
        const caseLawKeys = await redisService.keys(`${CASE_LAW_CACHE_PREFIX}*`);
        const analysisKeys = await redisService.keys(`${LEGAL_ANALYSIS_CACHE_PREFIX}*`);
        
        const allKeys = [...legalKeys, ...caseLawKeys, ...analysisKeys];
        
        for (const key of allKeys) {
          await redisService.del(key);
        }
        
        return json({
          success: true,
          message: `Cleared ${allKeys.length} legal search cache entries`,
          timestamp: new Date().toISOString()
        });
        
      } catch (error: any) {
        return json({
          success: false,
          error: error.message
        }, { status: 500 });
      }

    default:
      return json({
        error: 'Invalid action',
        availableActions: ['stats', 'health', 'clear-cache'],
        endpoints: {
          search: 'POST /api/ai/legal-search-cached',
          stats: 'GET /api/ai/legal-search-cached?action=stats',
          health: 'GET /api/ai/legal-search-cached?action=health',
          clearCache: 'GET /api/ai/legal-search-cached?action=clear-cache'
        }
      }, { status: 400 });
  }
};

/**
 * Generate cache key for legal search requests
 */
async function generateLegalSearchKey(request: LegalSearchRequest): Promise<string> {
  const keyData = {
    query: request.query.toLowerCase().trim(),
    searchType: request.searchType,
    jurisdiction: request.jurisdiction,
    practiceArea: request.practiceArea,
    dateRange: request.dateRange,
    options: {
      limit: request.options?.limit || 10,
      includeAnalysis: request.options?.includeAnalysis || false,
      includeSimilarCases: request.options?.includeSimilarCases || false,
      confidenceThreshold: request.options?.confidenceThreshold || 0.7
    }
  };
  
  const crypto = await import('crypto');
  const hash = crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex');
  return `${LEGAL_CACHE_PREFIX}${request.searchType}:${hash.substring(0, 16)}`;
}

/**
 * Generate legal-specific embedding with context
 */
async function generateLegalEmbedding(
  query: string, 
  searchType: string, 
  practiceArea?: string
): Promise<number[]> {
  // Enhance query with legal context
  const legalContextPrompt = buildLegalContextPrompt(query, searchType, practiceArea);
  
  const response = await fetch('http://localhost:11434/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'nomic-embed-text',
      prompt: legalContextPrompt
    })
  });

  if (!response.ok) {
    throw new Error('Failed to generate legal embedding');
  }

  const data = await response.json();
  return data.embedding;
}

/**
 * Build legal context-aware prompt for better embeddings
 */
function buildLegalContextPrompt(query: string, searchType: string, practiceArea?: string): string {
  const contextPrefixes = {
    'case-law': 'Legal case law and judicial precedent: ',
    'contracts': 'Contract law and agreement terms: ',
    'regulations': 'Legal regulations and compliance requirements: ',
    'precedents': 'Legal precedents and court decisions: ',
    'general': 'Legal research query: '
  };

  let prompt = contextPrefixes[searchType as keyof typeof contextPrefixes] || contextPrefixes.general;
  prompt += query;
  
  if (practiceArea) {
    prompt += ` (Practice area: ${practiceArea})`;
  }
  
  return prompt;
}

/**
 * Perform specialized legal search
 */
async function performLegalSearch(params: {
  query: string;
  embedding: number[];
  searchType: string;
  jurisdiction?: string;
  practiceArea?: string;
  dateRange?: any;
  options: any;
}): Promise<any> {
  // Simulate legal search with specialized logic
  // In production, this would integrate with your legal database and AI services
  
  const mockResults = [
    {
      id: 'case-001',
      title: 'Employment Contract Dispute - Smith v. TechCorp',
      type: 'case-law',
      jurisdiction: params.jurisdiction || 'Federal',
      practiceArea: params.practiceArea || 'Employment Law',
      date: '2024-01-15',
      relevanceScore: 0.94,
      summary: 'Landmark case establishing precedent for remote work clauses in employment contracts',
      citation: 'Smith v. TechCorp, 123 F.3d 456 (2024)',
      keyPoints: [
        'Remote work provisions must be explicitly stated',
        'Employer cannot unilaterally change work location',
        'Good faith negotiation required for policy changes'
      ]
    },
    {
      id: 'reg-002', 
      title: 'Department of Labor Remote Work Guidelines',
      type: 'regulation',
      jurisdiction: params.jurisdiction || 'Federal',
      date: '2024-03-01',
      relevanceScore: 0.87,
      summary: 'Updated federal guidelines for remote work policies and employee rights',
      source: 'DOL Regulation 29 CFR 785.12',
      keyPoints: [
        'Minimum standards for remote work agreements',
        'Employee privacy protections during remote work',
        'Employer obligations for equipment and workspace'
      ]
    }
  ];

  return {
    results: mockResults,
    totalResults: mockResults.length,
    searchTime: '45ms',
    legalContext: {
      primaryJurisdiction: params.jurisdiction || 'Federal',
      applicableLaws: ['Employment Law', 'Contract Law'],
      relevantStatutes: ['29 USC § 201', '42 USC § 2000e']
    },
    relatedCases: ['Doe v. RemoteCorp (2023)', 'Johnson v. WorkFromHome Inc (2024)'],
    practiceAreaInsights: {
      trendingIssues: ['Remote work disputes', 'Digital privacy rights'],
      recentDevelopments: 'Increased focus on hybrid work arrangements'
    }
  };
}

/**
 * Get cache TTL based on search type
 */
function getLegalCacheTTL(searchType: string): number {
  const ttlMap = {
    'case-law': 3600,      // 1 hour - case law changes slowly
    'contracts': 1800,     // 30 minutes - contract templates may update
    'regulations': 7200,   // 2 hours - regulations change infrequently
    'precedents': 3600,    // 1 hour - precedents are stable
    'general': 1800        // 30 minutes - general searches vary more
  };

  return ttlMap[searchType as keyof typeof ttlMap] || 1800;
}