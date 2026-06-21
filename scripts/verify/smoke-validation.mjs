#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import pg from 'pg';
import IORedis from 'ioredis';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

import { loadRepoEnv, resolveRedisConfig } from '../atlas/connection-config.mjs';

function pingPort(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = 'closed';

    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      status = 'open';
      socket.destroy();
    });

    socket.on('error', () => {
      status = 'closed';
      socket.destroy();
    });

    socket.on('timeout', () => {
      status = 'timeout';
      socket.destroy();
    });

    socket.on('close', () => {
      resolve(status);
    });
  });
}

async function pingHttp(url, timeout = 2000) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res.ok ? 'open' : `HTTP_${res.status}`;
  } catch (err) {
    return 'closed';
  }
}

async function main() {
  console.log('\n=== Smoke Validation Lane ===\n');

  const report = {
    timestamp: new Date().toISOString(),
    lane: 'smoke',
    status: 'PASS',
    checks: {},
  };

  let hasFailures = false;

  // 1. package.json checks
  console.log('1. Checking package.json script registrations…');
  try {
    const pkgPath = path.join(ROOT, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const requiredScripts = [
      'verify:smoke',
      'verify:story',
      'verify:atlas',
      'verify:cubic',
      'verify:verdict',
      'verify:full'
    ];
    const missing = [];
    for (const script of requiredScripts) {
      if (!pkg.scripts?.[script]) {
        missing.push(script);
      }
    }
    if (missing.length > 0) {
      report.checks.scripts = { status: 'FAIL', detail: `Missing scripts: ${missing.join(', ')}` };
      hasFailures = true;
      console.log(`  ❌ Missing: ${missing.join(', ')}`);
    } else {
      report.checks.scripts = { status: 'PASS', detail: 'All 6 verify scripts registered' };
      console.log('  ✅ All verification scripts registered.');
    }
  } catch (err) {
    report.checks.scripts = { status: 'FAIL', detail: err.message };
    hasFailures = true;
    console.log(`  ❌ Failed to parse package.json: ${err.message}`);
  }

  // 2. Discover environment variables
  console.log('\n2. Discovered environment variables presence (security mode)…');
  const env = loadRepoEnv(process.env);
  const checkEnvVars = [
    'DATABASE_URL',
    'QDRANT_URL',
    'REDIS_URL',
    'REDIS_PASSWORD',
    'VALKEY_URL',
    'VALKEY_PASSWORD',
    'GEMMA_API_URL',
    'OLLAMA_URL',
  ];
  const envStatus = {};
  for (const v of checkEnvVars) {
    envStatus[v] = env[v] ? 'present' : 'missing';
  }
  report.checks.environment = { status: 'PASS', detail: envStatus };
  console.log('  ✅ Environment variables presence scanned.');

  // 3. Ping local services
  console.log('\n3. Pinging infrastructure services…');
  const pings = {};

  // Qdrant
  const qdrantUrl = env.QDRANT_URL || 'http://127.0.0.1:6333';
  pings.qdrant = await pingHttp(`${qdrantUrl}/readyz`).catch(() => 'closed');
  console.log(`  Qdrant (${qdrantUrl}): ${pings.qdrant === 'open' ? '✅' : '❌'} (${pings.qdrant})`);

  // Postgres
  const dbUrl = env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
  let pgStatus = 'closed';
  try {
    const pool = new pg.Pool({ connectionString: dbUrl, connectionTimeoutMillis: 2000 });
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    await pool.end();
    pgStatus = 'open';
  } catch (err) {
    pgStatus = `error: ${err.message}`;
  }
  pings.postgres = pgStatus;
  console.log(`  Postgres (${dbUrl.split('@')[1] || 'default'}): ${pgStatus === 'open' ? '✅' : '❌'} (${pgStatus})`);

  // Valkey/Redis
  const redisConfig = resolveRedisConfig(env);
  let redisStatus = 'closed';
  try {
    const client = new IORedis.default({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password || 'redis',
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    client.on('error', () => {});
    await client.connect();
    await client.ping();
    await client.quit().catch(() => {});
    redisStatus = 'open';
  } catch (err) {
    redisStatus = `error: ${err.message}`;
  }
  pings.redis = redisStatus;
  console.log(`  Redis/Valkey (${redisConfig.host}:${redisConfig.port}): ${redisStatus === 'open' ? '✅' : '❌'} (${redisStatus})`);

  // Neo4j
  pings.neo4j_http = await pingHttp('http://127.0.0.1:7474').catch(() => 'closed');
  pings.neo4j_bolt = await pingPort('127.0.0.1', 7687);
  console.log(`  Neo4j HTTP (7474): ${pings.neo4j_http === 'open' ? '✅' : '❌'} (${pings.neo4j_http})`);
  console.log(`  Neo4j Bolt (7687): ${pings.neo4j_bolt === 'open' ? '✅' : '❌'} (${pings.neo4j_bolt})`);

  // Gemma4 Synthesis (8090)
  pings.gemma4 = await pingHttp('http://127.0.0.1:8090/v1/models').catch(() => 'closed');
  console.log(`  Gemma4 Synthesis (8090): ${pings.gemma4 === 'open' ? '✅' : '❌'} (${pings.gemma4})`);

  // Ollama (11434)
  pings.ollama = await pingHttp('http://127.0.0.1:11434/').catch(() => 'closed');
  console.log(`  Ollama (11434): ${pings.ollama === 'open' ? '✅' : '❌'} (${pings.ollama})`);

  // Go Retrieval
  pings.go_retrieval_grpc = await pingPort('127.0.0.1', 50053);
  pings.go_retrieval_http = await pingPort('127.0.0.1', 8100);
  console.log(`  Go Retrieval gRPC (50053): ${pings.go_retrieval_grpc === 'open' ? '✅' : '❌'} (${pings.go_retrieval_grpc})`);
  console.log(`  Go Retrieval HTTP (8100): ${pings.go_retrieval_http === 'open' ? '✅' : '❌'} (${pings.go_retrieval_http})`);

  report.checks.services = {
    status: (pings.qdrant === 'open' && pings.postgres === 'open' && pings.redis === 'open') ? 'PASS' : 'PARTIAL',
    detail: pings,
  };
  if (report.checks.services.status === 'PARTIAL') {
    console.log('  ⚠️  Some optional infrastructure services are down.');
  }

  // 4. Svelte compilation / TypeScript check
  console.log('\n4. Running TypeScript/Svelte compilation check…');
  try {
    const svelteRoot = path.join(ROOT, 'sveltekit-frontend');
    const out = execSync('npx svelte-check --threshold error', { cwd: svelteRoot, stdio: 'pipe' }).toString();
    report.checks.typescript = { status: 'PASS', detail: 'svelte-check completed without errors' };
    console.log('  ✅ TypeScript/Svelte check passed.');
  } catch (err) {
    const outputMsg = err.stdout ? err.stdout.toString() : err.message;
    report.checks.typescript = { status: 'FAIL', detail: outputMsg };
    hasFailures = true;
    console.log('  ❌ TypeScript/Svelte check failed:');
    console.log(outputMsg.slice(0, 1000));
  }

  report.status = hasFailures ? 'FAIL' : (report.checks.services.status === 'PARTIAL' ? 'PARTIAL' : 'PASS');

  // Save report
  const tmpDir = path.join(ROOT, '.tmp');
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(path.join(tmpDir, 'verify-smoke.json'), JSON.stringify(report, null, 2));
  console.log(`\nSmoke validation lane report saved to .tmp/verify-smoke.json with status: ${report.status}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
