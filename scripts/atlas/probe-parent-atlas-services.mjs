#!/usr/bin/env node

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-service-probes.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-service-probes.md');
const timeoutMs = Number(process.env.ATLAS_SERVICE_PROBE_TIMEOUT_MS || 5000);

function now() {
  return Date.now();
}

function parseUrl(rawUrl, fallbackPort) {
  try {
    const url = new URL(rawUrl);
    return {
      url: rawUrl,
      host: url.hostname || '127.0.0.1',
      port: Number(url.port || fallbackPort),
    };
  } catch {
    return {
      url: rawUrl,
      host: '127.0.0.1',
      port: fallbackPort,
    };
  }
}

function serviceProbe({ service_name, url, port, transport, status, fallback_used, started, error, details }) {
  return {
    service_name,
    url,
    port,
    transport,
    status,
    fallback_used: Boolean(fallback_used),
    duration_ms: Math.max(0, now() - started),
    ...(error ? { error: String(error) } : {}),
    ...(details ? { details } : {}),
  };
}

async function httpProbe({ service_name, url, port, pathName = '/health', validate, fallback }) {
  const started = now();
  const fullUrl = `${String(url).replace(/\/+$/, '')}${pathName}`;
  try {
    const response = await fetch(fullUrl, { signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    let body = text;
    try { body = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
    const valid = validate ? validate(body, response) : response.ok;
    return serviceProbe({
      service_name,
      url,
      port,
      transport: 'http',
      status: valid ? 'LIVE_PASS' : 'FAIL',
      fallback_used: false,
      started,
      error: valid ? undefined : `HTTP ${response.status}`,
      details: { http_status: response.status, body },
    });
  } catch (error) {
    if (fallback) return fallback(error, started);
    return serviceProbe({
      service_name,
      url,
      port,
      transport: 'http',
      status: 'FAIL',
      fallback_used: false,
      started,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function tcpProbe({ service_name, host = '127.0.0.1', port, transport = 'grpc', url = `${host}:${port}` }) {
  const started = now();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(serviceProbe({
        service_name,
        url,
        port,
        transport,
        status: result.ok ? 'LIVE_PASS' : 'FAIL',
        fallback_used: false,
        started,
        error: result.error,
      }));
    };
    socket.once('connect', () => finish({ ok: true }));
    socket.once('error', (error) => finish({ ok: false, error: error.message }));
    socket.setTimeout(timeoutMs, () => finish({ ok: false, error: `TCP timeout after ${timeoutMs}ms` }));
  });
}

async function postgresProbe() {
  const started = now();
  const url = resolveDatabaseUrl(env);
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: timeoutMs });
  try {
    await pool.query('select 1');
    return serviceProbe({
      service_name: 'postgres',
      url: url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@'),
      port: Number(new URL(url).port || 5432),
      transport: 'postgres',
      status: 'LIVE_PASS',
      fallback_used: false,
      started,
    });
  } catch (error) {
    return serviceProbe({
      service_name: 'postgres',
      url: url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@'),
      port: (() => { try { return Number(new URL(url).port || 5432); } catch { return 5432; } })(),
      transport: 'postgres',
      status: 'FAIL',
      fallback_used: false,
      started,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await pool.end().catch(() => {});
  }
}

function redisProbe() {
  const started = now();
  const container = env.REDIS_CONTAINER || 'legal-ai-valkey';
  const password = env.REDIS_PASSWORD || env.VALKEY_PASSWORD || '';
  const args = ['exec', container, 'redis-cli'];
  if (password) args.push('-a', password);
  args.push('PING');
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: timeoutMs });
  const ok = result.status === 0 && String(result.stdout || '').includes('PONG');
  return serviceProbe({
    service_name: 'redis-valkey',
    url: env.REDIS_URL || 'redis://127.0.0.1:6379',
    port: 6379,
    transport: 'redis',
    status: ok ? 'LIVE_PASS' : 'FAIL',
    fallback_used: false,
    started,
    error: ok ? undefined : String(result.stderr || result.stdout || `redis-cli exit ${result.status}`),
  });
}

async function main() {
  const gemma = parseUrl(env.LLAMA_SERVER_URL || env.TURBOQUANT_BASE_URL || 'http://127.0.0.1:8090', 8090);
  const lang = parseUrl(env.LANGEXTRACT_URL || 'http://127.0.0.1:8096', 8096);
  const goRetrieval = parseUrl(env.GO_RETRIEVAL_HTTP_URL || env.RETRIEVAL_HTTP_URL || 'http://127.0.0.1:8100', 8100);
  const embedding = parseUrl(env.OLLAMA_EMBED_BASE_URL || env.EMBED_SERVER_URL || 'http://127.0.0.1:8081', 8081);
  const qdrant = parseUrl(env.QDRANT_URL || 'http://127.0.0.1:6333', 6333);
  const neo4j = parseUrl(env.NEO4J_HTTP_URL || 'http://127.0.0.1:7474', 7474);
  const seaweed = parseUrl(env.SEAWEEDFS_URL || env.SEAWEED_S3_URL || 'http://127.0.0.1:8333', 8333);

  const probes = [];
  probes.push(await httpProbe({
    service_name: 'gemma4-llama-server',
    url: gemma.url,
    port: gemma.port,
    pathName: '/v1/models',
    validate: (body) => Array.isArray(body?.data) || Array.isArray(body?.models),
  }));
  probes.push(await httpProbe({
    service_name: 'langextract',
    url: lang.url,
    port: lang.port,
    pathName: '/health',
    validate: (body) => body?.services?.llama_server_available === true,
    fallback: async (error, started) => {
      const fallbackProbe = await httpProbe({
        service_name: 'gemma4-llama-server',
        url: gemma.url,
        port: gemma.port,
        pathName: '/v1/models',
        validate: (body) => Array.isArray(body?.data) || Array.isArray(body?.models),
      });
      return serviceProbe({
        service_name: 'langextract',
        url: lang.url,
        port: lang.port,
        transport: 'http',
        status: fallbackProbe.status === 'LIVE_PASS' ? 'FALLBACK_PASS' : 'FAIL',
        fallback_used: fallbackProbe.status === 'LIVE_PASS',
        started,
        error: fallbackProbe.status === 'LIVE_PASS'
          ? `LangExtract unavailable; inline Gemma4 fallback available (${error?.message || error})`
          : `LangExtract unavailable and Gemma4 fallback failed (${error?.message || error})`,
        details: { fallback_url: gemma.url },
      });
    },
  }));
  probes.push(await tcpProbe({
    service_name: 'turbovec-grpc',
    host: '127.0.0.1',
    port: Number((env.TURBOVEC_GRPC_URL || env.TURBOVEC_SIDECAR_GRPC_URL || '127.0.0.1:50062').split(':').pop() || 50062),
    transport: 'grpc',
  }));
  probes.push(await httpProbe({
    service_name: 'go-retrieval',
    url: goRetrieval.url,
    port: goRetrieval.port,
    pathName: '/health',
    validate: (body) => body?.status === 'healthy',
  }));
  probes.push(await httpProbe({
    service_name: 'embeddinggemma',
    url: embedding.url,
    port: embedding.port,
    pathName: '/v1/models',
    validate: (body) => Array.isArray(body?.data) || Array.isArray(body?.models),
    fallback: async (error, started) => {
      const ollama = parseUrl(env.OLLAMA_URL || 'http://127.0.0.1:11434', 11434);
      const fallbackProbe = await httpProbe({
        service_name: 'embeddinggemma',
        url: ollama.url,
        port: ollama.port,
        pathName: '/api/tags',
        validate: (body) => Array.isArray(body?.models) && body.models.some((model) => String(model?.name || '').includes('embeddinggemma')),
      });
      return serviceProbe({
        service_name: 'embeddinggemma',
        url: embedding.url,
        port: embedding.port,
        transport: 'http',
        status: fallbackProbe.status === 'LIVE_PASS' ? 'FALLBACK_PASS' : 'FAIL',
        fallback_used: fallbackProbe.status === 'LIVE_PASS',
        started,
        error: fallbackProbe.status === 'LIVE_PASS'
          ? `OpenAI-compatible embedding endpoint unavailable; Ollama EmbeddingGemma fallback available (${error?.message || error})`
          : `Embedding endpoint unavailable and Ollama fallback failed (${error?.message || error})`,
        details: { fallback_url: ollama.url },
      });
    },
  }));
  probes.push(await httpProbe({
    service_name: 'qdrant',
    url: qdrant.url,
    port: qdrant.port,
    pathName: '/collections',
    validate: (body) => body?.status === 'ok' && Array.isArray(body?.result?.collections),
  }));
  probes.push(await postgresProbe());
  probes.push(await httpProbe({
    service_name: 'seaweedfs',
    url: seaweed.url,
    port: seaweed.port,
    pathName: '/',
    validate: (_body, response) => response.status < 500,
  }));
  probes.push(await httpProbe({
    service_name: 'neo4j',
    url: neo4j.url,
    port: neo4j.port,
    pathName: '/',
    validate: (_body, response) => response.status < 500,
  }));
  probes.push(redisProbe());

  const legacyWarnings = [];
  const staleLang = await httpProbe({
    service_name: 'langextract-stale-8095',
    url: 'http://127.0.0.1:8095',
    port: 8095,
    pathName: '/health',
    validate: (body) => body?.services?.llama_server_available === true,
  });
  if (staleLang.status !== 'FAIL') {
    legacyWarnings.push({
      lane: 'langextract-stale-8095',
      severity: 'WARN',
      reason: 'Legacy LangExtract port responded as Gemma4-compatible; canonical port is 8096.',
      probe: staleLang,
    });
  } else if (staleLang.details?.body?.services?.ollama_available === true) {
    legacyWarnings.push({
      lane: 'langextract-stale-8095',
      severity: 'WARN',
      reason: 'Legacy LangExtract listener still advertises ollama_available; canonical Gemma4-backed LangExtract is 127.0.0.1:8096.',
      probe: staleLang,
    });
  }

  const staleTurboVec = await httpProbe({
    service_name: 'turbovec-jsonrpc',
    url: env.TURBOVEC_LEGACY_JSONRPC_URL || 'http://127.0.0.1:8792',
    port: 8792,
    pathName: '/health',
    validate: (body) => body?.status === 'ok' || body?.status === 'healthy' || body?.indexed !== undefined,
  });
  if (staleTurboVec.status !== 'LIVE_PASS') {
    legacyWarnings.push({
      lane: 'turbovec-jsonrpc-8792',
      severity: 'WARN',
      reason: 'Legacy TurboVec JSON-RPC wrapper is not live; canonical accelerator proof uses TurboVec gRPC on 50062 and HTTP ANN sidecar on 8791.',
      probe: staleTurboVec,
    });
  }

  const livePass = probes.filter((probe) => probe.status === 'LIVE_PASS').length;
  const fallbackPass = probes.filter((probe) => probe.status === 'FALLBACK_PASS').length;
  const fail = probes.filter((probe) => probe.status === 'FAIL').length;
  const criticalServices = new Set(['gemma4-llama-server', 'langextract', 'turbovec-grpc', 'go-retrieval', 'embeddinggemma', 'qdrant', 'postgres', 'redis-valkey']);
  const criticalFailures = probes.filter((probe) => criticalServices.has(probe.service_name) && probe.status === 'FAIL');
  const status = criticalFailures.length ? 'FAIL' : (fallbackPass || fail || legacyWarnings.length) ? 'PASS_WITH_WARNINGS' : 'LIVE_PASS';

  const report = {
    generated_at: new Date().toISOString(),
    status,
    summary: { livePass, fallbackPass, fail, criticalFailures: criticalFailures.length, legacyWarnings: legacyWarnings.length },
    probes,
    legacy_warnings: legacyWarnings,
    opentelemetry_mapping: {
      resource_attributes: ['service_name', 'url', 'port', 'transport'],
      span_attributes: ['status', 'fallback_used', 'duration_ms', 'error'],
    },
    rule: 'LIVE_PASS requires the real service, real port, and real transport. FALLBACK_PASS is WARN, never green success.',
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(REPORT_MD, [
    '# Parent Atlas Service Probes',
    '',
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    '',
    '## Summary',
    '',
    `- LIVE_PASS: ${livePass}`,
    `- FALLBACK_PASS: ${fallbackPass}`,
    `- FAIL: ${fail}`,
    `- critical failures: ${criticalFailures.length}`,
    `- legacy warnings: ${legacyWarnings.length}`,
    '',
    '## Probes',
    '',
    '| service | transport | url | status | fallback | ms | error |',
    '|---|---:|---|---:|---:|---:|---|',
    ...probes.map((probe) => `| ${probe.service_name} | ${probe.transport} | ${probe.url} | ${probe.status} | ${probe.fallback_used} | ${probe.duration_ms} | ${(probe.error || '').replace(/\|/g, '/')} |`),
    '',
    '## Legacy Warnings',
    '',
    ...legacyWarnings.map((warning) => `- ${warning.lane}: ${warning.reason}`),
    '',
  ].join('\n'), 'utf8');

  console.log(JSON.stringify(report, null, 2));
  process.exit(status === 'FAIL' ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
