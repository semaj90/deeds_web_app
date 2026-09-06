#!/usr/bin/env node
/**
 * register-orphaned-chunks.mjs
 *
 * Registers orphaned codebase chunks (exist in Qdrant but not in atlas_packets Postgres table)
 * to the canonical identity layer. Creates atlas_packets rows from chunk metadata.
 *
 * Problem: 40K+ chunks were indexed in Qdrant before being registered to atlas_packets.
 * These orphans have no packet_key, directory_path, or feature_id in Postgres.
 * Result: cannot backfill Qdrant payloads (domain_class, packet_key, etc.) until identities exist.
 *
 * Solution:
 *   1. Find all source_ref in codebase_chunk_index that DON'T have atlas_packets rows
 *   2. Extract directory_path and feature_id from source_ref pattern
 *   3. Generate stable packet_key (sha256 hash)
 *   4. INSERT into atlas_packets (ON CONFLICT DO NOTHING for idempotency)
 *   5. Report counts and write JSON audit
 *
 * Usage:
 *   node scripts/atlas/register-orphaned-chunks.mjs              # dry-run (shows what would be registered)
 *   node scripts/atlas/register-orphaned-chunks.mjs --apply      # apply all
 *   node scripts/atlas/register-orphaned-chunks.mjs --apply --limit=5000
 *   node scripts/atlas/register-orphaned-chunks.mjs --apply --verbose
 *   node scripts/atlas/register-orphaned-chunks.mjs --apply --capture-lineage --limit=1
 *   node scripts/atlas/register-orphaned-chunks.mjs --apply --capture-lineage --source-refs-file=path/to/refs.json
 *
 * --capture-lineage is intentionally opt-in. It preserves the historical
 * packet registration default while admitting only memberships backed by a
 * real codebase_chunk_index.chunk_id and graphify_files.workspace_id.
 *
 * --source-refs-file=<path> (added PKT-LINEAGE-08 follow-up, 2026-09) is an
 * explicit allowlist: a JSON file containing an array of exact source_ref
 * strings. When set, orphan selection is restricted to exactly this set
 * (still re-verified live against codebase_chunk_index/atlas_packets, never
 * trusted blindly) instead of the default alphabetical `ORDER BY
 * cci.relative_path LIMIT $1` scan. This exists because that alphabetical
 * scan has no relationship to any external eligibility classification (e.g.
 * the read-only plan-packet-chunk-lineage-promotion-v1.mjs preflight's
 * READY_FOR_AUTHORIZATION candidates) -- without this flag, `--limit=N` picks
 * whichever N orphans sort first, which is not necessarily the set anyone
 * intended to register. `--limit` still applies as an additional cap on top
 * of the allowlist.
 *
 * GRAPHIFY-REVISION-TIEBREAK-FIX-01 (2026-09-05): the --capture-lineage namespace/
 * revision LATERAL join previously picked one graphify_files row per source_ref
 * via `ORDER BY workspace_revision DESC, code_source_revision DESC` -- sorting
 * sha256 content hashes as if they were timestamps. Fixed to join graphify_runs
 * and filter status = 'COMPLETED', tie-broken by the real completed_at timestamp.
 * This remains a legacy bridge over a mutable table, not canonical authority --
 * see scripts/atlas/lib/graphify-source-evidence.mjs.
 *
 * --graphify-snapshot-receipt=<path> (added the same session) further hardens
 * --capture-lineage: when passed, lineage membership is sourced exclusively from
 * the immutable graphify_execution_files ledger for the receipt's proven
 * execution_id, never from graphify_files at all. --capture-lineage without this
 * flag still uses the corrected-but-still-legacy-bridge LATERAL join above for
 * backward-compatible diagnostic use; see the CLI validation below for the exact
 * fail-closed rules once a receipt is supplied.
 *
 * --bounded-lineage-snapshot-receipt=<path> is required for an apply that uses
 * --source-refs-file. It is a bounded source/chunk receipt and deliberately does
 * not require unrelated files to match a full-workspace Graphify snapshot.
 */

import pg        from 'pg';
import Redis     from 'ioredis';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path      from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Config ────────────────────────────────────────────────────────────────────
const APPLY     = process.argv.includes('--apply');
const CAPTURE_LINEAGE = process.argv.includes('--capture-lineage');
const REQUIRE_LINEAGE = process.argv.includes('--require-lineage');
const VERBOSE   = process.argv.includes('--verbose');
const DRY_RUN   = !APPLY;
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const MAX_ROWS  = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 100_000;

