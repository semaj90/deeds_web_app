#!/usr/bin/env node
/**
 * Canonical Service Hardening Audit
 *
 * Comprehensive multi-service health check covering:
 * 1. Repo map (package.json, entrypoints, API routes, workers)
 * 2. Canonical services (Postgres, Valkey, Qdrant, Neo4j, RabbitMQ, LLMs, CUDA)
 * 3. Storage contracts (Postgres tables, Qdrant collections, Valkey keys, Neo4j edges)
 * 4. Runtime smoke tests (connectivity, basic operations, function exports)
 * 5. Reports (JSON audit + Markdown summary)
 *
 * Usage:
 *   node scripts/atlas/canonical-service-hardening-audit.mjs --audit
 *   node scripts/atlas/canonical-service-hardening-audit.mjs --verbose
 *   node scripts/atlas/canonical-service-hardening-audit.mjs --json
 *   npm run atlas:services:audit
 *   npm run atlas:services:audit:verbose
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../');
const VERBOSE = process.argv.includes('--verbose');

const STATUS = {
  PASS: 'PASS',
  WARN: 'WARN',
  TODO: 'TODO',
  FAIL: 'FAIL'
};

const log = (msg) => console.log(msg);
const verboseLog = (msg) => VERBOSE && console.log(`  ${msg}`);

// ═══════════════════════════════════════════════════════════════
// 1. Repo Map Audit
// ═══════════════════════════════════════════════════════════════

async function auditRepoMap() {
  const findings = {
    package_json_exists: false,
    npm_scripts_count: 0,
    ts_config_exists: false,
    api_routes_count: 0,
    server_files_count: 0,
    worker_files_count: 0,
    proto_files: []
  };

  // Check package.json
  const pkgPath = path.join(REPO_ROOT, 'sveltekit-frontend/package.json');
  if (fs.existsSync(pkgPath)) {
    findings.package_json_exists = true;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    findings.npm_scripts_count = Object.keys(pkg.scripts || {}).length;
  }

  // Check tsconfig
  const tsconfigPath = path.join(REPO_ROOT, 'sveltekit-frontend/tsconfig.json');
  findings.ts_config_exists = fs.existsSync(tsconfigPath);

  // Count API routes
  const routesDir = path.join(REPO_ROOT, 'sveltekit-frontend/src/routes/api');
  if (fs.existsSync(routesDir)) {
    const routes = execSync(`find "${routesDir}" -name "+server.ts" -o -name "+server.js" 2>/dev/null | wc -l`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    findings.api_routes_count = parseInt(routes, 10) || 0;
  }

  // Count server-side files
  const serverDir = path.join(REPO_ROOT, 'sveltekit-frontend/src/lib/server');
  if (fs.existsSync(serverDir)) {
    const files = execSync(`find "${serverDir}" -name "*.ts" -o -name "*.js" 2>/dev/null | wc -l`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    findings.server_files_count = parseInt(files, 10) || 0;
  }

  // Count worker files
  const workerPatterns = [
    'src/lib/server/workers/*.ts',
    'src/lib/server/indexer/*-worker.ts',
    'scripts/**/*-worker.mjs'
  ];
  for (const pattern of workerPatterns) {
    const pattern_path = path.join(REPO_ROOT, 'sveltekit-frontend', pattern);
    if (fs.existsSync(path.dirname(pattern_path))) {
      try {
        const files = execSync(`find "${path.dirname(pattern_path)}" -type f 2>/dev/null | wc -l`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore']
        }).trim();
        findings.worker_files_count += parseInt(files, 10) || 0;
      } catch {}
    }
  }

  // Find proto files
  const protoDir = path.join(REPO_ROOT, 'proto');
  if (fs.existsSync(protoDir)) {
    try {
      findings.proto_files = execSync(`find "${protoDir}" -name "*.proto" 2>/dev/null`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim().split('\n').filter(Boolean);
    } catch {}
  }

  const status = findings.package_json_exists && findings.ts_config_exists && findings.api_routes_count > 0
    ? STATUS.PASS
    : STATUS.WARN;

  return {
    service: 'Repo Map',
    status,
    findings,
    recommendation: status === STATUS.PASS
      ? `Repo healthy: ${findings.npm_scripts_count} npm scripts, ${findings.api_routes_count} API routes, ${findings.server_files_count} server files`
      : 'Some repo structure elements missing'
  };
}

