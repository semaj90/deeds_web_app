#!/usr/bin/env node

import pg from 'pg';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { resolveSourceReadRootV1 } from './lib/source-read-root-v1.mjs';
import { GRAPHIFY_SYMBOL_EXCLUDED_ARTIFACT_REGEX_V2 } from './lib/graphify-symbol-candidate-selection-v1.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const SUPPORTED_EXTENSIONS = new Set(['ts', 'mts', 'tsx', 'js', 'mjs', 'cjs', 'jsx', 'json', 'jsonc', 'md', 'markdown', 'txt']);

export function classifyGraphifySourceGapV1({ snapshotStatus, sourceRevisionMatches, graphifyRows }) {
  if (!Number.isSafeInteger(graphifyRows) || graphifyRows < 0) throw new Error('GRAPHIFY_GAP_ROW_COUNT_INVALID');
  if (snapshotStatus === 'MISSING') return graphifyRows === 0 ? 'SOURCE_AND_GRAPHIFY_ROW_ABSENT' : 'SOURCE_ABSENT_WITH_HISTORICAL_GRAPHIFY_ROWS';
  if (snapshotStatus !== 'READ') return graphifyRows === 0 ? 'SNAPSHOT_CHECK_UNVERIFIED_NO_GRAPHIFY_ROW' : 'SNAPSHOT_CHECK_UNVERIFIED_WITH_HISTORICAL_GRAPHIFY_ROWS';
  if (sourceRevisionMatches !== true) return graphifyRows === 0 ? 'SOURCE_REVISION_MISMATCH_NO_GRAPHIFY_ROW' : 'SOURCE_REVISION_MISMATCH_WITH_HISTORICAL_GRAPHIFY_ROWS';
  return graphifyRows === 0 ? 'EXACT_SOURCE_BYTES_NO_GRAPHIFY_ROW' : 'EXACT_SOURCE_BYTES_STALE_GRAPHIFY_REVISION_ONLY';
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? '' : '';
}