const SOURCE_REFS_FILE_ARG = process.argv.find(a => a.startsWith('--source-refs-file='));
const SOURCE_REFS_ALLOWLIST = SOURCE_REFS_FILE_ARG
  ? (() => {
      const filePath = path.resolve(ROOT, SOURCE_REFS_FILE_ARG.split('=').slice(1).join('='));
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== 'string' || !v.trim())) {
        throw new Error(`SOURCE_REFS_FILE_INVALID: ${filePath} must contain a JSON array of non-empty source_ref strings`);
      }
      const set = new Set(parsed.map((v) => v.trim()));
      if (set.size === 0) throw new Error(`SOURCE_REFS_FILE_EMPTY: ${filePath} contains zero source_refs`);
      return set;
    })()
  : null;

// GRAPHIFY-REVISION-TIEBREAK-FIX-01 / CURRENT-SOURCE-SNAPSHOT-RESOLVE-01 hardening
// (2026-09-05): when --capture-lineage is combined with this flag, lineage
// membership is sourced exclusively from the immutable graphify_execution_files
// ledger for the receipt's proven execution_id -- never from graphify_files, not
// even via the corrected legacy-bridge join above. Fails closed on any missing,
// invalid, or unproven receipt. Without this flag, --capture-lineage still uses
// the corrected-but-legacy-bridge LATERAL join (read-only diagnostic use only --
// this repo's own convention is that a legacy bridge over a mutable table must
// never be the sole authority behind a canonical write when a stronger receipt
// mechanism exists).
// Validated against docs/reports/current-source-selection-input-v1.json's ACTUAL
// shape (schema atlas.current-source-selection-input.v1), as emitted by
// scripts/atlas/audit-current-graphify-snapshot-authority-v1.mts -- top-level
// `status`/`executionId`/`workspaceRevision`, NOT nested under a `sourceSnapshot`
// key. (An earlier draft of this validation assumed a nested shape that didn't
// match the actual merged resolver output; caught by the fail-closed acceptance
// tests below before this ever reached a real --apply run.)
const GRAPHIFY_SNAPSHOT_RECEIPT_ARG = process.argv.find(a => a.startsWith('--graphify-snapshot-receipt='));
const GRAPHIFY_SNAPSHOT_RECEIPT = GRAPHIFY_SNAPSHOT_RECEIPT_ARG
  ? (() => {
      const filePath = path.resolve(ROOT, GRAPHIFY_SNAPSHOT_RECEIPT_ARG.split('=').slice(1).join('='));
      let parsed;
      try {
        parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      } catch (error) {
        throw new Error(`GRAPHIFY_SNAPSHOT_RECEIPT_UNREADABLE: ${filePath} (${error instanceof Error ? error.message : String(error)})`);
      }
      if (!parsed || typeof parsed !== 'object') {
        throw new Error(`GRAPHIFY_SNAPSHOT_RECEIPT_INVALID: ${filePath} is not a JSON object`);
      }
      if (parsed.schema !== 'atlas.current-source-selection-input.v1') {
        throw new Error(`GRAPHIFY_SNAPSHOT_RECEIPT_INVALID: ${filePath} schema = ${parsed.schema ?? 'undefined'} (must be atlas.current-source-selection-input.v1)`);
      }
      if (parsed.status !== 'CURRENT_SNAPSHOT_PROVEN') {
        throw new Error(`GRAPHIFY_SNAPSHOT_RECEIPT_NOT_PROVEN: status = ${parsed.status ?? 'undefined'} (must be CURRENT_SNAPSHOT_PROVEN)`);
      }
      if (typeof parsed.executionId !== 'string' || !parsed.executionId.trim()) {
        throw new Error(`GRAPHIFY_SNAPSHOT_RECEIPT_INVALID: ${filePath} executionId must be a non-empty string`);
      }
      return {
        filePath,
        executionId: parsed.executionId.trim(),
        workspaceRevision: parsed.workspaceRevision ?? null,
        workspaceRevisionRecordChecksum: parsed.workspaceRevisionRecordChecksum ?? null,
        workspaceOriginRuntimeRevision: parsed.workspaceOriginRuntimeRevision ?? null,
      };
    })()
  : null;

