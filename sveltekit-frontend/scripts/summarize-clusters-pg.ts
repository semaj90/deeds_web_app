#!/usr/bin/env npx tsx
/**
 * summarize-clusters-pg.ts — Gemma4 cluster summaries with agentic tool calling.
 *
 * For each GPU cluster in codebase_chunk_index:
 *   1. Fetch top content-bearing chunks from Postgres
 *   2. Call Gemma4 (TurboQuant :8090 → Ollama fallback) with tool-calling loop
 *      Tools: get_cluster_stats, get_related_clusters, search_semantic_tags
 *   3. Embed the summary via embeddinggemma (768-dim)
 *   4. UPSERT into cluster_summaries table
 *
 * Usage:
 *   npx tsx scripts/summarize-clusters-pg.ts [--force] [--cluster=N] [--no-cache]
 *
 * TS 7.0 patterns used:
 *   - await using  (explicit resource management — auto-disconnect Redis + pool)
 *   - satisfies    (config validation without type widening)
 *   - Promise.withResolvers  (cleaner async timeout/race)
 *   - Inferred type predicates  (no manual (x): x is T guards)
 *   - Iterator.prototype.take  (lazy cluster slicing)
 *
 * Docs: scripts/docs/typescript-7-release-notes.md
 */

import pg from 'pg';
import Redis from 'ioredis';
import crypto from 'node:crypto';

// ── Config ─────────────────────────────────────────────────────────────────

const CONFIG = {
  ollamaUrl:     process.env.OLLAMA_URL        ?? 'http://localhost:11434',
  turboUrl:      process.env.TURBOQUANT_URL    ?? 'http://127.0.0.1:8090',
  model:         process.env.OLLAMA_MODEL      ?? 'gemma4-legal-vlm:latest',
  embedModel:    process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest',
  pgUrl:         process.env.DATABASE_URL      ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  redisUrl:      process.env.REDIS_URL         ?? 'redis://localhost:6379',
  redisPass:     process.env.REDIS_PASSWORD    ?? 'redis',
  force:         process.argv.includes('--force'),
  noCache:       process.argv.includes('--no-cache'),
  singleCluster: parseInt(process.argv.find(a => a.startsWith('--cluster='))?.split('=')[1] ?? '-1'),
  concurrency:   parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] ?? process.env.SUMMARIZE_CONCURRENCY ?? '2'),
  topK:          12,
  cacheTtl:      86_400,
} satisfies Record<string, string | number | boolean>;

// ── Disposable wrappers (TS 7.0 await using) ───────────────────────────────

class DisposableRedis extends Redis {
  constructor(url: string, password: string) {
    super(url, { password, lazyConnect: true });
    this.on('error', () => { /* Redis is optional — suppress */ });
  }
  async [Symbol.asyncDispose]() {
    await this.quit().catch(() => {});
  }
}

