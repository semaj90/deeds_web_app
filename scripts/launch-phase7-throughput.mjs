#!/usr/bin/env node
/**
 * Phase 7 Throughput Launcher (5-8 hour target, tunable worker count)
 *
 * Hard-coded configuration for RTX 3060 Ti 8GB:
 * - 5-6 RabbitMQ batch workers (tunable via PHASE7_WORKER_COUNT env var, default 5)
 * - 32-item micro-batches per worker
 * - LLM_CONCURRENCY = 1 per worker (no multi-slot parallelism on single endpoint)
 * - Gemma4 timeout = 120000ms (allows full KV cache + reasoning)
 * - Queue prefetch = 1 (one batch in-flight per worker)
 * - Producer keeps queue ahead of consumers
 * - Context = 16384 (reduced from 65536, frees 1.5 GB VRAM for more workers)
 *
 * Usage:
 *   node scripts/launch-phase7-throughput.mjs
 *   npm run phase7:throughput
 *   PHASE7_WORKER_COUNT=6 npm run phase7:throughput
 *
 * This is the canonical fast path for 40K+ chunk summarization.
 * Do NOT use phase7:worker:start (single-worker default).
 * Tuned for 5-6 parallel workers with reduced context window.
 */

import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Tunable worker count (default 5, tunable via PHASE7_WORKER_COUNT env var)
const WORKER_COUNT = parseInt(process.env.PHASE7_WORKER_COUNT || '5');

console.log(`
╔════════════════════════════════════════════════════════════════╗
║       Phase 7 Throughput Launcher (5-8h target, tuned)         ║
╠════════════════════════════════════════════════════════════════╣
║ Workers:        ${WORKER_COUNT} (tunable: PHASE7_WORKER_COUNT)                         ║
║ Batch size:     32 items per worker                            ║
║ Context:        16384 (reduced from 65536, frees 1.5 GB)       ║
║ LLM concurrency:1 per worker (NO multi-slot parallelism)       ║
║ Gemma4 timeout: 120000ms (KV cache + reasoning)                ║
║ Queue prefetch: 1 per worker                                   ║
║ Target:         5-8 hours for 40K chunks (faster with 5-6x)   ║
╠════════════════════════════════════════════════════════════════╣
`);

// Pre-flight: verify Gemma4 is up
console.log('[phase7-throughput] 🔍 Pre-flight: checking Gemma4...');
try {
  const health = execSync('curl -s http://127.0.0.1:8090/health', { encoding: 'utf-8' });
  if (health.includes('ok')) {
    console.log('[phase7-throughput] ✅ Gemma4 is healthy');
  } else {
    throw new Error('Health check failed: ' + health);
  }
} catch (err) {
  console.error('[phase7-throughput] ❌ Gemma4 not responding at :8090');
  console.error('   Run: pwsh -File scripts/launch-turboquant.ps1 -Detached');
  process.exit(1);
}

// Pre-flight: verify RabbitMQ is up
console.log('[phase7-throughput] 🔍 Checking RabbitMQ...');
try {
  execSync('curl -s -u guest:guest http://127.0.0.1:15672/api/overview > /dev/null 2>&1', { shell: true });
  console.log('[phase7-throughput] ✅ RabbitMQ is healthy');
} catch (err) {
  console.error('[phase7-throughput] ❌ RabbitMQ not responding at :15672');
  console.error('   Run: docker start legal-ai-rabbitmq');
  process.exit(1);
}

// Start producer (enqueue remaining unsummarized chunks)
console.log('[phase7-throughput] 📤 Starting producer...');
const producerProc = spawn('node', ['phase7-rabbitmq-batch-worker.mjs', '--produce', '--chunk-batch-size=5000'], {
  cwd: ROOT,
  stdio: 'inherit',
});

producerProc.on('exit', (code) => {
  if (code !== 0) {
    console.error(`[phase7-throughput] ❌ Producer failed with code ${code}`);
  } else {
    console.log('[phase7-throughput] ✅ Producer finished enqueuing');
  }
});

// Wait 2s for producer to enqueue, then start N workers
setTimeout(() => {
  console.log(`[phase7-throughput] 🤖 Starting ${WORKER_COUNT} workers...`);

  const workerEnv = {
    ...process.env,
    PHASE7_WORKER_LLM_CONCURRENCY: '1',
    GEMMA4_TIMEOUT_MS: '120000',
    PHASE7_WORKER_COUNT: WORKER_COUNT.toString(),
    TURBO_CTX: '16384',  // Pass to TurboQuant for reduced context
    TURBO_CTX_ALLOW_SHORT_CONTEXT: 'true',  // Allow context below 65536
  };

  for (let i = 1; i <= WORKER_COUNT; i++) {
    const workerProc = spawn('node', ['phase7-rabbitmq-batch-worker.mjs', '--worker', `--id=${i}`, '--queue-batch-size=32'], {
      cwd: ROOT,
      env: workerEnv,
      stdio: 'inherit',
    });

    console.log(`[phase7-throughput] ✅ Worker ${i}/${WORKER_COUNT} started (PID ${workerProc.pid})`);

    workerProc.on('exit', (code) => {
      if (!shuttingDown) {
        console.warn(`[phase7-throughput] ⚠️  Worker ${i} exited (code ${code}); MANUAL RESTART REQUIRED`);
        console.warn(`   To restart: node phase7-rabbitmq-batch-worker.mjs --worker --id=${i} --queue-batch-size=32`);
      }
    });
  }

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║       All ${WORKER_COUNT} workers active. Summarization in progress.      ║
║                                                                ║
║  Monitor:  npm run atlas:phase102:step7:rabbitmq:monitor      ║
║  Warm:     npm run atlas:phase102:step8:bitfrost:warm:apply   ║
║                                                                ║
║  Context:  16384 (reduced from 65536)                         ║
║  VRAM:     ~1.5 GB freed for batch processing                 ║
║  ETA:      4-6 hours to 100% (faster with ${WORKER_COUNT} workers)    ║
║  Ctrl+C:   Gracefully stops all workers                       ║
╚════════════════════════════════════════════════════════════════╝
`);
}, 2000);

let shuttingDown = false;
process.on('SIGINT', () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[phase7-throughput] 📊 Shutting down gracefully...');
  process.exit(0);
});
