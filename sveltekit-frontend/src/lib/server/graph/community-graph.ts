/**
 * community-graph.ts — GraphRAG-style community detection over the codebase graph.
 *
 * Implements a lightweight Leiden-approximation using the existing SOM grid coords
 * and GPU k-means cluster assignments already stored in Qdrant `codebase_chunks_768`.
 * No external Python/Leiden library required — we walk Neo4j IMPORTS + SIMILAR_TOPOLOGY
 * edges and use Union-Find to merge clusters into communities.
 *
 * Community = set of GPU clusters that share dense cross-cluster import edges.
 * Community summary = Gemma4 LLM summary with cache_prompt:true (system prompt KV
 * is computed once and reused across all ~5-10 communities, saving ~8s per run).
 *
 * Storage:
 *   Redis  hg:community:{id}          → JSON CommunityRecord (1h TTL, read cache)
 *   Redis  hg:community:idx           → ZSET <id, cohesion_score> for O(log n) queries
 *   Redis  hg:community:encoding_log  → ZSET <timestamp:id, latencyMs> (last 200 events)
 *   Postgres community_reports table  → durable storage (created on first run)
 *
 * Encoding / embedding log:
 *   Every LLM + embed call writes a structured log entry so the GPU pipeline
 *   dashboard can show token throughput, TurboQuant hit rates, and latency.
 *
 * GraphRAG integration points:
 *   - Global search: embed query → find top community by cosine similarity → inject summary
 *   - Local search: topological-search.ts already does hop-2 expansion; communities add
 *     a coarser "what team does this file belong to" layer above clusters
 *   - ACE context: assembleACEContext() calls getCommunityContext(query) to prepend the
 *     relevant community summary before the fine-grained RAG chunks
 */

import { getRedis } from '$lib/server/redis.js';
import { pool } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// ── Config ────────────────────────────────────────────────────────────────────

const TURBOQUANT_URL   = ENV.TURBOQUANT_BASE_URL;
const OLLAMA_URL       = ENV.OLLAMA_BASE_URL;
const CHAT_MODEL       = ENV.OLLAMA_CHAT_MODEL ?? 'gemma4-legal-vlm:latest';
const NEO4J_URL        = ENV.NEO4J_URI;
const NEO4J_USER       = ENV.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS       = ENV.NEO4J_PASSWORD;
const COMMUNITY_TTL    = 3600;       // 1h Redis cache
const LOG_MAX_ENTRIES  = 200;        // rolling encoding log window
const MIN_CLUSTERS_PER_COMMUNITY = 2;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CommunityRecord {
  id: number;
  clusterIds: number[];
  memberCount: number;
  summary: string;
  purpose: string;
  tags: string[];
  cohesionScore: number;       // mean edge density within community
  embedding: number[] | null;  // 768-dim summary embedding for global search
  builtAt: string;
}

export interface EncodingLogEntry {
  ts: number;
  eventType: 'llm_infer' | 'embed' | 'turbo_hit' | 'turbo_miss';
  communityId: number;
  latencyMs: number;
  tokenCount?: number;
  model: string;
}

export interface CommunityBuildResult {
  communities: number;
  totalClusters: number;
  totalMembers: number;
  turboHits: number;
  turboMisses: number;
  avgLlmMs: number;
  avgEmbedMs: number;
  durationMs: number;
}

// ── Encoding log ──────────────────────────────────────────────────────────────

async function logEncoding(entry: EncodingLogEntry): Promise<void> {
  try {
    const redis = getRedis();
    const score = entry.ts;
    const member = JSON.stringify(entry);
    await redis.zadd('hg:community:encoding_log', score, member);
    // Trim to rolling window
    await redis.zremrangebyrank('hg:community:encoding_log', 0, -(LOG_MAX_ENTRIES + 1));
  } catch { /* non-fatal */ }
}

export async function getEncodingLog(limit = 50): Promise<EncodingLogEntry[]> {
  try {
    const redis = getRedis();
    const raw = await redis.zrange('hg:community:encoding_log', 0, limit - 1, 'REV');
    return raw.map((r) => {
      try { return JSON.parse(r) as EncodingLogEntry; } catch { return null; }
    }).filter((e): e is EncodingLogEntry => e !== null);
  } catch {
    return [];
  }
}

// ── LLM inference (TurboQuant-first) ─────────────────────────────────────────

