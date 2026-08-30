#!/usr/bin/env node
/**
 * Backfill canonical 768d embeddings for files indexed by daily Graphify.
 *
 * Default mode is dry-run. --apply plus explicit migration authorization is
 * required for PostgreSQL writes.
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
// Dedicated GPU embed server (scripts/launch-embed-server.ps1, EMBEDDING_BACKEND=llama_cpp_gguf
// in dev-gpu-runtime.mjs) -- OpenAI-compatible /v1/embeddings, measured live 2026-08-26 at
// ~2.3-2.7ms/doc for batch=32-64 vs Ollama's per-request overhead. Preferred when reachable
// (one-time health probe, not per-batch), falls back to Ollama automatically if not running --
// this script never fails just because :8081 isn't up.
const EMBED_SERVER_URL = String(args.get('embed-server-url') ?? env.EMBED_SERVER_URL ?? 'http://127.0.0.1:8081').replace(/\/+$/, '');
const NO_CUDA_EMBED = flags.has('no-cuda-embed');
const OUT = path.resolve(REPO_ROOT, String(args.get('out') ?? 'docs/reports/graphify-file-embedding-backfill-v1.json'));

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function vectorLiteral(vector) { return `[${vector.join(',')}]`; }
function validateVector(vector) {
  if (!Array.isArray(vector) || vector.length !== 768 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error(`Embedding must be a finite 768d array; received ${Array.isArray(vector) ? vector.length : 'non-array'}`);
  }
  const normSquared = vector.reduce((sum, value) => sum + value * value, 0);
  if (!Number.isFinite(normSquared) || normSquared < 0.98 || normSquared > 1.02) {
    throw new Error(`Embedding must be L2-normalized; received normSquared=${normSquared}`);
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
async function probeCudaEmbedServer() {
  if (NO_CUDA_EMBED) return false;
  try {
    const res = await fetch(`${EMBED_SERVER_URL}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch { return false; }
}
// VRAM guard: 690MB free with the embed server loaded was measured live
// 2026-08-26 and explicitly classified as "TIGHT, MONITOR" not abundant --
// this is a single shared 8GB card also holding the :8090 production
// generation server. Fail open to Ollama (never hard-fail the run) if free
// VRAM drops below the threshold. Checked once at startup and again at the
// midpoint of a run, not per-batch (nvidia-smi has real process-spawn
// overhead; this is a bounded --limit=128 job, not the halted bulk corpus
// run where a tighter per-batch check would be worth the cost).
const MIN_FREE_VRAM_MB = Number(args.get('min-free-vram-mb') ?? env.MIN_FREE_VRAM_MB ?? 300);
async function getFreeVramMb() {
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=memory.free', '--format=csv,noheader,nounits',
    ], { timeout: 3000 });
    const freeMb = Number(stdout.trim());
    return Number.isFinite(freeMb) ? freeMb : null;
  } catch {
    return null; // nvidia-smi unavailable -- guard is advisory-only, never blocks the run
  }
}
async function embedBatchCuda(texts) {
  // OpenAI-compatible shape: { data: [{ embedding: [...] }, ...] } -- distinct
  // from Ollama's { embeddings: [[...], ...] }.
  const result = await jsonFetch(`${EMBED_SERVER_URL}/v1/embeddings`, { input: texts });
  const vectors = Array.isArray(result.data) ? result.data.map((d) => d.embedding) : null;
  if (!vectors || vectors.length !== texts.length) throw new Error(`CUDA embed count mismatch: expected ${texts.length}`);
  vectors.forEach(validateVector);
  return vectors;
}
async function embedBatchOllama(texts) {
  const result = await jsonFetch(`${OLLAMA_URL}/api/embed`, { model: MODEL, input: texts, dimensions: 768, truncate: true, keep_alive: '30m' });
  if (!Array.isArray(result.embeddings) || result.embeddings.length !== texts.length) throw new Error(`Embedding count mismatch: expected ${texts.length}`);
  result.embeddings.forEach(validateVector);
  return result.embeddings;
}
// Resolved once at startup (see main()), not re-probed per batch -- avoids a
// failed health check on every single batch if the CUDA server isn't running.
let useCudaEmbed = false;
async function embedBatch(texts) {
  if (useCudaEmbed) {
    try {
      return await embedBatchCuda(texts);
    } catch (error) {
      console.error(`[embed] CUDA embed server call failed mid-run, falling back to Ollama for this batch: ${error.message}`);
      return embedBatchOllama(texts);
    }
  }
  return embedBatchOllama(texts);
}
async function main() {
  const started = Date.now();
  if (APPLY && process.env.ATLAS_AUTHORIZE_SEMANTIC_768_BACKFILL !== '1') {
    throw new Error('EXPLICIT_SEMANTIC_768_BACKFILL_AUTHORIZATION_REQUIRED');
  }
  if (!/^embeddinggemma(?::|$)/i.test(MODEL)) {
    throw new Error(`CANONICAL_EMBEDDING_MODEL_REQUIRED:received=${MODEL}`);
  }
  const pool = new Pool({ connectionString: resolveDatabaseUrl(env), max: 2, application_name: 'graphify-file-embedding-768-backfill' });
  useCudaEmbed = await probeCudaEmbedServer();
  const startVramFreeMb = await getFreeVramMb();
  if (useCudaEmbed && startVramFreeMb !== null && startVramFreeMb < MIN_FREE_VRAM_MB) {
    console.warn(`[embed] VRAM guard: ${startVramFreeMb}MB free < ${MIN_FREE_VRAM_MB}MB threshold -- falling back to Ollama for this entire run rather than risk an OOM on the shared 8GB card.`);
    useCudaEmbed = false;
  }
  const embedBackend = useCudaEmbed ? 'llama_cpp_gguf_cuda' : 'ollama';
  console.log(`[embed] backend: ${embedBackend}${useCudaEmbed ? ` (${EMBED_SERVER_URL})` : ` (${OLLAMA_URL})`}${startVramFreeMb !== null ? ` | VRAM free at start: ${startVramFreeMb}MB` : ''}`);
  const report = { schema: 'atlas.graphify-file-embedding-backfill.v1', generatedAt: new Date().toISOString(), apply: APPLY, scope: { table: 'codebase_chunk_index', canonicalColumn: 'content_embedding_768', sinceHours: SINCE_HOURS, limit: LIMIT }, model: MODEL, embedBackend, ollamaUrl: OLLAMA_URL, embedServerUrl: useCudaEmbed ? EMBED_SERVER_URL : null, vram: { minFreeMbThreshold: MIN_FREE_VRAM_MB, freeMbAtStart: startVramFreeMb, freeMbAtMidpoint: null, freeMbAtEnd: null, guardTriggered: useCudaEmbed === false && startVramFreeMb !== null && startVramFreeMb < MIN_FREE_VRAM_MB }, status: 'FAIL', selected: 0, embedded: 0, written: 0, skipped: 0, errors: [] };
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
      const midpointOffset = Math.floor(result.rows.length / 2);
      let midpointChecked = false;
      for (let offset = 0; offset < result.rows.length; offset += BATCH_SIZE) {
        if (useCudaEmbed && !midpointChecked && offset >= midpointOffset) {
          midpointChecked = true;
          const midFreeMb = await getFreeVramMb();
          report.vram.freeMbAtMidpoint = midFreeMb;
          if (midFreeMb !== null && midFreeMb < MIN_FREE_VRAM_MB) {
            console.warn(`[embed] VRAM guard: ${midFreeMb}MB free < ${MIN_FREE_VRAM_MB}MB threshold mid-run -- switching remaining batches to Ollama.`);
            useCudaEmbed = false;
            report.vram.guardTriggered = true;
            report.vram.guardTriggeredAtOffset = offset;
          }
        }
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
              SET content_embedding_768 = $1::vector(768), embedding_model = $2, embedding_version = $3, embedding_dimension = 768, embedding_normalized = true, embedding_created_at = COALESCE(embedding_created_at, NOW()), updated_at = NOW()
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
  report.vram.freeMbAtEnd = await getFreeVramMb();
  report.elapsedMs = Date.now() - started;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ status: report.status, selected: report.selected, embedded: report.embedded, written: report.written, skipped: report.skipped, scope: report.scope, out: OUT, errors: report.errors }, null, 2));
  if (report.status === 'FAIL') process.exit(1);
}
main();
