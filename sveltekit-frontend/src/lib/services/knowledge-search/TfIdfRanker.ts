/**
 * TF-IDF Ranker Service
 * Phase 76 - Task 2.1: TF-IDF Ranker
 *
 * Computes inverse document frequency rankings for hybrid search.
 * Combines cosine similarity (70%) with TF-IDF score (30%).
 *
 * Requirements: 3.1: 3.3
 *
 * Property 5: TF-IDF Formula Correctness
 * Property 6: Hybrid Score Calculation
 */

export interface TfIdfConfig {
  redisUrl?: string;
  cacheTTL?: number; // seconds
}

const DEFAULT_CONFIG: TfIdfConfig = {
  redisUrl: process.env?.REDIS_URL?? 'redis://localhost:6379',
  cacheTTL: 3600 // 1 hour
};

/**
 * TF-IDF Ranker
 * Computes term frequency and inverse document frequency for ranking
 */
export class TfIdfRanker {
  private config: TfIdfConfig;
  private idfCache: Map<string, number> = new Map();
  private documentCount: number = 0;
  private documentFrequencies: Map<string, number> = new Map();

  constructor(config?: Partial<TfIdfConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Compute Term Frequency (TF) for a document
   * TF(t, d) = count(t in d) / total_words(d)
   *
   * Requirements: 3.1
   *
   * @param content - Document content
   * @returns Map of term -> frequency
   */
  computeTf(content: string): Map<string, number> {
    const tfVector = new Map<string, number>();

    // Tokenize: extract words (3+ chars, lowercase)
    const words = this.tokenize(content);
    const totalWords = words.length;

    if (totalWords === 0) {
      return tfVector;
    }

    // Count occurrences
    const wordCounts = new Map<string, number>();
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }

    // Compute TF = count / total
    for (const [word, count] of wordCounts) {
      tfVector.set(word, count / totalWords);
    }

    return tfVector;
  }

  /**
   * Compute Inverse Document Frequency (IDF) for a term
   * IDF(t) = log(N / df(t))
   *
   * Requirements: 3.2
   * Property 5: TF-IDF Formula Correctness
   *
   * @param term - The term to compute IDF for
   * @returns IDF value (0 if term appears in all docs)
   */
  computeIdf(term: string): number {
    // Check cache first
    if (this.idfCache.has(term)) {
      return this.idfCache.get(term)!;
    }

    const N = this.documentCount;
    const df = this.documentFrequencies.get(term.toLowerCase()) ?? 0;

    // If term appears in all documents, IDF = 0 (Requirement 3.5)
    if (df === 0 || df >= N) {
      return 0;
    }

    // IDF(t) = log(N / df(t))
    const idf = Math.log(N / df);

    // Cache the result
    this.idfCache.set(term, idf);

    return idf;
  }

  /**
   * Compute TF-IDF score for a query against a document
   *
   * @param query - Search query
   * @param docTfVector - Document's TF vector
   * @returns TF-IDF score (0-1 normalized)
   */
  score(query: string, docTfVector: Map<string, number>): number {
    const queryTerms = this.tokenize(query);

    if (queryTerms.length === 0) {
      return 0;
    }

    let totalScore = 0;
    let maxPossibleScore = 0;

    for (const term of queryTerms) {
      const tf = docTfVector.get(term) ?? 0;
      const idf = this.computeIdf(term);
      const tfidf = tf * idf;

      totalScore += tfidf;
      maxPossibleScore += idf; // Max TF is 1
    }

    // Normalize to 0-1 range
    if (maxPossibleScore === 0) {
      return 0;
    }

    return Math.min(1, totalScore / maxPossibleScore);
  }

