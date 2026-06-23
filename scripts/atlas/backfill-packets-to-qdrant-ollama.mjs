#!/usr/bin/env node
/**
 * P2.a-2: Backfill Missing Packets to Qdrant (via direct Ollama)
 *
 * Same as backfill-packets-to-qdrant.mjs but calls Ollama directly
 * instead of requiring SvelteKit /api/embed endpoint.
 *
 * Usage:
 *   node scripts/atlas/backfill-packets-to-qdrant-ollama.mjs --dry-run --limit 10
 *   node scripts/atlas/backfill-packets-to-qdrant-ollama.mjs --apply --limit 100 --batch 25
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
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
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
console.log('║  P2.a-2: Backfill Packets to Qdrant (via Ollama direct)       ║');
console.log(`║  Mode: ${mode.padEnd(54)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');
console.log(`Ollama URL: ${OLLAMA_URL}`);
console.log(`Qdrant URL: ${QDRANT_URL}\n`);

// Helpers
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
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: text
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Ollama API ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.embedding) || data.embedding.length !== 768) {
      throw new Error(`Invalid embedding shape: ${data.embedding?.length ?? 'null'}`);
    }
    return data.embedding;
  } catch (e) {
    console.error(`  Embed failed for text (${text.length} chars): ${e.message}`);
    throw e;
  }
}

async function getPacketContent(packet) {
  if (packet.payload?.content && typeof packet.payload.content === 'string') {
    return packet.payload.content;
  }
  if (packet.summary) {
    return packet.summary;
  }
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
  console.log(`   Found ${rows.length} packets to backfill\n`);

  if (DRY_RUN) {
    console.log('   DRY-RUN preview (first 3 rows):\n');
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
    console.log('   VERIFY mode\n');
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

          const pointId = row.packet_id;

          const payload = {
            packet_key: row.packet_key,
            source_ref: row.source_ref,
            feature_id: row.feature_id,
            feature_label: row.feature_label,
            directory_path: row.directory_path,
            som_cluster: row.som_row && row.som_col ? `${row.som_row}_${row.som_col}` : null,
          };

          await upsertToQdrant(pointId, embedding, payload);

          await client.query(
            `UPDATE atlas_packets SET qdrant_point_id = $1, qdrant_collection = $2 WHERE packet_id = $3`,
            [pointId, COLLECTION_NAME, row.packet_id]
          );

          return { packet_key: row.packet_key, status: 'success' };
        } catch (e) {
          return { packet_key: row.packet_key, status: 'error', error: e.message };
        }
      })
    );

    for (const result of batchResults) {
      processed++;
      if (result.status === 'fulfilled') {
        if (result.value.status === 'success') {
          succeeded++;
          console.log(`   ✓ ${result.value.packet_key}`);
        } else {
          failed++;
          console.log(`   ✗ ${result.value.packet_key}: ${result.value.error}`);
        }
      } else {
        failed++;
        console.error(`   ✗ Promise rejected: ${result.reason}`);
      }
    }

    const pct = ((i + batch.length) / rows.length * 100).toFixed(1);
    console.log(`\n   Progress: ${i + batch.length}/${rows.length} (${pct}%)\n`);
  }

  console.log('📋 Summary\n');
  console.log(`   Processed: ${processed}`);
  console.log(`   Succeeded: ${succeeded}`);
  console.log(`   Failed:    ${failed}`);

  return { processed, succeeded, failed };
}

// Main
(async () => {
  try {
    const result = await backfill(pool);
    await pool.end();
    console.log('\nBackfill complete\n');
    process.exit(result.failed === 0 ? 0 : 1);
  } catch (e) {
    console.error('Backfill failed:', e.message);
    await pool.end();
    process.exit(1);
  }
})();
