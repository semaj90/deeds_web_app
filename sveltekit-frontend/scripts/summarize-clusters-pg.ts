#!/usr/bin/env npx tsx
/**
 * summarize-clusters-pg.ts — Generate Gemma4 cluster summaries + persist.
 *
 * For each GPU cluster in codebase_chunk_index:
 *   1. Fetch top content-bearing chunks from Postgres
 *   2. Call Ollama gemma4-legal-vlm for structured JSON summary
 *   3. Embed the summary via embeddinggemma (768-dim)
 *   4. UPSERT into cluster_summaries table
 *
 * Usage:
 *   npx tsx scripts/summarize-clusters-pg.ts [--force] [--cluster=N]
 */

import pg from 'pg';
import { createClient } from 'redis';
import crypto from 'node:crypto';

const OLLAMA_URL  = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const MODEL       = process.env.OLLAMA_MODEL ?? 'gemma4-legal-vlm:latest';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
const PG_URL      = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';
const REDIS_URL   = process.env.REDIS_URL ?? 'redis://localhost:6379';
const FORCE       = process.argv.includes('--force');
const SINGLE      = parseInt(process.argv.find(a => a.startsWith('--cluster='))?.split('=')[1] ?? '-1');
const NO_CACHE    = process.argv.includes('--no-cache');
const CONCURRENCY = 2; // parallel cluster slots (LLM is the bottleneck)
const TOP_K       = 12;
const CACHE_TTL   = 86_400; // 24 h in seconds

// Redis client — connect lazily, fall back gracefully if unavailable
const redis = createClient({ url: REDIS_URL });
let redisReady = false;
redis.on('error', () => { /* suppress — Redis is optional */ });

function cacheKey(cluster: number, contentHash: string): string {
  return `summary:cluster:default:${cluster}:${MODEL}:${contentHash}`;
}

function contentHashOf(chunks: { qdrant_id: string }[]): string {
  return crypto
    .createHash('sha1')
    .update(chunks.map(c => c.qdrant_id).join(','))
    .digest('hex')
    .slice(0, 12);
}

const pool = new pg.Pool({ connectionString: PG_URL });

// ── Fetch representative chunks per cluster ────────────────────────────────

interface RepChunk {
  qdrant_id: string;
  relative_path: string;
  symbol: string | null;
  kind: string | null;
  domain: string | null;
  content: string;
  semantic_tags: string[];
}

async function getRepresentativeChunks(cluster: number): Promise<RepChunk[]> {
  const { rows } = await pool.query(`
    SELECT qdrant_id, relative_path, symbol, kind, domain, content, semantic_tags
    FROM codebase_chunk_index
    WHERE gpu_cluster = $1
      AND content IS NOT NULL AND length(content) > 20
    ORDER BY COALESCE(page_rank_score, 0) DESC, indexed_at DESC
    LIMIT $2
  `, [cluster, TOP_K]);
  return rows as RepChunk[];
}

async function getMemberCount(cluster: number): Promise<number> {
  const { rows } = await pool.query(
    'SELECT COUNT(*) AS cnt FROM codebase_chunk_index WHERE gpu_cluster = $1',
    [cluster]
  );
  return parseInt(rows[0].cnt, 10);
}

// ── Ollama chat + embed ────────────────────────────────────────────────────

async function callOllamaChat(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      options: { temperature: 0.2, num_predict: 512 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { message?: { content?: string } };
  return (data.message?.content ?? '').trim();
}

async function embedText(text: string): Promise<number[] | null> {
  // Try new /api/embed endpoint first (Ollama ≥0.2), fallback to legacy /api/embeddings
  for (const [url, body, extract] of [
    [
      `${OLLAMA_URL}/api/embed`,
      JSON.stringify({ model: EMBED_MODEL, input: text }),
      (d: any) => Array.isArray(d.embeddings?.[0]) ? d.embeddings[0] as number[] : null,
    ],
    [
      `${OLLAMA_URL}/api/embeddings`,
      JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      (d: any) => Array.isArray(d.embedding) ? d.embedding as number[] : null,
    ],
  ] as [string, string, (d: any) => number[] | null][]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const vec = extract(data);
      if (vec && vec.length === 768) return vec;
    } catch { /* try next */ }
  }
  return null;
}

// ── Prompt + parse ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  'You are a senior code architect. Analyse the following source files and output ONLY valid JSON ' +
  '(no markdown fences, no prose). The JSON must match this schema exactly:\n' +
  '{ "summary": string, "purpose": string, "patterns": string[], "warnings": string[], "tags": string[] }\n' +
  'summary: 2-3 sentence description of what this cluster does.\n' +
  'purpose: one-line label (e.g. "Database access layer").\n' +
  'patterns: 3-5 key design/architectural patterns.\n' +
  'warnings: security/performance concerns (may be empty).\n' +
  'tags: 2-4 semantic category tags for this cluster.';

function buildUserPrompt(cluster: number, memberCount: number, chunks: RepChunk[]): string {
  const samples = chunks.map(c => {
    const path = c.relative_path || 'unknown';
    const kind = c.kind || '';
    const symbol = c.symbol || '';
    const tags = (c.semantic_tags || []).join(', ');
    const code = (c.content || '').slice(0, 400);
    return `// ${path} [${kind}${symbol ? ': ' + symbol : ''}] tags: ${tags}\n${code}`;
  }).join('\n\n---\n\n');

  return `Analyse GPU cluster ${cluster} (${memberCount} total members, ${chunks.length} representative samples):\n\n${samples}`;
}

