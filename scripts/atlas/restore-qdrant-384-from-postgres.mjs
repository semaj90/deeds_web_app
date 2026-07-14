#!/usr/bin/env node

/**
 * RESTORE QDRANT 384-DIM FROM POSTGRES CANONICAL
 *
 * Restores codebase_chunks_384 Qdrant collection from Postgres canonical packets.
 * Read-only from Postgres, upserts into Qdrant.
 *
 * Only processes rows where atlas_packets.content_embedding_384 IS NOT NULL.
 *
 * Usage:
 *   node scripts/atlas/restore-qdrant-384-from-postgres.mjs [--dry-run]
 *   node scripts/atlas/restore-qdrant-384-from-postgres.mjs --apply [--batch=100]
 */

import pg from 'pg';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __root = path.resolve(__dirname, '../..');

const pool = new pg.Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5434,
  user: process.env.PGUSER || 'legal_admin',
  password: process.env.PGPASSWORD || '123456',
  database: process.env.PGDATABASE || 'legal_ai_db'
});

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'codebase_chunks_384';
const TMP_DIR = path.resolve(__root, '.tmp');

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const verbose = args.includes('--verbose');
const batchSize = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] || '100');
const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const limit = parseInt(limitArg || '0', 10);

const report = {
  timestamp: new Date().toISOString(),
  mode: dryRun ? 'DRY_RUN' : 'APPLY',
  collection: COLLECTION_NAME,
  batch_size: batchSize,
  limit: limit,
  status: 'PENDING',
  steps: [],
  stats: {
    postgres_eligible_rows: 0,
    qdrant_points_upserted: 0,
    qdrant_final_count: 0,
    errors: 0
  }
};

console.log('\n♻️  RESTORE QDRANT 384-DIM FROM POSTGRES\n');
console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
console.log(`Collection: ${COLLECTION_NAME}`);
console.log(`Batch size: ${batchSize}`);
console.log(`Limit: ${limit > 0 ? limit : 'none (full)'}\n`);

function parsePgVector(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  const text = String(value ?? '').trim();
  if (!text) return [];
  return text
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((item) => Number.parseFloat(item.trim()))
    .filter(Number.isFinite);
}

// ── Step 1: Count eligible rows in Postgres ────────────────────────────
console.log('Step 1: Counting eligible rows in Postgres...');

let eligibleCount = 0;
try {
  const countRes = await pool.query(`
    SELECT COUNT(*) as cnt
    FROM atlas_packets
    WHERE content_embedding_384 IS NOT NULL
  `);
  eligibleCount = parseInt(countRes.rows[0].cnt);
  console.log(`   ✓ Found ${eligibleCount} rows with content_embedding_384\n`);
  report.steps.push({
    name: 'count_eligible',
    status: 'OK',
    count: eligibleCount
  });
  report.stats.postgres_eligible_rows = eligibleCount;
} catch (err) {
  console.error(`   ❌ Count failed: ${err.message}`);
  report.steps.push({
    name: 'count_eligible',
    status: 'FAILED',
    error: err.message
  });
  report.status = 'FAILED';
  fs.writeFileSync(
    path.resolve(TMP_DIR, 'qdrant-384-restore-report.json'),
    JSON.stringify(report, null, 2)
  );
  await pool.end();
  process.exit(1);
}

// ── Step 2: Verify Qdrant collection exists ────────────────────────────
console.log('Step 2: Verifying Qdrant collection exists...');

