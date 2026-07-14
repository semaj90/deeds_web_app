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
 *   coverage debt (missing/stale/incomplete) → auto-repair eligible (payload_repair only)
 *   identity contradiction                  → quarantine only, no auto-repair
 *   projection contradiction                → quarantine only, no auto-repair
 *   full_projection (missing point)         → outbox event only — never created directly here
 *
 * Payload repair guard (compare-before-write):
 *   Reject repair when Qdrant aggregate_version >= Postgres aggregate_version
 *   (Qdrant appears newer than the event being applied — skip, do not overwrite)
 *
 * Status policy (computed, never hardcoded):
 *   contradictions > 0 → FAIL  (exit 1)
 *   otherwise          → WARN or PASS (exit 0)
 *
 * Collection contracts (versioned, explicit):
 *   codebase_chunks_384  — canonical (new repairs target this)
 *   codebase_chunks_768  — legacy/read-only (audited but never repaired)
 *
 * Sampling:
 *   Precedence: --sample N > ATLAS_QDRANT_PARITY_SAMPLE env > npm_config_sample > default (50)
 *
 * Usage:
 *   node scripts/atlas/qdrant-parity-repair.mjs --collection codebase_chunks_384 [--sample N] [--apply] [--verbose]
 *   node scripts/atlas/qdrant-parity-repair.mjs --collection codebase_chunks_384 --preflight
 *   npm run atlas:qdrant:repair -- --collection codebase_chunks_384 --sample 25
 *   npm run atlas:qdrant:repair:apply -- --collection codebase_chunks_384 --sample 25
 */

import pg from 'pg';
import { createHash } from 'node:crypto';

const { Pool } = pg;

// ── Collection contracts ──────────────────────────────────────────────────────

/**
 * Versioned per-collection schema contracts.
 * namedVectors: { vectorName → expected dimension }
 * requiredVectors: must be present (absence → incomplete_point)
 * sparseVectors: BM42 sparse payload key
 * legacy: read-only; repairs are never applied to legacy collections
 */
const COLLECTION_CONTRACTS = {
  codebase_chunks_384: {
    contractVersion:  'atlas-qdrant-384-v1',
    legacy:           false,
    namedVectors: {
      content_384:   384,
      summary_384:   384,
      signature_384: 384,
      latent64:       64,
    },
    requiredVectors: ['content_384', 'signature_384'],
    sparseVectorKey: 'bm42_sparse',
  },
  codebase_chunks_768: {
    contractVersion:  'atlas-qdrant-768-v0-legacy',
    legacy:           true,
    namedVectors: {
      content:   768,
      signature: 768,
      error:     768,
    },
    requiredVectors: ['content', 'signature'],
    sparseVectorKey: 'bm42_sparse',
  },
};

// ── CLI / env resolution ──────────────────────────────────────────────────────

const APPLY     = process.argv.includes('--apply');
const VERBOSE   = process.argv.includes('--verbose');
const PREFLIGHT = process.argv.includes('--preflight');

function resolveCollection() {
  const idx = process.argv.indexOf('--collection');
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return null;
}

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

const collectionName  = resolveCollection();
const sampleResolved  = resolveSample();
const BATCH_SIZE      = 25;
const QDRANT_URL      = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

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
 * @property {Record<string, boolean>} vector_presence   e.g. { content_384: true }
 * @property {boolean}      bm42_present
 * @property {string|null}  expected_updated_at
 * @property {string|null}  mirrored_updated_at
 * @property {ParityState}  state
 * @property {string[]}     reasons
 */

/**
 * @typedef {Object} QdrantParityReport
 * @property {string}  collection
 * @property {string}  contract_version
 * @property {boolean} legacy_collection
 * @property {string}  status
 * @property {number}  sampled_packets
 * @property {number}  points_present
 * @property {number}  identity_matches
 * @property {number}  current_versions
 * @property {Record<string, number>} vector_counts  per named-vector presence count
 * @property {number}  bm42_present
 * @property {number}  missing_points
 * @property {number}  stale_points
 * @property {number}  incomplete_points
 * @property {number}  contradictions
 */

// ── Preflight: collection schema validation ───────────────────────────────────