interface ClusterResult {
  summary: string;
  purpose: string;
  patterns: string[];
  warnings: string[];
  tags: string[];
}

function parseResult(raw: string): ClusterResult {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenced ? fenced[1].trim() : (raw.match(/\{[\s\S]*\}/)?.[0] ?? raw);
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      summary:  String(parsed.summary ?? ''),
      purpose:  String(parsed.purpose ?? ''),
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns.map(String) : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
      tags:     Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    };
  } catch {
    return { summary: raw.slice(0, 500), purpose: '', patterns: [], warnings: [], tags: [] };
  }
}

// ── UPSERT cluster_summaries ───────────────────────────────────────────────

async function upsertClusterSummary(
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
    MODEL,
    embedding ? JSON.stringify(embedding) : null,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      chunkCount: chunks.length,
      topFiles: chunks.slice(0, 5).map(c => c.relative_path).filter(Boolean),
    }),
  ]);
}

// ── Process one cluster ────────────────────────────────────────────────────

async function processCluster(cluster: number): Promise<boolean> {
  // Check if already exists
  if (!FORCE) {
    const { rows } = await pool.query(
      'SELECT 1 FROM cluster_summaries WHERE repo_id = $1 AND gpu_cluster = $2',
      ['default', cluster]
    );
    if (rows.length > 0) {
      console.log(`  Cluster ${cluster}: exists (skip, use --force)`);
      return true;
    }
  }

  const [chunks, memberCount] = await Promise.all([
    getRepresentativeChunks(cluster),
    getMemberCount(cluster),
  ]);

  if (chunks.length === 0) {
    console.log(`  Cluster ${cluster}: no content chunks, skipped`);
    return false;
  }

  process.stdout.write(`  Cluster ${cluster} (${memberCount} members, ${chunks.length} samples): `);

  // Check Redis cache first
  const hash = contentHashOf(chunks);
  const key  = cacheKey(cluster, hash);
  let result: ClusterResult | null = null;

  if (redisReady && !FORCE) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        result = JSON.parse(String(cached)) as ClusterResult;
        process.stdout.write('cache hit → ');
      }
    } catch { /* ignore Redis errors */ }
  }

  // Generate summary (LLM) if not cached
  if (!result) {
    const raw = await callOllamaChat(SYSTEM_PROMPT, buildUserPrompt(cluster, memberCount, chunks));
    result = parseResult(raw);
    process.stdout.write(`summary OK → `);

    // Store in Redis (non-fatal)
    if (redisReady) {
      try {
        await redis.setEx(key, CACHE_TTL, JSON.stringify(result));
      } catch { /* ignore */ }
    }
  }

  // Embed (must be 768-dim for pgvector; skip if malformed)
  let embedding = await embedText(result.summary);
  if (embedding && embedding.length !== 768) {
    process.stdout.write(`bad dim(${embedding.length}) → `);
    embedding = null;
  }
  process.stdout.write(embedding ? 'embedded → ' : 'no embedding → ');

  // Persist
  await upsertClusterSummary(cluster, memberCount, result, embedding, chunks);
  console.log('persisted ✓');
  return true;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // ── Preflight: validate all service dependencies before doing any work ──
  const { runPreflight } = await import('./preflight.js');
  const pre = await runPreflight({
    pgUrl: PG_URL,
    ollamaUrl: OLLAMA_URL,
    model: MODEL,
    embedModel: EMBED_MODEL,
    redisUrl: REDIS_URL,
  });
  if (pre.warnings.length) {
    for (const w of pre.warnings) console.warn(`  ⚠ ${w}`);
  }
  if (!pre.ok) {
    console.error('\nPreflight FAILED — aborting summarization:');
    for (const e of pre.errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log('Preflight passed ✓');

  // Connect Redis (optional — failure is non-fatal)
  if (!NO_CACHE) {
    try {
      await redis.connect();
      redisReady = true;
    } catch {
      console.warn('  Redis not available — cache disabled');
    }
  }

  const { rows: clusterRows } = await pool.query(`
    SELECT gpu_cluster, count(*) as cnt
    FROM codebase_chunk_index
    WHERE gpu_cluster IS NOT NULL
    GROUP BY gpu_cluster ORDER BY gpu_cluster
  `);

  const clusters = SINGLE >= 0
    ? [SINGLE]
    : clusterRows.map(r => r.gpu_cluster as number);

  console.log(`Cluster summary generator (${clusters.length} clusters, model=${MODEL}, force=${FORCE})`);

  let ok = 0, fail = 0;
  for (let i = 0; i < clusters.length; i += CONCURRENCY) {
    const batch = clusters.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(c =>
      processCluster(c).catch(err => {
        console.error(`  Cluster ${c} error: ${(err as Error).message}`);
        return false;
      })
    ));
    for (const r of results) r ? ok++ : fail++;
  }

  console.log(`\nDone: ${ok} generated, ${fail} failed`);

  if (redisReady) await redis.disconnect().catch(() => {});

  const { rows: stats } = await pool.query(`
    SELECT count(*) as total,
           count(summary_embedding) as with_embedding,
           sum(member_count) as total_members
    FROM cluster_summaries
  `);
  console.log('cluster_summaries stats:', stats[0]);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });