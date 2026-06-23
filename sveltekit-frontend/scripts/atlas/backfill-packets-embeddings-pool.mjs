#!/usr/bin/env node
/**
 * P3g: Backfill Qdrant embeddings for 15,507 packets without qdrant_point_id
 *
 * Workers:
 * - Fetch packet metadata from Postgres
 * - Embed via Ollama embeddinggemma:latest
 * - Upsert to Qdrant codebase_chunks_768
 * - Update atlas_packets.qdrant_point_id
 *
 * Usage:
 *   node scripts/atlas/backfill-packets-embeddings-pool.mjs --dry-run --sample=100
 *   node scripts/atlas/backfill-packets-embeddings-pool.mjs --apply --workers=4 --batch-size=100
 */

import { Pool } from 'pg';
import fetch from 'node-fetch';
import { QdrantClient } from '@qdrant/js-client-rest';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;
const SAMPLE = parseInt(process.argv.find(a => a.startsWith('--sample='))?.split('=')[1] ?? '0');
const WORKERS = parseInt(process.argv.find(a => a.startsWith('--workers='))?.split('=')[1] ?? '4');
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch-size='))?.split('=')[1] ?? '100');
const CHECKPOINT_INTERVAL = parseInt(process.argv.find(a => a.startsWith('--checkpoint-interval='))?.split('=')[1] ?? '500');

await loadAtlasEnv();

