#!/usr/bin/env node
/**
 * index-full-repo-for-search.mjs
 *
 * Chunk + embed repo roots that are currently missing from
 * codebase_chunk_index / Qdrant codebase_chunks_768.
 *
 * Targets (relative to repo root):
 * Default roots (relative to repo root):
 *   sveltekit-frontend/  – app source, scripts, docs, memory, drizzle
 *   scripts/             – Atlas pipeline, agentic scripts, audit tools
 *   packages/            – atlas-core, parent-atlas-*, mono-repo libs
 *   crates/              – Rust code
 *   simd-bridge/         – C++ N-API bridge
 *   proto/               – gRPC / protobuf definitions
 *   docs/                 – architecture docs
 *   go/                  – Go services
 *   python/              – Python tooling
 *   services/             – additional service code
 *
 * Strategy per file:
 *   1. Split into sliding-window chunks (~800 chars, 100-char overlap)
 *   2. Embed each chunk via Ollama embeddinggemma:latest (768-dim)
 *   3. Upsert chunk into codebase_chunk_index.content_embedding_768 (vector(768))
 *   4. Upsert point into Qdrant codebase_chunks_768 (named vector "content")
 *
 * Idempotent: uses content_hash ON CONFLICT (qdrant_id) DO UPDATE.
 * Skips files already indexed (content_hash matches).
 *
 * Usage:
 *   node scripts/atlas/index-full-repo-for-search.mjs --dry-run
 *   node scripts/atlas/index-full-repo-for-search.mjs --apply
 *   node scripts/atlas/index-full-repo-for-search.mjs --apply --limit=500
 *   node scripts/atlas/index-full-repo-for-search.mjs --apply --target=scripts
 *   node scripts/atlas/index-full-repo-for-search.mjs --apply --roots=sveltekit-frontend,scripts,packages
 *   node scripts/atlas/index-full-repo-for-search.mjs --apply --verbose
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SCAN_ROOTS, parseRoots, shouldSkipDirectory } from './lib/repo-scan-roots.mjs';
import { buildTopologyEnvelope, deriveDomainClass, deriveFeatureId, deriveCentroidKeys } from './lib/topology-ontology.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dir, '../..');

process.stdout.on('error', (err) => {
  if (err?.code === 'EPIPE') {
    process.exit(0);
  }
  throw err;
});

// ── CLI args ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const APPLY     = argv.includes('--apply');
const DRY_RUN   = !APPLY;
const VERBOSE   = argv.includes('--verbose');

function getArgValue(flagName) {
  const flagIdx = argv.findIndex((arg) => arg === flagName || arg.startsWith(`${flagName}=`));
  if (flagIdx < 0) return null;
  const arg = argv[flagIdx];
  if (arg.includes('=')) {
    const value = arg.slice(flagName.length + 1);
    return value.length > 0 ? value : null;
  }
  const next = argv[flagIdx + 1];
  if (!next || next.startsWith('--')) return null;
  return next;
}

const LIMIT = Number.parseInt(getArgValue('--limit') ?? '0', 10) || 0;
const TARGET = getArgValue('--target');
const ROOTS_ARG = getArgValue('--roots');
const AST_MANIFEST_PATH = getArgValue('--ast-manifest');

// ── Config ───────────────────────────────────────────────────────────────────
const OLLAMA_URL   = process.env.OLLAMA_URL   ?? 'http://localhost:11434';
const EMBEDDING_BACKEND = String(process.env.EMBEDDING_BACKEND ?? 'ollama').toLowerCase();
const EMBED_SERVER_URL = (process.env.EMBED_SERVER_URL ?? process.env.OLLAMA_EMBED_BASE_URL ?? 'http://127.0.0.1:8081').replace(/\/$/, '');
const QDRANT_URL   = process.env.QDRANT_URL   ?? 'http://127.0.0.1:6333';
const DATABASE_URL = process.env.DATABASE_URL ??
  'postgres://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST   = process.env.REDIS_HOST     ?? '127.0.0.1';
const REDIS_PORT   = parseInt(process.env.REDIS_PORT ?? '6379', 10);
const REDIS_PASS   = process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis';
const WARM_CENTROIDS = !process.argv.includes('--no-redis');
const EMBED_MODEL  = 'embeddinggemma:latest';
const COLLECTION   = 'codebase_chunks_768';
// TTL for centroid keys in Redis (24h)
const CENTROID_TTL = 24 * 3600;
const CHUNK_SIZE   = 800;   // chars
const CHUNK_OVERLAP = 100;  // chars
const EMBED_BATCH  = Math.max(1, Number.parseInt(process.env.EMBED_MAX_BATCH ?? (EMBEDDING_BACKEND === 'llama_cpp_gguf' ? '64' : '8'), 10) || 8);
const EMBED_MAX_TOKENS = Math.max(1, Number.parseInt(process.env.EMBED_MAX_TOKENS ?? '512', 10) || 512);
const EMBED_MAX_BYTES = Math.max(1, Number.parseInt(process.env.EMBED_MAX_BYTES ?? '200000', 10) || 200000);
const LARGE_FILE_BYTES = 200_000;  // 200KB — switch to smart-chunking for large files
const MAX_CHUNKS_PER_FILE = 50;    // cap chunks per file even for large ones
const GENERATED_PATTERNS = [
  /\.pb\.go$/i,
  /\.generated\./i,
  /\/generated\//i,
  /package-lock\.json$/i,
  /pnpm-lock\.yaml$/i,
];

const AST_MAX_CHUNK_CHARS = 12_000;
let AST_MANIFEST = new Map();

// ── Scan targets ─────────────────────────────────────────────────────────────
const SCAN_DIRS = TARGET
  ? [TARGET]
  : (ROOTS_ARG ? parseRoots(ROOTS_ARG) : DEFAULT_SCAN_ROOTS);

const INDEXABLE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs',
  '.svelte', '.go', '.rs', '.py',
  '.md', '.sql', '.json', '.toml', '.yaml', '.yml',
  '.cc', '.cpp', '.h', '.hpp', '.c',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────
function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function hashToUuid(hex) {
  const clean = String(hex ?? '').replace(/[^a-f0-9]/gi, '').padEnd(32, '0').slice(0, 32).split('');
  clean[12] = '4';
  clean[16] = ((parseInt(clean[16], 16) & 0x3) | 0x8).toString(16);
  return [
    clean.slice(0, 8).join(''),
    clean.slice(8, 12).join(''),
    clean.slice(12, 16).join(''),
    clean.slice(16, 20).join(''),
    clean.slice(20, 32).join(''),
  ].join('-');
}

function detectLanguage(ext) {
  const m = {
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.svelte': 'svelte', '.go': 'go', '.rs': 'rust',
    '.py': 'python', '.md': 'markdown', '.sql': 'sql',
    '.json': 'json', '.toml': 'toml', '.yaml': 'yaml', '.yml': 'yaml',
    '.cc': 'cpp', '.cpp': 'cpp', '.h': 'cpp', '.hpp': 'cpp', '.c': 'c',
  };
  return m[ext] ?? 'text';
}

/** Split text into overlapping windows */
function chunkText(text, size, overlap) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push({ text: text.slice(start, end), start, end });
    if (end === text.length) break;
    start += size - overlap;
  }
  return chunks;
}

