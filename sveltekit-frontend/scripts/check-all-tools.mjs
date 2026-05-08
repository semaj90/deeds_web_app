#!/usr/bin/env node
/**
 * check-all-tools.mjs
 *
 * Full-stack health probe: Neo4j · Qdrant · Redis · CouchDB · MCP TRACE ·
 * Postgres · Ollama · PageRank · Authority scores · KAG wiki notes ·
 * Deep-import graph · Synthesis run · GRPO wire · tsgo audit.
 *
 * Runs all checks concurrently where safe, logs JSON + human summary,
 * wires results into Redis for ACE/Gemma4 orchestration.
 *
 * Usage:
 *   node scripts/check-all-tools.mjs
 *   node scripts/check-all-tools.mjs --json            # machine-readable only
 *   node scripts/check-all-tools.mjs --fix             # attempt auto-fixes
 *   node scripts/check-all-tools.mjs --no-redis-wire   # skip Redis write
 */

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
// Load .env so COUCHDB_URL, DATABASE_URL, etc. are available when run directly
try {
  const { config } = await import('dotenv');
  config();
} catch { /* dotenv optional */ }
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');

const JSON_MODE   = process.argv.includes('--json');
const AUTO_FIX    = process.argv.includes('--fix');
const NO_WIRE     = process.argv.includes('--no-redis-wire');
const T0          = Date.now();

// ── Config (from env / defaults) ─────────────────────────────────────────────

const NEO4J_URL   = process.env.NEO4J_URL       ?? 'http://localhost:7474';
const NEO4J_USER  = process.env.NEO4J_USER      ?? 'neo4j';
const NEO4J_PASS  = process.env.NEO4J_PASSWORD  ?? process.env.NEO4J_PASS ?? 'neo4j123';
const QDRANT_URL  = process.env.QDRANT_URL      ?? 'http://127.0.0.1:6333';
const REDIS_URL   = process.env.REDIS_URL       ?? 'redis://127.0.0.1:6379';
// Parse credentials from COUCHDB_URL (http://user:pass@host) if set, otherwise use separate vars
const _rawCouchUrl = process.env.COUCHDB_URL ?? '';
const _couchCredsMatch = _rawCouchUrl.match(/^(https?:\/\/)([^:]+):([^@]+)@(.+)$/);
const COUCH_URL   = _couchCredsMatch
  ? `${_couchCredsMatch[1]}${_couchCredsMatch[4]}`
  : (_rawCouchUrl || 'http://127.0.0.1:5984');
const COUCH_USER  = process.env.COUCHDB_USER     ?? process.env.COUCH_USER     ?? _couchCredsMatch?.[2] ?? 'admin';
const COUCH_PASS  = process.env.COUCHDB_PASSWORD ?? process.env.COUCH_PASS     ?? _couchCredsMatch?.[3] ?? 'admin';
const OLLAMA_URL  = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const MCP_URL     = `http://${process.env.TRACE_MCP_HOST ?? '127.0.0.1'}:${process.env.TRACE_MCP_PORT ?? '8788'}`;
const DB_URL      = process.env.DATABASE_URL;

// ── Result store ─────────────────────────────────────────────────────────────

const checks = [];
let passed = 0, warned = 0, failed = 0;

function record(category, name, status, detail, ms, fix) {
  if (status === 'PASS')  passed++;
  if (status === 'WARN')  warned++;
  if (status === 'FAIL')  failed++;
  checks.push({ category, name, status, detail, ms, fix: fix ?? null });
  if (!JSON_MODE) {
    const icon = status === 'PASS' ? '✓' : status === 'WARN' ? '○' : '✗';
    const col  = status === 'PASS' ? '\x1b[32m' : status === 'WARN' ? '\x1b[33m' : '\x1b[31m';
    console.log(`  ${col}${icon}\x1b[0m  [${category}] ${name}${detail ? '  \x1b[2m' + detail + '\x1b[0m' : ''}`);
  }
}

