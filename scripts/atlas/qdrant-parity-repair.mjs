#!/usr/bin/env node
/**
 * qdrant-parity-repair.mjs
 *
 * Audits atlas_packets rows against their corresponding Qdrant points and
 * generates bounded repair events for coverage debt.
 *
 * Identity model (three distinct keys, never conflated):
 *   packet_id       — Postgres relational PK (join key within this checkout)
 *   packet_key      — stable higher-level packet identity carried across services
 *   qdrant_point_id — physical Qdrant point ID
 *
 * Parity states:
 *   ok                       — point present, all identity fields match, named vectors present
 *   missing_point            — qdrant_point_id set but no point in Qdrant (coverage debt → WARN)
 *   stale_point              — payload fields drift from Postgres (coverage debt → WARN)
 *   incomplete_point         — missing required named vectors (coverage debt → WARN)
 *   projection_contradiction — wrong vector dimension or named-vector mismatch (→ FAIL)
 *   identity_contradiction   — packet_key/source_ref in Qdrant payload disagrees with Postgres (→ FAIL)
 *
 * Repair policy:
 *   coverage debt (missing/stale/incomplete) → auto-repair eligible
 *   identity contradiction                  → quarantine only, no auto-repair
 *   projection contradiction                → quarantine only, no auto-repair
 *
 * Status policy (computed, never hardcoded):
 *   contradictions > 0 → FAIL  (exit 1)
 *   otherwise          → WARN or PASS (exit 0)
 *   (CI/smoke can continue during known mirror debt)
 *
 * Sampling:
 *   Precedence: --sample N > ATLAS_QDRANT_PARITY_SAMPLE env > npm_config_sample > default (50)
 *
 * Usage:
 *   node scripts/atlas/qdrant-parity-repair.mjs [--sample N] [--apply] [--verbose]
 *   npm run atlas:qdrant:repair -- --sample 100
 *   npm run atlas:qdrant:repair:apply -- --sample 100
 */

import pg from 'pg';
import { createHash } from 'node:crypto';

const { Pool } = pg;

// ── CLI / env resolution ──────────────────────────────────────────────────────

const APPLY   = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

function resolveSample() {
  const argIdx = process.argv.indexOf('--sample');
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return { value: parseInt(process.argv[argIdx + 1], 10), source: 'argument' };
  }
  if (process.env.ATLAS_QDRANT_PARITY_SAMPLE) {
    return { value: parseInt(process.env.ATLAS_QDRANT_PARITY_SAMPLE, 10), source: 'environment' };
  }
  if (process.env.npm_config_sample) {
    return { value: parseInt(process.env.npm_config_sample, 10), source: 'npm_config' };
  }
  return { value: 50, source: 'default' };
}

const sampleResolved = resolveSample();

// ── Infrastructure ────────────────────────────────────────────────────────────

const QDRANT_URL           = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const CANONICAL_COLLECTION = 'codebase_chunks_768';
const EXPECTED_DIM         = 768;
const REQUIRED_VECTORS     = ['content', 'signature'];
const BM42_PAYLOAD_KEY     = 'bm42_sparse';
const BATCH_SIZE           = 25;

const pool = new Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5434'),
  user:     process.env.DB_USER     || 'legal_admin',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME     || 'legal_ai_db',
  max: 3,
});

// ── Type definitions (JSDoc) ──────────────────────────────────────────────────

/**
 * @typedef {'ok'|'missing_point'|'stale_point'|'incomplete_point'|
 *           'projection_contradiction'|'identity_contradiction'} ParityState
 */

/**
 * @typedef {Object} QdrantParityRow
 * @property {string}       packet_id
 * @property {string}       packet_key
 * @property {string}       qdrant_point_id
 * @property {boolean}      point_present
 * @property {boolean|null} packet_key_matches
 * @property {boolean|null} source_ref_matches
 * @property {boolean}      content_384_present
 * @property {boolean}      summary_384_present
 * @property {boolean}      signature_384_present
 * @property {boolean}      bm42_present
 * @property {string|null}  expected_updated_at
 * @property {string|null}  mirrored_updated_at
 * @property {ParityState}  state
 * @property {string[]}     reasons
 */

