#!/usr/bin/env node

/** Read-only reconciliation of symbol versions against canonical workspace source bindings. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/symbol-owner-lineage-v1.json');
const workspaceRevision = process.env.ATLAS_WORKSPACE_REVISION?.trim() || null;
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let databaseError = null;
let summary = { symbolRows: 0, sourceBindings: 0, sourceWorkspaceMatches: 0, missingBindings: 0, workspaceRevisionMismatches: 0, workspaceRevision: workspaceRevision };
try {
  if (!workspaceRevision) throw new Error('ATLAS_WORKSPACE_REVISION_REQUIRED');
  const result = await pool.query(`
    SELECT
      count(*)::int AS symbol_rows,
      count(b.canonical_source_ref)::int AS source_bindings,
      count(*) FILTER (WHERE b.canonical_source_ref IS NOT NULL AND b.workspace_revision = s.workspace_revision)::int AS source_workspace_matches,
      count(*) FILTER (WHERE b.canonical_source_ref IS NULL)::int AS missing_bindings,
      count(*) FILTER (WHERE b.canonical_source_ref IS NOT NULL AND b.workspace_revision <> s.workspace_revision)::int AS workspace_revision_mismatches
    FROM public.atlas_symbol_versions s
    LEFT JOIN public.atlas_workspace_source_bindings b
      ON b.canonical_source_ref = s.source_ref
     AND b.workspace_revision = s.workspace_revision
    WHERE s.workspace_revision = $1
  `, [workspaceRevision]);
  const row = result.rows[0] ?? {};
  summary = {
    symbolRows: Number(row.symbol_rows ?? 0),
    sourceBindings: Number(row.source_bindings ?? 0),
    sourceWorkspaceMatches: Number(row.source_workspace_matches ?? 0),
    missingBindings: Number(row.missing_bindings ?? 0),
    workspaceRevisionMismatches: Number(row.workspace_revision_mismatches ?? 0),
    workspaceRevision,
  };
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const report = {
  schema: 'atlas.symbol-owner-lineage.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_LINEAGE_RECONCILIATION',
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
  databaseError,
  summary,
  revisionAxes: {
    repositoryRevision: 'atlas_symbol_versions.source_revision',
    sourceContentRevision: 'atlas_workspace_source_bindings.source_revision',
    repositoryRevisionAuthority: 'REPOSITORY_REVISION_V1',
    sourceContentRevisionAuthority: 'SOURCE_BYTES_SHA256_V1',
    comparisonPolicy: 'DO_NOT_COMPARE_OR_OVERWRITE_CROSS_AXIS_VALUES',
  },
  lineageReady: databaseError === null && summary.symbolRows > 0 && summary.missingBindings === 0 && summary.workspaceRevisionMismatches === 0,
  promotionAllowed: false,
  reason: 'Source/workspace coverage is reported separately from the two revision axes; Graphify ownership and content-lineage proof remain required.',
};
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ schema: report.schema, databaseError, summary, lineageReady: report.lineageReady, promotionAllowed: false, report: REPORT }, null, 2));