function isGeneratedFile(relPath) {
  return GENERATED_PATTERNS.some((pattern) => pattern.test(relPath));
}

function normalizeRepoPath(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/^\//, '');
}

function astManifestKeys(relPath) {
  const normalized = normalizeRepoPath(relPath);
  const keys = [normalized];
  if (normalized.startsWith('sveltekit-frontend/')) {
    keys.push(normalized.slice('sveltekit-frontend/'.length));
  }
  if (normalized.startsWith('sveltekit-frontend/src/lib/')) {
    keys.push(`$lib/${normalized.slice('sveltekit-frontend/src/lib/'.length)}`);
  }
  if (normalized.startsWith('sveltekit-frontend/src/routes/')) {
    keys.push(`$routes/${normalized.slice('sveltekit-frontend/src/routes/'.length)}`);
  }
  if (normalized.startsWith('src/')) {
    keys.push(`sveltekit-frontend/${normalized}`);
    keys.push(`$lib/${normalized.slice('src/'.length)}`);
  }
  return [...new Set(keys)];
}

function astRowsForPath(relPath) {
  for (const key of astManifestKeys(relPath)) {
    const rows = AST_MANIFEST.get(key);
    if (rows?.length) return rows;
  }
  return [];
}

function firstValue(row, names) {
  for (const name of names) {
    if (row?.[name] !== undefined && row?.[name] !== null && row[name] !== '') return row[name];
  }
  return null;
}

function byteOffset(row, side) {
  const direct = firstValue(row, side === 'start'
    ? ['start_byte', 'startByte', 'byte_start', 'byteStart']
    : ['end_byte', 'endByte', 'byte_end', 'byteEnd']);
  if (direct !== null) return Number(direct);
  const nested = row?.range?.[side] ?? row?.span?.[side] ?? row?.byte_range?.[side];
  if (typeof nested === 'number') return nested;
  if (nested && typeof nested === 'object') {
    return Number(firstValue(nested, ['byte', 'offset', 'index']));
  }
  return Number.NaN;
}

/**
 * Load an optional AST observation JSONL artifact. The artifact is an input
 * projection only; it does not become structural authority and rows without
 * exact byte spans are ignored so text fallback remains available.
 */
