#!/usr/bin/env node
/**
 * Phase 2F: Evaluation Runner
 *
 * Orchestrates ground-truth evaluation of dense, lexical, and RRF retrieval.
 * Runs each query against all three signals, computes metrics, and produces a report.
 */

import { db } from '../src/lib/server/db/client.js';
import { QdrantManager } from '../src/lib/server/vector/qdrant-manager.js';
import { sql } from 'drizzle-orm';
import {
  computeMetricsForQuery,
  aggregateMetrics,
  formatMetricsForConsole,
  compareSignals,
  type EvaluationResult,
  type EvaluationAggregates,
} from './phase2f-evaluation-metrics.mjs';

const qdrantManager = new QdrantManager();
const EMBEDDING_DIM = 768;

async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: text,
      }),
    }) as any;

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    return data.embedding as number[];
  } catch (error) {
    console.error(`Failed to get embedding for "${text}":`, error);
    return Array(EMBEDDING_DIM).fill(0);
  }
}

async function semanticSearch(
  query: string,
  embedding: number[],
  limit: number = 20
): Promise<{ packet_key: string; rank: number }[]> {
  try {
    const result = await qdrantManager.hybridSearch({
      query,
      queryEmbedding: embedding,
      collection: 'codebase_chunks_768',
      limit,
    });

    return result.results.map((r, idx) => ({
      packet_key: r.payload?.packet_key || 'unknown',
      rank: idx,
    }));
  } catch (error) {
    console.error('Semantic search failed:', error);
    return [];
  }
}

async function lexicalSearch(
  query: string,
  limit: number = 20
): Promise<{ packet_key: string; rank: number }[]> {
  try {
    const result = await db.execute(
      sql`
        SELECT
          id,
          ts_rank(to_tsvector('english', content), plainto_tsquery('english', ${query})) as ts_score
        FROM codebase_chunk_index
        WHERE to_tsvector('english', content) @@ plainto_tsquery('english', ${query})
        ORDER BY ts_score DESC
        LIMIT ${limit}
      `
    );

    const rows = (result as any).rows || [];
    return rows.map((r: any, idx: number) => ({
      packet_key: r.id, // Use UUID id as the retrieval key
      rank: idx,
    }));
  } catch (error) {
    console.error('Lexical search failed:', error);
    return [];
  }
}

async function rrfFusion(
  semanticResults: { packet_key: string; rank: number }[],
  lexicalResults: { packet_key: string; rank: number }[],
  limit: number = 20
): Promise<{ packet_key: string; rank: number }[]> {
  const RRF_CONSTANT = 60;
  const fused = new Map<string, number>();

  // Add semantic results
  semanticResults.forEach((r) => {
    const rrfScore = 1 / ((r.rank ?? 0) + RRF_CONSTANT);
    fused.set(r.packet_key, (fused.get(r.packet_key) ?? 0) + rrfScore);
  });

  // Add lexical results
  lexicalResults.forEach((r) => {
    const rrfScore = 1 / ((r.rank ?? 0) + RRF_CONSTANT);
    fused.set(r.packet_key, (fused.get(r.packet_key) ?? 0) + rrfScore);
  });

  // Sort by RRF score
  const sorted = Array.from(fused.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([packet_key], idx) => ({ packet_key, rank: idx }));

  return sorted;
}

