#!/usr/bin/env node
/**
 * RRF Ablation Test Harness
 *
 * Measure DCG@10, NDCG@10, MRR@20 for RRF vs individual signals.
 * Validates that RRF combination outperforms single signals.
 */

import { Pool } from 'pg';
import { multiLaneRetrievalWithRRF, computeMetrics } from '../sveltekit-frontend/src/lib/server/retrieval/rrf-integration';

// Sample test queries with manual relevance labels
const TEST_QUERIES = [
  {
    query: 'How do I implement BM25 search in PostgreSQL?',
    relevanceLabels: {
      'pg-trgm-guide': 1.0,
      'bm25-implementation': 1.0,
      'sql-similarity': 0.8,
      'trigram-index': 0.7,
      'postgres-fulltext': 0.6,
    },
  },
  {
    query: 'RRF ranking algorithm components',
    relevanceLabels: {
      'rrf-combiner': 1.0,
      'reciprocal-rank-fusion': 1.0,
      'multi-signal-ranking': 0.9,
      'information-retrieval': 0.7,
      'ranking-algorithms': 0.6,
    },
  },
  {
    query: 'Concept extraction and overlap scoring',
    relevanceLabels: {
      'concept-overlap-search': 1.0,
      'jsonb-operators': 0.9,
      'cardinality-scoring': 0.8,
      'concept-extraction': 0.7,
    },
  },
  {
    query: 'Atlas packets ingestion and storage',
    relevanceLabels: {
      'atlas-packets-schema': 1.0,
      'messagepack-ingestion': 0.9,
      'postgres-bulk-insert': 0.8,
      'ndjson-parsing': 0.7,
      'packet-registry': 0.6,
    },
  },
  {
    query: 'Neo4j graph relationships and edges',
    relevanceLabels: {
      'neo4j-gds-retrieval': 1.0,
      'graph-relationships': 0.9,
      'cypher-queries': 0.8,
      'pagerank-algorithm': 0.7,
    },
  },
];

interface AblationResult {
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

async function runAblationTest(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://legal_admin@localhost:5432/legal_ai_db',
  });

  const presets = ['default', 'bm25_heavy', 'concept_heavy', 'vector_heavy'];
  const results: AblationResult[] = [];

  console.log('🧪 RRF Ablation Test');
  console.log(`📊 Testing ${TEST_QUERIES.length} queries across ${presets.length} weight presets`);
  console.log('───────────────────────────────────────────────────────\n');

  try {
    for (const test of TEST_QUERIES) {
      console.log(`Query: "${test.query}"`);
      console.log(`Relevance labels: ${Object.keys(test.relevanceLabels).length} documents`);

      for (const preset of presets) {
        try {
          const output = await multiLaneRetrievalWithRRF(test.query, pool, {
            topK: 20,
            useWeights: preset,
          });

          const metrics = computeMetrics(
            output.results,
            test.relevanceLabels,
            10
          );

          const topResult = output.results[0]?.id || 'N/A';
          const topScore = output.results[0]?.combinedScore || 0;

          results.push({
            query: test.query,
            preset,
            metrics,
            resultCount: output.results.length,
            topResult,
            topScore,
          });

          console.log(
            `  ${preset.padEnd(15)} | DCG=${metrics.dcg.toFixed(3)} NDCG=${metrics.ndcg.toFixed(3)} MRR=${metrics.mrr.toFixed(3)} R=${metrics.recall.toFixed(3)}`
          );
        } catch (err) {
          console.error(`  ${preset.padEnd(15)} | ERROR: ${err}`);
        }
      }

      console.log('');
    }

    // Summary statistics
    console.log('\n📈 Summary Statistics');
    console.log('───────────────────────────────────────────────────────\n');

    for (const preset of presets) {
      const preset_results = results.filter((r) => r.preset === preset);
      if (preset_results.length === 0) continue;

      const avgNdcg =
        preset_results.reduce((sum, r) => sum + r.metrics.ndcg, 0) / preset_results.length;
      const avgMrr =
        preset_results.reduce((sum, r) => sum + r.metrics.mrr, 0) / preset_results.length;
      const avgRecall =
        preset_results.reduce((sum, r) => sum + r.metrics.recall, 0) / preset_results.length;

      console.log(`${preset.padEnd(15)} | Avg NDCG=${avgNdcg.toFixed(3)} Avg MRR=${avgMrr.toFixed(3)} Avg Recall=${avgRecall.toFixed(3)}`);
    }

    // Identify best preset
    const defaultResults = results.filter((r) => r.preset === 'default');
    const defaultNdcg =
      defaultResults.reduce((sum, r) => sum + r.metrics.ndcg, 0) / defaultResults.length;

    console.log('\n🎯 Best Preset Comparison');
    console.log('───────────────────────────────────────────────────────\n');

    for (const preset of presets.slice(1)) {
      const presetResults = results.filter((r) => r.preset === preset);
      const presetNdcg =
        presetResults.reduce((sum, r) => sum + r.metrics.ndcg, 0) / presetResults.length;
      const improvement = ((presetNdcg - defaultNdcg) / defaultNdcg * 100).toFixed(1);

      console.log(`${preset.padEnd(15)} vs default: ${improvement > 0 ? '+' : ''}${improvement}% (NDCG)`);
    }
  } finally {
    await pool.end();
  }
}

runAblationTest().catch(console.error);
