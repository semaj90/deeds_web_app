#!/usr/bin/env npx tsx
/**
 * run-pagerank.ts — Standalone CouchDB PageRank runner.
 *
 * Reads the link_matrix view from CouchDB, runs power-iteration PageRank,
 * writes scores back to each CouchDB doc AND caches in Redis at
 * 'couchdb:pagerank_scores' (JSON string, 6h TTL) so run-hypergraph.ts
 * can hydrate node grades.
 *
 * If CouchDB link_matrix is empty (imports not extracted), falls back to
 * reading Neo4j IMPORTS relationships to rebuild edges in CouchDB.
 *
 * Usage:
 *   npx tsx scripts/run-pagerank.ts [--skip-couch-write]
 */

import 'dotenv/config';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { pageRankGPU } from '../src/lib/server/gpu/pytorch-graph.js';

const COUCHDB_URL   = process.env.COUCHDB_URL  ?? 'http://admin:legal_ai_pass@127.0.0.1:5984';
const REDIS_URL     = process.env.REDIS_URL     ?? 'redis://127.0.0.1:6379';
const REDIS_PASS    = process.env.REDIS_PASSWORD ?? 'redis';
const NEO4J_URL     = process.env.NEO4J_URL     ?? 'bolt://127.0.0.1:7687';
const NEO4J_USER    = process.env.NEO4J_USER    ?? 'neo4j';
const NEO4J_PASS    = process.env.NEO4J_PASSWORD ?? 'legal_ai_pass';
const SKIP_WRITE    = process.argv.includes('--skip-couch-write');

const DAMPING   = 0.85;
const MAX_ITER  = 100;
const TOLERANCE = 1e-6;
const REDIS_TTL = 6 * 3600;
const REDIS_META_KEY = 'couchdb:pagerank_scores:meta';
const GPU_MAX_NODES = Number(process.env.PAGERANK_GPU_MAX_NODES ?? '4096');
const FORCE_REFRESH =
  process.argv.includes('--force-refresh') ||
  process.argv.includes('--refresh') ||
  process.env.PAGERANK_FORCE_REFRESH === '1' ||
  process.env.PAGERANK_FORCE_REFRESH === 'true';
const SKIP_COUCH_WRITE =
  process.argv.includes('--skip-couch-write') ||
  process.env.PAGERANK_SKIP_COUCH_WRITE === '1' ||
  process.env.PAGERANK_SKIP_COUCH_WRITE === 'true';

// Strip credentials from URL for fetch
function parseCouchUrl(rawUrl: string): { baseUrl: string; auth: Record<string, string> } {
  try {
    const u = new URL(rawUrl);
    const auth: Record<string, string> = {};
    if (u.username) {
      auth['Authorization'] = `Basic ${btoa(`${u.username}:${u.password}`)}`;
      u.username = '';
      u.password = '';
    }
    return { baseUrl: u.toString().replace(/\/$/, ''), auth };
  } catch {
    return { baseUrl: rawUrl, auth: {} };
  }
}

const { baseUrl: COUCH_BASE, auth: COUCH_AUTH } = parseCouchUrl(COUCHDB_URL);
const DB = 'codebase_graph';

const redis = new Redis(REDIS_URL, { password: REDIS_PASS, lazyConnect: true });
redis.on('error', () => {});

// ── Load edges from CouchDB link_matrix view ──────────────────────────────────

interface Edge { source: string; target: string }

interface CachedPageRankMeta {
  graphHash: string;
  source: 'gpu' | 'cpu';
  nodes: number;
  edges: number;
  generatedAt: string;
}

async function loadEdgesFromCouchDB(): Promise<Edge[]> {
  const res = await fetch(
    `${COUCH_BASE}/${DB}/_design/codebase_graph/_view/link_matrix?reduce=false`,
    { headers: { Accept: 'application/json', ...COUCH_AUTH }, signal: AbortSignal.timeout(30_000) }
  );
  if (!res.ok) throw new Error(`CouchDB link_matrix failed: ${res.status}`);
  const data = await res.json() as { rows?: Array<{ key: [string, string] }> };
  return (data.rows ?? []).map(r => ({ source: r.key[0], target: r.key[1] }));
}

