/**
 * smoke-neo4j-graph-enrich.mjs
 *
 * 10-gate smoke test for the graphify:gds pipeline.
 * Reads live state from Neo4j, Qdrant, Redis, and the filesystem —
 * does NOT mutate any state.
 *
 * Usage:
 *   node scripts/smoke-neo4j-graph-enrich.mjs
 *   node scripts/smoke-neo4j-graph-enrich.mjs --verbose
 *   node scripts/smoke-neo4j-graph-enrich.mjs --json
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis  from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const VERBOSE = process.argv.includes('--verbose');
const JSON_OUT = process.argv.includes('--json');

// ── Config ────────────────────────────────────────────────────────────────────

function resolveNeo4jHttpUrl() {
  const raw = String(process.env.NEO4J_HTTP ?? process.env.NEO4J_URI ?? process.env.NEO4J_URL ?? '').trim();
  if (!raw) return 'http://127.0.0.1:7474';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString().replace(/\/$/, '');
    if (parsed.protocol === 'bolt:' || parsed.protocol === 'neo4j:') {
      return `http://${parsed.hostname || '127.0.0.1'}:7474`;
    }
  } catch {
    // fall through to the default browser endpoint
  }
  return 'http://127.0.0.1:7474';
}

const NEO4J_URL  = resolveNeo4jHttpUrl();
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';

const QDRANT_URL  = process.env.QDRANT_URL  ?? 'http://localhost:6333';
const REDIS_URL   = process.env.REDIS_URL   ?? 'redis://127.0.0.1:6379';

const COLLECTION  = 'codebase_chunks_768';
const AUTHORITY_HASH = 'ace:authority:top';
const SUMMARY_DIR = resolve(__dirname, '../memory/graphify/gds');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function neo4jQuery(cypher, params = {}) {
  const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}`,
    },
    body: JSON.stringify({ statements: [{ statement: cypher, parameters: params }] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors.map(e => e.message).join('; '));
  return data.results?.[0]?.data ?? [];
}

async function qdrantQuery(path, body) {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    method:  body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body:    body ? JSON.stringify(body) : undefined,
    signal:  AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Qdrant HTTP ${res.status}`);
  return res.json();
}

// ── Gate runner ───────────────────────────────────────────────────────────────

const results = [];

async function gate(id, description, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - start;
    results.push({ id, description, status: 'PASS', detail: detail ?? '', ms });
    if (!JSON_OUT) {
      const det = detail ? ` — ${detail}` : '';
      console.log(`  PASS ${id}: ${description}${det}`);
    }
  } catch (err) {
    const ms = Date.now() - start;
    const isWarn = err.message?.startsWith('WARN:');
    const status = isWarn ? 'WARN' : 'FAIL';
    const msg = isWarn ? err.message.slice(5).trim() : err.message;
    results.push({ id, description, status, detail: msg, ms });
    if (!JSON_OUT) {
      console.log(`  ${status} ${id}: ${description} — ${msg}`);
    }
  }
}

// ── Gates ─────────────────────────────────────────────────────────────────────

console.log('\n=== Smoke: graphify:gds ===\n');

/* GDS1 — Neo4j reachable */
await gate('GDS1', 'Neo4j reachable', async () => {
  const rows = await neo4jQuery('RETURN 1 AS n');
  if (!rows.length) throw new Error('empty response');
  return 'OK';
});

/* GDS2 — GDS plugin available (WARN if missing — pipeline has Postgres fallback) */
await gate('GDS2', 'GDS plugin available', async () => {
  // gds.version() YIELD syntax removed in GDS 2.x; use gds.debug.sysInfo() instead
  const rows = await neo4jQuery(
    "CALL gds.debug.sysInfo() YIELD key, value WHERE key = 'gdsVersion' RETURN value AS version"
  );
  const ver = rows[0]?.row?.[0] ?? rows[0]?.data?.[0]?.row?.[0];
  if (!ver) throw new Error('WARN: GDS not installed — Postgres fan-in fallback active');
  return `version ${ver}`;
});