/**
 * @typedef {Object} PreflightResult
 * @property {boolean}  passed
 * @property {string[]} errors
 * @property {string[]} warnings
 */

/**
 * Validate that the Qdrant collection matches the registered contract.
 * Checks: collection exists, named-vector names, dimensions, distance metric,
 * BM42 sparse lane, payload indexes.
 * @param {string} name
 * @param {object} contract
 * @returns {Promise<PreflightResult>}
 */
async function runPreflight(name, contract) {
  /** @type {PreflightResult} */
  const result = { passed: true, errors: [], warnings: [] };

  // 1. Collection exists?
  const infoRes = await fetch(`${QDRANT_URL}/collections/${name}`);
  if (!infoRes.ok) {
    result.errors.push(`collection "${name}" not found (HTTP ${infoRes.status})`);
    result.passed = false;
    return result;
  }
  const info = await infoRes.json();
  const config = info?.result?.config ?? {};
  const qdrantVectors = config.params?.vectors ?? {};  // named vectors map

  // 2. Named-vector names and dimensions
  for (const [vecName, expectedDim] of Object.entries(contract.namedVectors)) {
    const qdrantVec = qdrantVectors[vecName];
    if (!qdrantVec) {
      result.errors.push(`named vector "${vecName}" missing from collection`);
      result.passed = false;
      continue;
    }
    const actualSize = qdrantVec.size ?? qdrantVec.dimension;
    if (actualSize !== expectedDim) {
      result.errors.push(
        `named vector "${vecName}" dim=${actualSize}, contract expects ${expectedDim}`
      );
      result.passed = false;
    }
  }

  // 3. Sparse vector lane (BM42) — warn-only; absence is coverage debt not schema error
  const sparseVectors = config.params?.sparse_vectors ?? {};
  if (!sparseVectors[contract.sparseVectorKey ?? 'bm42_sparse']) {
    result.warnings.push(`sparse vector "${contract.sparseVectorKey}" absent — BM42 lane not configured`);
  }

  // 4. Payload indexes — warn-only
  const indexRes = await fetch(`${QDRANT_URL}/collections/${name}/index`).catch(() => null);
  if (!indexRes || !indexRes.ok) {
    result.warnings.push('could not retrieve payload index info');
  } else {
    const indexData = await indexRes.json();
    const indexed = Object.keys(indexData?.result?.field_index_info ?? {});
    for (const field of ['packet_key', 'source_ref', 'feature_id']) {
      if (!indexed.includes(field)) {
        result.warnings.push(`payload field "${field}" has no index`);
      }
    }
  }

  return result;
}

// ── Qdrant helpers ────────────────────────────────────────────────────────────

/**
 * Batch-retrieve points from Qdrant (one HTTP round-trip for the whole batch).
 * @param {string[]} pointIds
 * @param {string} collection
 * @returns {Promise<Map<string, object>>}
 */
