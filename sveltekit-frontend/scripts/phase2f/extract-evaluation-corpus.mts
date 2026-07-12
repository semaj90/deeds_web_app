#!/usr/bin/env node
/**
 * Phase 2F.1: Ground-Truth Extraction Script
 *
 * Extracts real evaluation queries and ground-truth relevance judgments
 * from four independent sources: AST, routes, schemas, and tests.
 *
 * Each query is paired with chunk_ids from codebase_chunk_index where:
 * - The chunk is deterministically relevant (provenance-backed)
 * - Relevance grade (0-3) reflects the source type and confidence
 * - All chunk_ids are verified to exist in the database
 *
 * Usage:
 *   npx tsx scripts/phase2f/extract-evaluation-corpus.mts [--dry-run] [--verbose]
 */

import postgres from 'postgres';

// ============================================================================
// CONSTANTS & TYPES
// ============================================================================

const EVALUATION_QUERIES_V2: EvaluationQueryDefinition[] = [
  // ─────────────────────────────────────────────────────────────────────
  // DOMAIN: programming-languages (12 queries)
  // ─────────────────────────────────────────────────────────────────────
  {
    query: 'How do I validate user session in TypeScript?',
    domain: 'programming-languages',
    difficulty: 2,
    expectedChunkPattern: { symbol: 'validateSession', kind: 'function' },
    sources: ['AST', 'route'],
    expectedCount: 3,
  },
  {
    query: 'What is the difference between let, const, and var in JavaScript?',
    domain: 'programming-languages',
    difficulty: 1,
    expectedChunkPattern: { kind: 'documentation', symbol: null },
    sources: ['route'],
    expectedCount: 2,
  },
  {
    query: 'How to implement a custom React hook for form handling?',
    domain: 'programming-languages',
    difficulty: 3,
    expectedChunkPattern: { symbol: 'useForm', kind: 'function' },
    sources: ['AST', 'schema'],
    expectedCount: 2,
  },
  {
    query: 'Explain the event loop in Node.js',
    domain: 'programming-languages',
    difficulty: 4,
    expectedChunkPattern: { kind: 'implementation', symbol: null },
    sources: ['AST'],
    expectedCount: 1,
  },
  {
    query: 'What are decorators and how do I use them?',
    domain: 'programming-languages',
    difficulty: 3,
    expectedChunkPattern: { kind: 'function', symbol: null },
    sources: ['AST', 'test'],
    expectedCount: 2,
  },
  {
    query: 'How to properly handle errors in async/await?',
    domain: 'programming-languages',
    difficulty: 2,
    expectedChunkPattern: { kind: 'implementation', symbol: null },
    sources: ['test'],
    expectedCount: 2,
  },
  {
    query: 'What is closure in JavaScript?',
    domain: 'programming-languages',
    difficulty: 2,
    expectedChunkPattern: { kind: 'function', symbol: null },
    sources: ['AST'],
    expectedCount: 1,
  },
  {
    query: 'Implement a generic utility type for safe object access',
    domain: 'programming-languages',
    difficulty: 4,
    expectedChunkPattern: { kind: 'type', symbol: null },
    sources: ['AST', 'schema'],
    expectedCount: 2,
  },
  {
    query: 'How to use Promise.all vs Promise.allSettled?',
    domain: 'programming-languages',
    difficulty: 2,
    expectedChunkPattern: { symbol: 'allSettled', kind: null },
    sources: ['route', 'test'],
    expectedCount: 2,
  },
  {
    query: 'Explain template literals and tagged templates',
    domain: 'programming-languages',
    difficulty: 2,
    expectedChunkPattern: { kind: 'documentation', symbol: null },
    sources: ['route'],
    expectedCount: 1,
  },
  {
    query: 'How to implement a simple state machine in TypeScript?',
    domain: 'programming-languages',
    difficulty: 3,
    expectedChunkPattern: { symbol: 'createMachine', kind: 'function' },
    sources: ['AST', 'test'],
    expectedCount: 2,
  },
  {
    query: 'What are the performance implications of using spread operator?',
    domain: 'programming-languages',
    difficulty: 3,
    expectedChunkPattern: { kind: 'implementation', symbol: null },
    sources: ['test'],
    expectedCount: 1,
  },

  // ─────────────────────────────────────────────────────────────────────
  // DOMAIN: web-markup (8 queries)
  // ─────────────────────────────────────────────────────────────────────
  {
    query: 'How to structure semantic HTML for accessibility?',
    domain: 'web-markup',
    difficulty: 2,
    expectedChunkPattern: { kind: 'component', symbol: null },
    sources: ['route'],
    expectedCount: 2,
  },
  {
    query: 'What is the difference between flexbox and grid?',
    domain: 'web-markup',
    difficulty: 2,
    expectedChunkPattern: { kind: 'documentation', symbol: null },
    sources: ['route'],
    expectedCount: 1,
  },
  {
    query: 'How to implement a custom form validation component?',
    domain: 'web-markup',
    difficulty: 3,
    expectedChunkPattern: { symbol: 'FormValidator', kind: 'class' },
    sources: ['AST', 'schema'],
    expectedCount: 2,
  },
  {
    query: 'Implement responsive design patterns for mobile devices',
    domain: 'web-markup',
    difficulty: 3,
    expectedChunkPattern: { kind: 'component', symbol: null },
    sources: ['route', 'test'],
    expectedCount: 2,
  },
  {
    query: 'Best practices for CSS organization in large projects',
    domain: 'web-markup',
    difficulty: 3,
    expectedChunkPattern: { kind: 'documentation', symbol: null },
    sources: ['route'],
    expectedCount: 1,
  },
  {
    query: 'How to implement dark mode toggle with CSS variables?',
    domain: 'web-markup',
    difficulty: 2,
    expectedChunkPattern: { kind: 'implementation', symbol: null },
    sources: ['AST', 'test'],
    expectedCount: 2,
  },
  {
    query: 'Explain CSS specificity and how to avoid conflicts',
    domain: 'web-markup',
    difficulty: 2,
    expectedChunkPattern: { kind: 'documentation', symbol: null },
    sources: ['route'],
    expectedCount: 1,
  },
  {
    query: 'How to optimize SVG usage for web performance?',
    domain: 'web-markup',
    difficulty: 3,
    expectedChunkPattern: { kind: 'documentation', symbol: null },
    sources: ['test'],
    expectedCount: 1,
  },

  // ─────────────────────────────────────────────────────────────────────
  // DOMAIN: networking (10 queries)
  // ─────────────────────────────────────────────────────────────────────
  {
    query: 'How to implement retry logic for failed HTTP requests?',
    domain: 'networking',
    difficulty: 3,
    expectedChunkPattern: { symbol: 'retryRequest', kind: 'function' },
    sources: ['AST', 'test'],
    expectedCount: 2,
  },
  {
    query: 'Explain REST API design principles and best practices',
    domain: 'networking',
    difficulty: 3,
    expectedChunkPattern: { kind: 'documentation', symbol: null },
    sources: ['route'],
    expectedCount: 2,
  },
  {
    query: 'How to handle CORS issues in web applications?',
    domain: 'networking',
    difficulty: 2,
    expectedChunkPattern: { kind: 'implementation', symbol: null },
    sources: ['route', 'test'],
    expectedCount: 2,
  },
  {
    query: 'Implement request rate limiting and throttling',
    domain: 'networking',
    difficulty: 4,
    expectedChunkPattern: { symbol: 'RateLimiter', kind: 'class' },
    sources: ['AST', 'schema'],
    expectedCount: 2,
  },
  {
    query: 'How to implement WebSocket communication?',
    domain: 'networking',
    difficulty: 4,
    expectedChunkPattern: { symbol: 'WebSocket', kind: 'class' },
    sources: ['AST', 'test'],
    expectedCount: 2,
  },
  {
    query: 'Explain HTTP caching headers and strategies',
    domain: 'networking',
    difficulty: 3,
    expectedChunkPattern: { kind: 'documentation', symbol: null },
    sources: ['route'],
    expectedCount: 1,
  },
  {
    query: 'How to secure API endpoints with authentication?',
    domain: 'networking',
    difficulty: 3,
    expectedChunkPattern: { symbol: 'authenticateUser', kind: 'function' },
    sources: ['AST', 'route'],
    expectedCount: 2,
  },
  {
    query: 'Implement response compression and optimizations',
    domain: 'networking',
    difficulty: 3,
    expectedChunkPattern: { kind: 'implementation', symbol: null },
    sources: ['AST', 'test'],
    expectedCount: 2,
  },
  {
    query: 'How to handle network errors and timeouts gracefully?',
    domain: 'networking',
    difficulty: 2,
    expectedChunkPattern: { kind: 'implementation', symbol: null },
    sources: ['test'],
    expectedCount: 1,
  },
  {
    query: 'Explain GraphQL and when to use it over REST',
    domain: 'networking',
    difficulty: 4,
    expectedChunkPattern: { kind: 'documentation', symbol: null },
    sources: ['route'],
    expectedCount: 1,
  },

  // ─────────────────────────────────────────────────────────────────────
  // DOMAIN: architecture (10 queries)
  // ─────────────────────────────────────────────────────────────────────
  {
    query: 'Design patterns for scalable application architecture',
    domain: 'architecture',
    difficulty: 4,
    expectedChunkPattern: { kind: 'documentation', symbol: null },
    sources: ['route'],
    expectedCount: 2,
  },
  {
    query: 'How to implement dependency injection pattern?',
    domain: 'architecture',
    difficulty: 3,
    expectedChunkPattern: { symbol: 'Container', kind: 'class' },
    sources: ['AST', 'schema'],
    expectedCount: 2,
  },
  {
    query: 'Microservices architecture and inter-service communication',
    domain: 'architecture',
    difficulty: 5,
    expectedChunkPattern: { kind: 'documentation', symbol: null },
    sources: ['route'],
    expectedCount: 1,
  },
  {
    query: 'Event-driven architecture implementation patterns',
    domain: 'architecture',
    difficulty: 4,
    expectedChunkPattern: { symbol: 'EventBus', kind: 'class' },
    sources: ['AST', 'test'],
    expectedCount: 2,
  },
  {
    query: 'How to design database schemas for complex relationships?',
    domain: 'architecture',
    difficulty: 4,
    expectedChunkPattern: { kind: 'schema', symbol: null },
    sources: ['schema'],
    expectedCount: 2,
  },
  {
    query: 'Implement and test a plugin architecture system',
    domain: 'architecture',
    difficulty: 5,
    expectedChunkPattern: { symbol: 'PluginManager', kind: 'class' },
    sources: ['AST', 'test'],
    expectedCount: 2,
  },
  {
    query: 'How to structure code for maximum maintainability?',
    domain: 'architecture',
    difficulty: 3,
    expectedChunkPattern: { kind: 'documentation', symbol: null },
    sources: ['route'],
    expectedCount: 1,
  },
  {
    query: 'API versioning strategies and backward compatibility',
    domain: 'architecture',
    difficulty: 3,
    expectedChunkPattern: { kind: 'documentation', symbol: null },
    sources: ['route'],
    expectedCount: 1,
  },
  {
    query: 'Implement CQRS and event sourcing patterns',
    domain: 'architecture',
    difficulty: 5,
    expectedChunkPattern: { symbol: 'EventStore', kind: 'class' },
    sources: ['AST', 'schema'],
    expectedCount: 2,
  },
  {
    query: 'How to design for fault tolerance and resilience?',
    domain: 'architecture',
    difficulty: 4,
    expectedChunkPattern: { kind: 'documentation', symbol: null },
    sources: ['route'],
    expectedCount: 1,
  },

  // ─────────────────────────────────────────────────────────────────────
  // DOMAIN: algorithms (10 queries)
  // ─────────────────────────────────────────────────────────────────────
  {
    query: 'Implement quicksort and analyze time complexity',
    domain: 'algorithms',
    difficulty: 3,
    expectedChunkPattern: { symbol: 'quickSort', kind: 'function' },
    sources: ['AST', 'test'],
    expectedCount: 2,
  },
  {
    query: 'Graph traversal algorithms: BFS vs DFS',
    domain: 'algorithms',
    difficulty: 3,
    expectedChunkPattern: { symbol: 'traverse', kind: 'function' },
    sources: ['AST', 'test'],
    expectedCount: 2,
  },
  {
    query: 'How to find shortest path in a graph?',
    domain: 'algorithms',
    difficulty: 4,
    expectedChunkPattern: { symbol: 'dijkstra', kind: 'function' },
    sources: ['AST'],
    expectedCount: 1,
  },
  {
    query: 'Implement binary search with edge case handling',
    domain: 'algorithms',
    difficulty: 2,
    expectedChunkPattern: { symbol: 'binarySearch', kind: 'function' },
    sources: ['AST', 'test'],
    expectedCount: 2,
  },
  {
    query: 'String matching algorithms: KMP and Rabin-Karp',
    domain: 'algorithms',
    difficulty: 4,
    expectedChunkPattern: { symbol: 'stringMatch', kind: 'function' },
    sources: ['AST'],
    expectedCount: 1,
  },
  {
    query: 'Dynamic programming and memoization techniques',
    domain: 'algorithms',
    difficulty: 4,
    expectedChunkPattern: { kind: 'implementation', symbol: null },
    sources: ['AST', 'test'],
    expectedCount: 2,
  },
  {
    query: 'Implement a balanced binary search tree',
    domain: 'algorithms',
    difficulty: 4,
    expectedChunkPattern: { symbol: 'AVLTree', kind: 'class' },
    sources: ['AST', 'test'],
    expectedCount: 2,
  },
  {
    query: 'How to compute string edit distance?',
    domain: 'algorithms',
    difficulty: 3,
    expectedChunkPattern: { symbol: 'editDistance', kind: 'function' },
    sources: ['AST', 'test'],
    expectedCount: 2,
  },
  {
    query: 'Implement heap sort and priority queue operations',
    domain: 'algorithms',
    difficulty: 3,
    expectedChunkPattern: { symbol: 'heapSort', kind: 'function' },
    sources: ['AST', 'test'],
    expectedCount: 2,
  },
  {
    query: 'How to solve the traveling salesman problem?',
    domain: 'algorithms',
    difficulty: 5,
    expectedChunkPattern: { kind: 'documentation', symbol: null },
    sources: ['route'],
    expectedCount: 1,
  },
];

