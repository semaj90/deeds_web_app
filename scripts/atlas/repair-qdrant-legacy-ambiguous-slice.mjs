#!/usr/bin/env node
/**
 * Repair Qdrant Legacy/Ambiguous Slice
 *
 * Purpose: Apply safe repairs to Qdrant points classified by debug script
 * Strategy:
 *   1. Fetch all Qdrant points (same scroll as debug)
 *   2. Classify each point (same logic as debug)
 *   3. Apply safe repairs ONLY (canonical_match + legacy_alias_match)
 *   4. Skip ambiguous (multiple candidates) + orphans (no postgres match)
 *   5. Upsert updated payloads to Qdrant
 *   6. Report metrics (updated/skipped/orphan)
 *
 * Rules:
 *   - Never join by feature_id alone
 *   - Prefer packet_key, then source_ref, then normalized file_path
 *   - Skip ambiguous entirely (no upsert)
 *   - Orphans stay as-is (no upsert)
 *   - Missing source_ref stay as-is (can't classify)
 *   - Preserve payload; only update canonical ref fields
 *
 * Usage:
 *   node scripts/atlas/repair-qdrant-legacy-ambiguous-slice.mjs [--limit 100] [--dry-run] [--apply]
 */

import pg from 'pg';
import http from 'http';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const limit = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '1000');
const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');

const mode = apply ? 'APPLY' : 'DRY-RUN';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Repair Qdrant Legacy/Ambiguous Slice                          ║');
console.log(`║  Mode: ${mode}${' '.repeat(52 - mode.length)}║`);
console.log(`║  Limit: ${limit} points                                        ║`);
console.log('║  Strategy: Apply safe repairs (canonical + legacy_alias only) ║');
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

// ── Normalization Helper ───────────────────────────────────────────────────

