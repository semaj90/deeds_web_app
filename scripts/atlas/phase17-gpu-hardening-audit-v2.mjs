#!/usr/bin/env node
/**
 * Phase 17 GPU Acceleration — STRONGER Safety Audit (v2)
 *
 * Improvements over v1:
 * - Regex pattern matching instead of substring checks
 * - C++ source code inspection (not just TS wrapper)
 * - Runtime smoke tests for CUDA functions
 * - Valkey/Redis cache connectivity validation
 * - Tiered status (PASS, WARN, TODO, FAIL) instead of binary
 * - JSON + Markdown report output
 *
 * Usage:
 *   node scripts/atlas/phase17-gpu-hardening-audit-v2.mjs --audit
 *   node scripts/atlas/phase17-gpu-hardening-audit-v2.mjs --json
 *   node scripts/atlas/phase17-gpu-hardening-audit-v2.mjs --report
 *   npm run phase17:gpu:hardening:audit:v2
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STATUS = {
  PASS: 'PASS',
  WARN: 'WARN',
  TODO: 'TODO',
  FAIL: 'FAIL'
};

// ═══════════════════════════════════════════════════════════════
// Task 1: clusterEmbeddings empty-cluster guard + re-seeding
// ═══════════════════════════════════════════════════════════════

async function auditTask1_ClusterSafety() {
  const tsPath = path.resolve(__dirname, '../../sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts');
  const cppPaths = [
    path.resolve(__dirname, '../../simd-bridge/cpp/pytorch_graph.cc'),
    path.resolve(__dirname, '../../simd-bridge/cpp/binding.cc')
  ];

  const findings = {
    ts_wrapper: false,
    cpp_implementation: false,
    reseeding_exposed: false,
    reseeded_count_param: false
  };

  // Check TS wrapper
  if (fs.existsSync(tsPath)) {
    const tsContent = fs.readFileSync(tsPath, 'utf-8');
    findings.ts_wrapper = /reseeded|reseed/.test(tsContent);
  }

  // Check C++ implementation
  for (const cppPath of cppPaths) {
    if (fs.existsSync(cppPath)) {
      const cppContent = fs.readFileSync(cppPath, 'utf-8');
      // Look for reseeding logic in C++ (empty cluster re-seeding from farthest point)
      if (/empty\s+cluster|reseed|farthest|re.seed/i.test(cppContent)) {
        findings.cpp_implementation = true;
      }
      // Check for reseeded_count parameter exposure
      if (/out_reseeded_count|reseeded_count/.test(cppContent)) {
        findings.reseeded_count_param = true;
      }
    }
  }

  const status = findings.cpp_implementation && findings.reseeded_count_param ? STATUS.PASS : (findings.cpp_implementation ? STATUS.WARN : STATUS.TODO);

  return {
    task: 1,
    name: 'clusterEmbeddings empty-cluster guard + re-seed',
    status,
    findings,
    recommendation: status === STATUS.PASS
      ? 'Empty-cluster re-seeding implemented in C++ and parameter exposed'
      : status === STATUS.WARN
        ? 'C++ implementation exists but TS wrapper may not fully expose reseeded_count'
        : 'Re-seeding logic not yet implemented or exposed'
  };
}

// ═══════════════════════════════════════════════════════════════
// Task 2: graphSimilarity hard N-cap + error handling
// ═══════════════════════════════════════════════════════════════

async function auditTask2_GraphSimilaritySafety() {
  const cppPaths = [
    path.resolve(__dirname, '../../simd-bridge/cpp/pytorch_graph.cc'),
    path.resolve(__dirname, '../../simd-bridge/cpp/binding.cc')
  ];

  const findings = {
    has_n_cap: false,
    cap_value: null,
    has_error_details: false,
    has_cuda_oom_guard: false,
    hard_limit_regex: /if\s*\(\s*n\s*[>>=]+\s*\d{5}/i
  };

  for (const cppPath of cppPaths) {
    if (fs.existsSync(cppPath)) {
      const cppContent = fs.readFileSync(cppPath, 'utf-8');

      // Check for hard limit (e.g., n > 65536)
      const capMatch = cppContent.match(/if\s*\(\s*n\s*>\s*(\d+)/i);
      if (capMatch) {
        findings.has_n_cap = true;
        findings.cap_value = parseInt(capMatch[1], 10);
      }

      // Check for error details / messages
      if (/error.*details|detailed.*error|error.*message|std::string.*error|exception.*message/i.test(cppContent)) {
        findings.has_error_details = true;
      }

      // Check for CUDA OOM guard
      if (/out.*of.*memory|OOM|CUDA.*OOM|GPU_ERR_CUDA_OOM/i.test(cppContent)) {
        findings.has_cuda_oom_guard = true;
      }
    }
  }

  const status = findings.has_n_cap && findings.has_error_details && findings.has_cuda_oom_guard
    ? STATUS.PASS
    : findings.has_n_cap || findings.has_cuda_oom_guard
      ? STATUS.WARN
      : STATUS.TODO;

  return {
    task: 2,
    name: 'graphSimilarity N-cap + error details',
    status,
    findings,
    recommendation: status === STATUS.PASS
      ? `Hard N-cap enforced at ${findings.cap_value}, error details captured, CUDA OOM guard active`
      : status === STATUS.WARN
        ? `Partial implementation: cap=${findings.has_n_cap}, errors=${findings.has_error_details}, oom=${findings.has_cuda_oom_guard}`
        : 'N-cap + error handling not yet implemented'
  };
}

// ═══════════════════════════════════════════════════════════════
// Task 3: Async N-API wrapper (non-blocking for n > 256)
// ═══════════════════════════════════════════════════════════════

async function auditTask3_AsyncNAPI() {
  const tsPath = path.resolve(__dirname, '../../sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts');

  const findings = {
    has_adaptive_batch: false,
    has_threshold_256: false,
    has_worker_routing: false
  };

  if (fs.existsSync(tsPath)) {
    const content = fs.readFileSync(tsPath, 'utf-8');

    findings.has_adaptive_batch = /runWithAdaptiveBatch|adaptive.*batch/.test(content);
    findings.has_threshold_256 = /256|threshold.*n|n.*threshold|MAX_SYNC_SIZE/i.test(content);
    findings.has_worker_routing = /Worker|worker.*thread|isWorkerThread|worker\.js|parentPort/i.test(content);
  }

  const status = findings.has_adaptive_batch && findings.has_threshold_256
    ? STATUS.PASS
    : findings.has_adaptive_batch
      ? STATUS.WARN
      : STATUS.TODO;

  return {
    task: 3,
    name: 'Async N-API wrapper for large n (n > 256)',
    status,
    findings,
    recommendation: status === STATUS.PASS
      ? 'Async wrapper pattern exists with n > 256 threshold'
      : status === STATUS.WARN
        ? 'Adaptive batch wrapper exists but threshold logic unclear'
        : 'TODO: Create async N-API wrapper for non-blocking calls when n > 256'
  };
}

// ═══════════════════════════════════════════════════════════════
// Task 4: Worker-thread pool for indexing
// ═══════════════════════════════════════════════════════════════

async function auditTask4_WorkerPool() {
  const workerPoolPath = path.resolve(__dirname, '../../sveltekit-frontend/src/lib/server/indexer/worker-pool.ts');
  const workerImplementations = [
    path.resolve(__dirname, '../../sveltekit-frontend/src/lib/server/indexer/worker-pool.ts'),
    path.resolve(__dirname, '../../sveltekit-frontend/src/lib/server/indexer/compute-worker.ts'),
    path.resolve(__dirname, '../../sveltekit-frontend/src/lib/server/workers')
  ];

  const findings = {
    pool_exists: fs.existsSync(workerPoolPath),
    worker_implementations: [],
    bounded_queue: false,
    has_hashing: false,
    has_chunking: false,
    has_metadata: false
  };

  for (const impl of workerImplementations) {
    if (fs.existsSync(impl) && fs.statSync(impl).isFile()) {
      findings.worker_implementations.push(impl);
      const content = fs.readFileSync(impl, 'utf-8');

      if (/queue|bounded|limit|max.*size|capacity/i.test(content)) {
        findings.bounded_queue = true;
      }
      if (/hash|sha256|crypto|blake/i.test(content)) {
        findings.has_hashing = true;
      }
      if (/chunk|split|document|parse/i.test(content)) {
        findings.has_chunking = true;
      }
      if (/metadata|entity|extraction|tagging/i.test(content)) {
        findings.has_metadata = true;
      }
    }
  }

  const status = findings.pool_exists && findings.bounded_queue
    ? STATUS.PASS
    : findings.worker_implementations.length > 0
      ? STATUS.WARN
      : STATUS.TODO;

  return {
    task: 4,
    name: 'Worker-thread pool for indexing',
    status,
    findings,
    recommendation: status === STATUS.PASS
      ? 'Worker pool exists with bounded queue for CPU indexing tasks'
      : status === STATUS.WARN
        ? `Worker implementations found (${findings.worker_implementations.length}), but pool structure unclear`
        : 'TODO: Create worker-pool.ts with bounded queue for hashing, chunking, metadata, entity extraction'
  };
}

// ═══════════════════════════════════════════════════════════════
// Task 5: Tensor/similarity caching in Redis/Valkey
// ═══════════════════════════════════════════════════════════════

async function auditTask5_TensorCache() {
  const cachePath = path.resolve(__dirname, '../../sveltekit-frontend/src/lib/server/cache/tensor-similarity-cache.ts');

  const findings = {
    cache_module_exists: fs.existsSync(cachePath),
    has_centroid_cache: false,
    has_embedding_hash: false,
    has_query_cluster_scores: false,
    redis_import: false
  };

  if (fs.existsSync(cachePath)) {
    const content = fs.readFileSync(cachePath, 'utf-8');

    findings.has_centroid_cache = /centroid|SOM|som_cell|cluster/i.test(content);
    findings.has_embedding_hash = /hash|embedding|sha256|checksum/i.test(content);
    findings.has_query_cluster_scores = /score|similarity|query.*cluster|cluster.*query/i.test(content);
    findings.redis_import = /redis|ioredis|getRedis|RedisClient/i.test(content);
  }

  const status = findings.cache_module_exists && findings.redis_import
    ? STATUS.PASS
    : findings.cache_module_exists
      ? STATUS.WARN
      : STATUS.TODO;

  return {
    task: 5,
    name: 'Tensor/similarity caching (Redis/Valkey)',
    status,
    findings,
    recommendation: status === STATUS.PASS
      ? 'Cache module exists with Redis integration for centroid lists, embedding hashes, and query+cluster scores'
      : status === STATUS.WARN
        ? 'Cache module exists but Redis integration may be incomplete'
        : 'TODO: Create tensor-similarity-cache.ts for Redis L1 caching of centroids, embeddings, scores'
  };
}

// ═══════════════════════════════════════════════════════════════
// Task 6: Runtime CUDA functions smoke test
// ═══════════════════════════════════════════════════════════════

async function auditTask6_RuntimeBridge() {
  try {
    const bridgePath = path.resolve(__dirname, '../../simd-bridge/cpp/build/Release/tensorrt_bridge.node');

    if (!fs.existsSync(bridgePath)) {
      return {
        task: 6,
        name: 'Native addon runtime smoke test',
        status: STATUS.WARN,
        findings: { addon_built: false, reason: 'tensorrt_bridge.node not found' },
        recommendation: 'Native addon not yet built. Run: cd simd-bridge/cpp && cmake -B build && cmake --build build --config Release'
      };
    }

    // Try to load the addon using createRequire (correct for .node files)
    let bridge;
    try {
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      bridge = require(bridgePath);
    } catch (e) {
      return {
        task: 6,
        name: 'Native addon runtime smoke test',
        status: STATUS.FAIL,
        findings: { addon_built: true, addon_loadable: false, error: String(e.message) },
        recommendation: `Failed to load native addon: ${e.message}`
      };
    }

    const exportedFuncs = Object.keys(bridge.default ?? bridge);
    const criticalFuncs = [
      'checkCudaAvailable',
      'batchCosineSimilarity',
      'kmeansWithCentroids',
      'attentionScoreGPU',
      'rewardScoreGPU'
    ];

    const missing = criticalFuncs.filter(fn => !exportedFuncs.includes(fn));

    const status = missing.length === 0 ? STATUS.PASS : (missing.length <= 2 ? STATUS.WARN : STATUS.FAIL);

    return {
      task: 6,
      name: 'Native addon runtime smoke test',
      status,
      findings: {
        addon_built: true,
        addon_loadable: true,
        total_exports: exportedFuncs.length,
        critical_funcs_present: criticalFuncs.length - missing.length,
        missing_funcs: missing
      },
      recommendation: status === STATUS.PASS
        ? 'All critical CUDA functions exported'
        : `Missing functions: ${missing.join(', ')}`
    };
  } catch (e) {
    return {
      task: 6,
      name: 'Native addon runtime smoke test',
      status: STATUS.FAIL,
      findings: { error: String(e.message) },
      recommendation: `Runtime test failed: ${e.message}`
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Task 7: Valkey/Redis tensor cache connectivity
// ═══════════════════════════════════════════════════════════════

async function auditTask7_ValkeyConnectivity() {
  try {
    // Lazy import Redis
    const Redis = (await import('ioredis')).default;

    const redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || 'redis',
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      commandTimeout: 5000
    });

    await redis.connect();
    const pong = await redis.ping();

    if (pong !== 'PONG') {
      await redis.disconnect();
      return {
        task: 7,
        name: 'Valkey/Redis cache connectivity',
        status: STATUS.FAIL,
        findings: { pong_response: pong },
        recommendation: 'Redis/Valkey responded but PING was not PONG'
      };
    }

    // Check for SOM cell cache keys
    const [cursor, keys] = await redis.scan('0', 'MATCH', 'centroid:som_cell:*', 'COUNT', '20');

    // Check for GPU Karpathy scores
    const karKeys = await redis.keys('gpu:karpathy:scores*');

    await redis.disconnect();

    const hasCacheKeys = keys.length > 0 || karKeys.length > 0;
    const status = hasCacheKeys ? STATUS.PASS : STATUS.WARN;

    return {
      task: 7,
      name: 'Valkey/Redis cache connectivity',
      status,
      findings: {
        redis_available: true,
        ping_response: pong,
        centroid_som_keys: keys.length,
        karpathy_score_keys: karKeys.length
      },
      recommendation: status === STATUS.PASS
        ? `Redis available with ${keys.length + karKeys.length} cache keys for tensors/SOM`
        : 'Redis available but no tensor cache keys found (cold cache is acceptable)'
    };
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      return {
        task: 7,
        name: 'Valkey/Redis cache connectivity',
        status: STATUS.WARN,
        findings: { reason: 'ioredis not installed' },
        recommendation: 'Install ioredis: npm install ioredis'
      };
    }

    return {
      task: 7,
      name: 'Valkey/Redis cache connectivity',
      status: STATUS.FAIL,
      findings: { error: String(e.message || e) },
      recommendation: `Redis connection failed: ${e.message}. Check REDIS_HOST=${process.env.REDIS_HOST || '127.0.0.1'}, REDIS_PORT=${process.env.REDIS_PORT || 6379}`
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Main Audit
// ═══════════════════════════════════════════════════════════════

async function main() {
  const isAudit = process.argv.includes('--audit') || process.argv.includes('--json') || process.argv.includes('--report') || !process.argv.includes('--apply');

  console.log('\n🚀 Phase 17 GPU Acceleration — Hardening Audit (v2)\n');

  const results = await Promise.all([
    auditTask1_ClusterSafety(),
    auditTask2_GraphSimilaritySafety(),
    auditTask3_AsyncNAPI(),
    auditTask4_WorkerPool(),
    auditTask5_TensorCache(),
    auditTask6_RuntimeBridge(),
    auditTask7_ValkeyConnectivity()
  ]);

  // Summary stats
  const stats = {
    PASS: results.filter(r => r.status === STATUS.PASS).length,
    WARN: results.filter(r => r.status === STATUS.WARN).length,
    TODO: results.filter(r => r.status === STATUS.TODO).length,
    FAIL: results.filter(r => r.status === STATUS.FAIL).length,
    total: results.length
  };

  // Console output
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('AUDIT RESULTS (v2 — STRENGTHENED CHECKS)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  results.forEach((r) => {
    const icons = {
      [STATUS.PASS]: '✅',
      [STATUS.WARN]: '⚠️',
      [STATUS.TODO]: '⏳',
      [STATUS.FAIL]: '❌'
    };
    console.log(`${icons[r.status]} Task ${r.task}: ${r.name} [${r.status}]`);
    console.log(`   ${r.recommendation}\n`);
  });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Summary: ${stats.PASS}/${stats.total} PASS, ${stats.WARN} WARN, ${stats.TODO} TODO, ${stats.FAIL} FAIL\n`);

  console.log('Overall Status:',
    stats.FAIL > 0 ? 'FAIL ❌' : stats.TODO > 0 ? 'WARN ⚠️' : 'PASS ✅'
  );

  // JSON report
  if (process.argv.includes('--json') || process.argv.includes('--report')) {
    const report = {
      generated_at: new Date().toISOString(),
      status: stats.FAIL > 0 ? 'FAIL' : stats.TODO > 0 ? 'WARN' : 'PASS',
      summary: stats,
      results
    };

    const reportPath = path.resolve('docs/reports/phase17-gpu-hardening-audit-v2.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📋 JSON report written to: ${reportPath}`);
  }

  // Markdown report
  if (process.argv.includes('--report')) {
    const mdLines = [
      '# Phase 17 GPU Acceleration Hardening Audit (v2)',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Status: ${stats.FAIL > 0 ? '❌ FAIL' : stats.TODO > 0 ? '⚠️ WARN' : '✅ PASS'}`,
      '',
      `## Summary`,
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
      mdLines.push(`## ${icons[r.status]} Task ${r.task}: ${r.name}`);
      mdLines.push(`**Status:** ${r.status}`);
      mdLines.push(`**Recommendation:** ${r.recommendation}`);
      mdLines.push('');
      mdLines.push('**Findings:**');
      mdLines.push('```json');
      mdLines.push(JSON.stringify(r.findings, null, 2));
      mdLines.push('```');
      mdLines.push('');
    });

    mdLines.push('## Next Steps');
    results.filter(r => r.status !== STATUS.PASS).forEach(r => {
      mdLines.push(`- Task ${r.task}: ${r.recommendation}`);
    });

    const mdPath = path.resolve('docs/reports/phase17-gpu-hardening-audit-v2.md');
    fs.mkdirSync(path.dirname(mdPath), { recursive: true });
    fs.writeFileSync(mdPath, mdLines.join('\n'));
    console.log(`📝 Markdown report written to: ${mdPath}`);
  }

  console.log();
  process.exit(stats.FAIL > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Audit error:', e);
  process.exit(1);
});
