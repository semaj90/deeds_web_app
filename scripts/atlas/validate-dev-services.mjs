#!/usr/bin/env node
/**
 * Dev service health gate.
 *
 * Checks that all local infrastructure services are reachable before
 * running audits that depend on them.
 *
 * Usage:
 *   node scripts/atlas/validate-dev-services.mjs [--json] [--strict] [--no-playwright]
 *
 * --strict       Exit 1 if any required service is down
 * --json         Machine-readable output
 * --no-playwright  Skip SvelteKit dev server check (port 5173)
 *
 * Output: docs/reports/dev-service-health-report.json
 */

import { createConnection } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const REPORTS_DIR   = join(REPO_ROOT, 'docs/reports');
const ARGS          = process.argv.slice(2);
const STRICT        = ARGS.includes('--strict');
const JSON_OUT      = ARGS.includes('--json');
const NO_PLAYWRIGHT = ARGS.includes('--no-playwright');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', gray: '\x1b[90m',
};

/** @type {Array<{name:string, host:string, port:number, required:boolean, envVar:string|null, skip?:boolean}>} */
const SERVICES = [
  { name: 'Postgres', host: '127.0.0.1', port: 5434, required: true, envVar: 'DATABASE_URL' },
  { name: 'Redis', host: '127.0.0.1', port: 6379, required: true, envVar: 'REDIS_URL' },
  { name: 'Qdrant', host: '127.0.0.1', port: 6333, required: false, envVar: null },
  { name: 'TRACE MCP', host: '127.0.0.1', port: 8788, required: false, envVar: 'TRACE_MCP_URL' },
  { name: 'Neo4j bolt', host: '127.0.0.1', port: 7687, required: false, envVar: null },
  { name: 'Neo4j browser', host: '127.0.0.1', port: 7474, required: false, envVar: null },
  {
    name: 'TurboQuant',
    host: '127.0.0.1',
    port: 8090,
    required: false,
    envVar: 'LLAMA_SERVER_URL',
  },
  { name: 'Ollama', host: '127.0.0.1', port: 11434, required: false, envVar: 'OLLAMA_HOST' },
  { name: 'RabbitMQ', host: '127.0.0.1', port: 5672, required: false, envVar: null },
  {
    name: 'SeaweedFS S3',
    host: '127.0.0.1',
    port: 8333,
    required: false,
    envVar: 'SEAWEED_S3_PORT',
  },
  {
    name: 'SvelteKit dev',
    host: '127.0.0.1',
    port: 5173,
    required: false,
    envVar: null,
    skip: NO_PLAYWRIGHT,
  },
];

function tcpProbe(host, port, timeoutMs = 2500) {
  return new Promise(resolve => {
    const socket = createConnection({ host, port });
    const t0 = Date.now();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ up: false, latencyMs: timeoutMs, error: 'timeout' });
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ up: true, latencyMs: Date.now() - t0 });
    });
    socket.once('error', err => {
      clearTimeout(timer);
      resolve({ up: false, latencyMs: Date.now() - t0, error: err.code ?? err.message });
    });
  });
}

async function traceMcpProtocolProbe(baseUrl, timeoutMs = 4000) {
  const signal = AbortSignal.timeout(timeoutMs);

  const healthRes = await fetch(`${baseUrl}/health`, { signal });
  if (!healthRes.ok) {
    throw new Error(`/health HTTP ${healthRes.status}`);
  }

  // GET /mcp is often 406 by design on streamable HTTP MCP endpoints.
  const getRes = await fetch(`${baseUrl}/mcp`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  const getStatus = getRes.status;
  const getExpected = getStatus === 406 || getStatus === 405 || getStatus === 415;

  const postRes = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    signal,
  });
  if (!postRes.ok) {
    throw new Error(`POST /mcp HTTP ${postRes.status}`);
  }

  return {
    healthStatus: healthRes.status,
    getMcpStatus: getStatus,
    getMcpExpected: getExpected,
    postMcpStatus: postRes.status,
  };
}

