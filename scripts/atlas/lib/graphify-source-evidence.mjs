#!/usr/bin/env node
/**
 * GRAPHIFY-REVISION-TIEBREAK-FIX-01 shared helper.
 *
 * NOT a canonical-authority resolver. `graphify_files` is a mutable current-state
 * pointer table (its writer overwrites `workspace_revision`/`last_seen_run_id` on
 * re-observation), so this can only ever answer "what does a COMPLETED Graphify
 * run currently believe about this source_ref" -- a legacy bridge, not proof of a
 * frozen historical snapshot. The architecturally correct, immutable source is
 * `graphify_executions` / `graphify_execution_files` (see
 * CURRENT-SOURCE-SNAPSHOT-RESOLVE-01 / audit-current-graphify-snapshot-authority-v1.mts),
 * which is not yet populated enough to replace this bridge corpus-wide (27 rows vs.
 * 25,317 in graphify_files as of 2026-09-05).
 *
 * This helper exists ONLY to remove the previously-live bug: selecting a
 * graphify_files row by `ORDER BY workspace_revision DESC, code_source_revision DESC`
 * -- sha256 content hashes sorted as if they were timestamps, which has no
 * relationship to which row is actually current or authoritative. This resolves
 * ties by `gr.completed_at DESC` (a real timestamp) with `gf.file_id DESC` only as
 * a last-resort deterministic tie-break -- never a hash column.
 *
 * Verified safe for the current population by GRAPHIFY-COMPLETED-LEGACY-COVERAGE-01
 * (docs/reports/graphify-completed-legacy-coverage-v1.json): zero graphify_files
 * rows have a COMPLETED first_seen_run_id whose last_seen_run_id was later
 * overwritten by a non-COMPLETED run, so filtering to `status = 'COMPLETED'` does
 * not hide valid historical evidence for today's data. If that count is ever
 * nonzero for a future population, do not extend this helper with cleverer
 * hash/timestamp heuristics -- those rows must remain unqualified or wait for real
 * graphify_execution_files evidence.
 */

/**
 * Status is one of only two values by construction: the ORDER BY tie-break ends in
 * `gf.file_id DESC` (a real, guaranteed-unique PK), so `LIMIT 1` can never be
 * ambiguous -- there is no `AMBIGUOUS_COMPLETED_EVIDENCE` case to report here.
 * `LEGACY_HISTORY_ERODED` (a COMPLETED first_seen_run_id whose evidence was hidden
 * by a later non-COMPLETED last_seen_run_id) is a cohort-wide property, not
 * resolvable from a single source_ref lookup -- see the corpus-wide
 * GRAPHIFY-COMPLETED-LEGACY-COVERAGE-01 audit
 * (docs/reports/graphify-completed-legacy-coverage-v1.json) for that check.
 *
 * @param {import('pg').Pool} pool
 * @param {string} sourceRef
 * @returns {Promise<{
 *   status: 'COMPLETED_EVIDENCE_EXACT' | 'NO_COMPLETED_EVIDENCE',
 *   workspaceId: string | null,
 *   workspaceRevision: string | null,
 *   codeSourceRevision: string | null,
 *   contentHash: string | null,
 *   completedAt: string | null,
 * }>}
 */
export async function resolveCompletedLegacyGraphifySourceEvidence(pool, sourceRef) {
  const { rows } = await pool.query(
    `SELECT gf.workspace_id::text AS workspace_id,
            gf.workspace_revision,
            gf.code_source_revision,
            gf.content_hash,
            gr.completed_at
     FROM graphify_files gf
     JOIN graphify_runs gr ON gr.run_id = gf.last_seen_run_id
     WHERE gf.source_ref = $1 AND gr.status = 'COMPLETED'
     ORDER BY gr.completed_at DESC, gf.file_id DESC
     LIMIT 1`,
    [sourceRef],
  );

  if (rows.length === 0) {
    return {
      status: 'NO_COMPLETED_EVIDENCE',
      workspaceId: null,
      workspaceRevision: null,
      codeSourceRevision: null,
      contentHash: null,
      completedAt: null,
    };
  }

  const row = rows[0];
  return {
    status: 'COMPLETED_EVIDENCE_EXACT',
    workspaceId: row.workspace_id,
    workspaceRevision: row.workspace_revision ?? null,
    codeSourceRevision: row.code_source_revision ?? null,
    contentHash: row.content_hash ?? null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

/**
 * Batch variant: resolves evidence for many source_refs in one query, grouping by
 * source_ref and applying the same COMPLETED-run + completed_at-DESC selection per
 * group. Returns a Map<sourceRef, result-shape-as-above>.
 *
 * @param {import('pg').Pool} pool
 * @param {string[]} sourceRefs
 */
export async function resolveCompletedLegacyGraphifySourceEvidenceBatch(pool, sourceRefs) {
  if (sourceRefs.length === 0) return new Map();

  const { rows } = await pool.query(
    `SELECT DISTINCT ON (gf.source_ref)
            gf.source_ref,
            gf.workspace_id::text AS workspace_id,
            gf.workspace_revision,
            gf.code_source_revision,
            gf.content_hash,
            gr.completed_at
     FROM graphify_files gf
     JOIN graphify_runs gr ON gr.run_id = gf.last_seen_run_id
     WHERE gf.source_ref = ANY($1::text[]) AND gr.status = 'COMPLETED'
     ORDER BY gf.source_ref, gr.completed_at DESC, gf.file_id DESC`,
    [sourceRefs],
  );

  const result = new Map();
  for (const sourceRef of sourceRefs) {
    result.set(sourceRef, {
      status: 'NO_COMPLETED_EVIDENCE',
      workspaceId: null,
      workspaceRevision: null,
      codeSourceRevision: null,
      contentHash: null,
      completedAt: null,
    });
  }
  for (const row of rows) {
    result.set(row.source_ref, {
      status: 'COMPLETED_EVIDENCE_EXACT',
      workspaceId: row.workspace_id,
      workspaceRevision: row.workspace_revision ?? null,
      codeSourceRevision: row.code_source_revision ?? null,
      contentHash: row.content_hash ?? null,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    });
  }
  return result;
}
