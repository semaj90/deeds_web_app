#!/usr/bin/env node
/**
 * generate-file-summaries.mjs
 *
 * 4-tier file summary generator. Writes to:
 *   - Postgres `file_summaries` table (drizzle/manual/20260510_file_summaries.sql)
 *   - Qdrant `codebase_chunks_768` payload (enriches existing points with summary/featureIds)
 *   - Redis `code:summary:{stableKey}` (5min TTL fast cache for ACE)
 *
 * Tiers:
 *   T0 — deterministic (every file): path, ext, exports, imports, route type, table refs
 *   T1 — embedding only (every chunk with text): already handled by graphify:semantic
 *   T2 — Gemma4 VLM summary (high-value files): high PageRank, active routes, MCP tools, schemas
 *   T3 — feature card (AGENTS.md, docs, error logs): structured key/value summary
 *
 * Usage:
 *   node scripts/generate-file-summaries.mjs              # T0 all files, T2 top-50
 *   node scripts/generate-file-summaries.mjs --tier 0     # T0 only (fast, ~3s)
 *   node scripts/generate-file-summaries.mjs --tier 2     # T2 only (Gemma4, slow)
 *   node scripts/generate-file-summaries.mjs --limit 200  # T2 top-200 by Karpathy score
 *   node scripts/generate-file-summaries.mjs --dry-run    # print plan, no writes
 *   node scripts/generate-file-summaries.mjs --file src/mcp/trace-mcp-server.ts
 *
 * Env:
 *   DATABASE_URL         Postgres (required for Postgres writes)
 *   QDRANT_URL           default: http://127.0.0.1:6333
 *   OLLAMA_BASE_URL      default: http://127.0.0.1:11434  (T2 only)
 *   TURBOQUANT_BASE_URL  default: http://127.0.0.1:8090   (T2 preferred)
 *   REDIS_URL            default: redis://127.0.0.1:6379
 *   KARPATHY_TOP_N       default: 50 (how many T2 files to summarize)
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { Progress } from './lib/progress.mjs';

dotenv.config();

const __dir    = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(__dir, '../src');

// ── Args ─────────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const getArg  = (name) => {
  const i = args.findIndex(a => a.startsWith(`--${name}=`) || a === `--${name}`);
  if (i === -1) return null;
  return args[i].includes('=') ? args[i].split('=').slice(1).join('=') : (args[i + 1] ?? null);
};

const DRY_RUN    = args.includes('--dry-run');
const TIER_ARG   = getArg('tier');  // null = all tiers
const LIMIT      = parseInt(getArg('limit') ?? process.env.KARPATHY_TOP_N ?? '50', 10);
const FILE_ARG   = getArg('file');
const QUIET      = args.includes('--quiet');

const DO_T0 = !TIER_ARG || TIER_ARG === '0';
const DO_T2 = !TIER_ARG || TIER_ARG === '2';
const DO_T3 = !TIER_ARG || TIER_ARG === '3';

// ── Config ────────────────────────────────────────────────────────────────────

const DATABASE_URL   = process.env.DATABASE_URL;
const QDRANT_URL     = process.env.QDRANT_URL     ?? 'http://127.0.0.1:6333';
const OLLAMA_BASE    = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const TURBO_BASE     = process.env.TURBOQUANT_BASE_URL ?? 'http://127.0.0.1:8090';
const REDIS_URL      = process.env.REDIS_URL      ?? 'redis://127.0.0.1:6379';
const COLLECTION     = 'codebase_chunks_768';
const TIMEOUT_MS     = 60_000;

// ── Route/table detection helpers ─────────────────────────────────────────────

const ROUTE_PATTERNS = [
  { re: /\+page\.svelte$/,        type: 'svelte_page' },
  { re: /\+page\.server\.ts$/,    type: 'page_server' },
  { re: /\+server\.ts$/,          type: 'api_route' },
  { re: /\+layout\.svelte$/,      type: 'layout' },
  { re: /\+layout\.server\.ts$/,  type: 'layout_server' },
];

function detectRouteType(filePath) {
  for (const { re, type } of ROUTE_PATTERNS) {
    if (re.test(filePath)) return type;
  }
  return null;
}

function extractImports(src) {
  const re = /from\s+['"]([^'"]+)['"]/g;
  const imports = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    imports.add(m[1]);
  }
  return [...imports].slice(0, 40);
}

function extractExports(src) {
  const re = /export\s+(?:const|function|class|type|interface|async function)\s+(\w+)/g;
  const exports = [];
  let m;
  while ((m = re.exec(src)) !== null) exports.push(m[1]);
  return exports.slice(0, 30);
}

function extractTableRefs(src) {
  const re = /from\s+['"].*schema-postgres['"].*?import[^;]+?(\b\w+Table\b|\b\w+s\b)/g;
  const tables = new Set();
  // Simple approach: look for Drizzle table names (camelCase vars ending in s or Table)
  const tableRe = /\b(users|cases|evidence|documents|citations|sessions|ragMessages|statutes|codebaseChunks|contextTimeline|featureImplementations|fileSummaries|fixerPatterns)\b/g;
  let m;
  while ((m = tableRe.exec(src)) !== null) tables.add(m[1]);
  return [...tables];
}

function extractTags(filePath, src) {
  const tags = new Set();
  if (/\.svelte$/.test(filePath)) tags.add('svelte');
  if (/\.server\.ts$/.test(filePath)) tags.add('server');
  if (/\/api\//.test(filePath)) tags.add('api');
  if (/\/mcp\//.test(filePath)) tags.add('mcp');
  if (/schema-postgres/.test(filePath)) tags.add('schema');
  if (/qdrant/.test(src.toLowerCase())) tags.add('qdrant');
  if (/redis/.test(src.toLowerCase())) tags.add('redis');
  if (/neo4j/.test(src.toLowerCase())) tags.add('neo4j');
  if (/grpo/.test(src.toLowerCase())) tags.add('grpo');
  if (/zod/.test(src)) tags.add('zod');
  if (/drizzle/.test(src)) tags.add('drizzle');
  return [...tags];
}

// ── T0: Deterministic summary ─────────────────────────────────────────────────

async function buildT0Summary(filePath) {
  const relPath = relative(resolve(__dir, '..'), filePath).replace(/\\/g, '/');
  let src = '';
  try { src = await readFile(filePath, 'utf8'); } catch { return null; }

  const ext       = extname(filePath).replace('.', '');
  const routeType = detectRouteType(filePath);
  const imports   = extractImports(src);
  const exports   = extractExports(src);
  const tableRefs = extractTableRefs(src);
  const tags      = extractTags(filePath, src);
  const linesCount = src.split('\n').length;

  const summary_md = [
    `**${basename(filePath)}** (${ext}, ${linesCount} lines)`,
    routeType ? `Route type: ${routeType}` : null,
    exports.length  ? `Exports: ${exports.slice(0, 8).join(', ')}` : null,
    tableRefs.length ? `DB tables: ${tableRefs.join(', ')}` : null,
    imports.filter(i => !i.startsWith('.')).slice(0, 6).length
      ? `External deps: ${imports.filter(i => !i.startsWith('.')).slice(0, 6).join(', ')}`
      : null,
  ].filter(Boolean).join('\n');

  return {
    file_path:   relPath,
    summary_md,
    chunk_ids:   [],
    tags,
    trust_tier:  3, // T3 = committed code ×0.95
  };
}

// ── T2: Gemma4 LLM summary ────────────────────────────────────────────────────

async function buildT2Summary(filePath, t0) {
  let src = '';
  try { src = await readFile(filePath, 'utf8'); } catch { return t0; }

  // Truncate to ~8K chars (Gemma4 can handle more but this keeps latency <10s)
  const snippet = src.slice(0, 8000);
  const prompt  = `You are a senior TypeScript developer. Analyze this code file and write a concise 2-3 sentence summary of:
1. What it does and why it exists
2. Key exported functions/classes and their purpose
3. Any non-obvious architectural decisions or constraints

File: ${t0.file_path}
\`\`\`${extname(filePath).replace('.', '')}
${snippet}${src.length > 8000 ? '\n... (truncated)' : ''}
\`\`\`

Summary (2-3 sentences, no bullet points, focus on the "why"):`;

  // Try TurboQuant first (faster), fallback to Ollama
  for (const [url, model] of [[TURBO_BASE, null], [OLLAMA_BASE, 'gemma3-legal:latest']]) {
    try {
      const endpoint = model ? `${url}/api/generate` : `${url}/v1/chat/completions`;
      const body = model
        ? { model, prompt, stream: false, options: { temperature: 0.2, num_predict: 256 } }
        : { model: 'gemma4-legal-vlm', messages: [{ role: 'user', content: prompt }], stream: false, max_tokens: 256 };

      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) continue;
      const data = await res.json();
      const text = data.response ?? data.choices?.[0]?.message?.content ?? '';
      if (!text.trim()) continue;

      return {
        ...t0,
        summary_md: text.trim(),
        trust_tier: 2, // T2 = Gemma4 enriched ×1.00
      };
    } catch { /* try next */ }
  }

  return t0; // fallback to T0
}

