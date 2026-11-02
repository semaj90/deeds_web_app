#!/usr/bin/env node
/**
 * build-summary-priority-matrix-v1.mjs  (READ-ONLY; AFC-SCHED feature matrix)
 *
 * Draft chunk-level feature matrix for the summarization work queue: one row per chunk that has a
 * 768-d embedding and no summary. Same conventions as build-candidate-feature-matrix-v1.mjs:
 *   - bulk numbers go to raw F32LE (X) and u8 (mask) files, never JSON; ids to a text file
 *   - missing values are written as 0 with mask 0 (never imputed)
 *   - descriptor JSON carries the versioned column registry, observed fractions and sha256 of every file
 *   - canonicalAuthority:false; advisory input for PriorityScoreV1 only; identity stays in Postgres
 *
 * Token remapping is a LATER stage (it follows the retrieval/recommendation audit). This matrix reserves the
 * hook: \`tokenRemap\` in the descriptor records that codebase_chunk_index.token_count is empty today and
 * which stable column ids a future remap may add. Column ids never change meaning; add, never reuse.
 *
 * Usage (from sveltekit-frontend/): node --env-file=.env ../scripts/atlas/build-summary-priority-matrix-v1.mjs [--limit=N]
 * Output: .tmp/atlas/summary-priority-matrix-v1/<UTC stamp>/{X.f32le,mask.u8,ids.txt,descriptor.json}
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) ?? '').slice(8)) || 0;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required (run with --env-file=.env from sveltekit-frontend/)');

/** Versioned, append-only column registry. columnId is permanent. */
export const COLUMNS_V1 = [
  { columnId: 'SPM_001', name: 'log1p_content_chars', dtype: 'float32', source: 'codebase_chunk_index.content (length)', nullPolicy: 'never missing' },
  { columnId: 'SPM_002', name: 'log1p_ast_symbol_count', dtype: 'float32', source: 'codebase_chunk_index.ast_symbols (jsonb array length)', nullPolicy: 'missing only if not an array' },
  { columnId: 'SPM_003', name: 'file_authority_ga', dtype: 'float32', source: 'atlas index `ga` joined on exact relative_path (derived, not identity)', nullPolicy: 'missing unless ga > 0 (the atlas stores 0 for unknown)' },
  { columnId: 'SPM_004', name: 'log1p_age_days_since_enriched', dtype: 'float32', source: 'codebase_chunk_index.enriched_at', nullPolicy: 'missing when enriched_at is null' },
  { columnId: 'SPM_005', name: 'log1p_file_hits_168h', dtype: 'float32', source: 'atlas index `h` (chunk_hit_log window) joined on exact relative_path', nullPolicy: 'missing unless h > 0' },
];
const K = COLUMNS_V1.length;
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

const atlas = JSON.parse(readFileSync(path.join(ROOT, 'sveltekit-frontend', 'docs', 'atlas-index', 'codebase-atlas.min.json'), 'utf8'));
const byFile = new Map(atlas.files.map((r) => [r[0], { ga: r[5], h: r[6] }]));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, statement_timeout: 300000 });
const client = await pool.connect();
let rows;
let sourceCounts;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  rows = (await client.query(
    `SELECT id::text AS id, relative_path,
            length(content) AS chars,
            CASE WHEN jsonb_typeof(ast_symbols) = 'array' THEN jsonb_array_length(ast_symbols) END AS ast_n,
            CASE WHEN enriched_at IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (now() - enriched_at)) / 86400.0 END AS age_days
       FROM codebase_chunk_index
      WHERE content_embedding_768 IS NOT NULL AND (summary IS NULL OR btrim(summary) = '')
      ORDER BY id
      ${LIMIT ? `LIMIT ${LIMIT}` : ''}`,
  )).rows;
  sourceCounts = (await client.query(
    `SELECT count(*)::bigint AS total,
            count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND (summary IS NULL OR btrim(summary) = ''))::bigint AS eligible
       FROM codebase_chunk_index`)).rows[0];
  await client.query('ROLLBACK');
} finally { client.release(); await pool.end(); }

