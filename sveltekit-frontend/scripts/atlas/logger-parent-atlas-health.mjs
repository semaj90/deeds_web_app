#!/usr/bin/env node
/**
 * Parent Atlas runtime health logger.
 *
 * Read-only probes for the services and registries that gate the workstation
 * board. Writes a JSON report, a Markdown report, and an append-only history
 * JSONL entry.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import pg from 'pg';
import neo4j from 'neo4j-driver';
import Redis from 'ioredis';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { probe } from './lib/probe-with-timeout.mjs';
import { resolveDatabaseUrl, resolveRedisConfig } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const OUT_JSON = path.join(REPORTS_DIR, 'parent-atlas-health.json');
const OUT_MD = path.join(REPORTS_DIR, 'parent-atlas-health.md');
const OUT_HISTORY = path.join(REPORTS_DIR, 'parent-atlas-health-history.jsonl');

loadAtlasEnv(REPO_ROOT);

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function pct(part, total) {
  if (!total) return 0;
  return Number(((Number(part) / Number(total)) * 100).toFixed(2));
}

function rowOrNull(result) {
  return Array.isArray(result?.rows) ? result.rows[0] ?? null : null;
}

async function probeTcp(host, port, timeoutMs = 1500) {
  return probe({
    label: `tcp:${host}:${port}`,
    timeoutMs,
    fn: () =>
      new Promise((resolve, reject) => {
        const socket = net.createConnection({ host, port });
        socket.once('connect', () => {
          socket.destroy();
          resolve({ ok: true });
        });
        socket.once('error', (error) => {
          socket.destroy();
          reject(error);
        });
        socket.setTimeout(timeoutMs, () => {
          socket.destroy();
          reject(new Error(`TCP timeout after ${timeoutMs}ms`));
        });
      }),
  });
}

async function probeHttp(url, timeoutMs = 3000) {
  return probe({
    label: url,
    timeoutMs,
    fn: async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return { ok: true, status: res.status };
    },
  });
}

async function probeRedis(redisConfig, timeoutMs = 3000) {
  return probe({
    label: 'redis',
    timeoutMs,
    fn: async () => {
      const redis = new Redis(redisConfig.url, {
        password: redisConfig.password,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });
      redis.on('error', () => {});
      try {
        await redis.connect();
        const pong = await redis.ping();
        const dbsize = await redis.dbsize();
        return { ok: pong === 'PONG', dbsize, redis };
      } catch (error) {
        throw error;
      }
    },
  });
}

async function probeNeo4j() {
  const uri = String(process.env.NEO4J_URI || process.env.NEO4J_URL || 'bolt://127.0.0.1:7687').trim();
  const user = String(process.env.NEO4J_USER || 'neo4j').trim() || 'neo4j';
  const password = String(process.env.NEO4J_PASSWORD || process.env.NEO4J_PASS || 'neo4j').trim() || 'neo4j';
  return probe({
    label: 'neo4j',
    timeoutMs: 5000,
    fn: async () => {
      const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
        disableLosslessIntegers: true,
        connectionTimeout: 5000,
        maxTransactionRetryTime: 0,
      });
      try {
        const session = driver.session({ database: 'neo4j' });
        try {
          const nodesRes = await session.run('MATCH (n) RETURN count(n) AS count');
          const edgesRes = await session.run('MATCH ()-[r]->() RETURN count(r) AS count');
          return {
            ok: true,
            nodeCount: Number(nodesRes.records[0]?.get('count') ?? 0),
            edgeCount: Number(edgesRes.records[0]?.get('count') ?? 0),
          };
        } finally {
          await session.close().catch(() => {});
        }
      } finally {
        await driver.close().catch(() => {});
      }
    },
  });
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Parent Atlas Health');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Services');
  lines.push('');
  for (const [name, svc] of Object.entries(report.services)) {
    lines.push(`- ${name}: ${svc.status}${svc.message ? ` (${svc.message})` : ''}`);
  }
  lines.push('');
  lines.push('## Coverage');
  lines.push('');
  for (const [name, item] of Object.entries(report.coverage)) {
    lines.push(`- ${name}: ${item.status} (${item.coveragePct}%)`);
  }
  lines.push('');
  lines.push('## Recommendations');
  lines.push('');
  for (const item of report.recommendations) lines.push(`- ${item}`);
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const generatedAt = new Date().toISOString();
  const dbUrl = resolveDatabaseUrl(process.env);
  const redisConfig = resolveRedisConfig(process.env);
  const pool = new Pool({ connectionString: dbUrl, max: 1, connectionTimeoutMillis: 4000, idleTimeoutMillis: 5000 });

  const postgres = await probe({
    label: 'postgres',
    timeoutMs: 5000,
    fn: async () => {
      const [context, registry, packetIdentity, tree, summary, glyphs, replay, som] = await Promise.all([
        pool.query(`SELECT current_database() AS current_database, current_schema() AS current_schema, current_user AS current_user, version() AS server_version`),
        pool.query(`SELECT COUNT(*)::int AS count FROM repo_function_registry`),
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(packet_key)::int AS packet_key_count,
            COUNT(source_ref)::int AS source_ref_count,
            COUNT(feature_id)::int AS feature_id_count,
            COUNT(file_path)::int AS file_path_count
          FROM atlas_packets
        `),
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(node_id)::int AS node_id_count,
            COUNT(parent_id)::int AS parent_id_count,
            COUNT(source_ref)::int AS source_ref_count,
            COUNT(packet_key)::int AS packet_key_count,
            COUNT(file_path)::int AS file_path_count,
            COUNT(summary)::int AS summary_count
          FROM atlas_tree_nodes
        `).catch(() => ({ rows: [{ total: 0, source_ref_count: 0, packet_key_count: 0, summary_count: 0 }] })),
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(summary)::int AS summary_count
          FROM atlas_packets
        `),
        pool.query(`SELECT to_regclass('public.atlas_svg_glyphs') AS table_name`).then(async (res) => {
          if (!res.rows[0]?.table_name) return { rows: [{ total: 0, glyph_record_id_count: 0 }] };
          return pool.query(`SELECT COUNT(*)::int AS total, COUNT(glyph_record_id)::int AS glyph_record_id_count FROM atlas_svg_glyphs`).catch(() => ({ rows: [{ total: 0, glyph_record_id_count: 0 }] }));
        }),
        pool.query(`SELECT to_regclass('public.hyperrag_replay_traces') AS table_name`).then(async (res) => {
          if (!res.rows[0]?.table_name) return { rows: [{ total: 0 }] };
          return pool.query(`SELECT COUNT(*)::int AS total FROM hyperrag_replay_traces`).catch(() => ({ rows: [{ total: 0 }] }));
        }),
        pool.query(`SELECT to_regclass('public.atlas_topology_index') AS table_name`).then(async (res) => {
          if (!res.rows[0]?.table_name) return { rows: [] };
          return pool.query(`
            SELECT COALESCE(NULLIF(som_source, ''), 'missing') AS som_source, COUNT(*)::int AS hits
            FROM atlas_topology_index
            GROUP BY 1
            ORDER BY hits DESC, som_source
          `).catch(() => ({ rows: [] }));
        }),
      ]);

      return {
        context: rowOrNull(context),
        registryCount: toInt(registry.rows[0]?.count, 0),
        packetIdentity: rowOrNull(packetIdentity),
        tree: rowOrNull(tree),
        summary: rowOrNull(summary),
        glyphs: rowOrNull(glyphs),
        replay: rowOrNull(replay),
        somProvenance: som.rows ?? [],
      };
    },
  });

  const qdrant = await probe({
    label: 'qdrant',
    timeoutMs: 4000,
    fn: async () => {
      const res = await fetch(`${process.env.QDRANT_URL ?? 'http://127.0.0.1:6333'}/collections`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
  const qdrantInfo = qdrant.value;

  const neo4j = await probeNeo4j();
  const redis = await probeRedis(redisConfig, 4000);
  const redisClient = redis.value?.redis ?? null;

  let bifrostKeyCount = null;
  let replayTraceCount = null;
  let redisDbSize = null;
  if (redisClient) {
    try {
      redisDbSize = await redisClient.dbsize();
      replayTraceCount = await redisClient.zcard('hyperrag:replay:index').catch(() => null);
      let cursor = '0';
      let total = 0;
      do {
        const [nextCursor, keys] = await redisClient.scan(cursor, 'MATCH', 'bifrost:*', 'COUNT', 500);
        cursor = String(nextCursor);
        total += Array.isArray(keys) ? keys.length : 0;
      } while (cursor !== '0');
      bifrostKeyCount = total;
    } catch {
      bifrostKeyCount = null;
    } finally {
      redisClient.disconnect();
    }
  }

  const goRetrievalHttp = await probeHttp(`${process.env.GO_RETRIEVAL_HTTP_URL ?? process.env.RETRIEVAL_HTTP_URL ?? 'http://127.0.0.1:8100'}/health`, 3000);
  const goRetrievalGrpc = await probeTcp(process.env.GO_RETRIEVAL_GRPC_ADDR?.split(':')[0] ?? '127.0.0.1', Number(process.env.GO_RETRIEVAL_GRPC_ADDR?.split(':')[1] ?? process.env.RETRIEVAL_GRPC_PORT ?? 50053), 2500);

  const report = {
    generatedAt,
    services: {
      postgres: {
        status: postgres.status,
        error: postgres.error,
        context: postgres.value?.context ?? null,
      },
      qdrant: {
        status: qdrant.status,
        error: qdrant.error,
        collections: Array.isArray(qdrantInfo?.result?.collections) ? qdrantInfo.result.collections.length : null,
        payloadSchema: Array.isArray(qdrantInfo?.result?.collections)
          ? qdrantInfo.result.collections.find((collection) => collection?.name === 'codebase_chunks_768')?.config?.params?.payload_schema ?? null
          : null,
      },
      neo4j: {
        status: neo4j.status,
        error: neo4j.error,
        nodeCount: neo4j.value?.nodeCount ?? null,
        edgeCount: neo4j.value?.edgeCount ?? null,
      },
      redis: {
        status: redis.status,
        error: redis.error,
        dbSize: redisDbSize,
        bifrostKeyCount,
        replayTraceCount,
      },
      goRetrievalHttp: {
        status: goRetrievalHttp.status,
        error: goRetrievalHttp.error,
      },
      goRetrievalGrpc: {
        status: goRetrievalGrpc.status,
        error: goRetrievalGrpc.error,
      },
    },
    coverage: {
      registrySize: { status: 'READY', coveragePct: 100, count: postgres.value?.registryCount ?? 0 },
      packetIdentity: {
        status: postgres.value?.packetIdentity?.packet_key_count === postgres.value?.packetIdentity?.total
          ? 'READY'
          : 'PARTIAL',
        coveragePct: pct(postgres.value?.packetIdentity?.packet_key_count ?? 0, postgres.value?.packetIdentity?.total ?? 0),
        total: postgres.value?.packetIdentity?.total ?? 0,
      },
      treeCoverage: {
        status: postgres.value?.tree?.total > 0 ? 'READY' : 'MISSING',
        coveragePct: pct(postgres.value?.tree?.source_ref_count ?? 0, postgres.value?.tree?.total ?? 0),
        total: postgres.value?.tree?.total ?? 0,
        packetKeyCoveragePct: pct(postgres.value?.tree?.packet_key_count ?? 0, postgres.value?.tree?.total ?? 0),
        summaryCoveragePct: pct(postgres.value?.tree?.summary_count ?? 0, postgres.value?.tree?.total ?? 0),
      },
      summaryCoverage: {
        status: postgres.value?.summary?.summary_count > 0 ? 'READY' : 'MISSING',
        coveragePct: pct(postgres.value?.summary?.summary_count ?? 0, postgres.value?.summary?.total ?? 0),
        total: postgres.value?.summary?.total ?? 0,
      },
      glyphCoverage: {
        status: postgres.value?.glyphs?.total > 0 ? 'READY' : 'MISSING',
        coveragePct: pct(postgres.value?.glyphs?.glyph_record_id_count ?? 0, postgres.value?.glyphs?.total ?? 0),
        total: postgres.value?.glyphs?.total ?? 0,
      },
      replayCoverage: {
        status: replayTraceCount && replayTraceCount > 0 ? 'READY' : 'MISSING',
        coveragePct: replayTraceCount && redisDbSize ? pct(replayTraceCount, redisDbSize) : 0,
        total: replayTraceCount ?? 0,
      },
      somProvenanceSplit: {
        status: Array.isArray(postgres.value?.somProvenance) && postgres.value.somProvenance.length > 0 ? 'READY' : 'MISSING',
        coveragePct: 0,
        total: Array.isArray(postgres.value?.somProvenance) ? postgres.value.somProvenance.length : 0,
        rows: postgres.value?.somProvenance ?? [],
      },
    },
    recommendations: [
      postgres.status !== 'READY' ? 'Fix Postgres before higher-level telemetry' : 'Postgres is reachable',
      qdrant.status !== 'READY' ? 'Qdrant transport needs attention' : 'Qdrant transport is reachable',
      neo4j.status !== 'READY' ? 'Neo4j needs attention' : 'Neo4j is reachable',
      redis.status !== 'READY' ? 'Redis/Valkey needs attention' : 'Redis/Valkey is reachable',
      goRetrievalHttp.status !== 'READY' && goRetrievalGrpc.status !== 'READY'
        ? 'Go retrieval is degraded'
        : 'Go retrieval is reachable',
    ],
  };

  await fsp.mkdir(REPORTS_DIR, { recursive: true });
  await fsp.writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsp.writeFile(OUT_MD, buildMarkdown(report), 'utf8');
  await fsp.appendFile(OUT_HISTORY, `${JSON.stringify(report)}\n`, 'utf8');

  console.log(JSON.stringify({ ok: true, report }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
