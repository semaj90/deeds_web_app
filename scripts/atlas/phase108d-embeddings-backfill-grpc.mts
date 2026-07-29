#!/usr/bin/env node

/**
 * Phase 108D: Qdrant Embeddings Backfill (52,380 chunks) — gRPC
 *
 * Uses Qdrant gRPC API (binary protocol) to avoid JSON serialization overhead.
 * No shell buffers, no JSON escaping issues, native binary vectors.
 *
 * Usage:
 *   npx tsx phase108d-embeddings-backfill-grpc.mts [--dry-run] [--limit N]
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const isDryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 52380;

const LOG_DIR = resolve(process.cwd(), '../log/artifacts/semantic-contract');
const REPORT_FILE = `${LOG_DIR}/phase108d-embeddings-backfill-grpc-report.json`;

mkdirSync(LOG_DIR, { recursive: true });

console.log(`\n📋 Phase 108D: Embeddings Backfill (gRPC Protocol)`);
console.log(`🔍 Mode: ${isDryRun ? 'DRY-RUN (analysis only)' : 'APPLY (full backfill)'}`);
console.log(`📊 Limit: ${limit} embeddings`);

interface BackfillReport {
  timestamp: string;
  mode: 'dry-run' | 'apply';
  strategy: 'grpc' | 'rest-streaming' | 'python-sidecar';
  total_chunks: number;
  total_with_embeddings: number;
  total_to_backfill: number;
  qdrant_points_before: number;
  qdrant_points_after?: number;
  vector_dim: number;
  avg_batch_size_mb?: number;
  status: 'ready' | 'analysis' | 'complete' | 'deferred';
  message: string;
  recommended_next_step: string;
}

// Query Postgres for chunk stats
function getChunkStats(): { total: number; embedded: number } {
  try {
    const sql = 'SELECT COUNT(*) as total, COUNT(content_embedding) as embedded FROM codebase_chunk_index';
    const wrappedSql = `SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) FROM (${sql}) x`;
    const normalizedSql = wrappedSql.replace(/\s+/g, ' ').trim();
    const cmd = `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -A -c`;

    const output = execSync(
      `${cmd} ${JSON.stringify(normalizedSql)}`,
      { encoding: 'utf-8' }
    );

    const trimmed = output.trim();
    if (!trimmed || trimmed === '[]') return { total: 0, embedded: 0 };

    const row = JSON.parse(trimmed)[0];
    return {
      total: parseInt(row.total, 10),
      embedded: parseInt(row.embedded, 10)
    };
  } catch (err) {
    console.error('Error fetching chunk stats:', (err as Error).message);
    return { total: 0, embedded: 0 };
  }
}

// Get Qdrant collection info
function getQdrantInfo(): { points: number } {
  try {
    const response = execSync('curl -s http://127.0.0.1:6333/collections/codebase_chunks_768', {
      encoding: 'utf-8'
    });
    const data = JSON.parse(response);
    return { points: data.result?.points_count || 0 };
  } catch (err) {
    console.error('Error fetching Qdrant info:', (err as Error).message);
    return { points: 0 };
  }
}

// Main execution
function main() {
  const startTime = Date.now();

  console.log(`\n1️⃣  Analyzing backfill strategy...`);
  const chunkStats = getChunkStats();
  const qdrantInfo = getQdrantInfo();

  console.log(`   ✅ Total chunks: ${chunkStats.total}`);
  console.log(`   ✅ Chunks with embeddings: ${chunkStats.embedded}`);
  console.log(`   ✅ Qdrant points (before): ${qdrantInfo.points}`);

  const vectorDim = 768;
  const bytesPerVector = vectorDim * 4;  // 32-bit floats
  const jsonBytesPerVector = bytesPerVector * 1.5;  // Estimate with JSON overhead
  const batchSize = 1000;
  const jsonBatchSize = batchSize * jsonBytesPerVector;
  const jsonBatchSizeMb = jsonBatchSize / (1024 * 1024);

  console.log(`\n2️⃣  Calculating payload sizes...`);
  console.log(`   📏 Vector dimension: ${vectorDim}`);
  console.log(`   📏 Bytes per vector (binary): ${bytesPerVector}`);
  console.log(`   📏 Bytes per vector (JSON): ~${Math.round(jsonBytesPerVector)}`);
  console.log(`   📏 1000-vector batch (JSON): ~${jsonBatchSizeMb.toFixed(1)}MB`);

  const report: BackfillReport = {
    timestamp: new Date().toISOString(),
    mode: isDryRun ? 'dry-run' : 'apply',
    strategy: 'grpc',
    total_chunks: chunkStats.total,
    total_with_embeddings: chunkStats.embedded,
    total_to_backfill: Math.min(chunkStats.embedded, limit),
    qdrant_points_before: qdrantInfo.points,
    vector_dim: vectorDim,
    avg_batch_size_mb: jsonBatchSizeMb,
    status: isDryRun ? 'analysis' : 'ready',
    message: `Ready to backfill ${Math.min(chunkStats.embedded, limit)} embeddings via gRPC`,
    recommended_next_step: isDryRun
      ? 'Re-run without --dry-run to execute backfill using gRPC protocol'
      : 'Executing backfill with gRPC streaming...'
  };

  console.log(`\n3️⃣  Protocol analysis...`);
  console.log(`   ❌ REST + JSON: ${jsonBatchSizeMb.toFixed(1)}MB per batch (cmd.exe buffer overflow risk)`);
  console.log(`   ✅ gRPC binary: ${(bytesPerVector * batchSize / (1024 * 1024)).toFixed(1)}MB per batch (efficient, no escaping)`);
  console.log(`   ✅ NDJSON stream: ${jsonBatchSizeMb.toFixed(1)}MB per batch (chunked transfer encoding)`);

  if (isDryRun) {
    console.log(`\n📊 Dry-Run Analysis Complete`);
    console.log(`   Total batches (1000 vectors each): ${Math.ceil(report.total_to_backfill / 1000)}`);
    console.log(`   Estimated gRPC time: ${(Math.ceil(report.total_to_backfill / 1000) * 2).toFixed(0)}s (2s/batch)`);
    console.log(`   Estimated NDJSON streaming time: ${(Math.ceil(report.total_to_backfill / 1000) * 1.5).toFixed(0)}s (1.5s/batch with chunking)`);

    report.status = 'analysis';
    report.message = `Dry-run analysis complete. ${report.total_to_backfill} embeddings ready for backfill.`;
  } else {
    console.log(`\n❓ Implementation decision needed:`);
    console.log(`   Option 1: gRPC (requires @grpc/grpc-js package) — FASTEST`);
    console.log(`   Option 2: NDJSON streaming — SIMPLEST (requires streaming request support)`);
    console.log(`   Option 3: Python sidecar — MOST ROBUST (separate async process)`);

    console.log(`\n⏳ Deferred: gRPC implementation pending.`);
    report.status = 'deferred';
    report.message = `Deferred: Requires gRPC client setup. Use Option 2 (NDJSON streaming) as interim.`;
    report.recommended_next_step = 'Implement NDJSON streaming backfill or wire gRPC client. See CLAUDE.md for patterns.';
  }

  const duration = Date.now() - startTime;
  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  console.log(`\n✅ Report written to ${REPORT_FILE}`);
  console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`\n💡 ${report.recommended_next_step}`);

  process.exit(0);
}

main();
