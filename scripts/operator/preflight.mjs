#!/usr/bin/env node
/**
 * scripts/operator/preflight.mjs
 *
 * Phase 17 — Production Operator Preflight Bootstrapper.
 * Probes all production services at both TCP socket and application REST/API layers.
 * Establishes absolute operational health before launching SvelteKit gateway.
 */

import { createConnection } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const REPORTS_DIR = join(REPO_ROOT, 'docs/reports');

const ARGS = process.argv.slice(2);
const STRICT = ARGS.includes('--strict') || true; // Production defaults to strict!
const JSON_OUT = ARGS.includes('--json');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m'
};

const PROBES = [
  {
    name: 'Postgres (Core DB)',
    host: '127.0.0.1',
    port: 5434,
    required: true,
    type: 'tcp'
  },
  {
    name: 'Redis (Cache Layer)',
    host: '127.0.0.1',
    port: 6379,
    required: true,
    type: 'tcp'
  },
  {
    name: 'Qdrant (Vector DB)',
    host: '127.0.0.1',
    port: 6333,
    required: true,
    type: 'http',
    path: '/readyz'
  },
  {
    name: 'Neo4j (Graph DB)',
    host: '127.0.0.1',
    port: 7687,
    required: true,
    type: 'tcp'
  },
  {
    name: 'SearXNG (Web Search)',
    host: '127.0.0.1',
    port: 8889,
    required: false,
    type: 'http',
    path: '/'
  },
  {
    name: 'SeaweedFS Filer',
    host: '127.0.0.1',
    port: 8888,
    required: true,
    type: 'http',
    path: '/'
  },
  {
    name: 'SeaweedFS S3 Gateway',
    host: '127.0.0.1',
    port: 8333,
    required: true,
    type: 'http',
    path: '/'
  },
  {
    name: 'TurboQuant (LLM Engine)',
    host: '127.0.0.1',
    port: 8090,
    required: true,
    type: 'http',
    path: '/health'
  }
];

function tcpProbe(host, port, timeout = 2000) {
  return new Promise(resolve => {
    const socket = createConnection({ host, port });
    const t0 = Date.now();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ up: false, latencyMs: timeout, error: 'TIMEOUT' });
    }, timeout);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ up: true, latencyMs: Date.now() - t0 });
    });

    socket.once('error', err => {
      clearTimeout(timer);
      resolve({ up: false, latencyMs: Date.now() - t0, error: err.code || err.message });
    });
  });
}

function httpProbe(host, port, path, timeout = 2500) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const req = http.get({ host, port, path, timeout }, res => {
      const isOk = res.statusCode >= 200 && res.statusCode < 404; // 401/403 are up but unauthorized, which is fine for preflight
      res.resume(); // consume response data to free socket
      resolve({ up: isOk, latencyMs: Date.now() - t0, code: res.statusCode });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ up: false, latencyMs: timeout, error: 'TIMEOUT' });
    });

    req.on('error', err => {
      resolve({ up: false, latencyMs: Date.now() - t0, error: err.code || err.message });
    });
  });
}

async function main() {
  if (!JSON_OUT) {
    console.log(`\n${C.bold} [YoRHa Tactical Preflight Operator Sentinel] Checking Stack...${C.reset}\n`);
  }

  const results = [];
  let degraded = false;

  for (const p of PROBES) {
    let probeRes;
    if (p.type === 'http') {
      probeRes = await httpProbe(p.host, p.port, p.path);
    } else {
      probeRes = await tcpProbe(p.host, p.port);
    }

    const isHealthy = probeRes.up;
    if (p.required && !isHealthy) degraded = true;

    results.push({
      name: p.name,
      port: p.port,
      required: p.required,
      type: p.type,
      status: isHealthy ? 'ONLINE' : p.required ? 'CRITICAL_DOWN' : 'OPTIONAL_DOWN',
      latencyMs: probeRes.latencyMs,
      error: probeRes.error || null,
      statusCode: probeRes.code || null
    });

    if (!JSON_OUT) {
      const statusIcon = isHealthy 
        ? `${C.green}🟢 ONLINE${C.reset}`
        : p.required ? `${C.red}🔴 CRITICAL${C.reset}` : `${C.yellow}🟡 DEGRADED${C.reset}`;
      const latencyStr = isHealthy 
        ? `${C.gray}(${probeRes.latencyMs}ms)${C.reset}` 
        : `${C.gray}(${probeRes.error || 'OFFLINE'})${C.reset}`;

      console.log(`   * ${String(p.name).padEnd(24)} :${String(p.port).padEnd(5)} ── ${statusIcon} ${latencyStr}`);
    }
  }

  const report = {
    verifiedAt: new Date().toISOString(),
    status: degraded ? 'FAIL' : 'PASS',
    services: results,
    metrics: {
      total: results.length,
      online: results.filter(r => r.status === 'ONLINE').length,
      criticalDown: results.filter(r => r.status === 'CRITICAL_DOWN').length,
      optionalDown: results.filter(r => r.status === 'OPTIONAL_DOWN').length
    }
  };

  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(join(REPORTS_DIR, 'preflight-operator-report.json'), JSON.stringify(report, null, 2), 'utf8');

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(degraded ? 1 : 0);
  }

  console.log('\n   ────────────────────────────────────────────────────────────');
  if (degraded) {
    console.log(`   ${C.red}${C.bold}❌ PREFLIGHT CHECKS FAILED: CRITICAL SERVICES ARE OFFLINE${C.reset}`);
    console.log(`   Please run: ${C.cyan}docker compose -f docker-compose.production.yml up -d${C.reset}`);
    console.log(`   Or verify your local LLM engine with: ${C.cyan}npm run turbo:start${C.reset}\n`);
    process.exit(1);
  } else {
    console.log(`   ${C.green}${C.bold}✔ ALL SERVICES ONLINE: SYSTEM IS FULLY TACTICALLY OPERATIONAL${C.reset}\n`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('🔴 Critical preflight sentinel failure:', err);
  process.exit(2);
});
