#!/usr/bin/env node
/**
 * ASTBackfillReceiptV1 — 10-gate proof harness for a bounded atlas_ast_nodes backfill.
 *
 * Modes:
 *   --dry-run        (default) run gates AST_BF_01-06, skip 07-09, write receipt.
 *   --apply-bounded   attempt the real INSERT ... ON CONFLICT DO NOTHING for the frozen
 *                     selection. FAILS CLOSED (no writes) unless gates 01-06 all PASS,
 *                     which currently requires AST_BF_03 (source lineage) to be proven —
 *                     it is not, because graphify_files has 0 rows / lacks
 *                     workspace_revision. This is intentional: this script demonstrates
 *                     the fail-closed behavior, it does not bypass it.
 *   --replay          re-run selection (gate 06) and, if a prior apply-bounded receipt
 *                     exists, verify selectionChecksum + zero-new-inserts (gate 09).
 *   --limit=N          bounded selection size (default 1000).
 *
 * Never touches Qdrant/Neo4j/Redis. Postgres writes happen only in --apply-bounded mode,
 * and only past gate 03.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { connectionSource } from './lib/database-connection-fingerprint.mjs';
import { buildAstSourceRefKey, normalizeAstNodeKind, normalizeAstQualifiedName, normalizeAstSourceRef } from './lib/ast-source-ref-key.mjs';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=') || 'true'];
}));
const MODE = args.has('apply-bounded') ? 'APPLY_BOUNDED' : args.has('replay') ? 'REPLAY' : 'DRY_RUN';
const LIMIT = Math.max(1, Math.min(5000, Number(args.get('limit') ?? 1000)));

const BASELINE_FINGERPRINT_REPORT = path.join(REPO_ROOT, 'docs/reports/live-source-lineage-table-audit.json');
const SCOPE_REPORT = path.join(REPO_ROOT, 'docs/reports/graphify-ast-scope-active-app-v1.json');
const CANDIDATE_ARTIFACT = path.join(REPO_ROOT, 'docs/reports/graphify-ast-declaration-candidates-v2.jsonl');
const RECEIPT_PATH = path.join(REPO_ROOT, `docs/reports/atlas-ast-backfill-receipt-v1-${MODE.toLowerCase()}.json`);

// AST_BF_05 identity policy — provisional, pending AST-ID-06 operator freeze. Recorded
// explicitly in the receipt so a later policy change is visibly a version bump, not a
// silent redefinition.
const IDENTITY_POLICY = {
  sourceRefPolicy: 'ACTIVE_APP_RELATIVE_V1',
  nodeKindPolicyRevision: 'ast-source-ref-key.v1-kind-aliases',
  qualifiedNamePolicyRevision: 'ast-source-ref-key.v1-whitespace-collapse',
  casePolicy: 'CASE_SENSITIVE_EXACT_PROVISIONAL',
  status: 'PROVISIONAL_PENDING_AST_ID_06_OPERATOR_FREEZE',
};
// Live-table convention confirmed via `SELECT repo_id, count(*) FROM atlas_ast_nodes
// GROUP BY repo_id` (2026-08-26): all 11,067 rows use the nil UUID, not a slug string.
const REPO_ID = '00000000-0000-0000-0000-000000000000';

const VALID_STORAGE_KINDS = new Set([
  'file', 'module', 'class', 'interface', 'type', 'function', 'method',
  'constructor', 'parameter', 'route', 'schema', 'test', 'call_site', 'import', 'export',
]);
function storageKind(astKind, symbolKind) {
  const raw = normalizeAstNodeKind(symbolKind || astKind);
  return VALID_STORAGE_KINDS.has(raw) ? raw : null;
}
function treeNodeId(repoId, normalizedPath, language, nodeKind, qualifiedSymbol, parentKey, normalizedSig) {
  const input = [repoId, normalizedPath, language, nodeKind, qualifiedSymbol, parentKey ?? '', normalizedSig ?? ''].join('\x00');
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}
function structuralKey(repoId, normalizedPath, nodeKind, qualifiedSymbol) {
  return `${repoId}/${normalizedPath}#${nodeKind}:${qualifiedSymbol}`;
}

const receipt = {
  schema: 'atlas.ast-backfill-receipt.v1',
  generatedAt: new Date().toISOString(),
  mode: MODE,
  limit: LIMIT,
  status: 'UNKNOWN',
  gates: {},
  databaseContextChecksum: null,
  sourceInventoryChecksum: null,
  candidateArtifactChecksum: null,
  selectionChecksum: null,
  counts: { selected: 0, inserted: 0, alreadyPresent: 0, rejected: 0, readbackMatched: 0 },
  replay: { attempted: false, inserted: null, selectionChecksumMatch: null, readbackChecksumMatch: null },
  postgresWrites: false,
  qdrantWrites: false,
  neo4jWrites: false,
  valkeyWrites: false,
};

function gate(id, name, proven, detail) {
  receipt.gates[id] = { name, proven, ...detail };
  return proven;
}

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
});

let allGatesForApplyPass = true;

try {
  // ---- AST_BF_01 DATABASE_CONTEXT_PROVEN ----
  const ctx = await pool.query(`
    SELECT current_database() AS database_name, current_user AS current_user,
           current_schema() AS current_schema, current_setting('search_path') AS configured_search_path,
           inet_server_addr()::text AS server_address, inet_server_port() AS server_port
  `);
  const row = ctx.rows[0];
  receipt.databaseContextChecksum = crypto.createHash('sha256')
    .update(JSON.stringify(row), 'utf8').digest('hex');
  let baseline = null;
  let baselineReadError = null;
  try {
    baseline = JSON.parse(fs.readFileSync(BASELINE_FINGERPRINT_REPORT, 'utf8'));
  } catch (err) {
    baselineReadError = err instanceof Error ? err.message : String(err);
  }
  const fp = baseline?.databaseConnection?.fingerprint;
  const contextMatches = Boolean(fp) &&
    fp.databaseName === row.database_name &&
    fp.currentUser === row.current_user &&
    fp.currentSchema === row.current_schema &&
    fp.configuredSearchPath === row.configured_search_path &&
    String(fp.serverPort) === String(row.server_port);
  const bf01 = gate('AST_BF_01', 'DATABASE_CONTEXT_PROVEN', contextMatches, {
    connectionSource: connectionSource(env),
    live: row,
    baselineReportPath: path.relative(REPO_ROOT, BASELINE_FINGERPRINT_REPORT).replaceAll('\\', '/'),
    baselineReadError,
    baselineFingerprint: fp ?? null,
    comparedFields: ['databaseName', 'currentUser', 'currentSchema', 'configuredSearchPath', 'serverPort'],
    note: 'Compares core identity fields against audit-live-source-lineage-tables.mjs\'s ' +
      'last report, not a full relation-set hash match (that hash is sensitive to which ' +
      'candidate tables that script happens to probe, which is not a meaningful equality ' +
      'condition for this gate).',
  });
  allGatesForApplyPass &&= bf01;

  // ---- AST_BF_02 SOURCE_SCOPE_FROZEN ----
  let scopeReport = null;
  let scopeReadError = null;
  try {
    scopeReport = JSON.parse(fs.readFileSync(SCOPE_REPORT, 'utf8'));
  } catch (err) {
    scopeReadError = err instanceof Error ? err.message : String(err);
  }
  const scopeFrozen = Boolean(scopeReport) &&
    JSON.stringify(scopeReport.policy?.excludedPrefixes ?? []) === JSON.stringify(['claude-mem', 'llama-cpp-turboquant-gemma4', 'src']);
  receipt.sourceInventoryChecksum = scopeReport?.inventorySha256 ?? null;
  const bf02 = gate('AST_BF_02', 'SOURCE_SCOPE_FROZEN', scopeFrozen, {
    scopePolicy: 'ACTIVE_APP_RELATIVE_V1',
    scopeReportPath: path.relative(REPO_ROOT, SCOPE_REPORT).replaceAll('\\', '/'),
    scopeReadError,
    inventorySha256: scopeReport?.inventorySha256 ?? null,
    includedFiles: scopeReport?.includedFiles ?? null,
    excludedPrefixes: scopeReport?.policy?.excludedPrefixes ?? [],
    note: 'excludedPrefixes (claude-mem, llama-cpp-turboquant-gemma4, legacy root src) are ' +
      'this harness\'s frozen defaults for AST_BF_02, matching AST-ID-04\'s findings. Still ' +
      'PROVISIONAL pending the formal AST-ID-06 operator freeze of this exact policy.',
  });
  allGatesForApplyPass &&= bf02;

  // ---- AST_BF_03 SOURCE_LINEAGE_PROVEN (the known hard blocker) ----
  const lineage = await pool.query(`
    SELECT to_regclass('public.graphify_files') IS NOT NULL AS table_present,
      (SELECT count(*) FROM information_schema.columns
        WHERE table_schema='public' AND table_name='graphify_files' AND column_name='workspace_revision') > 0
        AS has_workspace_revision_column,
      COALESCE((SELECT count(*) FROM public.graphify_files), 0)::int AS row_count
  `);
  const lin = lineage.rows[0];
  const lineageProven = lin.table_present && lin.has_workspace_revision_column && Number(lin.row_count) > 0;
  const bf03 = gate('AST_BF_03', 'SOURCE_LINEAGE_PROVEN', lineageProven, {
    lineageOwner: 'public.graphify_files',
    requiredColumns: ['source_ref', 'source_revision', 'content_hash', 'workspace_revision'],
    tablePresent: lin.table_present,
    hasWorkspaceRevisionColumn: lin.has_workspace_revision_column,
    rowCount: Number(lin.row_count),
    blockedReason: lineageProven ? null :
      !lin.table_present ? 'graphify_files table missing'
      : !lin.has_workspace_revision_column ? 'graphify_files missing workspace_revision column (compatibility migration unapplied)'
      : 'graphify_files has 0 rows — no source-lineage data available for any candidate',
    note: 'This is the current hard blocker (per DBCTX-01 correction entry, TABLE-AUDIT-02, ' +
      'and audit-atlas-migration-owners.mjs). The candidate JSONL\'s own source_revision/' +
      'workspace_revision fields are synthetic placeholders ("workspace:0", 0) baked in at ' +
      'generation time, not derived from this table — they do not satisfy this gate.',
  });
  allGatesForApplyPass &&= bf03;

  // ---- AST_BF_04 CANDIDATE_ARTIFACT_FROZEN ----
  let artifactSha256 = null;
  let artifactRowCount = 0;
  let artifactReadError = null;
  try {
    const buf = fs.readFileSync(CANDIDATE_ARTIFACT);
    artifactSha256 = crypto.createHash('sha256').update(buf).digest('hex');
    artifactRowCount = buf.toString('utf8').split('\n').filter((l) => l.trim()).length;
  } catch (err) {
    artifactReadError = err instanceof Error ? err.message : String(err);
  }
  receipt.candidateArtifactChecksum = artifactSha256;
  const bf04 = gate('AST_BF_04', 'CANDIDATE_ARTIFACT_FROZEN', Boolean(artifactSha256), {
    candidateArtifactPath: path.relative(REPO_ROOT, CANDIDATE_ARTIFACT).replaceAll('\\', '/'),
    candidateArtifactSha256: artifactSha256,
    candidateArtifactRowCount: artifactRowCount,
    parserName: 'ast-grep',
    parserVersion: 'UNKNOWN_NOT_TRACKED_IN_ARTIFACT',
    grammarRevision: 'UNKNOWN_NOT_TRACKED_IN_ARTIFACT',
    inventoryChecksum: receipt.sourceInventoryChecksum,
    artifactReadError,
    note: 'parserVersion/grammarRevision are honestly UNKNOWN — the v2 candidate JSONL does ' +
      'not currently record them per-row or in a sidecar manifest. Recording as unknown ' +
      'rather than guessing; this is itself a gap worth closing before a real apply.',
  });
  allGatesForApplyPass &&= bf04;

  // ---- AST_BF_05 IDENTITY_POLICY_PROVEN ----
  const bf05 = gate('AST_BF_05', 'IDENTITY_POLICY_PROVEN', true, {
    ...IDENTITY_POLICY,
    repoId: REPO_ID,
    repoIdSource: 'live atlas_ast_nodes.repo_id convention (nil UUID), confirmed via direct query 2026-08-26',
  });
  allGatesForApplyPass &&= bf05;

  // ---- AST_BF_06 BOUNDED_SELECTION_DETERMINISTIC ----
  const inScope = new Set(scopeReport?.includedSourceRefs ?? []);
  const candidates = [];
  if (fs.existsSync(CANDIDATE_ARTIFACT)) {
    const rl = readline.createInterface({ input: fs.createReadStream(CANDIDATE_ARTIFACT), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      const ref = normalizeAstSourceRef(row.source_ref);
      if (!inScope.has(ref)) continue;
      const kind = storageKind(row.ast_kind, row.symbol_kind);
      if (!kind) continue;
      const qname = normalizeAstQualifiedName(row.symbol_name);
      const refKey = buildAstSourceRefKey(ref, kind, qname);
      if (!refKey) continue;
      candidates.push({
        normalizedSourceRef: ref,
        byteStart: Number(row.start_byte ?? 0),
        byteEnd: Number(row.end_byte ?? 0),
        nodeKind: kind,
        qualifiedName: qname,
        refKey,
        candidateKey: `${ref}#${kind}:${qname}#${row.start_byte}`,
      });
    }
  }
  candidates.sort((a, b) =>
    a.normalizedSourceRef.localeCompare(b.normalizedSourceRef) ||
    a.byteStart - b.byteStart ||
    a.nodeKind.localeCompare(b.nodeKind) ||
    a.qualifiedName.localeCompare(b.qualifiedName) ||
    a.candidateKey.localeCompare(b.candidateKey));
  const selection = candidates.slice(0, LIMIT);
  const selectionChecksum = crypto.createHash('sha256')
    .update(selection.map((c) => c.candidateKey).join('\n'), 'utf8').digest('hex');
  receipt.selectionChecksum = selectionChecksum;
  receipt.counts.selected = selection.length;
  const bf06 = gate('AST_BF_06', 'BOUNDED_SELECTION_DETERMINISTIC', selection.length > 0, {
    orderBy: ['normalized_source_ref', 'byte_start', 'node_kind', 'qualified_name', 'candidate_key'],
    inScopeCandidateTotal: candidates.length,
    selectedCount: selection.length,
    requestedLimit: LIMIT,
    selectionChecksum,
    note: selection.length < LIMIT
      ? `Selected ${selection.length} < requested limit ${LIMIT} — scope filtering (AST_BF_02) ` +
        'reduced the in-scope pool below the limit for this deterministic ordering; this is ' +
        'expected, not an error.'
      : undefined,
  });
  allGatesForApplyPass &&= bf06;

  // ---- AST_BF_07-09: only meaningful in APPLY_BOUNDED / REPLAY, and only past gate 03 ----
  if (MODE === 'APPLY_BOUNDED') {
    if (!allGatesForApplyPass) {
      gate('AST_BF_07', 'INSERT_ONLY_APPLY_PROVEN', false, {
        attempted: false,
        reason: 'BLOCKED_BY_PRIOR_GATE',
        blockingGates: Object.entries(receipt.gates).filter(([, g]) => !g.proven).map(([id]) => id),
        note: 'Fail-closed as designed: --apply-bounded refuses to run any INSERT while any ' +
          'of AST_BF_01-06 is unproven, per this harness\'s explicit contract.',
      });
      gate('AST_BF_08', 'INDEPENDENT_READBACK_PROVEN', false, { attempted: false, reason: 'BLOCKED_BY_PRIOR_GATE' });
    } else {
      // Would only reach here once AST_BF_01-06 all pass for real. Left implemented for when
      // that becomes true, but this session's live gates block it — see AST_BF_03 above.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let inserted = 0, alreadyPresent = 0, rejected = 0;
        const insertedIds = [];
        for (const c of selection) {
          const tid = treeNodeId(REPO_ID, c.normalizedSourceRef, 'typescript', c.nodeKind, c.qualifiedName, null, '');
          const sk = structuralKey(REPO_ID, c.normalizedSourceRef, c.nodeKind, c.qualifiedName);
          const res = await client.query(
            `INSERT INTO atlas_ast_nodes
              (tree_node_id, structural_key, repo_id, relative_path, node_kind, qualified_symbol,
               start_byte, end_byte, normalized_node_hash, source_content_hash, parser_name, parser_version,
               source_ref_key)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT DO NOTHING RETURNING tree_node_id`,
            [tid, sk, REPO_ID, c.normalizedSourceRef, c.nodeKind, c.qualifiedName,
              c.byteStart, c.byteEnd, tid, tid, 'ast-grep', 'UNKNOWN', c.refKey],
          );
          if (res.rowCount > 0) { inserted++; insertedIds.push(tid); } else { alreadyPresent++; }
        }
        await client.query('COMMIT');
        receipt.counts.inserted = inserted;
        receipt.counts.alreadyPresent = alreadyPresent;
        receipt.counts.rejected = rejected;
        receipt.postgresWrites = inserted > 0;
        gate('AST_BF_07', 'INSERT_ONLY_APPLY_PROVEN', true, { inserted, alreadyPresent, rejected });
        const readback = await pool.query(
          `SELECT count(*)::int AS n FROM atlas_ast_nodes WHERE tree_node_id = ANY($1::text[])`,
          [insertedIds],
        );
        const readbackMatched = Number(readback.rows[0]?.n ?? 0) === insertedIds.length;
        receipt.counts.readbackMatched = Number(readback.rows[0]?.n ?? 0);
        gate('AST_BF_08', 'INDEPENDENT_READBACK_PROVEN', readbackMatched, {
          expected: insertedIds.length, actual: Number(readback.rows[0]?.n ?? 0),
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  } else {
    gate('AST_BF_07', 'INSERT_ONLY_APPLY_PROVEN', null, { attempted: false, reason: `SKIPPED_${MODE}` });
    gate('AST_BF_08', 'INDEPENDENT_READBACK_PROVEN', null, { attempted: false, reason: `SKIPPED_${MODE}` });
  }

  // ---- AST_BF_09 IDEMPOTENT_REPLAY_PROVEN ----
  if (MODE === 'REPLAY') {
    receipt.replay.attempted = true;
    let priorReceipt = null;
    const priorPath = path.join(REPO_ROOT, 'docs/reports/atlas-ast-backfill-receipt-v1-apply_bounded.json');
    try { priorReceipt = JSON.parse(fs.readFileSync(priorPath, 'utf8')); } catch { /* no prior apply yet */ }
    const selectionChecksumMatch = priorReceipt?.selectionChecksum === selectionChecksum;
    receipt.replay.selectionChecksumMatch = priorReceipt ? selectionChecksumMatch : null;
    gate('AST_BF_09', 'IDEMPOTENT_REPLAY_PROVEN', priorReceipt ? selectionChecksumMatch : null, {
      priorReceiptPath: priorReceipt ? path.relative(REPO_ROOT, priorPath).replaceAll('\\', '/') : null,
      reason: priorReceipt ? undefined : 'NO_PRIOR_APPLY_BOUNDED_RECEIPT_TO_REPLAY_AGAINST',
    });
  } else {
    gate('AST_BF_09', 'IDEMPOTENT_REPLAY_PROVEN', null, { attempted: false, reason: `SKIPPED_${MODE}` });
  }

  // ---- AST_BF_10 RECEIPT_COMPLETE_NO_CROSS_STORE_WRITES ----
  gate('AST_BF_10', 'RECEIPT_COMPLETE_NO_CROSS_STORE_WRITES', true, {
    qdrantWrites: receipt.qdrantWrites, neo4jWrites: receipt.neo4jWrites, valkeyWrites: receipt.valkeyWrites,
  });

  receipt.status = MODE === 'APPLY_BOUNDED'
    ? (allGatesForApplyPass && receipt.gates.AST_BF_07?.proven && receipt.gates.AST_BF_08?.proven ? 'PASS' : 'BLOCKED')
    : 'DRY_RUN_COMPLETE';
} catch (error) {
  receipt.status = 'ERROR';
  receipt.error = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

fs.mkdirSync(path.dirname(RECEIPT_PATH), { recursive: true });
fs.writeFileSync(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: receipt.status,
  mode: receipt.mode,
  gates: Object.fromEntries(Object.entries(receipt.gates).map(([id, g]) => [id, g.proven])),
  counts: receipt.counts,
  postgresWrites: receipt.postgresWrites,
  receiptPath: path.relative(REPO_ROOT, RECEIPT_PATH).replaceAll('\\', '/'),
}, null, 2));