// ── Postgres upsert ───────────────────────────────────────────────────────────

let pgClient = null;
async function getPg() {
  if (pgClient) return pgClient;
  if (!DATABASE_URL) return null;
  try {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    pgClient = client;
    return client;
  } catch { return null; }
}

async function upsertPg(pg, row) {
  if (!pg) return;
  await pg.query(
    `INSERT INTO file_summaries (file_path, summary_md, chunk_ids, tags, trust_tier)
     VALUES ($1, $2, $3::text[], $4::text[], $5)
     ON CONFLICT (file_path) DO UPDATE SET
       summary_md = EXCLUDED.summary_md,
       chunk_ids  = EXCLUDED.chunk_ids,
       tags       = EXCLUDED.tags,
       trust_tier = EXCLUDED.trust_tier,
       updated_at = now()`,
    [row.file_path, row.summary_md, row.chunk_ids ?? [], row.tags ?? [], row.trust_tier ?? 3],
  );
}

// ── Qdrant payload update ─────────────────────────────────────────────────────

async function enrichQdrantPayload(stableKey, summary_md, tags) {
  // Find point by stableKey filter
  const scrollRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      filter:   { must: [{ key: 'stableKey', match: { value: stableKey } }] },
      limit:    5,
      with_payload: false,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!scrollRes.ok) return false;

  const { result } = await scrollRes.json();
  const points = result?.points ?? [];
  if (!points.length) return false;

  // Patch payload on each matching point
  const patchRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      payload: { summary: summary_md.slice(0, 400), tags },
      points:  points.map(p => p.id),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  return patchRes.ok;
}