/* GDS3 — codeGraph named projection has ≥1 node */
await gate('GDS3', 'codeGraph named projection exists', async () => {
  const rows = await neo4jQuery(
    "CALL gds.graph.exists('codeGraph') YIELD exists RETURN exists"
  );
  const exists = rows[0]?.row?.[0] ?? rows[0]?.data?.[0]?.row?.[0];
  if (!exists) throw new Error('WARN: codeGraph projection not found — run graphify:gds first');
  // GDS 2.x: gds.graph.list() with WHERE clause (no positional arg filter)
  const cnt = await neo4jQuery(
    "CALL gds.graph.list() YIELD graphName, nodeCount WHERE graphName = 'codeGraph' RETURN nodeCount"
  );
  const n = cnt[0]?.row?.[0] ?? cnt[0]?.data?.[0]?.row?.[0] ?? 0;
  if (n < 10) throw new Error(`WARN: codeGraph has only ${n} nodes`);
  return `${n} nodes`;
});

/* GDS4 — graphPageRank written to at least 25 CodebaseFile nodes */
await gate('GDS4', 'graphPageRank scores present on CodebaseFile nodes', async () => {
  // Pipeline writes property as graphPageRank (not pagerank)
  const rows = await neo4jQuery(
    'MATCH (n:CodebaseFile) WHERE n.graphPageRank IS NOT NULL RETURN count(n) AS cnt, max(n.graphPageRank) AS mx'
  );
  const cnt = rows[0]?.row?.[0] ?? rows[0]?.data?.[0]?.row?.[0] ?? 0;
  if (cnt < 25) throw new Error(`only ${cnt} nodes with graphPageRank (need ≥25) — run graphify:gds`);
  const mx = (rows[0]?.row?.[1] ?? rows[0]?.data?.[0]?.row?.[1] ?? 0).toFixed(4);
  return `${cnt} nodes, max=${mx}`;
});

/* GDS5 — Louvain communityId written to at least 10 CodebaseFile nodes */
await gate('GDS5', 'Louvain communityId present on CodebaseFile nodes', async () => {
  const rows = await neo4jQuery(
    'MATCH (n:CodebaseFile) WHERE n.communityId IS NOT NULL RETURN count(n) AS cnt'
  );
  const cnt = rows[0]?.row?.[0] ?? rows[0]?.data?.[0]?.row?.[0] ?? 0;
  if (cnt < 10) throw new Error(`only ${cnt} nodes with communityId (need ≥10) — run graphify:gds`);
  const communities = await neo4jQuery(
    'MATCH (n:CodebaseFile) WHERE n.communityId IS NOT NULL RETURN count(DISTINCT n.communityId) AS c'
  );
  const numComm = communities[0]?.row?.[0] ?? communities[0]?.data?.[0]?.row?.[0] ?? 0;
  return `${cnt} nodes, ${numComm} communities`;
});

/* GDS6 — graphAuthorityScore written to at least 25 CodebaseFile nodes */
await gate('GDS6', 'graphAuthorityScore present on CodebaseFile nodes', async () => {
  const rows = await neo4jQuery(
    'MATCH (n:CodebaseFile) WHERE n.graphAuthorityScore IS NOT NULL AND n.graphAuthorityScore > 0 RETURN count(n) AS cnt'
  );
  const cnt = rows[0]?.row?.[0] ?? rows[0]?.data?.[0]?.row?.[0] ?? 0;
  if (cnt < 25) throw new Error(`only ${cnt} nodes with graphAuthorityScore>0 (need ≥25) — run graphify:gds`);
  const top = await neo4jQuery(
    'MATCH (n:CodebaseFile) WHERE n.graphAuthorityScore IS NOT NULL RETURN max(n.graphAuthorityScore) AS mx'
  );
  const mx = (top[0]?.row?.[0] ?? top[0]?.data?.[0]?.row?.[0] ?? 0).toFixed(4);
  return `${cnt} nodes, max=${mx}`;
});

