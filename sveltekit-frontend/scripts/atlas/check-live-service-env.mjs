#!/usr/bin/env node
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, normalizeConnectionHost, resolveDatabaseUrl, resolveRedisConfig } from '../../../scripts/atlas/connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'live-service-env-audit.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'live-service-env-audit.md');

const EXPECTED = {
  postgres: { host: '127.0.0.1', port: 5434 },
  qdrant: { host: '127.0.0.1', port: 6333, httpPath: '/collections' },
  neo4j: { host: '127.0.0.1', port: 7687 },
  redis: { host: '127.0.0.1', port: 6379 },
};

function normalizeLocalHost(raw) {
  const host = normalizeConnectionHost(raw, EXPECTED.postgres.host);
  if (host === 'localhost') return '127.0.0.1';
  return host;
}

function hasValue(value) {
  return String(value ?? '').trim().length > 0;
}

function describePresence(value) {
  return hasValue(value) ? 'yes' : 'no';
}

function parseUrlLike(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  try {
    return new URL(value.includes('://') ? value : `http://${value}`);
  } catch {
    return null;
  }
}

async function probeTcp(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ ok: true }));
    socket.once('timeout', () => finish({ ok: false, reason: 'timeout', message: `TCP timeout after ${timeoutMs}ms` }));
    socket.once('error', (error) => finish({ ok: false, reason: 'error', message: error.message }));
  });
}