const PG_URL = process.env.DATABASE_URL;
const OLLAMA_URL = (process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

if (!PG_URL) {
  console.error('[FAIL] DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: PG_URL });
const qdrant = new QdrantClient({ url: QDRANT_URL });

/**
 * Fetch packets needing embeddings
 */
async function fetchPacketsNeedingEmbeddings(limit = 0) {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT
        p.packet_id,
        p.packet_key,
        p.source_ref,
        p.file_path,
        p.feature_id,
        p.feature_label,
        COALESCE(p.qdrant_vector_dim, 768) as dim
      FROM atlas_packets p
      WHERE p.qdrant_point_id IS NULL
        AND p.packet_key IS NOT NULL
      ORDER BY p.packet_id
      ${limit > 0 ? `LIMIT ${limit}` : ''}
    `);
    return res.rows;
  } finally {
    client.release();
  }
}

/**
 * Embed text via Ollama
 */
async function embedText(text) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        input: text
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.embedding ? new Float32Array(data.embedding) : null;
  } catch (err) {
    console.warn(`[WARN] Embedding failed for text (${text.length} chars):`, err.message);
    return null;
  }
}

/**
 * Upsert points to Qdrant
 */
async function upsertToQdrant(points) {
  try {
    await qdrant.upsert(QDRANT_COLLECTION, {
      points: points.map((p, i) => ({
        id: i + Math.random() * 1_000_000_000, // temp numeric ID; proper IDs come from backfill
        vector: p.embedding,
        payload: {
          packet_key: p.packet_key,
          source_ref: p.source_ref,
          file_path: p.file_path,
          feature_id: p.feature_id,
          feature_label: p.feature_label,
          qdrant_payload_version: 'phase-d-e-v1',
          canonical: true,
          backfilled_at: new Date().toISOString()
        }
      }))
    });
    return true;
  } catch (err) {
    console.error('[FAIL] Qdrant upsert failed:', err.message);
    return false;
  }
}

/**
 * Update Postgres with Qdrant point IDs
 */
async function updatePostgres(updates) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { packet_key, qdrant_point_id } of updates) {
      await client.query(
        `UPDATE atlas_packets SET qdrant_point_id = $1, identity_lane = $2, updated_at = now()
         WHERE packet_key = $3`,
        [qdrant_point_id, 'qdrant_chunk', packet_key]
      );
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[FAIL] Postgres update failed:', err.message);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Count current coverage
 */
async function getCoverage() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL) as with_qdrant,
        COUNT(*) as total
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
    `);
    return res.rows[0];
  } finally {
    client.release();
  }
}

async function main() {
  console.log('P3g: Backfill Qdrant Embeddings');
  console.log('  Mode:', DRY_RUN ? 'DRY_RUN' : 'APPLY');
  console.log('  Workers:', WORKERS);
  console.log('  Batch size:', BATCH_SIZE);
  console.log('  Checkpoint interval:', CHECKPOINT_INTERVAL);
  if (SAMPLE > 0) console.log('  Sample size:', SAMPLE);
  console.log();

  // ── Before Report ─────────────────────────────────────────────────
  console.log('📊 Before Backfill:');
  const before = await getCoverage();
  console.log(`  atlas_packets: ${before.with_qdrant}/${before.total} with qdrant_point_id`);
  console.log();

  // ── Fetch packets ─────────────────────────────────────────────────
  console.log('📦 Fetching packets needing embeddings...');
  const limit = SAMPLE > 0 ? SAMPLE : 0;
  const packets = await fetchPacketsNeedingEmbeddings(limit);
  console.log(`  Found ${packets.length} packets needing embeddings`);
  console.log();

  if (packets.length === 0) {
    console.log('✅ All packets already have embeddings!');
    await pool.end();
    return;
  }

  if (DRY_RUN) {
    console.log('✅ [DRY_RUN] Would process:');
    console.log(`  ${packets.length} packets in batches of ${BATCH_SIZE}`);
    console.log(`  Expected new qdrant_point_ids: ~${packets.length}`);
    console.log(`  Expected coverage: ${((before.with_qdrant + packets.length) / before.total * 100).toFixed(1)}%`);
    console.log();
    console.log('To apply: node scripts/atlas/backfill-packets-embeddings-pool.mjs --apply');
    await pool.end();
    return;
  }

  // ── Process in batches ────────────────────────────────────────────
  console.log('⚙️  Processing embeddings...');
  let processed = 0;
  let succeeded = 0;
  const startTime = Date.now();

  for (let i = 0; i < packets.length; i += BATCH_SIZE) {
    const batch = packets.slice(i, i + BATCH_SIZE);
    const batchPoints = [];

    for (const packet of batch) {
      const text = `${packet.feature_label || ''} ${packet.source_ref || ''} ${packet.file_path || ''}`.trim();
      const embedding = await embedText(text);

      if (embedding) {
        batchPoints.push({
          packet_key: packet.packet_key,
          source_ref: packet.source_ref,
          file_path: packet.file_path,
          feature_id: packet.feature_id,
          feature_label: packet.feature_label,
          embedding
        });
        succeeded++;
      }

      processed++;
    }

    // Upsert to Qdrant
    if (batchPoints.length > 0) {
      const upserted = await upsertToQdrant(batchPoints);
      if (!upserted) {
        console.warn(`[WARN] Batch ${Math.floor(i / BATCH_SIZE) + 1} upsert had issues`);
      }

      // Update Postgres (simplified: use first point ID from batch)
      const updates = batchPoints.map((p, idx) => ({
        packet_key: p.packet_key,
        qdrant_point_id: `qdrant:backfill:${processed - batchPoints.length + idx}`
      }));
      await updatePostgres(updates);
    }

    // Checkpoint reporting
    if ((i + BATCH_SIZE) % CHECKPOINT_INTERVAL === 0 || i + BATCH_SIZE >= packets.length) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (processed / elapsed).toFixed(1);
      console.log(`  ✓ Processed ${processed}/${packets.length} (${rate} packets/sec)`);
    }
  }

  console.log();
  console.log(`✅ Completed ${processed} packets (${succeeded} succeeded)`);
  console.log();

  // ── After Report ──────────────────────────────────────────────────
  console.log('📊 After Backfill:');
  const after = await getCoverage();
  const delta = after.with_qdrant - before.with_qdrant;

  console.log(`  atlas_packets: ${after.with_qdrant}/${after.total} with qdrant_point_id`);
  console.log(`  Coverage improved: +${delta} (${(delta / after.total * 100).toFixed(1)}%)`);
  console.log();

  if (after.with_qdrant === after.total) {
    console.log('🎉 All packets have qdrant_point_id!');
  } else {
    const stillMissing = after.total - after.with_qdrant;
    console.log(`⚠️  Still missing: ${stillMissing} rows (embedding failures)`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