/* GDS7 — Qdrant codebase_chunks_768 has graphAuthorityScore in payloads */
await gate('GDS7', 'Qdrant payloads contain graphAuthorityScore', async () => {
  const resp = await qdrantQuery(`/collections/${COLLECTION}/points/scroll`, {
    filter: {
      must: [{ key: 'graphAuthorityScore', range: { gt: 0 } }]
    },
    limit: 5,
    with_payload: ['graphAuthorityScore', 'communityId'],
    with_vector: false,
  });
  const pts = resp.result?.points ?? [];
  if (pts.length === 0) throw new Error('no Qdrant points with graphAuthorityScore — run graphify:gds');
  const sample = pts[0]?.payload?.graphAuthorityScore?.toFixed(4) ?? '?';
  const hasCommunity = pts.some(p => p.payload?.communityId != null);
  return `≥${pts.length} points patched; sample score=${sample}${hasCommunity ? ', communityId present' : ''}`;
});

/* GDS8 — Redis ace:authority:top HASH populated */
await gate('GDS8', 'Redis ace:authority:top HASH populated', async () => {
  let redis;
  try {
    redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000, enableReadyCheck: false });
    await redis.connect();
    const len = await redis.hlen(AUTHORITY_HASH);
    if (len === 0) throw new Error(`ace:authority:top is empty — run graphify:gds`);
    const ttl = await redis.ttl(AUTHORITY_HASH);
    const ttlStr = ttl > 0 ? `TTL=${ttl}s` : 'no-TTL';
    return `${len} entries, ${ttlStr}`;
  } finally {
    await redis?.quit().catch(() => {});
  }
});

/* GDS9 — Degraded mode: pipeline completes even without GDS */
await gate('GDS9', 'Degraded mode: Postgres fan-in fallback query works', async () => {
  // This gate simply checks that the Postgres code_relations table exists and has edges.
  // It doesn't require the app server — just that the enrichment script can fall back.
  const { default: pg } = await import('pg');
  const DB_URL = process.env.DATABASE_URL;
  if (!DB_URL) throw new Error('WARN: DATABASE_URL not set — cannot verify Postgres fallback');
  const client = new pg.Client({ connectionString: DB_URL, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    const res = await client.query(
      `SELECT COUNT(*) AS cnt FROM code_relations WHERE source_file IS NOT NULL LIMIT 1`
    );
    const cnt = parseInt(res.rows[0]?.cnt ?? 0);
    if (cnt === 0) throw new Error('WARN: code_relations is empty — authority fallback will yield 0 scores');
    return `${cnt} code_relations rows available`;
  } finally {
    await client.end().catch(() => {});
  }
});

/* GDS10 — Summary artifact written to memory/graphify/gds/ */
await gate('GDS10', 'GDS summary artifact exists', async () => {
  const latestPath = resolve(SUMMARY_DIR, 'latest.json');
  if (!existsSync(latestPath)) {
    throw new Error('WARN: memory/graphify/gds/latest.json not found — run graphify:gds once');
  }
  const raw = readFileSync(latestPath, 'utf8');
  const data = JSON.parse(raw);
  const tsField = data.finishedAt ?? data.startedAt ?? data.runAt;
  const age = tsField ? Math.round((Date.now() - new Date(tsField).getTime()) / 1000 / 60) : '?';
  // latest.json uses authorityScoresComputed, not nodesUpdated
  const nodesUpdated = data.authorityScoresComputed ?? data.nodesUpdated ?? data.nodes_updated ?? '?';
  const qdrantPatched = data.qdrantPatched ?? data.qdrant_patched ?? '?';
  return `${nodesUpdated} nodes, ${qdrantPatched} Qdrant pts, age=${age}min`;
});

// ── Summary ───────────────────────────────────────────────────────────────────

const passed  = results.filter(r => r.status === 'PASS').length;
const warned  = results.filter(r => r.status === 'WARN').length;
const failed  = results.filter(r => r.status === 'FAIL').length;
const total   = results.length;

if (JSON_OUT) {
  console.log(JSON.stringify({ summary: { passed, warned, failed, total }, gates: results }, null, 2));
} else {
  console.log('');
  if (failed === 0 && warned === 0) {
    console.log(`${passed}/${total} gates passed`);
  } else {
    console.log(`${passed}/${total} gates passed, ${warned} warn, ${failed} fail`);
  }
  console.log('');
}

process.exit(failed > 0 ? 1 : 0);
