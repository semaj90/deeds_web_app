import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { aceTopkKey } from './cache-keys.js';
import { readLatestQdrantClusterTags, scoreClusterRelevance } from './cluster-tags-cache.js';

export type RetrievalLaneName =
  | 'redis_ace'
  | 'postgres_trigram'
  | 'qdrant_vector'
  | 'ast_symbol'
  | 'neo4j_graph'
  | 'som_topology'
  | 'summary_lenses'
  | 'web_research';

export interface ContextHit {
  id: string;
  chunkId?: string;
  filePath?: string;
  symbol?: string;
  source: RetrievalLaneName;
  text?: string;
  score: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface RetrievalLaneResult {
  lane: RetrievalLaneName;
  degraded: boolean;
  reason?: string;
  latencyMs: number;
  hits: ContextHit[];
}

export interface MultiLaneOutput {
  lanes: RetrievalLaneResult[];
  merged: ContextHit[];
  topFiles: string[];
  topSymbols: string[];
  hotClusters: HotClusterRecall[];
  totalHits: number;
  durationMs: number;
}

export interface HotClusterRecall {
  clusterKey: string;
  score: number;
  filePath?: string;
  summary: string;
  purpose?: string;
  topoClasses: string[];
  topTags: string[];
  fileCount: number;
  riskLevel?: string;
  protocols?: string[];
}

const LANE_WEIGHTS: Record<RetrievalLaneName, number> = {
  redis_ace: 1.0,
  qdrant_vector: 1.0,
  ast_symbol: 0.9,
  som_topology: 0.8,
  summary_lenses: 1.5,
  postgres_trigram: 0.75,
  neo4j_graph: 0.85,
  web_research: 0.5,
};

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}

function degraded(lane: RetrievalLaneName, reason: string, latencyMs = 0): RetrievalLaneResult {
  return { lane, degraded: true, reason, latencyMs, hits: [] };
}

function buildHotClusterRecall(query: string, limit = 3): HotClusterRecall[] {
  const entries = readLatestQdrantClusterTags();
  if (!entries.length) return [];

  const queryLower = query.toLowerCase();
  const queryTerms = new Set(queryLower.split(/\W+/).filter((term) => term.length > 2));

  return entries
    .map((entry) => ({ entry, score: scoreClusterRelevance(entry, queryLower, queryTerms) }))
    .filter(({ score }) => score >= 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry, score }) => {
      const filePath = (entry.topFiles as (string | null)[]).find(
        (path): path is string => path != null
      );

      return {
        clusterKey: entry.clusterKey,
        score,
        filePath,
        summary: entry.summary?.trim() || entry.purpose?.trim() || entry.clusterKey,
        purpose: entry.purpose,
        topoClasses: entry.topoClasses,
        topTags: entry.topTags.slice(0, 6).map((tag) => tag.tag),
        fileCount: entry.fileCount,
        riskLevel: entry.risk_level,
        protocols: entry.mitigation_protocols,
      };
    });
}

async function runRedisAceLane(
  redis: Redis | undefined,
  query: string,
  topK: number
): Promise<RetrievalLaneResult> {
  const t0 = Date.now();
  if (!redis) return degraded('redis_ace', 'redis_unavailable');
  try {
    const qHash = sha256(query.slice(0, 512)).slice(0, 12);
    const cacheKey = aceTopkKey(qHash);
    const raw = await redis.get(cacheKey);
    const hits: ContextHit[] = [];

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
        const arr = Array.isArray(parsed) ? parsed : [];
        for (const item of arr.slice(0, topK)) {
          hits.push({
            id: String(item.id ?? item.chunkId ?? qHash),
            chunkId: item.chunkId != null ? String(item.chunkId) : undefined,
            filePath: item.filePath != null ? String(item.filePath) : undefined,
            source: 'redis_ace',
            text: item.text != null ? String(item.text) : undefined,
            score: typeof item.score === 'number' ? item.score : 0.8,
            tags: Array.isArray(item.tags) ? (item.tags as string[]) : undefined,
          });
        }
      } catch {
        // malformed cache entry — no hits
      }
    }

    const looksLikeError = /Error:|at src\//i.test(query);
    if (looksLikeError && hits.length === 0) {
      const errHash = sha256(query.slice(0, 256)).slice(0, 12);
      const errRaw = await redis.get(`ace:error:${errHash}`).catch(() => null);
      if (errRaw) {
        try {
          const errParsed = JSON.parse(errRaw) as Array<Record<string, unknown>>;
          const arr = Array.isArray(errParsed) ? errParsed : [errParsed];
          for (const item of arr.slice(0, topK)) {
            hits.push({
              id: String(item.id ?? errHash),
              source: 'redis_ace',
              text: item.text != null ? String(item.text) : undefined,
              score: typeof item.score === 'number' ? item.score : 0.75,
            });
          }
        } catch {
          // ignore
        }
      }
    }

    return { lane: 'redis_ace', degraded: false, latencyMs: Date.now() - t0, hits };
  } catch (err) {
    return degraded('redis_ace', String(err), Date.now() - t0);
  }
}