function loadAstManifest(filePath) {
  if (!filePath) return new Map();
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
  const bySource = new Map();
  const lines = fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const sourceRef = normalizeRepoPath(firstValue(row, ['source_ref', 'sourceRef', 'relative_path', 'relativePath', 'file_path', 'filePath', 'file', 'path']));
    const startByte = byteOffset(row, 'start');
    const endByte = byteOffset(row, 'end');
    if (!sourceRef || !Number.isInteger(startByte) || !Number.isInteger(endByte) || endByte <= startByte) continue;
    const item = {
      source_ref: sourceRef,
      start_byte: startByte,
      end_byte: endByte,
      node_kind: firstValue(row, ['node_kind', 'nodeKind', 'documentKind', 'kind']) ?? 'AST_DECLARATION',
      symbol_name: firstValue(row, ['symbol_name', 'symbolName', 'qualified_symbol', 'qualifiedSymbol', 'name', 'symbol']),
      tree_node_id: firstValue(row, ['tree_node_id', 'treeNodeId']),
      symbol_version_id: firstValue(row, ['symbol_version_id', 'symbolVersionId']),
      source_revision: firstValue(row, ['source_revision', 'sourceRevision']),
      workspace_revision: firstValue(row, ['workspace_revision', 'workspaceRevision']),
      signature: firstValue(row, ['normalized_signature', 'normalizedSignature', 'signature']),
      direct_members: firstValue(row, ['direct_members', 'directMembers', 'members']),
      ast_content_hash: firstValue(row, ['content_hash', 'contentHash', 'source_content_hash', 'sourceContentHash']),
      ast_status: firstValue(row, ['ast_status', 'astStatus']) ?? 'PARSED',
    };
    const rows = bySource.get(sourceRef) ?? [];
    rows.push(item);
    bySource.set(sourceRef, rows);
  }

  for (const rows of bySource.values()) {
    rows.sort((a, b) => a.start_byte - b.start_byte || b.end_byte - a.end_byte);
  }
  return bySource;
}

function buildAstChunks(text, relPath, rows) {
  if (!rows?.length) return [];
  const chunks = [];
  for (const row of rows.slice(0, MAX_CHUNKS_PER_FILE)) {
    if (row.start_byte < 0 || row.end_byte > Buffer.byteLength(text, 'utf8')) continue;
    const prefix = Buffer.from(text, 'utf8').subarray(0, row.start_byte).toString('utf8');
    const body = Buffer.from(text, 'utf8').subarray(row.start_byte, row.end_byte).toString('utf8');
    if (!body.trim() || body.length > AST_MAX_CHUNK_CHARS) continue;
    chunks.push({
      text: body,
      start: prefix.length,
      end: prefix.length + body.length,
      chunk_kind: 'ast-declaration',
      chunk_source: 'AST_DECLARATION',
      ast_status: row.ast_status,
      node_kind: row.node_kind,
      symbol_name: row.symbol_name,
      tree_node_id: row.tree_node_id,
      symbol_version_id: row.symbol_version_id,
      source_revision: row.source_revision,
      workspace_revision: row.workspace_revision,
      signature: row.signature,
      direct_members: row.direct_members,
      ast_content_hash: row.ast_content_hash,
      source_ref: relPath,
    });
  }
  return chunks;
}

/**
 * Smart chunk large JSON files.
 * Tries to parse and extract top-level keys/arrays as semantic chunks.
 * Falls back to sliding window on parse failure.
 * Limits output to MAX_CHUNKS_PER_FILE entries.
 */
function chunkLargeJson(text, relPath, maxChunks = MAX_CHUNKS_PER_FILE) {
  try {
    const obj = JSON.parse(text);
    const chunks = [];

    if (Array.isArray(obj)) {
      // Array: group every ~20 items into a chunk
      const GROUP = 20;
      for (let i = 0; i < obj.length && chunks.length < maxChunks; i += GROUP) {
        const slice = obj.slice(i, i + GROUP);
        const chunkText = JSON.stringify(slice, null, 0).slice(0, CHUNK_SIZE * 2);
        chunks.push({
          text: `[${relPath}] items[${i}–${i + GROUP - 1}]:\n${chunkText}`,
          start: i * 10,
          end: (i + GROUP) * 10,
          key_path: `[${i}..${i + GROUP - 1}]`,
          chunk_kind: 'json-array',
        });
      }
    } else if (typeof obj === 'object' && obj !== null) {
      // Object: one chunk per top-level key
      for (const [key, val] of Object.entries(obj)) {
        if (chunks.length >= maxChunks) break;
        const valText = typeof val === 'string' ? val : JSON.stringify(val, null, 0);
        const snippet = valText.slice(0, CHUNK_SIZE);
        chunks.push({
          text: `[${relPath}] .${key}:\n${snippet}`,
          start: 0,
          end: snippet.length,
          key_path: `.${key}`,
          chunk_kind: 'json-key',
        });
      }
    }

    if (chunks.length > 0) return chunks;
  } catch { /* fall through to sliding window */ }

  // Fallback: sliding window capped at MAX_CHUNKS_PER_FILE
  return chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP).slice(0, maxChunks);
}

/**
 * Smart chunk for any large non-JSON file.
 * Splits on logical boundaries (function/class/## headers) where possible.
 * Falls back to uniform windows capped at MAX_CHUNKS_PER_FILE.
 */