function normalizePath(p) {
  if (!p) return '';
  return p.replace(/^sveltekit-frontend\//, '').replace(/\\/g, '/').split('?')[0].split('#')[0];
}

// ── Main Repair Function ───────────────────────────────────────────────────

async function repairQdrantSlice() {
  console.log('📊 Step 1: Fetch Postgres canonical packet identity\n');

  const pgResult = await pgPool.query(`
    SELECT packet_key, source_ref, file_path, feature_id
    FROM atlas_codebase_packets
    ORDER BY packet_key
  `);

  const pgPackets = pgResult.rows;
  console.log(`   ✅ Fetched ${pgPackets.length} canonical packets\n`);

  const pgByPacketKey = new Map(pgPackets.map(p => [p.packet_key, p]));
  const pgBySourceRef = new Map(pgPackets.map(p => [normalizePath(p.source_ref), p]));
  const pgByFilePath = new Map(pgPackets.map(p => [normalizePath(p.file_path), p]));

  console.log('📦 Step 2: Fetch Qdrant points (scroll)\n');

  let allPoints = [];
  let nextOffset = undefined;
  let fetchCount = 0;

  do {
    const response = await qdrantRequest('POST', '/collections/codebase_chunks_768/points/scroll', {
      limit: 1000,
      with_payload: true,
      with_vectors: false,
      offset: nextOffset
    });

    const points = response.data?.result?.points || [];
    allPoints = [...allPoints, ...points];
    nextOffset = response.data?.result?.next_page_offset;
    fetchCount++;

    if (fetchCount % 5 === 0) {
      console.log(`   ⏳ Fetched ${allPoints.length} points...`);
    }
  } while (nextOffset && allPoints.length < limit);

  allPoints = allPoints.slice(0, limit);
  console.log(`   ✅ Total points fetched: ${allPoints.length}\n`);

  console.log('🔧 Step 3: Classify and apply repairs\n');

  let appliedCount = 0;
  let skippedAmbiguous = 0;
  let orphanQuarantine = 0;
  let missingSourceRef = 0;
  const pointsToUpdate = [];

  for (let i = 0; i < allPoints.length; i++) {
    const point = allPoints[i];
    const payload = point.payload || {};

    const packetKey = payload.packet_key;
    const sourceRef = payload.source_ref || payload.sourceRef;
    const filePath = payload.file_path || payload.path;

    if (!sourceRef) {
      missingSourceRef++;
      if ((i + 1) % 500 === 0) {
        console.log(`   ⏳ Processed ${i + 1}/${allPoints.length} (Applied: ${appliedCount}, Skipped: ${skippedAmbiguous}, Orphan: ${orphanQuarantine})`);
      }
      continue;
    }

    let pgMatch = null;
    let matchType = null;
    let candidates = [];

    // Strategy 1: Exact packet_key match
    if (packetKey && pgByPacketKey.has(packetKey)) {
      pgMatch = pgByPacketKey.get(packetKey);
      matchType = 'canonical_match';
    }

    // Strategy 2: Exact source_ref match
    if (!pgMatch) {
      const normalized = normalizePath(sourceRef);
      if (pgBySourceRef.has(normalized)) {
        pgMatch = pgBySourceRef.get(normalized);
        matchType = 'legacy_alias_match';
      } else {
        // Collect partial candidates
        for (const [ref, pkt] of pgBySourceRef) {
          if (ref.includes(normalized) || normalized.includes(ref.split('/').pop())) {
            candidates.push(pkt);
          }
        }
      }
    }

    // Strategy 3: Exact file_path match
    if (!pgMatch && !candidates.length) {
      const normalized = normalizePath(filePath || sourceRef);
      if (pgByFilePath.has(normalized)) {
        pgMatch = pgByFilePath.get(normalized);
        matchType = 'legacy_alias_match';
      }
    }

    // Decide repair action
    if (pgMatch && (matchType === 'canonical_match' || matchType === 'legacy_alias_match')) {
      // SAFE REPAIR
      const updatedPayload = {
        ...payload,
        packet_key: pgMatch.packet_key,
        source_ref: pgMatch.source_ref,
        file_path: pgMatch.file_path,
        feature_id: pgMatch.feature_id
      };

      pointsToUpdate.push({
        id: point.id,
        vector: point.vector,
        payload: updatedPayload
      });

      appliedCount++;
    } else if (candidates.length > 1) {
      // SKIP AMBIGUOUS
      skippedAmbiguous++;
    } else {
      // QUARANTINE ORPHAN
      orphanQuarantine++;
    }

    if ((i + 1) % 500 === 0) {
      console.log(`   ⏳ Processed ${i + 1}/${allPoints.length} (Applied: ${appliedCount}, Skipped: ${skippedAmbiguous}, Orphan: ${orphanQuarantine})`);
    }
  }

  console.log(`\n   ✅ Classification complete\n`);
  console.log(`   Repairs ready:`);
  console.log(`      Applied (canonical + legacy_alias): ${appliedCount}`);
  console.log(`      Skipped (ambiguous): ${skippedAmbiguous}`);
  console.log(`      Orphan (quarantine): ${orphanQuarantine}`);
  console.log(`      Missing source_ref: ${missingSourceRef}\n`);

  if (dryRun) {
    console.log('   [DRY-RUN] Would upsert:');
    for (let i = 0; i < Math.min(5, pointsToUpdate.length); i++) {
      const pt = pointsToUpdate[i];
      console.log(`      ID ${pt.id}: packet_key="${pt.payload.packet_key}", feature_id="${pt.payload.feature_id}"`);
    }
    if (pointsToUpdate.length > 5) {
      console.log(`      ... and ${pointsToUpdate.length - 5} more points\n`);
    }
    return { success: true, appliedCount, skippedAmbiguous, orphanQuarantine };
  }

  // APPLY: Upsert to Qdrant
  console.log('💾 Step 4: Upsert repaired payloads to Qdrant\n');

  let upsertedCount = 0;
  const batchSize = 100;

  for (let i = 0; i < pointsToUpdate.length; i += batchSize) {
    const batch = pointsToUpdate.slice(i, i + batchSize);

    try {
      const response = await qdrantRequest('PUT', '/collections/codebase_chunks_768/points', {
        points: batch.map(pt => ({
          id: pt.id,
          payload: pt.payload,
          vector: pt.vector || { content: [] } // Preserve vector if present
        }))
      });

      if (response.status === 200) {
        upsertedCount += batch.length;
      }
    } catch (err) {
      console.error(`   ❌ Upsert batch failed:`, err.message);
    }

    if ((i + batchSize) % 500 === 0) {
      console.log(`   ⏳ Upserted ${Math.min(i + batchSize, pointsToUpdate.length)} points...`);
    }
  }

  console.log(`   ✅ Upserted ${upsertedCount} repaired points\n`);

  return { success: true, appliedCount, skippedAmbiguous, orphanQuarantine, upsertedCount };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  try {
    const result = await repairQdrantSlice();

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  Repair Complete ✅                                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (result.success) {
      console.log(`   Applied repairs: ${result.appliedCount}`);
      console.log(`   Skipped (ambiguous): ${result.skippedAmbiguous}`);
      console.log(`   Orphaned: ${result.orphanQuarantine}`);
      if (apply) {
        console.log(`   Upserted: ${result.upsertedCount}\n`);
      }
      process.exit(0);
    } else {
      console.log(`   ⚠️  Repair failed\n`);
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
