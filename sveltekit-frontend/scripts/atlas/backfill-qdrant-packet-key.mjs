#!/usr/bin/env node
/**
 * Backfill packet_key into Qdrant codebase_chunks_384_hybrid payloads.
 *
 * Joins codebase_chunk_index → atlas_packets on source_ref to resolve packet_key.
 * Groups by packet_key so all chunks sharing the same packet get one Qdrant call.
 *
 * Usage:
 *   node scripts/atlas/backfill-qdrant-packet-key.mjs --dry-run
 *   node scripts/atlas/backfill-qdrant-packet-key.mjs --apply
 */

import pg from 'pg';

const DRY_RUN    = process.argv.includes('--dry-run');
const APPLY      = process.argv.includes('--apply');
const COLLECTION = 'codebase_chunks_384_hybrid';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const BATCH      = 2000;

if (!DRY_RUN && !APPLY) {
  console.error('Pass --dry-run or --apply');
  process.exit(1);
}

const pool = new pg.Pool({
  host:     process.env.PG_HOST     ?? 'localhost',
  port:     parseInt(process.env.PG_PORT ?? '5434'),
  user:     process.env.PG_USER     ?? 'legal_admin',
  password: process.env.PG_PASSWORD ?? '123456',
  database: process.env.PG_DATABASE ?? 'legal_ai_db',
  max: 4,
});

console.log('=== Backfill Qdrant packet_key Payload ===');
console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
console.log('');

const client = await pool.connect();
try {
  // Join chunk → packet on source_ref; fall back to chunk.id::text as packet_key when no packet exists
  const { rows } = await client.query(`
    SELECT
      cci.id::text              AS chunk_id,
      cci.source_ref,
      COALESCE(ap.packet_key, 'chunk:' || cci.id::text) AS packet_key,
      ap.domain_class
    FROM codebase_chunk_index cci
    LEFT JOIN atlas_packets ap ON ap.source_ref = cci.source_ref
    WHERE cci.content_embedding IS NOT NULL
    ORDER BY packet_key
  `);
  console.log(`Loaded ${rows.length.toLocaleString()} chunk → packet_key mappings`);

  // Group by packet_key → set same payload on all chunks of that packet
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.packet_key)) {
      groups.set(row.packet_key, {
        payload: {
          packet_key:   row.packet_key,
          domain_class: row.domain_class ?? null,
        },
        points: [],
      });
    }
    groups.get(row.packet_key).points.push(row.chunk_id);
  }
  console.log(`Unique packet_key groups: ${groups.size.toLocaleString()}`);

  const withPacket  = [...groups.values()].filter(g => !g.payload.packet_key.startsWith('chunk:')).length;
  const withoutPacket = groups.size - withPacket;
  console.log(`  Linked to atlas_packets: ${withPacket.toLocaleString()}`);
  console.log(`  Fallback (chunk:id):     ${withoutPacket.toLocaleString()}`);
  console.log('');

  if (DRY_RUN) {
    let i = 0;
    for (const [key, { payload, points }] of groups) {
      if (i++ >= 5) break;
      console.log(`  "${key}" → ${points.length} points  domain=${payload.domain_class ?? 'null'}`);
    }
    console.log(`\nDRY-RUN: would send ${groups.size.toLocaleString()} Qdrant set-payload requests`);
    process.exit(0);
  }

  // Apply — one request per packet_key group, sub-batched for large groups
  let updated = 0, errors = 0, groupIdx = 0;
  for (const { payload: groupPayload, points } of groups.values()) {
    groupIdx++;
    for (let start = 0; start < points.length; start += BATCH) {
      const slice = points.slice(start, start + BATCH);
      try {
        const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload: groupPayload, points: slice }),
        });
        if (res.ok) updated += slice.length;
        else {
          const body = await res.text();
          console.error(`  group ${groupPayload.packet_key} err: ${body}`);
          errors += slice.length;
        }
      } catch (err) {
        console.error(`  fetch err: ${err.message}`);
        errors += slice.length;
      }
    }
    if (groupIdx % 1000 === 0 || groupIdx === groups.size) {
      console.log(`Groups: ${groupIdx}/${groups.size}  updated=${updated.toLocaleString()}  errors=${errors}`);
    }
  }

  console.log('');
  console.log('─────────────────────────────────────────');
  console.log('packet_key backfill complete');
  console.log(`  Groups    : ${groups.size.toLocaleString()}`);
  console.log(`  Updated   : ${updated.toLocaleString()}`);
  console.log(`  Errors    : ${errors}`);
  console.log('─────────────────────────────────────────');
} finally {
  client.release();
  await pool.end();
}