const BOUNDED_LINEAGE_RECEIPT_ARG = process.argv.find(a => a.startsWith('--bounded-lineage-snapshot-receipt='));
const BOUNDED_LINEAGE_RECEIPT = BOUNDED_LINEAGE_RECEIPT_ARG
  ? (() => {
      const filePath = path.resolve(ROOT, BOUNDED_LINEAGE_RECEIPT_ARG.split('=').slice(1).join('='));
      let parsed;
      try { parsed = JSON.parse(readFileSync(filePath, 'utf8')); }
      catch (error) { throw new Error(`BOUNDED_LINEAGE_RECEIPT_UNREADABLE: ${filePath} (${error instanceof Error ? error.message : String(error)})`); }
      if (!parsed || parsed.schema !== 'atlas.bounded-lineage-snapshot.v1') {
        throw new Error(`BOUNDED_LINEAGE_RECEIPT_INVALID: ${filePath} schema must be atlas.bounded-lineage-snapshot.v1`);
      }
      if (parsed.status !== 'BOUNDED_LINEAGE_SNAPSHOT_PROVEN') {
        throw new Error(`BOUNDED_LINEAGE_RECEIPT_NOT_PROVEN: status = ${parsed.status ?? 'undefined'}`);
      }
      if (!Array.isArray(parsed.targetSourceRefs) || parsed.targetSourceRefs.length === 0 || !Array.isArray(parsed.bindings)) {
        throw new Error(`BOUNDED_LINEAGE_RECEIPT_INVALID: targetSourceRefs and bindings are required`);
      }
      return { filePath, parsed };
    })()
  : null;

if (GRAPHIFY_SNAPSHOT_RECEIPT && BOUNDED_LINEAGE_RECEIPT) {
  throw new Error('LINEAGE_RECEIPT_MODES_MUTUALLY_EXCLUSIVE: choose full Graphify or bounded lineage receipt');
}

// The receipt is mandatory only for the write-capable path. A dry-run
// (--capture-lineage without --apply) may still use the corrected legacy-bridge
// LATERAL join above for read-only diagnostic purposes -- it writes nothing, so
// the weaker bridge evidence is an acceptable diagnostic signal there. The
// write-capable path (--apply --capture-lineage) must never write a lineage row
// derived from anything less than a proven immutable snapshot.
if (APPLY && CAPTURE_LINEAGE && !SOURCE_REFS_ALLOWLIST && !GRAPHIFY_SNAPSHOT_RECEIPT) {
  throw new Error('GRAPHIFY_SNAPSHOT_RECEIPT_REQUIRED: --apply --capture-lineage requires --graphify-snapshot-receipt=<path> (a docs/reports/current-source-selection-input-v1.json with status=CURRENT_SNAPSHOT_PROVEN, produced by scripts/atlas/audit-current-graphify-snapshot-authority-v1.mts). Run without --apply for a read-only diagnostic dry-run instead.');
}

if (APPLY && CAPTURE_LINEAGE && SOURCE_REFS_ALLOWLIST && !BOUNDED_LINEAGE_RECEIPT) {
  throw new Error('BOUNDED_LINEAGE_RECEIPT_REQUIRED: bounded --source-refs-file applies require --bounded-lineage-snapshot-receipt=<path>');
}

if (REQUIRE_LINEAGE && !CAPTURE_LINEAGE) {
  throw new Error('REQUIRE_LINEAGE_REQUIRES_CAPTURE_LINEAGE: --require-lineage must be combined with --capture-lineage');
}

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST   = process.env.REDIS_HOST   || '127.0.0.1';
const REDIS_PORT   = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASS   = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || 'redis';

const DB_BATCH     = 200;  // rows per INSERT batch
const REPORT_DIR   = path.resolve(ROOT, 'docs/reports');

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Extract directory_path from source_ref (e.g. "src/lib/server/auth.ts" → "src/lib/server")
 */
function extractDirectoryPath(sourceRef) {
  if (!sourceRef) return '';
  const parts = sourceRef.split('/');
  return parts.slice(0, -1).join('/') || '.';
}

/**
 * Extract feature_id from source_ref pattern (heuristic)
 * Examples:
 *   "src/lib/server/auth.ts" → "auth"
 *   "src/routes/api/cases/+server.ts" → "cases"
 *   "sveltekit-frontend/src/lib/retrieval/search.ts" → "search"
 */
function extractFeatureId(sourceRef) {
  if (!sourceRef) return 'unknown';

  // Remove extension and path separators
  const base = sourceRef.split('/').pop()?.replace(/\.\w+$/, '') || 'unknown';

  // If it's a route (+server, +page, +layout), use parent directory
  if (base.startsWith('+')) {
    const parts = sourceRef.split('/');
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
  }

  return base;
}