async function runEvaluation() {
  console.log('📊 Phase 2F: Multi-Signal Retrieval Evaluation\n');

  try {
    // Fetch ground-truth queries
    const result = await db.execute(
      sql`
        SELECT
          id,
          query,
          domain,
          difficulty
        FROM phase2f_ground_truth
        LIMIT 50
      `
    );

    const queries = (result as any).rows || [];

    if (!queries || queries.length === 0) {
      console.log('❌ No ground-truth queries found. Run phase2f-ground-truth-evaluation-set.mts first.\n');
      process.exit(1);
    }

    console.log(`Found ${queries.length} ground-truth queries\n`);

    const allResults = {
      dense: [] as EvaluationResult[],
      lexical: [] as EvaluationResult[],
      rrf: [] as EvaluationResult[],
    };

    // Process each query
    for (let i = 0; i < queries.length; i++) {
      const gtQuery = queries[i] as any;
      const queryId = gtQuery.id;
      const queryText = gtQuery.query;

      if (i % 10 === 0) {
        console.log(`⏳ Processing query ${i + 1}/${queries.length}...`);
      }

      // Fetch ground-truth expectations
      const expectResult = await db.execute(
        sql`
          SELECT
            packet_key,
            relevance
          FROM phase2f_ground_truth_expectations
          WHERE ground_truth_id = ${queryId}
          ORDER BY rank ASC
        `
      );

      const expectations = (expectResult as any).rows || [];
      const groundTruthMap = new Map<string, number>();
      expectations.forEach((exp: any) => {
        groundTruthMap.set(exp.packet_key, exp.relevance);
      });

      // Get embedding
      const embedding = await getEmbedding(queryText);

      // Run semantic search
      const semanticResults = await semanticSearch(queryText, embedding, 20);

      // Run lexical search
      const lexicalResults = await lexicalSearch(queryText, 20);

      // Run RRF fusion
      const rrfResults = await rrfFusion(semanticResults, lexicalResults, 20);

      // Compute metrics for each signal
      const denseMetrics = computeMetricsForQuery(semanticResults, groundTruthMap);
      const lexicalMetrics = computeMetricsForQuery(lexicalResults, groundTruthMap);
      const rrfMetrics = computeMetricsForQuery(rrfResults, groundTruthMap);

      allResults.dense.push({
        query_id: queryId,
        query: queryText,
        signal: 'dense',
        retrieved_count: semanticResults.length,
        relevant_count: groundTruthMap.size,
        metrics: denseMetrics,
        top_k_results: Array.from(groundTruthMap.entries()).map(([pk, rel], idx) => ({
          rank: idx + 1,
          packet_key: pk,
          relevance: rel,
          retrieved_rank: semanticResults.findIndex((r) => r.packet_key === pk) + 1 || undefined,
        })),
      });

      allResults.lexical.push({
        query_id: queryId,
        query: queryText,
        signal: 'lexical',
        retrieved_count: lexicalResults.length,
        relevant_count: groundTruthMap.size,
        metrics: lexicalMetrics,
        top_k_results: Array.from(groundTruthMap.entries()).map(([pk, rel], idx) => ({
          rank: idx + 1,
          packet_key: pk,
          relevance: rel,
          retrieved_rank: lexicalResults.findIndex((r) => r.packet_key === pk) + 1 || undefined,
        })),
      });

      allResults.rrf.push({
        query_id: queryId,
        query: queryText,
        signal: 'rrf',
        retrieved_count: rrfResults.length,
        relevant_count: groundTruthMap.size,
        metrics: rrfMetrics,
        top_k_results: Array.from(groundTruthMap.entries()).map(([pk, rel], idx) => ({
          rank: idx + 1,
          packet_key: pk,
          relevance: rel,
          retrieved_rank: rrfResults.findIndex((r) => r.packet_key === pk) + 1 || undefined,
        })),
      });
    }

    // Aggregate metrics
    const denseAgg = aggregateMetrics(allResults.dense);
    const lexicalAgg = aggregateMetrics(allResults.lexical);
    const rrfAgg = aggregateMetrics(allResults.rrf);

    // Print results
    console.log('\n' + '='.repeat(70));
    console.log(formatMetricsForConsole(denseAgg));
    console.log('\n' + '='.repeat(70));
    console.log(formatMetricsForConsole(lexicalAgg));
    console.log('\n' + '='.repeat(70));
    console.log(formatMetricsForConsole(rrfAgg));

    // Print comparison
    const results = new Map<string, EvaluationAggregates>();
    results.set('dense', denseAgg);
    results.set('lexical', lexicalAgg);
    results.set('rrf', rrfAgg);
    console.log(compareSignals(results));

    // Save results to database
    await db.execute(
      sql`
        CREATE TABLE IF NOT EXISTS phase2f_evaluation_results (
          id SERIAL PRIMARY KEY,
          query_id VARCHAR(255) NOT NULL,
          signal VARCHAR(50) NOT NULL,
          precision_at_5 REAL,
          precision_at_10 REAL,
          recall_at_5 REAL,
          recall_at_10 REAL,
          recall_at_20 REAL,
          mrr REAL,
          ndcg_10 REAL,
          map REAL,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(query_id, signal)
        )
      `
    );

    for (const result of allResults.dense.concat(allResults.lexical).concat(allResults.rrf)) {
      await db.execute(
        sql`
          INSERT INTO phase2f_evaluation_results
            (query_id, signal, precision_at_5, precision_at_10, recall_at_5, recall_at_10, recall_at_20, mrr, ndcg_10, map)
          VALUES
            (${result.query_id}, ${result.signal},
             ${result.metrics.precision_at_5}, ${result.metrics.precision_at_10},
             ${result.metrics.recall_at_5}, ${result.metrics.recall_at_10}, ${result.metrics.recall_at_20},
             ${result.metrics.mean_reciprocal_rank}, ${result.metrics.normalized_discounted_cumulative_gain_10}, ${result.metrics.mean_average_precision})
          ON CONFLICT (query_id, signal) DO UPDATE SET
            precision_at_5 = EXCLUDED.precision_at_5,
            precision_at_10 = EXCLUDED.precision_at_10,
            recall_at_5 = EXCLUDED.recall_at_5,
            recall_at_10 = EXCLUDED.recall_at_10,
            recall_at_20 = EXCLUDED.recall_at_20,
            mrr = EXCLUDED.mrr,
            ndcg_10 = EXCLUDED.ndcg_10,
            map = EXCLUDED.map
        `
      );
    }

    console.log('✅ Evaluation complete. Results saved to phase2f_evaluation_results table.\n');

    // Summary recommendation
    const rrfBetter = rrfAgg.avg_ndcg_10 > denseAgg.avg_ndcg_10 && rrfAgg.avg_ndcg_10 > lexicalAgg.avg_ndcg_10;
    console.log('🎯 Recommendation:\n');
    if (rrfBetter) {
      console.log(
        `   RRF Fusion provides the best NDCG@10 (${rrfAgg.avg_ndcg_10.toFixed(4)}).\n   Proceed with RRF as the canonical retrieval strategy for Phase 2F.1+.\n`
      );
    } else {
      const winner = denseAgg.avg_ndcg_10 > lexicalAgg.avg_ndcg_10 ? 'Dense' : 'Lexical';
      console.log(
        `   ${winner} retrieval outperforms RRF. Consider investigating why.\n   Possible causes: ground-truth labeling bias, embedding quality, or RRF parameter tuning.\n`
      );
    }
  } catch (error) {
    console.error('❌ Evaluation failed:', error);
    process.exit(1);
  }
}

runEvaluation().catch(console.error);
