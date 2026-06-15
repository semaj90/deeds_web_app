#!/usr/bin/env node
/**
 * backfill-atlas-source-refs-via-qdrant.mjs
 *
 * Phase 3I: Recover source_ref for atlas_packets whose source_ref is an
 * artifact .tmp/ path. Uses each packet's 768-dim embedding to do a
 * nearest-neighbor search in Qdrant codebase_chunks_768, then pulls
 * file_path from the top hit.
 *
 * Strategy: vector → Qdrant ANN → file_path → canonicalize → update DB
 *
 * Usage:
 *   node scripts/atlas/backfill-atlas-source-refs-via-qdrant.mjs
 *   node scripts/atlas/backfill-atlas-source-refs-via-qdrant.mjs --dry-run
 *   node scripts/atlas/backfill-atlas-source-refs-via-qdrant.mjs --limit=50
 *   node scripts/atlas/backfill-atlas-source-refs-via-qdrant.mjs --min-score=0.92
 */

import pg from 'pg';
import { createHash } from 'node:crypto';
import { normalizeSourceRef } from '../lib/canonical-source-ref.mjs';

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const VECTOR_NAME = 'content';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 0;
const MIN_SCORE_ARG = process.argv.find((a) => a.startsWith('--min-score='));
const MIN_SCORE = MIN_SCORE_ARG ? parseFloat(MIN_SCORE_ARG.split('=')[1]) : 0.90;
const BATCH_SIZE = 20;

function buildPacketKey(sourceRef, packetId) {
  const ref = normalizeSourceRef(sourceRef) || sourceRef || '';
  const hash = createHash('sha256')
    .update(`${ref}:${packetId}`)
    .digest('hex')
    .slice(0, 16);
  return `${ref}:${hash}`;
}

async function qdrantSearch(vector) {
  const body = {
    vector: { name: VECTOR_NAME, vector },
    limit: 3,
    with_payload: true,
    with_vector: false,
    score_threshold: MIN_SCORE,
  };

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant search failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.result ?? [];
}