async function probe(category, name, fn, fixHint) {
  const t = Date.now();
  try {
    const detail = await fn();
    record(category, name, 'PASS', detail ?? '', Date.now() - t);
  } catch (err) {
    const msg = String(err.message ?? err);
    const isWarn = msg.startsWith('WARN:');
    record(category, name, isWarn ? 'WARN' : 'FAIL',
           isWarn ? msg.slice(5).trim() : msg, Date.now() - t, fixHint);
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function get(url, opts = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(opts.timeout ?? 5000), ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json().catch(() => res.text());
}

async function post(url, body, opts = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeout ?? 8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json().catch(() => res.text());
}

async function couchGet(path, opts = {}) {
  const auth = Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64');
  return get(`${COUCH_URL}${path}`,
    { ...opts, headers: { Authorization: `Basic ${auth}`, ...(opts.headers ?? {}) } });
}

async function neo4j(cypher) {
  const auth = Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64');
  const r = await post(`${NEO4J_URL}/db/neo4j/tx/commit`,
    { statements: [{ statement: cypher }] },
    { headers: { Authorization: `Basic ${auth}` } });
  if (r.errors?.length) throw new Error(r.errors.map(e => e.message).join('; '));
  return r.results?.[0]?.data ?? [];
}

// ── 1. INFRASTRUCTURE LAYER ───────────────────────────────────────────────────

if (!JSON_MODE) console.log('\n\x1b[1m── 1. Infrastructure\x1b[0m');

await Promise.all([
  probe('infra', 'Neo4j reachable', async () => {
    const r = await neo4j('RETURN 1');
    return 'bolt reachable';
  }, 'docker start legal-ai-neo4j'),

  probe('infra', 'Qdrant reachable', async () => {
    const r = await get(`${QDRANT_URL}/`);
    return `v${r.version ?? '?'}`;
  }, 'docker start qdrant'),

  probe('infra', 'Redis reachable', async () => {
    const { default: Redis } = await import('ioredis');
    const r = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000, enableReadyCheck: false });
    await r.connect();
    const info = await r.info('server');
    const ver = info.match(/redis_version:([^\r\n]+)/)?.[1]?.trim() ?? '?';
    await r.quit().catch(() => {});
    return `v${ver}`;
  }, 'docker start deeds-redis-prod'),

  probe('infra', 'CouchDB reachable', async () => {
    const r = await get(`${COUCH_URL}/`);
    return `v${r.version ?? '?'}`;
  }, 'docker start couchdb'),

  probe('infra', 'Postgres reachable', async () => {
    if (!DB_URL) throw new Error('WARN: DATABASE_URL not set');
    const { default: pg } = await import('pg');
    const c = new pg.Client({ connectionString: DB_URL, connectionTimeoutMillis: 3000 });
    await c.connect();
    const res = await c.query('SELECT version()');
    await c.end();
    return res.rows[0]?.version?.split(' ').slice(0,2).join(' ') ?? 'ok';
  }, 'check DATABASE_URL in .env'),

  probe('infra', 'Ollama reachable', async () => {
    const r = await get(`${OLLAMA_URL}/api/tags`, { timeout: 6000 });
    const n = r.models?.length ?? 0;
    return `${n} models loaded`;
  }, 'ensure ollama is running'),

  probe('infra', 'MCP TRACE server (:8788)', async () => {
    const r = await get(`${MCP_URL}/health`);
    if (!r.ok) throw new Error('not healthy');
    return `uptime=${Math.round(r.uptime ?? 0)}s`;
  }, 'npm run mcp:ensure'),
]);

// ── 2. NEO4J GRAPH LAYER ──────────────────────────────────────────────────────

if (!JSON_MODE) console.log('\n\x1b[1m── 2. Neo4j Graph\x1b[0m');