function buildGraphHash(edges: Edge[]): string {
  const digest = createHash('sha256');
  const sorted = [...edges]
    .map((e) => `${e.source}→${e.target}`)
    .sort();
  for (const entry of sorted) digest.update(entry).update('\n');
  return digest.digest('hex');
}

// ── Fallback: load edges from Neo4j IMPORTS relationships ─────────────────────

async function loadEdgesFromNeo4j(): Promise<Edge[]> {
  console.log('[pr] Fallback: loading IMPORTS edges from Neo4j...');
  let neo4j: typeof import('neo4j-driver');
  try {
    neo4j = await import('neo4j-driver');
  } catch {
    throw new Error('neo4j-driver not available — cannot fall back to Neo4j');
  }

  const driver = neo4j.default.driver(
    NEO4J_URL,
    neo4j.default.auth.basic(NEO4J_USER, NEO4J_PASS)
  );
  const session = driver.session({ database: 'neo4j' });
  const edges: Edge[] = [];

  try {
    const result = await session.run(
      `MATCH (a:CodebaseFile)-[:IMPORTS]->(b:CodebaseFile)
       RETURN a.filePath AS src, b.filePath AS tgt
       LIMIT 50000`
    );
    for (const rec of result.records) {
      const src = rec.get('src') as string | null;
      const tgt = rec.get('tgt') as string | null;
      if (src && tgt) edges.push({ source: src, target: tgt });
    }
  } finally {
    await session.close();
    await driver.close();
  }

  console.log(`[pr] Neo4j: ${edges.length} IMPORTS edges loaded.`);
  return edges;
}

// ── Write Neo4j edges back to CouchDB (re-populates link_matrix view) ─────────

async function writeEdgesToCouchDB(edges: Edge[]): Promise<void> {
  console.log('[pr] Writing edges to CouchDB codebase_graph...');

  // Group by source
  const bySource = new Map<string, string[]>();
  for (const e of edges) {
    if (!bySource.has(e.source)) bySource.set(e.source, []);
    bySource.get(e.source)!.push(e.target);
  }

  const nodes = [...bySource.entries()].map(([id, imports]) => ({ id, imports }));

  // Fetch existing _revs
  const ids = nodes.map(n => n.id);
  const revMap = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const res = await fetch(`${COUCH_BASE}/${DB}/_all_docs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...COUCH_AUTH },
      body: JSON.stringify({ keys: batch }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json() as { rows?: Array<{ id: string; value?: { rev: string } }> };
      for (const row of data.rows ?? []) {
        if (row.value?.rev) revMap.set(row.id, row.value.rev);
      }
    }
  }

  // Bulk write
  let written = 0;
  for (let i = 0; i < nodes.length; i += 200) {
    const batch = nodes.slice(i, i + 200);
    const docs = batch.map(n => {
      const doc: Record<string, unknown> = {
        _id:      n.id,
        type:     'codebase_file',
        filePath: n.id,
        imports:  n.imports,
        updatedAt: new Date().toISOString(),
      };
      const rev = revMap.get(n.id);
      if (rev) doc._rev = rev;
      return doc;
    });

    const res = await fetch(`${COUCH_BASE}/${DB}/_bulk_docs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...COUCH_AUTH },
      body: JSON.stringify({ docs }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);

    if (res?.ok) {
      const results = await res.json() as Array<{ ok?: boolean }>;
      written += results.filter(r => r.ok).length;
    }

    process.stdout.write(`\r[pr] Wrote ${Math.min(i + 200, nodes.length)}/${nodes.length} nodes...`);
  }
  console.log(`\n[pr] CouchDB: wrote ${written} nodes with imports.`);
}

// ── Power-iteration PageRank ──────────────────────────────────────────────────

