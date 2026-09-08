#!/usr/bin/env node

/** Read-only row audit for the revision-qualified symbol owner table. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/symbol-owner-rows-v1.json');
const expectedWorkspaceRevision = process.env.ATLAS_WORKSPACE_REVISION?.trim() || null;
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let databaseError = null;
let summary = { totalRows: 0, distinctSymbolVersionIds: 0, duplicateSymbolVersionIds: 0, missingRevisionRows: 0, missingSourceRows: 0, workspaceRevisionCounts: [], expectedWorkspaceRevision: null, expectedWorkspaceRows: 0 };
try {
  const totals = await pool.query(`
    SELECT count(*)::int AS total_rows,
           count(DISTINCT symbol_version_id)::int AS distinct_symbol_version_ids,
           count(*) FILTER (WHERE symbol_version_id IS NULL OR source_revision IS NULL OR workspace_revision IS NULL)::int AS missing_revision_rows,
           count(*) FILTER (WHERE source_ref IS NULL OR btrim(source_ref) = '')::int AS missing_source_rows
    FROM public.atlas_symbol_versions
  `);
  const duplicates = await pool.query(`
    SELECT count(*)::int AS duplicate_ids
    FROM (
      SELECT symbol_version_id FROM public.atlas_symbol_versions
      GROUP BY symbol_version_id HAVING count(*) > 1
    ) duplicate_ids
  `);
  const workspaces = await pool.query(`
    SELECT workspace_revision, count(*)::int AS row_count
    FROM public.atlas_symbol_versions
    GROUP BY workspace_revision
    ORDER BY workspace_revision
  `);
  const row = totals.rows[0] ?? {};
  summary = {
    totalRows: Number(row.total_rows ?? 0),
    distinctSymbolVersionIds: Number(row.distinct_symbol_version_ids ?? 0),
    duplicateSymbolVersionIds: Number(duplicates.rows[0]?.duplicate_ids ?? 0),
    missingRevisionRows: Number(row.missing_revision_rows ?? 0),
    missingSourceRows: Number(row.missing_source_rows ?? 0),
    workspaceRevisionCounts: workspaces.rows,
    expectedWorkspaceRevision,
    expectedWorkspaceRows: expectedWorkspaceRevision
      ? Number(workspaces.rows.find((value) => value.workspace_revision === expectedWorkspaceRevision)?.row_count ?? 0)
      : 0,
  };
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const report = {
  schema: 'atlas.symbol-owner-rows.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_ROW_AUDIT',
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
  databaseError,
  summary,
  ownerRowsStructurallyEligible: databaseError === null
    && summary.totalRows === summary.distinctSymbolVersionIds
    && summary.missingRevisionRows === 0
    && summary.missingSourceRows === 0,
  promotionAllowed: false,
  reason: 'Row integrity does not prove current Graphify lineage or authorize durable proposal admission.',
};
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ schema: report.schema, databaseError, summary, ownerRowsStructurallyEligible: report.ownerRowsStructurallyEligible, promotionAllowed: false, report: REPORT }, null, 2));
