#!/usr/bin/env node
/**
 * Read-only live-service env audit.
 *
 * This report classifies the local service configuration for the current
 * provenance / backfill lane without mutating any datastore.
 *
 * Output:
 *   docs/reports/live-service-env-report.json
 *   docs/reports/live-service-env-report.md
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  loadRepoEnv,
  normalizeConnectionHost,
  resolveDatabaseUrl,
  resolveRedisConfig,
  REPO_ROOT,
} from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = REPO_ROOT || path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'live-service-env-report.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'live-service-env-report.md');
const JSON_OUT = process.argv.includes('--json');
const STRICT = process.argv.includes('--strict');
const { Pool } = pg;

const EXPECTED = {
  postgres: { host: '127.0.0.1', port: 5434 },
  qdrant: { host: '127.0.0.1', port: 6333 },
  neo4j: { host: '127.0.0.1', port: 7687 },
  redis: { host: '127.0.0.1', port: 6379 },
  goRetrieval: { host: '127.0.0.1', httpPort: 8100, grpcPort: 50053 },
};

function tcpProbe(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, latencyMs: timeoutMs, error: 'timeout' });
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ ok: true, latencyMs: Date.now() - startedAt });
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, latencyMs: Date.now() - startedAt, error: error.code || error.message });
    });
  });
}

function parseUrlLike(raw, fallbackScheme) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  try {
    return new URL(/^[a-z]+:\/\//i.test(value) ? value : `${fallbackScheme}://${value}`);
  } catch {
    return null;
  }
}

function toStatus(ok, label = 'READY', fallback = 'SOURCE_UNAVAILABLE') {
  return ok ? label : fallback;
}

function formatHostPort(host, port) {
  return `${normalizeConnectionHost(host)}:${Number(port)}`;
}

function classifyHostPort(actual, expected) {
  if (!actual.host || !actual.port) return 'ENV_MISMATCH';
  if (actual.host !== expected.host && actual.port !== expected.port) return 'ENV_MISMATCH';
  if (actual.host !== expected.host) return 'ENV_MISMATCH';
  if (Number(actual.port) !== Number(expected.port)) return 'PORT_MISMATCH';
  return 'READY';
}

function classifyTcpProbe(probe, expected, envStatus, authRequired = false, authConfigured = true) {
  if (envStatus !== 'READY') return envStatus;
  if (!probe.ok) return 'SERVICE_STOPPED';
  if (authRequired && !authConfigured) return 'AUTH_REQUIRED';
  return 'READY';
}

function parsePostgresConfig(env) {
  const raw = resolveDatabaseUrl(env);
  const parsed = parseUrlLike(raw, 'postgresql');
  if (!parsed) {
    return { raw, status: 'SOURCE_UNAVAILABLE', host: null, port: null, detail: 'DATABASE_URL could not be parsed' };
  }
  return {
    raw,
    host: normalizeConnectionHost(parsed.hostname),
    port: Number(parsed.port || EXPECTED.postgres.port),
    user: decodeURIComponent(parsed.username || ''),
    hasPassword: Boolean(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  };
}

function parseQdrantConfig(env) {
  const raw = String(env.QDRANT_URL ?? env.PUBLIC_QDRANT_URL ?? '').trim();
  const configured = Boolean(raw || env.QDRANT_HOST || env.QDRANT_PORT || env.PUBLIC_QDRANT_URL);
  if (!raw) {
    const host = normalizeConnectionHost(env.QDRANT_HOST ?? EXPECTED.qdrant.host);
    const port = Number(env.QDRANT_PORT ?? EXPECTED.qdrant.port);
    return { raw: '', configured, host, port, detail: 'QDRANT_URL not set; using host/port envs' };
  }
  const parsed = parseUrlLike(raw, 'http');
  if (!parsed) {
    return { raw, configured, status: 'SOURCE_UNAVAILABLE', host: null, port: null, detail: 'QDRANT_URL could not be parsed' };
  }
  return {
    raw,
    configured,
    host: normalizeConnectionHost(parsed.hostname),
    port: Number(parsed.port || EXPECTED.qdrant.port),
    scheme: parsed.protocol.replace(':', ''),
  };
}

function parseNeo4jConfig(env) {
  const raw = String(env.NEO4J_URI ?? '').trim();
  const configured = Boolean(raw || env.NEO4J_PASSWORD || env.NEO4J_AUTH);
  if (!raw) {
    return {
      raw: '',
      configured,
      status: 'SOURCE_UNAVAILABLE',
      host: null,
      port: null,
      detail: 'NEO4J_URI not set',
    };
  }
  const parsed = parseUrlLike(raw, 'bolt');
  if (!parsed) {
    return { raw, status: 'SOURCE_UNAVAILABLE', host: null, port: null, detail: 'NEO4J_URI could not be parsed' };
  }
  return {
    raw,
    configured,
    host: normalizeConnectionHost(parsed.hostname),
    port: Number(parsed.port || EXPECTED.neo4j.port),
    scheme: parsed.protocol.replace(':', ''),
    authConfigured: Boolean(String(env.NEO4J_PASSWORD ?? env.NEO4J_AUTH ?? '').trim()),
  };
}

function parseRedisConfig(env) {
  const resolved = resolveRedisConfig(env);
  return {
    ...resolved,
    configured: Boolean(String(env.REDIS_URL ?? '').trim() || String(env.REDIS_HOST ?? '').trim() || String(env.REDIS_PORT ?? '').trim() || String(env.REDIS_PASSWORD ?? '').trim()),
    raw: String(env.REDIS_URL ?? '').trim(),
    authConfigured: Boolean(resolved.password),
  };
}

function parseGoRetrievalConfig(env) {
  const httpRaw = String(env.RETRIEVAL_HTTP_URL ?? env.GO_RETRIEVAL_HTTP_URL ?? '').trim();
  const grpcRaw = String(
    env.RETRIEVAL_GRPC_URL
      ?? env.GO_RETRIEVAL_GRPC_URL
      ?? env.GO_RETRIEVAL_GRPC_ADDR
      ?? '',
  ).trim();
  const httpParsed = parseUrlLike(httpRaw, 'http');
  const grpcParsed = parseUrlLike(grpcRaw, 'http');
  const host = normalizeConnectionHost(
    httpParsed?.hostname ?? grpcParsed?.hostname ?? env.RETRIEVAL_HOST ?? EXPECTED.goRetrieval.host,
    EXPECTED.goRetrieval.host,
  );
  return {
    httpRaw,
    grpcRaw,
    configured: Boolean(httpRaw || grpcRaw || env.RETRIEVAL_HTTP_ENABLED || env.RETRIEVAL_GRPC_ENABLED),
    host,
    httpPort: Number(httpParsed?.port || env.RETRIEVAL_HTTP_PORT || EXPECTED.goRetrieval.httpPort),
    grpcPort: Number(grpcParsed?.port || env.RETRIEVAL_GRPC_PORT || EXPECTED.goRetrieval.grpcPort),
    httpEnabled: (env.RETRIEVAL_HTTP_ENABLED ?? env.GO_RETRIEVAL_ENABLED ?? 'false') === 'true',
    grpcEnabled: (env.RETRIEVAL_GRPC_ENABLED ?? env.GO_RETRIEVAL_ENABLED ?? 'false') === 'true',
  };
}

function provenanceSpine() {
  return [
    'source_ref',
    'parent_atlas_documents',
    'feature_id',
    'atlas_feature_map',
    'qdrant_point_id',
    'route_runtime_packets',
    'retrieval_telemetry',
    'go_retrieval_service',
    'neo4j contextual tree',
  ];
}

function classifyBackfillReadiness(results) {
  const blockers = [];
  if (results.postgres.status !== 'READY') blockers.push(`postgres:${results.postgres.status}`);
  if (results.qdrant.status !== 'READY') blockers.push(`qdrant:${results.qdrant.status}`);
  const ready = blockers.length === 0;
  return {
    ready,
    blockers,
    notes: ready
      ? 'Qdrant backfill can proceed read-only from provenance sources'
      : 'Qdrant backfill is blocked until Postgres and Qdrant are ready',
  };
}

function renderMarkdown(report) {
  const lines = [
    '# Live Service Env Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- READY: ${report.summary.counts.READY}`,
    `- ENV_MISMATCH: ${report.summary.counts.ENV_MISMATCH}`,
    `- PORT_MISMATCH: ${report.summary.counts.PORT_MISMATCH}`,
    `- SERVICE_STOPPED: ${report.summary.counts.SERVICE_STOPPED}`,
    `- AUTH_REQUIRED: ${report.summary.counts.AUTH_REQUIRED}`,
    `- SOURCE_UNAVAILABLE: ${report.summary.counts.SOURCE_UNAVAILABLE}`,
    '',
    '## Services',
    '',
    '| service | status | env | probe | detail |',
    '|---|---|---|---|---|',
    ...report.services.map((svc) => `| ${svc.name} | ${svc.status} | ${svc.envDisplay} | ${svc.probeDisplay} | ${svc.detail.replace(/\|/g, '\\|')} |`),
    '',
    '## Provenance',
    '',
    `- spine: ${report.provenance.spine.join(' -> ')}`,
    `- qdrant_backfill_ready: ${report.qdrantBackfill.ready ? 'yes' : 'no'}`,
    `- qdrant_backfill_blockers: ${report.qdrantBackfill.blockers.length ? report.qdrantBackfill.blockers.join(', ') : 'none'}`,
    `- qdrant_backfill_notes: ${report.qdrantBackfill.notes}`,
    '',
    '## Retrieval Telemetry',
    '',
    `- status: ${report.telemetry?.status ?? 'SOURCE_UNAVAILABLE'}`,
    `- detail: ${report.telemetry?.detail ?? 'n/a'}`,
    `- total rows: ${report.telemetry?.totalRows ?? 'n/a'}`,
    `- recent 24h rows: ${report.telemetry?.recent24hRows ?? 'n/a'}`,
    `- rows with selected_packet_keys: ${report.telemetry?.withSelectedPacketKeys ?? 'n/a'}`,
    `- rows with feature_ids: ${report.telemetry?.withFeatureIds ?? 'n/a'}`,
    `- rows with retrieval_strategy: ${report.telemetry?.withStrategy ?? 'n/a'}`,
    `- latest at: ${report.telemetry?.latestAt ?? 'n/a'}`,
    '',
    '## Notes',
    '',
    '- This report is read-only.',
    '- READY means the env and probe match the expected local lane.',
    '- PORT_MISMATCH means the env points at the wrong port for the local lane.',
    '- ENV_MISMATCH means the env points at the wrong host or is malformed.',
    '- SERVICE_STOPPED means the env looks right but the service is not accepting TCP connections.',
    '- AUTH_REQUIRED means the service is reachable but the configured credentials are missing for the secured lane.',
    '- SOURCE_UNAVAILABLE means the env input could not be resolved.',
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const env = loadRepoEnv(process.env);

  const postgresConfig = parsePostgresConfig(env);
  const qdrantConfig = parseQdrantConfig(env);
  const neo4jConfig = parseNeo4jConfig(env);
  const redisConfig = parseRedisConfig(env);
  const goRetrievalConfig = parseGoRetrievalConfig(env);

  const probes = {
    postgres: await tcpProbe(postgresConfig.host ?? EXPECTED.postgres.host, postgresConfig.port ?? EXPECTED.postgres.port),
    qdrant: await tcpProbe(qdrantConfig.host ?? EXPECTED.qdrant.host, qdrantConfig.port ?? EXPECTED.qdrant.port),
    neo4j: await tcpProbe(neo4jConfig.host ?? EXPECTED.neo4j.host, neo4jConfig.port ?? EXPECTED.neo4j.port),
    redis: await tcpProbe(redisConfig.host ?? EXPECTED.redis.host, redisConfig.port ?? EXPECTED.redis.port),
    goRetrievalHttp: await tcpProbe(goRetrievalConfig.host ?? EXPECTED.goRetrieval.host, goRetrievalConfig.httpPort ?? EXPECTED.goRetrieval.httpPort),
    goRetrievalGrpc: await tcpProbe(goRetrievalConfig.host ?? EXPECTED.goRetrieval.host, goRetrievalConfig.grpcPort ?? EXPECTED.goRetrieval.grpcPort),
  };

  const services = [
    {
      name: 'Postgres 18',
      expected: EXPECTED.postgres,
      envDisplay: postgresConfig.raw ? formatHostPort(postgresConfig.host, postgresConfig.port) : 'missing',
      probeDisplay: probes.postgres.ok ? `${probes.postgres.latencyMs}ms` : probes.postgres.error || 'refused',
      detail: postgresConfig.raw ? `DATABASE_URL=${postgresConfig.raw}` : 'DATABASE_URL missing',
      status: classifyTcpProbe(
        probes.postgres,
        EXPECTED.postgres,
        classifyHostPort(postgresConfig, EXPECTED.postgres),
      ),
    },
    {
      name: 'Qdrant',
      expected: EXPECTED.qdrant,
      envDisplay: qdrantConfig.raw ? formatHostPort(qdrantConfig.host, qdrantConfig.port) : `${qdrantConfig.host}:${qdrantConfig.port}`,
      probeDisplay: probes.qdrant.ok ? `${probes.qdrant.latencyMs}ms` : probes.qdrant.error || 'refused',
      detail: qdrantConfig.raw ? `QDRANT_URL=${qdrantConfig.raw}` : `QDRANT_HOST=${env.QDRANT_HOST ?? 'n/a'} QDRANT_PORT=${env.QDRANT_PORT ?? 'n/a'}`,
      status: classifyTcpProbe(
        probes.qdrant,
        EXPECTED.qdrant,
        qdrantConfig.configured ? classifyHostPort(qdrantConfig, EXPECTED.qdrant) : 'SOURCE_UNAVAILABLE',
      ),
    },
    {
      name: 'Neo4j',
      expected: EXPECTED.neo4j,
      envDisplay: neo4jConfig.raw ? formatHostPort(neo4jConfig.host, neo4jConfig.port) : 'missing',
      probeDisplay: probes.neo4j.ok ? `${probes.neo4j.latencyMs}ms` : probes.neo4j.error || 'refused',
      detail: neo4jConfig.raw ? `NEO4J_URI=${neo4jConfig.raw}` : 'NEO4J_URI missing',
      status: classifyTcpProbe(
        probes.neo4j,
        EXPECTED.neo4j,
        neo4jConfig.configured ? classifyHostPort(neo4jConfig, EXPECTED.neo4j) : 'SOURCE_UNAVAILABLE',
        true,
        neo4jConfig.authConfigured,
      ),
    },
    {
      name: 'Redis',
      expected: EXPECTED.redis,
      envDisplay: `${redisConfig.host}:${redisConfig.port}`,
      probeDisplay: probes.redis.ok ? `${probes.redis.latencyMs}ms` : probes.redis.error || 'refused',
      detail: redisConfig.raw ? `REDIS_URL=${redisConfig.raw}` : `REDIS_HOST=${env.REDIS_HOST ?? 'n/a'} REDIS_PORT=${env.REDIS_PORT ?? 'n/a'}`,
      status: classifyTcpProbe(
        probes.redis,
        EXPECTED.redis,
        redisConfig.configured ? classifyHostPort(redisConfig, EXPECTED.redis) : 'SOURCE_UNAVAILABLE',
        true,
        redisConfig.authConfigured,
      ),
    },
    {
      name: 'Go Retrieval (HTTP)',
      expected: { host: EXPECTED.goRetrieval.host, port: EXPECTED.goRetrieval.httpPort },
      envDisplay: `${goRetrievalConfig.host}:${goRetrievalConfig.httpPort}`,
      probeDisplay: probes.goRetrievalHttp.ok ? `${probes.goRetrievalHttp.latencyMs}ms` : probes.goRetrievalHttp.error || 'refused',
      detail: goRetrievalConfig.httpRaw
        ? `RETRIEVAL_HTTP_URL=${goRetrievalConfig.httpRaw}`
        : `RETRIEVAL_HOST=${env.RETRIEVAL_HOST ?? 'n/a'} RETRIEVAL_HTTP_PORT=${env.RETRIEVAL_HTTP_PORT ?? 'n/a'}`,
      status: classifyTcpProbe(
        probes.goRetrievalHttp,
        EXPECTED.goRetrieval,
        goRetrievalConfig.configured ? classifyHostPort({ host: goRetrievalConfig.host, port: goRetrievalConfig.httpPort }, { host: EXPECTED.goRetrieval.host, port: EXPECTED.goRetrieval.httpPort }) : 'SOURCE_UNAVAILABLE',
      ),
    },
    {
      name: 'Go Retrieval (gRPC)',
      expected: { host: EXPECTED.goRetrieval.host, port: EXPECTED.goRetrieval.grpcPort },
      envDisplay: `${goRetrievalConfig.host}:${goRetrievalConfig.grpcPort}`,
      probeDisplay: probes.goRetrievalGrpc.ok ? `${probes.goRetrievalGrpc.latencyMs}ms` : probes.goRetrievalGrpc.error || 'refused',
      detail: goRetrievalConfig.grpcRaw
        ? `RETRIEVAL_GRPC_URL=${goRetrievalConfig.grpcRaw}`
        : `RETRIEVAL_GRPC_PORT=${env.RETRIEVAL_GRPC_PORT ?? 'n/a'}`,
      status: classifyTcpProbe(
        probes.goRetrievalGrpc,
        { host: EXPECTED.goRetrieval.host, port: EXPECTED.goRetrieval.grpcPort },
        goRetrievalConfig.configured ? classifyHostPort({ host: goRetrievalConfig.host, port: goRetrievalConfig.grpcPort }, { host: EXPECTED.goRetrieval.host, port: EXPECTED.goRetrieval.grpcPort }) : 'SOURCE_UNAVAILABLE',
      ),
    },
  ].map((service) => ({
    ...service,
    status: service.status === 'READY' && service.name === 'Redis' && !redisConfig.authConfigured
      ? 'AUTH_REQUIRED'
      : service.status,
  }));

  const telemetry = await (async () => {
    try {
      if (services.find((svc) => svc.name === 'Postgres 18')?.status !== 'READY') {
        return {
          status: 'SOURCE_UNAVAILABLE',
          detail: 'retrieval_telemetry skipped because Postgres 18 is not READY',
        };
      }
      const pool = new Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
      try {
        const { rows } = await pool.query(`
          SELECT
            COUNT(*)::bigint AS total_rows,
            COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours')::bigint AS recent_24h_rows,
            COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(selected_packet_keys), 0) > 0)::bigint AS with_selected_packet_keys,
            COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(feature_ids), 0) > 0)::bigint AS with_feature_ids,
            COUNT(*) FILTER (WHERE retrieval_strategy IS NOT NULL)::bigint AS with_strategy,
            MAX(created_at) AS latest_at
          FROM retrieval_telemetry
        `);
        const row = rows[0] ?? {};
        const totalRows = Number(row.total_rows ?? 0);
        const recent24hRows = Number(row.recent_24h_rows ?? 0);
        const withSelectedPacketKeys = Number(row.with_selected_packet_keys ?? 0);
        const withFeatureIds = Number(row.with_feature_ids ?? 0);
        const withStrategy = Number(row.with_strategy ?? 0);
        return {
          status: totalRows > 0 && recent24hRows > 0 ? 'READY' : 'DEGRADED',
          totalRows,
          recent24hRows,
          withSelectedPacketKeys,
          withFeatureIds,
          withStrategy,
          latestAt: row.latest_at ?? null,
          detail:
            totalRows > 0
              ? `retrieval_telemetry rows=${totalRows}, recent24h=${recent24hRows}`
              : 'retrieval_telemetry is empty',
        };
      } finally {
        await pool.end();
      }
    } catch (error) {
      return {
        status: 'SOURCE_UNAVAILABLE',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  })();

  const report = {
    schema: 'live_service_env.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    services,
    telemetry,
    provenance: {
      spine: provenanceSpine(),
    },
    qdrantBackfill: classifyBackfillReadiness({
      postgres: services.find((s) => s.name === 'Postgres 18') ?? { status: 'SOURCE_UNAVAILABLE' },
      qdrant: services.find((s) => s.name === 'Qdrant') ?? { status: 'SOURCE_UNAVAILABLE' },
    }),
    summary: {
      counts: {
        READY: services.filter((svc) => svc.status === 'READY').length,
        ENV_MISMATCH: services.filter((svc) => svc.status === 'ENV_MISMATCH').length,
        PORT_MISMATCH: services.filter((svc) => svc.status === 'PORT_MISMATCH').length,
        SERVICE_STOPPED: services.filter((svc) => svc.status === 'SERVICE_STOPPED').length,
        AUTH_REQUIRED: services.filter((svc) => svc.status === 'AUTH_REQUIRED').length,
        SOURCE_UNAVAILABLE: services.filter((svc) => svc.status === 'SOURCE_UNAVAILABLE').length,
      },
      telemetryStatus: telemetry.status,
    },
  };

  await fsp.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fsp.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  await fsp.writeFile(REPORT_MD, renderMarkdown(report), 'utf8');

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('Live Service Env Audit');
    console.log(`READY ${report.summary.counts.READY} / ENV_MISMATCH ${report.summary.counts.ENV_MISMATCH} / PORT_MISMATCH ${report.summary.counts.PORT_MISMATCH} / SERVICE_STOPPED ${report.summary.counts.SERVICE_STOPPED} / AUTH_REQUIRED ${report.summary.counts.AUTH_REQUIRED} / SOURCE_UNAVAILABLE ${report.summary.counts.SOURCE_UNAVAILABLE}`);
    console.log(`Telemetry ${report.telemetry.status}: ${report.telemetry.detail}`);
    console.log(`Wrote ${REPORT_JSON}`);
    console.log(`Wrote ${REPORT_MD}`);
  }

  if (STRICT && !report.qdrantBackfill.ready) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[audit-live-service-env] fatal:', err);
  process.exit(1);
});