// ── Redis cache ───────────────────────────────────────────────────────────────

let redisClient = null;
async function getRedis() {
  if (redisClient) return redisClient;
  try {
    const { default: Redis } = await import('ioredis');
    const r = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false, retryStrategy: () => null });
    r.on('error', () => {});
    await r.connect();
    redisClient = r;
    return r;
  } catch { return null; }
}

async function cacheInRedis(r, filePath, summary) {
  if (!r) return;
  const key = `code:summary:${createHash('sha256').update(filePath).digest('hex').slice(0, 16)}`;
  await r.setex(key, 300, JSON.stringify({ filePath, summary: summary.slice(0, 600) })).catch(() => {});
}

// ── File collection ───────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['.svelte-kit', 'node_modules', 'dist', 'build', '.git', 'static', 'public']);
const INCLUDE_EXT = new Set(['.ts', '.svelte', '.js', '.mjs', '.mts']);

async function collectFiles(dir) {
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = resolve(dir, e.name);
    if (e.isDirectory()) {
      results.push(...await collectFiles(full));
    } else if (INCLUDE_EXT.has(extname(e.name))) {
      results.push(full);
    }
  }
  return results;
}

// ── Karpathy top-N from Redis ─────────────────────────────────────────────────

async function getKarpathyTopFiles(r, n) {
  if (!r) return [];
  try {
    const hash = await r.hgetall('gpu:karpathy:scores');
    const entries = Object.entries(hash ?? {}).map(([file, v]) => {
      try { return { file, blend: JSON.parse(v).blend ?? 0 }; } catch { return { file, blend: 0 }; }
    });
    entries.sort((a, b) => b.blend - a.blend);
    return entries.slice(0, n).map(e => e.file);
  } catch { return []; }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`[file-summaries] tiers: ${[DO_T0 && 'T0', DO_T2 && 'T2', DO_T3 && 'T3'].filter(Boolean).join('+')} | limit_t2: ${LIMIT} | dry_run: ${DRY_RUN}\n`);

const pg    = DRY_RUN ? null : await getPg();
const redis = await getRedis();

let files;
if (FILE_ARG) {
  const abs = resolve(process.cwd(), FILE_ARG);
  files = existsSync(abs) ? [abs] : [];
} else {
  files = await collectFiles(SRC_ROOT);
}

if (!QUIET) console.log(`Found ${files.length} source files\n`);

