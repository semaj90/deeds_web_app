#!/usr/bin/env node
/**
 * RRF 20-Query Benchmark Harness
 *
 * Expanded test suite: 20 queries across 4 categories (Ranking, Database, Vector, Graph)
 * Measures DCG@10, NDCG@10, MRR@20, Recall@10 for all 4 weight presets.
 *
 * Success gate: NDCG@10 >= 0.70 on ALL 20 queries for DEFAULT preset
 */

import { Pool } from 'pg';
import { multiLaneRetrievalWithRRF, computeMetrics } from '../sveltekit-frontend/src/lib/server/retrieval/rrf-integration';

// 20 test queries organized by category
const TEST_QUERIES_20 = [
  // Category 1: Ranking & Information Retrieval (5 queries)
  {
    query: 'RRF multi-signal ranking algorithm',
    relevanceLabels: {
      'rrf-combiner': 1.0,
      'reciprocal-rank-fusion': 1.0,
      'ranking-algorithms': 0.9,
      'information-retrieval': 0.8,
      'multi-signal-ranking': 0.7,
      'fusion-ranking': 0.6,
    },
  },
  {
    query: 'Reciprocal rank fusion vs other fusion methods',
    relevanceLabels: {
      'rrf-combiner': 1.0,
      'ranking-comparison': 0.9,
      'information-retrieval': 0.8,
      'merge-algorithms': 0.7,
      'search-ranking': 0.6,
    },
  },
  {
    query: 'Ranking by relevance score',
    relevanceLabels: {
      'relevance-scoring': 1.0,
      'ranking-algorithms': 0.9,
      'search-ranking': 0.8,
      'rrf-combiner': 0.7,
      'information-retrieval': 0.6,
    },
  },
  {
    query: 'Search result reranking techniques',
    relevanceLabels: {
      'rrf-combiner': 1.0,
      'reranking': 0.9,
      'ranking-algorithms': 0.8,
      'information-retrieval': 0.7,
      'search-ranking': 0.6,
    },
  },
  {
    query: 'Information retrieval evaluation metrics',
    relevanceLabels: {
      'information-retrieval': 1.0,
      'dcg-ndcg': 0.95,
      'evaluation-metrics': 0.9,
      'ranking-algorithms': 0.8,
      'search-ranking': 0.7,
    },
  },

  // Category 2: Database & SQL (5 queries)
  {
    query: 'PostgreSQL full-text search and trigram indexing',
    relevanceLabels: {
      'pg-trgm-guide': 1.0,
      'postgres-fulltext': 0.95,
      'trigram-index': 0.9,
      'sql-similarity': 0.8,
      'postgres-optimization': 0.7,
    },
  },
  {
    query: 'Similarity search with GIN indexes',
    relevanceLabels: {
      'gin-index': 1.0,
      'similarity-search': 0.95,
      'postgres-optimization': 0.9,
      'sql-similarity': 0.8,
      'database-indexing': 0.7,
    },
  },
  {
    query: 'JSONB operations and operators',
    relevanceLabels: {
      'jsonb-operators': 1.0,
      'postgres-jsonb': 0.95,
      'overlap-operators': 0.9,
      'cardinality-scoring': 0.8,
      'database-design': 0.7,
    },
  },
  {
    query: 'Concept overlap scoring in JSONB',
    relevanceLabels: {
      'concept-overlap-search': 1.0,
      'jsonb-operators': 0.95,
      'cardinality-scoring': 0.9,
      'concept-extraction': 0.8,
      'postgres-jsonb': 0.7,
    },
  },
  {
    query: 'Database query optimization',
    relevanceLabels: {
      'postgres-optimization': 1.0,
      'database-performance': 0.9,
      'sql-optimization': 0.8,
      'index-strategy': 0.7,
      'query-planning': 0.6,
    },
  },

  // Category 3: Vector & Semantic (5 queries)
  {
    query: 'Qdrant vector similarity and ANN search',
    relevanceLabels: {
      'qdrant-ann': 1.0,
      'vector-similarity': 0.95,
      'dense-retrieval': 0.9,
      'embedding-search': 0.8,
      'semantic-search': 0.7,
    },
  },
  {
    query: 'Embeddings and dense retrieval',
    relevanceLabels: {
      'dense-retrieval': 1.0,
      'embeddings': 0.95,
      'semantic-search': 0.9,
      'vector-similarity': 0.8,
      'embedding-models': 0.7,
    },
  },
  {
    query: 'Vector database indexing',
    relevanceLabels: {
      'vector-indexing': 1.0,
      'qdrant-ann': 0.95,
      'hnsw-index': 0.9,
      'vector-similarity': 0.8,
      'approximate-nearest-neighbor': 0.7,
    },
  },
  {
    query: 'Semantic similarity between documents',
    relevanceLabels: {
      'semantic-search': 1.0,
      'embeddings': 0.95,
      'similarity-metrics': 0.9,
      'vector-similarity': 0.8,
      'dense-retrieval': 0.7,
    },
  },
  {
    query: '768-dimensional embedding space',
    relevanceLabels: {
      'embeddings': 1.0,
      'dense-retrieval': 0.9,
      'embedding-models': 0.8,
      'vector-similarity': 0.7,
      'semantic-search': 0.6,
    },
  },

  // Category 4: Graph & Neo4j (5 queries)
  {
    query: 'Neo4j relationships and Cypher queries',
    relevanceLabels: {
      'neo4j-gds-retrieval': 1.0,
      'cypher-queries': 0.95,
      'graph-relationships': 0.9,
      'graph-databases': 0.8,
      'property-graphs': 0.7,
    },
  },
  {
    query: 'Knowledge graph traversal',
    relevanceLabels: {
      'graph-traversal': 1.0,
      'neo4j-gds-retrieval': 0.95,
      'cypher-queries': 0.9,
      'knowledge-graphs': 0.8,
      'graph-relationships': 0.7,
    },
  },
  {
    query: 'Concept relationships and edges',
    relevanceLabels: {
      'neo4j-gds-retrieval': 1.0,
      'graph-relationships': 0.95,
      'concept-extraction': 0.9,
      'cypher-queries': 0.8,
      'knowledge-graphs': 0.7,
    },
  },
  {
    query: 'GDS algorithms on graphs',
    relevanceLabels: {
      'gds-algorithms': 1.0,
      'pagerank-algorithm': 0.95,
      'community-detection': 0.9,
      'graph-analytics': 0.8,
      'neo4j-gds-retrieval': 0.7,
    },
  },
  {
    query: 'Graph-based ranking signals',
    relevanceLabels: {
      'neo4j-gds-retrieval': 1.0,
      'pagerank-algorithm': 0.95,
      'ranking-algorithms': 0.9,
      'graph-based-ranking': 0.8,
      'gds-algorithms': 0.7,
    },
  },
];

