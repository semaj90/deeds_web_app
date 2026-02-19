#!/usr/bin/env node

/**
 * Ranking, Freshness, and Cache Rules Implementation
 * Advanced scoring system for legal document relevance and caching strategies
 */

import { EventEmitter } from 'events';

export class RankingFreshnessCache extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Ranking weights
      semanticWeight: config.semanticWeight || 0.4,      // Vector similarity score
      freshnessWeight: config.freshnessWeight || 0.2,    // Document recency
      authorityWeight: config.authorityWeight || 0.2,    // Legal authority/precedent
      popularityWeight: config.popularityWeight || 0.1,  // Usage/citation frequency
      relevanceWeight: config.relevanceWeight || 0.1,    // Keyword/metadata match
      
      // Freshness decay parameters
      freshnessDecayDays: config.freshnessDecayDays || 365,
      freshnessDecayFactor: config.freshnessDecayFactor || 0.5,
      
      // Authority scoring
      courtHierarchy: config.courtHierarchy || {
        'supreme': 1.0,
        'appellate': 0.8,
        'district': 0.6,
        'administrative': 0.4,
        'unknown': 0.2
      },
      
      // Cache TTL rules (in seconds)
      cacheTTL: {
        highAuthority: config.cacheTTL?.highAuthority || 7200,    // 2 hours
        mediumAuthority: config.cacheTTL?.mediumAuthority || 3600, // 1 hour
        lowAuthority: config.cacheTTL?.lowAuthority || 1800,      // 30 minutes
        searchResults: config.cacheTTL?.searchResults || 600,     // 10 minutes
        documents: config.cacheTTL?.documents || 1800,            // 30 minutes
        embeddings: config.cacheTTL?.embeddings || 86400          // 24 hours
      }
    };
    
    this.rankingMetrics = {
      totalQueries: 0,
      avgProcessingTime: 0,
      cacheHitRate: 0,
      topDocuments: new Map()
    };
  }

  /**
   * Calculate comprehensive ranking score for a document
   * @param {Object} document - Document with metadata
   * @param {number} semanticScore - Vector similarity score (0-1)
   * @param {Object} query - Original search query
   * @param {Object} context - Additional context (user preferences, etc.)
   * @returns {Object} Ranking result with score and breakdown
   */
  calculateRanking(document, semanticScore, query = {}, context = {}) {
    const now = new Date();
    
    // 1. Semantic similarity score (already computed)
    const semantic = Math.max(0, Math.min(1, semanticScore));
    
    // 2. Freshness score based on document age
    const freshness = this.calculateFreshnessScore(document.createdAt || document.created_at, now);
    
    // 3. Authority score based on legal metadata
    const authority = this.calculateAuthorityScore(document.metadata || document.legal_metadata);
    
    // 4. Popularity score based on usage patterns
    const popularity = this.calculatePopularityScore(document.id, document.metadata);
    
    // 5. Relevance score based on keyword/metadata matching
    const relevance = this.calculateRelevanceScore(document, query);
    
    // Weighted composite score
    const compositeScore = (
      semantic * this.config.semanticWeight +
      freshness * this.config.freshnessWeight +
      authority * this.config.authorityWeight +
      popularity * this.config.popularityWeight +
      relevance * this.config.relevanceWeight
    );
    
    // Apply context-based adjustments
    const contextualScore = this.applyContextualAdjustments(compositeScore, document, context);
    
    const ranking = {
      finalScore: Math.max(0, Math.min(1, contextualScore)),
      breakdown: {
        semantic: { score: semantic, weight: this.config.semanticWeight },
        freshness: { score: freshness, weight: this.config.freshnessWeight },
        authority: { score: authority, weight: this.config.authorityWeight },
        popularity: { score: popularity, weight: this.config.popularityWeight },
        relevance: { score: relevance, weight: this.config.relevanceWeight }
      },
      metadata: {
        documentAge: this.getDocumentAge(document.createdAt || document.created_at),
        authorityLevel: this.getAuthorityLevel(document.metadata),
        cacheCategory: this.getCacheCategory(authority, freshness)
      }
    };
    
    // Track for analytics
    this.updateRankingMetrics(document.id, ranking);
    
    return ranking;
  }

  /**
   * Calculate freshness score based on document age
   */
  calculateFreshnessScore(createdAt, currentTime = new Date()) {
    if (!createdAt) return 0.1; // Default low freshness for unknown dates
    
    const documentDate = new Date(createdAt);
    const ageInDays = (currentTime - documentDate) / (1000 * 60 * 60 * 24);
    
    // Exponential decay: newer documents score higher
    const freshnessScore = Math.exp(-ageInDays / this.config.freshnessDecayDays);
    
    return Math.max(0.1, Math.min(1, freshnessScore));
  }

  /**
   * Calculate authority score based on legal metadata
   */
  calculateAuthorityScore(metadata = {}) {
    let authorityScore = 0.2; // Base score
    
    // Court level hierarchy
    const courtLevel = metadata.court_level || metadata.courtLevel || 'unknown';
    authorityScore = Math.max(authorityScore, this.config.courtHierarchy[courtLevel.toLowerCase()] || 0.2);
    
    // Jurisdiction importance (federal > state > local)
    const jurisdiction = metadata.jurisdiction || '';
    if (jurisdiction.toLowerCase().includes('federal') || jurisdiction.toLowerCase().includes('supreme')) {
      authorityScore *= 1.2;
    } else if (jurisdiction.toLowerCase().includes('state')) {
      authorityScore *= 1.0;
    } else if (jurisdiction.toLowerCase().includes('local')) {
      authorityScore *= 0.8;
    }
    
    // Citation count (if available)
    const citationCount = parseInt(metadata.citation_count || metadata.citationCount || '0');
    if (citationCount > 0) {
      // Logarithmic scale for citation impact
      const citationBonus = Math.log10(citationCount + 1) * 0.1;
      authorityScore += citationBonus;
    }
    
    // Precedent strength
    const isPrecedent = metadata.is_precedent || metadata.isPrecedent || false;
    if (isPrecedent) {
      authorityScore *= 1.3;
    }
    
    return Math.max(0.1, Math.min(1, authorityScore));
  }

  /**
   * Calculate popularity score based on usage patterns
   */
  calculatePopularityScore(documentId, metadata = {}) {
    // Use view count, download count, or similar metrics
    const viewCount = parseInt(metadata.view_count || metadata.viewCount || '0');
    const downloadCount = parseInt(metadata.download_count || metadata.downloadCount || '0');
    const shareCount = parseInt(metadata.share_count || metadata.shareCount || '0');
    
    const totalEngagement = viewCount + (downloadCount * 3) + (shareCount * 5);
    
    if (totalEngagement === 0) return 0.1;
    
    // Logarithmic scale to prevent outliers from dominating
    const popularityScore = Math.log10(totalEngagement + 1) * 0.15;
    
    // Track top documents
    const currentScore = this.rankingMetrics.topDocuments.get(documentId) || 0;
    if (popularityScore > currentScore) {
      this.rankingMetrics.topDocuments.set(documentId, popularityScore);
    }
    
    return Math.max(0.1, Math.min(1, popularityScore));
  }

  /**
   * Calculate relevance score based on keyword/metadata matching
   */
  calculateRelevanceScore(document, query = {}) {
    if (!query.keywords && !query.query) return 0.5; // Neutral if no specific query
    
    const searchTerms = this.extractSearchTerms(query);
    if (searchTerms.length === 0) return 0.5;
    
    let relevanceScore = 0;
    let matchCount = 0;
    
    // Check title matches (higher weight)
    const title = (document.title || '').toLowerCase();
    searchTerms.forEach(term => {
      if (title.includes(term.toLowerCase())) {
        relevanceScore += 0.3;
        matchCount++;
      }
    });
    
    // Check content matches (medium weight)
    const content = (document.content || '').toLowerCase();
    searchTerms.forEach(term => {
      if (content.includes(term.toLowerCase())) {
        relevanceScore += 0.1;
        matchCount++;
      }
    });
    
    // Check metadata matches (lower weight)
    const metadataText = JSON.stringify(document.metadata || {}).toLowerCase();
    searchTerms.forEach(term => {
      if (metadataText.includes(term.toLowerCase())) {
        relevanceScore += 0.05;
        matchCount++;
      }
    });
    
    // Normalize by number of search terms
    if (matchCount > 0) {
      relevanceScore = relevanceScore / searchTerms.length;
    } else {
      relevanceScore = 0.1; // Low relevance if no matches
    }
    
    return Math.max(0.1, Math.min(1, relevanceScore));
  }

  /**
   * Apply contextual adjustments based on user preferences and query context
   */
  applyContextualAdjustments(baseScore, document, context = {}) {
    let adjustedScore = baseScore;
    
    // User practice area preference
    const userPracticeAreas = context.practiceAreas || [];
    const docPracticeAreas = document.metadata?.practice_areas || document.metadata?.practiceAreas || [];
    
    if (userPracticeAreas.length > 0 && docPracticeAreas.length > 0) {
      const overlap = userPracticeAreas.filter(area => 
        docPracticeAreas.some(docArea => docArea.toLowerCase().includes(area.toLowerCase()))
      ).length;
      
      if (overlap > 0) {
        adjustedScore *= (1 + (overlap / userPracticeAreas.length) * 0.2); // Up to 20% boost
      }
    }
    
    // Recency preference for certain document types
    const preferRecent = context.preferRecent || false;
    if (preferRecent) {
      const freshnessBonus = this.calculateFreshnessScore(document.createdAt || document.created_at);
      adjustedScore *= (1 + freshnessBonus * 0.15); // Up to 15% boost for fresh documents
    }
    
    // Language preference
    const preferredLanguage = context.language || 'en';
    const docLanguage = document.metadata?.language || document.language || 'en';
    if (docLanguage !== preferredLanguage) {
      adjustedScore *= 0.9; // 10% penalty for non-preferred language
    }
    
    // Time-sensitive queries
    if (context.timeSensitive && this.getDocumentAge(document.createdAt || document.created_at) > 180) {
      adjustedScore *= 0.8; // Penalty for old documents in time-sensitive queries
    }
    
    return adjustedScore;
  }

  /**
   * Determine appropriate cache TTL and strategy
   */
  determineCacheStrategy(document, rankingResult, queryType = 'search') {
    const { authority, freshness } = rankingResult.breakdown;
    const authorityLevel = this.getAuthorityLevel(document.metadata);
    
    let ttl = this.config.cacheTTL.documents; // Default
    let strategy = 'standard';
    
    // Determine TTL based on document characteristics
    if (authorityLevel === 'high') {
      ttl = this.config.cacheTTL.highAuthority;
      strategy = 'long_term';
    } else if (authorityLevel === 'medium') {
      ttl = this.config.cacheTTL.mediumAuthority;
      strategy = 'medium_term';
    } else {
      ttl = this.config.cacheTTL.lowAuthority;
      strategy = 'short_term';
    }
    
    // Adjust based on freshness
    if (freshness.score > 0.8) {
      ttl *= 0.5; // Fresh documents change more often
      strategy += '_fresh';
    }
    
    // Query-specific adjustments
    if (queryType === 'search') {
      ttl = this.config.cacheTTL.searchResults;
    } else if (queryType === 'embeddings') {
      ttl = this.config.cacheTTL.embeddings;
    }
    
    return {
      ttl: Math.max(60, ttl), // Minimum 1 minute
      strategy,
      priority: authorityLevel === 'high' ? 'high' : 'normal',
      tags: [
        `authority:${authorityLevel}`,
        `freshness:${freshness.score > 0.5 ? 'recent' : 'old'}`,
        `type:${queryType}`
      ]
    };
  }

  /**
   * Generate cache key with ranking-aware strategy
   */
  generateCacheKey(query, filters = {}, options = {}) {
    const baseKey = this.hashQuery(query);
    const filterKey = this.hashFilters(filters);
    const rankingKey = this.hashRankingConfig();
    
    return `legal_ai:ranked:${baseKey}:${filterKey}:${rankingKey}`;
  }

  /**
   * Rank search results and apply caching strategy
   */
  rankSearchResults(results, query, context = {}) {
    const startTime = Date.now();
    
    // Apply ranking to each result
    const rankedResults = results.map(result => {
      const ranking = this.calculateRanking(
        result.document || result,
        result.score || result.semantic_score || 0.5,
        query,
        context
      );
      
      return {
        ...result,
        ranking,
        finalScore: ranking.finalScore,
        cacheStrategy: this.determineCacheStrategy(
          result.document || result,
          ranking,
          'search'
        )
      };
    });
    
    // Sort by final score (descending)
    rankedResults.sort((a, b) => b.finalScore - a.finalScore);
    
    // Apply diversity filtering (avoid too many similar results)
    const diverseResults = this.applyDiversityFiltering(rankedResults, query);
    
    const processingTime = Date.now() - startTime;
    this.updatePerformanceMetrics(processingTime);
    
    return {
      results: diverseResults,
      metadata: {
        totalProcessed: results.length,
        totalReturned: diverseResults.length,
        processingTime,
        rankingConfig: this.getRankingConfigSummary()
      }
    };
  }

  /**
   * Apply diversity filtering to prevent redundant results
   */
  applyDiversityFiltering(rankedResults, query, maxSimilar = 3) {
    const diverseResults = [];
    const seenSimilar = new Map();
    
    for (const result of rankedResults) {
      const docType = result.document?.document_type || result.document_type || 'unknown';
      const practiceArea = result.document?.metadata?.practice_areas?.[0] || 
                          result.metadata?.practice_areas?.[0] || 'general';
      
      const similarityKey = `${docType}:${practiceArea}`;
      const similarCount = seenSimilar.get(similarityKey) || 0;
      
      if (similarCount < maxSimilar) {
        diverseResults.push(result);
        seenSimilar.set(similarityKey, similarCount + 1);
      }
    }
    
    return diverseResults;
  }

  // Helper methods
  
  extractSearchTerms(query) {
    const terms = [];
    if (query.query) {
      terms.push(...query.query.split(' ').filter(term => term.length > 2));
    }
    if (query.keywords) {
      terms.push(...query.keywords);
    }
    return terms;
  }

  getDocumentAge(createdAt) {
    if (!createdAt) return null;
    const now = new Date();
    const created = new Date(createdAt);
    return Math.floor((now - created) / (1000 * 60 * 60 * 24)); // Days
  }

  getAuthorityLevel(metadata = {}) {
    const courtLevel = metadata.court_level || metadata.courtLevel || 'unknown';
    const citationCount = parseInt(metadata.citation_count || metadata.citationCount || '0');
    
    if (courtLevel === 'supreme' || citationCount > 100) return 'high';
    if (courtLevel === 'appellate' || citationCount > 10) return 'medium';
    return 'low';
  }

  getCacheCategory(authorityScore, freshnessScore) {
    if (authorityScore > 0.7) return 'high_authority';
    if (freshnessScore > 0.8) return 'fresh';
    if (authorityScore > 0.5) return 'medium_authority';
    return 'standard';
  }

  hashQuery(query) {
    return JSON.stringify(query).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  }

  hashFilters(filters) {
    return JSON.stringify(filters).replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
  }

  hashRankingConfig() {
    const config = {
      sw: this.config.semanticWeight,
      fw: this.config.freshnessWeight,
      aw: this.config.authorityWeight,
      pw: this.config.popularityWeight,
      rw: this.config.relevanceWeight
    };
    return JSON.stringify(config).replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
  }

  updateRankingMetrics(documentId, ranking) {
    this.rankingMetrics.totalQueries++;
    
    // Update top documents
    if (this.rankingMetrics.topDocuments.size > 1000) {
      // Keep only top 1000 to prevent memory growth
      const sorted = Array.from(this.rankingMetrics.topDocuments.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 1000);
      this.rankingMetrics.topDocuments = new Map(sorted);
    }
  }

  updatePerformanceMetrics(processingTime) {
    const current = this.rankingMetrics.avgProcessingTime;
    const total = this.rankingMetrics.totalQueries;
    
    this.rankingMetrics.avgProcessingTime = 
      ((current * (total - 1)) + processingTime) / total;
  }

  getRankingConfigSummary() {
    return {
      weights: {
        semantic: this.config.semanticWeight,
        freshness: this.config.freshnessWeight,
        authority: this.config.authorityWeight,
        popularity: this.config.popularityWeight,
        relevance: this.config.relevanceWeight
      },
      freshnessPeriod: `${this.config.freshnessDecayDays} days`,
      courtHierarchy: this.config.courtHierarchy
    };
  }

  getMetrics() {
    return {
      ...this.rankingMetrics,
      topDocuments: Array.from(this.rankingMetrics.topDocuments.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([id, score]) => ({ documentId: id, popularityScore: score }))
    };
  }
}

