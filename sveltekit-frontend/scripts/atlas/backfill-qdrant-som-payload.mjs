#!/usr/bin/env node
/**
 * backfill-qdrant-som-payload.mjs
 *
 * Backfills som_row, som_col, som_cluster into Qdrant payload for
 * codebase_chunks_384_hybrid. Joins atlas_packets by packet_key.
 *
 * Uses Qdrant scroll + setPayload (not overwritePayload) to preserve
 * existing payload fields.
 *
 * Usage:
 *   node scripts/atlas/backfill-qdrant-som-payload.mjs --dry-run
 *   node scripts/atlas/backfill-qdrant-som-payload.mjs --apply
 *   node scripts/atlas/backfill-qdrant-som-payload.mjs --apply --batch-size 500
 */

import pg from 'pg';

const DRY_RUN = !process.argv.includes('--apply');
const BATCH_SIZE = parseInt(
  process.argv.find(a => a.startsWith('--batch-size='))?.split('=')[1] ?? '200'
);
const COLLECTION = process.env.QDRANT_COLLECTION || 'codebase_chunks_384_hybrid';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

const pool = new pg.Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5434'),
  user:     process.env.DB_USER     || 'legal_admin',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME     || 'legal_ai_db',
});

async function qdrantScroll(offset, limit) {
  const body = {
    limit,
    with_payload: ['packet_key', 'source_ref', 'som_row', 'som_col', 'som_cluster'],
    with_vector: false,
  };
  if (offset) body.offset = offset;

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Qdrant scroll HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function qdrantSetPayload(points) {
  // points: [{ id, payload: { som_row, som_col, som_cluster } }]
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload: null, // unused — we use the points array form
      points: null,  // unused — use batch form below
    }),
  });
  // Qdrant batch setPayload uses the /batch endpoint
  void res; // ignore, use batch below
}

async function qdrantBatchSetPayload(updates) {
  // updates: [{ id: qdrant_point_id, payload: {...} }]
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload?wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload: {}, // merged per-point below via points array form
      points: updates.map(u => u.id),
    }),
    signal: AbortSignal.timeout(30_000),
  });

  // Qdrant's POST /payload sets same payload for ALL listed points.
  // For per-point payload, we must call it per update or use the
  // /batch/set approach. Use individual calls batched in parallel.
  void res;
}

async function setPayloadForPoint(pointId, payload) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload?wait=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload,
      points: [pointId],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`setPayload HTTP ${res.status}`);
  return res.json();
}

async function main() {
  console.log(`\n🔄 Qdrant SOM Payload Backfill — ${DRY_RUN ? 'DRY RUN' : 'APPLY'}\n`);
  console.log(`  Collection: ${COLLECTION}`);
  console.log(`  Qdrant:     ${QDRANT_URL}`);
  console.log(`  Batch:      ${BATCH_SIZE}\n`);

  // Load SOM data from Postgres indexed by packet_key
  console.log('[1/3] Loading SOM coordinates from atlas_packets...');
  const pgResult = await pool.query(`
    SELECT packet_key, source_ref, som_row, som_col, som_index,
           (som_row * 20 + som_col) AS som_cluster_computed
    FROM atlas_packets
    WHERE som_row IS NOT NULL AND som_col IS NOT NULL
  `);

  const byPacketKey = new Map();
  const bySourceRef = new Map();
  for (const row of pgResult.rows) {
    if (row.packet_key) byPacketKey.set(row.packet_key, row);
    if (row.source_ref) bySourceRef.set(row.source_ref, row);
  }
  console.log(`  ✓ Loaded ${pgResult.rows.length} packets with SOM coords`);
  console.log(`    by packet_key: ${byPacketKey.size}, by source_ref: ${bySourceRef.size}\n`);

  // Scroll through Qdrant and backfill
  console.log('[2/3] Scrolling Qdrant and backfilling...');
  let scrollOffset = null;
  let totalScanned = 0;
  let totalMatched = 0;
  let totalUpdated = 0;
  let totalAlreadySet = 0;
  let totalNoMatch = 0;
  const SCROLL_LIMIT = 250;

  while (true) {
    const page = await qdrantScroll(scrollOffset, SCROLL_LIMIT);
    const points = page.result?.points ?? [];
    if (points.length === 0) break;

    totalScanned += points.length;
    scrollOffset = page.result?.next_page_offset ?? null;

    const pendingUpdates = [];

    for (const pt of points) {
      const pk  = pt.payload?.packet_key;
      const src = pt.payload?.source_ref;

      // Already has SOM data — skip
      if (pt.payload?.som_row != null && pt.payload?.som_col != null) {
        totalAlreadySet++;
        continue;
      }

      // Look up by packet_key first, then source_ref
      const row = (pk && byPacketKey.get(pk)) || (src && bySourceRef.get(src));
      if (!row) {
        totalNoMatch++;
        continue;
      }

      totalMatched++;
      pendingUpdates.push({
        id: pt.id,
        payload: {
          som_row:     row.som_row,
          som_col:     row.som_col,
          som_cluster: row.som_cluster_computed ?? row.som_index ?? (row.som_row * 20 + row.som_col),
        },
      });
    }

    if (!DRY_RUN && pendingUpdates.length > 0) {
      // Issue in parallel batches of BATCH_SIZE
      for (let i = 0; i < pendingUpdates.length; i += BATCH_SIZE) {
        const batch = pendingUpdates.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(u => setPayloadForPoint(u.id, u.payload)));
        totalUpdated += batch.length;
      }
    } else {
      totalUpdated += pendingUpdates.length;
    }

    process.stdout.write(`\r  Scanned ${totalScanned} | Matched ${totalMatched} | Updated ${totalUpdated} | NoMatch ${totalNoMatch} | AlreadySet ${totalAlreadySet}`);

    if (!scrollOffset) break;
  }

  console.log(`\n\n[3/3] Summary:`);
  console.log(`  Total scanned:    ${totalScanned}`);
  console.log(`  Already had SOM:  ${totalAlreadySet}`);
  console.log(`  Matched & updated:${totalUpdated}`);
  console.log(`  No match:         ${totalNoMatch}`);
  console.log(`  Match rate:       ${totalScanned > 0 ? ((totalMatched / totalScanned) * 100).toFixed(1) : 0}%\n`);

  if (DRY_RUN) {
    console.log('  ℹ️  DRY RUN — no writes made. Re-run with --apply to apply.\n');
  } else {
    console.log('  ✅ Done — SOM payload backfill complete.\n');
  }

  await pool.end();
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