// ── Tier 0: deterministic ─────────────────────────────────────────────────────
let t0Count = 0;
if (DO_T0) {
  const p = new Progress('T0 deterministic summaries', files.length);
  const rows = [];
  for (const f of files) {
    const row = await buildT0Summary(f);
    if (row) {
      rows.push(row);
      t0Count++;
    }
    p.tick();
  }
  p.done();

  if (!DRY_RUN) {
    const writeP = new Progress('Writing T0 to Postgres', rows.length);
    for (const row of rows) {
      await upsertPg(pg, row);
      writeP.tick();
    }
    writeP.done();
  } else {
    console.log(`[dry-run] Would upsert ${rows.length} T0 rows to file_summaries`);
  }
}

// ── Tier 2: Gemma4 enrichment ─────────────────────────────────────────────────
let t2Count = 0;
if (DO_T2) {
  // Pick top-N by Karpathy blend score; fallback to MCP tool files + route files
  let topFiles = await getKarpathyTopFiles(redis, LIMIT);

  if (topFiles.length < 10) {
    // Fallback: MCP tools, routes, schema
    topFiles = files.filter(f =>
      f.includes('/mcp/') || f.includes('/routes/') || f.includes('schema-postgres') ||
      f.includes('context-assembler') || f.includes('trace-mcp-server')
    ).slice(0, LIMIT);
  } else {
    // Map relative paths to absolute
    topFiles = topFiles.map(rel => {
      const abs = resolve(__dir, '..', rel);
      return existsSync(abs) ? abs : null;
    }).filter(Boolean);
  }

  if (!QUIET) console.log(`\nT2: enriching ${topFiles.length} high-value files with Gemma4...\n`);
  const p = new Progress('T2 Gemma4 summaries', topFiles.length);

  for (const f of topFiles) {
    const t0 = await buildT0Summary(f);
    if (!t0) { p.tick(); continue; }

    const t2 = await buildT2Summary(f, t0);

    if (!DRY_RUN) {
      await upsertPg(pg, t2);
      // Enrich Qdrant payload
      const stableKey = `file:${t2.file_path}`;
      await enrichQdrantPayload(stableKey, t2.summary_md, t2.tags).catch(() => {});
      // Cache in Redis
      await cacheInRedis(redis, t2.file_path, t2.summary_md);
    }

    t2Count++;
    p.tick();
  }
  p.done();

  if (DRY_RUN) console.log(`[dry-run] Would enrich ${topFiles.length} files with Gemma4 summaries`);
}

// ── Tier 3: AGENTS.md feature cards ──────────────────────────────────────────
let t3Count = 0;
if (DO_T3) {
  const agentFiles = files.filter(f => basename(f) === 'AGENTS.md' || f.endsWith('/AGENTS.md'));
  if (!QUIET) console.log(`\nT3: processing ${agentFiles.length} AGENTS.md feature cards...`);

  const p = new Progress('T3 AGENTS.md cards', agentFiles.length);
  for (const f of agentFiles) {
    const relPath = relative(resolve(__dir, '..'), f).replace(/\\/g, '/');
    let src = '';
    try { src = await readFile(f, 'utf8'); } catch { p.tick(); continue; }

    const titleMatch = src.match(/^#\s+(.+)/m);
    const summaryMatch = src.match(/^#[^#].*\n+([^#\n][^\n]{20,})/m);
    const summary_md = [
      titleMatch ? `**${titleMatch[1]}**` : `**${basename(dirname(f))}** AGENTS.md`,
      summaryMatch ? summaryMatch[1].trim() : null,
      `Rules: ${(src.match(/^[-*]\s+.+/mg) ?? []).length} entries`,
    ].filter(Boolean).join('\n');

    const row = {
      file_path:  relPath,
      summary_md,
      chunk_ids:  [],
      tags:       ['agents-md', 'context', basename(dirname(f))],
      trust_tier: 1, // T1 = high-authority context
    };

    if (!DRY_RUN) await upsertPg(pg, row);
    t3Count++;
    p.tick();
  }
  p.done();
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
if (pg)    await pg.end().catch(() => {});
if (redis) await redis.quit().catch(() => {});

console.log(`
Summary:
  T0 deterministic: ${t0Count}
  T2 Gemma4:        ${t2Count}
  T3 AGENTS.md:     ${t3Count}
  dry_run:          ${DRY_RUN}
`);

if (!DRY_RUN && (t0Count + t2Count + t3Count) > 0) {
  console.log('Verify:');
  console.log('  psql "$DATABASE_URL" -c "SELECT trust_tier, count(*) FROM file_summaries GROUP BY 1 ORDER BY 1"');
  console.log(`  curl -s ${QDRANT_URL}/collections/${COLLECTION} | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const r=JSON.parse(d).result;console.log('points:',r?.vectors_count)"`);
}
