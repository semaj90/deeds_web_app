#!/usr/bin/env node
/**
 * Phase 1c: Backfill Qdrant Hit Enrichment
 *
 * Purpose: Populate qdrant_hit field with best Qdrant match metadata
 * Strategy:
 *   1. Fetch all canonical packets from Postgres
 *   2. For each packet, search Qdrant by packet_key
 *   3. Extract point_id, distance, content_hash
 *   4. Upsert qdrant_hit JSONB with {point_id, distance, payload_hash, matched_at}
 *   5. Mark enrichment_status.qdrant = true
 *
 * Dependencies:
 *   - atlas_codebase_packets with enrichment columns (Phase 1c migration)
 *   - Qdrant codebase_chunks_768 with packet_key payload
 *
 * Usage:
 *   node scripts/atlas/phase-1c-backfill-qdrant-hit.mjs [--limit 100] [--dry-run] [--apply]
 */

import pg from 'pg';
import http from 'http';
import { config } from 'dotenv';
import { resolve } from 'path';
import crypto from 'crypto';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const limit = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '3251');
const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');

const mode = apply ? 'APPLY' : 'DRY-RUN';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 1c: Backfill Qdrant Hit Enrichment                      ║');
console.log(`║  Mode: ${mode}${' '.repeat(50 - mode.length)}║`);
console.log(`║  Limit: ${limit} packets                                         ║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ── Qdrant API Helper ──────────────────────────────────────────────────────

async function qdrantRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 6333,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Main Backfill Function ─────────────────────────────────────────────────

async function backfillQdrantHit() {
  console.log('📊 Step 1: Fetch canonical packets\n');

  const pgResult = await pgPool.query(`
    SELECT packet_key, source_ref, file_path
    FROM atlas_codebase_packets
    WHERE packet_key IS NOT NULL
    ORDER BY packet_key
    LIMIT $1
  `, [limit]);

  const packets = pgResult.rows;
  console.log(`   ✅ Fetched ${packets.length} canonical packets\n`);

  console.log('🔍 Step 2: Search Qdrant for each packet\n');

  let matchedCount = 0;
  let noMatchCount = 0;
  const updates = [];

  for (let i = 0; i < packets.length; i++) {
    const packet = packets[i];

    // Search Qdrant by packet_key
    const response = await qdrantRequest('POST', '/collections/codebase_chunks_768/points/search', {
      vector: [],
      limit: 1,
      filter: {
        must: [{
          field: 'packet_key',
          match: { value: packet.packet_key }
        }]
      },
      with_payload: true
    });

    const hits = response.data?.result || [];

    if (hits.length > 0) {
      const hit = hits[0];
      const payload = hit.payload || {};

      // Extract hit metadata
      const qdrantHit = {
        point_id: hit.id,
        distance: hit.score || 0,
        payload_hash: crypto
          .createHash('sha256')
          .update(JSON.stringify(payload))
          .digest('hex')
          .slice(0, 12),
        content_hash: payload.content_hash || null,
        matched_at: new Date().toISOString()
      };

      updates.push({
        packet_key: packet.packet_key,
        qdrant_hit: qdrantHit
      });

      matchedCount++;
    } else {
      noMatchCount++;
    }

    if ((i + 1) % 250 === 0) {
      console.log(`   ⏳ Searched ${i + 1}/${packets.length} (Matched: ${matchedCount}, No match: ${noMatchCount})`);
    }
  }

  console.log(`   ✅ Search complete\n`);
  console.log(`      Matched: ${matchedCount}`);
  console.log(`      No match: ${noMatchCount}\n`);

  if (dryRun) {
    console.log('   [DRY-RUN] Would update:');
    for (let i = 0; i < Math.min(5, updates.length); i++) {
      const upd = updates[i];
      console.log(`      ${upd.packet_key}: point_id=${upd.qdrant_hit.point_id}`);
    }
    if (updates.length > 5) {
      console.log(`      ... and ${updates.length - 5} more packets\n`);
    }
    return { success: true, matchedCount, noMatchCount };
  }

  // APPLY: Upsert to Postgres
  console.log('💾 Step 3: Upsert Qdrant hit enrichment to Postgres\n');

  let upsertedCount = 0;

  for (const upd of updates) {
    try {
      await pgPool.query(
        `UPDATE atlas_codebase_packets SET
           qdrant_hit = $1,
           enrichment_status = jsonb_set(enrichment_status, '{qdrant}', 'true'),
           enriched_at = now()
         WHERE packet_key = $2`,
        [JSON.stringify(upd.qdrant_hit), upd.packet_key]
      );

      upsertedCount++;
    } catch (err) {
      console.error(`   ❌ Upsert failed for ${upd.packet_key}:`, err.message);
    }

    if (upsertedCount % 500 === 0) {
      console.log(`   ⏳ Upserted ${upsertedCount}/${updates.length} packets...`);
    }
  }

  console.log(`   ✅ Upserted ${upsertedCount} packets\n`);

  return { success: true, matchedCount, noMatchCount, upsertedCount };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  try {
    const result = await backfillQdrantHit();

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  Qdrant Hit Enrichment Complete ✅                             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (result.success) {
      console.log(`   ✅ Qdrant hit enrichment backfill complete`);
      console.log(`   Matched: ${result.matchedCount}`);
      console.log(`   No match: ${result.noMatchCount}`);
      if (apply) {
        console.log(`   Upserted: ${result.upsertedCount}\n`);
      }
      process.exit(0);
    } else {
      console.log(`   ⚠️  Backfill failed\n`);
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

main();