await Promise.all([
  probe('neo4j', 'GDS plugin (v2.x)', async () => {
    const rows = await neo4j("CALL gds.debug.sysInfo() YIELD key, value WHERE key = 'gdsVersion' RETURN value");
    const ver = rows[0]?.row?.[0] ?? rows[0]?.data?.[0]?.row?.[0];
    if (!ver) throw new Error('WARN: GDS not loaded');
    return `v${ver}`;
  }),

  probe('neo4j', 'codeGraph projection', async () => {
    const rows = await neo4j("CALL gds.graph.list('codeGraph') YIELD graphName, nodeCount, relationshipCount RETURN nodeCount, relationshipCount");
    const nc = rows[0]?.row?.[0] ?? 0;
    if (nc < 100) throw new Error(`only ${nc} nodes — run graphify:gds`);
    return `${nc} nodes, ${rows[0]?.row?.[1] ?? '?'} rels`;
  }, 'npm run graphify:gds'),

  probe('neo4j', 'CodebaseFile nodes with graphPageRank', async () => {
    const rows = await neo4j('MATCH (n:CodebaseFile) WHERE n.graphPageRank IS NOT NULL RETURN count(n) AS c, max(n.graphPageRank) AS mx');
    const c = rows[0]?.row?.[0] ?? 0;
    if (c < 25) throw new Error(`only ${c} nodes — run graphify:gds`);
    return `${c} nodes, max=${(rows[0]?.row?.[1] ?? 0).toFixed(3)}`;
  }),

  probe('neo4j', 'CodebaseFile nodes with communityId', async () => {
    const rows = await neo4j('MATCH (n:CodebaseFile) WHERE n.communityId IS NOT NULL RETURN count(n) AS c, count(DISTINCT n.communityId) AS cc');
    const c = rows[0]?.row?.[0] ?? 0;
    if (c < 10) throw new Error(`only ${c} nodes`);
    return `${c} nodes, ${rows[0]?.row?.[1] ?? '?'} communities`;
  }),

  probe('neo4j', 'CodebaseFile nodes with graphAuthorityScore', async () => {
    const rows = await neo4j('MATCH (n:CodebaseFile) WHERE n.graphAuthorityScore > 0 RETURN count(n) AS c');
    const c = rows[0]?.row?.[0] ?? 0;
    if (c < 25) throw new Error(`only ${c} nodes`);
    return `${c} nodes`;
  }),

  probe('neo4j', 'SOM topology edges (SIMILAR_TOPOLOGY)', async () => {
    const rows = await neo4j('MATCH ()-[r:SIMILAR_TOPOLOGY]->() RETURN count(r) AS c LIMIT 1');
    const c = rows[0]?.row?.[0] ?? 0;
    return c > 0 ? `${c} edges` : 'WARN: no SIMILAR_TOPOLOGY edges — run graphify:topology';
  }),

  probe('neo4j', 'IMPORTS edges', async () => {
    const rows = await neo4j('MATCH ()-[r:IMPORTS]->() RETURN count(r) AS c LIMIT 1');
    const c = rows[0]?.row?.[0] ?? 0;
    if (c < 100) throw new Error(`only ${c} IMPORTS edges`);
    return `${c} edges`;
  }),
]);

// ── 3. QDRANT COLLECTIONS ────────────────────────────────────────────────────

if (!JSON_MODE) console.log('\n\x1b[1m── 3. Qdrant Collections\x1b[0m');

const COLLECTIONS = [
  { name: 'codebase_chunks_768', minPts: 1000 },
  { name: 'legal_documents',     minPts: 1    },
  { name: 'evidence_items',      minPts: 1    },
  { name: 'chat_messages',       minPts: 0    },
  { name: 'embedding_cache',     minPts: 0    },
];

await Promise.all(COLLECTIONS.map(({ name, minPts }) =>
  probe('qdrant', `${name}`, async () => {
    const r = await get(`${QDRANT_URL}/collections/${name}`);
    const pts = r.result?.points_count ?? 0;
    const status = r.result?.status ?? '?';
    if (minPts > 0 && pts < minPts) throw new Error(`only ${pts} points (need ≥${minPts})`);
    if (status !== 'green') throw new Error(`WARN: status=${status}`);
    return `${pts.toLocaleString()} pts, ${status}`;
  }, `run codebase indexer`)
));