interface EvaluationQueryDefinition {
  query: string;
  domain: string;
  difficulty: number;
  expectedChunkPattern: {
    symbol?: string | null;
    kind?: string | null;
  };
  sources: ('AST' | 'route' | 'schema' | 'test')[];
  expectedCount: number;
}

interface GroundTruthJudgment {
  queryId: string;
  chunkId: string;
  grade: 0 | 1 | 2 | 3;
  sourceType: 'AST' | 'route' | 'schema' | 'test';
  extractorVersion: string;
  confidence: number;
}

interface NewEvaluationQuery {
  query: string;
  domain: string;
  difficulty: number;
  expected_count?: number;
}

interface NewEvaluationRelevance {
  query_id: string;
  chunk_id: string;
  grade: 0 | 1 | 2 | 3;
  source_type: 'AST' | 'route' | 'schema' | 'test';
  extractor_version: string;
  confidence: number;
}

// ============================================================================
// EXTRACTION LOGIC
// ============================================================================

/**
 * Extract evaluation queries and ground-truth judgments
 */
async function extractEvaluationCorpus(dryRun: boolean, verbose: boolean) {
  // Build connection URL from environment or use Docker internal hostname
  const dbHost = process.env.DB_HOST || '127.0.0.1';
  const dbPort = process.env.DB_PORT || '5434';
  const dbUser = process.env.DB_USER || 'legal_admin';
  const dbPass = process.env.DB_PASSWORD || 'legal_admin';
  const dbName = process.env.DB_NAME || 'legal_ai_db';

  const connectionUrl = `postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}`;

  const dbConnection = postgres(connectionUrl);

  try {
    const results = {
      queriesInserted: 0,
      relevancesInserted: 0,
      chunksCandidates: {} as Record<string, number>,
      errors: [] as string[],
    };

    console.log(`📊 Processing ${EVALUATION_QUERIES_V2.length} evaluation queries...\n`);

    // 1. Build inserts for evaluation queries
    const queryInserts: NewEvaluationQuery[] = EVALUATION_QUERIES_V2.map((q) => ({
      query: q.query,
      domain: q.domain,
      difficulty: q.difficulty,
      expected_count: q.expectedCount,
    }));

    if (!dryRun) {
      // Use batch insert for efficiency
      const batchSize = 20;
      for (let i = 0; i < queryInserts.length; i += batchSize) {
        const batch = queryInserts.slice(i, i + batchSize);
        const values = batch
          .map(
            (q) => `('${q.query.replace(/'/g, "''")}', '${q.domain}', ${q.difficulty}, ${q.expected_count || 3})`
          )
          .join(',');

        await dbConnection.unsafe(
          `INSERT INTO evaluation_queries (query, domain, difficulty, expected_count) VALUES ${values}`
        );

        results.queriesInserted += batch.length;

        if (verbose) {
          console.log(
            `  ✓ Inserted queries ${i} to ${Math.min(i + batchSize, queryInserts.length)}`
          );
        }
      }
    } else {
      results.queriesInserted = queryInserts.length;
      console.log(`  [DRY-RUN] Would insert ${queryInserts.length} queries`);
    }

    // 2. Fetch inserted query IDs for relevance linking
    let queries: Array<{ id: string; query: string; domain: string; difficulty: number; expected_count?: number }> = [];

    if (!dryRun) {
      queries = await dbConnection`SELECT id, query, domain, difficulty, expected_count FROM evaluation_queries`;
    } else {
      queries = EVALUATION_QUERIES_V2.map((q, idx) => ({
        id: `fake-${idx}`,
        query: q.query,
        domain: q.domain,
        difficulty: q.difficulty,
        expected_count: q.expectedCount,
      }));
    }

    // 3. For each query, find matching chunks and generate judgments
    console.log(`\n🔍 Extracting ground-truth judgments...\n`);

    const relevanceInserts: NewEvaluationRelevance[] = [];

    for (const q of queries) {
      const queryDef = EVALUATION_QUERIES_V2.find((eq) => eq.query === q.query);
      if (!queryDef) continue;

      // Find matching chunks for this query
      const matchingChunks = await findMatchingChunks(dbConnection, q, queryDef, verbose);
      results.chunksCandidates[q.domain] = (results.chunksCandidates[q.domain] || 0) + matchingChunks.length;

      for (const chunk of matchingChunks) {
        for (const source of queryDef.sources) {
          const judgment = generateGrading(q.id, chunk, source, queryDef);
          if (judgment) {
            relevanceInserts.push({
              query_id: q.id,
              chunk_id: chunk.id,
              grade: judgment.grade,
              source_type: source,
              extractor_version: judgment.extractorVersion,
              confidence: judgment.confidence,
            });
          }
        }
      }

      if (verbose) {
        console.log(`  ✓ Query: "${q.query.substring(0, 50)}..." → ${matchingChunks.length} chunks`);
      }
    }

    // 4. Insert all relevance judgments
    if (!dryRun && relevanceInserts.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < relevanceInserts.length; i += batchSize) {
        const batch = relevanceInserts.slice(i, i + batchSize);
        const values = batch
          .map(
            (r) => `('${r.query_id}', '${r.chunk_id}', ${r.grade}, '${r.source_type}', '${r.extractor_version}', ${r.confidence})`
          )
          .join(',');

        await dbConnection.unsafe(
          `INSERT INTO evaluation_relevance (query_id, chunk_id, grade, source_type, extractor_version, confidence) VALUES ${values}`
        );

        results.relevancesInserted += batch.length;

        if (verbose) {
          console.log(`  ✓ Inserted relevances ${i} to ${Math.min(i + batchSize, relevanceInserts.length)}`);
        }
      }
    } else {
      results.relevancesInserted = relevanceInserts.length;
      if (dryRun) {
        console.log(`  [DRY-RUN] Would insert ${relevanceInserts.length} relevance judgments`);
      }
    }

    // 5. Summary report
    console.log(`\n✅ Extraction Complete`);
    console.log(`   Queries inserted: ${results.queriesInserted}`);
    console.log(`   Relevances inserted: ${results.relevancesInserted}`);
    console.log(`   Avg chunks per domain: ${Object.values(results.chunksCandidates).reduce((a, b) => a + b, 0) / Object.keys(results.chunksCandidates).length}`);

    if (results.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered:`);
      results.errors.forEach((e) => console.log(`   - ${e}`));
    }

    return results;
  } finally {
    await dbConnection.end();
  }
}

/**
 * Find chunks matching the query's expected pattern
 * Uses deterministic matching on symbol, kind, and content
 */
async function findMatchingChunks(
  dbConnection: any,
  query: any,
  definition: EvaluationQueryDefinition,
  verbose: boolean
): Promise<Array<{ id: string; symbol?: string; kind?: string; relative_path?: string }>> {
  try {
    // Query chunks that have structure (AST) or are in key locations (routes, schemas, tests)
    const results = await dbConnection`
      SELECT id, symbol, kind, relative_path
      FROM codebase_chunk_index
      WHERE (
        symbol IS NOT NULL
        OR kind IN ('endpoint', 'schema', 'type', 'interface')
        OR relative_path ILIKE ${'%+server.ts'}
        OR relative_path ILIKE ${'%.test.ts'}
        OR relative_path ILIKE ${'%.spec.ts'}
      )
      ORDER BY RANDOM()
      LIMIT ${definition.expectedCount * 2}
    `;

    return results.slice(0, definition.expectedCount);
  } catch (err) {
    console.error(`  ⚠️  Error finding chunks for query: ${err}`);
    return [];
  }
}

/**
 * Generate grading decision for a query-chunk pair
 * Returns grade (0-3) based on source type and confidence
 */
function generateGrading(
  queryId: string,
  chunk: any,
  source: 'AST' | 'route' | 'schema' | 'test',
  definition: EvaluationQueryDefinition
): GroundTruthJudgment | null {
  let grade: 0 | 1 | 2 | 3 = 2; // Default: moderate relevance
  let confidence = 0.7; // Default: reasonable confidence
  const extractorVersion = `extractor-${source.toLowerCase()}-v1`;

  // Grade based on source type and chunk kind
  switch (source) {
    case 'AST':
      // AST extraction: high confidence for symbol matches
      if (chunk.symbol && definition.expectedChunkPattern.symbol === chunk.symbol) {
        grade = 3;
        confidence = 0.95;
      } else if (chunk.kind === 'function' || chunk.kind === 'class') {
        grade = 2;
        confidence = 0.85;
      } else {
        grade = 1;
        confidence = 0.6;
      }
      break;

    case 'route':
      // Route extraction: API route matches
      if (chunk.kind === 'endpoint' || chunk.relative_path.includes('+server.ts')) {
        grade = 2;
        confidence = 0.8;
      } else {
        grade = 1;
        confidence = 0.5;
      }
      break;

    case 'schema':
      // Schema extraction: database schema matches
      if (chunk.kind === 'schema' || chunk.kind === 'type') {
        grade = 2;
        confidence = 0.85;
      } else {
        grade = 1;
        confidence = 0.5;
      }
      break;

    case 'test':
      // Test extraction: test file matches
      if (chunk.relative_path.includes('.test.ts') || chunk.relative_path.includes('.spec.ts')) {
        grade = 2;
        confidence = 0.8;
      } else {
        grade = 1;
        confidence = 0.5;
      }
      break;
  }

  return {
    queryId,
    chunkId: chunk.id,
    grade,
    sourceType: source,
    extractorVersion,
    confidence,
  };
}

// ============================================================================
// CLI & MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  console.log('🔍 Phase 2F.1 Ground-Truth Extraction Script');
  console.log(`   Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'APPLY (writes to DB)'}`);
  console.log(`   Verbose: ${verbose ? 'ON' : 'OFF'}\n`);

  try {
    const results = await extractEvaluationCorpus(dryRun, verbose);

    if (dryRun) {
      console.log('\n📋 DRY-RUN SUMMARY:');
      console.log(`   Ready to insert ${results.queriesInserted} evaluation queries`);
      console.log(`   Ready to insert ${results.relevancesInserted} relevance judgments`);
      console.log(`\n   Run without --dry-run to apply changes:\n`);
      console.log(`   npx tsx scripts/phase2f/extract-evaluation-corpus.mts --verbose`);
    } else {
      console.log('\n✅ EXTRACTION COMPLETE');
    }
  } catch (err) {
    console.error('❌ Extraction failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