function chunkLargeText(text, ext, maxChunks = MAX_CHUNKS_PER_FILE) {
  // Try to split on blank-line boundaries (paragraphs / code blocks)
  const paragraphs = text.split(/\n{2,}/);
  if (paragraphs.length >= 4) {
    const chunks = [];
    let buf = '';
    const flushBuf = () => {
      if (buf.trim().length > 40) chunks.push({ text: buf.trim(), start: 0, end: buf.length, chunk_kind: 'large-text' });
      buf = '';
    };
    for (const para of paragraphs) {
      if (chunks.length >= maxChunks) break;
      // A single paragraph larger than CHUNK_SIZE (e.g. a big table or
      // unbroken text block, no blank-line breaks inside it) was previously
      // pushed whole via `buf = para` -- confirmed live 2026-08-26 this
      // produced chunks Ollama rejected with "input length exceeds the
      // context length" (AGENTS.md: 10/40 chunk embeds failed this way).
      // Split any oversized paragraph itself via the sliding-window chunker
      // instead of ever letting one through unsplit.
      if (para.length > CHUNK_SIZE) {
        flushBuf();
        for (const sub of chunkText(para, CHUNK_SIZE, CHUNK_OVERLAP)) {
          if (chunks.length >= maxChunks) break;
          if (sub.text.trim().length > 40) chunks.push({ ...sub, chunk_kind: 'large-text' });
        }
        continue;
      }
      if (buf.length + para.length + 2 > CHUNK_SIZE) {
        flushBuf();
        buf = para;
      } else {
        buf += (buf ? '\n\n' : '') + para;
      }
    }
    if (chunks.length < maxChunks) flushBuf();
    if (chunks.length >= 4) return chunks;
  }
  return chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP).slice(0, maxChunks).map((chunk) => ({
    ...chunk,
    chunk_kind: 'large-text',
  }));
}

function estimateEmbeddingTokens(text) {
  // Conservative approximation for queue admission; llama.cpp remains the
  // authority on the actual tokenizer and server-side microbatch capacity.
  return Math.max(1, Math.ceil(Buffer.byteLength(text, 'utf8') / 4));
}

function nextEmbeddingBatch(chunks, offset) {
  const batch = [];
  let tokenCount = 0;
  let byteCount = 0;
  for (let index = offset; index < chunks.length && batch.length < EMBED_BATCH; index += 1) {
    const chunk = chunks[index];
    const nextTokens = estimateEmbeddingTokens(chunk.content);
    const nextBytes = Buffer.byteLength(chunk.content, 'utf8');
    if (batch.length > 0 && (tokenCount + nextTokens > EMBED_MAX_TOKENS || byteCount + nextBytes > EMBED_MAX_BYTES)) break;
    batch.push(chunk);
    tokenCount += nextTokens;
    byteCount += nextBytes;
  }
  return { batch, tokenCount, byteCount };
}

/** Walk a directory, returning relative paths */
function walk(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (shouldSkipDirectory(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (INDEXABLE_EXTS.has(ext)) {
        results.push(abs);
      }
    }
  }
  return results;
}

// ── Embedding ─────────────────────────────────────────────────────────────────
let ggufFallbackLogged = false;

function embeddingsFromResponse(data) {
  if (Array.isArray(data?.embeddings)) return data.embeddings;
  if (Array.isArray(data?.data)) return data.data.map((item) => item?.embedding ?? null);
  if (Array.isArray(data?.embedding)) return [data.embedding];
  return [];
}