// Check graphAuthorityScore coverage in codebase_chunks_768
await probe('qdrant', 'codebase_chunks_768 authority enrichment', async () => {
  const r = await post(`${QDRANT_URL}/collections/codebase_chunks_768/points/count`,
    { filter: { must: [{ key: 'graphAuthorityScore', range: { gt: 0 } }] } },
    { timeout: 30000 });
  const n = r.result?.count ?? 0;
  if (n < 100) throw new Error(`only ${n} enriched points — run neo4j-graph-enrich`);
  return `${n.toLocaleString()} enriched`;
}, 'node scripts/neo4j-graph-enrich.mjs');

// Check SOM cluster coverage
await probe('qdrant', 'codebase_chunks_768 SOM cluster tags', async () => {
  const r = await post(`${QDRANT_URL}/collections/codebase_chunks_768/points/count`, {
    filter: { must: [{ key: 'som_cluster', range: { gte: 0 } }] }
  });
  const n = r.result?.count ?? 0;
  if (n < 100) throw new Error(`WARN: only ${n} SOM-tagged points`);
  return `${n.toLocaleString()} tagged`;
});

// ── 4. REDIS CACHE LAYER ─────────────────────────────────────────────────────

if (!JSON_MODE) console.log('\n\x1b[1m── 4. Redis Cache\x1b[0m');

async function redisCheck(fn) {
  const { default: Redis } = await import('ioredis');
  const r = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000, enableReadyCheck: false });
  await r.connect();
  try { return await fn(r); } finally { await r.quit().catch(() => {}); }
}

await Promise.all([
  probe('redis', 'code:index:manifest (fast-AST)', () => redisCheck(async r => {
    const v = await r.get('code:index:manifest');
    if (!v) throw new Error('missing — run graphify:daily');
    const m = JSON.parse(v);
    return `${m.fileCount} files, mode=${m.mode}`;
  }), 'npm run graphify:daily'),

  probe('redis', 'wiki:note:dir:* KAG notes', () => redisCheck(async r => {
    const keys = await r.keys('wiki:note:dir:*');
    if (keys.length < 10) throw new Error(`only ${keys.length} keys — run graphify:kag-notes`);
    return `${keys.length} keys`;
  }), 'npm run graphify:kag-notes'),

  probe('redis', 'ace:authority:top (authority hash)', () => redisCheck(async r => {
    const n = await r.hlen('ace:authority:top');
    if (n < 10) throw new Error(`only ${n} entries — run graphify:gds`);
    return `${n} entries`;
  })),

  probe('redis', 'nes:cluster_risk:* (GRPO NES cartridge)', () => redisCheck(async r => {
    const keys = await r.keys('nes:cluster_risk:*');
    if (keys.length === 0) throw new Error('WARN: no NES keys — run graph:synthesize + wire:synthesis:grpo');
    return `${keys.length} cluster keys`;
  })),

  probe('redis', 'couchdb:pagerank_scores', () => redisCheck(async r => {
    const v = await r.get('couchdb:pagerank_scores');
    if (!v) throw new Error('WARN: missing — run run:pagerank');
    const scores = JSON.parse(v);
    const n = Object.keys(scores).length;
    return `${n} scores`;
  })),

  probe('redis', 'code:index:tag:* (tag index)', () => redisCheck(async r => {
    const keys = await r.keys('code:index:tag:*');
    if (keys.length < 50) throw new Error(`only ${keys.length} tag keys`);
    return `${keys.length} tag keys`;
  })),
]);

// ── 5. COUCHDB DOCUMENTS ─────────────────────────────────────────────────────

if (!JSON_MODE) console.log('\n\x1b[1m── 5. CouchDB\x1b[0m');

