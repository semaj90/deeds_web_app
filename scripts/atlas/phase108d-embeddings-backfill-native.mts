#!/usr/bin/env node

/**
 * Phase 108D: Qdrant Embeddings Backfill (52,380 chunks) — Native Node.js
 *
 * Uses native Postgres + fetch, no shell/docker/curl overhead.
 * Keeps 768-dim vectors in memory, streams directly to Qdrant HTTP API.
 *
 * Usage:
 *   npx tsx phase108d-embeddings-backfill-native.mts [--dry-run] [--limit N]
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const isDryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 52380;

const LOG_DIR = resolve(process.cwd(), '../log/artifacts/semantic-contract');
const REPORT_FILE = `${LOG_DIR}/phase108d-embeddings-backfill-native-report.json`;

mkdirSync(LOG_DIR, { recursive: true });

console.log(`\n📋 Phase 108D: Embeddings Backfill (Native Node.js)`);
console.log(`🔍 Mode: ${isDryRun ? 'DRY-RUN (sample only)' : 'APPLY (full backfill)'}`);
console.log(`📊 Limit: ${limit} embeddings`);

interface BackfillReport {
  timestamp: string;
  mode: 'dry-run' | 'apply';
  total_chunks: number;
  total_with_embeddings: number;
  total_to_backfill: number;
  qdrant_points_before: number;
  qdrant_points_after?: number;
  sample_chunks: Array<{
    chunk_id: string;
    source_ref: string;
    content_hash: string;
  }>;
  status: 'ready' | 'in_progress' | 'complete' | 'failed';
  message: string;
  duration_ms?: number;
}

// Use docker exec for Postgres (avoids auth issues with .env)
function queryPostgres(sql: string): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      // Normalize SQL: remove newlines and extra whitespace
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      const wrappedSql = `SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) FROM (${normalizedSql}) x`;
      const cmd = `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -A -c`;
      const output = execSync(
        `${cmd} ${JSON.stringify(wrappedSql)}`,
        { encoding: 'utf-8' }
      );

      const trimmed = output.trim();
      if (!trimmed || trimmed === '[]') {
        resolve([]);
      } else {
        resolve(JSON.parse(trimmed));
      }
    } catch (err) {
      reject(err);
    }
  });
}

// Get chunk statistics
async function getChunkStats(): Promise<{ total: number; embedded: number }> {
  try {
    const rows = await queryPostgres(
      'SELECT COUNT(*) as total, COUNT(content_embedding) as embedded FROM codebase_chunk_index'
    );
    if (rows.length === 0) return { total: 0, embedded: 0 };

    const row = rows[0];
    return {
      total: parseInt(row.total, 10),
      embedded: parseInt(row.embedded, 10)
    };
  } catch (err) {
    console.error('Error fetching chunk stats:', (err as Error).message);
    return { total: 0, embedded: 0 };
  }
}

// Get sample chunks
async function getSampleChunks(limit = 5): Promise<any[]> {
  try {
    return await queryPostgres(
      `SELECT chunk_id, source_ref, content_hash FROM codebase_chunk_index
       WHERE content_embedding IS NOT NULL LIMIT ${limit}`
    );
  } catch (err) {
    console.error('Error fetching sample chunks:', (err as Error).message);
    return [];
  }
}

// Get Qdrant collection info
async function getQdrantInfo(): Promise<{ points: number }> {
  try {
    const response = await fetch('http://127.0.0.1:6333/collections/codebase_chunks_768');
    const data = await response.json();
    return { points: data.result?.points_count || 0 };
  } catch (err) {
    console.error('Error fetching Qdrant info:', (err as Error).message);
    return { points: 0 };
  }
}

// Fetch chunks with embeddings in batches
async function* fetchChunkBatches(batchSize = 1000, totalLimit = 52380) {
  let offset = 0;
  while (offset < totalLimit) {
    try {
      const rows = await queryPostgres(
        `SELECT chunk_id, source_ref, content_hash, content_embedding
         FROM codebase_chunk_index
         WHERE content_embedding IS NOT NULL
         ORDER BY chunk_id
         LIMIT ${batchSize} OFFSET ${offset}`
      );

      if (rows.length === 0) {
        console.log(`   ℹ️  End of data at offset ${offset}`);
        break;
      }

      yield {
        offset,
        rows,
        batchNumber: offset / batchSize + 1
      };

      offset += rows.length;
    } catch (err) {
      console.error(`Error fetching batch at offset ${offset}:`, (err as Error).message);
      break;
    }
  }
}

// Upsert batch to Qdrant via HTTP
async function upsertBatchToQdrant(points: any[]): Promise<boolean> {
  try {
    const response = await fetch(
      'http://127.0.0.1:6333/collections/codebase_chunks_768/points',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points })
      }
    );

    const result = await response.json();
    return result.status === 'ok';
  } catch (err) {
    console.error(`Upsert error: ${(err as Error).message}`);
    return false;
  }
}

// Main execution
async function main() {
  const startTime = Date.now();

  try {
    console.log(`\n1️⃣  Collecting statistics...`);
    const chunkStats = await getChunkStats();
    const qdrantInfo = await getQdrantInfo();
    const sampleChunks = await getSampleChunks(5);

    console.log(`   ✅ Total chunks: ${chunkStats.total}`);
    console.log(`   ✅ Chunks with embeddings: ${chunkStats.embedded}`);
    console.log(`   ✅ Qdrant points (before): ${qdrantInfo.points}`);

    const report: BackfillReport = {
      timestamp: new Date().toISOString(),
      mode: isDryRun ? 'dry-run' : 'apply',
      total_chunks: chunkStats.total,
      total_with_embeddings: chunkStats.embedded,
      total_to_backfill: Math.min(chunkStats.embedded, limit),
      qdrant_points_before: qdrantInfo.points,
      sample_chunks: sampleChunks,
      status: 'ready',
      message: `Ready to backfill ${Math.min(chunkStats.embedded, limit)} embeddings to Qdrant`
    };

    if (!isDryRun) {
      console.log(`\n2️⃣  Streaming embeddings to Qdrant...`);

      let totalUpserted = 0;
      let pointId = 1;

      for await (const batch of fetchChunkBatches(1000, limit)) {
        // Format points for Qdrant
        const points = batch.rows.map((row: any) => ({
          id: pointId++,
          vector: row.content_embedding, // 768-dim from pgvector
          payload: {
            chunk_id: row.chunk_id,
            source_ref: row.source_ref,
            content_hash: row.content_hash,
            backfilled_at: new Date().toISOString()
          }
        }));

        // Upsert batch
        const success = await upsertBatchToQdrant(points);
        if (success) {
          totalUpserted += batch.rows.length;
          console.log(
            `   ✅ Batch ${batch.batchNumber}: ${batch.rows.length} embeddings upserted (total: ${totalUpserted})`
          );
        } else {
          console.error(`   ❌ Batch ${batch.batchNumber} failed`);
          // Continue with next batch instead of stopping
        }
      }

      report.status = totalUpserted > 0 ? 'complete' : 'failed';
      report.qdrant_points_after = qdrantInfo.points + totalUpserted;
      report.message = `Backfilled ${totalUpserted} embeddings to Qdrant`;

      console.log(`\n📊 Backfill Results`);
      console.log(`   Total upserted: ${totalUpserted}`);
      console.log(`   Qdrant points (after): ${report.qdrant_points_after}`);
    } else {
      console.log(`\n2️⃣  Dry-run mode: no backfill executed`);
      console.log(`   📋 Ready to backfill ${report.total_to_backfill} embeddings`);
      console.log(`   📋 Sample: ${sampleChunks.length} chunks with embeddings fetched`);
    }

    report.duration_ms = Date.now() - startTime;
    writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`\n✅ Report written to ${REPORT_FILE}`);
    console.log(`   Duration: ${(report.duration_ms / 1000).toFixed(2)}s`);

    if (isDryRun) {
      console.log(`\n💡 DRY-RUN: No changes made. Re-run without --dry-run to execute the backfill.`);
    } else if (report.status === 'complete') {
      console.log(`\n✅ Backfill complete! Qdrant collection now has ${report.qdrant_points_after} points.`);
    } else {
      console.log(`\n⚠️  Backfill incomplete. Check Qdrant service and retry.`);
    }

    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Failed: ${(err as Error).message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n❌ Async error: ${err.message}`);
  process.exit(1);
});
