#!/usr/bin/env node
/**
 * qdrant-parity-repair.mjs
 *
 * Audits atlas_packets rows against their corresponding Qdrant points and
 * generates bounded repair events for coverage debt.
 *
 * Pure parity logic lives in qdrant-parity-contract.mjs (importable without
 * live Postgres or Qdrant — used by unit tests and the provisioner).
 *
 * Usage:
 *   node scripts/atlas/qdrant-parity-repair.mjs --collection codebase_chunks_384_v2 [--sample N] [--apply] [--verbose]
 *   node scripts/atlas/qdrant-parity-repair.mjs --collection codebase_chunks_384_v2 --preflight
 *   npm run atlas:qdrant:repair
 *   npm run atlas:qdrant:repair:apply
 *   npm run atlas:qdrant:repair:preflight
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  COLLECTION_CONTRACTS,
  resolveSample,
  classifyParity,
  buildCanonicalPayload,
  generateRepairEvents,
  computeOverallStatus,
  outboxEventId,
} from './qdrant-parity-contract.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const WORKSPACE = path.join(REPO_ROOT, 'sveltekit-frontend');
const REPORT_PATH = path.join(WORKSPACE, 'docs', 'reports', 'qdrant-component-parity.json');

// ── CLI flags ─────────────────────────────────────────────────────────────────

const APPLY     = process.argv.includes('--apply');
const VERBOSE   = process.argv.includes('--verbose');
const PREFLIGHT = process.argv.includes('--preflight');

function resolveCollection() {
  const idx = process.argv.findIndex((arg) => arg === '--collection' || arg.startsWith('--collection='));
  if (idx !== -1) {
    const arg = process.argv[idx];
    if (arg.includes('=')) return arg.split('=', 2)[1];
    if (process.argv[idx + 1]) return process.argv[idx + 1];
  }
  return null;
}

const collectionName = resolveCollection();
const sampleResolved = resolveSample();
const BATCH_SIZE     = 25;
const QDRANT_URL     = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

const pool = new Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5434'),
  user:     process.env.DB_USER     || 'legal_admin',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME     || 'legal_ai_db',
  max: 3,
});

// ── Preflight: collection schema validation ───────────────────────────────────

async function runPreflight(name, contract) {
  const result = { passed: true, errors: [], warnings: [] };

  const infoRes = await fetch(`${QDRANT_URL}/collections/${name}`);
  if (!infoRes.ok) {
    result.errors.push(`collection "${name}" not found (HTTP ${infoRes.status})`);
    result.passed = false;
    return result;
  }
  const info = await infoRes.json();
  const config = info?.result?.config ?? {};
  const qdrantVectors = config.params?.vectors ?? {};

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
    const actualDistance = String(qdrantVec.distance ?? qdrantVec.metric ?? '').toLowerCase();
    const expectedDistance = String(contract.distance ?? 'Cosine').toLowerCase();
    if (actualDistance && actualDistance !== expectedDistance) {
      result.errors.push(
        `named vector "${vecName}" distance=${qdrantVec.distance ?? qdrantVec.metric}, contract expects ${contract.distance}`
      );
      result.passed = false;
    }
  }

  const sparseVectors = config.params?.sparse_vectors ?? {};
  if (!sparseVectors[contract.sparseVectorKey ?? 'bm42_sparse']) {
    result.errors.push(`sparse vector "${contract.sparseVectorKey}" absent — BM42 lane not configured`);
    result.passed = false;
  }

  const payloadSchema = info?.result?.payload_schema ?? {};
  const indexed = Object.keys(payloadSchema);
  for (const field of ['packet_key', 'source_ref', 'feature_id', 'domain_class', 'title_id', 'tags', 'updated_at']) {
    if (!indexed.includes(field)) {
      result.errors.push(`payload field "${field}" has no index`);
      result.passed = false;
    }
  }

  return result;
}

// ── Qdrant helpers ────────────────────────────────────────────────────────────

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
  const byId = new Map();
  for (const point of (data.result ?? [])) {
    byId.set(String(point.id), point);
  }
  return byId;
}

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

// ── Repair application ────────────────────────────────────────────────────────

async function applyPayloadRepair(event, currentQdrantPayload, client, contract, collection) {
  if (event.event_type !== 'payload_repair') {
    return { event_type: event.event_type, packet_key: event.packet_key,
             result: 'skipped:not_payload_repair', outbox_event_id: '' };
  }
  if (contract.legacy) {
    return { event_type: event.event_type, packet_key: event.packet_key,
             result: 'skipped:legacy_collection', outbox_event_id: '' };
  }

  const qdrantVersion = Number(currentQdrantPayload?.aggregate_version ?? -1);
  const pgVersion     = Number(event.payload?.aggregate_version ?? -1);
  if (qdrantVersion >= 0 && pgVersion >= 0 && qdrantVersion >= pgVersion) {
    return { event_type: event.event_type, packet_key: event.packet_key,
             result: `skipped:qdrant_version_newer_or_equal(qdrant=${qdrantVersion},pg=${pgVersion})`,
             outbox_event_id: '' };
  }

  const outbox_event_id = outboxEventId(event.packet_key, event.event_type);
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
        outbox_event_id,
      ]).catch(() => {});
      result = 'success';
    } catch (err) {
      result = `error: ${err.message}`;
    }
  }

  return { event_type: event.event_type, packet_key: event.packet_key, result, outbox_event_id };
}

// ── Quarantine persistence ────────────────────────────────────────────────────

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
      row.packet_id, row.packet_key, row.qdrant_point_id,
      collection, row.state, null, firstReason, runId,
    ]).catch(err => { if (VERBOSE) console.warn(`  quarantine insert: ${err.message}`); });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const { createHash } = await import('node:crypto');
  const runId = createHash('sha256')
    .update(`${Date.now()}:${process.pid}`)
    .digest('hex')
    .slice(0, 16);

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

  if (PREFLIGHT) {
    console.log('Running preflight schema validation…\n');
    const pf = await runPreflight(collectionName, contract);
    const preflightReport = {
      generatedAt: new Date().toISOString(),
      mode: 'PREFLIGHT',
      collection: collectionName,
      contract_version: contract.contractVersion,
      legacy_collection: contract.legacy,
      status: pf.passed ? 'PASS' : 'FAIL',
      errors: pf.errors,
      warnings: pf.warnings,
    };
    await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await fs.writeFile(REPORT_PATH, `${JSON.stringify(preflightReport, null, 2)}\n`, 'utf8');
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

    const rows = (await client.query(`
      SELECT
        packet_id, packet_key, source_ref, feature_id, feature_label,
        domain_class, summary, tags, title_id, qdrant_point_id,
        qdrant_collection, updated_at,
        lineage_version AS aggregate_version,
        title_generator_version,
        NULL::text AS classifier_version,
        NULL::text AS reranker_version
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

    const vectorCounts = Object.fromEntries(
      Object.keys(contract.namedVectors).map(n => [n, 0])
    );
    // Optional-completeness counters (do not affect parity status)
    const optionalMissingCounts = Object.fromEntries(
      (contract.recommendedVectors ?? []).map(n => [n, 0])
    );
    const report = {
      collection:       collectionName,
      contract_version: contract.contractVersion,
      legacy_collection: contract.legacy,
      status:           'PASS',
      sampled_packets:  rows.length,
      points_present:   0,
      identity_matches: 0,
      current_versions: 0,
      vector_counts:    vectorCounts,
      optional_missing: optionalMissingCounts,
      bm42_present:     0,
      missing_points:   0,
      stale_points:     0,
      incomplete_points: 0,
      contradictions:   0,
    };

    const classified   = [];
    const qdrantPayloads = new Map();

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch    = rows.slice(i, i + BATCH_SIZE);
      const pointIds = batch.map(r => r.qdrant_point_id);

      let pointMap = new Map();
      try {
        pointMap = await qdrantBatchRetrieve(pointIds, collectionName);
      } catch (err) {
        if (VERBOSE) console.warn(`  ⚠️  Batch fetch error: ${err.message}`);
        for (const pgRow of batch) classified.push(classifyParity(pgRow, null, contract));
        report.missing_points += batch.length;
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

        // Track optional-completeness gaps
        for (const vecName of (parityRow.missing_optional_components ?? [])) {
          if (optionalMissingCounts[vecName] !== undefined) optionalMissingCounts[vecName]++;
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

    report.status = computeOverallStatus(report);
    if (report.contradictions > 0) exitCode = 1;

    console.log('\n📊 Parity Audit Report');
    console.log('═'.repeat(62));
    console.log(JSON.stringify(report, null, 2));
    console.log('═'.repeat(62));
    await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

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

    const repairEligible = contract.legacy
      ? []
      : classified.filter(r => r.state === 'stale_point' || r.state === 'incomplete_point');

    if (repairEligible.length > 0) {
      console.log(`\n${APPLY ? 'Applying' : 'Would apply'} payload repairs for ${repairEligible.length} point(s)…`);
      let succeeded = 0, skipped = 0, failed = 0;
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
