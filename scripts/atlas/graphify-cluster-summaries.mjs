#!/usr/bin/env node
/**
 * graphify-cluster-summaries.mjs
 *
 * For each directory that has representativeFiles in its Redis wiki note,
 * call Gemma4 to generate a semantic summary, embed it via embeddinggemma,
 * then upsert a glyph-like Qdrant point into codebase_chunks_768 so ACE
 * can search directory-level context semantically.
 */

import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { llamaChat } from './lib/llama-inference.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// Config-driven roots (fast = sveltekit-frontend only; cold = full repo)
const INDEX_ROOTS_FAST = ['sveltekit-frontend'];
const INDEX_ROOTS_COLD = [
  'sveltekit-frontend', 'scripts', 'crates', 'packages',
  'simd-bridge', 'docs', 'services', 'go', 'python',
];
const rootsArg = process.argv.find(a => a.startsWith('--roots='));
const ACTIVE_ROOTS = (rootsArg?.split('=')?.[1] === 'cold')
  ? INDEX_ROOTS_COLD : INDEX_ROOTS_FAST;

// Backward-compat: absolute path of the primary frontend root
const ROOT = path.resolve(REPO_ROOT, 'sveltekit-frontend');

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name, def) { const i = args.indexOf(name); return i === -1 ? def : args[i + 1]; }
function has(name) { return args.includes(name); }

const LIMIT      = parseInt(flag('--limit', '0'), 10);   // 0 = unlimited
const DIR_FILTER = flag('--dir', '');                      // single directory filter
const SKIP_LLM   = has('--skip-llm');                     // embed only, no Gemma4 call
const FORCE      = has('--force');                         // ignore cached summaries
const QUIET      = has('--quiet');

const MAX_FILES_PER_DIR = parseInt(flag('--max-files-per-dir', '40'), 10);
const MAX_BYTES_PER_DIR = parseInt(flag('--max-bytes-per-dir', '250000'), 10);
const SUMMARY_TIMEOUT   = parseInt(flag('--summary-timeout-ms', '60000'), 10);

function normalizeBaseUrl(value, fallback) {
  return String(value ?? fallback).replace(/^0\.0\.0\.0/, '127.0.0.1').replace(/\/+$/, '');
}

const QDRANT_URL = process.env.QDRANT_URL        ?? 'http://127.0.0.1:6333';
const REDIS_URL  = process.env.REDIS_URL         ?? 'redis://127.0.0.1:6379';
const REDIS_HOST = process.env.REDIS_HOST        ?? '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379', 10);
const REDIS_PASS = process.env.REDIS_PASSWORD    ?? process.env.REDIS_PASS ?? 'redis';
const COLLECTION = 'codebase_chunks_768';
const EMBED_MODEL= 'embeddinggemma:latest';
const OPENAI_BASE_URL = normalizeBaseUrl(
  process.env.LOCAL_OPENAI_BASE_URL ?? process.env.GEMMA4_BASE_URL ?? 'http://127.0.0.1:8090/v1',
  'http://127.0.0.1:8090/v1'
);
const OPENAI_EMBED_URL = `${OPENAI_BASE_URL.replace(/\/v1$/, '')}/v1/embeddings`;
const OLLAMA_EMBED_URL = normalizeBaseUrl(
  process.env.OLLAMA_EMBED_BASE_URL ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  'http://127.0.0.1:11434'
);

const WIKI_NOTE_TTL = 24 * 3600;
const log = QUIET ? () => {} : (...a) => console.log(...a);

const SKIP_DIR_PATTERNS = [
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)\.svelte-kit(\/|$)/,
  /(^|\/)\.claude(\/|$)/,
  /(^|\/)dist(\/|$)/,
  /(^|\/)build(\/|$)/,
  /(^|\/)coverage(\/|$)/,
  /(^|\/)\.cache(\/|$)/,
  /(^|\/)logs?(\/|$)/,
  /(^|\/)archives?(\/|$)/,
  /(^|\/)backups?(\/|$)/,
  /(^|\/)docs\/graph(\/|$)/,
  /(^|\/)docs\/reports(\/|$)/,
  /(^|\/)tmp(\/|$)/,
  // run artifacts / scratch — not source
  /(^|\/)memory\/runs\//,
  /(^|\/)scratch\/synthesis-runs\//,
  /(^|\/)scripts\/tests\/screenshots\//,
  /(^|\/)reports\/deep-audit(\/|$)/,
  // deeply nested generated copies
  /sveltekit-frontend\/sveltekit-frontend/,
  // third-party source trees (llama.cpp forks, venvs)
  /(^|\/)llama-cpp-turboquant/,
  /(^|\/)\.python[0-9]/,
  /(^|\/)\.venv/,
  /(^|\/)__pycache__(\/|$)/,
  /(^|\/)granite-docling/,
];