function computePageRank(edges: Edge[]): Map<string, number> {
  const nodes  = new Set<string>();
  const outDeg = new Map<string, number>();
  const preds  = new Map<string, string[]>();

  for (const e of edges) {
    nodes.add(e.source);
    nodes.add(e.target);
    outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
    if (!preds.has(e.target)) preds.set(e.target, []);
    preds.get(e.target)!.push(e.source);
  }

  const N = nodes.size;
  const nodeArr = [...nodes];
  const rank = new Map<string, number>(nodeArr.map(n => [n, 1 / N]));
  const dangling = nodeArr.filter(n => !outDeg.has(n));

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const danglingSum  = dangling.reduce((s, n) => s + (rank.get(n) ?? 0), 0);
    const danglingShare = DAMPING * danglingSum / N;
    const newRank = new Map<string, number>();
    let delta = 0;

    for (const node of nodeArr) {
      let score = (1 - DAMPING) / N + danglingShare;
      for (const pred of (preds.get(node) ?? [])) {
        score += DAMPING * (rank.get(pred) ?? 0) / (outDeg.get(pred) ?? 1);
      }
      newRank.set(node, score);
      delta = Math.max(delta, Math.abs(score - (rank.get(node) ?? 0)));
    }
    for (const [n, s] of newRank) rank.set(n, s);
    if (delta < TOLERANCE) {
      console.log(`[pr] Converged in ${iter + 1} iterations (delta=${delta.toExponential(2)})`);
      break;
    }
  }

  // Normalise to 0–1
  const maxScore = Math.max(...rank.values());
  if (maxScore > 0) for (const [n, s] of rank) rank.set(n, s / maxScore);
  return rank;
}

function buildAdjacencyMatrix(edges: Edge[], nodeOrder: string[]): Float32Array {
  const index = new Map(nodeOrder.map((node, i) => [node, i]));
  const n = nodeOrder.length;
  const adj = new Float32Array(n * n);
  for (const edge of edges) {
    const src = index.get(edge.source);
    const dst = index.get(edge.target);
    if (src == null || dst == null) continue;
    adj[src * n + dst] += 1;
  }
  return adj;
}

async function computePageRankHybrid(edges: Edge[]): Promise<{ scores: Map<string, number>; source: 'gpu' | 'cpu' }> {
  const nodes = [...new Set(edges.flatMap((e) => [e.source, e.target]))];
  if (nodes.length === 0) return { scores: new Map(), source: 'cpu' };

  const canTryGpu = nodes.length <= GPU_MAX_NODES;
  if (canTryGpu) {
    try {
      const adj = buildAdjacencyMatrix(edges, nodes);
      const { scores, source } = pageRankGPU(adj, nodes.length, DAMPING, MAX_ITER);
      const out = new Map<string, number>();
      for (let i = 0; i < nodes.length; i++) out.set(nodes[i], scores[i] ?? 0);
      return { scores: out, source };
    } catch (err) {
      console.warn('[pr] GPU PageRank failed, falling back to CPU:', (err as Error).message);
    }
  } else {
    console.log(`[pr] Graph has ${nodes.length} nodes — skipping GPU matrix build (limit ${GPU_MAX_NODES}).`);
  }

  return { scores: computePageRank(edges), source: 'cpu' };
}

// ── Persist scores to Redis ───────────────────────────────────────────────────

async function cacheInRedis(scores: Map<string, number>): Promise<void> {
  const obj = Object.fromEntries(scores);
  await redis.setex('couchdb:pagerank_scores', REDIS_TTL, JSON.stringify(obj));
  console.log(`[pr] Cached ${scores.size} scores in Redis (TTL=${REDIS_TTL}s).`);
}

async function cacheMetaInRedis(meta: CachedPageRankMeta): Promise<void> {
  await redis.setex(REDIS_META_KEY, REDIS_TTL, JSON.stringify(meta));
}

async function loadCachedPageRank(graphHash: string): Promise<{ scores: Map<string, number>; meta: CachedPageRankMeta } | null> {
  try {
    const [rawScores, rawMeta] = await Promise.all([
      redis.get('couchdb:pagerank_scores'),
      redis.get(REDIS_META_KEY),
    ]);
    if (!rawScores || !rawMeta) return null;
    const meta = JSON.parse(rawMeta) as CachedPageRankMeta;
    if (meta.graphHash !== graphHash) return null;
    const obj = JSON.parse(rawScores) as Record<string, number>;
    return { scores: new Map(Object.entries(obj)), meta };
  } catch {
    return null;
  }
}

// ── Persist scores back to CouchDB docs ──────────────────────────────────────