async function requestEmbeddingBatch(url, body, label) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`${label} embed ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const embeddings = embeddingsFromResponse(await response.json());
  const expected = body.input?.length ?? 1;
  if (embeddings.length !== expected) {
    throw new Error(`${label} embedding count mismatch: got ${embeddings.length}, expected ${expected}`);
  }
  return embeddings;
}

async function embedBatch(texts) {
  if (EMBEDDING_BACKEND === 'llama_cpp_gguf') {
    try {
      return await requestEmbeddingBatch(
        `${EMBED_SERVER_URL}/v1/embeddings`,
        { model: EMBED_MODEL, input: texts },
        'llama_cpp_gguf',
      );
    } catch (error) {
      if (!ggufFallbackLogged) {
        console.warn(`[embedding] GGUF/CUDA backend unavailable; falling back to Ollama: ${error.message}`);
        ggufFallbackLogged = true;
      }
    }
  }

  return requestEmbeddingBatch(
    `${OLLAMA_URL}/api/embed`,
    { model: EMBED_MODEL, input: texts },
    'Ollama',
  );
}

// ── Qdrant upsert ─────────────────────────────────────────────────────────────
async function upsertQdrant(pointId, vector, payload) {
  const r = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=false`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: [{ id: pointId, vector: { content: vector }, payload }] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Qdrant upsert ${r.status}: ${body.slice(0, 200)}`);
  }
}

// ── Postgres upsert ───────────────────────────────────────────────────────────
async function upsertPostgres(pool, chunk, embedding) {
  const vecStr = `[${embedding.join(',')}]`;
  await pool.query(
    `INSERT INTO codebase_chunk_index
       (qdrant_id, chunk_id, relative_path, content, content_embedding_768,
        domain, tags, metadata,
        language, extension, embedding_model, embedding_dimension, content_hash,
        line_start, line_end, indexed_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::halfvec(768),
             $6, $7::jsonb, $8::jsonb,
             $9, $10, $11, $12, $13,
             $14, $15, NOW(), NOW())
     ON CONFLICT (qdrant_id) DO UPDATE SET
       content           = EXCLUDED.content,
       content_embedding_768 = EXCLUDED.content_embedding_768,
       content_hash      = EXCLUDED.content_hash,
       domain            = EXCLUDED.domain,
       tags              = EXCLUDED.tags,
       metadata          = EXCLUDED.metadata,
       updated_at        = NOW()`,
    [
      chunk.qdrant_id,
      chunk.chunk_id,
      chunk.relative_path,
      chunk.content,
      vecStr,
      chunk.domain_class ?? null,
      JSON.stringify(chunk.qdrant_tags ?? []),
      JSON.stringify(chunk.metadata ?? {}),
      chunk.language,
      chunk.extension,
      EMBED_MODEL,
      768,
      chunk.content_hash,
      chunk.line_start ?? null,
      chunk.line_end ?? null,
    ]
  );
}

// ── Skip check — already indexed with same hash ───────────────────────────────
async function alreadyIndexed(pool, qdrantIds) {
  if (qdrantIds.length === 0) return new Set();
  const res = await pool.query(
    `SELECT qdrant_id FROM codebase_chunk_index WHERE qdrant_id = ANY($1)`,
    [qdrantIds]
  );
  return new Set(res.rows.map(r => r.qdrant_id));
}

// ── Process one file ──────────────────────────────────────────────────────────
async function processFile(absPath, pool, stats) {
  const relPath = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  const ext     = path.extname(absPath).toLowerCase();
  const lang    = detectLanguage(ext);

  let fileSize = 0;
  try {
    fileSize = fs.statSync(absPath).size;
  } catch { return; }

  let text;
  try {
    text = fs.readFileSync(absPath, 'utf8');
  } catch {
    return; // binary or unreadable
  }

  // Skip tiny files (less than 40 chars)
  if (text.trim().length < 40) return;

  const fileHash = sha256(text);
  const isLarge  = fileSize > LARGE_FILE_BYTES;
  const maxChunks = isGeneratedFile(relPath) ? 10 : MAX_CHUNKS_PER_FILE;

  // Prefer exact AST declaration spans when a reviewed artifact supplied them.
  // Files without valid observations retain the existing text fallback.
  const astChunks = buildAstChunks(text, relPath, astRowsForPath(relPath));
  let rawChunks = astChunks;
  if (rawChunks.length === 0 && isLarge) {
    if (ext === '.json') {
      rawChunks = chunkLargeJson(text, relPath, maxChunks);
      if (VERBOSE) console.log(`  [large-json] ${relPath} (${(fileSize/1024).toFixed(0)}KB) → ${rawChunks.length} semantic chunks`);
    } else {
      rawChunks = chunkLargeText(text, ext, maxChunks);
      if (VERBOSE) console.log(`  [large-text] ${relPath} (${(fileSize/1024).toFixed(0)}KB) → ${rawChunks.length} para chunks`);
    }
  } else if (rawChunks.length === 0) {
    rawChunks = chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP).slice(0, maxChunks);
  }

  // Build chunk metadata
  const chunks = rawChunks.map((c, idx) => {
    const contentHash = sha256(`${relPath}:${idx}:${c.text}`);
    const qdrantId    = hashToUuid(sha256(`fullrepo:${relPath}:${idx}`));
    const titleId = path.basename(relPath).replace(/\.[^.]+$/, '') || 'file';
    const featureId = deriveFeatureId({
      source_ref: relPath,
      file_path: relPath,
      relative_path: relPath,
      feature_label: titleId,
      title_id: titleId,
    }) || `fullrepo.${lang}`;
    const domainClass = deriveDomainClass({
      source_ref: relPath,
      file_path: relPath,
      feature_id: featureId,
      feature_label: titleId,
      title_id: titleId,
      summary_text: c.text,
    });
    const topology = buildTopologyEnvelope({
      domain_class: domainClass,
      feature_id: featureId,
      title_id: titleId,
      som_cluster: null,
      community_id: null,
    });
    // Approximate line numbers from char offsets
      const lineStart = text.slice(0, c.start).split('\n').length;
      const lineEnd   = text.slice(0, c.end).split('\n').length;
    return {
      qdrant_id:     qdrantId,
      chunk_id:      `fullrepo:${relPath}:${idx}`,
      relative_path: relPath,
      content:       c.text,
      content_hash:  contentHash,
      feature_id:    featureId,
      domain_class:  domainClass,
      language:      lang,
      extension:     ext,
      line_start:    lineStart,
      line_end:      lineEnd,
      file_hash:     fileHash,
      key_path:      c.key_path ?? null,
      chunk_kind:    c.chunk_kind ?? (isLarge ? 'large-text' : 'text'),
      chunk_source:   c.chunk_source ?? 'TEXT_FALLBACK',
      ast_status:     c.ast_status ?? (astChunks.length > 0 ? 'PARSED' : 'UNAVAILABLE'),
      node_kind:      c.node_kind ?? null,
      symbol_name:    c.symbol_name ?? null,
      tree_node_id:   c.tree_node_id ?? null,
      symbol_version_id: c.symbol_version_id ?? null,
      source_revision: c.source_revision ?? null,
      workspace_revision: c.workspace_revision ?? null,
      signature: c.signature ?? null,
      direct_members: c.direct_members ?? null,
      ast_content_hash: c.ast_content_hash ?? null,
      topology,
      qdrant_tags: [
        domainClass,
        featureId,
        lang,
        ext.replace(/^\./, ''),
        c.chunk_kind ?? (isLarge ? 'large-text' : 'text'),
        'repo-chunk',
        'qdrant',
        'vector',
        'search',
        'fullrepo',
      ].filter(Boolean),
      metadata: {
        domain_class: domainClass,
        feature_id: featureId,
        packet_key: qdrantId,
        key_path: c.key_path ?? null,
        chunk_kind: c.chunk_kind ?? (isLarge ? 'large-text' : 'text'),
        chunk_source: c.chunk_source ?? 'TEXT_FALLBACK',
        ast_status: c.ast_status ?? (astChunks.length > 0 ? 'PARSED' : 'UNAVAILABLE'),
        node_kind: c.node_kind ?? null,
        symbol_name: c.symbol_name ?? null,
        tree_node_id: c.tree_node_id ?? null,
        symbol_version_id: c.symbol_version_id ?? null,
        source_revision: c.source_revision ?? null,
        workspace_revision: c.workspace_revision ?? null,
        signature: c.signature ?? null,
        direct_members: c.direct_members ?? null,
        ast_content_hash: c.ast_content_hash ?? null,
        topology,
        qdrant_tags: [
          domainClass,
          featureId,
          lang,
          ext.replace(/^\./, ''),
          c.chunk_kind ?? (isLarge ? 'large-text' : 'text'),
          'repo-chunk',
          'qdrant',
          'vector',
          'search',
          'fullrepo',
        ].filter(Boolean),
        source_ref: relPath,
      },
    };
  });

  // Check which qdrant_ids already exist
  const existingIds = await alreadyIndexed(pool, chunks.map(c => c.qdrant_id));
  const toIndex = chunks.filter(c => !existingIds.has(c.qdrant_id));

  if (VERBOSE && astChunks.length > 0) {
    console.log(`  [ast] ${relPath} -> ${astChunks.length} declaration chunks (alias-resolved manifest)`);
  }

  if (toIndex.length === 0) {
    stats.skipped++;
    return;
  }

  if (DRY_RUN) {
    if (VERBOSE) console.log(`  [dry-run] ${relPath} → ${toIndex.length} chunks`);
    stats.files++;
    stats.chunks += toIndex.length;
    // Accumulate domain/feature counts for dry-run ontology report (no embeddings)
    for (const chunk of toIndex) {
      stats.domainCounts[chunk.domain_class] = (stats.domainCounts[chunk.domain_class] ?? 0) + 1;
      stats.centroidAcc[chunk.domain_class] = stats.centroidAcc[chunk.domain_class] ?? [];
      if (!stats.featureCentroidAcc[chunk.feature_id]) stats.featureCentroidAcc[chunk.feature_id] = [];
      stats.featureCentroidAcc[chunk.feature_id].push(1); // placeholder — dry-run has no vectors
    }
    return;
  }

  // Embed in micro-batches
  let succeededChunks = 0;
  for (let i = 0; i < toIndex.length;) {
    const admission = nextEmbeddingBatch(toIndex, i);
    const batch = admission.batch;
    if (batch.length === 0) break;
    i += batch.length;
    if (VERBOSE) {
      console.log(`  [embed-batch] docs=${batch.length} estimated_tokens=${admission.tokenCount} bytes=${admission.byteCount}`);
    }
    let embeddings;
    try {
      embeddings = await embedBatch(batch.map((chunk) => chunk.content));
    } catch (err) {
      if (VERBOSE) console.error(`  ERROR embedding batch ${relPath}: ${err.message}`);
      stats.errors += batch.length;
      continue;
    }

    await Promise.all(batch.map(async (chunk, batchIndex) => {
      try {
        const embedding = embeddings[batchIndex];
        if (!embedding || embedding.length !== 768) {
          stats.errors++;
          return;
        }
        const centroidKeys = deriveCentroidKeys({
          domain_class: chunk.domain_class,
          feature_id:   chunk.feature_id,
          source_ref:   chunk.relative_path,
        });
        const payload = {
          path:         chunk.relative_path,
          file_path:    chunk.relative_path,
          source_ref:   chunk.relative_path,
          packet_key:   chunk.qdrant_id,
          feature_id:   chunk.feature_id,
          domain_class: chunk.domain_class,
          topology:     chunk.topology,
          language:     chunk.language,
          kind:         chunk.chunk_kind,
          chunk_id:     chunk.chunk_id,
          key_path:     chunk.key_path,
          content:      chunk.content.slice(0, 500),
          qdrant_tags:  chunk.qdrant_tags,
          representation_id: 'semantic_768',
          representation_name: 'semantic_768',
          representation_revision: 'semantic_768@v1',
          embedding_dimension: 768,
          model_revision: EMBED_MODEL,
          content_hash: chunk.content_hash,
          chunk_source: chunk.chunk_source,
          ast_status: chunk.ast_status,
          node_kind: chunk.node_kind,
          symbol_name: chunk.symbol_name,
          tree_node_id: chunk.tree_node_id,
          symbol_version_id: chunk.symbol_version_id,
          signature: chunk.signature,
          direct_members: chunk.direct_members,
          ast_content_hash: chunk.ast_content_hash,
          ...(chunk.source_revision ? { source_revision: chunk.source_revision } : {}),
          ...(chunk.workspace_revision ? { workspace_revision: chunk.workspace_revision } : {}),
          repo:         'deeds-web-app',
          // centroid routing hints — used by HyperRAG/RRF to find related clusters
          routing_hints: {
            domain_centroid_key:  centroidKeys.domain_centroid_key,
            feature_centroid_key: centroidKeys.feature_centroid_key,
          },
        };
        await upsertQdrant(chunk.qdrant_id, embedding, payload);
        await upsertPostgres(pool, chunk, embedding);
        stats.chunks++;
        succeededChunks++;
        // Accumulate for Redis centroid warming (post-run)
        stats.centroidAcc[chunk.domain_class] = stats.centroidAcc[chunk.domain_class] ?? [];
        stats.centroidAcc[chunk.domain_class].push(embedding);
        stats.featureCentroidAcc[chunk.feature_id] = stats.featureCentroidAcc[chunk.feature_id] ?? [];
        stats.featureCentroidAcc[chunk.feature_id].push(embedding);
        stats.domainCounts[chunk.domain_class] = (stats.domainCounts[chunk.domain_class] ?? 0) + 1;
      } catch (err) {
        if (VERBOSE) console.error(`  ERROR ${chunk.relative_path}:${chunk.chunk_id}: ${err.message}`);
        stats.errors++;
      }
    }));
  }
  stats.files++;
  // Report actual successes, not attempted count -- confirmed live 2026-08-26
  // this previously logged toIndex.length unconditionally even when some
  // chunks failed (e.g. AGENTS.md: 40 attempted, 10 "input length exceeds
  // context length" errors, only 30 rows actually written -- but the old
  // line claimed "(40 new chunks)" regardless).
  if (succeededChunks === toIndex.length) {
    if (VERBOSE) console.log(`  ✓ ${relPath} (${succeededChunks} new chunks)`);
  } else if (succeededChunks > 0) {
    console.log(`  ⚠ ${relPath} (${succeededChunks}/${toIndex.length} chunks -- ${toIndex.length - succeededChunks} failed, see ERROR lines above)`);
  } else {
    stats.filesFullyFailed = (stats.filesFullyFailed ?? 0) + 1;
    console.log(`  ✗ ${relPath} (0/${toIndex.length} chunks succeeded)`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (AST_MANIFEST_PATH) {
    try {
      AST_MANIFEST = loadAstManifest(AST_MANIFEST_PATH);
      console.log(`AST manifest: ${AST_MANIFEST_PATH} (${AST_MANIFEST.size} source files with valid spans)`);
    } catch (err) {
      console.error(`[FAIL] Unable to load AST manifest: ${err.message}`);
      process.exitCode = 1;
      return;
    }
  } else {
    console.log('AST manifest: not supplied; TEXT_FALLBACK remains active');
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Full-Repo Indexer (chunks → Postgres + Qdrant)             ║');
  console.log(`║  Mode: ${APPLY ? 'APPLY   ' : 'DRY-RUN '}  Target: ${(TARGET ?? 'all').padEnd(42)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Collect all files
  console.log('Scanning repo directories...');
  const allFiles = [];
  for (const scanDir of SCAN_DIRS) {
    const absDir = path.join(REPO_ROOT, scanDir);
    const files = walk(absDir);
    console.log(`  ${scanDir}/: ${files.length} indexable files`);
    allFiles.push(...files);
  }
  console.log(`\nTotal: ${allFiles.length} files\n`);

  const filesToProcess = LIMIT > 0 ? allFiles.slice(0, LIMIT) : allFiles;

  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would process ${filesToProcess.length} files`);
    console.log(`[DRY-RUN] Run with --apply to execute\n`);
  }

  // Connect to Postgres
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  const stats = {
    files: 0, chunks: 0, skipped: 0, errors: 0,
    // centroid accumulation: domain → float32 vectors[], feature_id → float32 vectors[]
    centroidAcc: {},
    featureCentroidAcc: {},
    domainCounts: {},
  };
  const startTime = Date.now();
  let processed = 0;

  for (const absPath of filesToProcess) {
    await processFile(absPath, pool, stats);
    processed++;

    if (processed % 100 === 0 || processed === filesToProcess.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const pct = ((processed / filesToProcess.length) * 100).toFixed(1);
      if (process.stdout.isTTY) {
        process.stdout.write(
          `\r  Progress: ${processed}/${filesToProcess.length} (${pct}%) | ` +
          `files=${stats.files} chunks=${stats.chunks} skip=${stats.skipped} err=${stats.errors} | ${elapsed}s`
        );
      }
    }
  }

  console.log('\n');
  await pool.end();

  // ── Ontology report ─────────────────────────────────────────────────────────
  const domainEntries = Object.entries(stats.domainCounts).sort((a, b) => b[1] - a[1]);
  const featureCount  = Object.keys(stats.featureCentroidAcc).length;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Files processed  : ${stats.files}`);
  console.log(`Chunks indexed   : ${stats.chunks}`);
  console.log(`Files skipped    : ${stats.skipped} (already indexed)`);
  console.log(`Errors           : ${stats.errors}`);
  if (stats.filesFullyFailed) {
    console.log(`Files 0% indexed : ${stats.filesFullyFailed} (all chunks failed -- see ✗ lines above)`);
  }
  console.log(`Elapsed          : ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  if (domainEntries.length > 0) {
    console.log('\n── Domain Ontology Distribution ──');
    for (const [domain, count] of domainEntries) {
      const bar = '█'.repeat(Math.min(Math.ceil(count / Math.max(stats.chunks, 1) * 40), 40));
      console.log(`  ${domain.padEnd(16)} ${String(count).padStart(5)}  ${bar}`);
    }
    console.log(`\n  Unique feature_ids : ${featureCount}`);
    console.log(`  Domain classes     : ${domainEntries.length}`);
  }

  // ── Redis centroid warming ───────────────────────────────────────────────────
  if (!DRY_RUN && WARM_CENTROIDS && stats.chunks > 0) {
    console.log('\n── Warming Redis centroids ──');
    let redis;
    try {
      const { default: Redis } = await import('ioredis');
      redis = new Redis({
        host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS,
        lazyConnect: true, connectTimeout: 3000,
        maxRetriesPerRequest: 1, enableOfflineQueue: false,
        retryStrategy: () => null,
      });
      redis.on('error', () => {});
      await redis.connect();
      await redis.ping();

      // Mean-pool vectors within each domain and write centroid
      let domainWritten = 0;
      for (const [domain, vecs] of Object.entries(stats.centroidAcc)) {
        if (!vecs.length) continue;
        const dim   = vecs[0].length;
        const mean  = new Array(dim).fill(0);
        for (const v of vecs) for (let d = 0; d < dim; d++) mean[d] += v[d];
        for (let d = 0; d < dim; d++) mean[d] /= vecs.length;
        const key = `atlas:centroid:domain:${domain}`;
        await redis.setex(key, CENTROID_TTL, JSON.stringify({ domain_class: domain, vec: mean, n: vecs.length, updatedAt: new Date().toISOString() }));
        domainWritten++;
      }

      // Mean-pool per feature_id centroid (cap to features with ≥3 chunks to avoid noise)
      let featureWritten = 0;
      for (const [featureId, vecs] of Object.entries(stats.featureCentroidAcc)) {
        if (vecs.length < 3) continue; // skip sparse features
        const dim  = vecs[0].length;
        const mean = new Array(dim).fill(0);
        for (const v of vecs) for (let d = 0; d < dim; d++) mean[d] += v[d];
        for (let d = 0; d < dim; d++) mean[d] /= vecs.length;
        const key = `atlas:centroid:feature:${featureId}`;
        await redis.setex(key, CENTROID_TTL, JSON.stringify({ feature_id: featureId, vec: mean, n: vecs.length, updatedAt: new Date().toISOString() }));
        featureWritten++;
      }

      await redis.quit();
      console.log(`  ✅ Domain centroids  : ${domainWritten} written  (atlas:centroid:domain:*)`);
      console.log(`  ✅ Feature centroids : ${featureWritten} written  (atlas:centroid:feature:*)`);
    } catch (redisErr) {
      console.warn(`  ⚠️  Redis centroid warming skipped: ${redisErr.message}`);
      console.warn('     (pass --no-redis to suppress, or check REDIS_HOST/REDIS_PORT/REDIS_PASSWORD)');
      if (redis) { try { await redis.quit(); } catch { /* ignore */ } }
    }
  } else if (DRY_RUN && stats.chunks > 0) {
    const domainCentroidsWould = Object.keys(stats.centroidAcc).length;
    const featureCentroidsWould = Object.keys(stats.featureCentroidAcc).filter(k => (stats.featureCentroidAcc[k]?.length ?? 0) >= 3).length;
    console.log(`\n[DRY-RUN] Would warm ${domainCentroidsWould} domain centroids and ${featureCentroidsWould} feature centroids in Redis`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] No data was written. Run with --apply to execute.');
  } else {
    console.log('\n✅ Full-repo indexing complete.');
    console.log('Next: npm run graphify:gds  (rebuild PageRank/Louvain with new nodes)');
  }
}

main().catch(err => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
