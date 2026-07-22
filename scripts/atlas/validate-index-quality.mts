#!/usr/bin/env node
/**
 * Phase 1, Step 8: Validate Index Quality
 *
 * Gate 2 & 3: Verify Qdrant and TurboVec correlation with brute-force baseline
 * - Generate 100 random test queries
 * - Compute exact top-10 via brute-force (L2 distance on CPU)
 * - Query Qdrant and TurboVec
 * - Compute Spearman rank correlation for top-10 results
 * - Requirement: correlation ≥0.85 for both indexes
 *
 * Usage:
 *   npx tsx validate-index-quality.mts [--verbose]
 */

import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'duckdb-async';
import { QdrantClient } from '@qdrant/js-client-rest';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.join(__dirname, '../../data/atlas-ml/snapshot_5k_384dim.parquet');

interface QueryResult {
  packet_key: string;
  score: number;
}

/**
 * Compute Spearman rank correlation between two ranked lists
 */
function spearmanCorrelation(list1: QueryResult[], list2: QueryResult[]): number {
  if (list1.length !== list2.length) return 0;

  const n = list1.length;

  // Rank the scores
  const rank1 = new Map<string, number>();
  list1.forEach((item, idx) => rank1.set(item.packet_key, idx + 1));

  const rank2 = new Map<string, number>();
  list2.forEach((item, idx) => rank2.set(item.packet_key, idx + 1));

  // Compute Spearman via Pearson on ranks
  let sumD2 = 0;
  for (const key of rank1.keys()) {
    const r1 = rank1.get(key) || 0;
    const r2 = rank2.get(key) || 0;
    sumD2 += Math.pow(r1 - r2, 2);
  }

  const rho = 1 - (6 * sumD2) / (n * (n * n - 1));
  return rho;
}

/**
 * L2 distance between two vectors
 */
function l2Distance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

async function validateIndexQuality(): Promise<void> {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');

  const qdrantHost = process.env.QDRANT_HOST || '127.0.0.1';
  const qdrantPort = parseInt(process.env.QDRANT_PORT || '6333');
  const qdrantClient = new QdrantClient({ host: qdrantHost, port: qdrantPort });

  const turboVecHost = process.env.TURBOVEC_HOST || '127.0.0.1';
  const turboVecPort = parseInt(process.env.TURBOVEC_PORT || '8791');
  const turboVecUrl = `http://${turboVecHost}:${turboVecPort}`;

  const testQueryCount = 100;
  const topK = 10;

  try {
    if (verbose) {
      console.log(`[Validation] Loading snapshot for baseline computation...`);
    }

    const db = new Database(':memory:');

    // Load all points
    const pointsQuery = `
      SELECT
        packet_key,
        embedding
      FROM read_parquet('${SNAPSHOT_PATH}')
      GROUP BY packet_key, embedding
      ORDER BY packet_key
    `;

    const allPoints = (await db.all(pointsQuery)) as any[];

    if (allPoints.length === 0) {
      throw new Error('No points found in snapshot');
    }

    if (verbose) console.log(`[Validation] Loaded ${allPoints.length} points`);

    // Select random test queries
    const testIndices = new Set<number>();
    while (testIndices.size < Math.min(testQueryCount, allPoints.length)) {
      testIndices.add(Math.floor(Math.random() * allPoints.length));
    }

    const testQueries = Array.from(testIndices).map((idx) => allPoints[idx]);

    if (verbose) console.log(`[Validation] Selected ${testQueries.length} random test queries`);

    let qdrantSpearmanSum = 0;
    let turboVecSpearmanSum = 0;
    let qdrantPass = 0;
    let turboVecPass = 0;

    console.log(`\n[Validation] Running ${testQueries.length} test queries...`);

    for (let i = 0; i < testQueries.length; i++) {
      const queryVec = testQueries[i].embedding as number[];

      // Brute-force baseline
      const distances = allPoints.map((point) => ({
        packet_key: point.packet_key,
        distance: l2Distance(queryVec, point.embedding as number[]),
      }));

      distances.sort((a, b) => a.distance - b.distance);
      const baseline = distances.slice(0, topK).map((d) => ({
        packet_key: d.packet_key,
        score: -d.distance, // Negative so higher score = closer
      }));

      // Query Qdrant
      let qdrantResults: QueryResult[] = [];
      try {
        const qdrantRes = await qdrantClient.search('codebase_chunks_384', {
          vector: queryVec,
          limit: topK,
        });

        qdrantResults = qdrantRes.result.map((hit) => ({
          packet_key: hit.payload?.packet_key as string,
          score: hit.score,
        }));
      } catch (err) {
        if (verbose) console.log(`  ⚠️  Qdrant query failed: ${(err as any).message}`);
      }

      // Query TurboVec
      let turboVecResults: QueryResult[] = [];
      try {
        const turboRes = await fetch(`${turboVecUrl}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vector: queryVec, k: topK }),
        });

        if (turboRes.ok) {
          const data = (await turboRes.json()) as any;
          turboVecResults = (data.results || []).map((hit: any) => ({
            packet_key: hit.metadata?.packet_key || hit.id,
            score: hit.score,
          }));
        }
      } catch (err) {
        if (verbose) console.log(`  ⚠️  TurboVec query failed: ${(err as any).message}`);
      }

      // Compute correlations
      if (qdrantResults.length > 0) {
        const qdrantCorr = spearmanCorrelation(baseline, qdrantResults);
        qdrantSpearmanSum += qdrantCorr;
        if (qdrantCorr >= 0.85) qdrantPass++;
      }

      if (turboVecResults.length > 0) {
        const turboCorr = spearmanCorrelation(baseline, turboVecResults);
        turboVecSpearmanSum += turboCorr;
        if (turboCorr >= 0.85) turboVecPass++;
      }

      if (verbose && (i + 1) % 20 === 0) {
        console.log(`  - Completed ${i + 1} / ${testQueries.length} queries`);
      }
    }

    const qdrantAvg = qdrantSpearmanSum / testQueries.length;
    const turboVecAvg = turboVecSpearmanSum / testQueries.length;

    console.log('\n=== Index Quality Validation Complete ===');
    console.log(`\nQdrant HNSW:`);
    console.log(`  Spearman correlation: ${qdrantAvg.toFixed(4)}`);
    console.log(`  Pass rate (≥0.85): ${qdrantPass} / ${testQueries.length}`);
    console.log(`  Status: ${qdrantAvg >= 0.85 ? '✅ PASS (Gate 2)' : '❌ FAIL'}`);

    console.log(`\nTurboVec 4-bit:`);
    console.log(`  Spearman correlation: ${turboVecAvg.toFixed(4)}`);
    console.log(`  Pass rate (≥0.85): ${turboVecPass} / ${testQueries.length}`);
    console.log(`  Status: ${turboVecAvg >= 0.85 ? '✅ PASS (Gate 3)' : '❌ FAIL'}`);

    const allPass = qdrantAvg >= 0.85 && turboVecAvg >= 0.85;
    console.log(`\nOverall: ${allPass ? '✅ BOTH INDEXES PASS' : '⚠️  One or more indexes below 0.85 threshold'}`);
    console.log(`✅ Step 8 complete`);

    await db.close();

    if (!allPass) {
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Step 8 failed:', err);
    process.exit(1);
  }
}

validateIndexQuality();
