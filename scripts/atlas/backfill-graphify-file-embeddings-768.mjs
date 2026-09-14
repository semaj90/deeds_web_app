#!/usr/bin/env node
/**
 * Backfill canonical semantic_768 embeddings for files indexed by daily Graphify.
 *
 * Default mode is dry-run. --apply plus explicit migration authorization is
 * required for PostgreSQL writes. Apply mode is authoritative and fail-closed:
 * it requires the dedicated llama.cpp :8081 embedding server plus immutable
 * runtime provenance. Qdrant/TurboVec are intentionally not written here.
 *
 * Canonical writer rule:
 *   codebase_chunk_index row
 *     -> exactly one PROVEN atlas_packet_chunk_lineage row
 *     -> exact packetKey + canonicalChunkId + sourceRevision
 *     -> exact atlas_workspace_source_bindings workspace/source binding
 *     -> embedding write guarded by the same lineage tuple
 *     -> independent readback of identity + dimensions + embedding version.
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
const OUT = path.resolve(REPO_ROOT, String(args.get('out') ?? 'docs/reports/graphify-file-embedding-backfill-v3.json'));

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
const WORKSPACE_REVISION = String(args.get('workspace-revision') ?? env.ATLAS_WORKSPACE_REVISION ?? '').trim();

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function hashJson(value) {
  return hash(JSON.stringify(value));
}
function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(value);
}
function isQualifiedRevision(value) {
  return /^sha256:[a-f0-9]{64}$/i.test(String(value ?? ''));
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

async function requireRevisionQualifiedSchema(pool) {
  if (!isQualifiedRevision(WORKSPACE_REVISION)) {
    throw new Error('REVISION_QUALIFIED_RUN_REQUIRES_WORKSPACE_REVISION');
  }

  const columns = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'codebase_chunk_index' AND column_name IN ('id', 'source_ref', 'content_embedding'))
        OR (table_name = 'atlas_packet_chunk_lineage' AND column_name IN ('chunk_row_id', 'canonical_chunk_id', 'packet_key', 'source_ref', 'source_revision', 'revision_status'))
        OR (table_name = 'atlas_workspace_source_bindings' AND column_name IN ('canonical_source_ref', 'workspace_revision', 'source_revision'))
      )
  `);
  const present = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const required = [
    'codebase_chunk_index.id',
    'codebase_chunk_index.source_ref',
    'codebase_chunk_index.content_embedding',
    'atlas_packet_chunk_lineage.chunk_row_id',
    'atlas_packet_chunk_lineage.canonical_chunk_id',
    'atlas_packet_chunk_lineage.packet_key',
    'atlas_packet_chunk_lineage.source_ref',
    'atlas_packet_chunk_lineage.source_revision',
    'atlas_packet_chunk_lineage.revision_status',
    'atlas_workspace_source_bindings.canonical_source_ref',
    'atlas_workspace_source_bindings.workspace_revision',
    'atlas_workspace_source_bindings.source_revision',
  ];
  const missing = required.filter((column) => !present.has(column));
  if (missing.length > 0) {
    throw new Error(`REVISION_QUALIFIED_WRITER_SCHEMA_REQUIRED:${missing.join(',')}`);
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

async function readbackCanonicalSemanticRow(client, row, expectedEmbeddingVersion) {
  const readback = await client.query(`
    SELECT
      c.id::text AS id,
      l.canonical_chunk_id::text AS canonical_chunk_id,
      l.packet_key::text AS packet_key,
      l.source_ref::text AS source_ref,
      l.source_revision::text AS source_revision,
      b.workspace_revision::text AS workspace_revision,
      c.embedding_model::text AS embedding_model,
      c.embedding_version::text AS embedding_version,
      vector_dims(c.content_embedding::vector)::int AS dimensions
    FROM public.codebase_chunk_index c
    JOIN public.atlas_packet_chunk_lineage l
      ON l.chunk_row_id = c.id
     AND l.revision_status = 'PROVEN'
     AND l.canonical_chunk_id::text = $2
     AND l.packet_key::text = $3
     AND l.source_ref::text = $4
     AND l.source_revision::text = $5
    JOIN public.atlas_workspace_source_bindings b
      ON b.canonical_source_ref = l.source_ref
     AND b.source_revision::text = l.source_revision::text
     AND b.workspace_revision::text = $6
    WHERE c.id = $1::uuid
  `, [row.id, row.canonical_chunk_id, row.packet_key, row.source_ref, row.source_revision, WORKSPACE_REVISION]);

  if (readback.rowCount !== 1) {
    throw new Error(`SEMANTIC_WRITE_READBACK_IDENTITY_MISMATCH:${row.id}:rows=${readback.rowCount}`);
  }
  const proof = readback.rows[0];
  if (proof.dimensions !== 768) throw new Error(`SEMANTIC_WRITE_READBACK_DIMENSION_MISMATCH:${row.id}:${proof.dimensions}`);
  if (proof.embedding_model !== UPSTREAM_MODEL_ID) throw new Error(`SEMANTIC_WRITE_READBACK_MODEL_MISMATCH:${row.id}`);
  if (proof.embedding_version !== expectedEmbeddingVersion) throw new Error(`SEMANTIC_WRITE_READBACK_VERSION_MISMATCH:${row.id}`);
  return proof;
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
  const representationRevision = `sha256:${bindingChecksum}`;
  const pool = new Pool({
    connectionString: resolveDatabaseUrl(env),
    max: 2,
    application_name: 'graphify-file-embedding-768-backfill',
  });

  const report = {
    schema: 'atlas.graphify-file-embedding-backfill.v3',
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
      workspaceRevision: WORKSPACE_REVISION || null,
    },
    lineageContract: {
      canonicalChunkOwner: 'atlas_packet_chunk_lineage',
      workspaceBindingOwner: 'atlas_workspace_source_bindings',
      requiresRevisionStatus: 'PROVEN',
      requiresSingleCanonicalBindingPerChunk: true,
      writeRechecksCanonicalIdentity: true,
      independentReadback: true,
    },
    binding,
    bindingChecksum,
    representationRevision,
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
    readbackProven: 0,
    truncatedInputs: 0,
    inputLineageChecksum: null,
    inputLineageSample: [],
    canonicalLineageSample: [],
    readbackSample: [],
    errors: [],
  };

  try {
    await requireRevisionQualifiedSchema(pool);
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
      WITH lineage_one AS (
        SELECT
          chunk_row_id,
          min(canonical_chunk_id::text) AS canonical_chunk_id,
          min(packet_key::text) AS packet_key,
          min(source_ref::text) AS source_ref,
          min(source_revision::text) AS source_revision
        FROM public.atlas_packet_chunk_lineage
        WHERE revision_status = 'PROVEN'
          AND canonical_chunk_id IS NOT NULL
          AND packet_key IS NOT NULL
          AND source_ref IS NOT NULL
          AND source_revision IS NOT NULL
        GROUP BY chunk_row_id
        HAVING count(*) = 1
           AND count(DISTINCT canonical_chunk_id::text) = 1
           AND count(DISTINCT packet_key::text) = 1
           AND count(DISTINCT source_ref::text) = 1
           AND count(DISTINCT source_revision::text) = 1
      )
      SELECT
        c.id::text,
        c.relative_path,
        c.symbol,
        c.kind,
        c.summary,
        c.content,
        c.source_ref,
        c.content_hash,
        c.ast_symbols,
        l.canonical_chunk_id,
        l.packet_key,
        l.source_revision,
        b.workspace_revision::text AS workspace_revision
      FROM public.codebase_chunk_index c
      JOIN lineage_one l
        ON l.chunk_row_id = c.id
       AND l.source_ref = c.source_ref
      JOIN public.atlas_workspace_source_bindings b
        ON b.canonical_source_ref = l.source_ref
       AND b.source_revision::text = l.source_revision
       AND b.workspace_revision::text = $3
      WHERE c.content_embedding IS NULL
        AND c.embedding_eligible = true
        AND c.updated_at >= NOW() - ($1 * INTERVAL '1 hour')
        AND COALESCE(c.content, c.summary, c.relative_path, c.source_ref, '') <> ''
      ORDER BY c.updated_at DESC, c.id
      LIMIT $2
    `, [SINCE_HOURS, LIMIT, WORKSPACE_REVISION]);

    report.selected = result.rows.length;
    report.sample = result.rows.slice(0, 5).map((row) => ({
      id: row.id,
      canonicalChunkId: row.canonical_chunk_id,
      packetKey: row.packet_key,
      relativePath: row.relative_path,
      sourceRef: row.source_ref,
      sourceRevision: row.source_revision,
      workspaceRevision: row.workspace_revision,
      sourceTextChecksum: hash(embeddingText(row)),
    }));
    report.canonicalLineageSample = result.rows.slice(0, 5).map((row) => ({
      id: row.id,
      canonicalChunkId: row.canonical_chunk_id,
      packetKey: row.packet_key,
      sourceRef: row.source_ref,
      sourceRevision: row.source_revision,
      workspaceRevision: row.workspace_revision,
      representationRevision,
    }));

    if (result.rows.some((row) => row.workspace_revision !== WORKSPACE_REVISION)) {
      throw new Error('SEMANTIC_WRITER_SELECTED_MIXED_WORKSPACE_REVISION');
    }
    if (result.rows.some((row) => !isQualifiedRevision(row.source_revision))) {
      throw new Error('SEMANTIC_WRITER_SELECTED_UNQUALIFIED_SOURCE_REVISION');
    }

    let preparedInputs = null;
    if (REQUIRE_EMBED_SERVER) {
      preparedInputs = [];
      for (const row of result.rows) preparedInputs.push(await prepareEmbeddingInput(row));
      report.truncatedInputs = preparedInputs.filter((entry) => entry.truncated).length;
      const lineage = preparedInputs.map(({ finalInput: _finalInput, ...entry }, index) => ({
        ...entry,
        canonicalChunkId: result.rows[index].canonical_chunk_id,
        packetKey: result.rows[index].packet_key,
        sourceRef: result.rows[index].source_ref,
        sourceRevision: result.rows[index].source_revision,
        workspaceRevision: result.rows[index].workspace_revision,
        representationRevision,
      }));
      report.inputLineageChecksum = hashJson(lineage);
      report.inputLineageSample = lineage.slice(0, 5);
    }

    if (!APPLY) {
      report.status = result.rows.length > 0 ? 'DRY_RUN_CANONICAL_LINEAGE_READY' : 'DRY_RUN_CANONICAL_LINEAGE_EMPTY';
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
              UPDATE public.codebase_chunk_index c
              SET content_embedding = $1::halfvec(768),
                  embedding_model = $2,
                  embedding_version = $3,
                  embedding_dimension = 768,
                  embedding_normalized = true,
                  embedding_created_at = COALESCE(embedding_created_at, NOW()),
                  updated_at = NOW()
              WHERE c.id = $4::uuid
                AND c.content_embedding IS NULL
                AND EXISTS (
                  SELECT 1
                  FROM public.atlas_packet_chunk_lineage l
                  JOIN public.atlas_workspace_source_bindings b
                    ON b.canonical_source_ref = l.source_ref
                   AND b.source_revision::text = l.source_revision::text
                   AND b.workspace_revision::text = $9
                  WHERE l.chunk_row_id = c.id
                    AND l.revision_status = 'PROVEN'
                    AND l.canonical_chunk_id::text = $5
                    AND l.packet_key::text = $6
                    AND l.source_ref::text = $7
                    AND l.source_revision::text = $8
                )
              RETURNING c.id::text AS id,
                        c.embedding_version::text AS embedding_version,
                        vector_dims(c.content_embedding::vector)::int AS dimensions
            `, [
              vectorLiteral(vectors[index]),
              UPSTREAM_MODEL_ID,
              version,
              row.id,
              row.canonical_chunk_id,
              row.packet_key,
              row.source_ref,
              row.source_revision,
              WORKSPACE_REVISION,
            ]);
            if (update.rowCount !== 1) {
              report.skipped += 1;
              throw new Error(`SEMANTIC_WRITE_CANONICAL_GUARD_REJECTED:${row.id}`);
            }
            if (update.rows[0]?.dimensions !== 768 || update.rows[0]?.embedding_version !== version) {
              throw new Error(`SEMANTIC_WRITE_RETURNING_MISMATCH:${row.id}`);
            }
            report.written += 1;
            const proof = await readbackCanonicalSemanticRow(client, row, version);
            report.readbackProven += 1;
            if (report.readbackSample.length < 5) report.readbackSample.push(proof);
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
      report.status = report.written === report.selected && report.readbackProven === report.written
        ? 'PASS_CANONICAL_LINEAGE_READBACK'
        : 'FAIL';
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
    readbackProven: report.readbackProven,
    skipped: report.skipped,
    truncatedInputs: report.truncatedInputs,
    scope: report.scope,
    representationRevision: report.representationRevision,
    bindingChecksum: report.bindingChecksum,
    out: OUT,
    errors: report.errors,
  }, null, 2));
  if (report.status === 'FAIL') process.exit(1);
}

main();
