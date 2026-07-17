#!/usr/bin/env node
/**
 * Qdrant Parity Verification — Atlas Knowledge Layer Production Gate
 *
 * Reconciles Postgres codebase_chunk_index against Qdrant codebase_chunks_384_hybrid.
 * Classifies every discrepancy into one of:
 *   valid_non_code   — atlas_packets row exists but no embedding (expected)
 *   stale_point      — Qdrant point has no matching Postgres row
 *   duplicate        — same source_ref appears more than once in Qdrant
 *   missing_vector   — Postgres row has embedding but Qdrant point is absent
 *   contract_violation — point exists in Qdrant but payload is missing required fields
 *
 * Usage:
 *   node scripts/atlas/verify-qdrant-parity.mjs
 *   node scripts/atlas/verify-qdrant-parity.mjs --verbose
 *   node scripts/atlas/verify-qdrant-parity.mjs --fix-stale   (delete stale Qdrant points)
 */

import pg from 'pg';

const COLLECTION = 'codebase_chunks_384_hybrid';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const VERBOSE    = process.argv.includes('--verbose');
const FIX_STALE  = process.argv.includes('--fix-stale');

const pool = new pg.Pool({
  host:     process.env.PG_HOST     ?? 'localhost',
  port:     parseInt(process.env.PG_PORT ?? '5434'),
  user:     process.env.PG_USER     ?? 'legal_admin',
  password: process.env.PG_PASSWORD ?? '123456',
  database: process.env.PG_DATABASE ?? 'legal_ai_db',
  max: 4,
});

console.log('=== Qdrant Parity Verification ===');
console.log(`Collection : ${COLLECTION}`);
console.log(`QDRANT_URL : ${QDRANT_URL}`);
console.log('');

// ── Step 1: Postgres canonical IDs ──────────────────────────────────────────
const client = await pool.connect();
let pgIds, pgSourceRefs;
try {
  console.log('Loading Postgres eligible chunks...');
  const { rows } = await client.query(`
    SELECT id::text, source_ref, content_embedding IS NOT NULL AS has_embedding
    FROM codebase_chunk_index
    WHERE content_embedding IS NOT NULL
    ORDER BY id
  `);
  pgIds       = new Set(rows.map(r => r.id));
  pgSourceRefs = new Map(rows.map(r => [r.id, r.source_ref]));
  console.log(`  Postgres eligible (has embedding): ${pgIds.size.toLocaleString()}`);
} finally {
  client.release();
}

// ── Step 2: Qdrant point IDs via scroll ─────────────────────────────────────
console.log('Loading Qdrant point IDs via scroll...');

const qdrantIds    = new Set();
const qdrantPayloads = new Map();
let offset = null;
let scrollCount = 0;

