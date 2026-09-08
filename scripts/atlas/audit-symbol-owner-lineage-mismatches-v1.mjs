#!/usr/bin/env node

/** Read-only detail report for symbol/source revision axis observations. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/symbol-owner-lineage-mismatches-v1.json');
const workspaceRevision = process.env.ATLAS_WORKSPACE_REVISION?.trim() || null;
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let databaseError = null;
let mismatchPairs = [];
let sampleRefs = [];
try {
  if (!workspaceRevision) throw new Error('ATLAS_WORKSPACE_REVISION_REQUIRED');
  const pairs = await pool.query(`
    SELECT s.source_revision AS symbol_source_revision,
           b.source_revision AS binding_source_revision,
           count(*)::int AS row_count
    FROM public.atlas_symbol_versions s
    INNER JOIN public.atlas_workspace_source_bindings b
      ON b.canonical_source_ref = s.source_ref
     AND b.workspace_revision = s.workspace_revision
    WHERE s.workspace_revision = $1
      AND s.source_revision <> b.source_revision
    GROUP BY s.source_revision, b.source_revision
    ORDER BY row_count DESC, s.source_revision, b.source_revision
  `, [workspaceRevision]);
  const refs = await pool.query(`
    SELECT s.symbol_version_id, s.source_ref, s.source_revision AS symbol_source_revision,
           b.source_revision AS binding_source_revision
    FROM public.atlas_symbol_versions s
    INNER JOIN public.atlas_workspace_source_bindings b
      ON b.canonical_source_ref = s.source_ref
     AND b.workspace_revision = s.workspace_revision
    WHERE s.workspace_revision = $1
      AND s.source_revision <> b.source_revision
    ORDER BY s.source_ref, s.symbol_version_id
    LIMIT 50
  `, [workspaceRevision]);
  mismatchPairs = pairs.rows;
  sampleRefs = refs.rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const report = {
  schema: 'atlas.symbol-owner-lineage-mismatches.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_REVISION_AXIS_AUDIT',
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
  databaseError,
  workspaceRevision,
  revisionAxes: {
    symbolRevision: 'repository/compiler lineage',
    bindingRevision: 'exact source-content lineage',
    symbolRevisionAuthority: 'REPOSITORY_REVISION_V1',
    bindingRevisionAuthority: 'SOURCE_BYTES_SHA256_V1',
    crossAxisComparison: 'NOT_SEMANTICALLY_COMPARABLE',
  },
  mismatchPairs,
  sampleRefs,
  repairAllowed: false,
  reason: 'Observed cross-axis value differences are retained for review; this report does not select an authority or rewrite revisions.',
};
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ schema: report.schema, databaseError, workspaceRevision, mismatchPairCount: mismatchPairs.length, sampleCount: sampleRefs.length, repairAllowed: false, report: REPORT }, null, 2));