/**
 * Generate stable packet_key from source_ref.
 * Uses the stable legacy `packet:<12hex>` form so the writer stays aligned
 * with the live atlas_packets row family already in the database.
 */
function generatePacketKey(sourceRef) {
  return 'packet:' + createHash('sha256').update(sourceRef).digest('hex').slice(0, 12);
}

/**
 * Determine domain_class heuristic based on source_ref
 * Used as default; will be overridden by classify-domain-ontology.mjs
 */
function inferDomainClass(sourceRef) {
  const lower = (sourceRef || '').toLowerCase();

  if (lower.includes('auth') || lower.includes('login') || lower.includes('user')) return 'auth_login_register';
  if (lower.includes('case') || lower.includes('matter') || lower.includes('client')) return 'case_management';
  if (lower.includes('evidence') || lower.includes('upload')) return 'evidence_upload_storage';
  if (lower.includes('document') || lower.includes('pdf') || lower.includes('parser')) return 'document_processing';
  if (lower.includes('rag') || lower.includes('retrieval') || lower.includes('search') || lower.includes('bm25')) return 'rag_retrieval';
  if (lower.includes('cache') || lower.includes('redis') || lower.includes('bifrost')) return 'cache_layer';
  if (lower.includes('agent') || lower.includes('mcp') || lower.includes('tool')) return 'agent_orchestration';
  if (lower.includes('graph') || lower.includes('neo4j') || lower.includes('topology')) return 'graph_topology';
  if (lower.includes('embed') || lower.includes('vector') || lower.includes('qdrant')) return 'embedding_indexing';

  // Default fallback
  return 'rag_retrieval';
}

/**
 * Write JSON report
 */
