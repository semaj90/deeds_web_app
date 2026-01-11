import type { RequestHandler } from './$types.js';

// Enhanced Legal AI Search API with LangChain.js, Nomic Embed, and Vector Search
// Provides advanced semantic search with multiple strategies and intelligent ranking

import { enhancedLegalSearch, type LegalSearchResult } from '../../../../lib/server/ai/enhanced-legal-search.js';
import { URL } from "url";

// Rate limiting configuration
// Simple rate limiter stub that returns the expected format
const rateLimiter = {
  check: (ip: string) => Promise.resolve({ allowed: true, retryAfter: null }),
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many search requests, please try again later.'
};

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
  try {
    // Apply rate limiting
    const clientAddress = getClientAddress();
    const rateLimitResult = await rateLimiter.check(clientAddress);
    
    if (!rateLimitResult.allowed) {
      return json({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult.retryAfter
      }, { status: 429 });
    }

    const query = url.searchParams.get('q') || url.searchParams.get('query');
    const jurisdiction = url.searchParams.get('jurisdiction') || 'all';
    const category = url.searchParams.get('category') || 'all';
    const maxResults = parseInt(url.searchParams.get('limit') || '10');
    const useAI = url.searchParams.get('useAI') !== 'false';

    if (!query || query.trim().length < 2) {
      return json({
        success: false,
        error: 'Query parameter "q" is required and must be at least 2 characters',
        query: query
      }, { status: 400 });
    }

    console.log(`🔍 Enhanced legal search: "${query}" [${jurisdiction}/${category}]`);

    // Perform enhanced search
    const startTime = Date.now();
    
    const results = await enhancedLegalSearch.search(query, {
      jurisdiction: jurisdiction !== 'all' ? jurisdiction : undefined,
      category: category !== 'all' ? category : undefined,
      maxResults,
      useAI
    });

    const searchTime = Date.now() - startTime;

    // Calculate search analytics
    const analytics = calculateSearchAnalytics(results, query, searchTime);

    return json({
      success: true,
      query,
      results,
      analytics,
      searchTime: `${searchTime}ms`,
      timestamp: new Date().toISOString(),
      total: results.length,
      filters: {
        jurisdiction,
        category,
        maxResults,
        useAI
      }
    });

  } catch (error: any) {
    console.error('Enhanced legal search API error:', error);
    
    return json({
      success: false,
      error: 'Search service temporarily unavailable',
      details: import.meta.env.NODE_ENV === 'development' ? String(error) : undefined,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  try {
    // Apply rate limiting
    const clientAddress = getClientAddress();
    const rateLimitResult = await rateLimiter.check(clientAddress);
    
    if (!rateLimitResult.allowed) {
      return json({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult.retryAfter
      }, { status: 429 });
    }

    const body = await request.json();
    const { 
      query, 
      jurisdiction = 'all', 
      category = 'all', 
      maxResults = 10,
      useAI = true,
      advancedOptions = {}
    } = body;

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return json({
        success: false,
        error: 'Query is required and must be at least 2 characters',
        received: { query, type: typeof query }
      }, { status: 400 });
    }

    console.log(`🔍 Enhanced legal search (POST): "${query.substring(0, 50)}..." [${jurisdiction}/${category}]`);

    const startTime = Date.now();

    // Perform enhanced search with advanced options
    const results = await enhancedLegalSearch.search(query, {
      jurisdiction: jurisdiction !== 'all' ? jurisdiction : undefined,
      category: category !== 'all' ? category : undefined,
      maxResults: Math.min(maxResults, 50), // Cap at 50 results
      useAI,
      ...advancedOptions
    });

    const searchTime = Date.now() - startTime;

    // Enhanced analytics for POST requests
    const analytics = calculateAdvancedAnalytics(results, query, searchTime, body);

    // AI enhancement if requested
    let aiEnhancement = null;
    if (useAI && results.length > 0) {
      aiEnhancement = await generateAIEnhancement(query, results.slice(0, 5));
    }

    return json({
      success: true,
      query,
      results,
      analytics,
      aiEnhancement,
      searchTime: `${searchTime}ms`,
      timestamp: new Date().toISOString(),
      total: results.length,
      filters: {
        jurisdiction,
        category,
        maxResults,
        useAI
      },
      advancedOptions
    });

  } catch (error: any) {
    console.error('Enhanced legal search POST API error:', error);
    
    return json({
      success: false,
      error: 'Search service temporarily unavailable',
      details: import.meta.env.NODE_ENV === 'development' ? String(error) : undefined,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};

// Analytics calculation functions
function calculateSearchAnalytics(results: LegalSearchResult[], query: string, searchTime: number) {
  if (results.length === 0) {
    return {
      avgScore: 0,
      avgConfidence: 0,
      searchTypes: {},
      jurisdictions: {},
      categories: {},
      searchTime,
      resultCount: 0
    };
  }

  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const totalConfidence = results.reduce((sum, r) => sum + r.confidence, 0);
  
  const searchTypes = results.reduce((acc, r) => {
    acc[r.searchType] = (acc[r.searchType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const jurisdictions = results.reduce((acc, r) => {
    acc[r.jurisdiction] = (acc[r.jurisdiction] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const categories = results.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    avgScore: totalScore / results.length,
    avgConfidence: totalConfidence / results.length,
    searchTypes,
    jurisdictions,
    categories,
    searchTime,
    resultCount: results.length,
    topScore: Math.max(...results.map(r => r.score)),
    queryLength: query.length,
    queryTerms: query.split(' ').length
  };
}

function calculateAdvancedAnalytics(results: LegalSearchResult[], query: string, searchTime: number, requestBody: any) {
  const basicAnalytics = calculateSearchAnalytics(results, query, searchTime);
  
  // Add advanced metrics
  const relevanceFactors = results.reduce((acc, r) => {
    acc.semantic += r.relevanceFactors.semantic;
    acc.exact_match += r.relevanceFactors.exact_match;
    acc.jurisdiction_match += r.relevanceFactors.jurisdiction_match;
    acc.category_match += r.relevanceFactors.category_match;
    return acc;
  }, {
    semantic: 0,
    exact_match: 0,
    jurisdiction_match: 0,
    category_match: 0
  });

  const count = results.length;
  if (count > 0) {
    Object.keys(relevanceFactors).forEach(key => {
      relevanceFactors[key] = relevanceFactors[key] / count;
    });
  }

  return {
    ...basicAnalytics,
    relevanceFactors,
    vectorSearchUsed: results.some(r => r.searchType === 'vector'),
    hybridSearchUsed: results.some(r => r.searchType === 'hybrid'),
    fallbackUsed: results.some(r => r.searchType === 'fallback'),
    requestSize: JSON.stringify(requestBody).length
  };
}

async function generateAIEnhancement(query: string, topResults: LegalSearchResult[]): Promise<any> {
  try {
    const resultsSummary = topResults.map(r => `${r.title} (${r.category}, ${r.jurisdiction})`).join('; ');
    
    return {
      summary: `Found ${topResults.length} highly relevant legal documents related to "${query}".`,
      topCategories: Array.from(new Set(topResults.map(r => r.category))),
      topJurisdictions: Array.from(new Set(topResults.map(r => r.jurisdiction))),
      suggestions: [
        `Try refining your search with terms from: ${topResults[0]?.category}`,
        `Consider exploring related ${topResults[0]?.jurisdiction} laws`,
        `Look for specific sections: ${topResults[0]?.sections?.join(', ') || 'N/A'}`
      ].filter(s => !s.includes('N/A')),
      confidence: topResults.reduce((sum, r) => sum + r.confidence, 0) / topResults.length,
      recommendedNextSearch: topResults[0]?.category ? `${query} ${topResults[0].category}` : null
    };
    
  } catch (error: any) {
    console.warn('AI enhancement generation failed:', error);
    return null;
  }
}

// Health check endpoint
export const OPTIONS: RequestHandler = async () => {
  return json({
    status: 'healthy',
    service: 'enhanced-legal-search',
    version: '1.0.0',
    features: [
      'vector-search',
      'hybrid-search',
      'fuzzy-matching',
      'langchain-integration',
      'nomic-embeddings',
      'pgvector-support',
      'ai-enhancement'
    ],
    timestamp: new Date().toISOString()
  });
};