function shouldSkipDirectory(dir) {
  if (!dir) return false;
  const normalized = dir.replaceAll('\\', '/');
  return SKIP_DIR_PATTERNS.some((pattern) => pattern.test(normalized));
}

// ── Redis ─────────────────────────────────────────────────────────────────────

const { default: Redis } = await import('ioredis');
const redis = new Redis({
  host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS,
  lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 1,
  enableOfflineQueue: false, retryStrategy: () => null,
});
redis.on('error', () => {});
try {
  await redis.connect();
  await redis.ping();
  log('✅ Redis connected');
} catch {
  console.error('❌ Redis unavailable — aborting');
  process.exit(1);
}

async function rget(key) {
  try { const v = await redis.get(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
async function rset(key, val, ttl = WIKI_NOTE_TTL) {
  try { await redis.setex(key, ttl, JSON.stringify(val)); } catch { /* non-fatal */ }
}

// ── Load all wiki notes with representativeFiles ──────────────────────────────

log('🔍 Scanning Redis for wiki notes with representative files…');
const allKeys = await redis.keys('wiki:note:dir:*');
const rawCandidates = [];

for (const key of allKeys) {
  const note = await rget(key);
  if (!note || !note.representativeFiles?.length) continue;
  if (DIR_FILTER && note.directoryPath !== DIR_FILTER) continue;
  rawCandidates.push({ key, note });
}

log(`📂 ${rawCandidates.length} directories considered (${allKeys.length} total notes)`);

// ── Helpers: llama-server LLM + Ollama embed ─────────────────────────────────

async function callGemma4(prompt) {
  return llamaChat(prompt, { maxTokens: 200, temperature: 0.2, timeoutMs: SUMMARY_TIMEOUT });
}

async function embedWithUrl(url, text) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: text, prompt: text }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`embed ${res.status}`);
  const d = await res.json();
  const embedding = d.embedding ?? d.data?.[0]?.embedding;
  if (!embedding?.length) throw new Error('empty embedding');
  return embedding;
}

async function embed(text) {
  try {
    return await embedWithUrl(OPENAI_EMBED_URL, text);
  } catch (primaryErr) {
    if (OPENAI_EMBED_URL.includes(':8090') && String(primaryErr?.message ?? '').includes('embed')) {
      return embedWithUrl(`${OLLAMA_EMBED_URL}/api/embeddings`, text);
    }
    throw primaryErr;
  }
}

// ── Qdrant upsert ─────────────────────────────────────────────────────────────