try {
  const checkRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`);
  if (!checkRes.ok) {
    throw new Error(`Collection ${COLLECTION_NAME} not found (HTTP ${checkRes.status})`);
  }
  console.log(`   ✓ Collection verified\n`);
  report.steps.push({
    name: 'verify_collection',
    status: 'OK'
  });
} catch (err) {
  console.error(`   ❌ Verification failed: ${err.message}`);
  report.steps.push({
    name: 'verify_collection',
    status: 'FAILED',
    error: err.message
  });
  report.status = 'FAILED';
  fs.writeFileSync(
    path.resolve(TMP_DIR, 'qdrant-384-restore-report.json'),
    JSON.stringify(report, null, 2)
  );
  await pool.end();
  process.exit(1);
}

// ── Step 3: Restore points in batches ───────────────────────────────────
console.log(`Step 3: Restoring points to Qdrant (batch=${batchSize})...`);

let totalUpserted = 0;
const maxItems = limit > 0 ? limit : eligibleCount;
const numBatches = Math.ceil(maxItems / batchSize);

try {
  for (let i = 0; i < numBatches; i++) {
    const offset = i * batchSize;
    const querLimit = Math.min(batchSize, maxItems - offset);

    if (dryRun && i === 0) {
      // Only show first batch in dry-run
      if (verbose) {
        console.log(`   [DRY-RUN] Would fetch batch 1/${numBatches} (offset=${offset}, limit=${querLimit})`);
      }
    } else if (!dryRun || i === 0) {
      process.stdout.write(`   Batch ${i + 1}/${numBatches}...`);
    }

    // Fetch rows from Postgres
    const rows = await pool.query(`
      SELECT
        packet_id,
        packet_key,
        source_ref,
        feature_id,
        som_cluster,
        kmeans_cluster,
        payload,
        content_embedding_384,
        summary,
        updated_at
      FROM atlas_packets
      WHERE content_embedding_384 IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT $1 OFFSET $2
    `, [querLimit, offset]);

    if (rows.rows.length === 0) {
      console.log(' (no more rows)');
      break;
    }

    // Convert to Qdrant format
    const points = rows.rows.map((row) => ({
      id: row.packet_id,
      vector: {
        content: parsePgVector(row.content_embedding_384),
        summary: parsePgVector(row.content_embedding_384)
      },
      payload: {
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        som_cluster: row.som_cluster,
        kmeans_cluster: row.kmeans_cluster,
        summary: row.summary || null,
        updated_at: row.updated_at?.toISOString()
      }
    }));

    if (!dryRun) {
      // Upsert to Qdrant
      const upsertRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points?wait=false`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points })
      });

      if (!upsertRes.ok) {
        const errData = await upsertRes.text();
        throw new Error(`Upsert batch ${i + 1} failed: HTTP ${upsertRes.status} - ${errData}`);
      }

      totalUpserted += points.length;
      console.log(` ✓ (${points.length} points)`);
    } else {
      console.log(` ✓ (would upsert ${points.length} points)`);
      totalUpserted += points.length;
    }
  }

  console.log(`   ✓ All batches processed\n`);
  report.steps.push({
    name: 'restore_batches',
    status: dryRun ? 'DRY_RUN_PROVEN' : 'APPLY_PROVEN',
    batches: numBatches,
    points_upserted: totalUpserted
  });
  report.stats.qdrant_points_upserted = totalUpserted;
} catch (err) {
  console.error(`   ❌ Restore failed: ${err.message}`);
  report.steps.push({
    name: 'restore_batches',
    status: 'FAILED',
    error: err.message
  });
  report.stats.errors++;
  report.status = 'FAILED';
  fs.writeFileSync(
    path.resolve(TMP_DIR, 'qdrant-384-restore-report.json'),
    JSON.stringify(report, null, 2)
  );
  await pool.end();
  process.exit(1);
}

// ── Step 4: Verify final count ─────────────────────────────────────────
if (!dryRun) {
  console.log('Step 4: Verifying final point count...');
  try {
    const countRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`);
    const data = await countRes.json();
    const pointsCount = data.result?.points_count || 0;

    console.log(`   ✓ Qdrant final count: ${pointsCount} points\n`);
    report.steps.push({
      name: 'verify_final_count',
      status: 'OK',
      qdrant_points: pointsCount
    });
    report.stats.qdrant_final_count = pointsCount;

    // Check if counts match
    if (pointsCount !== totalUpserted) {
      console.log(`   ⚠️  Note: Upserted ${totalUpserted} but Qdrant reports ${pointsCount}`);
      console.log('   This is normal if some points share the same ID\n');
    }
  } catch (err) {
    console.error(`   ⚠️  Could not verify final count: ${err.message}\n`);
    report.steps.push({
      name: 'verify_final_count',
      status: 'PARTIAL',
      error: err.message
    });
  }
}

// ── Write report ──────────────────────────────────────────────────────
report.status = report.stats.errors === 0 ? (dryRun ? 'DRY_RUN_PROVEN' : 'APPLY_PROVEN') : 'PARTIAL';
const reportPath = path.resolve(TMP_DIR, 'qdrant-384-restore-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`📊 RESTORE REPORT\n`);
console.log(`Status: ${report.status}`);
console.log(`Postgres eligible rows: ${report.stats.postgres_eligible_rows}`);
console.log(`Qdrant points upserted: ${report.stats.qdrant_points_upserted}`);
console.log(`Qdrant final count: ${report.stats.qdrant_final_count}`);
console.log(`Errors: ${report.stats.errors}`);
console.log(`\n📁 Report: ${reportPath}\n`);

if (dryRun) {
  console.log(`✅ DRY_RUN_PROVEN: ${report.stats.qdrant_points_upserted} points ready to upsert\n`);
} else if (report.status === 'APPLY_PROVEN') {
  console.log(`✅ APPLY_PROVEN: ${report.stats.qdrant_points_upserted} points restored to Qdrant\n`);
} else {
  console.log(`⚠️  Restore incomplete\n`);
}

await pool.end();
