#!/usr/bin/env node
/**
 * Backfill canonical 768d embeddings for files indexed by daily Graphify.
 *
 * Default mode is dry-run. --apply is required for PostgreSQL writes.
 * Scope is bounded by updated_at so this does not re-embed the full corpus.
 * Qdrant/TurboVec are intentionally not written here; they are projections
 * rebuilt only after canonical PostgreSQL coverage is verified.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const { Pool } = pg;
const env = loadRepoEnv(process.env);
const args = new Map();
const flags = new Set();
for (const arg of process.argv.slice(2)) {
  if (!arg.startsWith('--')) continue;
  const index = arg.indexOf('=');
  if (index < 0) flags.add(arg.slice(2));
  else args.set(arg.slice(2, index), arg.slice(index + 1));
}

const APPLY = flags.has('apply');
const LIMIT = Math.max(1, Math.min(5000, Number(args.get('limit') ?? 128)));
const BATCH_SIZE = Math.max(1, Math.min(64, Number(args.get('batch-size') ?? 16)));
const SINCE_HOURS = Math.max(1, Math.min(720, Number(args.get('since-hours') ?? 24)));
const MODEL = String(args.get('model') ?? env.EMBEDDINGGEMMA_MODEL ?? env.EMBEDDING_GEMMA_MODEL ?? 'embeddinggemma:latest');
const OLLAMA_URL = String(args.get('ollama-url') ?? env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
const OUT = path.resolve(REPO_ROOT, String(args.get('out') ?? 'docs/reports/graphify-file-embedding-backfill-v1.json'));

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function vectorLiteral(vector) { return `[${vector.join(',')}]`; }
function validateVector(vector) {
  if (!Array.isArray(vector) || vector.length !== 768 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error(`Embedding must be a finite 768d array; received ${Array.isArray(vector) ? vector.length : 'non-array'}`);
  }
}
function embeddingText(row) {
  const ast = Array.isArray(row.ast_symbols) ? row.ast_symbols.join(' ') : '';
  return [row.relative_path, row.symbol, row.kind, row.summary, row.content, ast].filter(Boolean).join('\n').trim().slice(0, 12_000);
}
async function jsonFetch(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
  const text = await response.text();
  let result = {};
  try { result = JSON.parse(text); } catch { result = { raw: text }; }
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}: ${text.slice(0, 300)}`);
  return result;
}
async function embedBatch(texts) {
  const result = await jsonFetch(`${OLLAMA_URL}/api/embed`, { model: MODEL, input: texts, dimensions: 768, truncate: true, keep_alive: '30m' });
  if (!Array.isArray(result.embeddings) || result.embeddings.length !== texts.length) throw new Error(`Embedding count mismatch: expected ${texts.length}`);
  result.embeddings.forEach(validateVector);
  return result.embeddings;
}
async function main() {
  const started = Date.now();
  const pool = new Pool({ connectionString: resolveDatabaseUrl(env), max: 2, application_name: 'graphify-file-embedding-768-backfill' });
  const report = { schema: 'atlas.graphify-file-embedding-backfill.v1', generatedAt: new Date().toISOString(), apply: APPLY, scope: { table: 'codebase_chunk_index', canonicalColumn: 'content_embedding_768', sinceHours: SINCE_HOURS, limit: LIMIT }, model: MODEL, ollamaUrl: OLLAMA_URL, status: 'FAIL', selected: 0, embedded: 0, written: 0, skipped: 0, errors: [] };
  try {
    const schema = await pool.query(`
      SELECT format_type(a.atttypid, a.atttypmod) AS declared_type
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'codebase_chunk_index' AND a.attname = 'content_embedding_768'
        AND a.attnum > 0 AND NOT a.attisdropped
    `);
    if (schema.rowCount !== 1 || !/^(vector|halfvec)\(768\)$/.test(schema.rows[0].declared_type)) throw new Error(`content_embedding_768 is missing or has unexpected type: ${schema.rows[0]?.declared_type ?? 'missing'}`);
    report.scope.declaredType = schema.rows[0].declared_type;
    const result = await pool.query(`
      SELECT id::text, relative_path, symbol, kind, summary, content, source_ref, content_hash, ast_symbols
      FROM codebase_chunk_index
      WHERE content_embedding_768 IS NULL
        AND updated_at >= NOW() - ($1 * INTERVAL '1 hour')
        AND COALESCE(content, summary, relative_path, source_ref, '') <> ''
      ORDER BY updated_at DESC, id
      LIMIT $2
    `, [SINCE_HOURS, LIMIT]);
    report.selected = result.rows.length;
    report.sample = result.rows.slice(0, 5).map((row) => ({ id: row.id, relativePath: row.relative_path, sourceRef: row.source_ref, textHash: hash(embeddingText(row)) }));
    if (!APPLY) { report.status = 'DRY_RUN'; }
    else {
      for (let offset = 0; offset < result.rows.length; offset += BATCH_SIZE) {
        const rows = result.rows.slice(offset, offset + BATCH_SIZE);
        const vectors = await embedBatch(rows.map(embeddingText));
        report.embedded += vectors.length;
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index];
            const version = hash(`semantic_768:graphify:${MODEL}:${row.content_hash ?? hash(embeddingText(row))}`);
            const update = await client.query(`
              UPDATE codebase_chunk_index
              SET content_embedding_768 = $1::vector(768), embedding_model = $2, embedding_version = $3, embedding_created_at = NOW(), updated_at = NOW()
              WHERE id = $4::uuid AND content_embedding_768 IS NULL
            `, [vectorLiteral(vectors[index]), MODEL, version, row.id]);
            if (update.rowCount === 1) report.written += 1;
            else report.skipped += 1;
          }
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
      }
      report.status = 'PASS';
    }
  } catch (error) { report.errors.push(error.message); }
  finally { await pool.end(); }
  report.elapsedMs = Date.now() - started;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ status: report.status, selected: report.selected, embedded: report.embedded, written: report.written, skipped: report.skipped, scope: report.scope, out: OUT, errors: report.errors }, null, 2));
  if (report.status === 'FAIL') process.exit(1);
}
main();
