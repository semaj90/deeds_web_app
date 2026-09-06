#!/usr/bin/env -S npx tsx

/**
 * SOURCE-EVIDENCE-AUTHORITY-01 (live, read-only)
 *
 * Selects the current Graphify run that is authoritative for the CURRENT
 * source population, using the pure selector in
 * lib/current-source-evidence-authority-selector.mjs against real data.
 *
 * Does not rewrite historical Graphify rows, run Graphify, mutate Postgres,
 * modify Qdrant/Neo4j, warm Valkey, promote any representation, or infer a
 * revision from a timestamp. A RUNNING execution is never selected merely
 * because it is newer than the current completed-bound one. Multiple
 * equally-current completed+bound runs fail closed as
 * AMBIGUOUS_CURRENT_SOURCE_OWNER, never resolved by picking "latest".
 *
 * Must be run from the repository root (workspaceRoot = process.cwd()) --
 * running it from a subdirectory silently scopes `git ls-tree`/etc. to that
 * subtree (confirmed live 2026-09-05: 16,788 entries from
 * sveltekit-frontend/ vs 27,076 from repo root), producing a structurally
 * different, never-convergent "current" population.
 *
 * TOLERANCE WINDOW: this repo's workspace is under continuous real
 * concurrent edit (other sessions/processes), so exact bit-for-bit
 * simultaneity between a completed run and this check will not reliably
 * converge. A COMPLETED+BOUND run whose workspace revision doesn't exactly
 * match the freshly-recomputed current one is still accepted as
 * TOLERANCE_WINDOW-eligible if it completed within `toleranceMs` of now
 * (default 5 minutes; override via ATLAS_SOURCE_AUTHORITY_TOLERANCE_MS env
 * var or --tolerance-ms=<n> CLI arg; 0 disables tolerance and reproduces the
 * original exact-match-only behavior). Every selection reports its
 * `matchType` explicitly -- this never silently treats "recent" as
 * equivalent to "identical" without saying so in the receipt.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { selectCurrentSourceRun, validateSourcePopulation } from './lib/current-source-evidence-authority-selector.mjs';
import { materializeWorkspaceRevisionOriginV1 } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';
import { buildSourceNamespaceFromGraphifyFilesV1 } from '../../sveltekit-frontend/src/lib/server/atlas/embedding/source-namespace-v1.js';

const root = process.cwd();
const reportPath = path.resolve(root, 'docs/reports/current-source-evidence-authority-v1.json');
const repositoryId = process.env.ATLAS_REPOSITORY_ID ?? 'semaj90/deeds_web_app';
const producerRevision = 'atlas.current-source-evidence-authority.v1';
const sha256 = (value: string) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;

const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;
const toleranceArg = process.argv.find((value) => value.startsWith('--tolerance-ms='))?.slice('--tolerance-ms='.length);
const toleranceMsRaw = toleranceArg ?? process.env.ATLAS_SOURCE_AUTHORITY_TOLERANCE_MS;
const toleranceMs = toleranceMsRaw !== undefined ? Number(toleranceMsRaw) : DEFAULT_TOLERANCE_MS;
if (!Number.isFinite(toleranceMs) || toleranceMs < 0) {
  throw new Error(`ATLAS_SOURCE_AUTHORITY_TOLERANCE_MS_INVALID:${toleranceMsRaw}`);
}
const nowMs = Date.now();

// 1. Fresh current workspace identity -- never read from a static report file.
const origin = materializeWorkspaceRevisionOriginV1({ workspaceRoot: root, repositoryId, producerRevision });

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 60000 });

let databaseError: string | null = null;
let workspaceRows: Array<{ id: string; logical_key: string | null }> = [];
let runRows: Array<{
  run_id: string; workspace_id: string; status: string;
  workspace_revision: string | null; source_manifest_digest: string | null;
  started_at: string | null; completed_at: string | null; file_row_count: number;
}> = [];

try {
  workspaceRows = (await pool.query(
    `select id::text as id, logical_key from public.workspaces`,
  )).rows;
  runRows = (await pool.query(`
    select r.run_id::text as run_id, r.workspace_id::text as workspace_id, r.status,
           r.workspace_revision, r.source_manifest_digest,
           r.started_at, r.completed_at,
           count(f.source_ref)::int as file_row_count
    from public.graphify_runs r
    left join public.graphify_files f on f.last_seen_run_id = r.run_id
    group by r.run_id, r.workspace_id, r.status, r.workspace_revision, r.source_manifest_digest, r.started_at, r.completed_at
    order by r.completed_at desc nulls last, r.started_at desc nulls last
  `)).rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
}

const currentWorkspaceRow = workspaceRows.find((row) => row.logical_key === 'legal-ai:deeds-web-app') ?? null;
if (!currentWorkspaceRow && !databaseError) databaseError = 'CURRENT_WORKSPACE_ROW_NOT_FOUND';

const current = {
  workspaceId: currentWorkspaceRow?.id ?? '',
  workspaceRevision: origin.record.workspaceRevision,
  sourceManifestDigest: origin.record.sourceManifestDigest,
};

const selection = databaseError
  ? { status: 'AUDIT_FAILED', selectedRunId: null, ambiguityCount: 0, classified: [] }
  : selectCurrentSourceRun(runRows, current, { toleranceMs, nowMs });

let sourcePopulation: ReturnType<typeof validateSourcePopulation> | null = null;
let namespace: unknown = null;
let selectedRun: (typeof runRows)[number] | null = null;

if (selection.status === 'CANDIDATE_SELECTED' && selection.selectedRunId) {
  selectedRun = runRows.find((row) => row.run_id === selection.selectedRunId) ?? null;
  const fileRows = (await pool.query(
    `select source_ref, code_source_revision as source_revision, content_hash
     from public.graphify_files where last_seen_run_id = $1 order by source_ref`,
    [selection.selectedRunId],
  )).rows;
  sourcePopulation = validateSourcePopulation(fileRows);
  if (selectedRun) {
    namespace = buildSourceNamespaceFromGraphifyFilesV1({
      workspaceId: selectedRun.workspace_id,
      repositoryId,
      workspaceRevision: selectedRun.workspace_revision,
    });
  }
}

await pool.end();

const populationChecksum = sourcePopulation?.valid
  ? sha256(JSON.stringify(sourcePopulation.sources.map((s: { sourceRef: string; sourceRevision: string }) => [s.sourceRef, s.sourceRevision])))
  : null;
const selectionChecksum = selectedRun && populationChecksum
  ? sha256(JSON.stringify({ runId: selectedRun.run_id, workspaceRevision: selectedRun.workspace_revision, populationChecksum }))
  : null;

let status: string;
if (databaseError) status = 'AUDIT_FAILED';
else if (selection.status === 'NO_CURRENT_COMPLETED_BOUND_SOURCE_OWNER') status = 'NO_CURRENT_COMPLETED_BOUND_SOURCE_OWNER';
else if (selection.status === 'AMBIGUOUS_CURRENT_SOURCE_OWNER') status = 'AMBIGUOUS_CURRENT_SOURCE_OWNER';
else if (sourcePopulation && !sourcePopulation.valid) status = sourcePopulation.status; // EMPTY_SOURCE_POPULATION | SOURCE_POPULATION_INVALID
else if (sourcePopulation?.valid) status = 'CURRENT_SOURCE_EVIDENCE_AUTHORITY_PROVEN';
else status = 'AUDIT_FAILED';

const counts = {
  totalRuns: runRows.length,
  completed: runRows.filter((r) => r.status === 'COMPLETED').length,
  running: runRows.filter((r) => r.status === 'RUNNING').length,
  completedBound: runRows.filter((r) => r.status === 'COMPLETED' && r.file_row_count > 0).length,
  completedUnbound: runRows.filter((r) => r.status === 'COMPLETED' && r.file_row_count === 0).length,
  runningBound: runRows.filter((r) => r.status === 'RUNNING' && r.file_row_count > 0).length,
  runningUnbound: runRows.filter((r) => r.status === 'RUNNING' && r.file_row_count === 0).length,
};

const report = {
  schema: 'atlas.current-source-evidence-authority.v1',
  gate: 'SOURCE-EVIDENCE-AUTHORITY-01',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  canonicalAuthority: false,
  writesPerformed: false,
  status,
  toleranceWindow: { toleranceMs, nowMs, checkedAt: new Date(nowMs).toISOString() },
  currentWorkspace: {
    workspaceId: current.workspaceId || null,
    workspaceRevision: current.workspaceRevision,
    sourceManifestDigest: current.sourceManifestDigest,
    sourceCount: origin.record.sourceCount,
    repositoryId: origin.record.repositoryId,
    baseCommitOid: origin.record.baseCommitOid,
    dirty: origin.record.dirty,
  },
  runCounts: counts,
  ambiguityCount: selection.ambiguityCount,
  rejectedRuns: selection.classified
    .filter((row: { eligible: boolean }) => !row.eligible)
    .map((row: { runId: string; runStatus: string; bindingStatus: string; reasons: string[]; ageMsAtCheck: number | null }) => ({
      runId: row.runId, runStatus: row.runStatus, bindingStatus: row.bindingStatus, reasons: row.reasons, ageMsAtCheck: row.ageMsAtCheck,
    })),
  selection: selectedRun ? {
    workspaceId: selectedRun.workspace_id,
    workspaceRevision: selectedRun.workspace_revision,
    graphifyRunId: selectedRun.run_id,
    runStatus: selectedRun.status,
    bindingStatus: 'BOUND',
    matchType: (selection as { matchType?: string }).matchType ?? null,
    sourceManifestDigest: selectedRun.source_manifest_digest,
    namespace,
    sourceCount: sourcePopulation?.sourceCount ?? 0,
    sources: sourcePopulation?.sources ?? [],
    populationChecksum,
    selectionChecksum,
    ambiguityCount: 0,
    syntheticRevisionCount: sourcePopulation?.syntheticRevisionCount ?? 0,
    missingSourceRevisionCount: sourcePopulation?.missingSourceRevisionCount ?? 0,
    duplicateSourceRefCount: sourcePopulation?.duplicateSourceRefCount ?? 0,
  } : null,
  databaseError,
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  toleranceMs,
  matchType: report.selection?.matchType ?? null,
  runCounts: report.runCounts,
  ambiguityCount: report.ambiguityCount,
  selectedRunId: selectedRun?.run_id ?? null,
  sourceCount: report.selection?.sourceCount ?? 0,
  reportPath: 'docs/reports/current-source-evidence-authority-v1.json',
}, null, 2));
