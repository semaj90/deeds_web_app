#!/usr/bin/env node
/**
 * Phase 1 Qdrant Payload + Vector Upsert
 *
 * After embeddings are written to Postgres, upsert vectors + payloads to Qdrant.
 * Runs as a separate backfill or can be triggered by the worker.
 *
 * Deduplication:
 *   - Only upsert if qdrant_point_id IS NULL and embedding IS NOT NULL
 *   - Qdrant UPSERT is idempotent (safe to re-run)
 *   - Payload sync: packet_key, source_ref, feature_id, feature_label, domain, kind, tags
 *
 * Usage:
 *   node scripts/atlas/phase1-qdrant-payload-upsert.mjs --dry-run [--limit=1000]
 *   node scripts/atlas/phase1-qdrant-payload-upsert.mjs --apply [--limit=1000]
 *   node scripts/atlas/phase1-qdrant-payload-upsert.mjs --stats
 */

import pg from 'pg';
import { argv } from 'process';

// ── Configuration ────────────────────────────────────────────────────────────

const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100');
const LIMIT = parseInt(process.env.PACKET_LIMIT || '0');

const MODE = argv.includes('--apply') ? 'apply' : argv.includes('--dry-run') ? 'dry-run' : argv.includes('--stats') ? 'stats' : 'dry-run';

const db = new pg.Pool({ connectionString: DB_URL, max: 10 });

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

async function qdrantUpsert(points, verbose = false) {
  try {
    if (verbose) log(`  → Upserting ${points.length} points to Qdrant`);
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!res.ok) {
      log(`  ❌ Qdrant error: HTTP ${res.status}`);
      const body = await res.text();
      log(`     Response: ${body.substring(0, 200)}`);
      return false;
    }

    if (verbose) log(`  ✓ Qdrant upsert successful`);
    return true;
  } catch (e) {
    log(`  ❌ Qdrant upsert error: ${e.message}`);
    return false;
  }
}

// ── Upsert Mode ──────────────────────────────────────────────────────────────

async function upsertPayloads(dryRun = false) {
  log(`🚀 Qdrant Payload + Vector Upsert`);
  log(`  Collection: ${QDRANT_COLLECTION}`);
  log(`  Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}\n`);

  try {
    // Fetch packets with embeddings but no qdrant_point_id
    const result = await db.query(`
      SELECT
        packet_id,
        packet_key,
        source_ref,
        file_path,
        feature_id,
        feature_label,
        embedding,
        metadata
      FROM atlas_packets
      WHERE embedding IS NOT NULL
        AND metadata->>'qdrant_point_id' IS NULL
      ORDER BY created_at DESC
      LIMIT $1
    `, [LIMIT || 10000]);

    const packets = result.rows;
    log(`  Found ${packets.length} packets needing Qdrant upsert\n`);

    if (packets.length === 0) {
      log(`✅ All packets already uperted to Qdrant\n`);
      return;
    }

    // Batch upsert
    let upserted = 0;
    const startTime = Date.now();

    for (let i = 0; i < packets.length; i += BATCH_SIZE) {
      const batch = packets.slice(i, i + BATCH_SIZE);

      // Convert embeddings from string to array
      const points = batch.map((p, idx) => {
        const embedding = p.embedding.substring(1, p.embedding.length - 1).split(',').map(Number);
        const pointId = parseInt(p.packet_id) * 1000 + idx; // Stable ID derivation

        return {
          id: pointId,
          vector: embedding,
          payload: {
            packet_key: p.packet_key,
            source_ref: p.source_ref,
            file_path: p.file_path,
            feature_id: p.feature_id,
            feature_label: p.feature_label,
            domain: p.metadata?.domain || 'unknown',
            kind: p.metadata?.kind || 'unknown',
            tags: p.metadata?.tags || [],
            summary_hash: p.metadata?.provenance?.summary_hash || '',
            qdrant_point_id: pointId
          }
        };
      });

      if (!dryRun) {
        const success = await qdrantUpsert(points, i % 500 === 0);
        if (!success) {
          log(`  ⚠️  Batch ${Math.floor(i / BATCH_SIZE) + 1} failed, continuing...`);
          // Don't requeue on failure; mark as attempted
          for (const p of batch) {
            await db.query(
              `UPDATE atlas_packets
               SET metadata = jsonb_set(
                 coalesce(metadata, '{}'::jsonb),
                 '{qdrant_upsert_attempted}',
                 'true'::jsonb
               )
               WHERE packet_id = $1`,
              [p.packet_id]
            );
          }
          continue;
        }

        // Mark points as uperted in metadata
        for (const point of points) {
          const packetId = batch[batch.findIndex(p => parseInt(p.packet_id) * 1000 === point.id)].packet_id;
          await db.query(
            `UPDATE atlas_packets
             SET metadata = jsonb_set(
               coalesce(metadata, '{}'::jsonb),
               '{qdrant_point_id}',
               to_jsonb($1)
             )
             WHERE packet_id = $2`,
            [point.id, packetId]
          );
        }

        upserted += batch.length;
        const elapsed = (Date.now() - startTime) / 1000;
        const throughput = upserted / elapsed;
        const remaining = packets.length - upserted;
        const eta = remaining / throughput / 60;
        log(`  ${upserted}/${packets.length} uperted | ${throughput.toFixed(2)} p/s | ETA: ${eta.toFixed(1)}m`);
      } else {
        log(`  [DRY-RUN] Would upsert batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} points)`);
        upserted += batch.length;
      }
    }

    log(`\n✅ Complete`);
    log(`  Uperted: ${upserted}/${packets.length}`);
    log(`  Qdrant collection: ${QDRANT_COLLECTION}`);
    log(`  Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}\n`);
  } catch (e) {
    log(`❌ Upsert error: ${e.message}`);
    process.exit(1);
  } finally {
    try { await db.end(); } catch { /* */ }
  }
}