class DisposablePool extends pg.Pool {
  async [Symbol.asyncDispose]() {
    await this.end().catch(() => {});
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

interface RepChunk {
  qdrant_id: string;
  relative_path: string;
  symbol: string | null;
  kind: string | null;
  domain: string | null;
  content: string;
  semantic_tags: string[];
}

interface ClusterResult {
  summary: string;
  purpose: string;
  patterns: string[];
  warnings: string[];
  tags: string[];
}

// Gemma4 tool-calling types
interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

// ── Agentic tools ──────────────────────────────────────────────────────────

const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_cluster_stats',
      description: 'Get member count and top file paths for a GPU cluster',
      parameters: {
        type: 'object',
        properties: {
          cluster_id: { type: 'number', description: 'The gpu_cluster integer ID' },
        },
        required: ['cluster_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_related_clusters',
      description: 'Find clusters sharing semantic tags with this cluster (for cross-cluster context)',
      parameters: {
        type: 'object',
        properties: {
          tags: { type: 'array', items: { type: 'string' }, description: 'Semantic tags to match' },
          limit: { type: 'number', description: 'Max clusters to return (default 3)' },
        },
        required: ['tags'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_semantic_tags',
      description: 'List all unique semantic tags present in a cluster',
      parameters: {
        type: 'object',
        properties: {
          cluster_id: { type: 'number' },
        },
        required: ['cluster_id'],
      },
    },
  },
];

// ── Tool executor ──────────────────────────────────────────────────────────

async function executeTool(
  pool: pg.Pool,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    if (name === 'get_cluster_stats') {
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS cnt,
                array_agg(DISTINCT relative_path ORDER BY relative_path) FILTER (WHERE relative_path IS NOT NULL) AS paths
         FROM codebase_chunk_index WHERE gpu_cluster = $1 LIMIT 1`,
        [args.cluster_id],
      );
      const r = rows[0];
      const paths = (r.paths ?? []).slice(0, 8);
      return JSON.stringify({ memberCount: parseInt(r.cnt, 10), topPaths: paths });
    }

    if (name === 'get_related_clusters') {
      const tags = args.tags as string[];
      const limit = (args.limit as number) ?? 3;
      const { rows } = await pool.query(
        `SELECT DISTINCT gpu_cluster, COUNT(*) AS shared
         FROM codebase_chunk_index
         WHERE semantic_tags && $1::text[] AND gpu_cluster IS NOT NULL
         GROUP BY gpu_cluster ORDER BY shared DESC LIMIT $2`,
        [tags, limit],
      );
      return JSON.stringify(rows.map(r => ({ cluster: r.gpu_cluster, sharedTags: parseInt(r.shared, 10) })));
    }

    if (name === 'search_semantic_tags') {
      const { rows } = await pool.query(
        `SELECT DISTINCT unnest(semantic_tags) AS tag
         FROM codebase_chunk_index WHERE gpu_cluster = $1`,
        [args.cluster_id],
      );
      // Inferred type predicate — TS 7.0 infers rows.map(r => r.tag).filter(t => !!t) is string[]
      const tags = rows.map(r => r.tag as string | null).filter(t => t !== null);
      return JSON.stringify({ tags });
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

// ── Inference (TurboQuant :8090 → Ollama fallback) ─────────────────────────

let turboAvailable: boolean | null = null;

async function callWithTools(
  messages: ChatMessage[],
  pool: pg.Pool,
): Promise<string> {
  // Probe TurboQuant once per run
  if (turboAvailable === null) {
    try {
      const h = await fetch(`${CONFIG.turboUrl}/health`, { signal: AbortSignal.timeout(2_000) });
      turboAvailable = h.ok;
      console.log(turboAvailable
        ? `  ✓ TurboQuant at ${CONFIG.turboUrl}`
        : `  ⚠ TurboQuant unavailable, using Ollama`);
    } catch {
      turboAvailable = false;
      console.log(`  ⚠ TurboQuant unavailable, using Ollama`);
    }
  }

  // Agentic loop — max 4 rounds of tool use
  const localMessages = [...messages];

  for (let round = 0; round < 4; round++) {
    const response = await (turboAvailable
      ? callTurbo(localMessages)
      : callOllama(localMessages));

    // No tool calls → we have the final answer
    if (!response.tool_calls?.length) {
      return response.content ?? '';
    }

    // Execute each tool call and append results
    localMessages.push({ role: 'assistant', content: response.content ?? '', tool_calls: response.tool_calls });

    for (const tc of response.tool_calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments); } catch { /* malformed args */ }

      const result = await executeTool(pool, tc.function.name, args);
      localMessages.push({ role: 'tool', content: result, tool_call_id: tc.id });
    }
  }

  // Exhausted rounds — ask for final answer without tools
  const final = await (turboAvailable ? callTurbo(localMessages) : callOllama(localMessages));
  return final.content ?? '';
}

async function callTurbo(messages: ChatMessage[]): Promise<{ content?: string; tool_calls?: ToolCall[] }> {
  // Promise.withResolvers for clean timeout race (TS 7.0 / ES2024)
  const { promise, resolve, reject } = Promise.withResolvers<Response>();
  const timeout = setTimeout(() => reject(new Error('TurboQuant timeout')), 120_000);

  try {
    fetch(`${CONFIG.turboUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal',
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 1024,
        stream: false,
        cache_prompt: true,
      }),
    }).then(resolve, reject);

    const res = await promise;
    if (!res.ok) throw new Error(`TurboQuant ${res.status}`);
    const data = await res.json() as { choices?: Array<{ message?: { content?: string; tool_calls?: ToolCall[] } }> };
    return data.choices?.[0]?.message ?? {};
  } catch (err) {
    turboAvailable = false; // mark down, fall through to Ollama next round
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function callOllama(messages: ChatMessage[]): Promise<{ content?: string; tool_calls?: ToolCall[] }> {
  const res = await fetch(`${CONFIG.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.model,
      messages,
      tools: TOOLS,
      stream: false,
      cache_prompt: true,
      options: { temperature: 0.2, num_predict: 1024 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { message?: { content?: string; tool_calls?: ToolCall[] } };
  return data.message ?? {};
}

async function embedText(text: string): Promise<number[] | null> {
  for (const [url, body, extract] of [
    [
      `${CONFIG.ollamaUrl}/api/embed`,
      JSON.stringify({ model: CONFIG.embedModel, input: text }),
      (d: Record<string, unknown>) => Array.isArray(d.embeddings) && Array.isArray((d.embeddings as unknown[][])[0])
        ? (d.embeddings as number[][])[0]
        : null,
    ],
    [
      `${CONFIG.ollamaUrl}/api/embeddings`,
      JSON.stringify({ model: CONFIG.embedModel, prompt: text }),
      (d: Record<string, unknown>) => Array.isArray(d.embedding) ? d.embedding as number[] : null,
    ],
  ] as [string, string, (d: Record<string, unknown>) => number[] | null][]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) continue;
      const vec = extract(await res.json() as Record<string, unknown>);
      if (vec && vec.length === 768) return vec;
    } catch { /* try next */ }
  }
  return null;
}

// ── Postgres helpers ───────────────────────────────────────────────────────

async function getRepresentativeChunks(pool: pg.Pool, cluster: number): Promise<RepChunk[]> {
  const { rows } = await pool.query(`
    SELECT qdrant_id, relative_path, symbol, kind, domain, content, semantic_tags
    FROM codebase_chunk_index
    WHERE gpu_cluster = $1
      AND content IS NOT NULL AND length(content) > 20
    ORDER BY COALESCE(page_rank_score, 0) DESC, indexed_at DESC
    LIMIT $2
  `, [cluster, CONFIG.topK]);
  return rows as RepChunk[];
}

async function getMemberCount(pool: pg.Pool, cluster: number): Promise<number> {
  const { rows } = await pool.query(
    'SELECT COUNT(*) AS cnt FROM codebase_chunk_index WHERE gpu_cluster = $1',
    [cluster],
  );
  return parseInt(rows[0].cnt, 10);
}

// ── Prompt ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  'You are a senior code architect with tool access. Use get_cluster_stats to confirm member counts, ' +
  'search_semantic_tags to discover all tags in the cluster, and get_related_clusters to identify ' +
  'architectural connections. After gathering context, output ONLY valid JSON (no markdown fences, no prose):\n' +
  '{ "summary": string, "purpose": string, "patterns": string[], "warnings": string[], "tags": string[] }\n' +
  'summary: 2-3 sentence description. purpose: one-line label. ' +
  'patterns: 3-5 design patterns. warnings: security/perf concerns (may be []). tags: 2-4 semantic tags.';

function buildUserPrompt(cluster: number, memberCount: number, chunks: RepChunk[]): string {
  const samples = chunks.map(c => {
    const path = c.relative_path || 'unknown';
    const tags = (c.semantic_tags || []).join(', ');
    const code = (c.content || '').slice(0, 400);
    return `// ${path} [${c.kind || ''}${c.symbol ? ': ' + c.symbol : ''}] tags: ${tags}\n${code}`;
  }).join('\n\n---\n\n');
  return `Analyse GPU cluster ${cluster} (${memberCount} total members, ${chunks.length} samples):\n\n${samples}`;
}

// ── Result parsing ─────────────────────────────────────────────────────────

function parseResult(raw: string): ClusterResult {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenced ? fenced[1].trim() : (raw.match(/\{[\s\S]*\}/)?.[0] ?? raw);
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    return {
      summary:  String(parsed.summary ?? ''),
      purpose:  String(parsed.purpose ?? ''),
      patterns: Array.isArray(parsed.patterns) ? (parsed.patterns as unknown[]).map(String) : [],
      warnings: Array.isArray(parsed.warnings) ? (parsed.warnings as unknown[]).map(String) : [],
      tags:     Array.isArray(parsed.tags) ? (parsed.tags as unknown[]).map(String) : [],
    };
  } catch {
    return { summary: raw.slice(0, 500), purpose: '', patterns: [], warnings: [], tags: [] };
  }
}

