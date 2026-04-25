/**
 * RAG Ranking System
 * Advanced ranking system for legal document retrieval using cosine similarity,
 * legal domain scoring, and multi-factor relevance algorithms
 */

import type { SimilarityResult, VectorizedDocument } from './gemma-embedding-service.js';
import { gemmaEmbeddingService } from './gemma-embedding-service.js';

export interface RankingWeights {
  cosine_similarity: number;
  legal_domain_relevance: number;
  document_recency: number;
  content_quality: number;
  authority_score: number;
  context_match: number;
}

export interface RankingContext {
  query: string;
  legal_area?: string;
  document_type?: string;
  jurisdiction?: string;
  user_expertise_level?: 'beginner' | 'intermediate' | 'advanced';
  search_intent?: 'research' | 'case_prep' | 'general' | 'precedent';
  temporal_relevance?: 'recent' | 'historical' | 'any';
}

export interface RankedResult extends SimilarityResult {
  final_score: number;
  ranking_components: {
    cosine_similarity_score: number;
    legal_domain_score: number;
    recency_score: number;
    quality_score: number;
    authority_score: number;
    context_score: number;
  };
  ranking_explanation: string;
  confidence_level: number;
  recommended_action: 'highly_relevant' | 'relevant' | 'potentially_relevant' | 'not_relevant';
}

export interface RankingAnalytics {
  total_candidates: number;
  ranked_results: number;
  average_score: number;
  score_distribution: Record<string, number>;
  processing_time_ms: number;
  ranking_strategy: string;
}

export class RAGRankingSystem {
  private defaultWeights: RankingWeights = {
    cosine_similarity: 0.35, // Primary semantic similarity
    legal_domain_relevance: 0.25, // Legal area/type relevance
    document_recency: 0.1, // How recent the document is
    content_quality: 0.15, // Document quality indicators
    authority_score: 0.1, // Source authority/credibility
    context_match: 0.05, // Query context alignment
  };

  private legalDomainHierarchy: Record<string, string[]> = {
    'contract-law': ['business-law', 'commercial-law', 'property-law'],
    'tort-law': ['personal-injury', 'negligence', 'liability'],
    'constitutional-law': ['civil-rights', 'due-process', 'judicial-review'],
    'criminal-law': ['prosecution', 'defense', 'evidence'],
    'employment-law': ['workplace', 'discrimination', 'labor-relations'],
    'business-law': ['corporate', 'securities', 'commercial'],
    'property-law': ['real-estate', 'intellectual-property', 'land-use'],
  };

  private sourceAuthority: Record<string, number> = {
    'supreme-court': 1.0,
    'federal-appellate': 0.9,
    'federal-district': 0.8,
    'state-supreme': 0.85,
    'state-appellate': 0.75,
    'legal-info-institute': 0.8,
    'justia-legal-resources': 0.7,
    'findlaw-cases': 0.75,
    'legal-encyclopedia': 0.8,
    'law-review': 0.85,
    'government-publication': 0.9,
    unknown: 0.5,
  };

  constructor() {}

  /**
   * Rank search results with comprehensive scoring
   */
  async rankResults(
    candidates: SimilarityResult[],
    context: RankingContext,
    customWeights?: Partial<RankingWeights>
  ): Promise<RankedResult[]> {
    const startTime = Date.now();
    console.log(
      `🎯 Ranking ${candidates.length} candidates with context: ${context.search_intent || 'general'}`
    );

    const weights = { ...this.defaultWeights, ...customWeights };
    const rankedResults: RankedResult[] = [];

    for (const candidate of candidates) {
      try {
        const rankingComponents = await this.calculateRankingComponents(candidate, context);
        const finalScore = this.calculateWeightedScore(rankingComponents, weights);

        const rankedResult: RankedResult = {
          ...candidate,
          final_score: finalScore,
          ranking_components: rankingComponents,
          ranking_explanation: this.generateRankingExplanation(rankingComponents, weights),
          confidence_level: this.calculateConfidenceLevel(rankingComponents),
          recommended_action: this.determineRecommendedAction(finalScore, rankingComponents),
        };

        rankedResults.push(<any>(<any>rankedResult));
      } catch (error) {
        console.error(`❌ Error ranking result ${candidate.chunk_id}:`, error);
      }
    }

    // Sort by final score (highest first)
    rankedResults.sort((a, b) => b.final_score - a.final_score);

    const processingTime = Date.now() - startTime;
    console.log(`✅ Ranked ${rankedResults.length} results in ${processingTime}ms`);

    return rankedResults;
  }