/**
 * @typedef {Object} QdrantParityReport
 * @property {number} sampled_packets
 * @property {number} points_present
 * @property {number} identity_matches
 * @property {number} current_versions
 * @property {number} content_384_present
 * @property {number} summary_384_present
 * @property {number} signature_384_present
 * @property {number} bm42_present
 * @property {number} missing_points
 * @property {number} stale_points
 * @property {number} incomplete_points
 * @property {number} contradictions
 */

/** @type {QdrantParityReport} */
const report = {
  sampled_packets:       0,
  points_present:        0,
  identity_matches:      0,
  current_versions:      0,
  content_384_present:   0,
  summary_384_present:   0,
  signature_384_present: 0,
  bm42_present:          0,
  missing_points:        0,
  stale_points:          0,
  incomplete_points:     0,
  contradictions:        0,
};

// ── Qdrant helpers ────────────────────────────────────────────────────────────

async function qdrantBatchRetrieve(pointIds) {
  const url = `${QDRANT_URL}/collections/${CANONICAL_COLLECTION}/points/retrieve`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: pointIds, with_payload: true, with_vector: true }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Qdrant batch retrieve → ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  /** @type {Map<string, object>} */
  const byId = new Map();
  for (const point of (data.result ?? [])) {
    byId.set(String(point.id), point);
  }
  return byId;
}