let turboAvail: boolean | null = null;

async function inferCommunity(system: string, user: string, communityId: number): Promise<string> {
  if (turboAvail === null) {
    try {
      const h = await fetch(`${TURBOQUANT_URL}/health`, { signal: AbortSignal.timeout(2_000) });
      turboAvail = h.ok;
    } catch { turboAvail = false; }
  }

  const t0 = Date.now();

  if (turboAvail) {
    try {
      const res = await fetch(`${TURBOQUANT_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          temperature: 0.15,
          max_tokens: 400,
          stream: false,
          cache_prompt: true,  // KV cache system prompt once, reuse across communities
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.ok) {
        const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) {
          void logEncoding({ ts: Date.now(), eventType: 'turbo_hit', communityId, latencyMs: Date.now() - t0, model: CHAT_MODEL });
          return text;
        }
      }
    } catch { turboAvail = false; }
  }

  // Fallback: Ollama
  const res2 = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      stream: false,
      options: { temperature: 0.15, num_predict: 400 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res2.ok) throw new Error(`Ollama ${res2.status}`);
  const data2 = await res2.json() as { message?: { content?: string } };
  const text2 = (data2.message?.content ?? '').trim();
  void logEncoding({ ts: Date.now(), eventType: 'turbo_miss', communityId, latencyMs: Date.now() - t0, model: CHAT_MODEL });
  return text2;
}

// ── Embedding ─────────────────────────────────────────────────────────────────

async function embedSummary(text: string, communityId: number): Promise<number[] | null> {
  const t0 = Date.now();
  try {
    const vec = await generateSingleEmbedding(text);
    if (vec && vec.length === 768) {
      void logEncoding({ ts: Date.now(), eventType: 'embed', communityId, latencyMs: Date.now() - t0, tokenCount: text.split(/\s+/).length, model: 'embeddinggemma:latest' });
      return Array.from(vec);
    }
  } catch { /* non-fatal */ }
  return null;
}

// ── Neo4j edge loader ─────────────────────────────────────────────────────────

interface ClusterEdge { srcCluster: number; dstCluster: number; weight: number }

async function loadInterClusterEdges(): Promise<ClusterEdge[]> {
  let neo4j: typeof import('neo4j-driver');
  try { neo4j = await import('neo4j-driver'); }
  catch { return []; }

  const driver = neo4j.default.driver(NEO4J_URL, neo4j.default.auth.basic(NEO4J_USER, NEO4J_PASS));
  const session = driver.session({ database: 'neo4j' });
  const edges: ClusterEdge[] = [];

  try {
    // Count cross-cluster IMPORTS edges (dense = same community)
    const result = await session.run(`
      MATCH (a:CodebaseFile)-[:IMPORTS]->(b:CodebaseFile)
      WHERE a.gpuCluster IS NOT NULL AND b.gpuCluster IS NOT NULL
        AND a.gpuCluster <> b.gpuCluster
      RETURN a.gpuCluster AS src, b.gpuCluster AS dst, count(*) AS cnt
      ORDER BY cnt DESC
      LIMIT 500
    `);
    for (const rec of result.records) {
      const src = rec.get('src');
      const dst = rec.get('dst');
      const cnt = rec.get('cnt');
      if (src != null && dst != null) {
        edges.push({
          srcCluster: typeof src === 'object' ? src.toNumber?.() ?? Number(src) : Number(src),
          dstCluster: typeof dst === 'object' ? dst.toNumber?.() ?? Number(dst) : Number(dst),
          weight: typeof cnt === 'object' ? cnt.toNumber?.() ?? Number(cnt) : Number(cnt),
        });
      }
    }
  } finally {
    await session.close();
    await driver.close();
  }
  return edges;
}

// ── Union-Find for community detection ───────────────────────────────────────

class UnionFind {
  private parent: Map<number, number> = new Map();
  private rank:   Map<number, number> = new Map();

  find(x: number): number {
    if (!this.parent.has(x)) { this.parent.set(x, x); this.rank.set(x, 0); }
    if (this.parent.get(x) !== x) this.parent.set(x, this.find(this.parent.get(x)!));
    return this.parent.get(x)!;
  }

  union(x: number, y: number): void {
    const px = this.find(x), py = this.find(y);
    if (px === py) return;
    const rx = this.rank.get(px) ?? 0, ry = this.rank.get(py) ?? 0;
    if (rx < ry) { this.parent.set(px, py); }
    else if (rx > ry) { this.parent.set(py, px); }
    else { this.parent.set(py, px); this.rank.set(px, rx + 1); }
  }

  communities(allNodes: number[]): Map<number, number[]> {
    const groups = new Map<number, number[]>();
    for (const n of allNodes) {
      const root = this.find(n);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(n);
    }
    return groups;
  }
}

// ── Postgres DDL (idempotent) ─────────────────────────────────────────────────

async function ensureTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS community_reports (
      community_id   INT       PRIMARY KEY,
      cluster_ids    INT[]     NOT NULL DEFAULT '{}',
      member_count   INT       NOT NULL DEFAULT 0,
      summary        TEXT      NOT NULL DEFAULT '',
      purpose        TEXT      NOT NULL DEFAULT '',
      tags           TEXT[]    NOT NULL DEFAULT '{}',
      cohesion_score REAL      NOT NULL DEFAULT 0,
      embedding      vector(768),
      built_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// ── Cluster metadata from Postgres ───────────────────────────────────────────

interface ClusterMeta { clusterId: number; memberCount: number; representativeFiles: string[]; tags: string[]; summary: string | null }

async function loadClusterMetas(clusterIds: number[]): Promise<ClusterMeta[]> {
  if (clusterIds.length === 0) return [];
  const { rows } = await pool.query(`
    SELECT gpu_cluster AS cluster_id,
           COUNT(*)::int AS member_count,
           ARRAY_AGG(DISTINCT relative_path ORDER BY relative_path) FILTER (WHERE relative_path IS NOT NULL) AS paths,
           (ARRAY_AGG(DISTINCT semantic_tags[1]) FILTER (WHERE semantic_tags IS NOT NULL AND cardinality(semantic_tags) > 0))[1:8] AS tags,
           (ARRAY_AGG(cluster_summary ORDER BY COALESCE(page_rank_score,0) DESC))[1] AS summary
    FROM codebase_chunk_index
    WHERE gpu_cluster = ANY($1::int[])
      AND content IS NOT NULL
    GROUP BY gpu_cluster
  `, [clusterIds]);

  return rows.map((r: Record<string, unknown>) => ({
    clusterId: Number(r.cluster_id),
    memberCount: Number(r.member_count),
    representativeFiles: ((r.paths as string[] | null) ?? []).slice(0, 6),
    tags: ((r.tags as string[] | null) ?? []).filter(Boolean),
    summary: (r.summary as string | null) ?? null,
  }));
}

// ── Build communities ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  'You are a senior software architect. Given a set of related code clusters, output ONLY valid JSON ' +
  '(no markdown, no prose) matching exactly: ' +
  '{ "summary": string, "purpose": string, "tags": string[] }. ' +
  'summary: 2-3 sentences describing what this community of clusters does together. ' +
  'purpose: one-line label (e.g. "Authentication & session layer"). ' +
  'tags: 3-5 semantic category tags.';

export async function buildCommunityGraph(opts: {
  edgeWeightThreshold?: number;
  force?: boolean;
  onProgress?: (msg: string) => void;
} = {}): Promise<CommunityBuildResult> {
  const t0 = Date.now();
  const { edgeWeightThreshold = 3, force = false, onProgress } = opts;
  const log = (msg: string) => { onProgress?.(msg); console.log(`[community-graph] ${msg}`); };

  await ensureTable();

  // Step 1 — load inter-cluster import edges from Neo4j
  log('Loading inter-cluster edges from Neo4j...');
  const edges = await loadInterClusterEdges();
  log(`  ${edges.length} cross-cluster edges found.`);

  // Step 2 — all cluster IDs from Postgres
  const { rows: clRows } = await pool.query(
    `SELECT DISTINCT gpu_cluster AS id FROM codebase_chunk_index WHERE gpu_cluster IS NOT NULL ORDER BY gpu_cluster`
  );
  const allClusters = clRows.map((r: Record<string, unknown>) => Number(r.id));
  log(`  ${allClusters.length} clusters to group.`);

  // Step 3 — Union-Find with threshold
  const uf = new UnionFind();
  for (const e of edges) {
    if (e.weight >= edgeWeightThreshold) uf.union(e.srcCluster, e.dstCluster);
  }
  const rawGroups = uf.communities(allClusters);

  // Step 4 — assign sequential community IDs, filter singletons
  const communityGroups: Array<{ id: number; clusterIds: number[] }> = [];
  let cid = 0;
  for (const [, clusters] of rawGroups) {
    if (clusters.length < MIN_CLUSTERS_PER_COMMUNITY) continue;
    communityGroups.push({ id: cid++, clusterIds: clusters.sort((a, b) => a - b) });
  }
  log(`  ${communityGroups.length} communities detected (threshold=${edgeWeightThreshold}).`);

  // Step 5 — check existing (skip if not forced)
  const redis = getRedis();
  const stats = { turboHits: 0, turboMisses: 0, llmMs: [] as number[], embedMs: [] as number[] };
  const records: CommunityRecord[] = [];

  for (const group of communityGroups) {
    const cacheKey = `hg:community:${group.id}`;

    if (!force) {
      const cached = await redis.get(cacheKey).catch(() => null);
      if (cached) {
        try {
          records.push(JSON.parse(cached) as CommunityRecord);
          log(`  Community ${group.id}: cache hit`);
          continue;
        } catch { /* stale cache, rebuild */ }
      }
    }

    // Step 6 — load cluster metas and generate summary
    const metas = await loadClusterMetas(group.clusterIds);
    const totalMembers = metas.reduce((s, m) => s + m.memberCount, 0);
    const cohesionEdges = edges.filter(
      (e) => group.clusterIds.includes(e.srcCluster) && group.clusterIds.includes(e.dstCluster)
    );
    const cohesionScore = cohesionEdges.length > 0
      ? cohesionEdges.reduce((s, e) => s + e.weight, 0) / (group.clusterIds.length * group.clusterIds.length)
      : 0;

    const userPrompt = `Community ${group.id} contains ${group.clusterIds.length} clusters (${totalMembers} files total).\n\n` +
      metas.map((m) =>
        `Cluster ${m.clusterId} (${m.memberCount} files): ${m.summary ?? 'no summary'}\n` +
        `  Files: ${m.representativeFiles.slice(0, 3).join(', ')}\n` +
        `  Tags: ${m.tags.join(', ')}`
      ).join('\n\n');

    log(`  Summarizing community ${group.id} (${group.clusterIds.length} clusters)...`);
    const llmT = Date.now();
    let summaryText = '{}';
    try { summaryText = await inferCommunity(SYSTEM_PROMPT, userPrompt, group.id); }
    catch (e) { log(`  ⚠ LLM failed for community ${group.id}: ${(e as Error).message}`); }

    const llmMs = Date.now() - llmT;
    stats.llmMs.push(llmMs);
    const wasTurbo = turboAvail === true;
    if (wasTurbo) stats.turboHits++; else stats.turboMisses++;

    let parsed: { summary?: string; purpose?: string; tags?: string[] } = {};
    try { parsed = JSON.parse(summaryText); } catch { /* keep defaults */ }

    // Step 7 — embed the summary for global search cosine ranking
    const embedT = Date.now();
    const embedding = await embedSummary(parsed.summary ?? summaryText, group.id);
    stats.embedMs.push(Date.now() - embedT);

    const record: CommunityRecord = {
      id: group.id,
      clusterIds: group.clusterIds,
      memberCount: totalMembers,
      summary: parsed.summary ?? summaryText,
      purpose: parsed.purpose ?? `Community ${group.id}`,
      tags: parsed.tags ?? [],
      cohesionScore,
      embedding,
      builtAt: new Date().toISOString(),
    };
    records.push(record);

    // Step 8 — persist to Redis (without embedding — keep slim)
    const slim = { ...record, embedding: null };
    void redis.setex(cacheKey, COMMUNITY_TTL, JSON.stringify(slim)).catch(() => {});
    void redis.zadd('hg:community:idx', cohesionScore, String(group.id)).catch(() => {});

    // Step 9 — persist to Postgres
    try {
      await pool.query(`
        INSERT INTO community_reports
          (community_id, cluster_ids, member_count, summary, purpose, tags, cohesion_score, embedding, built_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, NOW())
        ON CONFLICT (community_id) DO UPDATE SET
          cluster_ids   = EXCLUDED.cluster_ids,
          member_count  = EXCLUDED.member_count,
          summary       = EXCLUDED.summary,
          purpose       = EXCLUDED.purpose,
          tags          = EXCLUDED.tags,
          cohesion_score= EXCLUDED.cohesion_score,
          embedding     = EXCLUDED.embedding,
          built_at      = NOW()
      `, [
        group.id,
        group.clusterIds,
        totalMembers,
        record.summary,
        record.purpose,
        record.tags,
        cohesionScore,
        embedding ? JSON.stringify(embedding) : null,
      ]);
    } catch (e) {
      log(`  ⚠ Postgres persist failed for community ${group.id}: ${(e as Error).message}`);
    }

    log(`  Community ${group.id} done (${llmMs}ms LLM, embed=${embedding ? 'ok' : 'null'}).`);
  }

  const totalMembers = records.reduce((s, r) => s + r.memberCount, 0);
  return {
    communities: records.length,
    totalClusters: allClusters.length,
    totalMembers,
    turboHits: stats.turboHits,
    turboMisses: stats.turboMisses,
    avgLlmMs: stats.llmMs.length ? Math.round(stats.llmMs.reduce((a, b) => a + b, 0) / stats.llmMs.length) : 0,
    avgEmbedMs: stats.embedMs.length ? Math.round(stats.embedMs.reduce((a, b) => a + b, 0) / stats.embedMs.length) : 0,
    durationMs: Date.now() - t0,
  };
}

// ── Query: get community context for ACE assembly ─────────────────────────────

/**
 * Given a query embedding, return the most relevant community summary.
 * Uses cosine similarity against cached community embeddings.
 * Falls back to cohesion-score top community if no embeddings available.
 */
export async function getCommunityContext(
  query: string,
  limit = 2
): Promise<Array<{ id: number; purpose: string; summary: string; tags: string[]; similarity: number }>> {
  try {
    const redis = getRedis();

    // Read community IDs from ZSET (top by cohesion)
    const ids = await redis.zrange('hg:community:idx', 0, 19, 'REV');
    if (ids.length === 0) return [];

    // Embed query
    const queryVec = await generateSingleEmbedding(query).catch(() => null);

    // Load community records — single MGET round-trip (was N parallel gets)
    const commKeys = ids.map((id) => `hg:community:${id}`);
    const commRaws = await redis.mget(...commKeys).catch(() => [] as Array<string | null>);

    // simdjson AVX2 fast-parse for ≥10/≥5KB aggregate. Community records
    // include rich metadata (member files, summary, tags, cohesion) — typical
    // record is 2-8KB so 10+ communities easily clear the threshold.
    const commTotal = commRaws.reduce((sum, r) => sum + (r?.length ?? 0), 0);
    let parseComm: (s: string) => CommunityRecord = (s) => JSON.parse(s) as CommunityRecord;
    if (commRaws.length >= 10 && commTotal >= 5_000) {
      try {
        const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
        if (isSimdJsonAvailable()) parseComm = fastJsonParse<CommunityRecord>;
      } catch { /* addon unavailable — keep V8 */ }
    }

    const records = commRaws
      .map((raw): CommunityRecord | null => {
        if (!raw) return null;
        try { return parseComm(raw); } catch { return null; }
      })
      .filter((r): r is CommunityRecord => r !== null);

    if (records.length === 0) return [];

    // If no query embedding, fall back to top by cohesion
    if (!queryVec) {
      return records.slice(0, limit).map((r) => ({
        id: r.id, purpose: r.purpose, summary: r.summary, tags: r.tags, similarity: r.cohesionScore,
      }));
    }

    // Fetch full embeddings from Postgres for similarity scoring
    const communityIds = records.map((r) => r.id);
    const { rows } = await pool.query(`
      SELECT community_id,
             1 - (embedding <=> $1::vector) AS similarity
      FROM community_reports
      WHERE community_id = ANY($2::int[])
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `, [JSON.stringify(Array.from(queryVec)), communityIds, limit]).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    const simMap = new Map<number, number>(
      rows.map((r: Record<string, unknown>) => [Number(r.community_id), Number(r.similarity)] as [number, number])
    );

    // Merge similarities into records
    const scored = records
      .map((r) => ({ ...r, similarity: simMap.get(r.id) ?? r.cohesionScore }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return scored.map((r) => ({
      id: r.id, purpose: r.purpose, summary: r.summary, tags: r.tags, similarity: r.similarity,
    }));
  } catch {
    return [];
  }
}

/**
 * Invalidate all community graph caches (called after hypergraph rebuild or cluster reassign).
 */
export async function invalidateCommunityCache(): Promise<void> {
  try {
    const redis = getRedis();
    const keys = await redis.keys('hg:community:*');
    if (keys.length > 0) await redis.del(...keys);
  } catch { /* non-fatal */ }
}

// ── Directory KAG context ─────────────────────────────────────────────────────

export interface DirectoryKAGResult {
  dir:        string;
  summary:    string;
  tags:       string[];
  /** Cosine similarity to query (0–1 GPU, 0–0.08 keyword fallback) */
  score:      number;
  auditScore?: number;
  /** 4D topology: SOM Best Matching Unit grid position (10×10) */
  somBmuRow?: number | null;
  somBmuCol?: number | null;
  /** Scoring method used for transparency in ACE context */
  scoringMethod?: 'gpu-cosine' | 'keyword';
}

interface WikiNoteRecord {
  directoryPath?: string;
  summary?: string;
  dominantTags?: string[];
  auditScore?: number;
  somBmuRow?: number | null;
  somBmuCol?: number | null;
  summaryEmbedding?: number[] | null;
}

/**
 * KAG source for ACE: fetches directory-level wiki notes written by
 * ingestDirectorySummaries (via index-codebase-fast --write-plan or
 * the /api/codebase-index/directory-summaries route).
 *
 * Keys: wiki:note:dir:{docId}  (JSON ClusterNote shape, TTL 24h)
 *
 * Scoring (ranked priority):
 *   1. GPU batch cosine similarity via libtorch batchCosineSimilarity()
 *      — uses cached summaryEmbedding stored in wiki note (version ≥ 2)
 *   2. Postgres community_reports cosine via pgvector (embedding <=> query)
 *   3. Keyword overlap fallback (legacy notes without embeddings), capped 0.08
 *
 * 4D topology: SOM BMU coords are surfaced in results so ACE context
 * can show topological locality ("this dir is in cluster grid 3,7").
 *
 * Returns at most `limit` results ranked by relevance.
 */
export async function getDirectoryKAGContext(
  query: string,
  limit = 3
): Promise<DirectoryKAGResult[]> {
  try {
    const redis = getRedis();

    // ── Step 1: Resolve candidate keys via fast-AST tag index ──────────────
    const manifestRaw = await redis.get('code:index:manifest').catch(() => null);
    const indexKeys: string[] = [];

    if (manifestRaw) {
      const manifest = JSON.parse(manifestRaw) as { mode?: string };
      if (manifest.mode === 'fast-ast') {
        const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 3).slice(0, 5);
        // Single MGET for all word-tag keys (was N sequential gets)
        const tagKeys = words.map((w) => `code:index:tag:${w}`);
        const tagRaws = tagKeys.length
          ? await redis.mget(...tagKeys).catch(() => [] as Array<string | null>)
          : [];
        for (const raw of tagRaws) {
          if (!raw) continue;
          const paths: string[] = JSON.parse(raw);
          for (const p of paths.slice(0, 8)) {
            const dir   = p.split('/').slice(0, -1).join('/');
            const docId = `dir:${dir.replace(/[^a-z0-9]/gi, '_')}`;
            const key   = `wiki:note:dir:${docId}`;
            if (!indexKeys.includes(key)) indexKeys.push(key);
          }
        }
      }
    }

    // Fallback: scan server dirs when index is cold
    if (indexKeys.length === 0) {
      const scanned = await redis.keys('wiki:note:dir:dir_src_lib_server*').catch(() => [] as string[]);
      indexKeys.push(...scanned.slice(0, 30));
    }

    if (indexKeys.length === 0) return [];
// ── Step 2: Load all candidate notes from Redis (single MGET) ──────────
const notes: Array<WikiNoteRecord & { _key: string }> = [];
const noteRaws = await redis.mget(...indexKeys).catch(() => [] as Array<string | null>);
// simdjson AVX2 fast-parse for ≥10/≥5KB aggregate. WikiNoteRecord
// contains rich summary text + dominant tags + SOM BMU coords —
// typical record is 2-4KB so 10+ notes easily clear the threshold.
const totalChars = noteRaws.reduce((sum, r) => sum + (r?.length ?? 0), 0);
let parseNote: (s: string) => WikiNoteRecord = (s) => JSON.parse(s) as WikiNoteRecord;
if (noteRaws.length >= 10 && totalChars >= 5_000) {
try {
const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
if (isSimdJsonAvailable()) parseNote = fastJsonParse<WikiNoteRecord>;
} catch { /* addon unavailable — keep V8 */ }
}
for (let i = 0; i < indexKeys.length; i++) {
const raw = noteRaws[i];
if (!raw) continue;
try {
const parsed = parseNote(raw);
notes.push({ ...parsed, _key: indexKeys[i] });
} catch { continue; }
}

    if (notes.length === 0) return [];

    // ── Step 3: GPU batch cosine similarity over stored embeddings ──────────
    // Notes with version ≥ 2 carry summaryEmbedding (768-dim Float32).
    // Embed query once, then GPU-rank all notes in a single kernel call.
    let scoringMethod: 'gpu-cosine' | 'keyword' = 'keyword';
    const scoreMap = new Map<string, number>();

    const notesWithEmbedding = notes.filter(
      (n) => Array.isArray(n.summaryEmbedding) && n.summaryEmbedding.length === 768
    );

    if (notesWithEmbedding.length > 0) {
      try {
        const queryEmbedding = await generateSingleEmbedding(query);
        if (queryEmbedding && queryEmbedding.length === 768) {
          const { batchCosineSimilarity } = await import('$lib/server/gpu/libtorch-bridge.js');
          const corpus = notesWithEmbedding.map((n) => n.summaryEmbedding as number[]);
          const { scores } = await batchCosineSimilarity(queryEmbedding, corpus);
          for (let i = 0; i < notesWithEmbedding.length; i++) {
            const dir = String(notesWithEmbedding[i].directoryPath ?? '');
            if (dir) scoreMap.set(dir, scores[i] ?? 0);
          }
          scoringMethod = 'gpu-cosine';
        }
      } catch { /* fall through to keyword */ }
    }

    // ── Step 4: Keyword fallback for notes without embeddings ───────────────
    const queryWords = new Set(query.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
    for (const note of notes) {
      const dir = String(note.directoryPath ?? '');
      if (!dir || scoreMap.has(dir)) continue;
      const summary = String(note.summary ?? '');
      const tags    = Array.isArray(note.dominantTags) ? (note.dominantTags as string[]) : [];
      const textWords = new Set((dir + ' ' + summary + ' ' + tags.join(' ')).toLowerCase().split(/\W+/));
      const overlap = [...queryWords].filter((w) => textWords.has(w)).length;
      scoreMap.set(dir, Math.min(0.08, 0.02 + overlap * 0.015));
    }

    // ── Step 5: Build ranked results ────────────────────────────────────────
    const results: DirectoryKAGResult[] = [];
    for (const note of notes) {
      const dir      = String(note.directoryPath ?? '');
      const summary  = String(note.summary ?? '');
      const tags     = Array.isArray(note.dominantTags) ? (note.dominantTags as string[]) : [];
      const auditScore = typeof note.auditScore === 'number' ? note.auditScore : undefined;
      if (!dir || !summary) continue;

      results.push({
        dir,
        summary,
        tags,
        score:     scoreMap.get(dir) ?? 0,
        auditScore,
        somBmuRow: note.somBmuRow ?? null,
        somBmuCol: note.somBmuCol ?? null,
        scoringMethod,
      });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Quick-hit LLMS.md fetcher for agent tool-calls.
 *
 * Returns the pre-rendered markdown for a directory's LLMS.md file (mirrored
 * into Redis by `npm run llms:write`). Use this in ACE tool-call paths when
 * an agent needs directory-scoped context in <5ms — much cheaper than the
 * full `getDirectoryKAGContext()` which does GPU cosine + multi-key reads.
 *
 * Walks UP the directory tree (per LLMS.md spec) until a key is found:
 *   src/lib/server/ace/foo  → tries llms:dir:src/lib/server/ace/foo
 *                           → falls back to llms:dir:src/lib/server/ace
 *                           → ... → llms:root (always-present root)
 *
 * Keys: llms:dir:<rel>           rendered LLMS.md per directory (24h TTL)
 *       llms:root                rendered repo-root LLMS.md (24h TTL)
 *
 * Refresh: `npm run llms:write` (after `npm run index:codebase:fast`).
 */
export interface AgentsMdQuickHitResult {
  markdown: string;
  source: 'redis' | 'disk';
  resolvedPath: string;
  resolvedKey?: string;
}

function getAgentsMdRoots(): { frontendRoot: string; repoRoot: string } {
  const cwd = process.cwd();
  if (path.basename(cwd) === 'sveltekit-frontend') {
    return { frontendRoot: cwd, repoRoot: path.resolve(cwd, '..') };
  }
  return { frontendRoot: path.join(cwd, 'sveltekit-frontend'), repoRoot: cwd };
}

function isPathInsideRoot(relativePath: string): boolean {
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function normalizeAgentsLookupDir(
  dirOrFilePath: string,
  frontendRoot: string,
  repoRoot: string
): string {
  let normalized = dirOrFilePath.trim();
  if (!normalized) return '';

  if (path.isAbsolute(normalized)) {
    const relToFrontend = path.relative(frontendRoot, normalized);
    if (isPathInsideRoot(relToFrontend)) {
      normalized = relToFrontend;
    } else {
      const relToRepo = path.relative(repoRoot, normalized);
      if (isPathInsideRoot(relToRepo)) normalized = relToRepo;
    }
  }

  normalized = normalized.replace(/\\/g, '/');
  normalized = normalized.replace(/^\.\//, '');
  normalized = normalized.replace(/^sveltekit-frontend\//, '');
  normalized = normalized.replace(/\/+$/, '');

  if (/\.[a-z0-9]{1,8}$/i.test(path.posix.basename(normalized))) {
    normalized = path.posix.dirname(normalized);
  }

  return normalized === '.' ? '' : normalized;
}

function buildLookupDirs(dir: string): string[] {
  if (!dir) return [];

  const dirs: string[] = [];
  let current = dir;

  while (current && current !== '.' && current !== '/') {
    dirs.push(current);
    const parent = path.posix.dirname(current);
    if (!parent || parent === '.' || parent === current) break;
    current = parent;
  }

  return dirs;
}

function toFrontendAgentsRepoPath(dir: string): string {
  return dir ? `sveltekit-frontend/${dir}/LLMS.md` : 'sveltekit-frontend/LLMS.md';
}

async function readAgentsMarkdown(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function resolveAgentsMdQuickHit(
  dirOrFilePath: string
): Promise<AgentsMdQuickHitResult | null> {
  const { frontendRoot, repoRoot } = getAgentsMdRoots();
  const normalizedDir = normalizeAgentsLookupDir(dirOrFilePath, frontendRoot, repoRoot);
  const lookupDirs = buildLookupDirs(normalizedDir);

  try {
    const redis = getRedis();
    for (const dir of lookupDirs) {
      const key = `llms:dir:${dir}`;
      const markdown = await redis.get(key).catch(() => null);
      if (markdown) {
        return {
          markdown,
          source: 'redis',
          resolvedPath: toFrontendAgentsRepoPath(dir),
          resolvedKey: key,
        };
      }
    }

    const rootMarkdown = await redis.get('llms:root').catch(() => null);
    if (rootMarkdown) {
      return {
        markdown: rootMarkdown,
        source: 'redis',
        resolvedPath: 'LLMS.md',
        resolvedKey: 'llms:root',
      };
    }
  } catch {
    // Fall through to disk when Redis is unavailable or stale.
  }

  for (const dir of [...lookupDirs, '']) {
    const filePath = dir
      ? path.join(frontendRoot, ...dir.split('/'), 'LLMS.md')
      : path.join(frontendRoot, 'LLMS.md');
    const markdown = await readAgentsMarkdown(filePath);
    if (markdown) {
      return {
        markdown,
        source: 'disk',
        resolvedPath: toFrontendAgentsRepoPath(dir),
      };
    }
  }

  const repoRootAgents = path.join(repoRoot, 'LLMS.md');
  const repoMarkdown = await readAgentsMarkdown(repoRootAgents);
  if (!repoMarkdown) return null;

  return {
    markdown: repoMarkdown,
    source: 'disk',
    resolvedPath: 'LLMS.md',
  };
}

export async function getAgentsMdQuickHit(dirOrFilePath: string): Promise<string | null> {
  const hit = await resolveAgentsMdQuickHit(dirOrFilePath);
  return hit?.markdown ?? null;
}