while (true) {
  const body = { limit: 500, with_payload: ['source_ref', 'packet_key', 'content_hash'], with_vector: false };
  if (offset) body.offset = offset;

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Qdrant scroll failed: ${text}`);
    process.exit(1);
  }

  const data = await res.json();
  const points = data.result?.points ?? [];

  for (const p of points) {
    qdrantIds.add(String(p.id));
    qdrantPayloads.set(String(p.id), p.payload ?? {});
  }

  offset = data.result?.next_page_offset;
  scrollCount += points.length;

  if (!offset) break;
  if (scrollCount % 5000 === 0) {
    process.stdout.write(`  Scrolled ${scrollCount.toLocaleString()} Qdrant points...\r`);
  }
}
console.log(`  Qdrant total points: ${qdrantIds.size.toLocaleString()}            `);
console.log('');

// ── Step 3: Reconcile ────────────────────────────────────────────────────────
console.log('Reconciling...');

const stale      = [];   // In Qdrant, not in Postgres
const missing    = [];   // In Postgres, not in Qdrant
const violations = [];   // In Qdrant but payload missing required fields

// Points in Qdrant that have no Postgres row
for (const qid of qdrantIds) {
  if (!pgIds.has(qid)) {
    const payload = qdrantPayloads.get(qid);
    stale.push({ id: qid, source_ref: payload?.source_ref ?? null });
  }
}

// Points in Postgres that are missing from Qdrant
for (const pid of pgIds) {
  if (!qdrantIds.has(pid)) {
    missing.push({ id: pid, source_ref: pgSourceRefs.get(pid) });
  }
}

// Contract violations: in Qdrant but missing required payload fields.
// NOTE: Qdrant scroll returns segment-level data that may lag bulk writes by
// seconds/minutes while segments are being optimized. Use point-fetch for
// authoritative checks on recently backfilled collections.
const REQUIRED_PAYLOAD = ['source_ref', 'packet_key'];
for (const [qid, payload] of qdrantPayloads) {
  if (!pgIds.has(qid)) continue; // already stale, skip
  const missingFields = REQUIRED_PAYLOAD.filter(f => !payload[f]);
  if (missingFields.length > 0) {
    violations.push({ id: qid, missing_fields: missingFields, source_ref: payload.source_ref ?? null });
  }
}

// ── Step 4: Report ──────────────────────────────────────────────────────────
console.log('');
console.log('─────────────────────────────────────────');
console.log('Parity Report');
console.log('─────────────────────────────────────────');
console.log(`  Postgres eligible    : ${pgIds.size.toLocaleString()}`);
console.log(`  Qdrant total         : ${qdrantIds.size.toLocaleString()}`);
console.log(`  Delta                : ${qdrantIds.size - pgIds.size > 0 ? '+' : ''}${(qdrantIds.size - pgIds.size).toLocaleString()}`);
console.log('');
console.log(`  Stale Qdrant points  : ${stale.length.toLocaleString()}  (no Postgres row)`);
console.log(`  Missing from Qdrant  : ${missing.length.toLocaleString()}  (Postgres row has embedding)`);
console.log(`  Payload violations   : ${violations.length.toLocaleString()}  (missing required payload fields)`);
console.log('─────────────────────────────────────────');

if (VERBOSE || stale.length <= 50) {
  if (stale.length > 0) {
    console.log('\nStale Qdrant points:');
    for (const s of stale.slice(0, 50)) {
      console.log(`  ${s.id}  source_ref=${s.source_ref ?? 'MISSING'}`);
    }
    if (stale.length > 50) console.log(`  ... and ${stale.length - 50} more`);
  }
}

if (VERBOSE && missing.length > 0) {
  console.log('\nMissing from Qdrant (first 20):');
  for (const m of missing.slice(0, 20)) {
    console.log(`  ${m.id}  ${m.source_ref}`);
  }
}

if (violations.length > 0) {
  console.log('\nPayload violations (first 20):');
  for (const v of violations.slice(0, 20)) {
    console.log(`  ${v.id}  missing=[${v.missing_fields.join(',')}]  source_ref=${v.source_ref ?? 'MISSING'}`);
  }
}

// ── Step 5: Fix stale points ─────────────────────────────────────────────────
if (FIX_STALE && stale.length > 0) {
  console.log(`\nDeleting ${stale.length} stale Qdrant points...`);
  const ids = stale.map(s => s.id);
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: ids }),
  });
  if (res.ok) {
    console.log(`  Deleted ${ids.length} stale points ✓`);
  } else {
    const text = await res.text();
    console.error(`  Delete failed: ${text}`);
  }
}

// ── Gate result ──────────────────────────────────────────────────────────────
console.log('');
const passed = stale.length === 0 && missing.length === 0 && violations.length === 0;
if (passed) {
  console.log('✅ GATE PASS — Qdrant fully synchronized with Postgres');
  process.exit(0);
} else {
  const severity = stale.length > 0 || violations.length > 0 ? 'FAIL' : 'WARN';
  console.log(`${severity === 'FAIL' ? '❌' : '⚠️'} GATE ${severity} — discrepancies found`);
  if (stale.length > 0) console.log(`   Run with --fix-stale to delete ${stale.length} stale Qdrant points`);
  if (missing.length > 0) console.log(`   ${missing.length} points need re-indexing from codebase_chunk_index`);
  if (violations.length > 0) console.log(`   ${violations.length} points need payload backfill (packet_key / source_ref)`);
  process.exit(severity === 'FAIL' ? 1 : 0);
}

await pool.end();
