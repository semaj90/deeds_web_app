#!/usr/bin/env node
/** Bounded daily RFF error/signature embedding backfill for Graphify files. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const { Pool } = pg;
const env = loadRepoEnv(process.env);
const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith('--') && !arg.includes('=')));
const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const APPLY = flags.has('--apply');
const SIGNATURE_ONLY = flags.has('--signature-only');
const LIMIT = Math.max(1, Math.min(2000, Number(arg('limit', 64))));
const BATCH = Math.max(1, Math.min(32, Number(arg('batch-size', 8))));
const SINCE_HOURS = Math.max(1, Math.min(720, Number(arg('since-hours', 24))));
const MODEL = String(arg('model', env.EMBEDDINGGEMMA_MODEL ?? env.EMBEDDING_GEMMA_MODEL ?? 'embeddinggemma:latest'));
if (!/^embeddinggemma(?::|$)/i.test(MODEL)) throw new Error(`CANONICAL_EMBEDDING_MODEL_REQUIRED:received=${MODEL}`);
const OLLAMA_URL = String(arg('ollama-url', env.OLLAMA_URL ?? 'http://127.0.0.1:11434')).replace(/\/+$/, '');
const OUT = path.resolve(REPO_ROOT, String(arg('out', 'docs/reports/graphify-rff-embedding-backfill-v1.json')));

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function vectorLiteral(vector) { return `[${vector.join(',')}]`; }
function validate(vector) { if (!Array.isArray(vector) || vector.length !== 768 || vector.some((value) => !Number.isFinite(value))) throw new Error(`Expected finite 768d embedding, got ${Array.isArray(vector) ? vector.length : 'non-array'}`); }
function errorText(row) { return `error pattern ${row.relative_path} ${row.kind ?? ''} ${row.symbol ?? ''}\n${String(row.content ?? '').slice(0, 8000)}`; }
function signatureText(row) { return `code signature ${row.relative_path} ${row.kind ?? ''} ${row.symbol ?? ''}\nAST: ${JSON.stringify(row.ast_symbols ?? [])}\n${String(row.summary ?? '').slice(0, 4000)}\n${String(row.content ?? '').slice(0, 4000)}`; }
async function embed(texts) {
  const response = await fetch(`${OLLAMA_URL}/api/embed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, input: texts, dimensions: 768, truncate: true, keep_alive: '30m' }), signal: AbortSignal.timeout(120_000) });
  const body = await response.json();
  if (!response.ok || !Array.isArray(body.embeddings) || body.embeddings.length !== texts.length) throw new Error(`EmbeddingGemma batch failed: HTTP ${response.status}`);
  body.embeddings.forEach(validate);
  return body.embeddings;
}
async function main() {
  const pool = new Pool({ connectionString: resolveDatabaseUrl(env), max: 2, application_name: 'graphify-rff-embedding-backfill' });
  const report = { schema: 'atlas.graphify-rff-embedding-backfill.v1', generatedAt: new Date().toISOString(), apply: APPLY, signatureOnly: SIGNATURE_ONLY, model: MODEL, scope: { sinceHours: SINCE_HOURS, limit: LIMIT, batchSize: BATCH }, status: 'FAIL', selected: 0, errorEmbedded: 0, signatureEmbedded: 0, written: 0, errors: [] };
  try {
    const schema = await pool.query(`
      SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS declared_type
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'codebase_chunk_index'
        AND a.attname IN ('error_embedding', 'signature_embedding') AND a.attnum > 0 AND NOT a.attisdropped
    `);
    report.schemaColumns = Object.fromEntries(schema.rows.map((row) => [row.attname, row.declared_type]));
    const errorCompatible = /^(vector|halfvec)\(768\)$/.test(report.schemaColumns.error_embedding ?? '');
    const signatureCompatible = /^(vector|halfvec)\(768\)$/.test(report.schemaColumns.signature_embedding ?? '');
    if (!signatureCompatible || (!SIGNATURE_ONLY && !errorCompatible)) {
      report.status = 'BLOCKED_DIMENSION_CONTRACT';
      report.errors.push('RFF columns are not 768d; no writes attempted. Existing RFF columns are legacy compatibility lanes.');
      throw new Error(report.errors[0]);
    }
    const result = await pool.query(`
      SELECT id::text, relative_path, kind, symbol, summary, content, ast_symbols,
        error_embedding IS NULL AS missing_error, signature_embedding IS NULL AS missing_signature
      FROM codebase_chunk_index
      WHERE updated_at >= NOW() - ($1 * INTERVAL '1 hour')
        AND signature_embedding IS NULL
        ${SIGNATURE_ONLY ? '' : 'OR error_embedding IS NULL'}
      ORDER BY updated_at DESC, id
      LIMIT $2
    `, [SINCE_HOURS, LIMIT]);
    report.selected = result.rows.length;
    report.sample = result.rows.slice(0, 5).map((row) => ({ id: row.id, sourceRef: row.relative_path, missingError: row.missing_error, missingSignature: row.missing_signature }));
    if (!APPLY) report.status = 'DRY_RUN';
    else {
      for (let offset = 0; offset < result.rows.length; offset += BATCH) {
        const rows = result.rows.slice(offset, offset + BATCH);
        const errorRows = SIGNATURE_ONLY ? [] : rows.filter((row) => row.missing_error);
        const signatureRows = rows.filter((row) => row.missing_signature);
        const [errorVectors, signatureVectors] = await Promise.all([embed(errorRows.map(errorText)), embed(signatureRows.map(signatureText))]);
        report.errorEmbedded += errorVectors.length; report.signatureEmbedded += signatureVectors.length;
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (let index = 0; index < errorRows.length; index += 1) {
            const row = errorRows[index];
            const resultRow = await client.query(`UPDATE codebase_chunk_index SET error_embedding = $1::vector(768), embedding_model = $2, embedding_version = $3, updated_at = NOW() WHERE id = $4::uuid AND error_embedding IS NULL`, [vectorLiteral(errorVectors[index]), MODEL, hash(`rff:error:${MODEL}:${row.id}`), row.id]);
            report.written += resultRow.rowCount;
          }
          for (let index = 0; index < signatureRows.length; index += 1) {
            const row = signatureRows[index];
            const resultRow = await client.query(`UPDATE codebase_chunk_index SET signature_embedding = $1::vector(768), embedding_model = $2, embedding_version = $3, updated_at = NOW() WHERE id = $4::uuid AND signature_embedding IS NULL`, [vectorLiteral(signatureVectors[index]), MODEL, hash(`rff:signature:${MODEL}:${row.id}`), row.id]);
            report.written += resultRow.rowCount;
          }
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
      }
      report.status = 'PASS';
    }
  } catch (error) { report.errors.push(error.message); }
  finally { await pool.end(); }
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ status: report.status, selected: report.selected, errorEmbedded: report.errorEmbedded, signatureEmbedded: report.signatureEmbedded, written: report.written, out: OUT, errors: report.errors }, null, 2));
  if (report.status === 'FAIL') process.exit(1);
}
main();