async function probeHttp(url, timeoutMs = 3000) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return { ok: response.ok, status: response.status, reachable: true };
  } catch (error) {
    return { ok: false, reachable: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function probeNeo4jDriver(uri, user, password, timeoutMs = 3000) {
  if (!hasValue(uri)) {
    return { ok: false, reachable: false, reason: 'ENV_MISMATCH', message: 'NEO4J_URI missing' };
  }
  if (!hasValue(user) || !hasValue(password)) {
    return { ok: false, reachable: false, reason: 'AUTH_REQUIRED', message: 'NEO4J_USER or NEO4J_PASSWORD missing' };
  }

  try {
    const neo4jMod = await import('neo4j-driver');
    const neo4j = neo4jMod.default ?? neo4jMod;
    const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      connectionTimeout: timeoutMs,
    });
    try {
      await driver.verifyConnectivity();
      return { ok: true, reachable: true };
    } finally {
      await driver.close().catch(() => {});
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const authLike = /auth|unauthoriz|credential|password/i.test(message);
    return {
      ok: false,
      reachable: false,
      reason: authLike ? 'AUTH_REQUIRED' : 'SERVICE_STOPPED',
      message,
    };
  }
}

function recommendationFrom({ envPresent, normalizedHost, normalizedPort, expectedHost, expectedPort, tcpReachable, authRequired = false }) {
  if (!envPresent) return 'ENV_MISMATCH';
  if (normalizedHost !== expectedHost || Number(normalizedPort) !== Number(expectedPort)) return 'PORT_MISMATCH';
  if (authRequired) return 'AUTH_REQUIRED';
  if (!tcpReachable) return 'SERVICE_STOPPED';
  return 'READY';
}

async function run() {
  const env = loadRepoEnv();

  const databaseUrlRaw = String(env.DATABASE_URL ?? '').trim();
  const postgresUrl = resolveDatabaseUrl(env);
  const postgresParsed = parseUrlLike(postgresUrl);
  const postgresHost = normalizeLocalHost(postgresParsed?.hostname ?? env.POSTGRES_HOST ?? '127.0.0.1');
  const postgresPort = Number(postgresParsed?.port ?? env.POSTGRES_PORT ?? EXPECTED.postgres.port);
  const postgresEnvPresent = hasValue(databaseUrlRaw) || hasValue(env.POSTGRES_HOST) || hasValue(env.POSTGRES_PORT);
  const postgresTcp = await probeTcp(postgresHost, postgresPort);

  const qdrantUrlRaw = String(env.QDRANT_URL ?? '').trim();
  const qdrantParsed = parseUrlLike(qdrantUrlRaw || `http://${EXPECTED.qdrant.host}:${EXPECTED.qdrant.port}`);
  const qdrantHost = normalizeLocalHost(qdrantParsed?.hostname ?? EXPECTED.qdrant.host);
  const qdrantPort = Number(qdrantParsed?.port ?? EXPECTED.qdrant.port);
  const qdrantEnvPresent = hasValue(qdrantUrlRaw);
  const qdrantTcp = await probeTcp(qdrantHost, qdrantPort);
  const qdrantHttp = await probeHttp(`${qdrantParsed?.protocol ?? 'http:'}//${qdrantHost}:${qdrantPort}${EXPECTED.qdrant.httpPath}`);
  const qdrantRecommendation = !qdrantEnvPresent
    ? 'ENV_MISMATCH'
    : (!qdrantTcp.ok ? 'SERVICE_STOPPED' : (qdrantHttp.ok ? 'READY' : (qdrantHttp.status === 401 || qdrantHttp.status === 403 ? 'AUTH_REQUIRED' : 'SERVICE_STOPPED')));

  const neo4jUriRaw = String(env.NEO4J_URI ?? '').trim();
  const neo4jParsed = parseUrlLike(neo4jUriRaw || `bolt://${EXPECTED.neo4j.host}:${EXPECTED.neo4j.port}`);
  const neo4jHost = normalizeLocalHost(neo4jParsed?.hostname ?? EXPECTED.neo4j.host);
  const neo4jPort = Number(neo4jParsed?.port ?? EXPECTED.neo4j.port);
  const neo4jEnvPresent = hasValue(neo4jUriRaw);
  const neo4jTcp = await probeTcp(neo4jHost, neo4jPort);
  const neo4jDriver = await probeNeo4jDriver(
    neo4jUriRaw || `bolt://${neo4jHost}:${neo4jPort}`,
    env.NEO4J_USER ?? env.NEO4J_USERNAME ?? '',
    env.NEO4J_PASSWORD ?? env.NEO4J_PASS ?? ''
  );
  const neo4jRecommendation = !neo4jEnvPresent
    ? 'ENV_MISMATCH'
    : neo4jDriver.ok
      ? 'READY'
      : neo4jDriver.reason || (neo4jTcp.ok ? 'AUTH_REQUIRED' : 'SERVICE_STOPPED');

  const redisConfig = resolveRedisConfig(env);
  const redisEnvPresent = hasValue(env.REDIS_URL) || hasValue(env.REDIS_HOST) || hasValue(env.REDIS_PORT);
  const redisHost = normalizeLocalHost(redisConfig.host);
  const redisPort = Number(redisConfig.port || EXPECTED.redis.port);
  const redisTcp = await probeTcp(redisHost, redisPort);
  const redisRecommendation = recommendationFrom({
    envPresent: redisEnvPresent,
    normalizedHost: redisHost,
    normalizedPort: redisPort,
    expectedHost: EXPECTED.redis.host,
    expectedPort: EXPECTED.redis.port,
    tcpReachable: redisTcp.ok,
    authRequired: false,
  });

  const postgresRecommendation = recommendationFrom({
    envPresent: postgresEnvPresent,
    normalizedHost: postgresHost,
    normalizedPort: postgresPort,
    expectedHost: EXPECTED.postgres.host,
    expectedPort: EXPECTED.postgres.port,
    tcpReachable: postgresTcp.ok,
    authRequired: false,
  });

  const qdrantRecommendationFinal = qdrantRecommendation;
  const neo4jRecommendationFinal = neo4jRecommendation;

  const report = {
    generatedAt: new Date().toISOString(),
    env: {
      DATABASE_URL: describePresence(env.DATABASE_URL),
      POSTGRES_HOST: describePresence(env.POSTGRES_HOST),
      POSTGRES_PORT: describePresence(env.POSTGRES_PORT),
      QDRANT_URL: describePresence(env.QDRANT_URL),
      NEO4J_URI: describePresence(env.NEO4J_URI),
      REDIS_URL: describePresence(env.REDIS_URL),
    },
    services: {
      postgres: {
        envPresent: postgresEnvPresent,
        rawUrl: databaseUrlRaw || null,
        normalizedHost: postgresHost,
        normalizedPort: postgresPort,
        expectedHost: EXPECTED.postgres.host,
        expectedPort: EXPECTED.postgres.port,
        tcpReachable: postgresTcp.ok,
        recommendation: postgresRecommendation,
        note: postgresTcp.ok ? 'TCP connect succeeded' : postgresTcp.message || 'TCP connect failed',
      },
      qdrant: {
        envPresent: qdrantEnvPresent,
        rawUrl: qdrantUrlRaw || null,
        normalizedHost: qdrantHost,
        normalizedPort: qdrantPort,
        expectedHost: EXPECTED.qdrant.host,
        expectedPort: EXPECTED.qdrant.port,
        tcpReachable: qdrantTcp.ok,
        httpReachable: qdrantHttp.ok,
        httpStatus: qdrantHttp.status ?? null,
        recommendation: qdrantRecommendationFinal,
        note: qdrantHttp.reachable ? `HTTP ${qdrantHttp.status}` : qdrantHttp.message || 'HTTP probe failed',
      },
      neo4j: {
        envPresent: neo4jEnvPresent,
        rawUrl: neo4jUriRaw || null,
        normalizedHost: neo4jHost,
        normalizedPort: neo4jPort,
        expectedHost: EXPECTED.neo4j.host,
        expectedPort: EXPECTED.neo4j.port,
        tcpReachable: neo4jTcp.ok,
        driverReachable: neo4jDriver.ok,
        recommendation: neo4jRecommendationFinal,
        note: neo4jDriver.ok ? 'driver verifyConnectivity succeeded' : neo4jDriver.message || 'driver probe failed',
      },
      redis: {
        envPresent: redisEnvPresent,
        rawUrl: env.REDIS_URL ?? null,
        normalizedHost: redisHost,
        normalizedPort: redisPort,
        expectedHost: EXPECTED.redis.host,
        expectedPort: EXPECTED.redis.port,
        tcpReachable: redisTcp.ok,
        recommendation: redisRecommendation,
        note: redisTcp.ok ? 'TCP connect succeeded' : redisTcp.message || 'TCP connect failed',
      },
    },
  };

  const lines = [
    '# Live Service Env Audit',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Env Presence',
    '',
    `- DATABASE_URL: ${report.env.DATABASE_URL}`,
    `- POSTGRES_HOST: ${report.env.POSTGRES_HOST}`,
    `- POSTGRES_PORT: ${report.env.POSTGRES_PORT}`,
    `- QDRANT_URL: ${report.env.QDRANT_URL}`,
    `- NEO4J_URI: ${report.env.NEO4J_URI}`,
    `- REDIS_URL: ${report.env.REDIS_URL}`,
    '',
    '## Services',
    '',
    ...Object.entries(report.services).flatMap(([name, svc]) => [
      `- ${name}`,
      `  - env present: ${svc.envPresent ? 'yes' : 'no'}`,
      `  - raw url: ${svc.rawUrl ?? 'n/a'}`,
      `  - normalized host/port: ${svc.normalizedHost}:${svc.normalizedPort}`,
      `  - expected host/port: ${svc.expectedHost}:${svc.expectedPort}`,
      `  - tcp reachable: ${svc.tcpReachable ? 'yes' : 'no'}`,
      ...(svc.httpReachable !== undefined ? [`  - http reachable: ${svc.httpReachable ? 'yes' : 'no'}`] : []),
      ...(svc.httpStatus !== undefined && svc.httpStatus !== null ? [`  - http status: ${svc.httpStatus}`] : []),
      ...(svc.driverReachable !== undefined ? [`  - driver reachable: ${svc.driverReachable ? 'yes' : 'no'}`] : []),
      `  - recommendation: ${svc.recommendation}`,
      `  - note: ${svc.note}`,
    ]),
    '',
    '## Readiness Interpretation',
    '',
    '- Postgres ECONNREFUSED at 127.0.0.1:5434 is usually SERVICE_STOPPED when DATABASE_URL already targets the expected port.',
    '- Qdrant fetch failure means the HTTP API did not respond from the resolved host/port.',
    '- Neo4j driver failure means either the bolt service is down, the URI/port is wrong, or credentials are missing/invalid.',
  ];

  await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(REPORT_MD, `${lines.join('\n')}\n`, 'utf8');

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  console.log(JSON.stringify(report.services, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
