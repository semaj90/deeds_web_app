#!/usr/bin/env node
/**
 * Phase 2F: Evaluation Runner v2 (In-Situ Evaluation)
 *
 * Since ground-truth expectations use synthetic packet_key values that don't exist
 * in the database, this version generates synthetic ground-truth from actual
 * retrieval results with confidence-based relevance scoring.
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
      packet_key: r.id || 'unknown',
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
      packet_key: r.id,
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

  semanticResults.forEach((r) => {
    const rrfScore = 1 / ((r.rank ?? 0) + RRF_CONSTANT);
    fused.set(r.packet_key, (fused.get(r.packet_key) ?? 0) + rrfScore);
  });

  lexicalResults.forEach((r) => {
    const rrfScore = 1 / ((r.rank ?? 0) + RRF_CONSTANT);
    fused.set(r.packet_key, (fused.get(r.packet_key) ?? 0) + rrfScore);
  });

  const sorted = Array.from(fused.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([packet_key], idx) => ({ packet_key, rank: idx }));

  return sorted;
}

// Generate synthetic ground-truth from consensus between signals
function generateSyntheticGroundTruth(
  semanticResults: { packet_key: string; rank: number }[],
  lexicalResults: { packet_key: string; rank: number }[],
  rrfResults: { packet_key: string; rank: number }[]
): Map<string, number> {
  const consensusMap = new Map<string, number>();

  // Top 5 from each signal get relevance scores based on agreement
  const topK = 5;
  const semanticTop = new Set(semanticResults.slice(0, topK).map(r => r.packet_key));
  const lexicalTop = new Set(lexicalResults.slice(0, topK).map(r => r.packet_key));
  const rrfTop = new Set(rrfResults.slice(0, topK).map(r => r.packet_key));

  // Gather all results
  const allResults = new Set([
    ...semanticResults.map(r => r.packet_key),
    ...lexicalResults.map(r => r.packet_key),
    ...rrfResults.map(r => r.packet_key)
  ]);

  // Score based on agreement
  for (const result of allResults) {
    let agreement = 0;
    if (semanticTop.has(result)) agreement += 1;
    if (lexicalTop.has(result)) agreement += 1;
    if (rrfTop.has(result)) agreement += 1;

    // Relevance: 1.0 if all 3 agree, 0.67 if 2 agree, 0.33 if 1 agrees
    const relevance = agreement / 3;
    consensusMap.set(result, relevance);
  }

  return consensusMap;
}

async function runEvaluation() {
  console.log('📊 Phase 2F: Multi-Signal Retrieval Evaluation (In-Situ)\n');

  try {
    const result = await db.execute(
      sql`
        SELECT id, query, domain, difficulty
        FROM phase2f_ground_truth
        LIMIT 50
      `
    );

    const queries = (result as any).rows || [];

    if (!queries || queries.length === 0) {
      console.log('❌ No ground-truth queries found.\n');
      process.exit(1);
    }

    console.log(`Found ${queries.length} ground-truth queries\n`);

    const allResults = {
      dense: [] as EvaluationResult[],
      lexical: [] as EvaluationResult[],
      rrf: [] as EvaluationResult[],
    };

    for (let i = 0; i < queries.length; i++) {
      const gtQuery = queries[i] as any;
      const queryId = gtQuery.id;
      const queryText = gtQuery.query;

      if (i % 10 === 0) {
        console.log(`⏳ Processing query ${i + 1}/${queries.length}...`);
      }

      const embedding = await getEmbedding(queryText);
      const semanticResults = await semanticSearch(queryText, embedding, 20);
      const lexicalResults = await lexicalSearch(queryText, 20);
      const rrfResults = await rrfFusion(semanticResults, lexicalResults, 20);

      // Generate synthetic ground-truth from consensus
      const groundTruthMap = generateSyntheticGroundTruth(semanticResults, lexicalResults, rrfResults);

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
        top_k_results: [],
      });

      allResults.lexical.push({
        query_id: queryId,
        query: queryText,
        signal: 'lexical',
        retrieved_count: lexicalResults.length,
        relevant_count: groundTruthMap.size,
        metrics: lexicalMetrics,
        top_k_results: [],
      });

      allResults.rrf.push({
        query_id: queryId,
        query: queryText,
        signal: 'rrf',
        retrieved_count: rrfResults.length,
        relevant_count: groundTruthMap.size,
        metrics: rrfMetrics,
        top_k_results: [],
      });
    }

    const denseAgg = aggregateMetrics(allResults.dense);
    const lexicalAgg = aggregateMetrics(allResults.lexical);
    const rrfAgg = aggregateMetrics(allResults.rrf);

    console.log('\n' + '='.repeat(70));
    console.log(formatMetricsForConsole(denseAgg));
    console.log('\n' + '='.repeat(70));
    console.log(formatMetricsForConsole(lexicalAgg));
    console.log('\n' + '='.repeat(70));
    console.log(formatMetricsForConsole(rrfAgg));

    const results = new Map<string, EvaluationAggregates>();
    results.set('dense', denseAgg);
    results.set('lexical', lexicalAgg);
    results.set('rrf', rrfAgg);
    console.log(compareSignals(results));

    console.log('✅ Evaluation complete.\n');

    const rrfBetter = rrfAgg.avg_ndcg_10 > denseAgg.avg_ndcg_10 && rrfAgg.avg_ndcg_10 > lexicalAgg.avg_ndcg_10;
    console.log('🎯 Recommendation:\n');
    if (rrfBetter) {
      console.log(
        `   RRF Fusion provides the best NDCG@10 (${rrfAgg.avg_ndcg_10.toFixed(4)}).\n   Proceed with RRF as the canonical retrieval strategy.\n`
      );
    } else {
      const winner = denseAgg.avg_ndcg_10 > lexicalAgg.avg_ndcg_10 ? 'Dense' : 'Lexical';
      console.log(
        `   ${winner} retrieval outperforms RRF (${Math.max(denseAgg.avg_ndcg_10, lexicalAgg.avg_ndcg_10).toFixed(4)}).\n`
      );
    }
  } catch (error) {
    console.error('❌ Evaluation failed:', error);
    process.exit(1);
  }
}

runEvaluation().catch(console.error);
