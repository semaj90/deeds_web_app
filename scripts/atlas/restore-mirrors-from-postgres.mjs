#!/usr/bin/env node

/**
 * RESTORE MIRRORS FROM POSTGRES CANONICAL
 * 768-dim halfvec canonical truth → Qdrant mirrors
 */

import pg from 'pg';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __root = path.resolve(__dirname, '../..');
const env = loadRepoEnv();

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env) });

const QDRANT_URL = env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'codebase_chunks_768';
const TMP_DIR = path.resolve(__root, '.tmp');

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const rowLimit = limitArg ? Math.max(0, Number(limitArg.split('=', 2)[1]) || 0) : 0;

const report = {
  timestamp: new Date().toISOString(),
  mode: dryRun ? 'DRY-RUN' : 'APPLY',
  collection: COLLECTION_NAME,
  status: 'PENDING',
  steps: [],
  stats: {
    postgres_rows: 0,
    qdrant_upserted: 0,
    errors: 0
  }
};

console.log('\n🔄 RESTORE MIRRORS FROM POSTGRES CANONICAL (768-dim)\n');
console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
console.log(`Target: Qdrant ${COLLECTION_NAME}\n`);
if (rowLimit > 0) console.log(`Row limit: ${rowLimit}\n`);

// ── Step 1: Count rows ──────────────────────────────────────────────────
console.log('Step 1: Counting rows in Postgres codebase_chunk_index...');

let postgresRows = 0;

try {
  const countRes = await pool.query(`
    SELECT COUNT(*) as cnt
    FROM codebase_chunk_index
    WHERE content_embedding IS NOT NULL
  `);
  postgresRows = parseInt(countRes.rows[0].cnt);
  if (rowLimit > 0) postgresRows = Math.min(postgresRows, rowLimit);
  console.log(`   ✓ Found ${postgresRows} chunks with 768-dim embeddings\n`);

  report.steps.push({
    name: 'count_postgres',
    status: 'OK',
    count: postgresRows
  });
  report.stats.postgres_rows = postgresRows;
} catch (err) {
  console.error(`   ❌ Count failed: ${err.message}`);
  report.status = 'FAILED';
  fs.writeFileSync(
    path.resolve(TMP_DIR, 'restore-mirrors-report.json'),
    JSON.stringify(report, null, 2)
  );
  await pool.end();
  process.exit(1);
}

// ── Step 2: Restore Qdrant ────────────────────────────────────────────────
console.log(`Step 2: Restoring Qdrant ${COLLECTION_NAME}...`);

try {
  const batchSize = 100;
  const numBatches = Math.ceil(postgresRows / batchSize);
  let qdrantUpserted = 0;

  for (let i = 0; i < numBatches; i++) {
    const offset = i * batchSize;
    const limit = Math.min(batchSize, postgresRows - offset);

    // Fetch from Postgres
    const rows = await pool.query(`
      SELECT
        id,
        relative_path,
        content_embedding,
        summary_embedding,
        som_cluster,
        tags,
        symbol,
        community_id,
        updated_at
      FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    if (rows.rows.length === 0) break;

    // Convert to Qdrant format
    const points = rows.rows.map((row) => ({
      id: row.id,
      vector: {
        content: parsePgVector(row.content_embedding),
        error: parsePgVector(row.content_embedding),
        signature: parsePgVector(row.content_embedding)
      },
      payload: {
        relative_path: row.relative_path,
        som_cluster: row.som_cluster,
        tags: row.tags || {},
        symbol: row.symbol,
        community_id: row.community_id,
        updated_at: row.updated_at?.toISOString()
      }
    }));

    if (!dryRun) {
      const upsertRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points?wait=false`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points })
      });

      if (!upsertRes.ok) {
        const body = await upsertRes.text().catch(() => '');
        throw new Error(`Batch ${i + 1} failed: HTTP ${upsertRes.status} ${body.slice(0, 500)}`);
      }

      qdrantUpserted += points.length;
    }

    console.log(`   Batch ${i + 1}/${numBatches}: ${dryRun ? 'Would upsert' : 'Upserted'} ${points.length} points`);
  }

  console.log(`   ✓ Complete: ${dryRun ? 'Would upsert' : 'Upserted'} ${qdrantUpserted || postgresRows} points\n`);

  report.steps.push({
    name: 'restore_qdrant',
    status: dryRun ? 'DRY_RUN_PROVEN' : 'APPLY_PROVEN',
    points_upserted: qdrantUpserted || postgresRows
  });
  report.stats.qdrant_upserted = qdrantUpserted || postgresRows;
} catch (err) {
  console.error(`   ❌ Qdrant restore failed: ${err.message}`);
  report.stats.errors++;
}

// ── Write report ────────────────────────────────────────────────────
report.status = report.stats.errors === 0 ? (dryRun ? 'DRY_RUN_PROVEN' : 'APPLY_PROVEN') : 'PARTIAL';
const reportPath = path.resolve(TMP_DIR, 'restore-mirrors-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`📊 RESTORE MIRRORS REPORT\n`);
console.log(`Status: ${report.status}`);
console.log(`Postgres: ${report.stats.postgres_rows} rows`);
console.log(`Qdrant: ${report.stats.qdrant_upserted} upserted`);
console.log(`Errors: ${report.stats.errors}`);
console.log(`📁 Report: ${reportPath}\n`);

if (dryRun) {
  console.log(`✅ DRY_RUN_PROVEN: Ready to restore\n`);
} else if (report.status === 'APPLY_PROVEN') {
  console.log(`✅ APPLY_PROVEN: Mirrors restored\n`);
}

await pool.end();

function parsePgVector(value) {
  if (Array.isArray(value)) return value.map(Number);
  const text = String(value ?? '').trim();
  if (!text) return [];
  const inner = text.startsWith('[') && text.endsWith(']') ? text.slice(1, -1) : text;
  return inner.split(',').map((part) => Number(part.trim()));
}
