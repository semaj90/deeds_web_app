#!/usr/bin/env node
/**
 * Executive Planner (Unified Recommendation Engine)
 *
 * Replaces scattered logic across:
 *   - idle-review.mjs
 *   - codebase-todo-aggregator.mjs
 *   - parent-atlas-patch (L0-L11 inline logic)
 *
 * Uses OpenSpec to:
 *   1. Decompose intent into task specs
 *   2. Collect all signals (git, Redis, Postgres, GPU, Kanban)
 *   3. Generate ranked recommendations
 *   4. Emit to Agent Scheduler
 *
 * Usage:
 *   npm run plan:recommendations              # Full cycle
 *   npm run plan:recommendations -- --dry-run # Preview only
 *   npm run plan:idle                         # Idle-triggered
 *   npm run plan:kanban:decompose card-id     # Kanban decomposition
 */

import postgres from 'postgres';
import { createClient } from 'redis';
import { performance } from 'perf_hooks';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

const ENV = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://legal_admin:password@127.0.0.1:5432/legal_ai_db',
  REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
  REDIS_PORT: process.env.REDIS_PORT || '6379',
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || 'redis',
  NATS_URL: process.env.NATS_URL || 'nats://localhost:4222',
};

const FLAGS = {
  dryRun: process.argv.includes('--dry-run'),
  trigger: process.argv.find(arg => arg.startsWith('--trigger='))?.split('=')[1] || 'manual',
  verbose: process.argv.includes('--verbose'),
};

// ============================================================================
// 1. DATABASE & CACHE CLIENTS
// ============================================================================

let db = null;
let redis = null;

async function initDb() {
  if (db) return db;
  db = postgres(ENV.DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
  });
  return db;
}

async function initRedis() {
  if (redis) return redis;
  redis = createClient({
    host: ENV.REDIS_HOST,
    port: parseInt(ENV.REDIS_PORT),
    password: ENV.REDIS_PASSWORD || undefined,
    socket: {
      reconnectStrategy: () => null, // Don't retry
      connectTimeout: 5000,
    },
  });
  redis.on('error', (err) => {
    if (FLAGS.verbose) console.warn('[REDIS WARN]', err.message);
  });
  await redis.connect().catch(() => null);
  return redis;
}

async function closeClients() {
  if (db) await db.end();
  if (redis) await redis.quit().catch(() => null);
}

// ============================================================================
// 2. SIGNAL COLLECTION
// ============================================================================

async function collectSignals() {
  const startTime = performance.now();
  const signals = {
    timestamp: new Date().toISOString(),
    trigger: FLAGS.trigger,
    signals: {},
  };

  try {
    // Signal 1: Git state
    signals.signals.git_state = collectGitState();
    if (FLAGS.verbose) console.log('[SIGNAL] Git state collected');

    // Signal 2: Redis signals (Karpathy, Authority, Dirty files)
    signals.signals.redis_signals = await collectRedisSignals();
    if (FLAGS.verbose) console.log('[SIGNAL] Redis signals collected');

    // Signal 3: Postgres signals (task outcomes, Engram hotness)
    signals.signals.postgres_signals = await collectPostgresSignals();
    if (FLAGS.verbose) console.log('[SIGNAL] Postgres signals collected');

    // Signal 4: GPU health
    signals.signals.gpu_health = await checkGpuHealth();
    if (FLAGS.verbose) console.log('[SIGNAL] GPU health checked');

    // Signal 5: Build/test failures
    signals.signals.build_failures = await collectBuildFailures();
    if (FLAGS.verbose) console.log('[SIGNAL] Build/test failures collected');

    // Signal 6: Task dependencies
    signals.signals.task_dependencies = await loadTaskDependencies();
    if (FLAGS.verbose) console.log('[SIGNAL] Task dependencies loaded');

    // Signal 7: Policy scores
    signals.signals.policy_scores = await loadPolicyScores();
    if (FLAGS.verbose) console.log('[SIGNAL] Policy scores loaded');

  } catch (err) {
    console.error('[ERROR] collectSignals:', err.message);
  }

  const duration = ((performance.now() - startTime) / 1000).toFixed(2);
  signals.collection_duration_s = parseFloat(duration);
  return signals;
}

function collectGitState() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    const ahead = execSync('git rev-list --count @{u}..', { encoding: 'utf-8' }).trim();
    const dirtyFiles = execSync('git diff --name-only', { encoding: 'utf-8' }).split('\n').filter(f => f);

    return {
      branch,
      commits_ahead: parseInt(ahead) || 0,
      dirty_files: dirtyFiles,
      dirty_count: dirtyFiles.length,
    };
  } catch (err) {
    return { error: err.message, branch: 'unknown' };
  }
}