// ── Stats Mode ───────────────────────────────────────────────────────────────

async function showStats() {
  log(`📊 Qdrant Upsert Status`);

  try {
    // Packets with embeddings but no Qdrant point ID
    const embeddedResult = await db.query(`
      SELECT COUNT(*) as count
      FROM atlas_packets
      WHERE embedding IS NOT NULL
    `);
    const embedded = embeddedResult.rows[0].count;

    const uptertResult = await db.query(`
      SELECT COUNT(*) as count
      FROM atlas_packets
      WHERE metadata->>'qdrant_point_id' IS NOT NULL
    `);
    const uperted = uptertResult.rows[0].count;

    const pending = embedded - uperted;
    log(`  Total embedded: ${embedded}`);
    log(`  Uperted to Qdrant: ${uperted}/${embedded} (${(uperted/embedded*100).toFixed(1)}%)`);
    log(`  Pending upsert: ${pending}/${embedded} (${(pending/embedded*100).toFixed(1)}%)\n`);

    // Check Qdrant collection health
    try {
      const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`, {
        signal: AbortSignal.timeout(5_000)
      });
      if (res.ok) {
        const data = await res.json();
        log(`  Qdrant collection: ${QDRANT_COLLECTION}`);
        log(`  Points in collection: ${data.result?.points_count || '?'}`);
        log(`  Vector dimension: ${data.result?.config?.params?.vectors?.size || 768}\n`);
      }
    } catch (e) {
      log(`  Qdrant unavailable: ${e.message}\n`);
    }
  } catch (e) {
    log(`❌ Stats error: ${e.message}`);
    process.exit(1);
  } finally {
    try { await db.end(); } catch { /* */ }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  switch (MODE) {
    case 'apply':
      await upsertPayloads(false);
      break;
    case 'dry-run':
      await upsertPayloads(true);
      break;
    case 'stats':
      await showStats();
      break;
  }
}

main().catch(e => {
  console.error(`\n❌ Fatal: ${e.message}`);
  process.exit(1);
});