async function runPostgresTrigramLane(
  pool: Pool,
  query: string,
  topK: number
): Promise<RetrievalLaneResult> {
  const t0 = Date.now();
  try {
    const [docRes, resRes] = await Promise.allSettled([
      pool.query<{ id: string; text: string; file_path: string | null; score: number }>(
        `SELECT id::text, content AS text, NULL::text AS file_path,
                similarity(content, $1)::float AS score
         FROM document_chunks
         WHERE similarity(content, $1) > 0.2
         ORDER BY score DESC LIMIT $2`,
        [query, topK]
      ),
      pool.query<{ id: string; text: string; file_path: string | null; score: number }>(
        `SELECT id::text, content AS text, NULL::text AS file_path,
                similarity(content, $1)::float AS score
         FROM research_summaries
         WHERE similarity(content, $1) > 0.2
         ORDER BY score DESC LIMIT $2`,
        [query, topK]
      ),
    ]);

    const hits: ContextHit[] = [];

    if (docRes.status === 'fulfilled') {
      for (const row of docRes.value.rows) {
        hits.push({
          id: row.id,
          filePath: row.file_path ?? undefined,
          source: 'postgres_trigram',
          text: row.text,
          score: row.score,
        });
      }
    }

    if (resRes.status === 'fulfilled') {
      for (const row of resRes.value.rows) {
        hits.push({
          id: row.id,
          filePath: row.file_path ?? undefined,
          source: 'postgres_trigram',
          text: row.text,
          score: row.score,
        });
      }
    }

    // Both queries rejected → lane is degraded (no usable data)
    if (docRes.status === 'rejected' && resRes.status === 'rejected') {
      return degraded(
        'postgres_trigram',
        String((docRes as PromiseRejectedResult).reason),
        Date.now() - t0
      );
    }

    hits.sort((a, b) => b.score - a.score);

    return {
      lane: 'postgres_trigram',
      degraded: false,
      latencyMs: Date.now() - t0,
      hits: hits.slice(0, topK),
    };
  } catch (err) {
    return degraded('postgres_trigram', String(err), Date.now() - t0);
  }
}

