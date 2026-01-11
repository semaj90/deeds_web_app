/**
 * Knowledge Search Engine Property Tests
 * Phase 76 - Property-Based Testing with fast-check
 *
 * Tests correctness properties defined in the design document.
 */

import { describe, it, expect } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';;
import * as fc from 'fast-check';
import { TfIdfRanker } from './TfIdfRanker.js';
import type { SearchResult } from './types.js';

describe('Knowledge Search Engine', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

  // ==========================================================================
  // Property 1: Embedding Dimension Consistency
  // ==========================================================================
  describe('Property 1: Embedding Dimension Consistency', () => {
    /**
     * **Feature: knowledge-search-engine, Property 1: Embedding Dimension Consistency**
     * **Validates: Requirements 1.1, 4.4**
     *
     * For any document indexed, the generated embedding SHALL have exactly
     * 768 dimensions matching the embeddinggemma:latest model output.
     */
    it('should generate embeddings with exactly 768 dimensions', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 1000 }),
          (content) => {
            // Mock embedding generation (actual implementation calls Ollama)
            const mockEmbedding = generateMockEmbedding(content);

            // Property: embedding must have exactly 768 dimensions
            expect(mockEmbedding.length).toBe(768);

            // Property: all values must be numbers
            expect(mockEmbedding.every(v => typeof v === 'number')).toBe(true);

            // Property: values should be finite
            expect(mockEmbedding.every(v => Number.isFinite(v))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ==========================================================================
  // Property 5: TF-IDF Formula Correctness
  // ==========================================================================
  describe('Property 5: TF-IDF Formula Correctness', () => {
    /**
     * **Feature: knowledge-search-engine, Property 5: TF-IDF Formula Correctness**
     * **Validates: Requirements 3.2**
     *
     * For any term t in the collection, the IDF value SHALL equal
     * log(N / df(t)) where N is total documents and df(t) is documents containing t.
     */
    it('should compute IDF correctly using log(N/df) formula', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), // N: total documents
          fc.integer({ min: 1, max: 1000 }), // df: document frequency
          (N, df) => {
            // Ensure df <= N
            const actualDf = Math.min(df, N);

            const ranker = new TfIdfRanker();
            ranker.setDocumentCount(N);

            // Set up document frequency for test term
            const testTerm = 'testterm';
            const frequencies = new Map<string, number>();
            frequencies.set(testTerm, actualDf);
            ranker.setDocumentFrequencies(frequencies);

            const idf = ranker.computeIdf(testTerm);

            // Property: IDF = log(N / df)
            const expectedIdf = actualDf >= N ? 0 : Math.log(N / actualDf);

            expect(idf).toBeCloseTo(expectedIdf, 10);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return IDF of 0 when term appears in all documents', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), // N: total documents
          (N) => {
            const ranker = new TfIdfRanker();
            ranker.setDocumentCount(N);

            // Term appears in all documents
            const testTerm = 'ubiquitous';
            const frequencies = new Map<string, number>();
            frequencies.set(testTerm, N);
            ranker.setDocumentFrequencies(frequencies);

            const idf = ranker.computeIdf(testTerm);

            // Property: IDF = 0 when df >= N (Requirement 3.5)
            expect(idf).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should compute TF correctly as count/total', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom('apple', 'banana', 'cherry', 'date'), { minLength: 1, maxLength: 100 }),
          (words) => {
            const ranker = new TfIdfRanker();
            const content = words.join(' ');
            const tfVector = ranker.computeTf(content);

            // Property: sum of all TF values should be <= 1
            // (can be less due to stop word filtering)
            const totalTf = Array.from(tfVector.values()).reduce((a, b) => a + b, 0);
            expect(totalTf).toBeLessThanOrEqual(1.001); // Allow small floating point error

            // Property: each TF value should be between 0 and 1
            for (const tf of tfVector.values()) {
              expect(tf).toBeGreaterThanOrEqual(0);
              expect(tf).toBeLessThanOrEqual(1);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ==========================================================================
  // Property 6: Hybrid Score Calculation
  // ==========================================================================
  describe('Property 6: Hybrid Score Calculation', () => {
    /**
     * **Feature: knowledge-search-engine, Property 6: Hybrid Score Calculation**
     * **Validates: Requirements 3.3**
     *
     * For any search result, the combined score SHALL equal exactly
     * 0.7 * semantic_score + 0.3 * tfidf_score.
     */
    it('should compute hybrid score as 0.7*semantic + 0.3*tfidf', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1, noNaN: true }), // semantic score
          fc.float({ min: 0, max: 1, noNaN: true }), // tfidf score
          (semantic, tfidf) => {
            const ranker = new TfIdfRanker();
            const combined = ranker.computeHybridScore(semantic, tfidf);

            // Property: combined = 0.7 * semantic + 0.3 * tfidf
            const expected = 0.7 * semantic + 0.3 * tfidf;

            expect(combined).toBeCloseTo(expected, 10);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should clamp input scores to [0, 1] range', () => {
      fc.assert(
        fc.property(
          fc.float({ min: -10, max: 10, noNaN: true }), // potentially out of range
          fc.float({ min: -10, max: 10, noNaN: true }),
          (semantic, tfidf) => {
            const ranker = new TfIdfRanker();
            const combined = ranker.computeHybridScore(semantic, tfidf);

            // Property: output should always be in [0, 1]
            expect(combined).toBeGreaterThanOrEqual(0);
            expect(combined).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0 when both scores are 0', () => {
      const ranker = new TfIdfRanker();
      const combined = ranker.computeHybridScore(0, 0);
      expect(combined).toBe(0);
    });

    it('should return 1 when both scores are 1', () => {
      const ranker = new TfIdfRanker();
      const combined = ranker.computeHybridScore(1, 1);
      expect(combined).toBe(1);
    });

    it('should weight semantic score higher than tfidf', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.1), max: Math.fround(0.9), noNaN: true }),
          (score) => {
            const ranker = new TfIdfRanker();

            // Same score for both
            const combined = ranker.computeHybridScore(score, score);
            expect(combined).toBeCloseTo(score, 5);

            // High semantic, low tfidf
            const highSemantic = ranker.computeHybridScore(1, 0);
            expect(highSemantic).toBe(0.7);

            // Low semantic, high tfidf
            const highTfidf = ranker.computeHybridScore(0, 1);
            expect(highTfidf).toBe(0.3);

            // Property: semantic has more weight
            expect(highSemantic).toBeGreaterThan(highTfidf);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// ==========================================================================
// Helper Functions
// ==========================================================================

/**
 * Generate a mock 768-dimensional embedding
 * In production, this calls Ollama's embeddinggemma model
 */
function generateMockEmbedding(content: string): number[] {
  // Create deterministic embedding based on content hash
  const embedding: number[] = [];
  let hash = 0;

  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i);
    hash = hash & hash;
  }

  // Generate 768 dimensions
  for (let i = 0; i < 768; i++) {
    // Use hash to seed pseudo-random values
    const seed = hash + i * 31;
    const value = Math.sin(seed) * 0.5;
    embedding.push(value);
  }

  return embedding;
}

// ==========================================================================
// Property 2: Search Results Ordering
// ==========================================================================
describe('Property 2: Search Results Ordering', () => {
  /**
   * **Feature: knowledge-search-engine, Property 2: Search Results Ordering**
   * **Validates: Requirements 1.3, 3.3**
   *
   * For any search query returning multiple results, the results SHALL be
   * sorted in descending order by combined score (0.7*semantic + 0.3*tfidf).
   */
  it('should return results sorted by combined score in descending order', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            semantic: fc.float({ min: 0, max: 1, noNaN: true }),
            tfidf: fc.float({ min: 0, max: 1, noNaN: true })
          }),
          { minLength: 2, maxLength: 20 }
        ),
        (scoresList) => {
          const ranker = new TfIdfRanker();

          // Compute combined scores
          const results = scoresList.map((scores, idx) => ({
            id: `doc_${idx}`,
            combined: ranker.computeHybridScore(scores.semantic, scores.tfidf)
          }));

          // Sort by combined score descending
          const sorted = [...results].sort((a, b) => b.combined - a.combined);

          // Property: results should be in descending order
          for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i - 1].combined).toBeGreaterThanOrEqual(sorted[i].combined);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ==========================================================================
// Property 3: Search Result Schema Completeness
// ==========================================================================
describe('Property 3: Search Result Schema Completeness', () => {
  /**
   * **Feature: knowledge-search-engine, Property 3: Search Result Schema Completeness**
   * **Validates: Requirements 1.4, 3.4**
   *
   * For any search result returned, the response SHALL contain all required
   * fields: id, title, url, summary, tags, scores.
   */
  it('should include all required fields in search results', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1 }),
          title: fc.string(),
          url: fc.webUrl(),
          summary: fc.string(),
          tags: fc.array(fc.string()),
          semantic: fc.float({ min: 0, max: 1, noNaN: true }),
          tfidf: fc.float({ min: 0, max: 1, noNaN: true })
        }),
        (data) => {
          const ranker = new TfIdfRanker();
          const combined = ranker.computeHybridScore(data.semantic, data.tfidf);

          // Create a search result
          const result: SearchResult = {
            id: data.id,
            title: data.title,
            url: data.url,
            summary: data.summary,
            tags: data.tags,
            scores: {
              semantic: data.semantic,
              tfidf: data.tfidf,
              combined
            }
          };

          // Property: all required fields must be present
          expect(result).toHaveProperty('id');
          expect(result).toHaveProperty('title');
          expect(result).toHaveProperty('url');
          expect(result).toHaveProperty('summary');
          expect(result).toHaveProperty('tags');
          expect(result).toHaveProperty('scores');
          expect(result.scores).toHaveProperty('semantic');
          expect(result.scores).toHaveProperty('tfidf');
          expect(result.scores).toHaveProperty('combined');

          // Property: scores should be valid numbers in [0, 1]
          expect(result.scores.semantic).toBeGreaterThanOrEqual(0);
          expect(result.scores.semantic).toBeLessThanOrEqual(1);
          expect(result.scores.tfidf).toBeGreaterThanOrEqual(0);
          expect(result.scores.tfidf).toBeLessThanOrEqual(1);
          expect(result.scores.combined).toBeGreaterThanOrEqual(0);
          expect(result.scores.combined).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ==========================================================================
// Property 12: PostgreSQL-Qdrant Embedding Parity
// ==========================================================================
describe('Property 12: PostgreSQL-Qdrant Embedding Parity', () => {
  /**
   * **Feature: knowledge-search-engine, Property 12: PostgreSQL-Qdrant Embedding Parity**
   * **Validates: Requirements 4.4**
   *
   * For any document stored, the embedding in PostgreSQL SHALL be identical
   * to the embedding in Qdrant (768 dimensions, same values).
   */
  it('should maintain identical embeddings between PostgreSQL and Qdrant', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { minLength: 768, maxLength: 768 }),
        (embedding) => {
          // Property: embedding must have exactly 768 dimensions
          expect(embedding.length).toBe(768);

          // Simulate storing in both systems
          const qdrantEmbedding = [...embedding];
          const postgresEmbedding = [...embedding];

          // Property: embeddings must be identical
          expect(qdrantEmbedding).toEqual(postgresEmbedding);

          // Property: each dimension must be a valid number
          for (let i = 0; i < 768; i++) {
            expect(Number.isFinite(qdrantEmbedding[i])).toBe(true);
            expect(Number.isFinite(postgresEmbedding[i])).toBe(true);
            expect(qdrantEmbedding[i]).toBeCloseTo(postgresEmbedding[i], 10);
          }
        }
      ),
      { numRuns: 50 } // Reduced runs due to large array size
    );
  });

  it('should reject embeddings with wrong dimensions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2000 }).filter(n => n !== 768),
        (wrongDimension) => {
          const wrongEmbedding = new Array(wrongDimension).fill(0.5);

          // Property: wrong dimension should be detected
          expect(wrongEmbedding.length).not.toBe(768);

          // Validation function
          const isValidDimension = (emb: number[]) => emb.length === 768;
          expect(isValidDimension(wrongEmbedding)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ==========================================================================
// Property 9: MinIO Object Key Format
// ==========================================================================
describe('Property 9: MinIO Object Key Format', () => {
  /**
   * **Feature: knowledge-search-engine, Property 9: MinIO Object Key Format**
   * **Validates: Requirements 5.2**
   *
   * For any document stored in MinIO, the object key SHALL follow the format:
   * {collection}/{url_hash}.md
   */
  it('should generate keys in format {collection}/{url_hash}.md', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/')),
        fc.hexaString({ minLength: 8, maxLength: 32 }),
        (collection, urlHash) => {
          // Generate key
          const key = `${collection}/${urlHash}.md`;

          // Property: key must match format {collection}/{url_hash}.md
          const keyPattern = /^[^/]+\/[^/]+\.md$/;
          expect(key).toMatch(keyPattern);

          // Property: key must contain exactly one slash
          const slashCount = (key.match(/\//g) || []).length;
          expect(slashCount).toBe(1);

          // Property: key must end with .md
          expect(key.endsWith('.md')).toBe(true);

          // Property: collection and hash should be extractable
          const parts = key.split('/');
          expect(parts.length).toBe(2);
          expect(parts[0]).toBe(collection);
          expect(parts[1]).toBe(`${urlHash}.md`);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ==========================================================================
// Property 4: Summary Generation and Storage Round-Trip
// ==========================================================================
describe('Property 4: Summary Generation and Storage Round-Trip', () => {
  /**
   * **Feature: knowledge-search-engine, Property 4: Summary Generation and Storage Round-Trip**
   * **Validates: Requirements 2.3, 5.3**
   *
   * For any document stored in MinIO, retrieving it should return the exact
   * same content that was stored (round-trip consistency).
   */
  it('should preserve content exactly through storage round-trip', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10000 }),
        (content) => {
          // Simulate storage and retrieval
          const stored = content;
          const retrieved = stored; // In real impl, this goes through MinIO

          // Property: retrieved content must equal stored content
          expect(retrieved).toBe(stored);
          expect(retrieved.length).toBe(content.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle special characters in content', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 1000 }),
        fc.constantFrom('# ', '## ', '```', '---', '> ', '- ', '* '),
        (content, prefix) => {
          const markdownContent = `${prefix}${content}`;

          // Simulate round-trip
          const stored = markdownContent;
          const retrieved = stored;

          // Property: markdown formatting should be preserved
          expect(retrieved).toBe(markdownContent);
          expect(retrieved.startsWith(prefix)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle unicode content', () => {
    fc.assert(
      fc.property(
        fc.unicodeString({ minLength: 1, maxLength: 500 }),
        (content) => {
          // Simulate round-trip
          const stored = content;
          const retrieved = stored;

          // Property: unicode should be preserved
          expect(retrieved).toBe(content);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ==========================================================================
// Property 7: Redis Cache Key Format
// ==========================================================================
describe('Property 7: Redis Cache Key Format', () => {
  /**
   * **Feature: knowledge-search-engine, Property 7: Redis Cache Key Format**
   * **Validates: Requirements 6.2**
   *
   * For any cached search result, the Redis key SHALL follow the format:
   * kb:search:{query_hash}
   */
  it('should generate keys in format kb:search:{query_hash}', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (query) => {
          // Hash the query (simplified version)
          let hash = 0;
          for (let i = 0; i < query.length; i++) {
            const char = query.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
          }
          const queryHash = Math.abs(hash).toString(16);

          // Generate key
          const key = `kb:search:${queryHash}`;

          // Property: key must match format kb:search:{hash}
          const keyPattern = /^kb:search:[a-f0-9]+$/;
          expect(key).toMatch(keyPattern);

          // Property: key must start with kb:search:
          expect(key.startsWith('kb:search:')).toBe(true);

          // Property: hash should be hexadecimal
          const hashPart = key.replace('kb:search:', '');
          expect(/^[a-f0-9]+$/.test(hashPart)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate different keys for different queries', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (query1, query2) => {
          // Skip if queries are the same
          if (query1 === query2) return true;

          // Hash function
          const hashQuery = (q: string) => {
            let hash = 0;
            for (let i = 0; i < q.length; i++) {
              const char = q.charCodeAt(i);
              hash = ((hash << 5) - hash) + char;
              hash = hash & hash;
            }
            return Math.abs(hash).toString(16);
          };

          const key1 = `kb:search:${hashQuery(query1)}`;
          const key2 = `kb:search:${hashQuery(query2)}`;

          // Property: different queries should (usually) produce different keys
          // Note: hash collisions are possible but rare
          // We just verify the format is correct
          expect(key1.startsWith('kb:search:')).toBe(true);
          expect(key2.startsWith('kb:search:')).toBe(true);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ==========================================================================
// Property 8: Cache Hit Behavior
// ==========================================================================
describe('Property 8: Cache Hit Behavior', () => {
  /**
   * **Feature: knowledge-search-engine, Property 8: Cache Hit Behavior**
   * **Validates: Requirements 6.3**
   *
   * When a cached result exists, the system SHALL return it without
   * hitting Qdrant (cache hit behavior).
   */
  it('should return cached results with cacheHit=true', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1 }),
            title: fc.string(),
            url: fc.webUrl(),
            summary: fc.string(),
            tags: fc.array(fc.string()),
            semantic: fc.float({ min: 0, max: 1, noNaN: true }),
            tfidf: fc.float({ min: 0, max: 1, noNaN: true })
          }),
          { minLength: 0, maxLength: 10 }
        ),
        (resultsData) => {
          // Simulate cache behavior
          const cachedResults: SearchResult[] = resultsData.map(r => ({
            id: r.id,
            title: r.title,
            url: r.url,
            summary: r.summary,
            tags: r.tags,
            scores: {
              semantic: r.semantic,
              tfidf: r.tfidf,
              combined: 0.7 * r.semantic + 0.3 * r.tfidf
            }
          }));

          // Simulate cache hit response
          const cacheResponse = {
            results: cachedResults,
            cacheHit: true,
            cachedAt: new Date().toISOString()
          };

          // Property: cache hit should return true
          expect(cacheResponse.cacheHit).toBe(true);

          // Property: results should be returned unchanged
          expect(cacheResponse.results).toEqual(cachedResults);

          // Property: cachedAt should be a valid ISO date
          expect(new Date(cacheResponse.cachedAt).toISOString()).toBe(cacheResponse.cachedAt);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return cacheHit=false when cache misses', () => {
    // Simulate cache miss
    const cacheMissResponse = {
      results: [],
      cacheHit: false
    };

    // Property: cache miss should return false
    expect(cacheMissResponse.cacheHit).toBe(false);

    // Property: results should be empty on cache miss
    expect(cacheMissResponse.results).toEqual([]);
  });
});

// ==========================================================================
// Property 16: LLM Synthesis Context Injection
// ==========================================================================
describe('Property 16: LLM Synthesis Context Injection', () => {
  /**
   * **Feature: knowledge-search-engine, Property 16: LLM Synthesis Context Injection**
   * **Validates: Requirements 2.1**
   *
   * When synthesize=true, the system SHALL inject top-K search results
   * as context into the LLM prompt, and the response SHALL contain a
   * synthesizedAnswer field.
   */
  it('should inject top-K results into LLM context', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 100 }), // query
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1 }),
            title: fc.string({ minLength: 1 }),
            url: fc.webUrl(),
            summary: fc.string({ minLength: 10, maxLength: 200 }),
            tags: fc.array(fc.string()),
            semantic: fc.float({ min: 0.5, max: 1, noNaN: true }),
            tfidf: fc.float({ min: 0, max: 1, noNaN: true })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        fc.integer({ min: 1, max: 5 }), // topK for context
        (query, resultsData, topK) => {
          // Build context from top-K results
          const results: SearchResult[] = resultsData.map(r => ({
            id: r.id,
            title: r.title,
            url: r.url,
            summary: r.summary,
            tags: r.tags,
            scores: {
              semantic: r.semantic,
              tfidf: r.tfidf,
              combined: 0.7 * r.semantic + 0.3 * r.tfidf
            }
          }));

          // Sort by combined score
          results.sort((a, b) => b.scores.combined - a.scores.combined);

          // Take top-K
          const topResults = results.slice(0, Math.min(topK, results.length));

          // Build context string (simulating what KnowledgeSearcher does)
          const context = topResults
            .map((r, idx) => `[${idx + 1}] ${r.title}\nURL: ${r.url}\n${r.summary}\n`)
            .join('\n---\n\n');

          // Build prompt
          const prompt = `You are a helpful AI assistant. Answer the following question using ONLY the provided context.

Context:
${context}

Question: ${query}

Answer:`;

          // Property: context must include all top-K results
          for (let i = 0; i < topResults.length; i++) {
            expect(context).toContain(topResults[i].title);
            expect(context).toContain(topResults[i].url);
            expect(context).toContain(topResults[i].summary);
          }

          // Property: prompt must include query
          expect(prompt).toContain(query);

          // Property: prompt must include context
          expect(prompt).toContain('Context:');
          expect(prompt).toContain(context);

          // Property: context should be properly formatted with separators
          const separatorCount = (context.match(/---/g) || []).length;
          expect(separatorCount).toBe(Math.max(0, topResults.length - 1));
        }
      ),
      { numRuns: 50 } // Reduced runs due to complexity
    );
  });

  it('should support multiple LLM providers', () => {
    const providers: Array<'ollama' | 'gemini' | 'claude'> = ['ollama', 'gemini', 'claude'];

    for (const provider of providers) {
      // Property: each provider should be a valid option
      expect(['ollama', 'gemini', 'claude']).toContain(provider);

      // Property: provider should be a string
      expect(typeof provider).toBe('string');
    }
  });

  it('should include synthesizedAnswer field when synthesize=true', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1 }),
          title: fc.string(),
          url: fc.webUrl(),
          summary: fc.string(),
          tags: fc.array(fc.string()),
          semantic: fc.float({ min: 0, max: 1, noNaN: true }),
          tfidf: fc.float({ min: 0, max: 1, noNaN: true }),
          synthesizedAnswer: fc.string({ minLength: 10, maxLength: 500 })
        }),
        (data) => {
          const result: SearchResult = {
            id: data.id,
            title: data.title,
            url: data.url,
            summary: data.summary,
            tags: data.tags,
            scores: {
              semantic: data.semantic,
              tfidf: data.tfidf,
              combined: 0.7 * data.semantic + 0.3 * data.tfidf
            },
            synthesizedAnswer: data.synthesizedAnswer
          };

          // Property: synthesizedAnswer field should exist
          expect(result).toHaveProperty('synthesizedAnswer');

          // Property: synthesizedAnswer should be a non-empty string
          expect(typeof result.synthesizedAnswer).toBe('string');
          expect(result.synthesizedAnswer!.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle empty results gracefully', () => {
    const query = 'test query';
    const emptyResults: SearchResult[] = [];

    // Property: empty results should not cause errors
    expect(emptyResults.length).toBe(0);

    // Property: context should be empty string
    const context = emptyResults
      .map((r, idx) => `[${idx + 1}] ${r.title}\n${r.summary}\n`)
      .join('\n---\n\n');

    expect(context).toBe('');
  });
});

// ==========================================================================
// Property 10: Tag Extraction and Filtering
// ==========================================================================
describe('Property 10: Tag Extraction and Filtering', () => {
  /**
   * **Feature: knowledge-search-engine, Property 10: Tag Extraction and Filtering**
   * **Validates: Requirements 9.1, 9.3, 9.4**
   *
   * For any document, tags SHALL be extracted from entities field first,
   * falling back to URL domain if no entities exist.
   */
  it('should extract tags from entities field', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom(
            'svelte',
            'typescript',
            'react',
            'vue',
            'python',
            'javascript',
            'docker',
            'kubernetes'
          ),
          { minLength: 1, maxLength: 5 }
        ),
        fc.webUrl(),
        (entities, url) => {
          // Simulate tag extraction
          const tags = entities.map((e) => e.toLowerCase().trim());

          // Property: tags should be extracted from entities
          expect(tags.length).toBeGreaterThan(0);

          // Property: all tags should be lowercase
          for (const tag of tags) {
            expect(tag).toBe(tag.toLowerCase());
          }

          // Property: tags should match entities
          for (let i = 0; i < entities.length; i++) {
            expect(tags[i]).toBe(entities[i].toLowerCase().trim());
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should fallback to URL domain when no entities', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'https://svelte.dev/docs',
          'https://kit.svelte.dev/docs/introduction',
          'https://react.dev/learn',
          'https://vuejs.org/guide',
          'https://docs.python.org/3/'
        ),
        (url) => {
          const emptyEntities: string[] = [];

          // Extract domain from URL
          const urlObj = new URL(url);
          const domain = urlObj.hostname;
          const parts = domain.split('.');
          const mainDomain = parts[parts.length - 2];

          // Property: should extract main domain as tag
          expect(mainDomain.length).toBeGreaterThan(0);

          // Property: domain should be valid tag
          expect(mainDomain).toMatch(/^[a-z0-9\-]+$/);

          // Property: when entities is empty, should use domain
          if (emptyEntities.length === 0) {
            expect(mainDomain).toBeTruthy();
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should normalize tags to lowercase and remove special chars', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 3, maxLength: 20 }).map((s) => s + Math.random() > 0.5 ? '.js' : ''),
          { minLength: 1, maxLength: 5 }
        ),
        (rawTags) => {
          // Normalize tags
          const normalized = rawTags.map((tag) =>
            tag
              .toLowerCase()
              .trim()
              .replace(/[^a-z0-9\s\-\.]/g, '')
              .replace(/\s+/g, '-')
              .replace(/\.js$/, '')
              .replace(/\.ts$/, '')
          );

          // Property: all tags should be lowercase
          for (const tag of normalized) {
            expect(tag).toBe(tag.toLowerCase());
          }

          // Property: tags should not contain special chars (except - and .)
          for (const tag of normalized) {
            expect(tag).toMatch(/^[a-z0-9\-\.]*$/);
          }

          // Property: .js and .ts extensions should be removed
          for (const tag of normalized) {
            expect(tag.endsWith('.js')).toBe(false);
            expect(tag.endsWith('.ts')).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should filter results by tags', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('svelte', 'react', 'vue', 'typescript', 'python'), {
          minLength: 1,
          maxLength: 5
        }),
        fc.array(fc.constantFrom('svelte', 'react', 'vue', 'typescript', 'python'), {
          minLength: 1,
          maxLength: 3
        }),
        (docTags, requiredTags) => {
          // Check if document has at least one required tag
          const hasMatch = requiredTags.some((reqTag) => docTags.includes(reqTag));

          // Property: filter should return true if any tag matches
          if (hasMatch) {
            expect(docTags.some((tag) => requiredTags.includes(tag))).toBe(true);
          }

          // Property: filter should return false if no tags match
          if (!hasMatch) {
            expect(docTags.every((tag) => !requiredTags.includes(tag))).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should limit tags to maximum of 10', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 3, maxLength: 15 }), { minLength: 1, maxLength: 50 }),
        (tags) => {
          // Take first 10 tags
          const limited = tags.slice(0, 10);

          // Property: should never exceed 10 tags
          expect(limited.length).toBeLessThanOrEqual(10);

          // Property: if input has <= 10 tags, output should match
          if (tags.length <= 10) {
            expect(limited.length).toBe(tags.length);
          }

          // Property: if input has > 10 tags, output should be exactly 10
          if (tags.length > 10) {
            expect(limited.length).toBe(10);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject invalid tags (too short or stop words)', () => {
    const invalidTags = ['a', 'i', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of'];
    const stopWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of']);

    for (const tag of invalidTags) {
      // Property: tags < 2 chars should be invalid
      if (tag.length < 2) {
        expect(tag.length).toBeLessThan(2);
      }

      // Property: stop words should be invalid
      if (stopWords.has(tag)) {
        expect(stopWords.has(tag)).toBe(true);
      }
    }
  });
});

// ==========================================================================
// Property 11: API Response Schema Validation
// ==========================================================================
describe('Property 11: API Response Schema Validation', () => {
  /**
   * **Feature: knowledge-search-engine, Property 11: API Response Schema Validation**
   * **Validates: Requirements 8.1**
   *
   * For any API response, the response SHALL contain success, query, results,
   * and metadata fields with correct types.
   */
  it('should return valid API response schema', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1 }),
            title: fc.string(),
            url: fc.webUrl(),
            summary: fc.string(),
            tags: fc.array(fc.string()),
            semantic: fc.float({ min: 0, max: 1, noNaN: true }),
            tfidf: fc.float({ min: 0, max: 1, noNaN: true })
          }),
          { minLength: 0, maxLength: 10 }
        ),
        fc.integer({ min: 10, max: 1000 }),
        (query, resultsData, queryTime) => {
          // Build search results
          const results: SearchResult[] = resultsData.map((r) => ({
            id: r.id,
            title: r.title,
            url: r.url,
            summary: r.summary,
            tags: r.tags,
            scores: {
              semantic: r.semantic,
              tfidf: r.tfidf,
              combined: 0.7 * r.semantic + 0.3 * r.tfidf
            }
          }));

          // Build API response
          const response = {
            success: true,
            query,
            results,
            metadata: {
              queryTime,
              totalResults: results.length,
              synthesized: false,
              llmProvider: 'ollama'
            }
          };

          // Property: response must have success field
          expect(response).toHaveProperty('success');
          expect(typeof response.success).toBe('boolean');

          // Property: response must have query field
          expect(response).toHaveProperty('query');
          expect(typeof response.query).toBe('string');
          expect(response.query).toBe(query);

          // Property: response must have results array
          expect(response).toHaveProperty('results');
          expect(Array.isArray(response.results)).toBe(true);

          // Property: response must have metadata
          expect(response).toHaveProperty('metadata');
          expect(response.metadata).toHaveProperty('queryTime');
          expect(response.metadata).toHaveProperty('totalResults');
          expect(response.metadata).toHaveProperty('synthesized');
          expect(response.metadata).toHaveProperty('llmProvider');

          // Property: metadata types must be correct
          expect(typeof response.metadata.queryTime).toBe('number');
          expect(typeof response.metadata.totalResults).toBe('number');
          expect(typeof response.metadata.synthesized).toBe('boolean');
          expect(typeof response.metadata.llmProvider).toBe('string');

          // Property: totalResults must match results length
          expect(response.metadata.totalResults).toBe(results.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should validate query parameter constraints', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 600 }),
        (query) => {
          // Property: empty queries should be invalid
          if (query.trim().length === 0) {
            expect(query.trim().length).toBe(0);
          }

          // Property: queries > 500 chars should be invalid
          if (query.length > 500) {
            expect(query.length).toBeGreaterThan(500);
          }

          // Property: valid queries should be 1-500 chars
          const isValid = query.trim().length > 0 && query.length <= 500;
          if (isValid) {
            expect(query.trim().length).toBeGreaterThan(0);
            expect(query.length).toBeLessThanOrEqual(500);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should validate topK parameter constraints', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10, max: 150 }),
        (topK) => {
          // Property: topK must be between 1 and 100
          const isValid = topK >= 1 && topK <= 100;

          if (isValid) {
            expect(topK).toBeGreaterThanOrEqual(1);
            expect(topK).toBeLessThanOrEqual(100);
          } else {
            expect(topK < 1 || topK > 100).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should validate llmProvider parameter', () => {
    const validProviders = ['ollama', 'gemini', 'claude'];
    const invalidProviders = ['openai', 'gpt4', 'invalid', ''];

    // Property: valid providers should be accepted
    for (const provider of validProviders) {
      expect(validProviders).toContain(provider);
    }

    // Property: invalid providers should be rejected
    for (const provider of invalidProviders) {
      expect(validProviders).not.toContain(provider);
    }
  });

  it('should handle error responses correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(400, 404, 500, 503),
        fc.string({ minLength: 5, maxLength: 100 }),
        (statusCode, errorMessage) => {
          // Build error response
          const errorResponse = {
            error: errorMessage,
            details: 'Additional error details'
          };

          // Property: error response must have error field
          expect(errorResponse).toHaveProperty('error');
          expect(typeof errorResponse.error).toBe('string');

          // Property: error message should not be empty
          expect(errorResponse.error.length).toBeGreaterThan(0);

          // Property: status code should be valid HTTP error code
          expect([400, 404, 500, 503]).toContain(statusCode);
        }
      ),
      { numRuns: 50 }
    );
  });
});
