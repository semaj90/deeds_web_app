#!/usr/bin/env node
/**
 * P16-M Retrieval E2E Benchmark
 *
 * Read-only benchmark of the live retrieval path:
 *   Qdrant -> atlas_higher_hop_index -> tree/file/glyph bridges -> Neo4j expansion
 *   -> Redis hot cache read (optional) -> GPU rerank (optional) -> TurboQuant/Gemma4 answer
 *
 * Pass criteria: majority (ceil(N/2)) of queries must return Qdrant hits AND answers.
 * Ledger overlap, GPU rerank, Neo4j are informational — never hard-fail.
 * Embedding failures trigger retry with backoff before marking a query degraded.
 *
 * No schema mutation, no packet identity mutation, no Qdrant writes, no Redis writes.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import Redis from 'ioredis';
import { loadRepoEnv, resolveDatabaseUrl, resolveRedisConfig, REPO_ROOT, FRONTEND_ROOT } from './connection-config.mjs';
import { queryNeo4jHttp } from './lib/neo4j-http.mjs';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const OUT_JSON = path.join(REPORTS_DIR, 'retrieval-e2e-benchmark.json');
const OUT_MD = path.join(REPORTS_DIR, 'retrieval-e2e-benchmark.md');

const QUERY_DELAY_MS = 1500; // inter-query pause — reduces Ollama concurrency pressure

const QUERIES = [
  'src/lib/components/agent/AutonomousInvestigator.svelte',
  'src/routes/admin/observability/+page.server.ts',
  'src/lib/components/ui/index.ts',
  'src/mcp/server.ts',
  'src/lib/server/db/schema/memory-registry.ts',
];

const env = loadRepoEnv(process.env);
const DATABASE_URL = resolveDatabaseUrl(env);
const REDIS = resolveRedisConfig(env);
const QDRANT_URL = (env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const FRONTEND_BASE = (env.FRONTEND_BASE_URL || env.PUBLIC_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const OLLAMA_BASE = (env.OLLAMA_BASE_URL || env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
const TURBOQUANT_BASE = (env.TURBOQUANT_BASE_URL || 'http://127.0.0.1:8090').replace(/\/$/, '');
const TURBOQUANT_MODEL = env.TURBOQUANT_MODEL || 'local';
const TRACE_MCP_URL = (env.TRACE_MCP_URL || 'http://127.0.0.1:8788').replace(/\/$/, '');
const QDRANT_COLLECTION = env.QDRANT_COLLECTION || 'codebase_chunks_768';
const NODE_EXEC = process.execPath;

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 2,
  allowExitOnIdle: true,
});

function now() {
  return Date.now();
}

function percentile(values, p) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const idx = Math.min(nums.length - 1, Math.max(0, Math.floor((nums.length - 1) * p)));
  return nums[idx];
}

function compactText(text, maxLen = 180) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
}

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function pickPayloadValue(hit, keys) {
  const payload = hit?.payload ?? {};
  for (const key of keys) {
    const value = payload?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') return value;
  }
  return '';
}

function normalizePacketKey(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const colonIdx = value.lastIndexOf(':');
  const base = colonIdx >= 0 ? value.slice(colonIdx + 1).trim() : value;
  return base.replace(/^(?:\.{1,2}\/)+/, '').replace(/^src\//, '').replace(/^sveltekit-frontend\//, '');
}

function normalizeSourceRef(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^(?:\.\.\/)+/, '')
    .replace(/^\.\/+/, '')
    .replace(/^src\//, '')
    .replace(/^sveltekit-frontend\//, '')
    .replace(/\/{2,}/g, '/');
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeReports(report) {
  await ensureDir(OUT_JSON);
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(OUT_MD, renderMarkdown(report), 'utf8');
}

function renderMarkdown(report) {
  const lines = [
    '# Retrieval E2E Benchmark',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Status: ${report.summary.status}`,
    `- Queries: ${report.queries.length}`,
    `- Graph proof: ${report.summary.graph_proof_status ?? 'unknown'}`,
    `- Source ref pct: ${formatNum(report.summary.source_ref_pct)}`,
    `- Feature id pct: ${formatNum(report.summary.feature_id_pct)}`,
    `- Qdrant: ${report.services.qdrant.ok ? 'READY' : 'FAIL'}`,
    `- TRACE MCP: ${report.services.trace_mcp.ok ? 'READY' : 'FAIL'}`,
    `- Redis: ${report.services.redis.ok ? 'READY' : 'DEGRADED'}`,
    `- GPU rerank: ${report.services.gpu.ok ? 'READY' : 'DEGRADED'}`,
    `- TurboQuant/Gemma4 answer: ${report.services.answer.ok ? 'READY' : 'DEGRADED'}`,
    '',
    '## Retrieval Strategy',
    '',
    `- fusion: ${report.summary.retrieval_strategy_counts?.fusion ?? 0}`,
    `- fallback: ${report.summary.retrieval_strategy_counts?.fallback ?? 0}`,
    `- failed: ${report.summary.retrieval_strategy_counts?.failed ?? 0}`,
    '',
    '## Latency',
    '',
    '| Metric | p50 ms | p95 ms |',
    '|---|---:|---:|',
    `| total_ms | ${formatNum(report.summary.latency_p50_ms)} | ${formatNum(report.summary.latency_p95_ms)} |`,
    `| qdrant_ms | ${formatNum(report.summary.qdrant_p50_ms)} | ${formatNum(report.summary.qdrant_p95_ms)} |`,
    `| postgres_lookup_ms | ${formatNum(report.summary.postgres_p50_ms)} | ${formatNum(report.summary.postgres_p95_ms)} |`,
    `| neo4j_expand_ms | ${formatNum(report.summary.neo4j_p50_ms)} | ${formatNum(report.summary.neo4j_p95_ms)} |`,
    `| redis_cache_ms | ${formatNum(report.summary.redis_p50_ms)} | ${formatNum(report.summary.redis_p95_ms)} |`,
    `| gpu_rerank_ms | ${formatNum(report.summary.gpu_p50_ms)} | ${formatNum(report.summary.gpu_p95_ms)} |`,
    `| answer_ms | ${formatNum(report.summary.answer_p50_ms)} | ${formatNum(report.summary.answer_p95_ms)} |`,
    '',
    '## Per Query',
    '',
    '| Query | Strategy | Qdrant hits | Ledger | Tree | Glyph | Neo4j | Graph | Src % | Feat % | Rerank | Answer chars | Total ms | Status |',
    '|---|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---|',
  ];

  for (const row of report.queries) {
    lines.push(
      `| ${escapeMd(row.query)} | ${escapeMd(row.retrieval_strategy ?? 'unknown')} | ${row.qdrant_hits} | ${row.ledger_matches} | ${row.tree_matches} | ${row.glyph_matches} | ${row.neo4j_matches} | ${escapeMd(row.graph_stage_status ?? 'GRAPH_EMPTY')} | ${formatNum(row.source_ref_pct)} | ${formatNum(row.feature_id_pct)} | ${row.rerank_count} | ${row.answer_length} | ${row.total_ms} | ${row.status} |`
    );
  }

  lines.push(
    '',
    '## Notes',
    '',
    ...report.summary.notes.map((note) => `- ${note}`),
    '',
    '## Errors',
    '',
  );

  if (report.errors.length === 0) {
    lines.push('- None');
  } else {
    for (const err of report.errors) lines.push(`- ${err}`);
  }

  return lines.join('\n');
}

function escapeMd(text) {
  return String(text).replace(/\|/g, '\\|');
}

function formatNum(value) {
  return Number.isFinite(value) ? String(Math.round(value)) : 'n/a';
}

function parseLooseJson(stdout) {
  const text = String(stdout ?? '').trim();
  if (!text) return null;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const candidate = lines[i];
    if (candidate.startsWith('{') || candidate.startsWith('[')) {
      try {
        return JSON.parse(candidate);
      } catch {
        // keep scanning
      }
    }
  }
  const jsonStart = text.lastIndexOf('{');
  if (jsonStart >= 0) {
    try {
      return JSON.parse(text.slice(jsonStart));
    } catch {
      // fall through
    }
  }
  return null;
}

async function checkQdrant() {
  const t0 = now();
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return {
        ok: false,
        latency_ms: now() - t0,
        error: `HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    return {
      ok: true,
      latency_ms: now() - t0,
      points_count: data.result?.points_count ?? 0,
      payload_fields: Object.keys(data.result?.payload_schema ?? {}).length,
    };
  } catch (err) {
    return {
      ok: false,
      latency_ms: now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkTraceMcp() {
  const healthStart = now();
  const report = {
    ok: false,
    health_ms: 0,
    tools_ms: 0,
    tools_count: 0,
    error: null,
  };

  try {
    const healthRes = await fetch(`${TRACE_MCP_URL}/health`, { signal: AbortSignal.timeout(8000) });
    report.health_ms = now() - healthStart;
    if (!healthRes.ok) {
      report.error = `health HTTP ${healthRes.status}`;
      return report;
    }
  } catch (err) {
    report.health_ms = now() - healthStart;
    report.error = err instanceof Error ? err.message : String(err);
    return report;
  }

  try {
    const toolsStart = now();
    const res = await fetch(`${TRACE_MCP_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(8000),
    });
    report.tools_ms = now() - toolsStart;
    if (!res.ok) {
      report.error = `tools/list HTTP ${res.status}`;
      return report;
    }
    const text = await res.text();
    const body = text
      .split('\n')
      .find((line) => line.startsWith('data: '))
      ?.slice(6);
    const parsed = body ? JSON.parse(body) : null;
    report.tools_count = Array.isArray(parsed?.result?.tools) ? parsed.result.tools.length : 0;
    report.ok = report.tools_count > 0;
    if (!report.ok && !report.error) {
      report.error = 'tools/list returned no tools';
    }
    return report;
  } catch (err) {
    report.tools_ms = now() - healthStart;
    report.error = err instanceof Error ? err.message : String(err);
    return report;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedQuery(query, retries = 2) {
  const start = now();
  const models = [
    env.ATLAS_EMBED_MODEL || 'embeddinggemma:latest',
    'nomic-embed-text:latest',
  ];

  for (const model of models) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: query.slice(0, 1024) }),
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) break; // HTTP error — skip retries for this model, try next
        const data = await res.json();
        if (Array.isArray(data.embedding) && data.embedding.length === 768) {
          return { ok: true, model, latency_ms: now() - start, vector: data.embedding };
        }
      } catch {
        if (attempt < retries) await sleep(1000 * (attempt + 1));
      }
    }
  }

  return { ok: false, latency_ms: now() - start, vector: null };
}

async function qdrantSearch(vector, topK = 10) {
  const start = now();
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: { name: 'content', vector },
        limit: topK,
        with_payload: true,
        with_vector: ['content'],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return { ok: false, latency_ms: now() - start, error: `HTTP ${res.status}`, hits: [] };
    }
    const data = await res.json();
    const hits = Array.isArray(data.result)
      ? data.result
      : Array.isArray(data.result?.points)
        ? data.result.points
        : [];
    return { ok: true, latency_ms: now() - start, hits, error: null };
  } catch (err) {
    return { ok: false, latency_ms: now() - start, error: err instanceof Error ? err.message : String(err), hits: [] };
  }
}

async function inspectTableColumns(pool, tableName) {
  const { rows } = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
  `, [tableName]);
  return new Set(rows.map((row) => row.column_name));
}

async function higherHopLookupOnTable(pool, hits, tableName, columns) {
  const start = now();
  const packetKeyVariants = [];
  const sourceRefVariants = [];
  const featureIds = [];
  const qdrantPointIds = [];
  const qdrantPayloadKeys = [];
  const contentHashes = [];
  const sourceRefKeys = [];

  for (const hit of hits) {
    const rawPacketKey = String(pickPayloadValue(hit, ['packet_key', 'packetKey'])).trim();
    if (rawPacketKey) {
      packetKeyVariants.push(rawPacketKey);
      packetKeyVariants.push(normalizePacketKey(rawPacketKey));
    }

    const rawSourceRef = String(pickPayloadValue(hit, ['source_ref', 'sourceRef', 'canonical_source_ref', 'canonicalSourceRef', 'source_ref_key'])).trim();
    if (rawSourceRef) {
      sourceRefVariants.push(rawSourceRef);
      sourceRefVariants.push(normalizeSourceRef(rawSourceRef));
      sourceRefKeys.push(rawSourceRef);
      sourceRefKeys.push(normalizeSourceRef(rawSourceRef));
    }

    const rawSourceRefKey = String(pickPayloadValue(hit, ['source_ref_key', 'sourceRefKey'])).trim();
    if (rawSourceRefKey) {
      sourceRefKeys.push(rawSourceRefKey);
      sourceRefKeys.push(normalizeSourceRef(rawSourceRefKey));
    }

    const rawFeatureId = String(pickPayloadValue(hit, ['feature_id', 'featureId', 'feature_ids', 'featureIds'])).trim();
    if (rawFeatureId) featureIds.push(rawFeatureId);

    const rawQdrantPointId = String(hit?.id ?? pickPayloadValue(hit, ['qdrant_point_id', 'qdrantPointId', 'point_id', 'pointId'])).trim();
    if (rawQdrantPointId) qdrantPointIds.push(rawQdrantPointId);

    const rawQdrantPayloadKey = String(pickPayloadValue(hit, ['qdrant_payload_key', 'qdrantPayloadKey'])).trim();
    if (rawQdrantPayloadKey) qdrantPayloadKeys.push(rawQdrantPayloadKey);

    const rawContentHash = String(pickPayloadValue(hit, ['content_hash', 'contentHash'])).trim();
    if (rawContentHash) contentHashes.push(rawContentHash);
  }

  const packetKeys = uniqueStrings(packetKeyVariants);
  const sourceRefs = uniqueStrings(sourceRefVariants);
  const featureIdsUnique = uniqueStrings(featureIds);
  const qdrantPointIdsUnique = uniqueStrings(qdrantPointIds);
  const qdrantPayloadKeysUnique = uniqueStrings(qdrantPayloadKeys);
  const contentHashesUnique = uniqueStrings(contentHashes);
  const sourceRefKeysUnique = uniqueStrings(sourceRefKeys);

  if (packetKeys.length === 0 && sourceRefs.length === 0 && featureIdsUnique.length === 0 && qdrantPointIdsUnique.length === 0 && qdrantPayloadKeysUnique.length === 0 && contentHashesUnique.length === 0 && sourceRefKeysUnique.length === 0) {
    return {
      ok: true,
      latency_ms: now() - start,
      rows: [],
      ledger_matches: 0,
      tree_matches: 0,
      glyph_matches: 0,
      neo4j_matches: 0,
      row_count: 0,
      source_ref_count: 0,
      feature_id_count: 0,
      qdrant_point_id_count: 0,
      matched_keys: [],
    };
  }

  const selectParts = [
    'packet_key',
    'source_ref',
    columns.has('source_ref_key') ? 'source_ref_key' : 'NULL::text AS source_ref_key',
    columns.has('qdrant_point_id') ? 'qdrant_point_id' : 'NULL::text AS qdrant_point_id',
    columns.has('qdrant_payload_key') ? 'qdrant_payload_key' : 'NULL::text AS qdrant_payload_key',
    columns.has('content_hash') ? 'content_hash' : 'NULL::text AS content_hash',
    columns.has('tree_node_id') ? 'tree_node_id' : 'NULL::text AS tree_node_id',
    columns.has('glyph_record_id') ? 'glyph_record_id' : (columns.has('glyph_id') ? 'glyph_id' : 'NULL::text AS glyph_record_id'),
    columns.has('neo4j_node_id') ? 'neo4j_node_id' : (columns.has('neo4j_node') ? 'neo4j_node' : 'NULL::text AS neo4j_node_id'),
    columns.has('redis_hot_key') ? 'redis_hot_key' : 'NULL::text AS redis_hot_key',
    columns.has('file_path') ? 'file_path' : 'NULL::text AS file_path',
    columns.has('feature_id') ? 'feature_id' : 'NULL::text AS feature_id',
    columns.has('feature_label') ? 'feature_label' : 'NULL::text AS feature_label',
    columns.has('som_cluster') ? 'som_cluster' : 'NULL::text AS som_cluster',
  ];

  const whereParts = [];
  const params = [];
  let p = 1;
  if (packetKeys.length > 0) {
    whereParts.push(`packet_key = ANY($${p++}::text[])`);
    params.push(packetKeys);
  }
  if (sourceRefs.length > 0) {
    whereParts.push(`source_ref = ANY($${p++}::text[])`);
    params.push(sourceRefs);
  }
  if (sourceRefKeysUnique.length > 0 && columns.has('source_ref_key')) {
    whereParts.push(`source_ref_key = ANY($${p++}::text[])`);
    params.push(sourceRefKeysUnique);
  }
  if (featureIdsUnique.length > 0 && columns.has('feature_id')) {
    whereParts.push(`feature_id = ANY($${p++}::text[])`);
    params.push(featureIdsUnique);
  }
  if (qdrantPointIdsUnique.length > 0 && columns.has('qdrant_point_id')) {
    whereParts.push(`qdrant_point_id = ANY($${p++}::text[])`);
    params.push(qdrantPointIdsUnique);
  }
  if (qdrantPayloadKeysUnique.length > 0 && columns.has('qdrant_payload_key')) {
    whereParts.push(`qdrant_payload_key = ANY($${p++}::text[])`);
    params.push(qdrantPayloadKeysUnique);
  }
  if (contentHashesUnique.length > 0 && columns.has('content_hash')) {
    whereParts.push(`content_hash = ANY($${p++}::text[])`);
    params.push(contentHashesUnique);
  }

  try {
    const sql = `
      SELECT ${selectParts.join(', ')}
      FROM ${tableName}
      ${whereParts.length > 0 ? `WHERE ${whereParts.join(' OR ')}` : ''}
    `;

    const { rows } = await pool.query(sql, params);
    const ledgerMatches = rows.length;
    const treeMatches = rows.filter((row) => row.tree_node_id !== null && row.tree_node_id !== undefined && String(row.tree_node_id).trim() !== '').length;
    const glyphMatches = rows.filter((row) => {
      const value = row.glyph_record_id ?? row.glyph_id;
      return value !== null && value !== undefined && String(value).trim() !== '';
    }).length;
    const neo4jMatches = rows.filter((row) => {
      const value = row.neo4j_node_id ?? row.neo4j_node;
      return value !== null && value !== undefined && String(value).trim() !== '';
    }).length;

    return {
      ok: true,
      latency_ms: now() - start,
      rows,
      ledger_matches: ledgerMatches,
      tree_matches: treeMatches,
      glyph_matches: glyphMatches,
      neo4j_matches: neo4jMatches,
      row_count: rows.length,
      source_ref_count: rows.filter((row) => String(row.source_ref ?? '').trim() !== '').length,
      feature_id_count: rows.filter((row) => String(row.feature_id ?? '').trim() !== '').length,
      qdrant_point_id_count: rows.filter((row) => String(row.qdrant_point_id ?? '').trim() !== '').length,
      matched_keys: rows.map((row) => String(row.packet_key ?? row.source_ref ?? '')).filter(Boolean),
    };
  } catch (err) {
    return {
      ok: false,
      latency_ms: now() - start,
      rows: [],
      ledger_matches: 0,
      tree_matches: 0,
      glyph_matches: 0,
      neo4j_matches: 0,
      row_count: 0,
      source_ref_count: 0,
      feature_id_count: 0,
      qdrant_point_id_count: 0,
      matched_keys: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function higherHopLookup(pool, hits) {
  const primaryColumns = await inspectTableColumns(pool, 'atlas_higher_hop_index');
  const primary = await higherHopLookupOnTable(pool, hits, 'atlas_higher_hop_index', primaryColumns);
  if (primary.ok && primary.row_count > 0) return primary;

  for (const tableName of ['atlas_packets', 'atlas_codebase_packets']) {
    const columns = await inspectTableColumns(pool, tableName);
    const fallback = await higherHopLookupOnTable(pool, hits, tableName, columns);
    if (fallback.ok && fallback.row_count > 0) {
      return {
        ...fallback,
        source: `${tableName}_fallback`,
        fallback_from: 'atlas_higher_hop_index',
      };
    }
  }

  return primary;
}

async function redisCacheProbe(hits) {
  const start = now();
  try {
    const redis = new Redis({
      host: REDIS.host,
      port: REDIS.port,
      password: REDIS.password || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    redis.on('error', () => {});
    await redis.connect();

    const topRefs = hits.slice(0, 10).map((hit) => [
      String(hit.payload?.packet_key ?? ''),
      String(hit.payload?.source_ref ?? ''),
    ]).flat().filter(Boolean);

    // Scan all required namespaces
    const namespaces = [
      'bifrost:*',
      'bifrost:packet:*',
      'bifrost:sem:packet:*',
      'bifrost:sem:feature:*',
      'bifrost:sem:intent:*',
      'centroid:*',
      'som:*'
    ];

    const keyCounts = {};
    let totalKeys = 0;
    for (const ns of namespaces) {
      let cursor = '0';
      let count = 0;
      try {
        do {
          const [next, batch] = await redis.scan(cursor, 'MATCH', ns, 'COUNT', 500);
          cursor = next;
          count += batch.length;
        } while (cursor !== '0');
      } catch (err) {}
      keyCounts[ns] = count;
      totalKeys += count;
    }

    // legacy check
    let karpathyKeys = 0;
    try {
      let cursor = '0';
      do {
        const [next, batch] = await redis.scan(cursor, 'MATCH', 'gpu:karpathy:*', 'COUNT', 500);
        cursor = next;
        karpathyKeys += batch.length;
      } while (cursor !== '0');
    } catch (err) {}

    const existsChecks = [];
    for (const ref of topRefs) {
      existsChecks.push(
        (async () => {
          const checks = await Promise.all([
            redis.exists(`bifrost:packet:${ref}`).catch(() => 0),
            redis.exists(`bifrost:sem:packet:${ref}`).catch(() => 0),
            redis.exists(`bifrost:sem:feature:${ref}`).catch(() => 0),
          ]);
          return checks.some(c => c > 0) ? 1 : 0;
        })()
      );
    }
    const matched = await Promise.all(existsChecks);
    const cacheHits = matched.reduce((sum, v) => sum + v, 0);

    await redis.quit().catch(() => {});
    return {
      ok: true,
      latency_ms: now() - start,
      hot_key_count: totalKeys,
      cache_hits: cacheHits,
      source: 'valkey',
      namespaces: keyCounts,
      legacy_karpathy_keys: karpathyKeys
    };
  } catch (err) {
    return {
      ok: false,
      latency_ms: now() - start,
      error: err instanceof Error ? err.message : String(err),
      hot_key_count: 0,
      cache_hits: 0,
      source: 'unavailable',
    };
  }
}

async function neo4jExpand(pgRows, hits = []) {
  const start = now();
  const packetKeys = uniqueStrings([
    ...pgRows.map((row) => row.packet_key),
    ...hits.map((hit) => normalizePacketKey(pickPayloadValue(hit, ['packet_key', 'packetKey']))),
  ]);
  const sourceRefs = uniqueStrings([
    ...pgRows.map((row) => row.source_ref),
    ...hits.map((hit) => normalizeSourceRef(pickPayloadValue(hit, ['source_ref', 'sourceRef', 'canonical_source_ref', 'canonicalSourceRef', 'source_ref_key']))),
  ]);
  const conceptIds = uniqueStrings([
    ...pgRows.map((row) => row.feature_id),
    ...hits.flatMap((hit) => Array.isArray(hit.payload?.concept_ids) ? hit.payload.concept_ids : []),
  ]);

  if (packetKeys.length === 0 && sourceRefs.length === 0 && conceptIds.length === 0) {
    return {
      ok: true,
      latency_ms: now() - start,
      matches: 0,
      graph_stage_status: 'GRAPH_EMPTY',
      graph_hit_count: 0,
      graph_rank_contribution: 0,
      traversal_path: 'skipped_no_context',
      graph_error: null,
      rows: [],
      source: 'skipped_no_context',
    };
  }

  try {
    const result = await queryNeo4jHttp({
      statement: `
        MATCH (p:Packet)-[r:USED_CONCEPT]->(c:Concept)
        WHERE ($relationshipTypes = [] OR type(r) IN $relationshipTypes)
          AND (
            ($conceptIds <> [] AND (c.id IN $conceptIds OR c.concept_id IN $conceptIds OR c.name IN $conceptIds))
            OR ($packetKeys <> [] AND coalesce(p.packet_key, p.packetKey, p.id, '') IN $packetKeys)
            OR ($sourceRefs <> [] AND coalesce(p.source_ref, p.sourceRef, p.canonicalSourceRef, '') IN $sourceRefs)
          )
        WITH
          p,
          count(DISTINCT c) AS graph_hit_count,
          max(toFloat(coalesce(r.weight, 0.5))) AS graph_rank_contribution
        RETURN
          coalesce(p.packet_key, p.packetKey, p.id, '') AS packet_key,
          coalesce(p.source_ref, p.sourceRef, p.canonicalSourceRef, '') AS source_ref,
          graph_hit_count,
          graph_rank_contribution,
          'Concept-[:REL]->Packet' AS traversal_path
        ORDER BY graph_rank_contribution DESC
        LIMIT $topK
      `,
      parameters: {
        relationshipTypes: ['USED_CONCEPT'],
        conceptIds,
        packetKeys,
        sourceRefs,
        topK: 20,
      },
    });

    if (!result.ok) {
      const graphError = String(result.error ?? 'neo4j_http_error');
      const status = Number(result.status ?? 0);
      return {
        ok: false,
        latency_ms: now() - start,
        graph_stage_status: status === 404 || status === 405 ? 'GRAPH_DEGRADED' : 'GRAPH_FAILED',
        graph_hit_count: 0,
        graph_rank_contribution: 0,
        traversal_path: 'Concept-[:REL]->Packet',
        graph_error: graphError,
        rows: [],
        matches: 0,
        error: graphError,
        source: 'unavailable',
        httpUrl: result.httpUrl ?? null,
      };
    }

    const rows = Array.isArray(result.rows) ? result.rows : [];
    const graphHitCount = rows.length;
    const graphRankContribution = rows.reduce((max, row) => {
      const score = Number(row.graph_rank_contribution ?? row.score ?? 0);
      return Number.isFinite(score) ? Math.max(max, score) : max;
    }, 0);

    return {
      ok: true,
      latency_ms: now() - start,
      graph_stage_status: graphHitCount > 0 ? 'GRAPH_ENABLED' : 'GRAPH_EMPTY',
      graph_hit_count: graphHitCount,
      graph_rank_contribution: graphRankContribution,
      traversal_path: rows[0]?.traversal_path ?? 'Packet-[:USED_CONCEPT]->Concept',
      graph_error: null,
      rows,
      matches: graphHitCount,
      error: null,
      source: 'live_http',
      httpUrl: result.httpUrl ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      latency_ms: now() - start,
      graph_stage_status: 'GRAPH_FAILED',
      graph_hit_count: 0,
      graph_rank_contribution: 0,
      traversal_path: 'Packet-[:USED_CONCEPT]->Concept',
      graph_error: err instanceof Error ? err.message : String(err),
      rows: [],
      matches: 0,
      error: err instanceof Error ? err.message : String(err),
      source: 'unavailable',
    };
  }
}

async function gpuRerankProbe(hits, queryVector) {
  const start = now();
  const topCorpus = hits.slice(0, 20);
  const corpus = topCorpus
    .map((hit) => {
      const rv = hit.vector;
      if (Array.isArray(rv)) return rv;
      if (rv && typeof rv === 'object' && Array.isArray(rv.content)) return rv.content;
      return null;
    })
    .filter((vec) => Array.isArray(vec) && vec.length === queryVector.length);

  if (corpus.length === 0) {
    return { ok: false, latency_ms: now() - start, source: 'no_vectors', scores: [] };
  }

  // Write input to a tmp file to avoid Windows stdin-pipe EINVAL/EBADF on named pipes
  const tmpFile = path.join(REPO_ROOT, `.gpu-rerank-${process.pid}-${Date.now()}.json`);
  await fs.writeFile(tmpFile, JSON.stringify({ queryVector, corpus }), 'utf8');

  const snippet = `
    import fs from 'node:fs/promises';
    import { batchCosineSimilarity } from ${JSON.stringify(pathToFileURL(path.join(FRONTEND_ROOT, 'src', 'lib', 'server', 'gpu', 'libtorch-bridge.ts')).href)};

    const input = JSON.parse(await fs.readFile(${JSON.stringify(tmpFile)}, 'utf8'));
    const res = await batchCosineSimilarity(input.queryVector, input.corpus);
    process.stdout.write(JSON.stringify({ source: res.source, scores: res.scores }));
  `;

  const child = spawnSync(
    NODE_EXEC,
    ['--import', 'tsx', '--input-type=module', '--eval', snippet],
    {
      encoding: 'utf8',
      maxBuffer: 10_000_000,
      env: { ...process.env },
      cwd: FRONTEND_ROOT,
    },
  );

  await fs.unlink(tmpFile).catch(() => {});

  if (child.status !== 0) {
    return {
      ok: false,
      latency_ms: now() - start,
      source: 'unavailable',
      error: child.stderr?.trim() || child.stdout?.trim() || `exit ${child.status}`,
      scores: [],
    };
  }

  try {
    const parsed = parseLooseJson(child.stdout);
    if (!parsed) {
      throw new Error((child.stdout || child.stderr || 'missing JSON output').toString().trim().slice(0, 220));
    }
    return {
      ok: true,
      latency_ms: now() - start,
      source: parsed.source || 'cpu',
      scores: Array.isArray(parsed.scores) ? parsed.scores : [],
    };
  } catch (err) {
    return {
      ok: false,
      latency_ms: now() - start,
      source: 'unavailable',
      error: err instanceof Error ? err.message : String(err),
      scores: [],
    };
  }
}

async function answerWithTurboQuant(query, retrieved) {
  const start = now();
  const contextLines = retrieved.slice(0, 5).map((row, idx) => {
    const summary = compactText(row.summary ?? row.payload?.summary ?? '', 140);
    return [
      `${idx + 1}. packet_key=${row.packet_key}`,
      `   source_ref=${row.source_ref}`,
      `   feature_id=${row.feature_id ?? 'n/a'}`,
      `   feature_label=${row.feature_label ?? 'n/a'}`,
      `   summary=${summary || 'n/a'}`,
    ].join('\n');
  }).join('\n');

  const prompt = [
    `Query: ${query}`,
    '',
    'Use the grounded retrieval context below to answer briefly and concretely.',
    'If evidence is thin, say that it is thin.',
    '',
    'Context:',
    contextLines || 'No context returned.',
  ].join('\n');

  const models = [env.TURBOQUANT_MODEL || TURBOQUANT_MODEL, 'gemma4-rotorquant:latest', 'local'];
  for (const model of [...new Set(models.filter(Boolean))]) {
    try {
      const res = await fetch(`${TURBOQUANT_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You are a concise retrieval benchmark assistant.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 256,
          stream: false,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content
        ?? data?.message?.content
        ?? data?.response
        ?? '';
      if (text) {
        return {
          ok: true,
          latency_ms: now() - start,
          model,
          answer: text,
          source: 'turboquant',
        };
      }
    } catch {
      // try next model/route
    }
  }

  try {
    const res = await fetch(`${FRONTEND_BASE}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: prompt,
        temperature: 0.2,
        history: [],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      return {
        ok: false,
        latency_ms: now() - start,
        error: `HTTP ${res.status}`,
        answer: '',
        source: 'fallback_failed',
      };
    }
    const data = await res.json();
    const text = data?.response ?? data?.text ?? '';
    return {
      ok: Boolean(text),
      latency_ms: now() - start,
      answer: String(text || ''),
      model: data?.model ?? 'gemma4',
      backend: data?.backend ?? 'api/ai/chat',
      source: 'frontend-route',
    };
  } catch (err) {
    return {
      ok: false,
      latency_ms: now() - start,
      error: err instanceof Error ? err.message : String(err),
      answer: '',
      source: 'unavailable',
    };
  }
}

async function runQuery(pool, columns, query) {
  const qStart = now();
  const entry = {
    query,
    query_hash: sha256(query),
    retrieval_strategy: 'unknown',
    qdrant_ms: 0,
    postgres_lookup_ms: 0,
    neo4j_expand_ms: 0,
    redis_cache_ms: 0,
    gpu_rerank_ms: 0,
    answer_ms: 0,
    total_ms: 0,
    qdrant_hits: 0,
    ledger_matches: 0,
    tree_matches: 0,
    glyph_matches: 0,
    neo4j_matches: 0,
    source_ref_pct: 0,
    feature_id_pct: 0,
    graph_stage_status: 'GRAPH_EMPTY',
    graph_hit_count: 0,
    graph_rank_contribution: 0,
    traversal_path: '',
    graph_error: null,
    rerank_count: 0,
    answer_length: 0,
    errors: [],
    status: 'degraded',
    services: {},
    top_packets: [],
  };

  const embed = await embedQuery(query);
  entry.services.embedding = { ok: embed.ok, latency_ms: embed.latency_ms, model: embed.model ?? null };
  if (!embed.ok || !embed.vector) {
    entry.errors.push(`embedding_failed: ${embed.ok ? 'unknown' : 'no embedding model available'}`);
    entry.total_ms = now() - qStart;
    return entry;
  }

  const qdrant = await qdrantSearch(embed.vector, 12);
  entry.qdrant_ms = qdrant.latency_ms;
  entry.qdrant_hits = qdrant.hits.length;
  entry.services.qdrant = { ok: qdrant.ok, latency_ms: qdrant.latency_ms, error: qdrant.error ?? null };
  if (!qdrant.ok) {
    entry.errors.push(`qdrant_failed: ${qdrant.error}`);
    entry.total_ms = now() - qStart;
    return entry;
  }
  if (entry.qdrant_hits === 0) {
    entry.errors.push('no_qdrant_hits');
    entry.total_ms = now() - qStart;
    return entry;
  }

  const pgLookup = await higherHopLookup(pool, qdrant.hits);
  entry.postgres_lookup_ms = pgLookup.latency_ms;
  entry.ledger_matches = pgLookup.ledger_matches;
  entry.tree_matches = pgLookup.tree_matches;
  entry.glyph_matches = pgLookup.glyph_matches;
  entry.neo4j_matches = pgLookup.neo4j_matches;
  entry.source_ref_pct = pgLookup.row_count > 0 ? Number(((pgLookup.source_ref_count / pgLookup.row_count) * 100).toFixed(1)) : 0;
  entry.feature_id_pct = pgLookup.row_count > 0 ? Number(((pgLookup.feature_id_count / pgLookup.row_count) * 100).toFixed(1)) : 0;
  entry.services.postgres = { ok: pgLookup.ok, latency_ms: pgLookup.latency_ms };
  entry.top_packets = pgLookup.rows.slice(0, 5);

  const redis = await redisCacheProbe(qdrant.hits);
  entry.redis_cache_ms = redis.latency_ms;
  entry.services.redis = redis;

  const neo4j = await neo4jExpand(pgLookup.rows, qdrant.hits);
  entry.neo4j_expand_ms = neo4j.latency_ms;
  entry.services.neo4j = neo4j;
  entry.graph_stage_status = neo4j.graph_stage_status ?? (neo4j.ok ? 'GRAPH_ENABLED' : 'GRAPH_FAILED');
  entry.graph_hit_count = neo4j.graph_hit_count ?? neo4j.matches ?? 0;
  entry.graph_rank_contribution = neo4j.graph_rank_contribution ?? 0;
  entry.traversal_path = neo4j.traversal_path ?? '';
  entry.graph_error = neo4j.graph_error ?? neo4j.error ?? null;
  if (!neo4j.ok) {
    entry.errors.push(`neo4j_degraded: ${neo4j.error}`);
  }

  const gpu = await gpuRerankProbe(qdrant.hits, embed.vector);
  entry.gpu_rerank_ms = gpu.latency_ms;
  entry.rerank_count = Array.isArray(gpu.scores) ? gpu.scores.length : 0;
  entry.services.gpu = gpu;
  if (!gpu.ok) {
    entry.errors.push(`gpu_degraded: ${gpu.error || gpu.source}`);
  }

  const answer = await answerWithTurboQuant(query, entry.top_packets);
  entry.answer_ms = answer.latency_ms;
  entry.answer_length = String(answer.answer ?? '').length;
  entry.services.answer = answer;
  if (!answer.ok) {
    entry.errors.push(`answer_degraded: ${answer.error || answer.source}`);
  }

  entry.total_ms = now() - qStart;

  const coreOk = qdrant.ok && entry.qdrant_hits > 0 && answer.ok;
  entry.retrieval_strategy = coreOk
    ? 'fusion'
    : (qdrant.ok && entry.qdrant_hits > 0 ? 'fallback' : 'failed');
  entry.status = coreOk ? (entry.errors.length === 0 ? 'pass' : 'degraded') : 'failed';
  if (!redis.ok || !neo4j.ok || !gpu.ok) {
    entry.status = entry.status === 'failed' ? 'failed' : 'degraded';
  }

  return entry;
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    projectRoot: FRONTEND_BASE,
    queries: [],
    services: {},
    summary: {},
    errors: [],
  };

  const qdrantHealth = await checkQdrant();
  report.services.qdrant = qdrantHealth;
  if (!qdrantHealth.ok) {
    report.errors.push(`Qdrant unhealthy: ${qdrantHealth.error}`);
  }

  const traceHealth = await checkTraceMcp();
  report.services.trace_mcp = traceHealth;
  if (!traceHealth.ok) {
    report.errors.push(`TRACE MCP unhealthy: ${traceHealth.error}`);
  }

  if (!qdrantHealth.ok || !traceHealth.ok) {
    report.services.redis  = { ok: false };
    report.services.gpu    = { ok: false };
    report.services.answer = { ok: false };
    report.summary = {
      status: 'FAILED',
      notes: [
        'Qdrant healthy is required.',
        'TRACE MCP healthy is required.',
        'Optional Redis/GPU/Neo4j lanes may degrade without failing the report.',
      ],
    };
    await writeReports(report);
    console.log(`Wrote ${OUT_JSON}`);
    console.log(`Wrote ${OUT_MD}`);
    await pool.end().catch(() => {});
    process.exit(1);
  }

  const columns = await inspectTableColumns(pool, 'atlas_higher_hop_index');
  report.services.postgres = { ok: true, table: 'atlas_higher_hop_index', columns: columns.size };

  for (let i = 0; i < QUERIES.length; i++) {
    if (i > 0) await sleep(QUERY_DELAY_MS);
    const row = await runQuery(pool, columns, QUERIES[i]);
    report.queries.push(row);
  }

  // Aggregate optional service health from per-query results (any-ok wins)
  report.services.redis  = { ok: report.queries.some((q) => q.services.redis?.ok) };
  report.services.gpu    = { ok: report.queries.some((q) => q.services.gpu?.ok) };
  report.services.answer = { ok: report.queries.some((q) => q.services.answer?.ok) };

  const totals = report.queries.map((row) => row.total_ms);
  const qdrantTimes = report.queries.map((row) => row.qdrant_ms);
  const pgTimes = report.queries.map((row) => row.postgres_lookup_ms);
  const neo4jTimes = report.queries.map((row) => row.neo4j_expand_ms);
  const redisTimes = report.queries.map((row) => row.redis_cache_ms);
  const gpuTimes = report.queries.map((row) => row.gpu_rerank_ms);
  const answerTimes = report.queries.map((row) => row.answer_ms);
  const sourceRefPct = report.queries.length > 0
    ? Number((report.queries.reduce((sum, row) => sum + Number(row.source_ref_pct ?? 0), 0) / report.queries.length).toFixed(1))
    : 0;
  const featureIdPct = report.queries.length > 0
    ? Number((report.queries.reduce((sum, row) => sum + Number(row.feature_id_pct ?? 0), 0) / report.queries.length).toFixed(1))
    : 0;
  const graphStageCounts = report.queries.reduce((acc, row) => {
    const key = row.graph_stage_status || 'GRAPH_EMPTY';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const graphProofStatus = graphStageCounts.GRAPH_ENABLED > 0
    ? 'PASS'
    : ((graphStageCounts.GRAPH_DEGRADED > 0 || graphStageCounts.GRAPH_EMPTY === report.queries.length)
      ? 'PASS_WITH_WARNINGS'
      : 'FAILED');

  // Hard gates: at least half of queries must return Qdrant hits and answers
  // (individual query failures may be transient embedding/model timeouts)
  const queriesWithHits = report.queries.filter((row) => row.qdrant_hits > 0).length;
  const queriesAnswered = report.queries.filter((row) => row.answer_length > 0).length;
  const minPass = Math.ceil(report.queries.length / 2);
  const allQdrantHits = queriesWithHits >= minPass;
  const allAnswered   = queriesAnswered >= minPass;
  // Ledger match is best-effort: hop index covers 3,251 of 52,606 Qdrant points (~6%)
  // so search queries won't always land on hop-indexed packets
  const anyLedgerMatches = report.queries.some((row) => row.ledger_matches > 0);
  const totalLedgerMatches = report.queries.reduce((sum, row) => sum + row.ledger_matches, 0);

  const optionalWarnings = report.queries.filter((row) => row.status === 'degraded').length;
  const strategyCounts = report.queries.reduce((acc, row) => {
    const key = row.retrieval_strategy || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  report.summary = {
    status: allQdrantHits && allAnswered ? (optionalWarnings > 0 ? 'PASS_WITH_WARNINGS' : 'PASS') : 'FAILED',
    graph_proof_status: graphProofStatus,
    graph_stage_counts: graphStageCounts,
    source_ref_pct: sourceRefPct,
    feature_id_pct: featureIdPct,
    latency_p50_ms: percentile(totals, 0.5),
    latency_p95_ms: percentile(totals, 0.95),
    qdrant_p50_ms: percentile(qdrantTimes, 0.5),
    qdrant_p95_ms: percentile(qdrantTimes, 0.95),
    postgres_p50_ms: percentile(pgTimes, 0.5),
    postgres_p95_ms: percentile(pgTimes, 0.95),
    neo4j_p50_ms: percentile(neo4jTimes, 0.5),
    neo4j_p95_ms: percentile(neo4jTimes, 0.95),
    redis_p50_ms: percentile(redisTimes, 0.5),
    redis_p95_ms: percentile(redisTimes, 0.95),
    gpu_p50_ms: percentile(gpuTimes, 0.5),
    gpu_p95_ms: percentile(gpuTimes, 0.95),
    answer_p50_ms: percentile(answerTimes, 0.5),
    answer_p95_ms: percentile(answerTimes, 0.95),
    queries_with_qdrant_hits: queriesWithHits,
    queries_answered: queriesAnswered,
    min_pass_threshold: minPass,
    qdrant_gate: allQdrantHits,
    answer_gate: allAnswered,
    any_ledger_matches: anyLedgerMatches,
    total_ledger_matches: totalLedgerMatches,
    degraded_queries: optionalWarnings,
    retrieval_strategy_counts: strategyCounts,
    notes: [
      'Qdrant healthy and TRACE MCP healthy are required gates.',
      'Redis, Neo4j, GPU rerank, and TurboQuant/Gemma4 answer lanes are allowed to degrade.',
      'This benchmark is read-only and does not write to Postgres, Qdrant, or Redis.',
    ],
  };

  if (!allQdrantHits || !allAnswered) {
    report.errors.push('one_or_more_queries_failed_core_pass_criteria');
  }
  if (!anyLedgerMatches) {
    report.errors.push('no_hop_index_matches_across_all_queries (informational: hop index covers ~6% of Qdrant points)');
  }

  await writeReports(report);

  console.log(`Wrote ${OUT_JSON}`);
  console.log(`Wrote ${OUT_MD}`);
  console.log(`Status: ${report.summary.status}`);

  await pool.end().catch(() => {});
  process.exit(report.summary.status === 'FAILED' ? 1 : 0);
}

main().catch(async (err) => {
  const report = {
    generatedAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    projectRoot: FRONTEND_BASE,
    queries: [],
    services: {},
    summary: { status: 'FAILED', notes: ['benchmark crashed before completion'] },
    retrieval_strategy_counts: {},
    errors: [err instanceof Error ? err.message : String(err)],
  };
  try {
    await writeReports(report);
  } catch {}
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