function resolveSnapshotSource(root, sourceRef) {
  if (typeof sourceRef !== 'string' || !sourceRef || sourceRef.includes('\\') || sourceRef.startsWith('/')
    || sourceRef.split('/').some(part => !part || part === '.' || part === '..')) return { status: 'INVALID_SOURCE_REF' };
  const rootReal = fs.realpathSync(root);
  const candidate = path.resolve(rootReal, ...sourceRef.split('/'));
  const relative = path.relative(rootReal, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return { status: 'PATH_OUTSIDE_SNAPSHOT' };
  if (!fs.existsSync(candidate)) return { status: 'MISSING' };
  try {
    const real = fs.realpathSync(candidate);
    const realRelative = path.relative(rootReal, real);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) return { status: 'SYMLINK_OUTSIDE_SNAPSHOT' };
    const bytes = fs.readFileSync(real);
    return { status: 'READ', byteLength: bytes.length, sourceRevision: `sha256:${createHash('sha256').update(bytes).digest('hex')}` };
  } catch (error) {
    return { status: 'READ_ERROR', error: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  loadAtlasEnv(REPO_ROOT);
  const workspaceRevision = option('--workspace-revision');
  const snapshotRootArg = option('--snapshot-root');
  const outputArg = option('--output');
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!SHA256.test(workspaceRevision) || !snapshotRootArg || !outputArg || !databaseUrl) {
    throw new Error('USAGE: --workspace-revision sha256:<64hex> --snapshot-root .tmp/workspace-source-snapshots/<snapshot-hash> --output .tmp/atlas/<receipt>.json; DATABASE_URL is required');
  }

  const admission = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
  const snapshot = resolveSourceReadRootV1({ repoRoot: REPO_ROOT, env: { ATLAS_GRAPHIFY_SOURCE_SNAPSHOT_ROOT: snapshotRootArg }, workspaceRevision, admission });
  const outputPath = path.resolve(REPO_ROOT, outputArg);
  const outputRelative = path.relative(path.join(REPO_ROOT, '.tmp'), outputPath);
  if (!outputRelative || outputRelative.startsWith('..') || path.isAbsolute(outputRelative)) throw new Error('OUTPUT_MUST_BE_UNDER_REPO_TMP');

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10000, statement_timeout: 120000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const result = await client.query(
      `WITH admitted AS (
         SELECT canonical_source_ref AS source_ref, source_revision,
                lower(split_part(canonical_source_ref, '.', array_length(string_to_array(canonical_source_ref, '.'), 1))) AS extension
         FROM public.atlas_workspace_source_bindings
         WHERE repo_id = 'deeds-web-app' AND workspace_revision = $1
       ), supported AS (
         SELECT * FROM admitted
         WHERE extension = ANY($2::text[]) AND source_ref !~* $3
       ), grouped AS (
         SELECT source_ref, count(*)::int AS row_count,
                json_agg(json_build_object('fileId', file_id, 'codeSourceRevision', code_source_revision,
                  'sourceRevision', source_revision, 'workspaceRevision', workspace_revision,
                  'parseStatus', parse_status, 'parserName', parser_name, 'parserVersion', parser_version)
                  ORDER BY file_id) AS rows
         FROM public.graphify_files
         GROUP BY source_ref
       )
       SELECT s.source_ref, s.source_revision, s.extension,
              COALESCE(g.row_count, 0)::int AS graphify_row_count,
              COALESCE(g.rows, '[]'::json) AS graphify_rows
       FROM supported s
       LEFT JOIN grouped g USING (source_ref)
       WHERE g.row_count IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.graphify_files exact
         WHERE exact.source_ref = s.source_ref AND exact.code_source_revision = s.source_revision
       )
       ORDER BY s.source_ref`,
      [workspaceRevision, [...SUPPORTED_EXTENSIONS], GRAPHIFY_SYMBOL_EXCLUDED_ARTIFACT_REGEX_V2],
    );
    const runResult = await client.query(
      `SELECT run_id, workspace_id, repository_revision, workspace_revision,
              source_manifest_digest, source_manifest_source_count, status, dry_run
         FROM public.graphify_runs
        WHERE workspace_revision = $1
        ORDER BY run_id`,
      [workspaceRevision],
    );

    const rows = result.rows.map(row => {
      const source = resolveSnapshotSource(snapshot.root, row.source_ref);
      const sourceRevisionMatches = source.status === 'READ' && source.sourceRevision === row.source_revision;
      const classification = classifyGraphifySourceGapV1({
        snapshotStatus: source.status, sourceRevisionMatches, graphifyRows: row.graphify_row_count,
      });
      return {
        sourceRef: row.source_ref,
        sourceRevision: row.source_revision,
        extension: row.extension,
        graphifyRowCount: row.graphify_row_count,
        graphifyRows: row.graphify_rows,
        snapshotSource: source,
        classification,
      };
    });

    await client.query('ROLLBACK');
    const counts = {};
    const byExtension = {};
    for (const row of rows) {
      counts[row.classification] = (counts[row.classification] ?? 0) + 1;
      byExtension[row.extension] ??= {};
      byExtension[row.extension][row.classification] = (byExtension[row.extension][row.classification] ?? 0) + 1;
    }
    const receipt = {
      schema: 'atlas.graphify-symbol-source-gap-forensics.v1',
      generatedAt: new Date().toISOString(),
      status: 'DIAGNOSTIC_ONLY',
      canonicalAuthority: false,
      writesPerformed: false,
      databaseTransaction: 'READ ONLY; ROLLED BACK',
      workspaceRevision,
      sourceSnapshotRevision: snapshot.snapshotRevision,
      sourceReadMode: snapshot.mode,
      graphifyRunBindings: runResult.rows.map(row => ({
        runId: row.run_id,
        workspaceId: row.workspace_id,
        repositoryRevision: row.repository_revision,
        workspaceRevision: row.workspace_revision,
        sourceManifestDigest: row.source_manifest_digest,
        sourceManifestSourceCount: row.source_manifest_source_count,
        status: row.status,
        dryRun: row.dry_run,
      })),
      queriedSourceRefs: rows.length,
      classificationCounts: counts,
      byExtension,
      rows,
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
    const digest = createHash('sha256').update(fs.readFileSync(outputPath)).digest('hex');
    console.log(JSON.stringify({ ...receipt, rows: undefined, outputPath: path.relative(REPO_ROOT, outputPath), outputSha256: `sha256:${digest}` }, null, 2));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