function writeReport(report) {
  try {
    mkdirSync(REPORT_DIR, { recursive: true });
    const reportPath = path.join(REPORT_DIR, 'chunk-registration-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(`\nReport: ${reportPath}`);
  } catch (err) {
    console.error(`Failed to write report: ${err.message}`);
  }
}

function assertFreshSnapshotReceipt() {
  if (!(APPLY && CAPTURE_LINEAGE && GRAPHIFY_SNAPSHOT_RECEIPT)) return;
  const tsx = path.resolve(ROOT, 'node_modules/.bin/tsx.cmd');
  if (!existsSync(tsx)) {
    throw new Error('SNAPSHOT_FRESHNESS_CHECK_UNAVAILABLE: node_modules/.bin/tsx.cmd is required before a lineage apply');
  }
  const output = execFileSync(tsx, [
    path.resolve(ROOT, 'scripts/atlas/validate-current-snapshot-receipt-freshness-v1.mts'),
    `--receipt=${GRAPHIFY_SNAPSHOT_RECEIPT.filePath}`,
  ], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  let result;
  try {
    result = JSON.parse(output.trim().split(/\r?\n/).at(-1));
  } catch {
    throw new Error(`SNAPSHOT_FRESHNESS_CHECK_INVALID_OUTPUT: ${output.slice(-500)}`);
  }
  if (result.status !== 'RECEIPT_FRESH_FOR_BOUND_WRITE') {
    throw new Error(`GRAPHIFY_SNAPSHOT_RECEIPT_STALE: ${result.status}; see ${result.reportPath}`);
  }
}

function assertBoundedLineageReceipt() {
  if (!(APPLY && CAPTURE_LINEAGE && BOUNDED_LINEAGE_RECEIPT)) return;
  const receipt = BOUNDED_LINEAGE_RECEIPT.parsed;
  const requested = [...SOURCE_REFS_ALLOWLIST].sort();
  const captured = [...new Set(receipt.targetSourceRefs.map((value) => String(value).trim().replaceAll('\\', '/')))].sort();
  if (requested.length !== captured.length || requested.some((value, index) => value !== captured[index])) {
    throw new Error('BOUNDED_LINEAGE_TARGET_SET_MISMATCH: receipt targetSourceRefs must exactly cover --source-refs-file');
  }
  for (const binding of receipt.bindings) {
    const sourceRef = String(binding.sourceRef);
    const absolute = path.resolve(ROOT, sourceRef);
    if (!existsSync(absolute)) throw new Error(`TARGET_SOURCE_MISSING:${sourceRef}`);
    const bytes = readFileSync(absolute);
    const currentDigest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    if (currentDigest !== `sha256:${String(binding.contentDigest).replace(/^sha256:/i, '').toLowerCase()}`) {
      throw new Error(`TARGET_SOURCE_CONTENT_DRIFT:${sourceRef}`);
    }
    if (bytes.byteLength !== Number(binding.byteLength)) throw new Error(`TARGET_SOURCE_BYTE_LENGTH_DRIFT:${sourceRef}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n═══ Chunk Registration ${DRY_RUN ? '(DRY_RUN)' : '(APPLY)'} ═══\n`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

  if (CAPTURE_LINEAGE) {
    const { rows } = await pool.query(`
      SELECT to_regclass('public.atlas_packet_chunk_lineage') AS lineage_table
    `);
    if (!rows[0]?.lineage_table) {
      throw new Error('LINEAGE_TABLE_UNAVAILABLE: --capture-lineage requires the additive atlas_packet_chunk_lineage table; no schema change is attempted');
    }
  }

  let redis = null;
  let redisReady = false;
  try {
    redis = new Redis({
      host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS,
      lazyConnect: true, maxRetriesPerRequest: 1,
      enableOfflineQueue: false, retryStrategy: () => null,
    });
    redis.on('error', () => {});
    await redis.connect();
    await redis.ping();
    redisReady = true;
    console.log('Redis: connected');
  } catch {
    console.log('Redis: offline (optional)');
  }

  try {
    // ── 1. Find orphaned chunks ────────────────────────────────────────────────
    console.log('\nFinding orphaned chunks...');
    let orphans;
    let allowlistStats = null;
    if (SOURCE_REFS_ALLOWLIST) {
      // Explicit allowlist path: verify each requested source_ref is actually a
      // real, current orphan (never trust the file's contents blindly -- the
      // eligibility classification that produced the file may be stale).
      const { rows } = await pool.query(`
        SELECT DISTINCT cci.relative_path as source_ref
        FROM codebase_chunk_index cci
        WHERE NULLIF(BTRIM(cci.relative_path), '') IS NOT NULL
          AND cci.relative_path = ANY($1::text[])
          AND cci.relative_path NOT IN (SELECT source_ref FROM atlas_packets WHERE source_ref IS NOT NULL)
        ORDER BY cci.relative_path
        LIMIT $2
      `, [[...SOURCE_REFS_ALLOWLIST], MAX_ROWS]);
      orphans = rows;
      const foundSet = new Set(rows.map((r) => r.source_ref));
      allowlistStats = {
        requested: SOURCE_REFS_ALLOWLIST.size,
        resolvedAsOrphan: rows.length,
        notFoundOrAlreadyRegistered: [...SOURCE_REFS_ALLOWLIST].filter((s) => !foundSet.has(s)),
      };
      console.log(`Allowlist: requested ${allowlistStats.requested}, resolved ${allowlistStats.resolvedAsOrphan} as real current orphans`);
      if (allowlistStats.notFoundOrAlreadyRegistered.length > 0) {
        console.log(`  Not found as a live orphan (already registered, or no longer in codebase_chunk_index): ${allowlistStats.notFoundOrAlreadyRegistered.length}`);
      }
    } else {
      const { rows } = await pool.query(`
        SELECT DISTINCT cci.relative_path as source_ref
        FROM codebase_chunk_index cci
        WHERE NULLIF(BTRIM(cci.relative_path), '') IS NOT NULL
          AND cci.relative_path NOT IN (SELECT source_ref FROM atlas_packets WHERE source_ref IS NOT NULL)
        ORDER BY cci.relative_path
        LIMIT $1
      `, [MAX_ROWS]);
      orphans = rows;
    }

    console.log(`Found ${orphans.length.toLocaleString()} orphaned source_refs`);

    if (orphans.length === 0) {
      console.log('No orphans to register.');
      writeReport({
        generated: new Date().toISOString(),
        mode: APPLY ? 'apply' : 'dry-run',
        orphaned_found: 0,
        registered: 0,
        status: 'no_orphans'
      });
      return;
    }

    // ── 2. Build registration payload ──────────────────────────────────────────
    console.log('\nPreparing registration payload...');
    const toRegister = orphans.map(o => {
      const sourceRef = String(o.source_ref ?? '').trim();
      if (!sourceRef) throw new Error('SOURCE_REF_REQUIRED: refusing to prepare an orphan registration without a non-empty source_ref');
      const directoryPath = extractDirectoryPath(sourceRef);
      const featureId = extractFeatureId(sourceRef);
      const packetKey = generatePacketKey(sourceRef);
      const domainClass = inferDomainClass(sourceRef);

      return {
        packet_key: packetKey,
        source_ref: sourceRef,
        directory_path: directoryPath,
        feature_id: featureId,
        domain_class: domainClass,  // Heuristic; overridden by classify-domain-ontology
        source_kind: 'codebase_chunk',
        created_at: new Date(),
        updated_at: new Date(),
      };
    });

    // Re-materialize and compare the live workspace immediately before any
    // lineage-bearing INSERT. A receipt that was valid for an earlier tree is
    // never sufficient for a current write.
    if (BOUNDED_LINEAGE_RECEIPT) assertBoundedLineageReceipt();
    else assertFreshSnapshotReceipt();

    const lineageBySourceRef = new Map();
    if (CAPTURE_LINEAGE && BOUNDED_LINEAGE_RECEIPT) {
      for (const binding of BOUNDED_LINEAGE_RECEIPT.parsed.bindings) {
        for (const chunk of binding.chunks ?? []) {
          const list = lineageBySourceRef.get(binding.sourceRef) ?? [];
          list.push({
            source_ref: binding.sourceRef,
            canonical_chunk_id: chunk.canonicalChunkId,
            chunk_row_id: chunk.chunkRowId,
            workspace_id: BOUNDED_LINEAGE_RECEIPT.parsed.workspaceId,
            source_revision: binding.sourceRevision,
          });
          lineageBySourceRef.set(binding.sourceRef, list);
        }
      }
    } else if (CAPTURE_LINEAGE && GRAPHIFY_SNAPSHOT_RECEIPT) {
      // Receipt-driven path: membership is read exclusively from the immutable
      // graphify_execution_files ledger for the receipt's proven execution_id --
      // graphify_files is not consulted at all here, so its mutability and the
      // now-fixed (but still legacy) tie-break are entirely bypassed.
      const sourceRefs = toRegister.map(row => row.source_ref);
      const { rows: lineageRows } = await pool.query(`
        SELECT
          cci.relative_path AS source_ref,
          cci.chunk_id AS canonical_chunk_id,
          MIN(cci.id::text) AS chunk_row_id,
          ge.workspace_id::text AS workspace_id,
          NULLIF(BTRIM(gef.code_source_revision::text), '') AS source_revision
        FROM codebase_chunk_index cci
        JOIN graphify_execution_files gef
          ON gef.source_ref = cci.relative_path AND gef.execution_id = $2::uuid
        JOIN graphify_executions ge ON ge.execution_id = gef.execution_id
        WHERE cci.relative_path = ANY($1::text[])
          AND NULLIF(BTRIM(cci.chunk_id::text), '') IS NOT NULL
        GROUP BY cci.relative_path, cci.chunk_id, ge.workspace_id, gef.code_source_revision
        ORDER BY cci.relative_path, cci.chunk_id
      `, [sourceRefs, GRAPHIFY_SNAPSHOT_RECEIPT.executionId]);

      for (const row of lineageRows) {
        const list = lineageBySourceRef.get(row.source_ref) ?? [];
        list.push(row);
        lineageBySourceRef.set(row.source_ref, list);
      }
    } else if (CAPTURE_LINEAGE) {
      // Legacy-bridge path (diagnostic dry-run only -- see the APPLY-gate check
      // above; this branch can never be reached with --apply).
      const sourceRefs = toRegister.map(row => row.source_ref);
      const { rows: lineageRows } = await pool.query(`
        SELECT
          cci.relative_path AS source_ref,
          cci.chunk_id AS canonical_chunk_id,
          MIN(cci.id::text) AS chunk_row_id,
          gf.workspace_id::text AS workspace_id,
          NULLIF(BTRIM(gf.code_source_revision::text), '') AS source_revision
        FROM codebase_chunk_index cci
        LEFT JOIN LATERAL (
          SELECT gf.workspace_id, gf.code_source_revision
          FROM graphify_files gf
          JOIN graphify_runs gr ON gr.run_id = gf.last_seen_run_id
          WHERE gf.source_ref = cci.relative_path AND gr.status = 'COMPLETED'
          ORDER BY gr.completed_at DESC, gf.file_id DESC
          LIMIT 1
        ) gf ON TRUE
        WHERE cci.relative_path = ANY($1::text[])
          AND NULLIF(BTRIM(cci.chunk_id::text), '') IS NOT NULL
        GROUP BY cci.relative_path, cci.chunk_id, gf.workspace_id, gf.code_source_revision
        ORDER BY cci.relative_path, cci.chunk_id
      `, [sourceRefs]);

      for (const row of lineageRows) {
        const list = lineageBySourceRef.get(row.source_ref) ?? [];
        list.push(row);
        lineageBySourceRef.set(row.source_ref, list);
      }
    }

    const lineageStats = {
      enabled: CAPTURE_LINEAGE,
      evidenceSource: GRAPHIFY_SNAPSHOT_RECEIPT ? 'graphify_execution_files' : (CAPTURE_LINEAGE ? 'graphify_files_legacy_bridge' : null),
      snapshotReceiptExecutionId: GRAPHIFY_SNAPSHOT_RECEIPT?.executionId ?? null,
      sourceRefsWithNamespace: 0,
      sourceRefsWithoutNamespace: 0,
      membershipsPlanned: 0,
      membershipsWritten: 0,
      membershipsSkipped: 0,
    };

    if (DRY_RUN) {
      console.log(`\n(Dry-run) Would register ${toRegister.length} chunks:`);
      if (VERBOSE && toRegister.length <= 20) {
        for (const reg of toRegister.slice(0, 20)) {
          console.log(`  ${reg.source_ref} → ${reg.feature_id} (${reg.domain_class})`);
        }
        if (toRegister.length > 20) console.log(`  ... and ${toRegister.length - 20} more`);
      } else if (VERBOSE) {
        console.log(`  Sample: ${toRegister[0].source_ref} → ${toRegister[0].feature_id}`);
      }

      writeReport({
        generated: new Date().toISOString(),
        mode: 'dry-run',
        orphaned_found: toRegister.length,
        would_register: toRegister.length,
        status: 'dry_run_complete',
        allowlist: allowlistStats,
        lineage: CAPTURE_LINEAGE ? buildLineagePreview(toRegister, lineageBySourceRef, lineageStats) : lineageStats,
      });
      return;
    }

    if (CAPTURE_LINEAGE) {
      // The opt-in lineage path is per-source transactional: packet creation
      // and its complete real membership set commit together. Sources without
      // graphify_files namespace authority retain the legacy packet behavior,
      // but receive no fabricated lineage row.
      let registered = 0;
      let skipped = 0;
      for (const registration of toRegister) {
        const candidates = lineageBySourceRef.get(registration.source_ref) ?? [];
        const namespace = candidates.find(row => row.workspace_id);
        if (!namespace) {
          lineageStats.sourceRefsWithoutNamespace += 1;
          lineageStats.membershipsSkipped += candidates.length;
        } else {
          lineageStats.sourceRefsWithNamespace += 1;
          lineageStats.membershipsPlanned += candidates.length;
        }
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const packetResult = await client.query(
            `INSERT INTO atlas_packets (packet_id, packet_key, source_ref, directory_path, feature_id, domain_class, source_kind, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
             ON CONFLICT (packet_key) DO NOTHING`,
            [`packet_${createHash('sha256').update(registration.packet_key).digest('hex').slice(0, 24)}`, registration.packet_key, registration.source_ref, registration.directory_path, registration.feature_id, registration.domain_class, registration.source_kind],
          );
          registered += packetResult.rowCount ?? 0;
          if (namespace) {
            const membershipStatus = candidates.length === 1 ? 'EXACT_SINGLE_MEMBER' : 'EXACT_MULTI_MEMBER';
            for (const row of candidates) {
              // chunk_ordinal is intentionally NULL, not the array-iteration
              // index -- per PACKET-CHUNK-LINEAGE-CONTRACT-01 (frozen), no
              // ordinal is invented for this field. codebase_chunk_index has
              // no verified-unique per-file sequence signal (line_start is
              // ~30% populated and non-unique even where present); membership
              // identity uses the sorted, deduplicated canonicalChunkId set
              // instead, which is order-independent by construction.
              const result = await client.query(
                `INSERT INTO atlas_packet_chunk_lineage
                   (packet_key, canonical_chunk_id, chunk_row_id, source_ref, source_namespace, source_revision, membership_status, revision_status, chunk_ordinal, lineage_producer_revision, evidence_refs)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                 ON CONFLICT (packet_key, canonical_chunk_id) DO UPDATE SET
                   chunk_row_id = EXCLUDED.chunk_row_id,
                   source_ref = EXCLUDED.source_ref,
                   source_namespace = EXCLUDED.source_namespace,
                   source_revision = EXCLUDED.source_revision,
                   membership_status = EXCLUDED.membership_status,
                   revision_status = EXCLUDED.revision_status,
                   chunk_ordinal = EXCLUDED.chunk_ordinal,
                   lineage_producer_revision = EXCLUDED.lineage_producer_revision,
                   evidence_refs = EXCLUDED.evidence_refs`,
                [registration.packet_key, row.canonical_chunk_id, row.chunk_row_id, registration.source_ref, `workspace:${row.workspace_id}`, row.source_revision ?? null, membershipStatus, row.source_revision ? 'PROVEN' : 'UNPROVEN', null, 'register-orphaned-chunks:lineage-capture:v1', ['scripts/atlas/register-orphaned-chunks.mjs']],
              );
              lineageStats.membershipsWritten += result.rowCount ?? 0;
            }
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          skipped += 1;
          console.error(`Source failed and was rolled back (${registration.source_ref}): ${err.message}`);
        } finally {
          client.release();
        }
      }
      writeReport({
        generated: new Date().toISOString(),
        mode: 'apply',
        allowlist: allowlistStats,
        lineage: lineageStats,
        orphaned_found: toRegister.length,
        registered,
        skipped,
        status: 'registration_lineage_capture_complete',
      });
      return;
    }

    // ── 3. Apply registration in batches ───────────────────────────────────────
    console.log('\nApplying registration...');
    let registered = 0;
    let skipped = 0;

    for (let i = 0; i < toRegister.length; i += DB_BATCH) {
      const batch = toRegister.slice(i, i + DB_BATCH);

      // Build parameterized INSERT with ALL required columns
      const valueRows = batch.map((_, idx) => {
        return `($${idx * 9 + 1}, $${idx * 9 + 2}, $${idx * 9 + 3}, $${idx * 9 + 4}, $${idx * 9 + 5}, $${idx * 9 + 6}, $${idx * 9 + 7}, $${idx * 9 + 8}, $${idx * 9 + 9})`;
      });
      const flatParams = batch.flatMap((b, idx) => [
        `packet_${idx}_${Date.now()}`,  // packet_id (required, unique)
        b.packet_key,
        b.source_ref,
        b.directory_path,
        b.feature_id,
        b.domain_class,
        b.source_kind,
        b.created_at,
        b.created_at,  // updated_at
      ]);

      const insertSql = `
        INSERT INTO atlas_packets (packet_id, packet_key, source_ref, directory_path, feature_id, domain_class, source_kind, created_at, updated_at)
        VALUES ${valueRows.join(',')}
        ON CONFLICT (packet_key) DO NOTHING
      `;

      try {
        const res = await pool.query(insertSql, flatParams);
        registered += res.rowCount ?? 0;
      } catch (err) {
        console.error(`Batch failed: ${err.message}`);
        skipped += batch.length;
      }

      if ((i + batch.length) % 2000 === 0 || i + batch.length >= toRegister.length) {
        process.stdout.write(`\r  Registered: ${registered}/${toRegister.length}   `);
      }
    }

    console.log(`\n\n✅ Registration complete:`);
    console.log(`  Registered: ${registered}`);
    console.log(`  Skipped:    ${skipped}`);

    // ── 4. Verify counts ──────────────────────────────────────────────────────
    const { rows: countRows } = await pool.query(`
      SELECT COUNT(*) as total FROM atlas_packets WHERE source_kind = 'codebase_chunk'
    `);
    const totalChunkPackets = countRows[0]?.total ?? 0;

    console.log(`\nDatabase state:`);
    console.log(`  Total atlas_packets (codebase_chunk): ${totalChunkPackets}`);

    writeReport({
      generated: new Date().toISOString(),
      mode: 'apply',
      allowlist: allowlistStats,
      orphaned_found: toRegister.length,
      registered: registered,
      skipped: skipped,
      total_chunk_packets: totalChunkPackets,
      status: 'registration_complete'
    });

    console.log('\n✨ Next: run classify-domain-ontology.mjs to assign domain_class');
    console.log('   node scripts/atlas/classify-domain-ontology.mjs --apply --qdrant');

  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
    if (redisReady && redis) await redis.quit();
  }
}

function buildLineagePreview(registrations, lineageBySourceRef, stats) {
  const preview = registrations.map(registration => {
    const candidates = lineageBySourceRef.get(registration.source_ref) ?? [];
    const namespace = candidates.find(row => row.workspace_id);
    if (namespace) {
      stats.sourceRefsWithNamespace += 1;
      stats.membershipsPlanned += candidates.length;
    } else {
      stats.sourceRefsWithoutNamespace += 1;
      stats.membershipsSkipped += candidates.length;
    }
    return {
      source_ref: registration.source_ref,
      packet_key: registration.packet_key,
      namespace_proven: Boolean(namespace),
      chunk_count: candidates.length,
      membership_write: Boolean(namespace),
    };
  });
  return { ...stats, preview };
}

main();