async function collectRedisSignals() {
  const redis_client = await initRedis();
  const signals = {};

  try {
    // Karpathy scores (file → authority)
    const karpathy = await redis_client.hGetAll('gpu:karpathy:scores');
    signals.karpathy_files = Object.keys(karpathy).length;
    signals.karpathy_sample = Object.entries(karpathy).slice(0, 3).map(([file, score]) => ({
      file,
      score: JSON.parse(score).blend,
    }));

    // Authority scores
    const authority = await redis_client.hGetAll('ace:authority:top');
    signals.authority_files = Object.keys(authority).length;

    // Dirty files (need indexing)
    const dirtySet = await redis_client.sMembers('ace:rank:dirty_files');
    signals.dirty_files_count = dirtySet.length;

  } catch (err) {
    if (FLAGS.verbose) console.warn('[REDIS ERROR]', err.message);
    signals.error = err.message;
  }

  return signals;
}

async function collectPostgresSignals() {
  const db_client = await initDb();
  const signals = {};

  try {
    // Task outcomes (completed tasks from last 24h)
    const taskOutcomes = await db_client`
      SELECT status, COUNT(*) as count
      FROM task_state_projection
      WHERE updated_at > NOW() - INTERVAL '24 hours'
      GROUP BY status
    `;
    signals.task_outcomes = Object.fromEntries(taskOutcomes.map(r => [r.status, r.count]));

    // Engram hotness (top 5 most accessed)
    const hotEngrams = await db_client`
      SELECT user_intent, hotness, access_count
      FROM engram_recall_projection
      WHERE updated_at > NOW() - INTERVAL '7 days'
      ORDER BY hotness DESC
      LIMIT 5
    `;
    signals.hot_intents = hotEngrams;

    // Stale packets (GPU refresh needed)
    const stalePackets = await db_client`
      SELECT COUNT(*) as count
      FROM packet_features
      WHERE status = 'stale' OR last_gpu_refresh < NOW() - INTERVAL '7 days'
    `;
    signals.stale_packets = stalePackets[0].count;

  } catch (err) {
    if (FLAGS.verbose) console.warn('[POSTGRES ERROR]', err.message);
    signals.error = err.message;
  }

  return signals;
}

async function checkGpuHealth() {
  try {
    // Check if CUDA service is healthy (very simple probe)
    const gpu_status = execSync('echo "import torch; print(torch.cuda.is_available())" | python3 2>/dev/null || echo "false"',
      { encoding: 'utf-8', stdio: 'pipe' }).trim();

    return {
      cuda_available: gpu_status === 'True',
      gpu_model: 'RTX 3060 Ti',
      status: gpu_status === 'True' ? 'healthy' : 'unavailable',
    };
  } catch (err) {
    return {
      cuda_available: false,
      status: 'error',
      error: err.message,
    };
  }
}

