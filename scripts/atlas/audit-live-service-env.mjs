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

const EXPECTED = {
  postgres: { host: '127.0.0.1', port: 5434 },
  qdrant: { host: '127.0.0.1', port: 6333 },
  neo4j: { host: '127.0.0.1', port: 7687 },
  redis: { host: '127.0.0.1', port: 6379 },
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

function provenanceSpine() {
  return [
    'source_ref',
    'parent_atlas_documents',
    'feature_id',
    'atlas_feature_map',
    'qdrant_point_id',
    'route_runtime_packets',
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

  const probes = {
    postgres: await tcpProbe(postgresConfig.host ?? EXPECTED.postgres.host, postgresConfig.port ?? EXPECTED.postgres.port),
    qdrant: await tcpProbe(qdrantConfig.host ?? EXPECTED.qdrant.host, qdrantConfig.port ?? EXPECTED.qdrant.port),
    neo4j: await tcpProbe(neo4jConfig.host ?? EXPECTED.neo4j.host, neo4jConfig.port ?? EXPECTED.neo4j.port),
    redis: await tcpProbe(redisConfig.host ?? EXPECTED.redis.host, redisConfig.port ?? EXPECTED.redis.port),
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
  ].map((service) => ({
    ...service,
    status: service.status === 'READY' && service.name === 'Redis' && !redisConfig.authConfigured
      ? 'AUTH_REQUIRED'
      : service.status,
  }));

  const report = {
    schema: 'live_service_env.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    services,
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
    console.log(`Wrote ${REPORT_JSON}`);
    console.log(`Wrote ${REPORT_MD}`);
  }

  if (STRICT && !report.qdrantBackfill.ready) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[audit-live-service-env] fatal:', err);
  process.exit(1);
});