async function runAstSymbolLane(
  redis: Redis | undefined,
  query: string
): Promise<RetrievalLaneResult> {
  const t0 = Date.now();
  if (!redis) return degraded('ast_symbol', 'redis_unavailable');
  try {
    const pathPattern = /src\/[^\s'"]+\.(ts|svelte|js|mjs)/g;
    const matches = [...query.matchAll(pathPattern)].map((m) => m[0]).slice(0, 5);

    if (matches.length === 0) {
      return { lane: 'ast_symbol', degraded: false, latencyMs: Date.now() - t0, hits: [] };
    }

    const hits: ContextHit[] = [];

    await Promise.allSettled(
      matches.map(async (path) => {
        const hash = sha1(path).slice(0, 12);
        const raw = await redis.get(`code:graph:node:${hash}`);
        if (!raw) return;
        try {
          const node = JSON.parse(raw) as {
            file_path?: string;
            zone?: string;
            directFanIn?: number;
            directFanOut?: number;
            text?: string;
          };
          const fanIn = node.directFanIn ?? 0;
          hits.push({
            id: hash,
            filePath: node.file_path ?? path,
            source: 'ast_symbol',
            text: node.text,
            score: Math.min(0.5 + fanIn / 100, 0.9),
            metadata: {
              zone: node.zone,
              directFanIn: node.directFanIn,
              directFanOut: node.directFanOut,
            },
          });
        } catch {
          // malformed node
        }
      })
    );

    return { lane: 'ast_symbol', degraded: false, latencyMs: Date.now() - t0, hits };
  } catch (err) {
    return degraded('ast_symbol', String(err), Date.now() - t0);
  }
}

function inferTopoClass(query: string): string {
  const q = query.toLowerCase();
  if (/redis|cache|ttl|setex/.test(q)) return 'cache';
  if (/qdrant|vector|embedding|768/.test(q)) return 'vector';
  if (/neo4j|cypher|graph|node|edge/.test(q)) return 'graph';
  if (/postgres|sql|drizzle|table|schema/.test(q)) return 'db';
  if (/ollama|llm|inference|gemma/.test(q)) return 'inference';
  if (/svelte|component|route|page/.test(q)) return 'frontend';
  return 'general';
}

async function runSomTopologyLane(
  redis: Redis | undefined,
  query: string
): Promise<RetrievalLaneResult> {
  const t0 = Date.now();
  if (!redis) return degraded('som_topology', 'redis_unavailable');
  try {
    const topoClass = inferTopoClass(query);
    const qHash = sha256(query).slice(0, 12);
    const raw = await redis.get(`ace:topo:${topoClass}:${qHash}`);
    const hits: ContextHit[] = [];

    if (raw) {
      try {
        const candidates = JSON.parse(raw) as Array<Record<string, unknown>>;
        const arr = Array.isArray(candidates) ? candidates : [];
        for (const item of arr) {
          hits.push({
            id: String(item.id ?? item.chunkId ?? qHash),
            chunkId: item.chunkId != null ? String(item.chunkId) : undefined,
            filePath: item.filePath != null ? String(item.filePath) : undefined,
            source: 'som_topology',
            text: item.text != null ? String(item.text) : undefined,
            score: typeof item.score === 'number' ? item.score : 0.7,
            tags: Array.isArray(item.tags) ? (item.tags as string[]) : undefined,
            metadata: { topoClass, source: 'ace:topo' },
          });
        }
      } catch {
        // malformed cache
      }
    }

    if (hits.length === 0) {
      for (const cluster of buildHotClusterRecall(query)) {
        hits.push({
          id: cluster.clusterKey,
          chunkId: cluster.clusterKey,
          filePath: cluster.filePath,
          source: 'som_topology',
          text: cluster.summary,
          score: cluster.score,
          tags: cluster.topTags,
          metadata: {
            topoClass,
            source: 'cluster-tags-cache',
            clusterKey: cluster.clusterKey,
            fileCount: cluster.fileCount,
            summary: cluster.summary,
            purpose: cluster.purpose,
            riskLevel: cluster.riskLevel,
            protocols: cluster.protocols,
            storedTopoClasses: cluster.topoClasses,
          },
        });
      }
    }

    return { lane: 'som_topology', degraded: false, latencyMs: Date.now() - t0, hits };
  } catch (err) {
    return degraded('som_topology', String(err), Date.now() - t0);
  }
}

async function runQdrantVectorLane(
  query: string,
  embedding: number[] | null,
  topK: number
): Promise<RetrievalLaneResult> {
  const t0 = Date.now();
  if (!embedding) return { lane: 'qdrant_vector', degraded: false, latencyMs: 0, hits: [] };
  try {
    const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
    const res = await qdrant.hybridSearch({
      collection: qdrant.collections.codebase_chunks,
      query,
      queryEmbedding: embedding,
      limit: topK,
    });

    const hits: ContextHit[] = res.results.map((r) => ({
      id: String(r.id),
      chunkId: String(r.payload?.stable_key ?? r.id),
      filePath: String(r.payload?.path ?? ''),
      source: 'qdrant_vector',
      text: String(r.payload?.content ?? ''),
      score: r.score,
      metadata: r.payload as Record<string, unknown>,
    }));

    return { lane: 'qdrant_vector', degraded: false, latencyMs: Date.now() - t0, hits };
  } catch (err) {
    return degraded('qdrant_vector', String(err), Date.now() - t0);
  }
}

async function runSummaryLensesLane(
  query: string,
  embedding: number[] | null,
  topK: number
): Promise<RetrievalLaneResult> {
  const t0 = Date.now();
  if (!embedding) return { lane: 'summary_lenses', degraded: false, latencyMs: 0, hits: [] };
  try {
    const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
    const res = await qdrant.hybridSearch({
      collection: qdrant.collections.summary_lenses,
      query,
      queryEmbedding: embedding,
      limit: topK,
    });

    const hits: ContextHit[] = res.results.map((r) => ({
      id: String(r.id),
      chunkId: String(r.payload?.stable_key ?? r.id),
      filePath: String(r.payload?.file_path ?? ''),
      source: 'summary_lenses',
      text: String(r.payload?.summary ?? r.payload?.content ?? ''),
      score: r.score,
      metadata: r.payload as Record<string, unknown>,
    }));

    return { lane: 'summary_lenses', degraded: false, latencyMs: Date.now() - t0, hits };
  } catch (err) {
    return degraded('summary_lenses', String(err), Date.now() - t0);
  }
}

export function mergeContextHits(lanes: RetrievalLaneResult[]): ContextHit[] {
  const byFile = new Map<string, ContextHit>();
  const noFile: ContextHit[] = [];

  for (const lane of lanes) {
    if (lane.degraded) continue;
    const weight = LANE_WEIGHTS[lane.lane] ?? 1.0;
    for (const hit of lane.hits) {
      const weighted = hit.score * weight;
      const key = hit.filePath;
      if (key) {
        const existing = byFile.get(key);
        if (!existing || existing.score < weighted) {
          byFile.set(key, { ...hit, score: weighted });
        }
      } else {
        noFile.push({ ...hit, score: weighted });
      }
    }
  }

  const all = [...byFile.values(), ...noFile];
  all.sort((a, b) => b.score - a.score);
  return all.slice(0, 20);
}

export function extractTopFiles(merged: ContextHit[]): string[] {
  const freq = new Map<string, number>();
  for (const hit of merged) {
    if (hit.filePath) {
      freq.set(hit.filePath, (freq.get(hit.filePath) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path]) => path);
}

export function extractTopSymbols(merged: ContextHit[]): string[] {
  const freq = new Map<string, number>();
  for (const hit of merged) {
    if (hit.symbol) {
      freq.set(hit.symbol, (freq.get(hit.symbol) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sym]) => sym);
}

export async function runRetrievalLanes(opts: {
  query: string;
  pool: Pool;
  redis?: Redis;
  caseId?: string;
  filePath?: string;
  topK?: number;
}): Promise<MultiLaneOutput> {
  const t0 = Date.now();
  const { query, pool, redis, topK = 10 } = opts;

  // Generate embedding once for all vector lanes
  const { generateSingleEmbedding } = await import('$lib/server/grpc/embedding-client.js');
  const embedding = await generateSingleEmbedding(query).catch(() => null);

  const settled = await Promise.allSettled([
    runRedisAceLane(redis, query, topK),
    runPostgresTrigramLane(pool, query, topK),
    runAstSymbolLane(redis, query),
    runSomTopologyLane(redis, query),
    runQdrantVectorLane(query, embedding, topK),
    runSummaryLensesLane(query, embedding, topK),
  ]);

  const lanes: RetrievalLaneResult[] = settled.map((result, i) => {
    const names: RetrievalLaneName[] = [
      'redis_ace',
      'postgres_trigram',
      'ast_symbol',
      'som_topology',
      'qdrant_vector',
      'summary_lenses',
    ];
    if (result.status === 'fulfilled') return result.value;
    return degraded(names[i], String(result.reason));
  });

  const merged = mergeContextHits(lanes);
  const topFiles = extractTopFiles(merged);
  const topSymbols = extractTopSymbols(merged);
  const hotClusters = buildHotClusterRecall(query);
  const totalHits = lanes.reduce((n, l) => n + l.hits.length, 0);

  return {
    lanes,
    merged,
    topFiles,
    topSymbols,
    hotClusters,
    totalHits,
    durationMs: Date.now() - t0,
  };
}

export async function writeRetrievalTrace(
  runDir: string,
  output: MultiLaneOutput,
  query: string
): Promise<void> {
  mkdirSync(runDir, { recursive: true });

  writeFileSync(
    `${runDir}/retrieval_trace.json`,
    JSON.stringify(output, null, 2),
    'utf-8'
  );

  const lines: string[] = [
    `# Retrieval Trace`,
    ``,
    `**Query**: ${query}`,
    `**Duration**: ${output.durationMs}ms`,
    `**Total hits**: ${output.totalHits}`,
    ``,
    `## Lane Summary`,
    ``,
  ];

  for (const lane of output.lanes) {
    const status = lane.degraded ? `DEGRADED (${lane.reason})` : `OK (${lane.hits.length} hits, ${lane.latencyMs}ms)`;
    lines.push(`- **${lane.lane}**: ${status}`);
  }

  if (output.topFiles.length > 0) {
    lines.push(``, `## Top Files`, ``);
    for (const f of output.topFiles) lines.push(`- \`${f}\``);
  }

  if (output.hotClusters.length > 0) {
    lines.push(``, `## Hot Cluster Recall`, ``);
    for (const cluster of output.hotClusters.slice(0, 3)) {
      const fileLabel = cluster.filePath ? ` — \`${cluster.filePath}\`` : '';
      const tags = cluster.topTags.length > 0 ? ` | tags: ${cluster.topTags.join(', ')}` : '';
      lines.push(`- [${cluster.clusterKey}] ${cluster.summary}${fileLabel}${tags}`);
    }
  }

  if (output.merged.length > 0) {
    lines.push(``, `## Top Hits`, ``);
    for (const hit of output.merged.slice(0, 10)) {
      const loc = hit.filePath ? `\`${hit.filePath}\`` : hit.id;
      const snippet = hit.text ? hit.text.slice(0, 200).replace(/\n/g, ' ') : '';
      lines.push(`### ${loc} (score=${hit.score.toFixed(3)}, source=${hit.source})`);
      if (snippet) lines.push(``, snippet, ``);
    }
  }

  writeFileSync(`${runDir}/context_packet.md`, lines.join('\n'), 'utf-8');
}