async function collectBuildFailures() {
  try {
    // Check for recent build/test failures (very lightweight)
    const lastLog = execSync('npm run test -- --listTests 2>/dev/null | wc -l', { encoding: 'utf-8' }).trim();
    return {
      test_files: parseInt(lastLog) || 0,
      recent_failures: 0, // Placeholder — integrate with CI logs if available
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function loadTaskDependencies() {
  const db_client = await initDb();
  try {
    const deps = await db_client`
      SELECT COUNT(*) as count
      FROM agent_scheduler_jobs
      WHERE depends_on IS NOT NULL AND array_length(depends_on, 1) > 0
    `;
    return {
      dependent_jobs: deps[0].count,
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function loadPolicyScores() {
  const db_client = await initDb();
  try {
    const scores = await db_client`
      SELECT AVG(policy_score) as avg_score, MAX(policy_score) as max_score
      FROM packet_features
      WHERE policy_score IS NOT NULL
    `;
    return {
      avg_policy_score: scores[0].avg_score?.toFixed(3) || 'null',
      max_policy_score: scores[0].max_score?.toFixed(3) || 'null',
    };
  } catch (err) {
    return { error: err.message };
  }
}

// ============================================================================
// 3. OPENSPEC INTEGRATION (PLACEHOLDER — awaiting OpenSpec CLI)
// ============================================================================

/**
 * Calls `openspec decompose` to generate task specs.
 * Placeholder until OpenSpec is installed.
 */
async function generateSpecWithOpenspec(signals) {
  // TODO: When OpenSpec is installed:
  // const spec = await Openspec.decompose({
  //   intent: `Generate recommendations based on: ${signals.trigger} trigger`,
  //   context: signals.signals,
  //   template: 'recommendation_engine'
  // });

  // For now, simulate a spec output
  const spec = {
    spec_id: `rec-${Date.now()}`,
    version: 1,
    intent: `Generate recommendations (${signals.trigger} trigger)`,
    decomposition: [
      {
        task_id: 'task-1',
        title: 'Analyze signals and determine priorities',
        type: 'decision_making',
        acceptance_criteria: [
          'All signals collected',
          'Recommendations ranked by confidence',
          'Dependencies resolved',
        ],
      },
      {
        task_id: 'task-2',
        title: 'Emit to Agent Scheduler',
        type: 'action',
        dependencies: ['task-1'],
      },
    ],
    recommendations: await generateRecommendationsFromSignals(signals.signals),
  };

  if (FLAGS.verbose) {
    console.log('[OPENSPEC] Generated spec:', spec.spec_id);
  }

  return spec;
}

// ============================================================================
// 4. RECOMMENDATION GENERATION
// ============================================================================

async function generateRecommendationsFromSignals(signals) {
  const recommendations = [];

  // Recommendation 1: GPU Refresh (if stale packets)
  if (signals.postgres_signals?.stale_packets > 0) {
    recommendations.push({
      rank: recommendations.length + 1,
      title: 'GPU refresh stale packets',
      task_type: 'gpu_refresh',
      priority: 0.90,
      eta_minutes: signals.gpu_health?.cuda_available ? 45 : 120,
      confidence: 0.92,
      cost: {
        tokens: 5000,
        latency_ms: signals.gpu_health?.cuda_available ? 30000 : 60000,
      },
      risk: 'low',
      suggested_worker: signals.gpu_health?.cuda_available ? 'gpu-worker' : 'langraph-cpu',
      suggested_tools: ['gpu_compute_events', 'packet_features', 'autoencoder_encode'],
      rationale: `${signals.postgres_signals.stale_packets} packets need GPU refresh`,
    });
  }

  // Recommendation 2: Index new files (if git changes)
  if (signals.git_state?.dirty_count > 5) {
    recommendations.push({
      rank: recommendations.length + 1,
      title: 'Incremental indexing (new/changed files)',
      task_type: 'index_codebase',
      priority: 0.80,
      eta_minutes: 20,
      confidence: 0.88,
      cost: { tokens: 3000, latency_ms: 15000 },
      risk: 'low',
      suggested_worker: 'langraph',
      suggested_tools: ['rg_scan', 'packet_registry_update', 'qdrant_upsert'],
      rationale: `${signals.git_state.dirty_count} files changed`,
    });
  }

  // Recommendation 3: RL Rerank (if tasks pending policy score)
  if (signals.postgres_signals?.task_outcomes?.completed > 2) {
    recommendations.push({
      rank: recommendations.length + 1,
      title: 'RL policy reranking on task outcomes',
      task_type: 'rl_rerank',
      priority: 0.70,
      eta_minutes: 30,
      confidence: 0.85,
      cost: { tokens: 2000, latency_ms: 20000 },
      risk: 'medium',
      suggested_worker: 'gpu-worker',
      suggested_tools: ['policy_model_eval', 'packet_features_update', 'grpo_logging'],
      rationale: `${signals.postgres_signals.task_outcomes.completed || 0} tasks completed, ready for policy learning`,
    });
  }

  // Recommendation 4: Health audit (always low priority, off-hours)
  recommendations.push({
    rank: recommendations.length + 1,
    title: 'System health audit',
    task_type: 'health_audit',
    priority: 0.20,
    eta_minutes: 5,
    confidence: 1.0,
    cost: { tokens: 100, latency_ms: 2000 },
    risk: 'low',
    suggested_worker: 'indexer',
    suggested_tools: ['postgres_health_check', 'redis_health_check', 'qdrant_health_check'],
    rationale: 'Regular system health monitoring',
  });

  // Sort by priority
  recommendations.sort((a, b) => b.priority - a.priority);
  recommendations.forEach((rec, idx) => rec.rank = idx + 1);

  return recommendations;
}

// ============================================================================
// 5. AGENT SCHEDULER EMISSION
// ============================================================================

async function emitToAgentScheduler(spec, recommendations) {
  const db_client = await initDb();
  const emittedIds = [];

  try {
    for (const rec of recommendations) {
      const jobId = randomUUID();
      const payload = {
        spec_id: spec.spec_id,
        recommendation_id: `${rec.task_type}-${rec.rank}`,
        title: rec.title,
        priority: rec.priority,
        suggested_worker: rec.suggested_worker,
        tools: rec.suggested_tools,
        cost_estimate: rec.cost,
        eta_minutes: rec.eta_minutes,
      };

      if (!FLAGS.dryRun) {
        // Check if job already queued
        const existing = await db_client`
          SELECT job_id FROM agent_scheduler_jobs
          WHERE job_type = ${rec.task_type}
            AND status IN ('pending', 'queued')
            AND created_at > NOW() - INTERVAL '1 hour'
          LIMIT 1
        `;

        if (!existing.length) {
          await db_client`
            INSERT INTO agent_scheduler_jobs (job_id, job_type, priority, payload, status)
            VALUES (${jobId}, ${rec.task_type}, ${rec.priority * 100}, ${JSON.stringify(payload)}, 'pending')
          `;
          emittedIds.push(jobId);
          if (FLAGS.verbose) console.log(`[EMIT] Job ${rec.task_type} → ${jobId}`);
        } else {
          if (FLAGS.verbose) console.log(`[SKIP] ${rec.task_type} already queued`);
        }
      } else {
        // Dry-run: just log
        if (FLAGS.verbose) console.log(`[DRY-RUN] Would emit: ${rec.task_type} (priority ${rec.priority})`);
        emittedIds.push(`${jobId}-dry-run`);
      }
    }
  } catch (err) {
    console.error('[ERROR] emitToAgentScheduler:', err.message);
  }

  return emittedIds;
}

// ============================================================================
// 6. MAIN ORCHESTRATOR
// ============================================================================

async function run() {
  const startTime = performance.now();
  console.log('[EXECUTIVE PLANNER]');
  console.log(`[START] ${new Date().toISOString()}`);
  console.log(`[TRIGGER] ${FLAGS.trigger}`);
  if (FLAGS.dryRun) console.log('[MODE] DRY-RUN (no Postgres writes)');

  const result = {
    timestamp: new Date().toISOString(),
    trigger: FLAGS.trigger,
    mode: FLAGS.dryRun ? 'dry-run' : 'live',
    steps: [],
  };

  try {
    // Step 1: Collect signals
    console.log('\n[STEP 1] Collecting signals...');
    const signals = await collectSignals();
    result.steps.push({
      step: 'signal_collection',
      duration_s: signals.collection_duration_s,
      signal_count: Object.keys(signals.signals).length,
    });
    if (FLAGS.verbose) {
      console.log(JSON.stringify(signals, null, 2));
    }

    // Step 2: Generate spec with OpenSpec
    console.log('\n[STEP 2] Generating spec with OpenSpec...');
    const spec = await generateSpecWithOpenspec(signals);
    result.steps.push({
      step: 'spec_generation',
      spec_id: spec.spec_id,
      task_count: spec.decomposition.length,
    });

    // Step 3: Generate recommendations
    console.log('\n[STEP 3] Recommendations:');
    const recommendations = spec.recommendations;
    recommendations.forEach(rec => {
      console.log(`  [${rec.rank}] ${rec.title} (priority ${rec.priority.toFixed(2)})`);
      console.log(`      Worker: ${rec.suggested_worker} | ETA: ${rec.eta_minutes}m | Confidence: ${rec.confidence.toFixed(2)}`);
    });
    result.recommendations = recommendations;

    // Step 4: Emit to Agent Scheduler
    console.log('\n[STEP 4] Emitting to Agent Scheduler...');
    const emittedIds = await emitToAgentScheduler(spec, recommendations);
    result.steps.push({
      step: 'emission',
      emitted_job_count: emittedIds.length,
      job_ids: emittedIds,
    });

    // Summary
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`\n[COMPLETE] ${duration}s`);
    console.log(`[STATUS] ${recommendations.length} recommendations generated, ${emittedIds.length} jobs emitted`);
    console.log(`[NEXT] Workers will pick up queued jobs from agent_scheduler_jobs`);

    result.duration_s = parseFloat(duration);

  } catch (err) {
    console.error('[FATAL]', err.message);
    if (FLAGS.verbose) console.error(err.stack);
    result.error = err.message;
    process.exit(1);
  } finally {
    await closeClients();
  }

  // Return result for programmatic use
  return result;
}

// ============================================================================
// CLI
// ============================================================================

if (process.argv[1].includes('executive-planner.mjs')) {
  run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export default run;
export { collectSignals, generateRecommendationsFromSignals, emitToAgentScheduler };