interface BenchmarkResult {
  query: string;
  preset: string;
  metrics: {
    dcg: number;
    ndcg: number;
    mrr: number;
    recall: number;
  };
  resultCount: number;
  topResult?: string;
  topScore?: number;
}

const WEIGHT_PRESETS: Record<string, Record<string, number>> = {
  default: {
    postgres_trigram: 1.0,
    concept_overlap: 1.2,
    qdrant_vector: 1.0,
    neo4j_graph: 0.8,
  },
  bm25_heavy: {
    postgres_trigram: 2.0,
    concept_overlap: 1.0,
    qdrant_vector: 0.8,
    neo4j_graph: 0.6,
  },
  concept_heavy: {
    postgres_trigram: 0.8,
    concept_overlap: 2.0,
    qdrant_vector: 1.0,
    neo4j_graph: 0.7,
  },
  vector_heavy: {
    postgres_trigram: 0.6,
    concept_overlap: 0.8,
    qdrant_vector: 2.0,
    neo4j_graph: 0.9,
  },
};

async function runBenchmark(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://legal_admin@localhost:5432/legal_ai_db',
  });

  const results: BenchmarkResult[] = [];

  console.log('🧪 RRF 20-Query Benchmark');
  console.log('═'.repeat(80));
  console.log(`Testing ${TEST_QUERIES_20.length} queries × 4 presets = ${TEST_QUERIES_20.length * 4} runs`);
  console.log('');

  try {
    for (let i = 0; i < TEST_QUERIES_20.length; i++) {
      const testQuery = TEST_QUERIES_20[i];
      console.log(`\n[${i + 1}/${TEST_QUERIES_20.length}] Query: "${testQuery.query}"`);

      for (const [presetName, weights] of Object.entries(WEIGHT_PRESETS)) {
        const startMs = Date.now();

        try {
          const rrfOutput = await multiLaneRetrievalWithRRF(testQuery.query, pool, {
            weights,
            topK: 20,
          });

          const metrics = computeMetrics(rrfOutput.results, testQuery.relevanceLabels, 10);
          const durationMs = Date.now() - startMs;

          const topResult = rrfOutput.results[0];

          const result: BenchmarkResult = {
            query: testQuery.query,
            preset: presetName,
            metrics,
            resultCount: rrfOutput.results.length,
            topResult: topResult?.id,
            topScore: topResult?.combinedScore,
          };

          results.push(result);

          console.log(
            `  ${presetName.padEnd(15)} NDCG@10=${metrics.ndcg.toFixed(3)} MRR=${metrics.mrr.toFixed(3)} Recall=${metrics.recall.toFixed(3)} (${durationMs}ms)`
          );
        } catch (err) {
          console.log(`  ${presetName.padEnd(15)} ERROR: ${String(err).slice(0, 50)}`);
        }
      }
    }

    // Print summary statistics
    console.log('\n' + '═'.repeat(80));
    console.log('📊 AGGREGATE SUMMARY');
    console.log('═'.repeat(80));

    const summary: Record<
      string,
      {
        avgNdcg: number;
        avgMrr: number;
        avgRecall: number;
        queryCount: number;
        passCount: number;
      }
    > = {};

    for (const preset of Object.keys(WEIGHT_PRESETS)) {
      const presetResults = results.filter((r) => r.preset === preset);
      const ndcgValues = presetResults.map((r) => r.metrics.ndcg);
      const mrrValues = presetResults.map((r) => r.metrics.mrr);
      const recallValues = presetResults.map((r) => r.metrics.recall);
      const passCount = ndcgValues.filter((n) => n >= 0.7).length;

      summary[preset] = {
        avgNdcg: ndcgValues.reduce((a, b) => a + b, 0) / ndcgValues.length,
        avgMrr: mrrValues.reduce((a, b) => a + b, 0) / mrrValues.length,
        avgRecall: recallValues.reduce((a, b) => a + b, 0) / recallValues.length,
        queryCount: presetResults.length,
        passCount,
      };
    }

    console.log('');
    console.log('Preset          Avg NDCG@10    Avg MRR@20    Avg Recall@10   Pass Rate');
    console.log('─'.repeat(80));

    for (const [presetName, stats] of Object.entries(summary)) {
      const passRate = ((stats.passCount / stats.queryCount) * 100).toFixed(0);
      console.log(
        `${presetName.padEnd(15)} ${stats.avgNdcg.toFixed(3).padEnd(14)} ${stats.avgMrr.toFixed(3).padEnd(13)} ${stats.avgRecall.toFixed(3).padEnd(15)} ${passRate}%`
      );
    }

    // Determine pass/fail on DEFAULT preset
    const defaultStats = summary.default;
    const gatePass = defaultStats.avgNdcg >= 0.7 && defaultStats.passCount === defaultStats.queryCount;

    console.log('');
    console.log('═'.repeat(80));
    if (gatePass) {
      console.log('✅ LEVEL 1 GATE PASS: All 20 queries NDCG@10 >= 0.70');
    } else {
      console.log(
        `❌ LEVEL 1 GATE FAIL: Average NDCG@10=${defaultStats.avgNdcg.toFixed(3)} (need >= 0.70), Passing ${defaultStats.passCount}/${defaultStats.queryCount} queries`
      );
    }

    // Export JSON report
    const jsonReport = {
      timestamp: new Date().toISOString(),
      totalQueries: TEST_QUERIES_20.length,
      totalRuns: TEST_QUERIES_20.length * 4,
      gatePassed: gatePass,
      summary,
      detailedResults: results,
    };

    console.log('\n📄 JSON Report saved to: scripts/rrf-20-query-benchmark-report.json');

    await import('fs').then((fs) =>
      fs.promises.writeFile(
        './scripts/rrf-20-query-benchmark-report.json',
        JSON.stringify(jsonReport, null, 2)
      )
    );

    // Exit with appropriate code
    process.exit(gatePass ? 0 : 1);
  } finally {
    await pool.end();
  }
}

runBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