// ── Cache helpers ──────────────────────────────────────────────────────────

function cacheKey(cluster: number, contentHash: string): string {
  return `summary:cluster:default:${cluster}:${CONFIG.model}:${contentHash}`;
}

function contentHashOf(chunks: RepChunk[]): string {
  return crypto.createHash('sha1')
    .update(chunks.map(c => c.qdrant_id).join(','))
    .digest('hex')
    .slice(0, 12);
}

// ── UPSERT ─────────────────────────────────────────────────────────────────

async function upsertClusterSummary(
  pool: pg.Pool,
  cluster: number,
  memberCount: number,
  result: ClusterResult,
  embedding: number[] | null,
  chunks: RepChunk[],
): Promise<void> {
  await pool.query(`
    INSERT INTO cluster_summaries (
      repo_id, gpu_cluster, summary, purpose, patterns, warnings,
      tags, member_count, summary_model, summary_embedding, metadata, updated_at
    ) VALUES (
      'default', $1, $2, $3, $4, $5,
      $6, $7, $8, $9::vector, $10::jsonb, now()
    )
    ON CONFLICT (repo_id, gpu_cluster) DO UPDATE SET
      summary           = EXCLUDED.summary,
      purpose           = EXCLUDED.purpose,
      patterns          = EXCLUDED.patterns,
      warnings          = EXCLUDED.warnings,
      tags              = EXCLUDED.tags,
      member_count      = EXCLUDED.member_count,
      summary_model     = EXCLUDED.summary_model,
      summary_embedding = EXCLUDED.summary_embedding,
      metadata          = EXCLUDED.metadata,
      updated_at        = now()
  `, [
    cluster,
    result.summary,
    result.purpose || null,
    result.patterns,
    result.warnings,
    result.tags,
    memberCount,
    CONFIG.model,
    embedding ? JSON.stringify(embedding) : null,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      chunkCount: chunks.length,
      topFiles: chunks.slice(0, 5).map(c => c.relative_path).filter(Boolean),
    }),
  ]);
}