async function persistToCouchDB(scores: Map<string, number>): Promise<number> {
  if (SKIP_WRITE) return 0;
  const entries = [...scores.entries()];
  let written = 0;

  for (let i = 0; i < entries.length; i += 100) {
    const batch = entries.slice(i, i + 100);
    const ids = batch.map(([id]) => id);

    const revMap = new Map<string, string>();
    const allDocsRes = await fetch(`${COUCH_BASE}/${DB}/_all_docs`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...COUCH_AUTH },
      body:    JSON.stringify({ keys: ids }),
    }).catch(() => null);
    if (allDocsRes?.ok) {
      const data = await allDocsRes.json() as { rows?: Array<{ id: string; value?: { rev: string } }> };
      for (const row of data.rows ?? []) {
        if (row.value?.rev) revMap.set(row.id, row.value.rev);
      }
    }

    const docs = batch.map(([id, score]) => {
      const doc: Record<string, unknown> = { _id: id, pagerank_score_couchdb: score };
      const rev = revMap.get(id);
      if (rev) doc._rev = rev;
      return doc;
    });

    const bulkRes = await fetch(`${COUCH_BASE}/${DB}/_bulk_docs`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...COUCH_AUTH },
      body:    JSON.stringify({ docs }),
    }).catch(() => null);

    if (bulkRes?.ok) written += batch.length;
    process.stdout.write(`\r[pr] Persisting scores ${Math.min(i + 100, entries.length)}/${entries.length}...`);
  }
  console.log('');
  return written;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();

  await redis.ping();
  console.log('[pr] Redis connected.');

  // Load edges
  let edgeSource: 'couchdb' | 'neo4j' = 'couchdb';
  let edges = await loadEdgesFromCouchDB().catch(() => [] as Edge[]);
  console.log(`[pr] CouchDB link_matrix: ${edges.length} edges.`);

  if (edges.length === 0) {
    // Fallback: load from Neo4j and repopulate CouchDB
    edges = await loadEdgesFromNeo4j();
    edgeSource = 'neo4j';
    if (edges.length > 0) {
      console.log('[pr] Neo4j fallback will republish to CouchDB if the graph is recomputed.');
    }
  }

  if (edges.length === 0) {
    console.error('[pr] No edges available — run neo4j_sync first.');
    process.exit(1);
  }

  const graphHash = buildGraphHash(edges);
  const cached = FORCE_REFRESH ? null : await loadCachedPageRank(graphHash);
  let scores: Map<string, number>;
  let source: 'gpu' | 'cpu';
  let usedCache = false;
  const shouldRepublishEdges = edgeSource === 'neo4j' && !SKIP_COUCH_WRITE;

  if (cached) {
    scores = cached.scores;
    source = cached.meta.source;
    usedCache = true;
    console.log(`[pr] Cache hit for graph ${graphHash.slice(0, 12)} (${scores.size} scores, source=${source}).`);
    await cacheMetaInRedis(cached.meta);
    if (shouldRepublishEdges) {
      console.log('[pr] Graph hash matched cached scores — skipping CouchDB republish.');
    }
  } else {
    if (shouldRepublishEdges) {
      console.log('[pr] Republishing Neo4j edges to CouchDB before authority writeback.');
    }
    // Compute PageRank
    console.log(`[pr] Computing PageRank on ${edges.length} edges...`);
    const computed = await computePageRankHybrid(edges);
    scores = computed.scores;
    source = computed.source;
    console.log(`[pr] PageRank path: ${source.toUpperCase()} bridge.`);
    await cacheMetaInRedis({
      graphHash,
      source,
      nodes: scores.size,
      edges: edges.length,
      generatedAt: new Date().toISOString(),
    });
    await cacheInRedis(scores);
    if (shouldRepublishEdges) {
      await writeEdgesToCouchDB(edges);
    }
  }

  // Top 10
  const top10 = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('[pr] Top 10 files by PageRank:');
  for (const [path, score] of top10) {
    console.log(`  ${score.toFixed(3)}  ${path}`);
  }

  // Persist fresh results back to CouchDB only when we actually recomputed.
  const written = usedCache ? 0 : await persistToCouchDB(scores);
  if (!SKIP_COUCH_WRITE && !usedCache) console.log(`[pr] Persisted ${written} scores to CouchDB.`);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[pr] Done in ${elapsed}s — ${scores.size} nodes scored.`);

  redis.disconnect();
}

main().catch(err => {
  console.error('[pr] Fatal:', err);
  process.exit(1);
});