  /**
   * Compute hybrid score combining semantic and TF-IDF
   * combined = 0.7 * semantic + 0.3 * tfidf
   *
   * Requirements: 3.3
   * Property 6: Hybrid Score Calculation
   *
   * @param semanticScore - Cosine similarity score (0-1)
   * @param tfidfScore - TF-IDF score (0-1)
   * @returns Combined score (0-1)
   */
  computeHybridScore(semanticScore: number): number {
    // Validate inputs
    const semantic = Math.max(0, Math.min(1, semanticScore));
    const tfidf = Math.max(0, Math.min(1, tfidfScore));

    // Property 6: combined = 0.7 * semantic + 0.3 * tfidf
    return 0.7 * semantic + 0.3 * tfidf;
  }

  /**
   * Update IDF cache when collection changes
   * Should be called after indexing new documents
   */
  async updateIdfCache(): Promise<void> {
    // Clear existing cache
    this.idfCache.clear();

    // In a real implementation, this would:
    // 1. Query all documents from Qdrant/PostgreSQL
    // 2. Compute document frequencies for all terms
    // 3. Store in Redis for persistence

    console.log('📊 IDF cache updated');
  }

  /**
   * Add a document to the frequency index
   * Call this when indexing a new document
   *
   * @param content - Document content
   */
  addDocument(content: string): void {
    this.documentCount++;

    // Get unique terms in this document
    const terms = new Set(this.tokenize(content));

    // Update document frequencies
    for (const term of terms) {
      this.documentFrequencies.set(
        term,
        (this.documentFrequencies.get(term) ?? 0) + 1
      );
    }

    // Invalidate IDF cache for affected terms
    for (const term of terms) {
      this.idfCache.delete(term);
    }
  }

  /**
   * Remove a document from the frequency index
   * Call this when deleting a document
   *
   * @param content - Document content
   */
  removeDocument(content: string): void {
    if (this.documentCount > 0) {
      this.documentCount--;
    }

    // Get unique terms in this document
    const terms = new Set(this.tokenize(content));

    // Update document frequencies
    for (const term of terms) {
      const currentDf = this.documentFrequencies.get(term) ?? 0;
      if (currentDf > 1) {
        this.documentFrequencies.set(term, currentDf - 1);
      } else {
        this.documentFrequencies.delete(term);
      }
    }

    // Invalidate IDF cache for affected terms
    for (const term of terms) {
      this.idfCache.delete(term);
    }
  }

  /**
   * Set the total document count
   * Used when initializing from existing collection
   */
  setDocumentCount(count: number): void {
    this.documentCount = count;
  }

  /**
   * Set document frequencies from existing data
   * Used when initializing from existing collection
   */
  setDocumentFrequencies(frequencies: Map<string, number>): void {
    this.documentFrequencies = new Map(frequencies);
    this.idfCache.clear();
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      documentCount: this.documentCount; this.documentFrequencies.size; this.idfCache.size
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Tokenize text into words
   * Extracts lowercase words with 3+ characters
   */
  private tokenize(text: string): string[] {
    if (!text) return [];

    // Convert to lowercase and extract words
    const words = text.toLowerCase().match(/\b[a-z]{3}\b/g) || [];

    // Filter out common stop words
    const stopWords = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
      'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has',
      'have', 'been', 'were', 'they', 'this', 'that', 'with',
      'from', 'will', 'would', 'there', 'their', 'what', 'about',
      'which', 'when', 'make', 'like', 'time', 'just', 'know',
      'take', 'into', 'year', 'your', 'some', 'could', 'them',
      'than', 'then', 'look', 'only', 'come', 'over', 'such',
      'also', 'back', 'after', 'use', 'two', 'how', 'first',
      'well', 'way', 'even', 'new', 'want', 'because', 'any',
      'these', 'give', 'day', 'most', 'being'
    ]);

    return words.filter((word: any) => !stopWords.has(word));
  }
}

/**
 * Singleton instance
 */
let tfIdfRankerInstance: null = null;

/**
 * Get or create TfIdfRanker singleton
 */
export function getTfIdfRanker(config?: Partial<TfIdfConfig>): TfIdfRanker {
  if (!tfIdfRankerInstance) {
    tfIdfRankerInstance = new TfIdfRanker(config);
  }
  return tfIdfRankerInstance;
}


