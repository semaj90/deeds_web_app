#!/usr/bin/env node
/**
 * Populates atlas_source_refs with whole-file entries at scale, using the exact convention
 * established by apply-current-source-registry-reconciliation-v1.mjs (source_ref_key ===
 * relativePath, a bare path; source_type='code'; symbol_kind left NULL; content_hash = bare
 * 64-hex sha256 -- reused, not reinvented, per this repo's Duplication Prevention rule; verified
 * by reading that script directly before writing this one).
 *
 * Scope: ONLY sourceRefs that are (a) in the tournament-admitted snapshot's repo:root sources,
 * (b) content-hash-exact matches against the live Graphify owner run (workspace_revision
 * sha256:e0dc2711...), and (c) not already present in atlas_source_refs. This is the same
 * candidate pool apply-admitted-workspace-source-bindings-content-reconciled-v1.mjs computes
 * before its own `notInRegistry` filter -- this script exists specifically to shrink that filter's
 * rejection count on a future run, not to populate the registry with unrelated or unverified data.
 *
 * Purely additive: never touches, updates, or removes any existing atlas_source_refs row
 * (including the pre-existing 22,487 symbol/fragment-level rows, and the 117 pre-existing
 * whole-file rows). Default --dry-run; explicit --apply required to commit.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ADMISSION_PATH = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const REPORT_PATH = resolve(ROOT, 'docs/reports/apply-file-level-source-refs-content-reconciled-v1.json');
const REPO_ID = 'deeds-web-app';
const OWNER_RUN_WORKSPACE_REVISION = 'sha256:e0dc2711f632e38607cb19fe3ca74e9e37ff864027857062e6e4be6ac86241bb';
const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 500;

const admission = JSON.parse(readFileSync(ADMISSION_PATH, 'utf8'));
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) {
  throw new Error('ADMITTED_WORKSPACE_REVISION_RECEIPT_NOT_AUTHORITATIVE');
}
const snapshotPath = resolve(ROOT, 'docs/reports/workspace-source-snapshots', `${admission.snapshotRevision.replace(/^sha256:/, '')}.json`);
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
if (snapshot.snapshotRevision !== admission.snapshotRevision) throw new Error('SEALED_SNAPSHOT_MISMATCH');
const rootSources = snapshot.sources.filter((s) => s.repositoryId === 'repo:root');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 300000 });
let report;
try {
  const graphRowsResult = await pool.query(
    `SELECT source_ref, content_hash FROM public.graphify_files WHERE workspace_revision = $1`,
    [OWNER_RUN_WORKSPACE_REVISION],
  );
  const graphByRef = new Map();
  for (const row of graphRowsResult.rows) {
    if (!graphByRef.has(row.source_ref)) graphByRef.set(row.source_ref, row.content_hash);
  }

  const existingResult = await pool.query(
    `SELECT source_ref_key FROM public.atlas_source_refs WHERE repo_id = $1`,
    [REPO_ID],
  );
  const existingSet = new Set(existingResult.rows.map((r) => r.source_ref_key));

  let notInGraph = 0;
  let contentMismatch = 0;
  let alreadyPresent = 0;
  const candidates = [];
  for (const s of rootSources) {
    const graphHash = graphByRef.get(s.sourceRef);
    if (graphHash === undefined) { notInGraph += 1; continue; }
    if (graphHash !== s.contentDigest) { contentMismatch += 1; continue; }
    if (existingSet.has(s.sourceRef)) { alreadyPresent += 1; continue; }
    candidates.push({ sourceRefKey: s.sourceRef, relativePath: s.sourceRef, contentHash: s.contentDigest });
  }
  candidates.sort((a, b) => a.sourceRefKey.localeCompare(b.sourceRefKey));

  report = {
    schema: 'atlas.apply-file-level-source-refs-content-reconciled.v1',
    generatedAt: new Date().toISOString(),
    apply: APPLY,
    admittedWorkspaceRevision: admission.workspaceRevision,
    ownerRunWorkspaceRevision: OWNER_RUN_WORKSPACE_REVISION,
    admittedRootSources: rootSources.length,
    counts: { notInGraph, contentMismatch, alreadyPresent, candidateInserts: candidates.length },
    committed: false,
    insertedCount: 0,
    readbackCount: 0,
    status: 'PLANNED',
  };

  if (APPLY && candidates.length > 0) {
    await pool.query('BEGIN');
    try {
      let inserted = 0;
      for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const batch = candidates.slice(i, i + BATCH_SIZE);
        const values = [];
        const params = [];
        batch.forEach((c, idx) => {
          const base = idx * 5;
          values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
          params.push(c.sourceRefKey, REPO_ID, 'code', c.relativePath, c.contentHash);
        });
        const result = await pool.query(
          `INSERT INTO public.atlas_source_refs (source_ref_key, repo_id, source_type, relative_path, content_hash)
           VALUES ${values.join(',')}
           ON CONFLICT (source_ref_key, repo_id) DO NOTHING`,
          params,
        );
        inserted += result.rowCount ?? 0;
      }
      const readback = await pool.query(
        `SELECT count(*)::int AS n FROM public.atlas_source_refs WHERE repo_id = $1 AND source_ref_key = ANY($2::text[])`,
        [REPO_ID, candidates.map((c) => c.sourceRefKey)],
      );
      await pool.query('COMMIT');
      report.committed = true;
      report.insertedCount = inserted;
      report.readbackCount = readback.rows[0].n;
      report.status = report.readbackCount === candidates.length ? 'FILE_LEVEL_SOURCE_REFS_INSERT_AND_READBACK_PROVEN' : 'READBACK_MISMATCH';
    } catch (error) {
      await pool.query('ROLLBACK').catch(() => {});
      report.status = 'APPLY_FAILED';
      report.error = error instanceof Error ? error.message : String(error);
    }
  } else {
    report.status = APPLY ? 'NO_CANDIDATE_ROWS' : 'DRY_RUN_PLANNED';
  }
} finally {
  await pool.end();
}

mkdirSync(dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