  /**
   * Calculate individual ranking components
   */
  private async calculateRankingComponents(
    result: SimilarityResult,
    context: RankingContext
  ): Promise<RankedResult['ranking_components']> {
    return {
      cosine_similarity_score: result.similarity_score,
      legal_domain_score: this.calculateLegalDomainScore(result, context),
      recency_score: this.calculateRecencyScore(result, context),
      quality_score: this.calculateQualityScore(result),
      authority_score: this.calculateAuthorityScore(result),
      context_score: this.calculateContextScore(result, context),
    };
  }

  /**
   * Calculate legal domain relevance score
   */
  private calculateLegalDomainScore(result: SimilarityResult, context: RankingContext): number {
    let score = 0;

    // Exact legal area match
    if (context.legal_area && result.metadata.legal_area === context.legal_area) {
      score += 0.5;
    }

    // Related legal area match
    if (context.legal_area && this.legalDomainHierarchy[context.legal_area]) {
      const relatedAreas = this.legalDomainHierarchy[context.legal_area];
      if (relatedAreas.includes(result.metadata.legal_area)) {
        score += 0.3;
      }
    }

    // Document type match
    if (context.document_type && result.metadata.document_type === context.document_type) {
      score += 0.3;
    }

    // Jurisdiction preference
    if (context.jurisdiction) {
      if (result.metadata.jurisdiction === context.jurisdiction) {
        score += 0.2;
      } else if (
        result.metadata.jurisdiction === 'federal' &&
        context.jurisdiction !== 'international'
      ) {
        score += 0.1; // Federal has some relevance to state matters
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate document recency score
   */
  private calculateRecencyScore(result: SimilarityResult, context: RankingContext): number {
    if (!result.metadata.chunk_metadata?.timestamp) {
      return 0.5; // Neutral score for unknown dates
    }

    const documentDate = new Date(result.metadata.chunk_metadata.timestamp);
    const now = new Date();
    const ageInDays = (now.getTime() - documentDate.getTime()) / (1000 * 60 * 60 * 24);

    // Apply temporal relevance preference
    switch (context.temporal_relevance) {
      case 'recent':
        if (ageInDays <= 30) return 1.0; // Last 30 days
        if (ageInDays <= 365) return 0.8; // Last year
        if (ageInDays <= 1825) return 0.5; // Last 5 years
        return 0.2;

      case 'historical':
        if (ageInDays > 1825) return 1.0; // Older than 5 years
        if (ageInDays > 365) return 0.8; // 1-5 years
        return 0.4;

      case 'any':
      default:
        // Gradual decay: newer is better but not heavily weighted
        if (ageInDays <= 30) return 1.0;
        if (ageInDays <= 365) return 0.9;
        if (ageInDays <= 1825) return 0.7;
        if (ageInDays <= 3650) return 0.5; // 5-10 years
        return 0.3;
    }
  }

  /**
   * Calculate content quality score
   */
  private calculateQualityScore(result: SimilarityResult): number {
    let score = 0.5; // Base score

    // Content length (sweet spot is 200-2000 characters)
    const contentLength = result.content.length;
    if (contentLength >= 200 && contentLength <= 2000) {
      score += 0.2;
    } else if (contentLength > 100 && contentLength < 200) {
      score += 0.1;
    } else if (contentLength > 2000 && contentLength < 5000) {
      score += 0.1;
    }

    // Legal concepts density
    const legalConceptCount = result.legal_concepts?.length || 0;
    const legalDensity = legalConceptCount / (contentLength / 100); // Concepts per 100 chars
    if (legalDensity > 0.5) score += 0.2;
    else if (legalDensity > 0.2) score += 0.1;

    // Structured content indicators (citations, sections, etc.)
    const citationPattern = /\d+\s+U\.S\.|\d+\s+F\.\d+d|\d+\s+S\.Ct\./g;
    const citations = result.content.match(citationPattern);
    if (citations && citations.length > 0) {
      score += Math.min(citations.length * 0.05, 0.15);
    }

    // Legal formatting indicators
    const legalFormats = [
      /\b\d+\.\s+/g, // Numbered sections
      /\([a-z]\)/g, // Lettered subsections
      /\bSEC\.\s+\d+/gi, // Section references
      /\bwhereas\b/gi, // Contract language
    ];

    for (const pattern of legalFormats) {
      if (pattern.test(result.content)) {
        score += 0.05;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate source authority score
   */
  private calculateAuthorityScore(result: SimilarityResult): number {
    const source = result.metadata.document_source || 'unknown';

    // Direct lookup
    if (this.sourceAuthority[source]) {
      return this.sourceAuthority[source];
    }

    // Pattern matching for unknown sources
    if (source.includes('supreme')) return 0.9;
    if (source.includes('federal') || source.includes('circuit')) return 0.85;
    if (source.includes('court')) return 0.75;
    if (source.includes('gov')) return 0.8;
    if (source.includes('law') || source.includes('legal')) return 0.7;

    return 0.5; // Default for unknown sources
  }

  /**
   * Calculate query context alignment score
   */
  private calculateContextScore(result: SimilarityResult, context: RankingContext): number {
    let score = 0;

    // User expertise alignment
    if (context.user_expertise_level) {
      const complexity = this.estimateContentComplexity(result.content);

      switch (context.user_expertise_level) {
        case 'beginner':
          score += complexity < 0.3 ? 0.3 : complexity > 0.7 ? 0 : 0.15;
          break;
        case 'intermediate':
          score += complexity >= 0.3 && complexity <= 0.7 ? 0.3 : 0.1;
          break;
        case 'advanced':
          score += complexity > 0.5 ? 0.3 : 0.15;
          break;
      }
    }

    // Search intent alignment
    if (context.search_intent) {
      const intentKeywords = {
        research: ['analysis', 'study', 'overview', 'explanation', 'theory'],
        case_prep: ['precedent', 'ruling', 'decision', 'case', 'holding'],
        precedent: ['precedent', 'stare decisis', 'binding', 'authority'],
        general: ['introduction', 'basic', 'fundamental', 'overview'],
      };

      const keywords = intentKeywords[context.search_intent] || [];
      const contentLower = result.content.toLowerCase();

      for (const keyword of keywords) {
        if (contentLower.includes(keyword)) {
          score += 0.1;
        }
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate weighted final score
   */
  private calculateWeightedScore(
    components: RankedResult['ranking_components'],
    weights: RankingWeights
  ): number {
    return (
      components.cosine_similarity_score * weights.cosine_similarity +
      components.legal_domain_score * weights.legal_domain_relevance +
      components.recency_score * weights.document_recency +
      components.quality_score * weights.content_quality +
      components.authority_score * weights.authority_score +
      components.context_score * weights.context_match
    );
  }

  /**
   * Generate human-readable ranking explanation
   */
  private generateRankingExplanation(
    components: RankedResult['ranking_components'],
    weights: RankingWeights
  ): string {
    const explanations: string[] = [];

    if (components.cosine_similarity_score > 0.8) {
      explanations.push(<any>(<any>'Highly similar content'));
    } else if (components.cosine_similarity_score > 0.6) {
      explanations.push(<any>(<any>'Similar content'));
    }

    if (components.legal_domain_score > 0.7) {
      explanations.push(<any>(<any>'Strong legal domain match'));
    } else if (components.legal_domain_score > 0.4) {
      explanations.push(<any>(<any>'Related legal area'));
    }

    if (components.authority_score > 0.8) {
      explanations.push(<any>(<any>'Authoritative source'));
    }

    if (components.quality_score > 0.7) {
      explanations.push(<any>(<any>'High-quality content'));
    }

    if (components.recency_score > 0.8) {
      explanations.push(<any>(<any>'Recent document'));
    }

    return explanations.length > 0 ? explanations.join(', ') : 'Standard relevance match';
  }

  /**
   * Calculate confidence level
   */
  private calculateConfidenceLevel(components: RankedResult['ranking_components']): number {
    const weights = [0.4, 0.25, 0.15, 0.1, 0.05, 0.05]; // Ordered by importance
    const scores = [
      components.cosine_similarity_score,
      components.legal_domain_score,
      components.quality_score,
      components.authority_score,
      components.recency_score,
      components.context_score,
    ];

    let confidence = 0;
    for (let i = 0; i < scores.length; i++) {
      confidence += scores[i] * weights[i];
    }

    return Math.round(confidence * 100) / 100;
  }

  /**
   * Determine recommended action
   */
  private determineRecommendedAction(
    finalScore: number,
    components: RankedResult['ranking_components']
  ): RankedResult['recommended_action'] {
    if (finalScore > 0.8 && components.cosine_similarity_score > 0.7) {
      return 'highly_relevant';
    } else if (finalScore > 0.6) {
      return 'relevant';
    } else if (finalScore > 0.4 && components.legal_domain_score > 0.5) {
      return 'potentially_relevant';
    } else {
      return 'not_relevant';
    }
  }

  /**
   * Estimate content complexity
   */
  private estimateContentComplexity(content: string): number {
    const complexTerms = ['notwithstanding', 'pursuant', 'aforementioned', 'heretofore', 'whereas'];
    const sentences = content.split(/[.!?]+/);
    const words = content.split(/\s+/);

    const avgWordsPerSentence = words.length / sentences.length;
    const complexTermCount = complexTerms.reduce(
      (count, term) => count + (content.toLowerCase().includes(term) ? 1 : 0),
      0
    );
    const citationCount = (content.match(/\d+\s+U\.S\.|\d+\s+F\.\d+d/g) || []).length;

    const complexity = Math.min(
      (avgWordsPerSentence / 30) * 0.4 + (complexTermCount / 5) * 0.4 + (citationCount / 3) * 0.2,
      1.0
    );

    return complexity;
  }

  /**
   * Generate ranking analytics
   */
  generateAnalytics(rankedResults: RankedResult[], processingTime: number): RankingAnalytics {
    const scores = rankedResults.map((r) => r.final_score);
    const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    // Score distribution
    const scoreDistribution: Record<string, number> = {
      highly_relevant: 0,
      relevant: 0,
      potentially_relevant: 0,
      not_relevant: 0,
    };

    for (const result of rankedResults) {
      scoreDistribution[result.recommended_action]++;
    }

    return {
      total_candidates: rankedResults.length,
      ranked_results: rankedResults.length,
      average_score: Math.round(averageScore * 100) / 100,
      score_distribution: scoreDistribution,
      processing_time_ms: processingTime,
      ranking_strategy: 'multi_factor_legal_rag',
    };
  }

  /**
   * Adaptive ranking - adjust weights based on result feedback
   */
  adaptWeights(feedback: {
    query: string;
    results: RankedResult[];
    user_clicks: number[];
    user_ratings?: number[];
  }): RankingWeights {
    // Simple adaptation: increase weights for components that correlate with user engagement
    const newWeights = { ...this.defaultWeights };

    // This is a simplified adaptation algorithm
    // In practice, you'd use more sophisticated ML techniques

    const clickedResults = feedback.results.filter((_, index) =>
      feedback.user_clicks.includes(index)
    );

    if (clickedResults.length > 0) {
      const avgClickedSimilarity =
        clickedResults.reduce(
          (sum, result) => sum + result.ranking_components.cosine_similarity_score,
          0
        ) / clickedResults.length;

      const avgClickedDomain =
        clickedResults.reduce(
          (sum, result) => sum + result.ranking_components.legal_domain_score,
          0
        ) / clickedResults.length;

      // Adjust weights slightly based on what users clicked
      if (avgClickedSimilarity > 0.8) {
        newWeights.cosine_similarity += 0.05;
      }
      if (avgClickedDomain > 0.7) {
        newWeights.legal_domain_relevance += 0.05;
      }

      // Normalize weights to sum to 1
      const totalWeight = Object.values(newWeights).reduce((sum, weight) => sum + weight, 0);
      for (const key of Object.keys(newWeights) as Array<keyof RankingWeights>) {
        newWeights[key] /= totalWeight;
      }
    }

    return newWeights;
  }

  /**
   * Get default ranking weights
   */
  getDefaultWeights(): RankingWeights {
    return { ...this.defaultWeights };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test basic ranking functionality
      const testResult: SimilarityResult = {
        document_id: 'test',
        chunk_id: 'test',
        content: 'test content',
        similarity_score: 0.8,
        metadata: {
          legal_area: 'contract-law',
          document_type: 'case-law',
        },
        legal_concepts: ['contract', 'breach'],
      };

      const testContext: RankingContext = {
        query: 'test query',
        legal_area: 'contract-law',
      };

      await this.rankResults([testResult], testContext);
      return true;
    } catch (error) {
      console.error('RAG Ranking System health check failed:', error);
      return false;
    }
  }
}

// Export singleton
export const ragRankingSystem = new RAGRankingSystem();
export default ragRankingSystem;