// Check if Qdrant uses named vectors or flat vector
async function checkVectorFormat() {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json();
  const config = data.result?.config?.params?.vectors;
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    // Named vectors
    if (VECTOR_NAME in config) return 'named';
    const firstKey = Object.keys(config)[0];
    return firstKey ? `named:${firstKey}` : 'flat';
  }
  return 'flat';
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log('\n🔍 Atlas Packets — Source Ref Backfill via Qdrant ANN (Phase 3I)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`  Min score threshold: ${MIN_SCORE}`);
  console.log(`  Qdrant collection:   ${COLLECTION}\n`);

  try {
    // Check vector format
    let vectorFormat = 'flat';
    try {
      const fmt = await checkVectorFormat();
      vectorFormat = fmt;
      console.log(`  Vector format: ${vectorFormat}\n`);
    } catch (e) {
      console.warn(`  ⚠ Could not check Qdrant vector format: ${e.message} — assuming named vectors`);
    }

    // Build the search body based on format
    function buildSearchBody(vector) {
      if (vectorFormat.startsWith('named:')) {
        const name = vectorFormat.slice(6);
        return { vector: { name, vector }, limit: 3, with_payload: true, with_vector: false, score_threshold: MIN_SCORE };
      }
      if (vectorFormat === 'named') {
        return { vector: { name: VECTOR_NAME, vector }, limit: 3, with_payload: true, with_vector: false, score_threshold: MIN_SCORE };
      }
      return { vector, limit: 3, with_payload: true, with_vector: false, score_threshold: MIN_SCORE };
    }

    // Check available columns
    const colRes = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'atlas_packets'
    `);
    const cols = new Set(colRes.rows.map((r) => r.column_name));

    if (!cols.has('packet_key')) {
      console.error('❌ packet_key column missing — run add-atlas-packets-columns.mjs first');
      process.exit(1);
    }

    // Get packets with embedding but artifact source_ref
    let query = `
      SELECT packet_id, source_ref, embedding::text AS embedding_text
      FROM atlas_packets
      WHERE (source_ref LIKE '.tmp/%' OR source_ref LIKE '%parent_atlas_packets%' OR source_ref IS NULL OR source_ref = '')
        AND embedding IS NOT NULL
      ORDER BY packet_id
    `;
    if (LIMIT > 0) query += ` LIMIT ${LIMIT}`;

    const res = await pool.query(query);
    const total = res.rows.length;

    if (total === 0) {
      console.log('  ✅ No artifact source_refs with embeddings found\n');
      return;
    }

    console.log(`  Found ${total} packets to look up in Qdrant${LIMIT > 0 ? ` (limited to ${LIMIT})` : ''}\n`);

    let fixed = 0;
    let noMatch = 0;
    let failed = 0;

    for (let i = 0; i < res.rows.length; i += BATCH_SIZE) {
      const batch = res.rows.slice(i, i + BATCH_SIZE);

      for (const row of batch) {
        // Parse embedding from Postgres vector text format like '[0.1,0.2,...]'
        let embedding;
        try {
          const raw = row.embedding_text;
          embedding = JSON.parse(raw.replace(/^\[/, '[').replace(/\]$/, ']'));
        } catch {
          noMatch++;
          continue;
        }

        if (!Array.isArray(embedding) || embedding.length === 0) {
          noMatch++;
          continue;
        }

        // Search Qdrant
        let hits;
        try {
          const body = buildSearchBody(embedding);
          const qdrantRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(12_000),
          });
          const data = await qdrantRes.json();
          hits = data.result ?? [];
        } catch (e) {
          console.error(`  ⚠ Qdrant search failed for ${row.packet_id}: ${e.message}`);
          failed++;
          continue;
        }

        if (!hits.length) {
          noMatch++;
          continue;
        }

        const top = hits[0];
        const rawPath = top.payload?.file_path || top.payload?.sourceRef || top.payload?.source_ref || top.payload?.path;

        if (!rawPath) {
          noMatch++;
          continue;
        }

        const canonRef = normalizeSourceRef(String(rawPath).split('#')[0]);
        if (!canonRef) {
          noMatch++;
          continue;
        }

        const score = top.score;
        const sourceKind = 'graphify';
        const packetKey = buildPacketKey(canonRef, row.packet_id);

        if (DRY_RUN) {
          console.log(`  [dry] ${row.packet_id.slice(0, 8)}... → ${canonRef} (score=${score.toFixed(3)})`);
          fixed++;
          continue;
        }

        try {
          const sets = [`source_ref = $1`, `source_path = $2`, `source_kind = $3`, `packet_key = $4`];
          const params = [canonRef, rawPath, sourceKind, packetKey];
          if (cols.has('updated_at')) sets.push(`updated_at = now()`);
          await pool.query(
            `UPDATE atlas_packets SET ${sets.join(', ')} WHERE packet_id = $5`,
            [...params, row.packet_id]
          );
          fixed++;
        } catch (e) {
          console.error(`  ⚠ Update failed for ${row.packet_id}: ${e.message}`);
          failed++;
        }
      }

      const done = Math.min(i + BATCH_SIZE, res.rows.length);
      process.stdout.write(`\r  Progress: ${done}/${total} (fixed: ${fixed}, no-match: ${noMatch}, failed: ${failed})`);
    }

    console.log('');
    console.log('\n  Summary:');
    console.log(`    Matched and fixed: ${fixed}`);
    console.log(`    No Qdrant match:   ${noMatch} (score < ${MIN_SCORE} or no file_path in payload)`);
    console.log(`    Failed:            ${failed}`);

    if (noMatch > 0) {
      console.log(`\n  ⚠️  ${noMatch} packets below threshold.`);
      console.log(`     Try --min-score=0.85 to accept more matches (lower precision).`);
    }

    if (!DRY_RUN) {
      console.log('\n  Next: node scripts/atlas/verify-atlas-packets.mjs\n');
    } else {
      console.log('\n  [dry-run] No changes made. Remove --dry-run to apply.\n');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Backfill via Qdrant failed:', err.message);
  process.exit(1);
});