async function main() {
  if (!JSON_OUT) {
    console.log(`\n${C.bold}── Dev Service Health Gate ──${C.reset}\n`);
  }

  const results = [];
  let anyRequiredDown = false;

  for (const svc of SERVICES) {
    if (svc.skip) {
      results.push({ ...svc, status: 'skipped', latencyMs: 0, error: null });
      continue;
    }

    const probe = await tcpProbe(svc.host, svc.port);
    const status = probe.up ? 'up' : svc.required ? 'down_required' : 'down_optional';
    if (status === 'down_required') anyRequiredDown = true;

    results.push({
      name: svc.name, host: svc.host, port: svc.port,
      required: svc.required, status, latencyMs: probe.latencyMs,
      error: probe.error ?? null, envVar: svc.envVar ?? null,
    });

    if (!JSON_OUT) {
      const icon = probe.up
        ? `${C.green}✓${C.reset}`
        : svc.required ? `${C.red}✗${C.reset}` : `${C.yellow}○${C.reset}`;
      const lag = probe.up
        ? `${C.gray}${probe.latencyMs}ms${C.reset}`
        : `${C.gray}${probe.error ?? 'refused'}${C.reset}`;
      console.log(`  ${icon}  ${String(svc.name).padEnd(18)} :${svc.port}  ${lag}`);
    }
  }

  const traceMcpService = results.find((r) => r.name === 'TRACE MCP');
  if (traceMcpService?.status === 'up') {
    try {
      const details = await traceMcpProtocolProbe('http://127.0.0.1:8788');
      results.push({
        name: 'TRACE MCP protocol',
        host: '127.0.0.1',
        port: 8788,
        required: false,
        envVar: 'TRACE_MCP_URL',
        status: 'up',
        latencyMs: 0,
        error: null,
        details,
      });
      if (!JSON_OUT) {
        const getLabel = details.getMcpExpected
          ? `GET /mcp=${details.getMcpStatus} (expected)`
          : `GET /mcp=${details.getMcpStatus}`;
        console.log(
          `  ${C.green}✓${C.reset}  TRACE MCP protocol  ${C.gray}${getLabel}, POST /mcp=${details.postMcpStatus}${C.reset}`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        name: 'TRACE MCP protocol',
        host: '127.0.0.1',
        port: 8788,
        required: false,
        envVar: 'TRACE_MCP_URL',
        status: 'down_optional',
        latencyMs: 0,
        error: message,
      });
      if (!JSON_OUT) {
        console.log(`  ${C.yellow}○${C.reset}  TRACE MCP protocol  ${C.gray}${message}${C.reset}`);
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    strict: STRICT,
    services: results,
    summary: {
      up:           results.filter(r => r.status === 'up').length,
      downRequired: results.filter(r => r.status === 'down_required').length,
      downOptional: results.filter(r => r.status === 'down_optional').length,
      skipped:      results.filter(r => r.status === 'skipped').length,
    },
    status: anyRequiredDown ? 'degraded' : 'healthy',
  };

  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(join(REPORTS_DIR, 'dev-service-health-report.json'), JSON.stringify(report, null, 2));

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const col = anyRequiredDown ? C.red : C.green;
    console.log(`\n  Status: ${col}${report.status.toUpperCase()}${C.reset}`);
    console.log(`  ${report.summary.up} up  ${report.summary.downRequired} required-down  ${report.summary.downOptional} optional-down`);
    if (anyRequiredDown) {
      console.log(`\n  ${C.yellow}Required services down — start Docker containers:${C.reset}`);
      results
        .filter(r => r.status === 'down_required')
        .forEach(r => console.log(`    docker start legal-ai-${r.name.toLowerCase().replace(/\s+/g, '-')}`));
    }
    console.log(`\n  ${C.gray}Report → docs/reports/dev-service-health-report.json${C.reset}\n`);
  }

  if (STRICT && anyRequiredDown) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(2); });