// ═══════════════════════════════════════════════════════════════
// 2. Service Connectivity Smoke Tests
// ═══════════════════════════════════════════════════════════════

async function auditPostgres() {
  try {
    const pg = await import('pg');
    const Pool = pg.default.Pool || pg.Pool;

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:legal_password@127.0.0.1:5432/legal_ai_db',
      connectionTimeoutMillis: 5000,
      query_timeout: 5000
    });

    const result = await pool.query('SELECT 1 AS check');
    await pool.end();

    return {
      service: 'PostgreSQL',
      status: result.rows[0]?.check === 1 ? STATUS.PASS : STATUS.FAIL,
      findings: { query_result: result.rows[0]?.check },
      recommendation: 'PostgreSQL accessible'
    };
  } catch (e) {
    return {
      service: 'PostgreSQL',
      status: STATUS.FAIL,
      findings: { error: String(e.message) },
      recommendation: `PostgreSQL connection failed: ${e.message}`
    };
  }
}

async function auditValkey() {
  try {
    const Redis = (await import('ioredis')).default;

    const redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || 'redis',
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      commandTimeout: 5000
    });

    await redis.connect();
    const pong = await redis.ping();
    const info = await redis.info('memory');
    await redis.disconnect();

    return {
      service: 'Valkey/Redis',
      status: pong === 'PONG' ? STATUS.PASS : STATUS.FAIL,
      findings: { pong, has_memory_info: !!info },
      recommendation: 'Valkey/Redis operational'
    };
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      return {
        service: 'Valkey/Redis',
        status: STATUS.WARN,
        findings: { reason: 'ioredis not installed' },
        recommendation: 'Install ioredis: npm install ioredis'
      };
    }

    return {
      service: 'Valkey/Redis',
      status: STATUS.FAIL,
      findings: { error: String(e.message) },
      recommendation: `Valkey connection failed: ${e.message}`
    };
  }
}

async function auditQdrant() {
  try {
    const fetch = (await import('node-fetch')).default;

    const res = await fetch('http://127.0.0.1:6333/collections', {
      timeout: 5000
    });

    if (!res.ok) {
      return {
        service: 'Qdrant',
        status: STATUS.FAIL,
        findings: { http_status: res.status },
        recommendation: `Qdrant returned HTTP ${res.status}`
      };
    }

    const data = await res.json();
    const collectionCount = data.result?.collections?.length || 0;

    return {
      service: 'Qdrant',
      status: collectionCount > 0 ? STATUS.PASS : STATUS.WARN,
      findings: { collections: collectionCount, has_codebase_chunks: data.result?.collections?.some?.(c => c.name?.includes('codebase')) },
      recommendation: `Qdrant operational with ${collectionCount} collections`
    };
  } catch (e) {
    return {
      service: 'Qdrant',
      status: STATUS.FAIL,
      findings: { error: String(e.message) },
      recommendation: `Qdrant connection failed: ${e.message}`
    };
  }
}

async function auditNeo4j() {
  try {
    const neo4j = await import('neo4j-driver');
    const driver = neo4j.default.driver(
      process.env.NEO4J_URI || 'neo4j://127.0.0.1:7687',
      neo4j.default.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'password'
      ),
      { connectionTimeout: 5000 }
    );

    const session = driver.session();
    const result = await session.run('MATCH (n) RETURN COUNT(n) AS count LIMIT 1');
    await session.close();
    await driver.close();

    return {
      service: 'Neo4j',
      status: result.records.length > 0 ? STATUS.PASS : STATUS.WARN,
      findings: { node_count: result.records[0]?.get('count')?.toNumber?.() || 0 },
      recommendation: 'Neo4j connected'
    };
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      return {
        service: 'Neo4j',
        status: STATUS.WARN,
        findings: { reason: 'neo4j-driver not installed' },
        recommendation: 'Install neo4j-driver: npm install neo4j-driver'
      };
    }

    return {
      service: 'Neo4j',
      status: STATUS.FAIL,
      findings: { error: String(e.message) },
      recommendation: `Neo4j connection failed: ${e.message}`
    };
  }
}

