#!/usr/bin/env node
/**
 * P1a: Backfill Missing Packets to Qdrant
 *
 * Closes the gap where packets exist in Postgres atlas_packets but not in Qdrant
 * codebase_chunks_768 collection. For each packet with qdrant_point_id = NULL:
 *   1. Get content from packet.payload or summarize from source_ref
 *   2. Embed via /api/embed (Ollama embeddinggemma)
 *   3. Upsert to Qdrant with payload: packet_key, source_ref, feature_id, directory_path, som_cluster
 *   4. Update Postgres qdrant_point_id with returned point ID
 *
 * Usage:
 *   node scripts/atlas/backfill-packets-to-qdrant.mjs --dry-run --limit 10
 *   node scripts/atlas/backfill-packets-to-qdrant.mjs --apply --limit 100 --batch 25
 *   node scripts/atlas/backfill-packets-to-qdrant.mjs --verify
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const EMBED_URL = process.env.EMBED_URL || 'http://127.0.0.1:5173/api/embed';
const COLLECTION_NAME = 'codebase_chunks_768';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const VERIFY = args.includes('--verify');
const DRY_RUN = !APPLY && !VERIFY;

function getArg(name, fallback) {
  const eq = args.find(a => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) return args[idx + 1];
  return fallback;
}

const LIMIT = parseInt(getArg('limit', '999999'), 10);
const BATCH = parseInt(getArg('batch', '25'), 10);
const mode = APPLY ? 'APPLY' : DRY_RUN ? 'DRY-RUN' : 'VERIFY';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  P1a: Backfill Missing Packets to Qdrant (qdrant_point_id)    ║');
console.log(`║  Mode: ${mode.padEnd(54)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ── Helpers ───────────────────────────────────────────────────────────────────
async function qdrantPost(path, body) {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Qdrant ${res.status} on ${path}:`, text.slice(0, 200));
    throw new Error(`Qdrant POST failed: ${res.status}`);
  }
  return JSON.parse(text);
}

async function embedText(text) {
  try {
    const res = await fetch(EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model: 'embeddinggemma:latest' }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Embed API ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.embedding) || data.embedding.length !== 768) {
      throw new Error(`Invalid embedding shape: ${data.embedding?.length ?? 'null'}`);
    }
    return data.embedding;
  } catch (e) {
    console.error(`  ⚠️  Embed failed for text (${text.length} chars): ${e.message}`);
    throw e;
  }
}

async function getPacketContent(packet) {
  // Try payload.content first, then summary, then source_ref as fallback
  if (packet.payload?.content && typeof packet.payload.content === 'string') {
    return packet.payload.content;
  }
  if (packet.summary) {
    return packet.summary;
  }
  // Fallback: use source_ref as minimal content
  return `Source: ${packet.source_ref}`;
}

async function upsertToQdrant(pointId, vector, payload) {
  await qdrantPost(`/collections/${COLLECTION_NAME}/points`, {
    points: [
      {
        id: pointId,
        vector,
        payload,
      },
    ],
  });
}

async function backfill(client) {
  console.log('📊 Step 1: Load packets with NULL qdrant_point_id\n');

  const result = await client.query(`
    SELECT
      packet_id,
      packet_key,
      source_ref,
      directory_path,
      feature_id,
      feature_label,
      som_row,
      som_col,
      payload,
      summary
    FROM atlas_packets
    WHERE qdrant_point_id IS NULL
    ORDER BY created_at DESC
    LIMIT $1
  `, [LIMIT]);

  const rows = result.rows;
  console.log(`   ✅ Found ${rows.length} packets to backfill\n`);

  if (DRY_RUN) {
    console.log('   DRY-RUN — preview (first 3 rows):\n');
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      const r = rows[i];
      console.log(`   [${i}] ${r.packet_key}`);
      console.log(`       source_ref: ${r.source_ref}`);
      console.log(`       feature_id: ${r.feature_id}`);
      console.log(`       som: (${r.som_row}, ${r.som_col})`);
    }
    console.log('\n   (Run with --apply to proceed)\n');
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  if (VERIFY) {
    console.log('   VERIFY — checking current state\n');
    const verified = await client.query(`
      SELECT COUNT(*) as total, COUNT(qdrant_point_id) as with_id
      FROM atlas_packets
    `);
    console.log(`   Packets with qdrant_point_id: ${verified.rows[0].with_id}/${verified.rows[0].total}\n`);
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  // APPLY mode
  console.log(`📈 Step 2: Embed and upsert to Qdrant (batch size: ${BATCH})\n`);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const batchResults = await Promise.allSettled(
      batch.map(async (row) => {
        try {
          const content = await getPacketContent(row);
          const embedding = await embedText(content);

          // Generate a deterministic point ID from packet_id (Qdrant expects integer or string)
          const pointId = row.packet_id;

          // Build Qdrant payload
          const payload = {
            packet_key: row.packet_key,
            source_ref: row.source_ref,
            feature_id: row.feature_id,
            feature_label: row.feature_label,
            directory_path: row.directory_path,
            som_cluster: row.som_row && row.som_col ? `${row.som_row}_${row.som_col}` : null,
          };

          await upsertToQdrant(pointId, embedding, payload);

          // Update Postgres with the point ID
          await client.query(
            `UPDATE atlas_packets SET qdrant_point_id = $1, qdrant_collection = $2 WHERE packet_id = $3`,
            [pointId, COLLECTION_NAME, row.packet_id]
          );

          return { packet_key: row.packet_key, status: 'success' };
        } catch (e) {
          console.error(`    ❌ Failed to backfill ${row.packet_key}: ${e.message}`);
          return { packet_key: row.packet_key, status: 'error', error: e.message };
        }
      })
    );

    for (const result of batchResults) {
      processed++;
      if (result.status === 'fulfilled') {
        if (result.value.status === 'success') {
          succeeded++;
        } else {
          failed++;
        }
      } else {
        failed++;
        console.error(`    ❌ Promise rejection: ${result.reason.message}`);
      }
    }

    const pct = Math.round((processed / rows.length) * 100);
    console.log(`   [${pct}%] Processed ${processed}/${rows.length}, succeeded: ${succeeded}, failed: ${failed}`);
  }

  console.log('\n✅ Backfill complete\n');
  return { processed, succeeded, failed };
}

async function verify(client) {
  console.log('📊 Verification Report\n');

  const counts = await client.query(`
    SELECT
      COUNT(*) as total,
      COUNT(qdrant_point_id) as with_id,
      COUNT(CASE WHEN retrieval_lanes IS NOT NULL THEN 1 END) as with_lanes
    FROM atlas_packets
  `);

  const row = counts.rows[0];
  console.log(`   Total packets: ${row.total}`);
  console.log(`   With qdrant_point_id: ${row.with_id} (${Math.round((row.with_id / row.total) * 100)}%)`);
  console.log(`   With retrieval_lanes: ${row.with_lanes}`);
  console.log();
}

async function main() {
  try {
    const result = await backfill(pool);
    if (APPLY && result.succeeded > 0) {
      await verify(pool);
    }
    console.log(`Summary: processed=${result.processed}, succeeded=${result.succeeded}, failed=${result.failed}\n`);
    process.exit(result.failed > 0 ? 1 : 0);
  } catch (e) {
    console.error('\n❌ Fatal error:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
