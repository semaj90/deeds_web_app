#!/usr/bin/env node
/**
 * Read-only plan for repairing the current Graphify source authority join.
 * It produces a candidate input artifact; it never writes canonical or
 * projection state.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { materializeWorkspaceRevisionOriginV1 } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

const reportPath = path.join(REPO_ROOT, 'docs/reports/current-source-authority-repair-plan-v1.json');
const digest = (value: string | Buffer) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const normalizeHash = (value: unknown) => {
  const raw = String(value ?? '').trim().toLowerCase();
  return raw.startsWith('sha256:') ? raw : `sha256:${raw}`;
};
const safePath = (sourceRef: string) => {
  const absolute = path.resolve(REPO_ROOT, sourceRef.replaceAll('\\', '/'));
  return absolute === REPO_ROOT || absolute.startsWith(`${REPO_ROOT}${path.sep}`) ? absolute : null;
};

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 120000,
});

let databaseError: string | null = null;
let ownerRunId: string | null = null;
let graphRows: any[] = [];
let ownerSelection = 'COMPLETED_BOUND_OWNER_BY_FILE_COUNT_FALLBACK';
try {
  // Prefer the canonical Graphify execution's own per-source membership. Picking the run with the
  // most graphify_files rows bound the plan to a non-canonical legacy run (found 2026-09-21:
  // run 48485685 has no execution; the canonical execution's legacy run has 0 graphify_files rows).
  const canonical = await pool.query(`
    SELECT execution_id::text AS execution_id
      FROM public.graphify_executions
     WHERE canonical_authority = true AND status = 'COMPLETED'
     ORDER BY completed_at DESC NULLS LAST, execution_id
     LIMIT 1
  `);
  const canonicalExecutionId: string | null = canonical.rows[0]?.execution_id ?? null;
  if (canonicalExecutionId) {
    const membership = await pool.query(`
      SELECT source_ref, workspace_revision, code_source_revision, content_hash, byte_length
        FROM public.graphify_execution_file_membership_v2
       WHERE execution_id = $1
       ORDER BY source_ref
    `, [canonicalExecutionId]);
    if (membership.rows.length > 0) {
      ownerRunId = canonicalExecutionId;
      ownerSelection = 'CANONICAL_EXECUTION_FILE_MEMBERSHIP_V2';
      graphRows = membership.rows.map((row) => ({ ...row, source_revision: null, parse_status: null, last_seen_run_id: null }));
    }
  }
}
catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
}
try {
  if (graphRows.length > 0 || databaseError) throw new Error('__SKIP_FALLBACK__');
  const owner = await pool.query(`
    SELECT gf.last_seen_run_id AS run_id, COUNT(*)::int AS file_count,
           MAX(gr.completed_at) AS completed_at
      FROM public.graphify_files gf
      JOIN public.graphify_runs gr ON gr.run_id = gf.last_seen_run_id
     WHERE gr.status = 'COMPLETED'
     GROUP BY gf.last_seen_run_id
     HAVING COUNT(*) > 0
     ORDER BY COUNT(*) DESC, MAX(gr.completed_at) DESC, gf.last_seen_run_id
     LIMIT 1
  `);
  ownerRunId = owner.rows[0]?.run_id ?? null;
  if (!ownerRunId) {
    ownerSelection = 'NO_COMPLETED_BOUND_OWNER';
    throw new Error('SOURCE_AUTHORITY_UNAVAILABLE:no completed bound Graphify owner');
  }
  const result = await pool.query(`
    SELECT source_ref, source_revision, code_source_revision, content_hash, workspace_revision,
           byte_length, parse_status, last_seen_run_id
      FROM public.graphify_files
     WHERE last_seen_run_id = $1
     ORDER BY source_ref
  `, [ownerRunId]);
  graphRows = result.rows;
} catch (error) {
  if (!(error instanceof Error && error.message === '__SKIP_FALLBACK__')) {
    databaseError = error instanceof Error ? error.message : String(error);
  }
} finally {
  await pool.end();
}

let currentWorkspace: any = null;
let materializationError: string | null = null;
try {
  currentWorkspace = materializeWorkspaceRevisionOriginV1({
    workspaceRoot: REPO_ROOT,
    repositoryId: path.basename(REPO_ROOT),
    producerRevision: 'atlas.current-source-authority-repair.v1',
  });
} catch (error) {
  materializationError = error instanceof Error ? error.message : String(error);
}

// Submodule contents carry their own commit identity and are not bound by the superproject
// workspace revision (found 2026-09-21: all 1,086 NOT_IN_CURRENT_WORKSPACE rows were submodule
// files). Declare them out of scope for this cohort; report them separately, never as exact.
const submodulePaths: string[] = (() => {
  try {
    return execFileSync('git', ['config', '--file', '.gitmodules', '--get-regexp', '^submodule\\..*\\.path$'], { cwd: REPO_ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean)
      .map((line) => line.split(/\s+/).slice(1).join(' ').replaceAll('\\', '/'));
  } catch {
    return [];
  }
})();
const isSubmodulePath = (ref: string) => submodulePaths.some((sub) => ref === sub || ref.startsWith(`${sub}/`));

const bindingByRef = new Map<string, any>(currentWorkspace?.bindings?.map((binding: any) => [binding.sourceRef, binding]) ?? []);
const rows = graphRows.map((row) => {
  const sourceRef = String(row.source_ref);
  if (isSubmodulePath(sourceRef)) {
    return { sourceRef, status: 'EXCLUDED_SUBMODULE', graphContentHash: row.content_hash ?? null };
  }
  const binding = bindingByRef.get(sourceRef);
  const absolute = safePath(sourceRef);
  if (!absolute || !fs.existsSync(absolute)) {
    return { sourceRef, status: 'SOURCE_UNAVAILABLE', graphSourceRevisionLegacy: row.source_revision ?? null, graphCodeSourceRevision: row.code_source_revision ?? null, graphContentHash: row.content_hash ?? null };
  }
  if (!binding) {
    return { sourceRef, status: 'NOT_IN_CURRENT_WORKSPACE', graphSourceRevisionLegacy: row.source_revision ?? null, graphCodeSourceRevision: row.code_source_revision ?? null, graphContentHash: row.content_hash ?? null };
  }
  const currentBytes = fs.readFileSync(absolute);
  const currentHash = digest(currentBytes);
  const graphHash = normalizeHash(row.content_hash);
  // `source_revision` is a legacy column that (for this cohort) holds a bare git-blob SHA1
  // (40 hex chars), never a sha256 content digest -- normalizeHash() blindly prepending
  // 'sha256:' to it produced a value shaped like a sha256 hash but numerically meaningless,
  // guaranteeing SOURCE_REVISION_MISMATCH on every row regardless of real content freshness
  // (confirmed live: content_hash/code_source_revision already match currentContentDigest
  // exactly for the affected rows). `code_source_revision` is the column the live
  // `chk` constraint (`graphify_files_code_source_revision_sha256_v2`) actually enforces as
  // `^sha256:[a-f0-9]{64}$`, and it already carries the correct value -- compare against that
  // instead. Legacy `source_revision` is still reported (below) for debugging visibility, just
  // no longer used as the comparison authority.
  const graphRevision = row.code_source_revision ? normalizeHash(row.code_source_revision) : null;
  const mismatchReasons = [
    ...(currentHash !== graphHash ? ['CONTENT_DIGEST_MISMATCH'] : []),
    ...(graphRevision !== null && binding.sourceRevision !== graphRevision ? ['SOURCE_REVISION_MISMATCH'] : []),
    ...(graphRevision === null ? ['CODE_SOURCE_REVISION_MISSING'] : []),
    ...(binding.byteLength !== currentBytes.byteLength ? ['BYTE_LENGTH_MISMATCH'] : []),
  ];
  const exact = mismatchReasons.length === 0;
  return {
    sourceRef,
    status: exact ? 'EXACT_CURRENT_BINDING' : 'CURRENT_BINDING_MISMATCH',
    graphSourceRevisionLegacy: row.source_revision ?? null,
    graphCodeSourceRevision: row.code_source_revision ?? null,
    currentSourceRevision: binding.sourceRevision,
    graphContentHash: row.content_hash ?? null,
    currentContentDigest: binding.contentDigest,
    graphWorkspaceRevision: row.workspace_revision ?? null,
    currentWorkspaceRevision: currentWorkspace?.record.workspaceRevision ?? null,
    graphByteLength: row.byte_length ?? null,
    currentByteLength: currentBytes.byteLength,
    mismatchReasons,
  };
});

const counts = rows.reduce<Record<string, number>>((out, row) => {
  out[row.status] = (out[row.status] ?? 0) + 1;
  return out;
}, {});
const mismatchReasonCounts = rows.reduce<Record<string, number>>((out, row) => {
  for (const reason of row.mismatchReasons ?? []) out[reason] = (out[reason] ?? 0) + 1;
  return out;
}, {});
const exactRows = rows.filter((row) => row.status === 'EXACT_CURRENT_BINDING');
const inScopeRowCount = rows.filter((row) => row.status !== 'EXCLUDED_SUBMODULE').length;
const planIdentity = digest(JSON.stringify({
  ownerRunId,
  currentWorkspaceRevision: currentWorkspace?.record.workspaceRevision ?? null,
  exactRows: exactRows.map(({ sourceRef, currentSourceRevision, currentContentDigest }) => ({ sourceRef, currentSourceRevision, currentContentDigest })),
}));
const report = {
  schema: 'atlas.current-source-authority-repair-plan.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_REPAIR_PLAN',
  ownerRunId,
  ownerSelection,
  currentWorkspaceRevision: currentWorkspace?.record.workspaceRevision ?? null,
  currentWorkspaceRecordChecksum: currentWorkspace?.record.checksum ?? null,
  currentWorkspaceRuntimeRevision: currentWorkspace?.runtimeRevision ?? null,
  databaseError,
  materializationError,
  rowCount: rows.length,
  currentBindingCount: currentWorkspace?.bindings?.length ?? 0,
  counts,
  mismatchReasonCounts,
  exactCurrentBindingCount: exactRows.length,
  submodulePaths,
  excludedSubmoduleCount: rows.length - inScopeRowCount,
  inScopeRowCount,
  planIdentity,
  canonicalAuthority: false,
  authorizationRequired: true,
  writesPerformed: { postgres: false, qdrant: false, neo4j: false, valkey: false, filesystem: true },
  status: databaseError || materializationError
    ? 'REPAIR_PLAN_FAILED'
    : exactRows.length === inScopeRowCount && inScopeRowCount > 0
      ? 'REPAIR_PLAN_READY_ALL_ROWS_EXACT'
      : exactRows.length > 0
        ? 'REPAIR_PLAN_PARTIAL_EXACT_BLOCKED'
        : 'REPAIR_PLAN_BLOCKED_NO_EXACT_ROWS',
  rows,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  ownerRunId,
  currentWorkspaceRevision: report.currentWorkspaceRevision,
  rowCount: report.rowCount,
  currentBindingCount: report.currentBindingCount,
  counts,
  mismatchReasonCounts,
  exactCurrentBindingCount: report.exactCurrentBindingCount,
  canonicalAuthority: false,
  authorizationRequired: true,
  reportPath,
}, null, 2));