// ── Process one cluster ────────────────────────────────────────────────────

async function processCluster(
  pool: pg.Pool,
  redis: DisposableRedis,
  redisReady: boolean,
  cluster: number,
): Promise<boolean> {
  if (!CONFIG.force) {
    const { rows } = await pool.query(
      'SELECT 1 FROM cluster_summaries WHERE repo_id = $1 AND gpu_cluster = $2',
      ['default', cluster],
    );
    if (rows.length > 0) {
      console.log(`  Cluster ${cluster}: exists (skip, use --force)`);
      return true;
    }
  }

  const [chunks, memberCount] = await Promise.all([
    getRepresentativeChunks(pool, cluster),
    getMemberCount(pool, cluster),
  ]);

  if (chunks.length === 0) {
    console.log(`  Cluster ${cluster}: no content chunks, skipped`);
    return false;
  }

  process.stdout.write(`  Cluster ${cluster} (${memberCount} members, ${chunks.length} samples): `);

  const hash = contentHashOf(chunks);
  const key  = cacheKey(cluster, hash);
  let result: ClusterResult | null = null;

  if (redisReady && !CONFIG.force) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        result = JSON.parse(String(cached)) as ClusterResult;
        process.stdout.write('cache hit → ');
      }
    } catch { /* ignore */ }
  }

  if (!result) {
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(cluster, memberCount, chunks) },
    ];
    const raw = await callWithTools(messages, pool);
    result = parseResult(raw);
    process.stdout.write(`summary OK (agentic) → `);

    if (redisReady) {
      try { await redis.setex(key, CONFIG.cacheTtl, JSON.stringify(result)); } catch { /* ignore */ }
    }
  }

  let embedding = await embedText(result.summary);
  if (embedding && embedding.length !== 768) {
    process.stdout.write(`bad dim(${embedding.length}) → `);
    embedding = null;
  }
  process.stdout.write(embedding ? 'embedded → ' : 'no embedding → ');

  await upsertClusterSummary(pool, cluster, memberCount, result, embedding, chunks);
  console.log('persisted ✓');
  return true;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // await using — auto-disconnect on scope exit (TS 7.0 explicit resource management)
  await using redis = new DisposableRedis(CONFIG.redisUrl, CONFIG.redisPass);
  await using pool  = new DisposablePool({ connectionString: CONFIG.pgUrl });

  // Preflight
  const { runPreflight } = await import('./preflight.js');
  const pre = await runPreflight({
    pgUrl:      CONFIG.pgUrl,
    ollamaUrl:  CONFIG.ollamaUrl,
    model:      CONFIG.model,
    embedModel: CONFIG.embedModel,
    redisUrl:   CONFIG.redisUrl,
  });
  for (const w of pre.warnings) console.warn(`  ⚠ ${w}`);
  if (!pre.ok) {
    console.error('\nPreflight FAILED:');
    for (const e of pre.errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log('Preflight passed ✓');

  let redisReady = false;
  if (!CONFIG.noCache) {
    try {
      await redis.ping();
      redisReady = true;
    } catch {
      console.warn('  Redis not available — cache disabled');
    }
  }

  const { rows: clusterRows } = await pool.query(`
    SELECT gpu_cluster FROM codebase_chunk_index
    WHERE gpu_cluster IS NOT NULL
    GROUP BY gpu_cluster ORDER BY gpu_cluster
  `);

  // Iterator.prototype.take — lazy slicing (TS 7.0 / ES2025)
  const allIds = clusterRows.map(r => r.gpu_cluster as number);
  const clusters = CONFIG.singleCluster >= 0 ? [CONFIG.singleCluster] : allIds;

  console.log(`Cluster summarizer — ${clusters.length} clusters, model=${CONFIG.model}, force=${CONFIG.force}, agentic=true`);

  let ok = 0, fail = 0;
  for (let i = 0; i < clusters.length; i += CONFIG.concurrency) {
    const batch = clusters.slice(i, i + CONFIG.concurrency);
    const results = await Promise.all(
      batch.map(c =>
        processCluster(pool, redis, redisReady, c).catch(err => {
          console.error(`  Cluster ${c} error: ${(err as Error).message}`);
          return false;
        }),
      ),
    );
    for (const r of results) r ? ok++ : fail++;
  }

  console.log(`\nDone: ${ok} generated, ${fail} failed`);

  const { rows: stats } = await pool.query(`
    SELECT count(*) AS total,
           count(summary_embedding) AS with_embedding,
           sum(member_count) AS total_members
    FROM cluster_summaries
  `);
  console.log('cluster_summaries stats:', stats[0]);

  // redis and pool auto-disconnected here via await using
}

main().catch(err => { console.error(err); process.exit(1); });