// 3-vector upsert into codebase_chunks_768 named-vector slots:
//   content   = dir + summary (primary query surface)
//   error     = summary prose only (MapReduce inverse: chunk → cluster)
//   signature = representative file list (export/chunk inverse join: file → cluster)
async function upsertGlyph(id, contentVector, errorVector, signatureVector, payload) {
  const vector = { content: contentVector };
  if (errorVector?.length)     vector.error     = errorVector;
  if (signatureVector?.length) vector.signature = signatureVector;
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: [{ id, vector, payload }] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Qdrant upsert ${res.status}: ${txt}`);
  }
}

function dirToPointId(dir) {
  const h = createHash('sha1').update(`dir-glyph:${dir}`).digest('hex');
  return parseInt(h.slice(0, 7), 16);
}

function buildPrompt(note) {
  const files = (note.representativeFiles ?? []).join('\n  - ');
  return `You are analysing a software directory for a legal AI platform.
Directory: ${note.directoryPath}
Files:
  - ${files}

Write a 2-3 sentence technical summary of what this directory does. Focus on purpose and data flow.`;
}

// ── Main loop ─────────────────────────────────────────────────────────────────

const outcomes = {
  summarized: 0,
  skipped_generated_dir: 0,
  skipped_archive_or_log: 0,
  skipped_too_many_files: 0,
  skipped_too_many_bytes: 0,
  no_qdrant_points: 0,
  no_source_files: 0,
  timeout: 0,
  cache_unchanged: 0,
  summary_failed: 0,
};

const startTime = Date.now();
const targets = LIMIT > 0 ? rawCandidates.slice(0, LIMIT) : rawCandidates;

for (let i = 0; i < targets.length; i++) {
  const { key, note } = targets[i];
  const dir = note.directoryPath ?? key.replace('wiki:note:dir:', '').replace(/_/g, '/');
  const shortDir = dir.replace('src/', '');

  // 1. Classification & Filtering
  if (shouldSkipDirectory(dir)) {
    if (dir.match(/logs?|archives?|backups?|temp|tmp/i)) {
      outcomes.skipped_archive_or_log++;
    } else {
      outcomes.skipped_generated_dir++;
    }
    continue;
  }

  if (!FORCE && note.gemma4Summary) {
    outcomes.cache_unchanged++;
    continue;
  }

  const metrics = note.auditMetrics ?? {};
  if ((metrics.fileCount ?? 0) > MAX_FILES_PER_DIR) {
    outcomes.skipped_too_many_files++;
    continue;
  }
  if ((metrics.totalBytes ?? 0) > MAX_BYTES_PER_DIR) {
    outcomes.skipped_too_many_bytes++;
    continue;
  }
  if (!note.representativeFiles?.length) {
    outcomes.no_source_files++;
    continue;
  }

  log(`[${i + 1}/${targets.length}] ${shortDir}`);

  try {
    let summary = note.gemma4Summary;
    if (!summary || FORCE) {
      if (SKIP_LLM) {
        summary = note.summary ?? `Directory: ${dir}`;
      } else {
        const prompt = buildPrompt(note);
        summary = await callGemma4(prompt);
        log(`   💬 ${summary.slice(0, 80)}…`);
      }
    }

    // content: title + summary join — primary cosine query surface
    const contentVector = await embed(`${dir}: ${summary}`);

    // error slot (repurposed): prose summary body only — inverse search / MapReduce
    // stitching: query a summary chunk → find its directory cluster via cosine similarity
    let errorVector = null;
    if (!SKIP_LLM && summary && summary !== `Directory: ${dir}`) {
      try { errorVector = await embed(summary); } catch { /* non-fatal */ }
    }

    // signature slot: representative file list concatenated — exports/chunk inverse joins
    // allows "which directory does this file belong to?" cosine lookup
    const fileSignature = (note.representativeFiles ?? []).slice(0, 20).join(' | ');
    let signatureVector = null;
    if (fileSignature.trim()) {
      try { signatureVector = await embed(fileSignature); } catch { /* non-fatal */ }
    }

    const pointId = dirToPointId(dir);
    const source_ref = dir.replace(/\\/g, '/');
    await upsertGlyph(pointId, contentVector, errorVector, signatureVector, {
      kind: 'directory-cluster',
      dir,
      source_ref,
      feature_id: `dir:${source_ref}`,
      directory_path: source_ref,
      language: 'mixed',
      file_count: note.auditMetrics?.fileCount ?? 0,
      representative_files: (note.representativeFiles ?? []).slice(0, 10),
      summary,
      generatedAt: new Date().toISOString(),
    });

    await rset(key, { ...note, gemma4Summary: summary, embeddingId: pointId });
    outcomes.summarized++;
    
    // Progress diagnostics
    if ((i + 1) % 5 === 0 || (i + 1) === targets.length) {
      const elapsed = Date.now() - startTime;
      const rate = outcomes.summarized / (elapsed / 1000);
      const remaining = targets.length - (i + 1);
      const eta = rate > 0 ? Math.round(remaining / rate) : 0;
      log(`   📈 Progress: ${i + 1}/${targets.length} | Rate: ${rate.toFixed(2)} dir/s | ETA: ${eta}s`);
    }
  } catch (err) {
    if (err.name === 'TimeoutError' || err.message.includes('timeout')) {
      const metrics = note.auditMetrics ?? {};
      console.warn(`   ❌ ${shortDir}: Timeout (${SUMMARY_TIMEOUT}ms).`);
      console.warn(`      Diagnostics: { fileCount: ${metrics.fileCount}, totalBytes: ${metrics.totalBytes}, recommendation: "skip or cap" }`);
      outcomes.timeout++;
    } else {
      console.warn(`   ❌ ${shortDir}: ${err.message}`);
      outcomes.summary_failed++;
    }
  }
}

log('\n── Outcome Report ──');
console.table(outcomes);
log(`\nTotal time: ${Math.round((Date.now() - startTime) / 1000)}s`);

await redis.quit();