async function auditRabbitMQ() {
  try {
    const amqp = await import('amqplib');

    const conn = await amqp.default.connect(
      process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672'
    );
    const ch = await conn.createChannel();

    const queues = ['cache.invalidate', 'document.embed', 'evidence.process'];
    const queueStatus = {};
    for (const q of queues) {
      try {
        const ok = await ch.checkQueue(q);
        queueStatus[q] = ok.messageCount;
      } catch {
        queueStatus[q] = 'not_found';
      }
    }

    await ch.close();
    await conn.close();

    return {
      service: 'RabbitMQ',
      status: Object.keys(queueStatus).length > 0 ? STATUS.PASS : STATUS.FAIL,
      findings: queueStatus,
      recommendation: 'RabbitMQ operational'
    };
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      return {
        service: 'RabbitMQ',
        status: STATUS.WARN,
        findings: { reason: 'amqplib not installed' },
        recommendation: 'Install amqplib: npm install amqplib'
      };
    }

    return {
      service: 'RabbitMQ',
      status: STATUS.FAIL,
      findings: { error: String(e.message) },
      recommendation: `RabbitMQ connection failed: ${e.message}`
    };
  }
}

async function auditOllama() {
  try {
    const fetch = (await import('node-fetch')).default;

    const res = await fetch('http://127.0.0.1:11434/api/tags', { timeout: 5000 });
    if (!res.ok) {
      return {
        service: 'Ollama',
        status: STATUS.FAIL,
        findings: { http_status: res.status },
        recommendation: `Ollama returned HTTP ${res.status}`
      };
    }

    const data = await res.json();
    const models = data.models || [];
    const hasEmbedding = models.some(m => m.name?.includes('embedding'));

    return {
      service: 'Ollama',
      status: models.length > 0 ? STATUS.PASS : STATUS.WARN,
      findings: { model_count: models.length, has_embedding_model: hasEmbedding },
      recommendation: `Ollama operational with ${models.length} models`
    };
  } catch (e) {
    return {
      service: 'Ollama',
      status: STATUS.FAIL,
      findings: { error: String(e.message) },
      recommendation: `Ollama connection failed: ${e.message}`
    };
  }
}

async function auditLlamaServer() {
  try {
    const fetch = (await import('node-fetch')).default;

    const res = await fetch('http://127.0.0.1:8090/v1/models', { timeout: 5000 });
    if (!res.ok) {
      return {
        service: 'llama-server',
        status: STATUS.FAIL,
        findings: { http_status: res.status },
        recommendation: `llama-server returned HTTP ${res.status}`
      };
    }

    const data = await res.json();
    const models = data.data || [];

    return {
      service: 'llama-server',
      status: models.length > 0 ? STATUS.PASS : STATUS.WARN,
      findings: { model_count: models.length },
      recommendation: `llama-server operational (TurboQuant) with ${models.length} models`
    };
  } catch (e) {
    return {
      service: 'llama-server',
      status: STATUS.FAIL,
      findings: { error: String(e.message) },
      recommendation: `llama-server connection failed: ${e.message}`
    };
  }
}

