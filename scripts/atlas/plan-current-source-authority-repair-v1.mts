#!/usr/bin/env node
/**
 * Read-only plan for repairing the current Graphify source authority join.
 * It produces a candidate input artifact; it never writes canonical or
 * projection state.
 */
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
let ownerSelection = 'COMPLETED_BOUND_OWNER_BY_FILE_COUNT';
try {
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
    SELECT source_ref, source_revision, content_hash, workspace_revision,
           byte_length, parse_status, last_seen_run_id
      FROM public.graphify_files
     WHERE last_seen_run_id = $1
     ORDER BY source_ref
  `, [ownerRunId]);
  graphRows = result.rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
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

const bindingByRef = new Map<string, any>(currentWorkspace?.bindings?.map((binding: any) => [binding.sourceRef, binding]) ?? []);
const rows = graphRows.map((row) => {
  const sourceRef = String(row.source_ref);
  const binding = bindingByRef.get(sourceRef);
  const absolute = safePath(sourceRef);
  if (!absolute || !fs.existsSync(absolute)) {
    return { sourceRef, status: 'SOURCE_UNAVAILABLE', graphSourceRevision: row.source_revision ?? null, graphContentHash: row.content_hash ?? null };
  }
  if (!binding) {
    return { sourceRef, status: 'NOT_IN_CURRENT_WORKSPACE', graphSourceRevision: row.source_revision ?? null, graphContentHash: row.content_hash ?? null };
  }
  const currentBytes = fs.readFileSync(absolute);
  const currentHash = digest(currentBytes);
  const graphHash = normalizeHash(row.content_hash);
  const graphRevision = row.source_revision ? normalizeHash(row.source_revision) : null;
  const mismatchReasons = [
    ...(currentHash !== graphHash ? ['CONTENT_DIGEST_MISMATCH'] : []),
    ...(binding.sourceRevision !== graphRevision ? ['SOURCE_REVISION_MISMATCH'] : []),
    ...(binding.byteLength !== currentBytes.byteLength ? ['BYTE_LENGTH_MISMATCH'] : []),
  ];
  const exact = mismatchReasons.length === 0;
  return {
    sourceRef,
    status: exact ? 'EXACT_CURRENT_BINDING' : 'CURRENT_BINDING_MISMATCH',
    graphSourceRevision: row.source_revision ?? null,
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
  planIdentity,
  canonicalAuthority: false,
  authorizationRequired: true,
  writesPerformed: { postgres: false, qdrant: false, neo4j: false, valkey: false, filesystem: true },
  status: databaseError || materializationError
    ? 'REPAIR_PLAN_FAILED'
    : exactRows.length === rows.length && rows.length > 0
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
