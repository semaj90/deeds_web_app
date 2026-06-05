#!/usr/bin/env node
/**
 * scripts/atlas/gemma4-parent-atlas-summaries.mjs
 *
 * Batch-summarizes source files with null/empty summary using local Gemma4
 * via the TurboQuant llama-server (OpenAI-compat /v1/chat/completions) or Ollama.
 *
 * Skips:
 *   - vendor rows (tagged 'vendor' or excluded path prefixes)
 *   - feature:* references
 *   - already-summarized rows (summary IS NOT NULL AND summary != '')
 *   - binary/generated files (.min.js, .png, .gguf, etc.)
 *
 * Context fed per file:
 *   - source_ref, feature_id, semantic tags
 *   - imports/exports/route_handlers
 *   - First 80 lines of the actual file (if readable)
 *
 * Usage:
 *   node scripts/atlas/gemma4-parent-atlas-summaries.mjs --dry-run --limit=25
 *   node scripts/atlas/gemma4-parent-atlas-summaries.mjs --apply --limit=25
 *   node scripts/atlas/gemma4-parent-atlas-summaries.mjs --apply --limit=200 --concurrency=3
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Redis from 'ioredis';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const USE_CACHE = process.argv.includes('--cache');
function readNumericArg(name, defaultValue) {
  const direct = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (direct) {
    const value = parseInt(direct.split('=', 2)[1] ?? '', 10);
    return Number.isFinite(value) ? value : defaultValue;
  }
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0) {
    const value = parseInt(process.argv[idx + 1] ?? '', 10);
    return Number.isFinite(value) ? value : defaultValue;
  }
  return defaultValue;
}
function readStringArg(name, defaultValue = '') {
  const direct = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (direct) return direct.split('=', 2)[1] ?? defaultValue;
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0) return process.argv[idx + 1] ?? defaultValue;
  return defaultValue;
}
const LIMIT = readNumericArg('limit', 25);
const CONCURRENCY = readNumericArg('concurrency', 2);
const SOURCE_REF_FILTER = String(readStringArg('source-ref', '')).trim();
const REPORT_PATH = path.join(
  ROOT,
  '.tmp',
  USE_CACHE ? 'gemma4-parent-atlas-summary-cache-report.json' : 'gemma4-parent-atlas-summary-report.json'
);

if (USE_CACHE) {
  process.env.LOCAL_OPENAI_BASE_URL ??= 'http://127.0.0.1:8090/v1';
  process.env.LOCAL_OPENAI_API_KEY ??= 'local';
  process.env.LOCAL_GEMMA_MODEL ??= 'gemma4-rotorquant:latest';
  process.env.OLLAMA_EMBED_BASE_URL ??= 'http://127.0.0.1:8081';
}

const SKIP_EXTENSIONS = new Set([
  '.min.js', '.min.css', '.gguf', '.bin', '.png', '.jpg', '.jpeg', '.webp',
  '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3',
  '.parquet', '.duckdb', '.zip', '.tar', '.gz',
]);

const VENDOR_PREFIXES = [
  'turbovec/', 'docker/langgraph-synthesis/.venv/', '.venv/',
  'node_modules/', '.svelte-kit/', '.vite/', 'dist/', 'build/', 'models/',
];
function isVendor(ref) {
  return VENDOR_PREFIXES.some(p => ref.startsWith(p)) ||
    ref.includes('/.venv/') || ref.includes('/node_modules/') ||
    ref.includes('/dist-info/') || ref.includes('/site-packages/');
}

function loadEnv() {
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env.local'),
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
loadEnv();

const DATABASE_URL = process.env.DATABASE_URL
  ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_CONFIG = resolveRedisConfig();
const REDIS_URL = `redis://${REDIS_CONFIG.host}:${REDIS_CONFIG.port}`;
const REDIS_PASSWORD = REDIS_CONFIG.password;
const EMBED_BASE_URL = String(process.env.OLLAMA_EMBED_BASE_URL ?? 'http://127.0.0.1:8081').replace(/\/+$/, '');
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';

// ── LLM endpoint config ──────────────────────────────────────────────────────
// Prefer TurboQuant llama-server (OpenAI compat) → fallback Ollama
const TURBO_PORT = process.env.TURBO_PORT ?? '8090';
const TURBO_URL = `http://127.0.0.1:${TURBO_PORT}/v1/chat/completions`;
const OLLAMA_URL = `http://127.0.0.1:11434/api/chat`;
const OLLAMA_MODEL = process.env.EMBED_MODEL_CHAT ?? 'gemma4:latest';

let llmMode = 'unknown';
let phase101CacheModulePromise = null;
let summaryCacheRedis = null;

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean))];
}

function summaryTextOrFallback(input) {
  return String(input ?? '').trim();
}

function isNonEmptyText(input) {
  return String(input ?? '').trim().length > 0;
}

function buildSourceRefSummary(row, snippet) {
  const tags = Array.isArray(row?.tags) ? row.tags.filter(Boolean).slice(0, 10).join(', ') : 'none';
  const imports = Array.isArray(row?.imports) ? row.imports.filter(Boolean).slice(0, 8).join(', ') : 'none';
  const exports = Array.isArray(row?.exports) ? row.exports.filter(Boolean).slice(0, 8).join(', ') : 'none';
  const handlers = Array.isArray(row?.route_handlers) ? row.route_handlers.filter(Boolean).slice(0, 8).join(', ') : 'none';
  const snippetText = String(snippet ?? '').trim().split('\n').slice(0, 4).join(' ').trim();
  return [
    `source_ref: ${row?.source_ref ?? 'unknown'}`,
    `feature_id: ${row?.feature_id ?? 'unknown'}`,
    `tags: ${tags}`,
    `imports: ${imports}`,
    `exports: ${exports}`,
    `route_handlers: ${handlers}`,
    snippetText ? `snippet: ${snippetText}` : null,
  ].filter(Boolean).join(' | ').slice(0, 1000);
}

function buildPacketSummary(packet, rawText, synthesis, row, snippet) {
  const candidates = [
    packet?.summary,
    packet?.lod1Summary,
    packet?.lod2Summary,
    ...(Array.isArray(packet?.recommendations) ? packet.recommendations : []),
    ...(Array.isArray(synthesis?.mainThemes) ? synthesis.mainThemes : []),
    ...(Array.isArray(synthesis?.nextSteps) ? synthesis.nextSteps : []),
    rawText,
    buildSourceRefSummary(row, snippet),
  ];
  for (const candidate of candidates) {
    const text = String(candidate ?? '').trim();
    if (text) return text.slice(0, 1000);
  }
  return '';
}

function normalizeRedisUrl(rawValue, fallbackHost = '127.0.0.1', fallbackPort = '6379') {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return `redis://${fallbackHost}:${fallbackPort}`;
  if (/^rediss?:\/\//i.test(raw)) return raw;
  if (/^[^:/?#]+:\d+(?:\/\d+)?$/.test(raw)) {
    const [hostPort, dbPart] = raw.split('/', 2);
    const [host, port] = hostPort.split(':', 2);
    return `redis://${host || fallbackHost}:${port || fallbackPort}${dbPart ? `/${dbPart}` : ''}`;
  }
  if (/^[^:/?#]+$/.test(raw)) {
    return `redis://${raw}:${fallbackPort}`;
  }
  return `redis://${fallbackHost}:${fallbackPort}`;
}

function normalizeRedisHost(rawValue, fallbackHost = '127.0.0.1') {
  const raw = String(rawValue ?? '').trim();
  if (!raw || raw === '0.0.0.0') return fallbackHost;
  return raw;
}

function resolveRedisConfig() {
  const rawUrl = String(process.env.REDIS_URL ?? '').trim();
  let urlHost = '';
  let urlPort = '';
  let urlPassword = '';
  if (rawUrl) {
    try {
      const parsed = new URL(normalizeRedisUrl(rawUrl));
      urlHost = parsed.hostname;
      urlPort = parsed.port;
      urlPassword = parsed.password ? decodeURIComponent(parsed.password) : '';
    } catch {
      // fall through to host/port envs
    }
  }

  const host = normalizeRedisHost(process.env.REDIS_HOST ?? urlHost ?? '127.0.0.1');
  const port = Number(process.env.REDIS_PORT ?? urlPort ?? 6379) || 6379;
  const password = (process.env.REDIS_PASSWORD?.trim() || urlPassword || undefined);
  return { host, port, password };
}

async function loadPhase101CacheModule() {
  if (!phase101CacheModulePromise) {
    phase101CacheModulePromise = (async () => {
      const tsx = await import('tsx/esm/api').catch(() => null);
      if (tsx?.register) tsx.register();
      return import(pathToFileURL(path.join(ROOT, 'sveltekit-frontend', 'src/lib/server/cache/phase101-summary-cache.ts')).href);
    })();
  }
  return phase101CacheModulePromise;
}

async function ensureSummaryCacheRedis() {
  if (summaryCacheRedis && ['ready', 'connecting', 'connect', 'wait'].includes(summaryCacheRedis.status)) {
    if (summaryCacheRedis.status === 'wait' || summaryCacheRedis.status === 'connecting') {
      await summaryCacheRedis.connect();
    }
    return summaryCacheRedis;
  }
  if (summaryCacheRedis && ['end', 'close'].includes(summaryCacheRedis.status)) {
    summaryCacheRedis = null;
  }
  summaryCacheRedis = new Redis({
    host: REDIS_CONFIG.host,
    port: REDIS_CONFIG.port,
    password: REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    connectTimeout: 3000,
    commandTimeout: 3000,
  });
  if (summaryCacheRedis.status === 'wait' || summaryCacheRedis.status === 'connecting') {
    await summaryCacheRedis.connect();
  }
  await summaryCacheRedis.ping();
  return summaryCacheRedis;
}

async function generateEmbedding(text) {
  try {
    const r = await fetch(`${EMBED_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`embedding HTTP ${r.status}`);
    const data = await r.json();
    return Array.isArray(data?.embedding) ? data.embedding : [];
  } catch (err) {
    if (VERBOSE) console.warn('[Gemma4 Summary Cache] embedding fallback:', String(err?.message ?? err).slice(0, 120));
    return new Array(768).fill(0.01);
  }
}

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = Number(a[i] ?? 0);
    const bv = Number(b[i] ?? 0);
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function readSummaryPacketBySourceRef(cacheRedis, cacheModule, sourceRef) {
  try {
    return await cacheModule.readPhase101SummaryPacketBySourceRef(sourceRef);
  } catch {
    return null;
  }
}

async function lookupCachedSummary(cacheRedis, cacheModule, phase101Input, cacheText, repoRev) {
  const exactCacheKey = cacheModule.buildPhase101SummaryCacheKey(phase101Input, repoRev, cacheText);
  const exactRaw = await cacheRedis.get(exactCacheKey).catch(() => null);
  if (exactRaw) {
    const parsed = safeParseJson(exactRaw);
    if (parsed?.packet) {
      return {
        cache: 'exact',
        packet: parsed.packet,
        exactCacheKey,
        semanticCacheKey: null,
      };
    }
  }

  const queryEmbedding = await generateEmbedding(cacheText);
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    return null;
  }

  const recentKeys = await cacheRedis.lrange('atlas:summary:semantic:index:v1', 0, 99).catch(() => []);
  let best = null;
  let bestScore = 0;
  for (const key of recentKeys) {
    const raw = await cacheRedis.get(key).catch(() => null);
    if (!raw) continue;
    const parsed = safeParseJson(raw);
    if (!parsed?.packet || !Array.isArray(parsed.semanticEmbedding) || parsed.semanticEmbedding.length === 0) {
      continue;
    }
    const score = cosineSimilarity(queryEmbedding, parsed.semanticEmbedding);
    if (score >= 0.95 && score > bestScore) {
      bestScore = score;
      best = {
        cache: 'semantic',
        packet: {
          ...parsed.packet,
          retrieval: {
            ...(parsed.packet.retrieval ?? {}),
            exactCacheHit: false,
            semanticCacheHit: true,
          },
          hitCount: Number(parsed.packet.hitCount ?? 0) + 1,
        },
        exactCacheKey,
        semanticCacheKey: key,
      };
    }
  }

  return best;
}

function buildStableSummaryPrefix(row) {
  return `You are Parent Atlas summarizer.

Return strict JSON with this exact structure:
{
  "synthesis": {
    "mainThemes": ["..."],
    "supportingEvidence": ["..."],
    "gaps": ["..."],
    "contradictions": ["..."],
    "legalImplications": ["..."],
    "nextSteps": ["..."]
  }
}

Rules:
- Preserve sourceRef and feature_id provenance.
- Treat feature:* as a feature bucket, not a file path.
- Keep the summary concise and technical.
- Prefer actionable, high-signal language.

source_ref: ${row.source_ref}
feature_id: ${row.feature_id ?? 'unknown'}
`;
}

function buildSummaryUserPrompt(row, snippet) {
  const tags = Array.isArray(row.tags) ? row.tags.filter((t) =>
    t.startsWith('has_') || t.startsWith('crud:') || t.startsWith('api:') ||
    t.startsWith('auth:') || t.startsWith('runtime:') || t.startsWith('route:') ||
    t.startsWith('component:')
  ) : [];

  const imports = Array.isArray(row.imports)
    ? row.imports.slice(0, 10).join(', ')
    : '';
  const exports = Array.isArray(row.exports)
    ? row.exports.slice(0, 10).join(', ')
    : '';
  const handlers = Array.isArray(row.route_handlers)
    ? row.route_handlers.join(', ')
    : '';

  return `Tags: ${tags.join(', ') || 'none'}
Route handlers: ${handlers || 'none'}
Imports (top 10): ${imports || 'none'}
Exports (top 10): ${exports || 'none'}

Code (first 80 lines):
\`\`\`
${snippet.slice(0, 2000)}
\`\`\`

Write the JSON payload only.`;
}

function buildDeterministicSemanticEmbedding(seedText) {
  const seed = String(seedText ?? '');
  const vector = [];
  for (let i = 0; i < 768; i += 1) {
    const byte = crypto
      .createHash('sha256')
      .update(`${seed}:${i}`)
      .digest()[0] ?? 0;
    vector.push((byte / 255) * 0.05);
  }
  return vector;
}

function buildCachedSummaryInput(row, snippet) {
  const tags = Array.isArray(row.tags) ? row.tags.filter((t) =>
    t.startsWith('has_') || t.startsWith('crud:') || t.startsWith('api:') ||
    t.startsWith('auth:') || t.startsWith('runtime:') || t.startsWith('route:') ||
    t.startsWith('component:')
  ) : [];
  const imports = Array.isArray(row.imports)
    ? row.imports.slice(0, 10).join(', ')
    : '';
  const exports = Array.isArray(row.exports)
    ? row.exports.slice(0, 10).join(', ')
    : '';
  const handlers = Array.isArray(row.route_handlers)
    ? row.route_handlers.join(', ')
    : '';

  return {
    documentId: row.source_ref,
    sections: [
      { title: 'source_ref', content: row.source_ref ?? '' },
      { title: 'feature_id', content: row.feature_id ?? 'unknown' },
      { title: 'tags', content: tags.join(', ') || 'none' },
      { title: 'route_handlers', content: handlers || 'none' },
      { title: 'imports', content: imports || 'none' },
      { title: 'exports', content: exports || 'none' },
      { title: 'snippet', content: snippet || '' },
    ],
    keyInsights: uniqueStrings([
      ...(tags.slice(0, 6) ?? []),
      row.feature_id ? `feature:${row.feature_id}` : null,
      row.source_ref ? `sourceRef:${row.source_ref}` : null,
    ]),
    sourceRefs: [row.source_ref],
    featureIds: row.feature_id ? [row.feature_id] : [],
    laneIds: row.feature_id ? [`feature:${String(row.feature_id).split(':')[0]}`] : [],
    semanticEmbedding: buildDeterministicSemanticEmbedding(`${row.source_ref}:${row.feature_id ?? 'unknown'}:${snippet.slice(0, 160)}`),
    intent: 'summary',
    promptVersion: 'phase101-summary-v1',
    model: process.env.LOCAL_GEMMA_MODEL ?? 'gemma4-rotorquant:latest',
  };
}

async function fetchGemma4Summary(row, cacheText) {
  const baseUrl = String(process.env.LOCAL_OPENAI_BASE_URL ?? 'http://127.0.0.1:8090/v1').replace(/\/+$/, '');
  const model = String(process.env.LOCAL_GEMMA_MODEL ?? 'gemma4-rotorquant:latest').trim();
  const prompt = `${buildStableSummaryPrefix(row)}\n\n${buildSummaryUserPrompt(row, cacheText)}`;
  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LOCAL_OPENAI_API_KEY ?? 'local'}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildStableSummaryPrefix(row) },
        { role: 'user', content: buildSummaryUserPrompt(row, cacheText) },
      ],
      temperature: 0.2,
      max_tokens: 450,
      stream: false,
      cache_prompt: true,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) throw new Error(`llama-server HTTP ${r.status}`);
  const data = await r.json();
  const text = String(data?.choices?.[0]?.message?.content ?? '').trim();
  return text;
}

async function detectLLM() {
  // Try TurboQuant llama-server first
  try {
    const r = await fetch(`http://127.0.0.1:${TURBO_PORT}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (r.ok) { llmMode = 'turboquant'; return; }
  } catch {}

  // Try Ollama
  try {
    const r = await fetch('http://127.0.0.1:11434/api/tags', {
      signal: AbortSignal.timeout(2000),
    });
    if (r.ok) { llmMode = 'ollama'; return; }
  } catch {}

  llmMode = 'unavailable';
}

async function callLLM(prompt) {
  if (llmMode === 'turboquant') {
    const r = await fetch(TURBO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.1,
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`TurboQuant HTTP ${r.status}`);
    const data = await r.json();
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  }

  if (llmMode === 'ollama') {
    const r = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { num_predict: 150, temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
    const data = await r.json();
    return data.message?.content?.trim() ?? '';
  }

  throw new Error('No LLM available (TurboQuant + Ollama both unreachable)');
}

// ── Read first N lines of a file ─────────────────────────────────────────────
function readFirstLines(sourceRef, n = 80) {
  // Resolve relative to repo root
  const candidates = [
    path.join(ROOT, sourceRef),
    path.join(ROOT, 'sveltekit-frontend', sourceRef),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        return content.split('\n').slice(0, n).join('\n');
      } catch { }
    }
  }
  return '';
}

// ── Build prompt ─────────────────────────────────────────────────────────────
function buildPrompt(row, snippet) {
  const tags = Array.isArray(row.tags) ? row.tags.filter(t =>
    t.startsWith('has_') || t.startsWith('crud:') || t.startsWith('api:') ||
    t.startsWith('auth:') || t.startsWith('runtime:') || t.startsWith('route:') ||
    t.startsWith('component:')
  ) : [];

  const imports = Array.isArray(row.imports)
    ? row.imports.slice(0, 10).join(', ')
    : '';
  const exports = Array.isArray(row.exports)
    ? row.exports.slice(0, 10).join(', ')
    : '';
  const handlers = Array.isArray(row.route_handlers)
    ? row.route_handlers.join(', ')
    : '';

  return `You are a senior TypeScript/SvelteKit engineer writing concise technical documentation.

File: ${row.source_ref}
Feature: ${row.feature_id ?? 'unknown'}
Tags: ${tags.join(', ') || 'none'}
Route handlers: ${handlers || 'none'}
Imports (top 10): ${imports || 'none'}
Exports (top 10): ${exports || 'none'}
${snippet ? `\nCode (first 80 lines):\n\`\`\`\n${snippet.slice(0, 2000)}\n\`\`\`` : ''}

Write a single concise paragraph (2-4 sentences) describing what this file does, its role in the system, and any notable patterns. Do NOT repeat the filename. Focus on behavior, not file structure.`;
}

// ── Concurrent batch processor ────────────────────────────────────────────────
async function processBatch(rows, pool, dryRun, cacheRedis) {
  const results = [];
  const queue = [...rows];
  let active = 0;
  let done = 0;

  await new Promise((resolve) => {
    function next() {
      while (active < CONCURRENCY && queue.length > 0) {
        const row = queue.shift();
        active++;
        processOne(row, pool, dryRun, cacheRedis).then(result => {
          results.push(result);
          done++;
          active--;
          if (done % 5 === 0 || queue.length === 0) {
            console.log(`  [${done}/${rows.length}] processed...`);
          }
          if (queue.length === 0 && active === 0) resolve();
          else next();
        }).catch(err => {
          results.push({ source_ref: row.source_ref, error: err.message, success: false });
          done++;
          active--;
          if (queue.length === 0 && active === 0) resolve();
          else next();
        });
      }
    }
    next();
  });

  return results;
}

async function processOne(row, pool, dryRun, cacheRedis) {
  const ext = path.extname(row.source_ref).toLowerCase();
  if (SKIP_EXTENSIONS.has(ext)) {
    return { source_ref: row.source_ref, skipped: true, skippedUnsupported: true, reason: 'binary_ext' };
  }

  const snippet = readFirstLines(row.source_ref);
  const prompt = buildPrompt(row, snippet);

  if (dryRun && !USE_CACHE) {
    // Legacy dry-run path: just return the prompt preview.
    return {
      source_ref: row.source_ref,
      dry_run: true,
      prompt_length: prompt.length,
      has_snippet: snippet.length > 0,
    };
  }

  if (USE_CACHE) {
    const metrics = globalThis.__gemma4SummaryMetrics;
    if (!metrics) throw new Error('Phase101 metrics were not initialized.');
    const cacheModule = await loadPhase101CacheModule();
    const phase101Input = buildCachedSummaryInput(row, snippet);
    const repoRev = process.env.REPO_REVISION?.trim() || process.env.GIT_SHA?.trim() || 'local';
    const cacheText = cacheModule.buildPhase101SummaryCacheText(phase101Input);
    const started = Date.now();

    let exactPromptCacheKey = cacheModule.buildPhase101SummaryCacheKey(phase101Input, repoRev, cacheText);
    let packet = null;
    let exactHit = false;
    let semanticHit = false;
    let cacheStatus = 'miss';
    let semanticCacheKey = null;
    let sourceRefPacket = null;
    let llamaCalled = false;
    let wouldCallLlama = false;
    let skippedDryRun = false;
    let cacheLookupError = null;
    let skipDbUpdate = false;
    let sourceRefReplayUsed = false;
    const replayRecord =
      USE_CACHE && SOURCE_REF_FILTER && cacheRedis
        ? await cacheModule.readPhase101SummaryRecordBySourceRef(row.source_ref, cacheRedis).catch(() => null)
        : null;
    if (replayRecord) {
      packet = replayRecord.packet;
      exactHit = true;
      cacheStatus = 'exact';
      exactPromptCacheKey = replayRecord.exactCacheKey;
      semanticCacheKey = null;
      sourceRefPacket = replayRecord.packet;
      metrics.sourceRefPacketReuse += 1;
      sourceRefReplayUsed = true;
    }

    if (!packet && dryRun) {
      let cached = null;
      if (cacheRedis) {
        try {
          cached = await lookupCachedSummary(cacheRedis, cacheModule, phase101Input, cacheText, repoRev);
        } catch (err) {
          cacheLookupError = String(err?.message ?? err);
          cached = null;
        }
      }
      if (cached) {
        packet = cached.packet;
        exactHit = cached.cache === 'exact';
        semanticHit = cached.cache === 'semantic';
        cacheStatus = cached.cache;
        exactPromptCacheKey = cached.exactCacheKey;
        semanticCacheKey = cached.semanticCacheKey ?? null;
      } else {
        wouldCallLlama = true;
        skippedDryRun = true;
        packet = {
          packetId: `sum:${sha256(exactPromptCacheKey).slice(0, 16)}`,
          queryHash: sha256(cacheText),
          contentHash: sha256(cacheText),
          repoRevision: repoRev,
          model: String(process.env.LOCAL_GEMMA_MODEL ?? 'gemma4-rotorquant:latest').trim(),
          promptVersion: 'phase101-summary-v1',
          intent: 'summary',
          sourceRefs: [row.source_ref],
          featureIds: row.feature_id ? [row.feature_id] : [],
          laneIds: row.feature_id ? [`feature:${String(row.feature_id).split(':')[0]}`] : [],
          summary: cacheText.slice(0, 280),
          lod0Tags: [],
          lod1Summary: '',
          lod2Summary: '',
          recommendations: [],
          risks: [],
          retrieval: { exactCacheHit: false, semanticCacheHit: false, qdrantHits: [], turboVecHits: [] },
          synthesis: {
            mainThemes: [cacheText.slice(0, 280)],
            supportingEvidence: [],
            gaps: [],
            contradictions: [],
            legalImplications: [],
            nextSteps: [],
          },
          createdAt: new Date().toISOString(),
          hitCount: 0,
        };
      }
    } else if (!packet) {
      const generation = await cacheModule.runPhase101SummaryCache(
        phase101Input,
        async (ctx) => {
          const rawText = await fetchGemma4Summary(row, ctx.cacheText);
          const parsed = (() => {
            try {
              const json = JSON.parse(rawText);
              if (json?.synthesis && typeof json.synthesis === 'object') return json.synthesis;
            } catch {}
            return null;
          })();

          const synthesis = parsed ?? {
            mainThemes: [rawText.slice(0, 500)],
            supportingEvidence: [],
            gaps: [],
            contradictions: [],
            legalImplications: [],
            nextSteps: [],
          };

          return { rawText, synthesis };
        },
        { redisClient: cacheRedis ?? undefined }
      );
      packet = generation.packet;
      exactHit = generation.cache === 'exact';
      semanticHit = generation.cache === 'semantic';
      cacheStatus = generation.cache;
      exactPromptCacheKey = generation.exactCacheKey ?? exactPromptCacheKey;
      semanticCacheKey = generation.semanticCacheKey ?? null;
      llamaCalled = generation.cache === 'miss';
    }

    if (APPLY && !isNonEmptyText(packet?.summary)) {
      const fallbackSummary = buildSourceRefSummary(row, snippet);
      const fallbackSynthesis = {
        mainThemes: [fallbackSummary],
        supportingEvidence: [],
        gaps: [],
        contradictions: [],
        legalImplications: [],
        nextSteps: [],
      };
      packet = {
        ...packet,
        summary: buildPacketSummary(packet, fallbackSummary, fallbackSynthesis, row, snippet),
        lod1Summary: packet?.lod1Summary?.trim() ? packet.lod1Summary : fallbackSummary.slice(0, 1000),
        lod2Summary: packet?.lod2Summary?.trim() ? packet.lod2Summary : fallbackSummary.slice(0, 1500),
        recommendations: Array.isArray(packet?.recommendations) && packet.recommendations.length > 0
          ? packet.recommendations
          : [],
        risks: Array.isArray(packet?.risks) && packet.risks.length > 0
          ? packet.risks
          : [],
        synthesis: fallbackSynthesis,
      };
      cacheStatus = `${cacheStatus}_repaired`;
      if (metrics) metrics.cacheRepairs += 1;
      if (cacheRedis) {
        await cacheRedis.set(
          exactPromptCacheKey,
          JSON.stringify({
            packet,
            cacheText,
            queryHash: packet.queryHash,
            contentHash: packet.contentHash,
            cachedAt: packet.createdAt,
            hitCount: packet.hitCount,
          }),
          'EX',
          6 * 60 * 60
        ).catch(() => {});
        if (metrics) metrics.cacheRepairWrites += 1;
      }
    }

    sourceRefPacket = await cacheModule.readPhase101SummaryPacketBySourceRef(
      row.source_ref,
      cacheRedis ?? undefined
    ).catch(() => null);
    if (sourceRefPacket) {
      metrics.sourceRefPacketReads += 1;
      metrics.packetsRead += 1;
      if (!sourceRefReplayUsed && (exactHit || semanticHit || skippedDryRun)) {
        metrics.sourceRefPacketReuse += 1;
      }
    }
    if (SOURCE_REF_FILTER && dryRun && sourceRefPacket && !exactHit && !semanticHit) {
      exactHit = true;
      cacheStatus = 'exact_sourceRef';
      wouldCallLlama = false;
      skippedDryRun = false;
    }
    if (packet && isNonEmptyText(row.summary) && String(row.summary).trim() === String(packet.summary).trim()) {
      metrics.dbSummaryReuse += 1;
      skipDbUpdate = true;
    }
    if (exactHit) metrics.exactCacheHits += 1;
    if (semanticHit) metrics.semanticCacheHits += 1;
    if (llamaCalled) metrics.llamaCalls += 1;
    if (wouldCallLlama) metrics.wouldCallLlama += 1;
    if (skippedDryRun) metrics.skippedDryRun += 1;
    if (exactHit || semanticHit || skippedDryRun) metrics.callsAvoided += 1;

    const summaryHash = sha256(packet.summary);

    if (APPLY && !dryRun && !skipDbUpdate) {
      const columnSet = metrics.summaryColumns;
      const updates = ['summary = $1', 'updated_at = now()'];
      const params = [packet.summary];
      if (columnSet.has('summary_hash')) {
        updates.push(`summary_hash = $${params.length + 1}`);
        params.push(summaryHash);
      }
      if (columnSet.has('summary_model')) {
        updates.push(`summary_model = $${params.length + 1}`);
        params.push(packet.model);
      }
      params.push(row.id);
      await pool.query(
        `UPDATE public.parent_atlas_documents SET ${updates.join(', ')} WHERE id = $${params.length}`,
        params
      );
      metrics.summariesWritten += 1;
    }

    const elapsedMs = Date.now() - started;
    metrics.totalLatencyMs += elapsedMs;
    return {
      source_ref: row.source_ref,
      cache_mode: cacheStatus,
      exact_cache_key: exactPromptCacheKey,
      semantic_cache_key: semanticCacheKey,
      packet_id: packet.packetId,
      summary_length: packet.summary.length,
      exact_cache_hit: exactHit,
      semantic_cache_hit: semanticHit,
      sourceRefPacketRead: Boolean(sourceRefPacket),
      llama_called: llamaCalled,
      would_call_llama: wouldCallLlama,
      skippedDryRun,
      skipped_dry_run: skippedDryRun,
      cache_lookup_error: cacheLookupError,
      calls_avoided: Boolean(exactHit || semanticHit || skippedDryRun),
      callsAvoided: Boolean(exactHit || semanticHit || skippedDryRun),
      latency_ms: elapsedMs,
      success: !skippedDryRun,
    };
  }

  const summary = await callLLM(prompt);
  if (!summary) return { source_ref: row.source_ref, error: 'empty response', success: false };

  // Write to DB
  await pool.query(`
    UPDATE public.parent_atlas_documents
    SET summary = $1, updated_at = now()
    WHERE id = $2
  `, [summary, row.id]);

  return { source_ref: row.source_ref, summary_length: summary.length, success: true };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ Gemma4 Parent Atlas Summaries ══════════════════════════');
  console.log(`  Mode:        ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Limit:       ${LIMIT} files`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  if (SOURCE_REF_FILTER) {
    console.log(`  SourceRef:   ${SOURCE_REF_FILTER}`);
  }

  // Detect LLM for legacy path, or announce cached llama-server path.
  if (USE_CACHE) {
    console.log(`  LLM backend: llama-server (cached batch lane)`);
  } else {
    await detectLLM();
    console.log(`  LLM backend: ${llmMode}`);
    if (llmMode === 'unavailable' && APPLY) {
      console.error('\n  ❌ No LLM available. Start TurboQuant or Ollama first.');
      process.exit(1);
    }
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let cacheRedis = null;
  if (USE_CACHE) {
    try {
      cacheRedis = await ensureSummaryCacheRedis();
    } catch (err) {
      console.warn(`  ⚠️  Phase101 cache Redis unavailable: ${String(err?.message ?? err).slice(0, 120)}`);
      cacheRedis = null;
    }
  }

  // Load rows missing summaries
  console.log(SOURCE_REF_FILTER
    ? '\n  Step 1: Load targeted sourceRef row...'
    : '\n  Step 1: Load rows with empty/null summary...');
  const queryParams = SOURCE_REF_FILTER ? [SOURCE_REF_FILTER] : [LIMIT];
  const { rows } = SOURCE_REF_FILTER
    ? await pool.query(`
    SELECT
      id, source_ref, feature_id, summary, tags,
      imports, exports, route_handlers
      FROM public.parent_atlas_documents
      WHERE source_ref = $1
        AND source_ref NOT LIKE 'feature:%'
        AND NOT ('vendor' = ANY(COALESCE(tags, '{}')))
      LIMIT 1
    `, queryParams)
    : await pool.query(`
      SELECT
        id, source_ref, feature_id, summary, tags,
        imports, exports, route_handlers
      FROM public.parent_atlas_documents
      WHERE (summary IS NULL OR summary = '')
        AND source_ref NOT LIKE 'feature:%'
        AND NOT ('vendor' = ANY(COALESCE(tags, '{}')))
      ORDER BY line_count DESC NULLS LAST
      LIMIT $1
    `, queryParams);

    console.log(SOURCE_REF_FILTER
      ? `  ✅ Found ${rows.length} targeted file(s)`
      : `  ✅ Found ${rows.length} files needing summaries`);
  if (rows.length === 0) {
    console.log('\n  All files already have summaries. ✅');
    await pool.end();
    process.exit(0);
  }

  // Show totals
  const { rows: totals } = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE summary IS NULL OR summary = '') AS missing
    FROM public.parent_atlas_documents
    WHERE source_ref NOT LIKE 'feature:%'
      AND NOT ('vendor' = ANY(COALESCE(tags, '{}')))
  `);
  console.log(`  Total non-vendor files: ${totals[0].total}`);
  console.log(`  Still need summaries:   ${totals[0].missing}`);

  const { rows: columnRows } = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parent_atlas_documents'
  `);
  const summaryColumns = new Set(columnRows.map((row) => String(row.column_name)));
  const skippedVendor = Number(
    (await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM public.parent_atlas_documents
      WHERE (summary IS NULL OR summary = '')
        AND 'vendor' = ANY(COALESCE(tags, '{}'))
    `)).rows[0]?.count ?? 0
  );
  const skippedFeatureBuckets = Number(
    (await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM public.parent_atlas_documents
      WHERE (summary IS NULL OR summary = '')
        AND (source_ref LIKE 'feature:%' OR feature_id LIKE 'feature:%')
    `)).rows[0]?.count ?? 0
  );

  // Process
  console.log(`\n  Step 2: Generating summaries (concurrency=${CONCURRENCY})...`);
  const metrics = {
    exactCacheHits: 0,
    semanticCacheHits: 0,
    sourceRefPacketReuse: 0,
    dbSummaryReuse: 0,
    llamaCalls: 0,
    cacheRepairs: 0,
    cacheRepairWrites: 0,
    wouldCallLlama: 0,
    callsAvoided: 0,
    summariesWritten: 0,
    skippedVendor,
    skippedFeatureBuckets,
    packetsRead: 0,
    sourceRefPacketReads: 0,
    totalLatencyMs: 0,
    summaryColumns,
    skippedDryRun: 0,
  };
  globalThis.__gemma4SummaryMetrics = metrics;
  const results = await processBatch(rows, pool, !APPLY, cacheRedis);

  await pool.end();
  if (cacheRedis) {
    try {
      cacheRedis.disconnect();
    } catch {
      // ignore teardown errors in one-shot batch mode
    }
    cacheRedis = null;
  }

  // Stats
  const succeeded = results.filter(r => r.success).length;
  const skippedUnsupported = results.filter(r => r.skippedUnsupported).length;
  const skippedDryRun = results.filter(r => r.skippedDryRun).length;
  const failed = results.filter(r => r.error && !r.skippedUnsupported && !r.skippedDryRun).length;
  const avgLatencyMs = results.length > 0
    ? Math.round((metrics.totalLatencyMs / results.length) * 10) / 10
    : 0;
  const cacheMisses = results.filter((r) => r.cache_mode === 'miss').length;
  const llamaCallsAvoided = Math.max(0, metrics.callsAvoided);

  const report = {
    timestamp: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    cache_mode: USE_CACHE ? 'phase101-summary-cache' : 'legacy',
    llm_backend: llmMode,
    targetSourceRef: SOURCE_REF_FILTER || null,
    limit: LIMIT,
    concurrency: CONCURRENCY,
    rows_queued: rows.length,
    succeeded,
    skippedUnsupported,
    skippedDryRun,
    failed,
    exactCacheHits: metrics.exactCacheHits,
    semanticCacheHits: metrics.semanticCacheHits,
    sourceRefPacketReuse: metrics.sourceRefPacketReuse,
    dbSummaryReuse: metrics.dbSummaryReuse,
    cacheRepairs: metrics.cacheRepairs,
    cacheRepairWrites: metrics.cacheRepairWrites,
    cacheMisses,
    llamaCalls: metrics.llamaCalls,
    wouldCallLlama: metrics.wouldCallLlama,
    llamaCallsAvoided,
    callsAvoided: metrics.callsAvoided,
    summariesWritten: metrics.summariesWritten,
    skippedVendor: metrics.skippedVendor,
    skippedFeatureBuckets: metrics.skippedFeatureBuckets,
    avgLatencyMs,
    packetsRead: metrics.packetsRead,
    sourceRefPacketReads: metrics.sourceRefPacketReads,
    still_missing: parseInt(totals[0].missing) - succeeded,
    sample: results.slice(0, 10),
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n══ Results ════════════════════════════════════════════════');
  console.log(`  Queued:    ${rows.length}`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  SkippedUnsupported: ${skippedUnsupported} (binary/unsupported ext)`);
  console.log(`  SkippedDryRun: ${skippedDryRun}`);
  console.log(`  Failed:    ${failed}`);
  if (USE_CACHE) {
    console.log(`  Exact hits:    ${metrics.exactCacheHits}`);
    console.log(`  Semantic hits:  ${metrics.semanticCacheHits}`);
    console.log(`  SourceRef reuse:${metrics.sourceRefPacketReuse}`);
    console.log(`  DB summary reuse:${metrics.dbSummaryReuse}`);
    console.log(`  Cache repairs:  ${metrics.cacheRepairs}`);
    console.log(`  Repair writes:  ${metrics.cacheRepairWrites}`);
    console.log(`  Llama calls:    ${metrics.llamaCalls}`);
    console.log(`  Would call llama: ${metrics.wouldCallLlama}`);
    console.log(`  Calls avoided:  ${llamaCallsAvoided}`);
    console.log(`  Packets read:   ${metrics.packetsRead}`);
    console.log(`  Avg latency:    ${avgLatencyMs} ms`);
  }
  console.log(`  Report  → ${REPORT_PATH}`);
  if (!APPLY) {
    console.log('\n  [DRY-RUN] Pass --apply to write summaries to DB.');
  } else {
    console.log('\n  ✅ Summaries written. Re-run profile cards to see them.');
  }
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