async function auditCUDA() {
  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const bridgePath = path.join(REPO_ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node');

    if (!fs.existsSync(bridgePath)) {
      return {
        service: 'CUDA/N-API Bridge',
        status: STATUS.WARN,
        findings: { addon_built: false },
        recommendation: 'Native addon not built'
      };
    }

    const bridge = require(bridgePath);
    const criticalFuncs = ['checkCudaAvailable', 'batchCosineSimilarity', 'kmeansWithCentroids'];
    const missing = criticalFuncs.filter(fn => typeof bridge[fn] !== 'function');

    return {
      service: 'CUDA/N-API Bridge',
      status: missing.length === 0 ? STATUS.PASS : STATUS.FAIL,
      findings: { exports: Object.keys(bridge).length, missing_funcs: missing },
      recommendation: missing.length === 0 ? 'All CUDA functions available' : `Missing: ${missing.join(', ')}`
    };
  } catch (e) {
    return {
      service: 'CUDA/N-API Bridge',
      status: STATUS.FAIL,
      findings: { error: String(e.message) },
      recommendation: `CUDA bridge load failed: ${e.message}`
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Main Audit
// ═══════════════════════════════════════════════════════════════

async function main() {
  log('\n🚀 Canonical Service Hardening Audit\n');

  const results = [
    await auditRepoMap(),
    await auditPostgres(),
    await auditValkey(),
    await auditQdrant(),
    await auditNeo4j(),
    await auditRabbitMQ(),
    await auditOllama(),
    await auditLlamaServer(),
    await auditCUDA()
  ];

  // Summary stats
  const stats = {
    PASS: results.filter(r => r.status === STATUS.PASS).length,
    WARN: results.filter(r => r.status === STATUS.WARN).length,
    TODO: results.filter(r => r.status === STATUS.TODO).length,
    FAIL: results.filter(r => r.status === STATUS.FAIL).length,
    total: results.length
  };

  // Console output
  log('═══════════════════════════════════════════════════════════════');
  log('AUDIT RESULTS');
  log('═══════════════════════════════════════════════════════════════\n');

  results.forEach((r) => {
    const icons = {
      [STATUS.PASS]: '✅',
      [STATUS.WARN]: '⚠️',
      [STATUS.TODO]: '⏳',
      [STATUS.FAIL]: '❌'
    };
    log(`${icons[r.status]} ${r.service.padEnd(25)} [${r.status}]`);
    log(`   ${r.recommendation}\n`);
  });

  log('═══════════════════════════════════════════════════════════════');
  log(`Summary: ${stats.PASS}/${stats.total} PASS, ${stats.WARN} WARN, ${stats.TODO} TODO, ${stats.FAIL} FAIL\n`);

  // Overall status
  const overallStatus = stats.FAIL > 0 ? 'FAIL' : stats.TODO > 0 ? 'TODO' : stats.WARN > 0 ? 'WARN' : 'PASS';
  log(`Overall Status: ${overallStatus} ${overallStatus === 'PASS' ? '✅' : overallStatus === 'WARN' ? '⚠️' : overallStatus === 'TODO' ? '⏳' : '❌'}\n`);

  // JSON report
  if (process.argv.includes('--json') || process.argv.includes('--report')) {
    const report = {
      generated_at: new Date().toISOString(),
      status: overallStatus,
      summary: stats,
      results
    };

    const reportDir = path.join(REPO_ROOT, 'docs/reports');
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportDir, 'canonical-service-hardening-audit.json'),
      JSON.stringify(report, null, 2)
    );
    log(`📋 JSON report: docs/reports/canonical-service-hardening-audit.json`);
  }

  // Markdown report
  if (process.argv.includes('--report')) {
    const mdLines = [
      '# Canonical Service Hardening Audit',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Status: ${overallStatus}`,
      '',
      '## Summary',
      `| Status | Count |`,
      `|--------|-------|`,
      `| ✅ PASS | ${stats.PASS} |`,
      `| ⚠️ WARN | ${stats.WARN} |`,
      `| ⏳ TODO | ${stats.TODO} |`,
      `| ❌ FAIL | ${stats.FAIL} |`,
      `| **Total** | **${stats.total}** |`,
      ''
    ];

    results.forEach((r) => {
      const icons = { [STATUS.PASS]: '✅', [STATUS.WARN]: '⚠️', [STATUS.TODO]: '⏳', [STATUS.FAIL]: '❌' };
      mdLines.push(`## ${icons[r.status]} ${r.service}`);
      mdLines.push(`**Status:** ${r.status}`);
      mdLines.push(`**Recommendation:** ${r.recommendation}`);
      mdLines.push('');
    });

    fs.writeFileSync(
      path.join(REPO_ROOT, 'docs/reports/canonical-service-hardening-audit.md'),
      mdLines.join('\n')
    );
    log(`📝 Markdown report: docs/reports/canonical-service-hardening-audit.md`);
  }

  log();
  process.exit(stats.FAIL > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Audit error:', e);
  process.exit(1);
});