async function qdrantBatchRetrieve(pointIds, collection) {
  const url = `${QDRANT_URL}/collections/${collection}/points/retrieve`;
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

/**
 * Set (merge) payload fields on an existing Qdrant point.
 * @param {string} pointId
 * @param {object} payload
 * @param {string} collection
 */
async function qdrantUpsertPayload(pointId, payload, collection) {
  const url = `${QDRANT_URL}/collections/${collection}/points/payload`;
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
 * Classify a single Postgres row against its Qdrant point.
 * @param {object} pgRow   Postgres atlas_packets row
 * @param {object|null} point  Qdrant point (with_vector=true) or null
 * @param {object} contract    Collection contract from COLLECTION_CONTRACTS
 * @returns {QdrantParityRow}
 */
function classifyParity(pgRow, point, contract) {
  /** @type {QdrantParityRow} */
  const row = {
    packet_id:          pgRow.id,
    packet_key:         pgRow.packet_key,
    qdrant_point_id:    pgRow.qdrant_point_id,
    point_present:      point !== null,
    packet_key_matches: null,
    source_ref_matches: null,
    vector_presence:    {},
    bm42_present:       false,
    expected_updated_at: pgRow.updated_at?.toISOString() ?? null,
    mirrored_updated_at: null,
    state:   'ok',
    reasons: [],
  };

  if (!point) {
    row.state = 'missing_point';
    row.reasons.push('point absent in Qdrant');
    return row;
  }

  const payload = point.payload ?? {};
  row.mirrored_updated_at = payload.updated_at ?? null;

  // ── Identity checks (contradiction = FAIL) ───────────────────────────────

  if (payload.packet_key !== undefined) {
    row.packet_key_matches = payload.packet_key === pgRow.packet_key;
  }

  if (row.packet_key_matches === false) {
    row.state = 'identity_contradiction';
    row.reasons.push(
      `packet_key: qdrant="${payload.packet_key}" ≠ postgres="${pgRow.packet_key}"`
    );
  }

  if (payload.source_ref !== undefined) {
    row.source_ref_matches = payload.source_ref === pgRow.source_ref;
    if (row.source_ref_matches === false) {
      if (row.state !== 'identity_contradiction') row.state = 'identity_contradiction';
      row.reasons.push(
        `source_ref: qdrant="${payload.source_ref}" ≠ postgres="${pgRow.source_ref}"`
      );
    }
  }

  if (row.state === 'identity_contradiction') return row;

  // ── Named vector checks (dimension per contract) ─────────────────────────

  const vectors = point.vectors ?? {};
  const namedVectors = typeof vectors === 'object' && !Array.isArray(vectors) ? vectors : {};

  for (const [vecName, expectedDim] of Object.entries(contract.namedVectors)) {
    const vec = namedVectors[vecName];
    row.vector_presence[vecName] = Array.isArray(vec) && vec.length > 0;

    if (Array.isArray(vec) && vec.length > 0 && vec.length !== expectedDim) {
      if (row.state !== 'projection_contradiction') row.state = 'projection_contradiction';
      row.reasons.push(
        `named vector "${vecName}" has dim=${vec.length}, contract expects ${expectedDim}`
      );
    }
  }

  if (row.state === 'projection_contradiction') return row;

  // BM42 sparse payload presence
  row.bm42_present = payload[contract.sparseVectorKey] != null;

  // Required vector absence → incomplete
  const missingRequired = contract.requiredVectors.filter(n => !row.vector_presence[n]);
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

/**
 * Mutable projection-metadata only — never invents vectors or point IDs.
 * Allowed fields: packet_id, packet_key, source_ref, aggregate_version,
 * classifier_version, title_generator_version, reranker_version, and
 * domain/topology metadata.
 */
function buildCanonicalPayload(pgRow) {
  return {
    packet_id:                 pgRow.id,
    packet_key:                pgRow.packet_key,
    source_ref:                pgRow.source_ref,
    feature_id:                pgRow.feature_id    ?? null,
    feature_label:             pgRow.feature_label ?? null,
    domain_class:              pgRow.domain_class  ?? null,
    summary:                   pgRow.summary       ?? null,
    title_id:                  pgRow.title_id      ?? null,
    tags:                      pgRow.tags          ?? [],
    aggregate_version:         pgRow.aggregate_version         ?? null,
    classifier_version:        pgRow.classifier_version        ?? null,
    title_generator_version:   pgRow.title_generator_version   ?? null,
    reranker_version:          pgRow.reranker_version          ?? null,
    updated_at:                pgRow.updated_at?.toISOString() ?? new Date().toISOString(),
  };
}

// ── Repair event generators ───────────────────────────────────────────────────

/**
 * @typedef {Object} RepairEvent
 * @property {string}  event_type        'full_projection'|'payload_repair'|'summary_vector_repair'|'quarantine'
 * @property {string}  packet_key
 * @property {string}  packet_id
 * @property {string}  qdrant_point_id
 * @property {string}  collection
 * @property {string[]} [missing_components]   for full_projection events
 * @property {object}  [payload]              for payload_repair events
 * @property {string}  reason
 */

/**
 * @param {QdrantParityRow} parityRow
 * @param {object} pgRow
 * @param {string} collection
 * @returns {RepairEvent[]}
 */
function generateRepairEvents(parityRow, pgRow, collection) {
  const events = [];
  const base = {
    packet_key:     parityRow.packet_key,
    packet_id:      parityRow.packet_id,
    qdrant_point_id: parityRow.qdrant_point_id,
    collection,
  };

  switch (parityRow.state) {
    case 'missing_point': {
      // full_projection → outbox only; this script never creates Qdrant points
      const missing = ['point', ...Object.keys(COLLECTION_CONTRACTS[collection]?.namedVectors ?? {})];
      events.push({
        ...base,
        event_type: 'full_projection',
        missing_components: missing,
        reason: 'point absent in Qdrant',
      });
      break;
    }

    case 'stale_point':
      events.push({
        ...base,
        event_type: 'payload_repair',
        payload: buildCanonicalPayload(pgRow),
        reason: parityRow.reasons.join('; '),
      });
      break;

    case 'incomplete_point': {
      events.push({
        ...base,
        event_type: 'payload_repair',
        payload: buildCanonicalPayload(pgRow),
        reason: parityRow.reasons.join('; '),
      });
      // Missing summary vector specifically needs its own repair lane
      const contract = COLLECTION_CONTRACTS[collection];
      const summaryVecName = contract
        ? Object.keys(contract.namedVectors).find(n => n.includes('summary'))
        : undefined;
      if (summaryVecName && !parityRow.vector_presence[summaryVecName]) {
        events.push({
          ...base,
          event_type: 'summary_vector_repair',
          reason: `${summaryVecName} absent`,
        });
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

/**
 * Apply a payload_repair event.
 * Guards: only payload_repair events accepted; legacy collections rejected;
 * compare-before-write rejects when Qdrant aggregate_version >= Postgres version.
 * @param {RepairEvent} event
 * @param {object} currentQdrantPayload  live Qdrant payload at time of classification
 * @param {pg.PoolClient} client
 * @param {object} contract
 * @param {string} collection
 * @returns {Promise<{event_type: string, packet_key: string, result: string, outbox_event_id: string}>}
 */
async function applyPayloadRepair(event, currentQdrantPayload, client, contract, collection) {
  // Only payload_repair allowed here — full_projection / quarantine are never applied by this fn
  if (event.event_type !== 'payload_repair') {
    return { event_type: event.event_type, packet_key: event.packet_key,
             result: `skipped:not_payload_repair`, outbox_event_id: '' };
  }

  // Never repair legacy collections
  if (contract.legacy) {
    return { event_type: event.event_type, packet_key: event.packet_key,
             result: `skipped:legacy_collection`, outbox_event_id: '' };
  }

  // Compare-before-write: reject when Qdrant appears newer than Postgres event
  const qdrantVersion = Number(currentQdrantPayload?.aggregate_version ?? -1);
  const pgVersion     = Number(event.payload?.aggregate_version ?? -1);
  if (qdrantVersion >= 0 && pgVersion >= 0 && qdrantVersion >= pgVersion) {
    return { event_type: event.event_type, packet_key: event.packet_key,
             result: `skipped:qdrant_version_newer_or_equal(qdrant=${qdrantVersion},pg=${pgVersion})`,
             outbox_event_id: '' };
  }

  const outboxId = createHash('sha256')
    .update(`${event.packet_key}:${event.event_type}`)
    .digest('hex')
    .slice(0, 16);

  let result = 'dry-run';

  if (APPLY) {
    try {
      await qdrantUpsertPayload(event.qdrant_point_id, event.payload, collection);

      await client.query(`
        INSERT INTO atlas_qdrant_repair_log (
          packet_key, qdrant_point_id, collection_name, repair_reason,
          vector_names_written, payload_fields_written,
          outbox_event_id, attempt_count, result, repaired_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 'success', NOW())
        ON CONFLICT (packet_key, outbox_event_id) DO NOTHING
      `, [
        event.packet_key,
        event.qdrant_point_id,
        collection,
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

// ── Quarantine persistence ────────────────────────────────────────────────────

/**
 * Persist contradiction rows to atlas_projection_quarantine.
 * @param {QdrantParityRow[]} quarantined
 * @param {string} collection
 * @param {string} runId
 * @param {pg.PoolClient} client
 */
async function persistQuarantine(quarantined, collection, runId, client) {
  if (quarantined.length === 0) return;

  await client.query(`
    CREATE TABLE IF NOT EXISTS atlas_projection_quarantine (
      quarantine_id      BIGSERIAL PRIMARY KEY,
      packet_id          TEXT NOT NULL,
      packet_key         TEXT NOT NULL,
      qdrant_point_id    TEXT,
      collection_name    TEXT NOT NULL,
      contradiction_type TEXT NOT NULL,
      expected_value     TEXT,
      observed_value     TEXT,
      report_run_id      TEXT NOT NULL,
      detected_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at        TIMESTAMPTZ,
      resolution         TEXT,
      UNIQUE (packet_key, collection_name, report_run_id)
    )
  `).catch(err => console.warn(`⚠️  Quarantine table: ${err.message}`));

  for (const row of quarantined) {
    const firstReason = row.reasons[0] ?? '';
    await client.query(`
      INSERT INTO atlas_projection_quarantine
        (packet_id, packet_key, qdrant_point_id, collection_name, contradiction_type,
         expected_value, observed_value, report_run_id, detected_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (packet_key, collection_name, report_run_id) DO NOTHING
    `, [
      row.packet_id,
      row.packet_key,
      row.qdrant_point_id,
      collection,
      row.state,        // 'identity_contradiction' | 'projection_contradiction'
      null,             // expected_value — populated from reason text where parseable
      firstReason,
      runId,
    ]).catch(err => {
      if (VERBOSE) console.warn(`  quarantine insert: ${err.message}`);
    });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const runId = createHash('sha256')
    .update(`${Date.now()}:${process.pid}`)
    .digest('hex')
    .slice(0, 16);

  // ── Validate --collection flag ─────────────────────────────────────────────

  if (!collectionName) {
    console.error('❌  --collection <name> is required.\n');
    console.error('Available collections:');
    for (const [name, c] of Object.entries(COLLECTION_CONTRACTS)) {
      console.error(`  ${name}  (${c.contractVersion})${c.legacy ? '  ⚠️  LEGACY/READ-ONLY' : ''}`);
    }
    process.exit(1);
  }

  const contract = COLLECTION_CONTRACTS[collectionName];
  if (!contract) {
    console.error(`❌  Unknown collection "${collectionName}". Registered collections:`);
    for (const name of Object.keys(COLLECTION_CONTRACTS)) console.error(`  ${name}`);
    process.exit(1);
  }

  // ── Header ─────────────────────────────────────────────────────────────────

  console.log('🔍 Qdrant Parity Audit + Bounded Repair\n');
  console.log(`Collection:       ${collectionName}`);
  console.log(`Contract:         ${contract.contractVersion}`);
  console.log(`Legacy (r/o):     ${contract.legacy}`);
  if (!PREFLIGHT) {
    console.log(`Mode:             ${APPLY ? 'APPLY' : 'DRY RUN'}`);
    console.log(`Sample:           ${sampleResolved.value}  (source: ${sampleResolved.source})`);
  } else {
    console.log(`Mode:             PREFLIGHT`);
  }
  console.log(`Qdrant:           ${QDRANT_URL}`);
  console.log(`Run ID:           ${runId}\n`);

  // ── Preflight mode ─────────────────────────────────────────────────────────

  if (PREFLIGHT) {
    console.log('Running preflight schema validation…\n');
    const pf = await runPreflight(collectionName, contract);

    if (pf.errors.length > 0) {
      console.log('❌  PREFLIGHT FAIL\n');
      for (const e of pf.errors) console.log(`  ERROR:   ${e}`);
    } else {
      console.log('✅  PREFLIGHT PASS\n');
    }
    if (pf.warnings.length > 0) {
      for (const w of pf.warnings) console.log(`  WARNING: ${w}`);
    }

    process.exit(pf.passed ? 0 : 1);
  }

  // ── Warn if legacy collection selected for apply ───────────────────────────

  if (contract.legacy && APPLY) {
    console.error(`❌  Cannot --apply to legacy collection "${collectionName}" (read-only contract).`);
    process.exit(1);
  }
  if (contract.legacy) {
    console.log('⚠️   Legacy collection — audit only, no repairs will be applied.\n');
  }

  const client = await pool.connect();
  let exitCode = 0;

  try {
    // Ensure repair log table exists (collection_name column added)
    await client.query(`
      CREATE TABLE IF NOT EXISTS atlas_qdrant_repair_log (
        id                     BIGSERIAL PRIMARY KEY,
        packet_key             TEXT NOT NULL,
        qdrant_point_id        TEXT NOT NULL,
        collection_name        TEXT NOT NULL DEFAULT '',
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

    // ── 1. Sample atlas_packets rows targeting this collection ────────────────
    const rows = (await client.query(`
      SELECT
        id, packet_key, source_ref, feature_id, feature_label,
        domain_class, summary, tags, title_id, qdrant_point_id,
        qdrant_collection, updated_at,
        aggregate_version, classifier_version,
        title_generator_version, reranker_version
      FROM atlas_packets
      WHERE qdrant_point_id IS NOT NULL
        AND (qdrant_collection = $1 OR qdrant_collection IS NULL)
      ORDER BY updated_at DESC NULLS LAST
      LIMIT $2
    `, [collectionName, sampleResolved.value])).rows;

    console.log(`Packets sampled: ${rows.length.toLocaleString()}`);

    if (rows.length === 0) {
      console.log('\n✅ No atlas_packets rows target this collection. Nothing to audit.');
      await pool.end().catch(() => {});
      process.exit(0);
    }

    // ── 2. Build counters keyed to contract vectors ───────────────────────────
    const vectorCounts = Object.fromEntries(
      Object.keys(contract.namedVectors).map(n => [n, 0])
    );
    const report = {
      collection:       collectionName,
      contract_version: contract.contractVersion,
      legacy_collection: contract.legacy,
      status:           'PASS',
      sampled_packets:  0,
      points_present:   0,
      identity_matches: 0,
      current_versions: 0,
      vector_counts:    vectorCounts,
      bm42_present:     0,
      missing_points:   0,
      stale_points:     0,
      incomplete_points: 0,
      contradictions:   0,
    };
    report.sampled_packets = rows.length;

    // ── 3. Classify each point ────────────────────────────────────────────────
    /** @type {QdrantParityRow[]} */
    const classified = [];
    /** @type {Map<string, object>} maps packet_key → live Qdrant payload (for compare-before-write) */
    const qdrantPayloads = new Map();

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const pointIds = batch.map(r => r.qdrant_point_id);

      let pointMap = new Map();
      try {
        pointMap = await qdrantBatchRetrieve(pointIds, collectionName);
      } catch (err) {
        if (VERBOSE) console.warn(`  ⚠️  Batch fetch error: ${err.message}`);
        for (const pgRow of batch) classified.push(classifyParity(pgRow, null, contract));
        process.stdout.write(`\r  Audited: ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length} ...`);
        continue;
      }

      for (const pgRow of batch) {
        const point = pointMap.get(String(pgRow.qdrant_point_id)) ?? null;
        if (point) qdrantPayloads.set(pgRow.packet_key, point.payload ?? {});

        const parityRow = classifyParity(pgRow, point, contract);
        classified.push(parityRow);

        if (parityRow.point_present) {
          report.points_present++;
          if (parityRow.packet_key_matches === true && parityRow.source_ref_matches !== false) {
            report.identity_matches++;
          }
          if (parityRow.state === 'ok') report.current_versions++;
          for (const vecName of Object.keys(contract.namedVectors)) {
            if (parityRow.vector_presence[vecName]) vectorCounts[vecName]++;
          }
          if (parityRow.bm42_present) report.bm42_present++;
        }

        switch (parityRow.state) {
          case 'missing_point':
            report.missing_points++;
            if (VERBOSE) console.log(`  ⚪ missing:      ${pgRow.packet_key}  (${pgRow.qdrant_point_id})`);
            break;
          case 'stale_point':
            report.stale_points++;
            if (VERBOSE) console.log(`  🟡 stale:        ${pgRow.packet_key}  — ${parityRow.reasons.join(', ')}`);
            break;
          case 'incomplete_point':
            report.incomplete_points++;
            if (VERBOSE) console.log(`  🔶 incomplete:   ${pgRow.packet_key}  — ${parityRow.reasons.join(', ')}`);
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

    // ── 4. Compute overall status ─────────────────────────────────────────────
    report.status =
      report.contradictions > 0
        ? 'FAIL'
        : report.missing_points > 0 || report.stale_points > 0 || report.incomplete_points > 0
          ? 'WARN'
          : 'PASS';

    if (report.contradictions > 0) exitCode = 1;

    // ── 5. Print audit report ─────────────────────────────────────────────────
    console.log('\n📊 Parity Audit Report');
    console.log('═'.repeat(62));
    console.log(JSON.stringify(report, null, 2));
    console.log('═'.repeat(62));

    // ── 6. Quarantine persistence ─────────────────────────────────────────────
    const quarantined = classified.filter(r =>
      r.state === 'identity_contradiction' || r.state === 'projection_contradiction'
    );
    if (quarantined.length > 0) {
      console.log(`\n🚫 Quarantined (${quarantined.length} — persisted to atlas_projection_quarantine):`);
      for (const r of quarantined) {
        console.log(`   ${r.packet_key}  ${r.qdrant_point_id}`);
        for (const reason of r.reasons) console.log(`     ${reason}`);
      }
      await persistQuarantine(quarantined, collectionName, runId, client);
    }

    // ── 7. Missing points → outbox events (not applied here) ─────────────────
    const missingRows = classified.filter(r => r.state === 'missing_point');
    if (missingRows.length > 0) {
      console.log(`\n📭 Missing points: ${missingRows.length}`);
      if (!contract.legacy) {
        console.log('   Repair path: outbox full_projection event → fan-out consumer → Qdrant upsert');
        if (VERBOSE) {
          const rowByKey = new Map(rows.map(r => [r.packet_key, r]));
          for (const parityRow of missingRows.slice(0, 5)) {
            const pgRow = rowByKey.get(parityRow.packet_key);
            const events = generateRepairEvents(parityRow, pgRow, collectionName);
            console.log('  ', JSON.stringify(events[0], null, 2));
          }
        } else {
          for (const r of missingRows.slice(0, 5)) {
            console.log(`   ${r.packet_key}  ${r.qdrant_point_id}`);
          }
          if (missingRows.length > 5) console.log(`   … and ${missingRows.length - 5} more`);
        }
      } else {
        console.log('   Legacy collection — skipping repair path output.');
      }
    }

    // ── 8. Payload repairs (stale / incomplete, non-legacy) ───────────────────
    const repairEligible = contract.legacy
      ? []
      : classified.filter(r => r.state === 'stale_point' || r.state === 'incomplete_point');

    if (repairEligible.length > 0) {
      console.log(`\n${APPLY ? 'Applying' : 'Would apply'} payload repairs for ${repairEligible.length} point(s)…`);

      let succeeded = 0;
      let skipped   = 0;
      let failed    = 0;

      const rowByKey = new Map(rows.map(r => [r.packet_key, r]));

      for (const parityRow of repairEligible) {
        const pgRow = rowByKey.get(parityRow.packet_key);
        if (!pgRow) continue;

        const events = generateRepairEvents(parityRow, pgRow, collectionName).filter(
          e => e.event_type === 'payload_repair'
        );
        const livePayload = qdrantPayloads.get(parityRow.packet_key) ?? {};

        for (const event of events) {
          const outcome = await applyPayloadRepair(event, livePayload, client, contract, collectionName);
          if (outcome.result === 'success') succeeded++;
          else if (outcome.result.startsWith('skipped')) {
            skipped++;
            if (VERBOSE) console.log(`   ⏭  ${parityRow.packet_key}: ${outcome.result}`);
          } else if (outcome.result.startsWith('error')) {
            failed++;
            console.error(`   ❌ ${parityRow.packet_key}: ${outcome.result}`);
          }
        }
      }

      console.log(`\nPayload repairs: ${succeeded} succeeded, ${skipped} skipped, ${failed} failed` +
        (!APPLY ? `, ${repairEligible.length} dry-run` : ''));
      if (!APPLY) console.log('Re-run with --apply to write changes.');
      if (failed > 0) exitCode = 1;

    } else if (!contract.legacy && report.stale_points === 0 && report.incomplete_points === 0) {
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