await Promise.all([
  probe('couchdb', 'graph_recommendations DB', async () => {
    const r = await couchGet('/graph_recommendations').catch(() => null);
    if (!r) throw new Error('WARN: graph_recommendations DB missing — run graphify:full');
    return `${r.doc_count ?? 0} docs`;
  }),

  probe('couchdb', 'codebase_graph DB (pagerank store)', async () => {
    const r = await couchGet('/codebase_graph').catch(() => null);
    if (!r) throw new Error('WARN: codebase_graph DB missing — run run:pagerank');
    if ((r.doc_count ?? 0) < 100) throw new Error(`WARN: only ${r.doc_count} docs — run run:pagerank to rebuild`);
    return `${r.doc_count ?? 0} docs`;
  }),

  probe('couchdb', 'wiki_cards DB (docstore cards)', async () => {
    const r = await couchGet('/wiki_cards').catch(() => null);
    if (!r) throw new Error('WARN: wiki_cards DB missing — run graphify:docstore');
    if ((r.doc_count ?? 0) < 5) throw new Error(`WARN: only ${r.doc_count} cards — run graphify:docstore to rebuild`);
    return `${r.doc_count ?? 0} docs`;
  }),

  probe('couchdb', 'inference_log DB', async () => {
    const r = await couchGet('/inference_log').catch(() => null);
    if (!r) throw new Error('WARN: inference_log DB missing');
    return `${r.doc_count ?? 0} docs`;
  }),
]);

// ── 6. MCP TRACE TOOLS ───────────────────────────────────────────────────────

if (!JSON_MODE) console.log('\n\x1b[1m── 6. MCP TRACE Tools\x1b[0m');

const REQUIRED_TOOLS = [
  'graph.expand_neighborhood', 'graph.shortest_path', 'graph.community_for_node',
  'graph.pagerank_top', 'topology.search_near', 'topology.same_som_cluster',
  'topology.search_4d', 'clusters.get_members', 'clusters.get_summary_lenses',
  'trace.kag_search', 'trace.explain_retrieval', 'search.postgres_fts',
  'search.hybrid', 'kag.ingest_error', 'kag.multi_lane_search',
  'context.build_kv_packet', 'ops.propose_patch',
];

await probe('mcp', 'tool list reachable', async () => {
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    signal: AbortSignal.timeout(5000),
  });
  const text = await res.text();
  let parsed = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) { try { parsed = JSON.parse(line.slice(6)); break; } catch {} }
  }
  if (!parsed) parsed = JSON.parse(text);
  const tools = parsed.result?.tools ?? [];
  const names = new Set(tools.map(t => t.name));
  const missing = REQUIRED_TOOLS.filter(t => !names.has(t));
  if (missing.length > 0) throw new Error(`WARN: missing tools: ${missing.join(', ')}`);
  return `${tools.length} tools registered, all required present`;
}, 'npm run mcp:ensure'),

// Ping a read-only tool to verify it executes
await probe('mcp', 'graph.pagerank_top executes', async () => {
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'graph.pagerank_top', arguments: { limit: 3 } }
    }),
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  let parsed = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) { try { parsed = JSON.parse(line.slice(6)); break; } catch {} }
  }
  if (!parsed) parsed = JSON.parse(text);
  if (parsed.error) throw new Error(parsed.error.message ?? 'tool error');
  const content = parsed.result?.content?.[0]?.text ?? '';
  if (!content) throw new Error('empty response');
  return `${content.length} chars returned`;
}, 'check Neo4j + Redis auth');

// ── 7. OLLAMA MODELS ──────────────────────────────────────────────────────────

if (!JSON_MODE) console.log('\n\x1b[1m── 7. Ollama Models\x1b[0m');

await probe('ollama', 'model inventory', async () => {
  const r = await get(`${OLLAMA_URL}/api/tags`, { timeout: 6000 });
  const models = (r.models ?? []).map(m => m.name);
  const hasEmbed = models.some(m => m.includes('embeddinggemma') || m.includes('nomic'));
  const hasLegal = models.some(m => m.includes('gemma') && (m.includes('legal') || m.includes('vlm') || m.includes('4')));
  const lines = [];
  if (!hasEmbed) lines.push('WARN: no embedding model (embeddinggemma or nomic)');
  if (!hasLegal) lines.push('WARN: no legal/gemma4 model');
  if (lines.length) throw new Error(lines.join('; '));
  return models.slice(0, 4).join(', ') + (models.length > 4 ? ` +${models.length - 4}` : '');
});