async function qdrantUpsertPayload(pointId, payload) {
  const url = `${QDRANT_URL}/collections/${CANONICAL_COLLECTION}/points/payload`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, points: [pointId] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Qdrant payload upsert → ${res.status}: ${body.slice(0, 200)}`);
  }
}

// ── Parity classification ─────────────────────────────────────────────────────

/**
 * @param {object} pgRow   Postgres atlas_packets row
 * @param {object|null} point  Qdrant point (with_vector=true) or null
 * @returns {QdrantParityRow}
 */
function classifyParity(pgRow, point) {
  /** @type {QdrantParityRow} */
  const row = {
    packet_id:             pgRow.id,
    packet_key:            pgRow.packet_key,
    qdrant_point_id:       pgRow.qdrant_point_id,
    point_present:         point !== null,
    packet_key_matches:    null,
    source_ref_matches:    null,
    content_384_present:   false,
    summary_384_present:   false,
    signature_384_present: false,
    bm42_present:          false,
    expected_updated_at:   pgRow.updated_at?.toISOString() ?? null,
    mirrored_updated_at:   null,
    state:                 'ok',
    reasons:               [],
  };

  if (!point) {
    row.state = 'missing_point';
    row.reasons.push('point absent in Qdrant');
    return row;
  }

  const payload = point.payload ?? {};
  row.mirrored_updated_at = payload.updated_at ?? null;

  // ── Identity checks (contradiction = FAIL) ───────────────────────────────

  // packet_key must match exactly
  if (payload.packet_key !== undefined) {
    row.packet_key_matches = payload.packet_key === pgRow.packet_key;
  } else {
    row.packet_key_matches = null; // field absent — not a contradiction, just incomplete
  }

  if (row.packet_key_matches === false) {
    row.state = 'identity_contradiction';
    row.reasons.push(
      `packet_key: qdrant="${payload.packet_key}" ≠ postgres="${pgRow.packet_key}"`
    );
    // source_ref check still informative even if already contradicted
  }

  if (payload.source_ref !== undefined) {
    row.source_ref_matches = payload.source_ref === pgRow.source_ref;
    if (row.source_ref_matches === false) {
      if (row.state !== 'identity_contradiction') {
        row.state = 'identity_contradiction';
      }
      row.reasons.push(
        `source_ref: qdrant="${payload.source_ref}" ≠ postgres="${pgRow.source_ref}"`
      );
    }
  } else {
    row.source_ref_matches = null;
  }

  if (row.state === 'identity_contradiction') return row;

  // ── Named vector checks ──────────────────────────────────────────────────

  const vectors = point.vectors ?? {};
  const namedVectors = typeof vectors === 'object' && !Array.isArray(vectors) ? vectors : {};

  const contentVec = namedVectors['content'];
  const summaryVec = namedVectors['summary'];
  const signatureVec = namedVectors['signature'];

  // Presence
  row.content_384_present   = Array.isArray(contentVec)   && contentVec.length > 0;
  row.summary_384_present   = Array.isArray(summaryVec)   && summaryVec.length > 0;
  row.signature_384_present = Array.isArray(signatureVec) && signatureVec.length > 0;
  row.bm42_present          = payload[BM42_PAYLOAD_KEY] != null;

  // Dimension check for present vectors (projection contradiction = FAIL)
  for (const [name, vec] of Object.entries(namedVectors)) {
    if (!Array.isArray(vec)) continue;
    if (vec.length !== EXPECTED_DIM) {
      row.state = 'projection_contradiction';
      row.reasons.push(`named vector "${name}" has dim=${vec.length}, expected ${EXPECTED_DIM}`);
    }
  }
  if (row.state === 'projection_contradiction') return row;

  // Required vector absence → incomplete
  const missingRequired = REQUIRED_VECTORS.filter(name => !namedVectors[name]);
  if (missingRequired.length > 0) {
    if (row.state === 'ok') row.state = 'incomplete_point';
    row.reasons.push(...missingRequired.map(n => `missing required vector "${n}"`));
  }

  // ── Payload staleness ────────────────────────────────────────────────────

  const stale = [];
  if (pgRow.feature_id   && payload.feature_id   !== pgRow.feature_id)   stale.push('feature_id');
  if (pgRow.domain_class && payload.domain_class !== pgRow.domain_class)  stale.push('domain_class');
  if (pgRow.summary      && payload.summary      !== pgRow.summary)       stale.push('summary');
  if (pgRow.title_id     && payload.title_id     !== pgRow.title_id)      stale.push('title_id');
  if (stale.length > 0) {
    if (row.state === 'ok') row.state = 'stale_point';
    row.reasons.push(...stale.map(f => `stale field: ${f}`));
  }

  return row;
}

// ── Canonical payload builder ─────────────────────────────────────────────────

function buildCanonicalPayload(pgRow) {
  return {
    packet_key:    pgRow.packet_key,
    source_ref:    pgRow.source_ref,
    feature_id:    pgRow.feature_id    ?? null,
    feature_label: pgRow.feature_label ?? null,
    domain_class:  pgRow.domain_class  ?? null,
    summary:       pgRow.summary       ?? null,
    title_id:      pgRow.title_id      ?? null,
    tags:          pgRow.tags          ?? [],
    updated_at:    pgRow.updated_at?.toISOString() ?? new Date().toISOString(),
  };
}

// ── Repair event generators ───────────────────────────────────────────────────

/**
 * Generate bounded repair events from classified parity rows.
 * Does NOT execute repairs — callers decide whether to apply.
 * @param {QdrantParityRow} parityRow
 * @param {object} pgRow
 * @returns {Array<{event_type: string, packet_key: string, qdrant_point_id: string, payload?: object, reason: string}>}
 */
function generateRepairEvents(parityRow, pgRow) {
  const events = [];
  const base = { packet_key: parityRow.packet_key, qdrant_point_id: parityRow.qdrant_point_id };

  switch (parityRow.state) {
    case 'missing_point':
      events.push({ ...base, event_type: 'full_projection', reason: 'point absent in Qdrant' });
      break;

    case 'stale_point':
      events.push({
        ...base,
        event_type: 'payload_repair',
        payload: buildCanonicalPayload(pgRow),
        reason: parityRow.reasons.join('; '),
      });
      break;

    case 'incomplete_point': {
      // Payload repair to at least keep payload current
      events.push({
        ...base,
        event_type: 'payload_repair',
        payload: buildCanonicalPayload(pgRow),
        reason: parityRow.reasons.join('; '),
      });
      // If summary vector specifically missing, flag for summary vector repair
      if (!parityRow.summary_384_present) {
        events.push({ ...base, event_type: 'summary_vector_repair', reason: 'summary_384 absent' });
      }
      break;
    }

    case 'identity_contradiction':
    case 'projection_contradiction':
      events.push({
        ...base,
        event_type: 'quarantine',
        reason: parityRow.reasons.join('; '),
      });
      break;

    case 'ok':
      break;
  }

  return events;
}

// ── Repair application ────────────────────────────────────────────────────────

async function applyPayloadRepair(event, client) {
  const outboxId = createHash('sha256')
    .update(`${event.packet_key}:${event.event_type}`)
    .digest('hex')
    .slice(0, 16);
  let result = 'dry-run';

  if (APPLY) {
    try {
      await qdrantUpsertPayload(event.qdrant_point_id, event.payload);

      await client.query(`
        INSERT INTO atlas_qdrant_repair_log (
          packet_key, qdrant_point_id, repair_reason,
          vector_names_written, payload_fields_written,
          outbox_event_id, attempt_count, result, repaired_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 1, 'success', NOW())
        ON CONFLICT (packet_key, outbox_event_id) DO NOTHING
      `, [
        event.packet_key,
        event.qdrant_point_id,
        event.reason,
        JSON.stringify([]),
        JSON.stringify(Object.keys(event.payload ?? {})),
        outboxId,
      ]).catch(() => {});

      result = 'success';
    } catch (err) {
      result = `error: ${err.message}`;
    }
  }

  return { event_type: event.event_type, packet_key: event.packet_key, result, outbox_event_id: outboxId };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  console.log('🔍 Qdrant Parity Audit + Bounded Repair\n');
  console.log(`Mode:             ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Sample requested: ${sampleResolved.value}`);
  console.log(`Sample source:    ${sampleResolved.source}`);
  console.log(`Collection:       ${CANONICAL_COLLECTION}`);
  console.log(`Qdrant:           ${QDRANT_URL}\n`);

  const client = await pool.connect();
  let exitCode = 0;

  try {
    // Ensure repair log table exists
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
    `).catch(err => console.warn(`⚠️  Repair log table: ${err.message}`));

    // ── 1. Sample atlas_packets rows with qdrant_point_id ─────────────────────
    const rows = (await client.query(`
      SELECT
        id, packet_key, source_ref, feature_id, feature_label,
        domain_class, summary, tags, title_id, qdrant_point_id,
        qdrant_collection, updated_at
      FROM atlas_packets
      WHERE qdrant_point_id IS NOT NULL
      ORDER BY updated_at DESC NULLS LAST
      LIMIT $1
    `, [sampleResolved.value])).rows;

    report.sampled_packets = rows.length;
    console.log(`Packets sampled: ${rows.length.toLocaleString()}`);

    if (rows.length === 0) {
      console.log('\n✅ No atlas_packets rows have qdrant_point_id. Nothing to audit.');
      return;
    }

    // ── 2. Classify each point ─────────────────────────────────────────────────
    /** @type {QdrantParityRow[]} */
    const classified = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      // Filter to canonical collection, then batch-fetch all point IDs in one request
      const eligible = batch.filter(r => !r.qdrant_collection || r.qdrant_collection === CANONICAL_COLLECTION);
      const pointIds = eligible.map(r => r.qdrant_point_id);

      let pointMap = new Map();
      try {
        pointMap = await qdrantBatchRetrieve(pointIds);
      } catch (err) {
        if (VERBOSE) console.warn(`  ⚠️  Batch fetch error: ${err.message}`);
        // Classify each eligible row as missing (conservative — don't skip entirely)
        for (const pgRow of eligible) {
          classified.push(classifyParity(pgRow, null));
        }
        process.stdout.write(`\r  Audited: ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length} ...`);
        continue;
      }

      for (const pgRow of eligible) {
        const point = pointMap.get(String(pgRow.qdrant_point_id)) ?? null;

        const parityRow = classifyParity(pgRow, point);
        classified.push(parityRow);

        // Accumulate report counters
        if (parityRow.point_present) {
          report.points_present++;
          if (parityRow.packet_key_matches === true && parityRow.source_ref_matches !== false) {
            report.identity_matches++;
          }
          if (parityRow.state === 'ok') report.current_versions++;
          if (parityRow.content_384_present)   report.content_384_present++;
          if (parityRow.summary_384_present)   report.summary_384_present++;
          if (parityRow.signature_384_present) report.signature_384_present++;
          if (parityRow.bm42_present)          report.bm42_present++;
        }

        switch (parityRow.state) {
          case 'missing_point':
            report.missing_points++;
            if (VERBOSE) console.log(`  ⚪ missing:  ${pgRow.packet_key}  (${pgRow.qdrant_point_id})`);
            break;
          case 'stale_point':
            report.stale_points++;
            if (VERBOSE) console.log(`  🟡 stale:    ${pgRow.packet_key}  — ${parityRow.reasons.join(', ')}`);
            break;
          case 'incomplete_point':
            report.incomplete_points++;
            if (VERBOSE) console.log(`  🔶 incomplete: ${pgRow.packet_key}  — ${parityRow.reasons.join(', ')}`);
            break;
          case 'identity_contradiction':
          case 'projection_contradiction':
            report.contradictions++;
            console.log(`  🔴 CONTRADICTION (${parityRow.state}): ${pgRow.packet_key}`);
            for (const r of parityRow.reasons) console.log(`       ${r}`);
            break;
        }
      }

      process.stdout.write(`\r  Audited: ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length} ...`);
    }
    console.log('');

    // ── 3. Compute status ──────────────────────────────────────────────────────
    const status =
      report.contradictions > 0
        ? 'FAIL'
        : report.missing_points > 0 || report.stale_points > 0 || report.incomplete_points > 0
          ? 'WARN'
          : 'PASS';

    if (report.contradictions > 0) exitCode = 1;

    // ── 4. Print audit report ──────────────────────────────────────────────────
    const auditJson = {
      status,
      sample_requested: sampleResolved.value,
      sample_resolved:  rows.length,
      sample_source:    sampleResolved.source,
      sampled_packets:       report.sampled_packets,
      points_present:        report.points_present,
      identity_matches:      report.identity_matches,
      current_versions:      report.current_versions,
      missing_points:        report.missing_points,
      stale_points:          report.stale_points,
      incomplete_points:     report.incomplete_points,
      contradictions:        report.contradictions,
      content_384_present:   report.content_384_present,
      summary_384_present:   report.summary_384_present,
      signature_384_present: report.signature_384_present,
      bm42_present:          report.bm42_present,
    };

    console.log('\n📊 Parity Audit Report');
    console.log('═'.repeat(62));
    console.log(JSON.stringify(auditJson, null, 2));
    console.log('═'.repeat(62));

    // ── 5. Generate and apply repair events ───────────────────────────────────
    const repairEligible = classified.filter(r =>
      r.state === 'stale_point' || r.state === 'incomplete_point'
    );
    const quarantined = classified.filter(r =>
      r.state === 'identity_contradiction' || r.state === 'projection_contradiction'
    );

    if (quarantined.length > 0) {
      console.log(`\n🚫 Quarantined (no auto-repair): ${quarantined.length}`);
      for (const r of quarantined) {
        console.log(`   ${r.packet_key}  ${r.qdrant_point_id}`);
        for (const reason of r.reasons) console.log(`     ${reason}`);
      }
    }

    if (report.missing_points > 0) {
      console.log(`\n📭 Missing points: ${report.missing_points}`);
      console.log('   Repair path: full_projection event → atlas:phase8:fanout:apply');
      const sample = classified.filter(r => r.state === 'missing_point').slice(0, 5);
      for (const r of sample) console.log(`   ${r.packet_key}  ${r.qdrant_point_id}`);
    }

    if (repairEligible.length > 0) {
      console.log(`\n${APPLY ? 'Applying' : 'Would apply'} payload repairs for ${repairEligible.length} point(s)...`);

      let succeeded = 0;
      let failed    = 0;

      const rowByKey = new Map(rows.map(r => [r.packet_key, r]));

      for (const parityRow of repairEligible) {
        const pgRow = rowByKey.get(parityRow.packet_key);
        if (!pgRow) continue;

        const events = generateRepairEvents(parityRow, pgRow).filter(
          e => e.event_type === 'payload_repair'
        );

        for (const event of events) {
          const outcome = await applyPayloadRepair(event, client);
          if (outcome.result === 'success') succeeded++;
          else if (outcome.result.startsWith('error')) {
            failed++;
            console.error(`   ❌ ${parityRow.packet_key}: ${outcome.result}`);
          }
        }
      }

      console.log(`\nPayload repairs: ${succeeded} succeeded, ${failed} failed, ` +
        `${APPLY ? '' : `${repairEligible.length} dry-run (not applied)`}`);

      if (!APPLY) console.log('\nRe-run with --apply to write changes.');
      if (failed > 0) exitCode = 1;
    } else if (repairEligible.length === 0 && report.stale_points === 0 && report.incomplete_points === 0) {
      console.log('\n✅ No stale or incomplete points to repair.');
    }

  } finally {
    client.release();
    await pool.end().catch(() => {});
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDuration: ${duration}s`);
  console.log(`Exit:     ${exitCode === 0 ? 'OK (0)' : 'FAIL (1)'}`);
  process.exit(exitCode);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
