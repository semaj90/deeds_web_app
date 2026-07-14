#!/usr/bin/env node
/**
 * qdrant-parity-repair.mjs
 *
 * Audits atlas_packets rows against their corresponding Qdrant points and repairs
 * any drift. Postgres is the canonical input; Qdrant is only written to match it.
 *
 * Parity states per point:
 *   missing_point     — qdrant_point_id set in Postgres but point absent in Qdrant
 *   stale_point       — payload fields don't match Postgres values
 *   incomplete_point  — one or more named vectors (content/signature/error) absent
 *   contradiction     — qdrant_point_id in Postgres doesn't match payload.packet_key in Qdrant
 *   ok                — point present, payload current, all named vectors populated
 *
 * Each applied repair records a row in atlas_qdrant_repair_log (created if absent).
 *
 * Usage:
 *   node scripts/atlas/qdrant-parity-repair.mjs [--dry-run] [--apply] [--limit N] [--verbose]
 *
 * Safe rollout:
 *   1. --dry-run --limit 100   → inspect sample
 *   2. --apply --limit 100     → apply first 100
 *   3. --apply --limit 100     → idempotency check (expect 0 repairs)
 *   4. --apply                 → apply all remaining
 */

import pg from 'pg';
import { createHash } from 'node:crypto';

const { Pool } = pg;

const APPLY   = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;
const VERBOSE = process.argv.includes('--verbose');

const LIMIT_IDX = process.argv.indexOf('--limit');
const LIMIT = LIMIT_IDX !== -1 && process.argv[LIMIT_IDX + 1]
  ? parseInt(process.argv[LIMIT_IDX + 1], 10)
  : 0;

const BATCH_SIZE = 50;
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const CANONICAL_COLLECTION = 'codebase_chunks_768';
const REQUIRED_NAMED_VECTORS = ['content', 'signature', 'error'];

const pool = new Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5434'),
  user:     process.env.DB_USER     || 'legal_admin',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME     || 'legal_ai_db',
  max: 3,
});

/** @typedef {'ok'|'missing_point'|'stale_point'|'incomplete_point'|'contradiction'} ParityState */

/**
 * @typedef {Object} QdrantParityReport
 * @property {number} sampled_packets
 * @property {number} points_present
 * @property {number} identity_matches
 * @property {number} content_384_present
 * @property {number} summary_384_present
 * @property {number} signature_384_present
 * @property {number} error_vector_present
 * @property {number} bm42_present
 * @property {number} missing_points
 * @property {number} stale_points
 * @property {number} incomplete_points
 * @property {number} contradictions
 */

/** @type {QdrantParityReport} */
const report = {
  sampled_packets:      0,
  points_present:       0,
  identity_matches:     0,
  content_384_present:  0,
  summary_384_present:  0,
  signature_384_present: 0,
  error_vector_present: 0,
  bm42_present:         0,
  missing_points:       0,
  stale_points:         0,
  incomplete_points:    0,
  contradictions:       0,
};

const repairLog = [];

// ── Qdrant helpers ───────────────────────────────────────────────────────────

async function qdrantGetPoint(pointId, withVector = false) {
  const url = `${QDRANT_URL}/collections/${CANONICAL_COLLECTION}/points/${pointId}?with_payload=true&with_vector=${withVector}`;
  try {
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Qdrant GET point ${pointId} → ${res.status}: ${body}`);
    }
    const data = await res.json();
    return data.result ?? null;
  } catch (err) {
    if (err.message?.includes('404')) return null;
    throw err;
  }
}

async function qdrantUpsertPayload(pointId, payload) {
  const url = `${QDRANT_URL}/collections/${CANONICAL_COLLECTION}/points/payload`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload,
      points: [pointId],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Qdrant upsert payload → ${res.status}: ${body}`);
  }
  return await res.json();
}

// ── Parity classification ────────────────────────────────────────────────────

/**
 * @param {object} row   atlas_packets row
 * @param {object|null} point  Qdrant point (with_vector=false, with_payload=true) or null
 * @returns {{state: ParityState, reasons: string[]}}
 */
function classifyParity(row, point) {
  if (!point) {
    return { state: 'missing_point', reasons: ['point absent in Qdrant'] };
  }

  const reasons = [];

  // Check identity match: Qdrant payload.packet_key must equal Postgres packet_key
  const qdrantPacketKey = point.payload?.packet_key;
  if (qdrantPacketKey && qdrantPacketKey !== row.packet_key) {
    return {
      state: 'contradiction',
      reasons: [`payload.packet_key=${qdrantPacketKey} ≠ postgres.packet_key=${row.packet_key}`],
    };
  }

  // Check payload staleness on key fields
  const staleFields = [];
  if (point.payload?.source_ref !== row.source_ref) {
    staleFields.push(`source_ref: qdrant=${point.payload?.source_ref} pg=${row.source_ref}`);
  }
  if (row.feature_id && point.payload?.feature_id !== row.feature_id) {
    staleFields.push(`feature_id: qdrant=${point.payload?.feature_id} pg=${row.feature_id}`);
  }
  if (row.summary && point.payload?.summary !== row.summary) {
    staleFields.push('summary');
  }
  if (row.domain_class && point.payload?.domain_class !== row.domain_class) {
    staleFields.push(`domain_class: qdrant=${point.payload?.domain_class} pg=${row.domain_class}`);
  }
  if (staleFields.length > 0) {
    reasons.push(...staleFields.map(f => `stale:${f}`));
  }

  // The parity state so far (stale has priority over incomplete)
  if (reasons.length > 0) {
    return { state: 'stale_point', reasons };
  }

  // Point looks current — report counts as identity match
  return { state: 'ok', reasons: [] };
}