const N = rows.length;
const X = new Float32Array(N * K);
const M = new Uint8Array(N * K);
const observed = new Array(K).fill(0);
const put = (i, k, v) => {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return;
  X[i * K + k] = Number(v); M[i * K + k] = 1; observed[k]++;
};
rows.forEach((r, i) => {
  const f = byFile.get(r.relative_path);
  put(i, 0, Math.log1p(Math.max(0, Number(r.chars))));
  put(i, 1, r.ast_n === null ? null : Math.log1p(r.ast_n));
  put(i, 2, f && f.ga > 0 ? f.ga : null);
  put(i, 3, r.age_days === null ? null : Math.log1p(Math.max(0, Number(r.age_days))));
  put(i, 4, f && f.h > 0 ? Math.log1p(f.h) : null);
});

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(ROOT, '.tmp', 'atlas', 'summary-priority-matrix-v1', stamp);
mkdirSync(outDir, { recursive: true });
const xBuf = Buffer.from(X.buffer);
const mBuf = Buffer.from(M.buffer);
const idsBuf = Buffer.from(rows.map((r) => r.id).join('\n') + '\n');
writeFileSync(path.join(outDir, 'X.f32le'), xBuf);
writeFileSync(path.join(outDir, 'mask.u8'), mBuf);
writeFileSync(path.join(outDir, 'ids.txt'), idsBuf);

const descriptor = {
  schema: 'atlas.summary-priority-matrix.v1', generatedAt: new Date().toISOString(),
  canonicalAuthority: false, writesPerformed: false, status: 'DRAFT_NOT_CANONICAL',
  blockers: ['chunk rows carry no source/workspace revision (cohort is not revision-qualified)', 'embedding validity is not checked (placeholder-vector writer existed); non-null only', 'chunk-level page_rank_score, community_id and token_count are empty'],
  population: { rule: 'content_embedding_768 IS NOT NULL AND summary blank', totalChunks: Number(sourceCounts.total), eligibleChunks: Number(sourceCounts.eligible), rowsInMatrix: N, limited: LIMIT > 0 },
  shape: [N, K], dtype: 'float32-le', rowOrder: 'ORDER BY id (uuid text)', missingValueWrittenAs: 0, maskFile: 'mask.u8',
  columns: COLUMNS_V1.map((c, k) => ({ ...c, index: k, observed: observed[k], observedFraction: N ? Math.round((observed[k] / N) * 1e4) / 1e4 : 0 })),
  files: { 'X.f32le': { bytes: xBuf.length, sha256: sha(xBuf) }, 'mask.u8': { bytes: mBuf.length, sha256: sha(mBuf) }, 'ids.txt': { bytes: idsBuf.length, sha256: sha(idsBuf) } },
  atlasIndex: { generated_at: atlas.generated_at, files: atlas.files.length },
  tokenRemap: {
    status: 'NOT_COMPUTED', stage: 'after the retrieval/recommendation audit (docs/architecture/PARENT_ATLAS_RECOMMENDATION_AND_RETRIEVAL_POLICY.md)',
    reason: 'codebase_chunk_index.token_count has 0 populated rows; content length is a proxy only',
    reservedColumnIds: ['SPM_006 token_count_exact', 'SPM_007 token_budget_fraction_of_admitted_input'],
    rule: 'a future remap may append columns; it must not change the meaning or order of SPM_001..SPM_005',
  },
};
writeFileSync(path.join(outDir, 'descriptor.json'), JSON.stringify(descriptor, null, 2));
console.log(`matrix ${N} x ${K} -> ${path.relative(ROOT, outDir)}`);
console.log(descriptor.columns.map((c) => `${c.columnId} ${c.name}: ${(c.observedFraction * 100).toFixed(2)}% observed`).join('\n'));