// CLI usage example
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const ranker = new RankingFreshnessCache({
    semanticWeight: 0.4,
    freshnessWeight: 0.25,
    authorityWeight: 0.25,
    popularityWeight: 0.05,
    relevanceWeight: 0.05
  });

  // Example documents
  const mockResults = [
    {
      document: {
        id: 'doc1',
        title: 'Contract Law Principles',
        content: 'Overview of contract law...',
        createdAt: '2024-01-15',
        metadata: {
          court_level: 'supreme',
          citation_count: '150',
          practice_areas: ['contract', 'commercial']
        }
      },
      score: 0.85
    },
    {
      document: {
        id: 'doc2', 
        title: 'Recent Contract Disputes',
        content: 'Analysis of recent cases...',
        createdAt: '2024-08-01',
        metadata: {
          court_level: 'appellate',
          citation_count: '25',
          practice_areas: ['contract', 'litigation']
        }
      },
      score: 0.75
    }
  ];

  const query = { query: 'contract law disputes', keywords: ['contract', 'dispute'] };
  const context = { practiceAreas: ['contract'], preferRecent: true };

  const ranked = ranker.rankSearchResults(mockResults, query, context);
  
  console.log('🏆 Ranked Results:');
  ranked.results.forEach((result, idx) => {
    console.log(`${idx + 1}. ${result.document.title}`);
    console.log(`   Final Score: ${result.finalScore.toFixed(3)}`);
    console.log(`   Cache Strategy: ${result.cacheStrategy.strategy} (${result.cacheStrategy.ttl}s)`);
    console.log(`   Breakdown:`, result.ranking.breakdown);
    console.log('');
  });

  console.log('📊 Performance Metrics:', ranker.getMetrics());
}

export default RankingFreshnessCache;