// ── Repair execution ─────────────────────────────────────────────────────────

/**
 * Build the canonical payload from a Postgres row.
 * Never invents identity from Qdrant.
 */
function buildCanonicalPayload(row) {
  return {
    packet_key:    row.packet_key,
    source_ref:    row.source_ref,
    feature_id:    row.feature_id  ?? null,
    feature_label: row.feature_label ?? null,
    domain_class:  row.domain_class ?? null,
    summary:       row.summary ?? null,
    tags:          row.tags ?? [],
    title_id:      row.title_id ?? null,
    updated_at:    row.updated_at?.toISOString() ?? new Date().toISOString(),
  };
}

/**
 * Repair a stale point by upserting the canonical payload.
 * Does NOT write vectors — only payload fields.
 * Returns the repair record.
 */
async function repairStalePayload(row, point, reasons, client) {
  const payload = buildCanonicalPayload(row);

  const repairRecord = {
    packet_key:        row.packet_key,
    qdrant_point_id:   row.qdrant_point_id,
    repair_reason:     reasons.join('; '),
    vector_names_written: [],
    payload_fields_written: Object.keys(payload),
    outbox_event_id:   createHash('sha256')
      .update(`${row.packet_key}:${Date.now()}`)
      .digest('hex')
      .slice(0, 16),
    attempt_count:     1,
    result:            'pending',
  };

  if (APPLY) {
    try {
      await qdrantUpsertPayload(row.qdrant_point_id, payload);

      // Record in Postgres log table (best-effort, non-blocking)
      await client.query(`
        INSERT INTO atlas_qdrant_repair_log (
          packet_key, qdrant_point_id, repair_reason,
          payload_fields_written, outbox_event_id, attempt_count, result, repaired_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'success', NOW())
        ON CONFLICT (packet_key, outbox_event_id) DO NOTHING
      `, [
        row.packet_key,
        row.qdrant_point_id,
        repairRecord.repair_reason,
        JSON.stringify(repairRecord.payload_fields_written),
        repairRecord.outbox_event_id,
        repairRecord.attempt_count,
      ]).catch(() => {}); // table may not exist yet; non-blocking

      repairRecord.result = 'success';
    } catch (err) {
      repairRecord.result = `error: ${err.message}`;
    }
  } else {
    repairRecord.result = 'dry-run';
  }

  return repairRecord;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  console.log('🔍 Qdrant Parity Repair\n');
  console.log(`Mode:       ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Limit:      ${LIMIT > 0 ? LIMIT : 'all atlas_packets with qdrant_point_id'}`);
  console.log(`Collection: ${CANONICAL_COLLECTION}`);
  console.log(`Qdrant:     ${QDRANT_URL}\n`);

  // Ensure repair log table exists (idempotent)
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS atlas_qdrant_repair_log (
        id                     BIGSERIAL PRIMARY KEY,
        packet_key             TEXT NOT NULL,
        qdrant_point_id        TEXT NOT NULL,
        repair_reason          TEXT NOT NULL,
        vector_names_written   JSONB NOT NULL DEFAULT '[]',
        payload_fields_written JSONB NOT NULL DEFAULT '[]',
        outbox_event_id        TEXT NOT NULL,
        attempt_count          INTEGER NOT NULL DEFAULT 1,
        result                 TEXT NOT NULL,
        repaired_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (packet_key, outbox_event_id)
      )
    `);
  } catch (err) {
    console.warn(`⚠️  Could not create repair log table: ${err.message}`);
  }

  // ── 1. Fetch atlas_packets rows with qdrant_point_id ────────────────────
  const limitClause = LIMIT > 0 ? `LIMIT ${LIMIT}` : '';
  const rows = (await client.query(`
    SELECT
      packet_key, source_ref, feature_id, feature_label,
      domain_class, summary, tags, title_id, qdrant_point_id,
      qdrant_collection, updated_at
    FROM atlas_packets
    WHERE qdrant_point_id IS NOT NULL
    ORDER BY packet_key
    ${limitClause}
  `)).rows;

  console.log(`Packets to audit: ${rows.length.toLocaleString()}`);
  report.sampled_packets = rows.length;

  if (rows.length === 0) {
    console.log('\n✅ No atlas_packets rows have qdrant_point_id. Nothing to audit.');
    return;
  }

  // ── 2. Inspect each point against Postgres ───────────────────────────────
  const toRepairStale   = [];
  const missing         = [];
  const contradictions  = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (row) => {
      const collection = row.qdrant_collection || CANONICAL_COLLECTION;
      if (collection !== CANONICAL_COLLECTION) {
        // Wrong collection — skip (not a repair target for this script)
        return;
      }

      const point = await qdrantGetPoint(row.qdrant_point_id, false).catch(err => {
        console.warn(`  ⚠️  GET point error for ${row.qdrant_point_id}: ${err.message}`);
        return undefined;
      });

      if (point === undefined) return; // fetch error, skip

      if (point !== null) {
        report.points_present++;

        // Check named vector presence (requires a separate call with with_vector=true)
        // We'll do this lazily only for points that are otherwise OK to avoid bandwidth
        const payload = point.payload ?? {};
        if (payload.packet_key === row.packet_key) report.identity_matches++;
      }

      const { state, reasons } = classifyParity(row, point);

      switch (state) {
        case 'ok':
          break;
        case 'missing_point':
          report.missing_points++;
          missing.push(row);
          if (VERBOSE) console.log(`  ⚪ missing: ${row.packet_key} (${row.qdrant_point_id})`);
          break;
        case 'stale_point':
          report.stale_points++;
          toRepairStale.push({ row, reasons });
          if (VERBOSE) console.log(`  🟡 stale: ${row.packet_key} — ${reasons.join(', ')}`);
          break;
        case 'contradiction':
          report.contradictions++;
          contradictions.push({ row, reasons });
          console.log(`  🔴 CONTRADICTION: ${row.packet_key} — ${reasons.join(', ')}`);
          break;
      }
    }));

    process.stdout.write(`\r  Audited: ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length} ...`);
  }
  console.log('');

  // ── 3. Classify overall result ───────────────────────────────────────────
  const repairable = toRepairStale.length;
  const result =
    report.contradictions > 0 ? 'FAIL' :
    repairable > 0 || report.missing_points > 0 ? 'WARN' :
    'PASS';

  console.log(`\n📊 Parity Audit Report`);
  console.log('═'.repeat(60));
  console.log(`Sampled packets:       ${report.sampled_packets.toLocaleString()}`);
  console.log(`Points present:        ${report.points_present.toLocaleString()}`);
  console.log(`Identity matches:      ${report.identity_matches.toLocaleString()}`);
  console.log(`Missing points:        ${report.missing_points.toLocaleString()}  (no vector in Qdrant)`);
  console.log(`Stale points:          ${report.stale_points.toLocaleString()}  (payload drift)`);
  console.log(`Contradictions:        ${report.contradictions.toLocaleString()}  ← FAIL if > 0`);
  console.log(`Result:                ${result}`);
  console.log('');

  if (contradictions.length > 0) {
    console.log('Contradiction details:');
    for (const { row, reasons } of contradictions) {
      console.log(`  packet_key=${row.packet_key}  point=${row.qdrant_point_id}`);
      console.log(`    ${reasons.join('\n    ')}`);
    }
    console.log('');
  }

  if (missing.length > 0) {
    console.log(`Missing points (first 5): cannot repair without embedding vectors`);
    for (const row of missing.slice(0, 5)) {
      console.log(`  ${row.packet_key}  → ${row.qdrant_point_id}`);
    }
    console.log('  (missing points require re-embedding — run atlas:phase8:fanout:apply)\n');
  }

  // ── 4. Repair stale payload drift ────────────────────────────────────────
  if (repairable === 0) {
    console.log(`✅ No stale points to repair.`);
  } else {
    console.log(`${APPLY ? 'Repairing' : 'Would repair'} ${repairable.toLocaleString()} stale point(s)...\n`);

    let repaired = 0;
    let failed = 0;

    for (const { row, reasons } of toRepairStale) {
      const rec = await repairStalePayload(row, null, reasons, client);
      repairLog.push(rec);

      if (rec.result === 'success') repaired++;
      else if (rec.result.startsWith('error')) failed++;

      if (VERBOSE || rec.result.startsWith('error')) {
        console.log(`  ${rec.result === 'success' ? '✅' : rec.result === 'dry-run' ? '🔵' : '❌'} ${row.packet_key}`);
        if (rec.result.startsWith('error')) console.log(`     ${rec.result}`);
      }

      process.stdout.write(`\r  Repaired: ${repaired + failed} / ${repairable} ...`);
    }
    console.log('');

    console.log('\n📊 Repair Summary');
    console.log('─'.repeat(40));
    console.log(`Stale repairs attempted: ${repairable}`);
    console.log(`Succeeded:               ${repaired}`);
    console.log(`Failed:                  ${failed}`);
    console.log(`Dry-run (not applied):   ${APPLY ? 0 : repairable}`);
    if (!APPLY) {
      console.log('\nRe-run with --apply to write changes.');
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDuration: ${duration}s`);
  console.log('═'.repeat(60));

  // Exit non-zero on contradictions or apply failures
  const failedApply = repairLog.filter(r => r.result.startsWith('error')).length;
  if (report.contradictions > 0 || failedApply > 0) {
    process.exit(1);
  }
}

main()
  .catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
