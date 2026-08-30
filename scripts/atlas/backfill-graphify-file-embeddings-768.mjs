#!/usr/bin/env node
/**
 * Backfill canonical semantic_768 embeddings for files indexed by daily Graphify.
 *
 * Default mode is dry-run. --apply plus explicit migration authorization is
 * required for PostgreSQL writes. Apply mode is authoritative and fail-closed:
 * it requires the dedicated llama.cpp :8081 embedding server plus immutable
 * runtime provenance. Qdrant/TurboVec are intentionally not written here.
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
const REQUIRE_EMBED_SERVER = APPLY || flags.has('require-embed-server');
const LIMIT = Math.max(1, Math.min(5000, Number(args.get('limit') ?? 128)));
const BATCH_SIZE = Math.max(1, Math.min(64, Number(args.get('batch-size') ?? 16)));
const SINCE_HOURS = Math.max(1, Math.min(720, Number(args.get('since-hours') ?? 24)));
const EMBED_SERVER_URL = String(args.get('embed-server-url') ?? env.EMBED_SERVER_URL ?? 'http://127.0.0.1:8081').replace(/\/+$/, '');
const OUT = path.resolve(REPO_ROOT, String(args.get('out') ?? 'docs/reports/graphify-file-embedding-backfill-v2.json'));

const REPRESENTATION_ID = 'semantic_768';
const CANONICAL_COLUMN = 'content_embedding';
const PHYSICAL_TYPE = 'halfvec(768)';
const UPSTREAM_MODEL_ID = 'google/embeddinggemma-300m';
const MAX_INPUT_TOKENS = 2048;
const FORMATTER_REVISION = 'graphify-embed-text-v1';
const INPUT_POLICY_REVISION = 'embeddinggemma-token-prefix-2048-v1';
const PROMPT_REVISION = 'unprompted-v0';
const POOLING = 'mean';
const NORMALIZATION = 'l2';

const UPSTREAM_REVISION = String(args.get('upstream-revision') ?? env.EMBEDDINGGEMMA_UPSTREAM_REVISION ?? '').trim();
const GGUF_SHA256 = String(args.get('gguf-sha256') ?? env.EMBEDDING_GGUF_SHA256 ?? '').trim().toLowerCase();
const LLAMA_CPP_REVISION = String(args.get('llama-cpp-revision') ?? env.LLAMA_CPP_REVISION ?? '').trim();
const TOKENIZER_SHA256 = String(args.get('tokenizer-sha256') ?? env.EMBEDDING_TOKENIZER_SHA256 ?? '').trim().toLowerCase();
const EXECUTION_PROFILE_REVISION = String(args.get('execution-profile-revision') ?? env.EMBEDDING_EXECUTION_PROFILE_REVISION ?? '').trim();

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function hashJson(value) {
  return hash(JSON.stringify(value));
}
function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(value);
}
function vectorLiteral(vector) {
  return `[${vector.join(',')}]`;
}
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
  return [row.relative_path, row.symbol, row.kind, row.summary, row.content, ast]
    .filter(Boolean)
    .join('\n')
    .trim();
}

function runtimeBinding() {
  return {
    upstreamModelId: UPSTREAM_MODEL_ID,
    upstreamRevision: UPSTREAM_REVISION,
    runtime: 'llama.cpp/llama-server',
    endpoint: EMBED_SERVER_URL,
    ggufSha256: GGUF_SHA256,
    llamaCppRevision: LLAMA_CPP_REVISION,
    tokenizerSha256: TOKENIZER_SHA256,
    executionProfileRevision: EXECUTION_PROFILE_REVISION,
    pooling: POOLING,
    normalization: NORMALIZATION,
    representationId: REPRESENTATION_ID,
    dimensions: 768,
    maxInputTokens: MAX_INPUT_TOKENS,
    formatterRevision: FORMATTER_REVISION,
    inputPolicyRevision: INPUT_POLICY_REVISION,
    promptRevision: PROMPT_REVISION,
  };
}

function requireRuntimeBinding() {
  const missing = [];
  if (!UPSTREAM_REVISION) missing.push('upstreamRevision');
  if (!isSha256(GGUF_SHA256)) missing.push('ggufSha256');
  if (!LLAMA_CPP_REVISION) missing.push('llamaCppRevision');
  if (!isSha256(TOKENIZER_SHA256)) missing.push('tokenizerSha256');
  if (!EXECUTION_PROFILE_REVISION) missing.push('executionProfileRevision');
  if (missing.length > 0) {
    throw new Error(`AUTHORITATIVE_EMBEDDING_PROVENANCE_REQUIRED:${missing.join(',')}`);
  }
}

async function jsonFetch(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  let result = {};
  try { result = JSON.parse(text); } catch { result = { raw: text }; }
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}: ${text.slice(0, 300)}`);
  return result;
}

async function requireEmbedServer() {
  try {
    const response = await fetch(`${EMBED_SERVER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`AUTHORITATIVE_EMBED_SERVER_REQUIRED:${error.message}`);
  }
}

function tokenIds(result) {
  if (!Array.isArray(result?.tokens)) throw new Error('TOKENIZE_RESPONSE_MISSING_TOKENS');
  return result.tokens.map((token, index) => {
    const value = typeof token === 'number' ? token : token?.id;
    if (!Number.isInteger(value)) throw new Error(`TOKENIZE_RESPONSE_INVALID_TOKEN:index=${index}`);
    return value;
  });
}

async function tokenize(text) {
  return tokenIds(await jsonFetch(`${EMBED_SERVER_URL}/tokenize`, {
    content: text,
    add_special: false,
    parse_special: true,
    with_pieces: false,
  }));
}

async function prepareEmbeddingInput(row) {
  const sourceText = embeddingText(row);
  if (!sourceText) throw new Error(`EMPTY_GRAPHIFY_EMBED_INPUT:${row.id}`);

  const originalTokens = await tokenize(sourceText);
  let finalInput = sourceText;
  let truncated = false;

  if (originalTokens.length > MAX_INPUT_TOKENS) {
    truncated = true;
    const detokenized = await jsonFetch(`${EMBED_SERVER_URL}/detokenize`, {
      tokens: originalTokens.slice(0, MAX_INPUT_TOKENS),
    });
    if (typeof detokenized?.content !== 'string' || !detokenized.content) {
      throw new Error(`DETOKENIZE_RESPONSE_INVALID:${row.id}`);
    }
    finalInput = detokenized.content;
  }

  const admittedTokens = truncated ? await tokenize(finalInput) : originalTokens;
  if (admittedTokens.length > MAX_INPUT_TOKENS) {
    throw new Error(`TOKEN_ADMISSION_EXCEEDED:${row.id}:received=${admittedTokens.length}:max=${MAX_INPUT_TOKENS}`);
  }

  return {
    id: row.id,
    finalInput,
    sourceTextChecksum: hash(sourceText),
    finalInputChecksum: hash(finalInput),
    originalTokenCount: originalTokens.length,
    admittedTokenCount: admittedTokens.length,
    truncated,
  };
}

async function embedBatch(texts) {
  const result = await jsonFetch(`${EMBED_SERVER_URL}/v1/embeddings`, { input: texts });
  const vectors = Array.isArray(result.data) ? result.data.map((entry) => entry.embedding) : null;
  if (!vectors || vectors.length !== texts.length) {
    throw new Error(`AUTHORITATIVE_EMBED_COUNT_MISMATCH:expected=${texts.length}`);
  }
  vectors.forEach(validateVector);
  return vectors;
}

function embeddingVersion(bindingChecksum, input) {
  return hash([
    REPRESENTATION_ID,
    bindingChecksum,
    FORMATTER_REVISION,
    INPUT_POLICY_REVISION,
    PROMPT_REVISION,
    input.finalInputChecksum,
  ].join('\n'));
}

async function main() {
  const started = Date.now();
  if (APPLY && process.env.ATLAS_AUTHORIZE_SEMANTIC_768_BACKFILL !== '1') {
    throw new Error('EXPLICIT_SEMANTIC_768_BACKFILL_AUTHORIZATION_REQUIRED');
  }
  if (REQUIRE_EMBED_SERVER) {
    requireRuntimeBinding();
    await requireEmbedServer();
  }

  const binding = runtimeBinding();
  const bindingChecksum = hashJson(binding);
  const pool = new Pool({
    connectionString: resolveDatabaseUrl(env),
    max: 2,
    application_name: 'graphify-file-embedding-768-backfill',
  });

  const report = {
    schema: 'atlas.graphify-file-embedding-backfill.v2',
    generatedAt: new Date().toISOString(),
    apply: APPLY,
    requireEmbedServer: REQUIRE_EMBED_SERVER,
    scope: {
      table: 'codebase_chunk_index',
      representationId: REPRESENTATION_ID,
      canonicalColumn: CANONICAL_COLUMN,
      physicalType: PHYSICAL_TYPE,
      sinceHours: SINCE_HOURS,
      limit: LIMIT,
    },
    binding,
    bindingChecksum,
    inputPolicy: {
      formatterRevision: FORMATTER_REVISION,
      inputPolicyRevision: INPUT_POLICY_REVISION,
      promptRevision: PROMPT_REVISION,
      maxInputTokens: MAX_INPUT_TOKENS,
    },
    status: 'FAIL',
    selected: 0,
    embedded: 0,
    written: 0,
    skipped: 0,
    truncatedInputs: 0,
    inputLineageChecksum: null,
    inputLineageSample: [],
    errors: [],
  };

  try {
    const schema = await pool.query(`
      SELECT format_type(a.atttypid, a.atttypmod) AS declared_type
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'codebase_chunk_index'
        AND a.attname = 'content_embedding'
        AND a.attnum > 0
        AND NOT a.attisdropped
    `);
    if (schema.rowCount !== 1 || schema.rows[0].declared_type !== PHYSICAL_TYPE) {
      throw new Error(`content_embedding is missing or has unexpected type: ${schema.rows[0]?.declared_type ?? 'missing'}`);
    }
    report.scope.declaredType = schema.rows[0].declared_type;

    const result = await pool.query(`
      SELECT id::text, relative_path, symbol, kind, summary, content, source_ref, content_hash, ast_symbols
      FROM codebase_chunk_index
      WHERE content_embedding IS NULL
        AND updated_at >= NOW() - ($1 * INTERVAL '1 hour')
        AND COALESCE(content, summary, relative_path, source_ref, '') <> ''
      ORDER BY updated_at DESC, id
      LIMIT $2
    `, [SINCE_HOURS, LIMIT]);

    report.selected = result.rows.length;
    report.sample = result.rows.slice(0, 5).map((row) => ({
      id: row.id,
      relativePath: row.relative_path,
      sourceRef: row.source_ref,
      sourceTextChecksum: hash(embeddingText(row)),
    }));

    let preparedInputs = null;
    if (REQUIRE_EMBED_SERVER) {
      preparedInputs = [];
      for (const row of result.rows) preparedInputs.push(await prepareEmbeddingInput(row));
      report.truncatedInputs = preparedInputs.filter((entry) => entry.truncated).length;
      const lineage = preparedInputs.map(({ finalInput: _finalInput, ...entry }) => entry);
      report.inputLineageChecksum = hashJson(lineage);
      report.inputLineageSample = lineage.slice(0, 5);
    }

    if (!APPLY) {
      report.status = 'DRY_RUN';
    } else {
      for (let offset = 0; offset < result.rows.length; offset += BATCH_SIZE) {
        const rows = result.rows.slice(offset, offset + BATCH_SIZE);
        const inputs = preparedInputs.slice(offset, offset + BATCH_SIZE);
        const vectors = await embedBatch(inputs.map((entry) => entry.finalInput));
        report.embedded += vectors.length;

        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index];
            const version = embeddingVersion(bindingChecksum, inputs[index]);
            const update = await client.query(`
              UPDATE codebase_chunk_index
              SET content_embedding = $1::halfvec(768),
                  embedding_model = $2,
                  embedding_version = $3,
                  embedding_dimension = 768,
                  embedding_normalized = true,
                  embedding_created_at = COALESCE(embedding_created_at, NOW()),
                  updated_at = NOW()
              WHERE id = $4::uuid
                AND content_embedding IS NULL
            `, [vectorLiteral(vectors[index]), UPSTREAM_MODEL_ID, version, row.id]);
            if (update.rowCount === 1) report.written += 1;
            else report.skipped += 1;
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
      report.status = 'PASS';
    }
  } catch (error) {
    report.errors.push(error.message);
  } finally {
    await pool.end();
  }

  report.elapsedMs = Date.now() - started;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    selected: report.selected,
    embedded: report.embedded,
    written: report.written,
    skipped: report.skipped,
    truncatedInputs: report.truncatedInputs,
    scope: report.scope,
    bindingChecksum: report.bindingChecksum,
    out: OUT,
    errors: report.errors,
  }, null, 2));
  if (report.status === 'FAIL') process.exit(1);
}

main();
