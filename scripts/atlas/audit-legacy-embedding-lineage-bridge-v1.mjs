#!/usr/bin/env node
/** Read-only check for a graphify source record behind legacy unqualified vectors. */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = process.cwd();
const inputPath = path.resolve(root, 'docs/reports/embedding-eligibility-mismatch-v1.json');
const reportPath = path.resolve(root, 'docs/reports/legacy-embedding-lineage-bridge-v1.json');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const refs = [...new Set(input.mismatchRows.map((row) => row.relative_path).filter(Boolean))];
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
let rows = [];
let databaseError = null;
try {
  rows = (await pool.query(`
    SELECT source_ref, source_revision, content_hash, workspace_revision,
           parse_status, last_seen_run_id
      FROM public.graphify_files
     WHERE replace(source_ref, '\\\\', '/') = ANY($1::text[])
        OR source_ref = ANY($1::text[])
     ORDER BY source_ref, last_seen_run_id`, [refs])).rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const normalized = rows.map((row) => ({
  ...row,
  source_ref: String(row.source_ref ?? '').replaceAll('\\', '/'),
}));
const report = {
  schema: 'atlas.legacy-embedding-lineage-bridge.v1',
  task: 'PKT-LINEAGE-14',
  mode: 'READ_ONLY',
  inputMismatchCount: input.mismatchCount,
  inputRelativePathCount: refs.length,
  graphifyMatchCount: normalized.length,
  graphifyMatches: normalized,
  databaseError,
  verdict: databaseError
    ? 'LINEAGE_BRIDGE_AUDIT_ERROR'
    : normalized.length > 0
      ? 'PATH_ONLY_BRIDGE_FOUND_SOURCE_IDENTITY_STILL_UNPROVEN'
      : 'NO_GRAPHIFY_LINEAGE_BRIDGE_FOUND',
  writesPerformed: false,
  canonicalAuthority: false,
  nextAction: normalized.length > 0
    ? 'Compare exact content_hash and authoritative revisions before any reuse; do not infer chunk identity from path alone.'
    : 'Keep the legacy vectors quarantined; no source identity is available for promotion.',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ verdict: report.verdict, graphifyMatchCount: report.graphifyMatchCount, reportPath }, null, 2));
