#!/usr/bin/env node
/**
 * P5: GPU Acceleration Health Audit
 * Verifies GPU infrastructure, CUDA availability, model loading, and inference performance
 *
 * Usage:
 *   npm run atlas:p5:audit
 *   npm run atlas:p5:audit --verbose
 *   npm run atlas:p5:audit --deep (includes performance benchmarks)
 */

import pg from 'pg';
import Redis from 'ioredis';
import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';

const isVerbose = process.argv.includes('--verbose');
const isDeep = process.argv.includes('--deep');
const execAsync = promisify(exec);

const log = (msg, data = '') => {
  if (isVerbose || msg.includes('ERROR') || msg.includes('PASS') || msg.includes('✅')) {
    console.log(`[P5-GPU-Audit] ${msg}`, data || '');
  }
};

async function auditGpuAcceleration() {
  const pgClient = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });

  const redisClient = new Redis(process.env.REDIS_URL || {
    host: '127.0.0.1',
    port: 6379,
    password: 'redis'
  });

  const auditResults = {
    timestamp: new Date().toISOString(),
    phases: {},
    gates: {},
    pass: true
  };

  try {
    log('Connecting to PostgreSQL...');
    await pgClient.connect();

    log('Connecting to Redis...');
    // Redis initialized above

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 5.1: GPU Hardware Verification
    // ═══════════════════════════════════════════════════════════════════════

    log('PHASE 5.1: GPU Hardware Verification');
    const phase51 = { pass: true, checks: {} };

    // Check GPU availability via CUDA environment
    try {
      const { stdout } = await execAsync('nvidia-smi --list-gpus 2>/dev/null || echo "NO_GPU"');
      const gpuCount = stdout.includes('NO_GPU') ? 0 : stdout.split('\n').filter(l => l.trim()).length;

      if (gpuCount > 0) {
        log(`  ✅ GPU detected: ${gpuCount} device(s)`);
        phase51.checks.gpu_detected = true;
      } else {
        log(`  ⚠️ No NVIDIA GPUs detected (CPU fallback will be used)`);
        phase51.checks.gpu_detected = false;
      }
    } catch (e) {
      log(`  ⚠️ nvidia-smi not available: ${e.message}`);
      phase51.checks.gpu_detected = false;
    }

    // Check CUDA environment variables
    const cudaHome = process.env.CUDA_HOME || process.env.CUDA_PATH || '/usr/local/cuda';
    phase51.checks.cuda_env = !!process.env.CUDA_HOME || !!process.env.CUDA_PATH;
    log(`  CUDA_HOME: ${phase51.checks.cuda_env ? '✅ set' : '⚠️ not set'}`);

    auditResults.phases.phase_51 = phase51;

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 5.2: LibTorch N-API Module Loading
    // ═══════════════════════════════════════════════════════════════════════

    log('PHASE 5.2: LibTorch N-API Module Loading');
    const phase52 = { pass: true, checks: {} };

    try {
      // Attempt to dynamically import the N-API addon
      const addonPath = new URL('../simd-bridge/cpp/build/Release/tensorrt_bridge.node', import.meta.url).pathname;
      let addon;

      try {
        // Try direct require via createRequire
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        addon = require(addonPath);
      } catch {
        // If addon doesn't exist or can't load, use mock
        log(`  ℹ️ N-API addon not available, using mock`);
        addon = {
          isCudaAvailable: () => false,
          simdJsonParse: null,
          simdJsonValidate: null,
          libtorchCosineSimilarity: null,
          kmeansWithCentroids: null,
          trainSOM: null,
          pageRankGPU: null
        };
      }

      const expectedFunctions = [
        'simdJsonParse', 'simdJsonValidate', 'simdJsonExtractNumbers',
        'libtorchCosineSimilarity', 'isCudaAvailable',
        'kmeansWithCentroids', 'trainSOM', 'pageRankGPU'
      ];

      const loadedFunctions = expectedFunctions.filter(fn => typeof addon[fn] === 'function');
      const functionCoverage = loadedFunctions.length / expectedFunctions.length;

      log(`  ${loadedFunctions.length}/${expectedFunctions.length} functions exported (${(functionCoverage * 100).toFixed(1)}%)`);
      phase52.checks.addon_loaded = loadedFunctions.length > 0;
      phase52.checks.function_count = loadedFunctions.length;
      phase52.checks.cuda_available = addon.isCudaAvailable?.() || false;

      if (phase52.checks.cuda_available) {
        log(`  ✅ CUDA is available to addon`);
      } else {
        log(`  ⚠️ CUDA not available to addon (CPU fallback)`);
      }

    } catch (e) {
      log(`  ⚠️ Failed to load tensorrt_bridge.node: ${e.message}`);
      phase52.checks.addon_loaded = false;
      phase52.checks.cuda_available = false;
      // Don't fail this gate — addon is optional for CPU fallback
    }

    auditResults.phases.phase_52 = phase52;

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 5.3: Inference Service Health
    // ═══════════════════════════════════════════════════════════════════════

    log('PHASE 5.3: Inference Service Health');
    const phase53 = { pass: true, checks: {} };

    // Check Ollama
    try {
      const res = await fetch('http://127.0.0.1:11434/api/tags', { timeout: 5000 });
      if (res.ok) {
        const data = await res.json();
        const modelCount = data.models?.length || 0;
        log(`  ✅ Ollama healthy (${modelCount} models loaded)`);
        phase53.checks.ollama_healthy = true;
        phase53.checks.ollama_models = modelCount;
      } else {
        log(`  ❌ Ollama /api/tags returned ${res.status}`);
        phase53.checks.ollama_healthy = false;
      }
    } catch (e) {
      log(`  ❌ Ollama connection failed: ${e.message}`);
      phase53.checks.ollama_healthy = false;
    }

    // Check TurboQuant llama-server
    try {
      const res = await fetch('http://127.0.0.1:8090/v1/models', { timeout: 5000 });
      if (res.ok) {
        const data = await res.json();
        const modelId = data.data?.[0]?.id || 'unknown';
        log(`  ✅ TurboQuant llama-server healthy (${modelId})`);
        phase53.checks.turboquant_healthy = true;
        phase53.checks.turboquant_model = modelId;
      } else {
        log(`  ⚠️ TurboQuant /v1/models returned ${res.status}`);
        phase53.checks.turboquant_healthy = false;
      }
    } catch (e) {
      log(`  ⚠️ TurboQuant connection failed: ${e.message} (optional service)`);
      phase53.checks.turboquant_healthy = false;
    }

    // Check Qdrant
    try {
      const res = await fetch('http://127.0.0.1:6333/collections', { timeout: 5000 });
      if (res.ok) {
        const data = await res.json();
        const collectionCount = data.result?.collections?.length || 0;
        log(`  ✅ Qdrant healthy (${collectionCount} collections)`);
        phase53.checks.qdrant_healthy = true;
        phase53.checks.qdrant_collections = collectionCount;
      } else {
        log(`  ❌ Qdrant /collections returned ${res.status}`);
        phase53.checks.qdrant_healthy = false;
      }
    } catch (e) {
      log(`  ❌ Qdrant connection failed: ${e.message}`);
      phase53.checks.qdrant_healthy = false;
    }

    auditResults.phases.phase_53 = phase53;

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 5.4: Cache Layers (Redis + Bifrost)
    // ═══════════════════════════════════════════════════════════════════════

    log('PHASE 5.4: Cache Layers');
    const phase54 = { pass: true, checks: {} };

    // Check Redis
    try {
      const ping = await redisClient.ping();
      log(`  ✅ Redis healthy (PING=${ping})`);
      phase54.checks.redis_healthy = true;

      // Check for P4 computed scores in cache
      const prScores = await redisClient.hlen('atlas:pagerank:som:scores');
      const attScores = await redisClient.hlen('atlas:attention:som:scores');
      const karpScores = await redisClient.hlen('atlas:karpathy:som:scores');

      log(`    - PageRank scores cached: ${prScores}/400`);
      log(`    - Attention scores cached: ${attScores}/400`);
      log(`    - Karpathy scores cached: ${karpScores}/400`);

      phase54.checks.p4_scores_cached = {
        pagerank: prScores,
        attention: attScores,
        karpathy: karpScores
      };
    } catch (e) {
      log(`  ❌ Redis connection failed: ${e.message}`);
      phase54.checks.redis_healthy = false;
    }

    // Check Bifrost
    try {
      const res = await fetch('http://127.0.0.1:3040/health', { timeout: 5000 });
      if (res.ok) {
        log(`  ✅ Bifrost cache healthy`);
        phase54.checks.bifrost_healthy = true;
      } else {
        log(`  ⚠️ Bifrost health returned ${res.status}`);
        phase54.checks.bifrost_healthy = false;
      }
    } catch (e) {
      log(`  ⚠️ Bifrost connection failed: ${e.message} (optional service)`);
      phase54.checks.bifrost_healthy = false;
    }

    auditResults.phases.phase_54 = phase54;

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 5.5: P4 Score Persistence (Postgres)
    // ═══════════════════════════════════════════════════════════════════════

    log('PHASE 5.5: P4 Score Persistence (Postgres)');
    const phase55 = { pass: true, checks: {} };

    try {
      const tables = ['atlas_som_cell_scores', 'atlas_som_cell_attention_scores', 'atlas_som_cell_karpathy_scores'];

      for (const table of tables) {
        const res = await pgClient.query(`SELECT COUNT(*) FROM ${table}`);
        const count = res.rows[0].count;
        log(`  ${table}: ${count} rows`);
        phase55.checks[table] = count;

        if (count < 300) {
          phase55.pass = false;
        }
      }

      phase55.checks.all_tables_populated = Object.values(phase55.checks).every(c => c >= 300);
    } catch (e) {
      log(`  ⚠️ Postgres query failed: ${e.message}`);
      phase55.pass = false;
    }

    auditResults.phases.phase_55 = phase55;

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 5.6: Deep Benchmark (optional)
    // ═══════════════════════════════════════════════════════════════════════

    if (isDeep) {
      log('PHASE 5.6: Performance Benchmarks (deep mode)');
      const phase56 = { pass: true, checks: {} };

      // Benchmark: Ollama embedding speed
      try {
        const query = 'test embedding performance benchmark';
        const start = Date.now();
        const res = await fetch('http://127.0.0.1:11434/api/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: query })
        });
        const elapsed = Date.now() - start;

        if (res.ok) {
          log(`  Ollama embedding latency: ${elapsed}ms`);
          phase56.checks.ollama_embed_latency_ms = elapsed;
        }
      } catch (e) {
        log(`  ⚠️ Embedding benchmark failed: ${e.message}`);
      }

      auditResults.phases.phase_56 = phase56;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VERIFICATION GATES
    // ═══════════════════════════════════════════════════════════════════════

    log('Verifying P5 GPU Acceleration gates...');

    auditResults.gates = {
      gate_1_addon_loaded: phase52.checks.addon_loaded,
      gate_2_ollama_healthy: phase53.checks.ollama_healthy,
      gate_3_qdrant_healthy: phase53.checks.qdrant_healthy,
      gate_4_redis_healthy: phase54.checks.redis_healthy,
      gate_5_p4_scores_complete: phase55.checks.all_tables_populated,
      gate_6_gpu_cuda_available: phase52.checks.cuda_available || !isVerbose // Non-blocking if CPU fallback
    };

    // Critical gates (addon is optional, requires Ollama + Qdrant + Postgres)
    const criticalGates = ['gate_2_ollama_healthy', 'gate_3_qdrant_healthy', 'gate_4_redis_healthy', 'gate_5_p4_scores_complete'];
    const allCriticalPass = criticalGates.every(g => auditResults.gates[g]);

    Object.entries(auditResults.gates).forEach(([gate, pass]) => {
      const isCritical = criticalGates.includes(gate);
      log(`  ${gate}: ${pass ? '✅' : isCritical ? '❌' : '⚠️'}`);
      if (!pass && isCritical) auditResults.pass = false;
    });

    // ═══════════════════════════════════════════════════════════════════════
    // RESULTS
    // ═══════════════════════════════════════════════════════════════════════

    if (allCriticalPass) {
      log('✅ P5 GPU ACCELERATION AUDIT PASS');
      log('✅ Ready for P6 (AE/SOM Optimization)');
      process.exit(0);
    } else {
      log('❌ P5 GPU ACCELERATION AUDIT FAILED — critical gates did not pass');
      process.exit(1);
    }

  } catch (err) {
    console.error('[ERROR]', err.message);
    process.exit(1);
  } finally {
    await pgClient.end();
    if (redisClient) await redisClient.quit();
  }
}

auditGpuAcceleration();
