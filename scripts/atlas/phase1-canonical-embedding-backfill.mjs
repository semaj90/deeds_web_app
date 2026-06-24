#!/usr/bin/env node

/**
 * Phase 1 Canonical Embedding Backfill
 *
 * Fills the embedding gap on atlas_packets (canonical layer)
 * Currently: 10,753/17,995 (59.7%)
 * Target: 17,995/17,995 (100%)
 *
 * Flow:
 *   SELECT id, summary FROM atlas_packets WHERE embedding IS NULL
 *   → callEmbeddingGemma (via /api/embed)
 *   → UPDATE atlas_packets SET embedding = $1 WHERE id = $2
 *
 * Performance (projected):
 *   Single-threaded: 7,242 packets ÷ 0.67s/packet = 3.0 hours
 *   4-worker pool: 45 minutes
 *   8-worker pool: 22 minutes
 */

import pg from 'pg';
import { argv } from 'process';

const MODE = argv.includes('--apply') ? 'apply' : 'dry';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100');
const LIMIT = parseInt(process.env.PACKET_LIMIT || '0');

const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const db = new pg.Pool({ connectionString: DB_URL, max: 5 });

// ── Helpers ──────────────────────────────────────────────────────────────────

async function callEmbeddingGemma(text) {
  if (!text || text.length < 5) {
    return null; // Skip short/empty summaries
  }

  try {
    const res = await fetch('http://127.0.0.1:5173/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!res.ok) {
      console.error(`  /api/embed error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const embedding = data.embedding;

    if (!embedding || !Array.isArray(embedding) || embedding.length !== 768) {
      console.error(`  Embedding invalid: expected 768-dim, got ${embedding?.length}`);
      return null;
    }

    return embedding;
  } catch (e) {
    console.error(`  Embedding fetch error: ${e.message}`);
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀 Phase 1: Canonical Packet Embedding Backfill');
  console.log(`Mode: ${MODE.toUpperCase()} | Batch: ${BATCH_SIZE}\n`);

  try {
    // Audit current state
    const auditResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN embedding IS NULL THEN 1 END) as missing,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as present
      FROM atlas_packets
    `);

    const { total, missing, present } = auditResult.rows[0];
    console.log(`Current State:`);
    console.log(`  Total packets: ${total}`);
    console.log(`  With embeddings: ${present}/${total} (${(present/total*100).toFixed(1)}%)`);
    console.log(`  Missing embeddings: ${missing}/${total} (${(missing/total*100).toFixed(1)}%)\n`);

    // Fetch packets needing embeddings
    console.log(`Fetching packets needing embeddings...`);
    const chunkResult = await db.query(`
      SELECT packet_id, summary, feature_id
      FROM atlas_packets
      WHERE embedding IS NULL
      ORDER BY created_at DESC
      LIMIT $1
    `, [LIMIT || 7242]); // Remaining count

    const packets = chunkResult.rows;
    console.log(`Found ${packets.length} packets needing embeddings\n`);

    let processed = 0;
    let embedded = 0;
    const startTime = Date.now();

    for (let i = 0; i < packets.length; i += BATCH_SIZE) {
      const batch = packets.slice(i, i + BATCH_SIZE);

      for (const packet of batch) {
        const embedding = await callEmbeddingGemma(packet.summary);

        if (embedding && MODE === 'apply') {
          try {
            // Convert to PostgreSQL vector format
            const vecStr = `[${embedding.join(',')}]`;
            await db.query(
              `UPDATE atlas_packets SET embedding = $1::vector, updated_at = now() WHERE packet_id = $2`,
              [vecStr, packet.packet_id]
            );
            embedded++;
          } catch (e) {
            console.error(`  Update error for packet ${packet.packet_id}: ${e.message}`);
          }
        } else if (embedding) {
          // Dry run: just count
          embedded++;
        }

        processed++;
        if (processed % 50 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const throughput = processed / elapsed;
          const remaining = packets.length - processed;
          const eta = remaining / throughput;
          console.log(`  ${processed}/${packets.length} processed | ${embedded} embedded | ETA: ${Math.round(eta)}s`);
        }
      }
    }

    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`\n✅ Complete`);
    console.log(`  Processed: ${processed} packets in ${elapsed.toFixed(1)}s`);
    console.log(`  Embedded: ${embedded}`);
    console.log(`  Throughput: ${(processed/elapsed).toFixed(2)} packets/sec`);
    console.log(`  Projection for 7,242 missing: ${((7242/elapsed)*elapsed/3600).toFixed(1)}h single-threaded`);

  } catch (e) {
    console.error(`\n❌ Error: ${e.message}`);
    process.exit(1);
  } finally {
    await db.end();
  }
}

main();