// ── 8. GRAPH ARTIFACTS ───────────────────────────────────────────────────────

if (!JSON_MODE) console.log('\n\x1b[1m── 8. Graph Artifacts\x1b[0m');

await Promise.all([
  probe('artifacts', 'codebase-graph.json', () => {
    const p = resolve(ROOT, 'docs/graph/codebase-graph.json');
    if (!existsSync(p)) throw new Error('missing — run graphify:daily');
    const j = JSON.parse(readFileSync(p, 'utf8'));
    const n = j.files?.length ?? j.nodes?.length ?? 0;
    if (n < 100) throw new Error(`only ${n} entries`);
    return `${n} files`;
  }),

  probe('artifacts', 'deep-import-graph.json', () => {
    const p = resolve(ROOT, 'memory/graphify/deep/deep-import-graph.json');
    if (!existsSync(p)) throw new Error('missing — run graphify:deep:ingest');
    const j = JSON.parse(readFileSync(p, 'utf8'));
    return `${j.nodes?.length ?? '?'} nodes, ${j.edges?.length ?? '?'} edges`;
  }),

  probe('artifacts', 'latest synthesis run', () => {
    const runsDir = resolve(ROOT, 'memory/runs');
    if (!existsSync(runsDir)) throw new Error('no runs/ dir');
    const runs = readdirSync(runsDir).filter(d => /^\d{4}-\d{2}-\d{2}T/.test(d)).sort().reverse();
    if (!runs.length) throw new Error('no synthesis runs');
    const latest = runs[0];
    const af = resolve(runsDir, latest, 'audit_failures.json');
    const failures = existsSync(af)
      ? JSON.parse(readFileSync(af, 'utf8')).failureCount ?? '?'
      : '?';
    return `run=${latest}, failures=${failures}`;
  }),

  probe('artifacts', 'GRPO wire artifact', () => {
    const runsDir = resolve(ROOT, 'memory/runs');
    const runs = existsSync(runsDir)
      ? readdirSync(runsDir).filter(d => /^\d{4}/.test(d)).sort().reverse()
      : [];
    if (!runs.length) throw new Error('WARN: no synthesis runs');
    // Walk newest-first to find the most recent run that has the artifact.
    // wire-synthesis-grpo only writes into runs that have synthesis_summary.json,
    // so the latest dir may legitimately lack the wiring file.
    const wf = runs
      .map(name => resolve(runsDir, name, 'synthesis_grpo_wiring.json'))
      .find(p => existsSync(p));
    if (!wf) throw new Error('WARN: no grpo wiring artifact — run wire:synthesis:grpo');
    const w = JSON.parse(readFileSync(wf, 'utf8'));
    const sum = w.summary ?? {};
    return `critical=${sum.critical ?? 0} high=${sum.high ?? 0} medium=${sum.medium ?? 0} low=${sum.low ?? 0}`;
  }),

  probe('artifacts', 'KAG notes manifest', () => {
    const p = resolve(ROOT, 'memory/kag-notes/manifest.json');
    if (!existsSync(p)) throw new Error('WARN: missing — run graphify:kag-notes');
    const m = JSON.parse(readFileSync(p, 'utf8'));
    return `${m.written ?? '?'} keys written`;
  }),

  probe('artifacts', 'docstore manifest', () => {
    const p = resolve(ROOT, 'memory/docstore/manifest.json');
    if (!existsSync(p)) throw new Error('WARN: missing — run graphify:docstore');
    const m = JSON.parse(readFileSync(p, 'utf8'));
    return `${m.couchdb?.written ?? '?'} CouchDB + ${m.redis?.written ?? '?'} Redis`;
  }),
]);

// ── 9. tsgo DIAGNOSTICS ───────────────────────────────────────────────────────

if (!JSON_MODE) console.log('\n\x1b[1m── 9. tsgo Diagnostics\x1b[0m');

await probe('tsgo', 'zero type errors', () => {
  // try npx first, fall back to node_modules/.bin direct path
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(npxCmd, ['tsgo', '--noEmit', '--pretty', 'false'],
    { cwd: ROOT, encoding: 'utf8', timeout: 60000, shell: true });
  const out = (result.stdout?.toString() ?? '') + (result.stderr?.toString() ?? '');
  if (result.error) throw new Error(`WARN: tsgo not installed — ${result.error.message}`);
  const errors = out.split('\n').filter(l => /error TS\d+/.test(l)).length;
  if (errors > 0) throw new Error(`${errors} tsgo errors — see audit:tsgo`);
  return '0 errors';
}, 'npm run audit:tsgo');

// ── 10. POSTGRES DATA LAYER ───────────────────────────────────────────────────

if (!JSON_MODE) console.log('\n\x1b[1m── 10. Postgres Tables\x1b[0m');

if (DB_URL) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DB_URL, connectionTimeoutMillis: 5000 });
  let connectErr = null;
  await client.connect().catch(e => { connectErr = e; });

  if (connectErr) {
    // Previously this swallowed the error and let every table probe fail with
    // cryptic "Client has not been connected" messages. Now we surface the
    // root cause once and skip the per-table probes entirely.
    record('postgres', 'connect', 'FAIL',
           String(connectErr.message ?? connectErr).slice(0, 120), 0,
           'check Postgres is running and DATABASE_URL is correct');
  } else {
    const tables = [
      { name: 'research_summaries', minRows: 0 },
      { name: 'chunk_hit_log',      minRows: 0 },
      { name: 'code_relations',     minRows: 100 },
      { name: 'context_timeline',   minRows: 0 },
      { name: 'evidence',           minRows: 0 },
      { name: 'cases',              minRows: 0 },
    ];

    await Promise.all(tables.map(({ name, minRows }) =>
      probe('postgres', `table: ${name}`, async () => {
        const r = await client.query(`SELECT COUNT(*) AS n FROM ${name}`);
        const n = parseInt(r.rows[0]?.n ?? 0);
        if (n < minRows) throw new Error(`only ${n} rows (need ≥${minRows})`);
        return `${n.toLocaleString()} rows`;
      })
    ));
  }

  await client.end().catch(() => {});
} else {
  record('postgres', 'table checks skipped', 'WARN', 'DATABASE_URL not set', 0);
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────

const totalMs = Date.now() - T0;
const total   = passed + warned + failed;
const pct     = total ? Math.round((passed / total) * 100) : 0;

if (!JSON_MODE) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`\x1b[1mResults:\x1b[0m  \x1b[32m${passed} PASS\x1b[0m  \x1b[33m${warned} WARN\x1b[0m  \x1b[31m${failed} FAIL\x1b[0m  (${total} checks, ${pct}% pass, ${totalMs}ms)\n`);

  const failedChecks = checks.filter(c => c.status === 'FAIL');
  const warnedChecks = checks.filter(c => c.status === 'WARN');

  if (failedChecks.length) {
    console.log('\x1b[31m\x1b[1mFailed checks:\x1b[0m');
    for (const c of failedChecks) {
      console.log(`  [${c.category}] ${c.name}: ${c.detail}`);
      if (c.fix) console.log(`    → fix: ${c.fix}`);
    }
    console.log('');
  }
  if (warnedChecks.length) {
    console.log('\x1b[33m\x1b[1mWarnings:\x1b[0m');
    for (const c of warnedChecks) {
      console.log(`  [${c.category}] ${c.name}: ${c.detail}`);
    }
    console.log('');
  }
}

// ── Gap analysis ──────────────────────────────────────────────────────────────

const gaps = [];

// Detect specific enhancement opportunities
const qdrantAuthCk = checks.find(c => c.name === 'codebase_chunks_768 authority enrichment');
if (qdrantAuthCk?.status === 'PASS') {
  const enriched = parseInt((qdrantAuthCk.detail ?? '').replace(/,/g, '')) || 0;
  const total768 = checks.find(c => c.name === 'codebase_chunks_768')?.detail?.match(/[\d,]+/)?.[0]?.replace(/,/g, '');
  if (total768 && enriched < parseInt(total768) * 0.7) {
    gaps.push({ id: 'G-ENR-1', priority: 'P1', area: 'qdrant', description: `Only ${enriched}/${total768} codebase_chunks_768 points enriched with authority scores (<70%) — re-run neo4j-graph-enrich`, fix: 'node scripts/neo4j-graph-enrich.mjs' });
  }
}

const nesCheck = checks.find(c => c.name === 'nes:cluster_risk:* (GRPO NES cartridge)');
if (nesCheck?.status === 'WARN') {
  gaps.push({ id: 'G-GRPO-1', priority: 'P1', area: 'redis', description: 'No GRPO NES cartridge keys — GRPO reward shaping not active', fix: 'npm run graph:synthesize && npm run wire:synthesis:grpo' });
}

const mcpCheck = checks.find(c => c.name === 'tool list reachable');
if (mcpCheck?.status !== 'PASS') {
  gaps.push({ id: 'G-MCP-1', priority: 'P0', area: 'mcp', description: 'TRACE MCP server not running — deep-ingest JSONL cannot be flushed, Gemma4 tool-calling unavailable', fix: 'npm run mcp:ensure' });
}

const failedInfra = checks.filter(c => c.category === 'infra' && c.status === 'FAIL');
for (const f of failedInfra) {
  gaps.push({ id: `G-INFRA-${f.name.slice(0,8)}`, priority: 'P0', area: 'infra', description: `${f.name}: ${f.detail}`, fix: f.fix ?? 'check docker' });
}

// Enhancement suggestions based on coverage
if (!JSON_MODE && gaps.length) {
  console.log('\x1b[1mGaps & Enhancements:\x1b[0m');
  for (const g of gaps) {
    const col = g.priority === 'P0' ? '\x1b[31m' : '\x1b[33m';
    console.log(`  ${col}[${g.priority}]\x1b[0m ${g.id}: ${g.description}`);
    console.log(`       → ${g.fix}`);
  }
  console.log('');
}

// ── Wire to Redis for ACE/Gemma4 ──────────────────────────────────────────────

if (!NO_WIRE) {
  try {
    const { default: Redis } = await import('ioredis');
    const r = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000, enableReadyCheck: false });
    await r.connect();
    const summary = {
      checkedAt: new Date().toISOString(),
      passed, warned, failed, total,
      passRate: pct,
      durationMs: totalMs,
      gaps: gaps.length,
      p0Gaps: gaps.filter(g => g.priority === 'P0').length,
      categories: [...new Set(checks.map(c => c.category))].reduce((acc, cat) => {
        const catChecks = checks.filter(c => c.category === cat);
        acc[cat] = { pass: catChecks.filter(c => c.status === 'PASS').length, total: catChecks.length };
        return acc;
      }, {}),
    };
    await r.setex('tool:health:summary', 3600, JSON.stringify(summary));
    await r.setex('tool:health:gaps', 3600, JSON.stringify(gaps));
    await r.setex('tool:health:checks', 3600, JSON.stringify(checks));
    await r.quit().catch(() => {});
    if (!JSON_MODE) console.log('\x1b[2mHealth summary wired → Redis tool:health:* (TTL 1h)\x1b[0m\n');
  } catch { /* non-fatal */ }
}

// ── JSON output ───────────────────────────────────────────────────────────────

const report = {
  generatedAt: new Date().toISOString(),
  durationMs:  totalMs,
  passed, warned, failed,
  passRate: pct,
  gaps,
  checks,
};

// Always write to log file
const logDir = resolve(ROOT, 'logs/task-output');
mkdirSync(logDir, { recursive: true });
const logPath = resolve(logDir, 'tool-health-latest.json');
writeFileSync(logPath, JSON.stringify(report, null, 2));
if (!JSON_MODE) console.log(`\x1b[2mJSON report → ${logPath}\x1b[0m`);

if (JSON_MODE) process.stdout.write(JSON.stringify(report, null, 2) + '\n');

process.exit(failed > 0 ? 1 : 0);
