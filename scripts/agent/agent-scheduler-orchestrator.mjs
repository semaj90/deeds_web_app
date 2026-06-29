#!/usr/bin/env node
/**
 * Agent Scheduler Orchestrator
 *
 * Unified coordinator for all async work:
 *   - Idle-triggered tasks (incremental indexing, cleanup)
 *   - GPU refresh work (AE, SOM, Attention, PageRank, Policy)
 *   - Startup review & recommendations
 *   - Health audits
 *   - RL feedback collection
 *
 * Architecture:
 *   Postgres → Agent Scheduler → NATS Queue → Workers (LangGraph, GPU, Indexer)
 *   ↓
 *   Valkey Cache Invalidation (bifrost:*)
 *   ↓
 *   Engram Feedback Loop (ACE priority reranking)
 *
 * Usage:
 *   npm run agent:scheduler:evaluate
 *   npm run agent:scheduler:dispatch
 *   npm run agent:scheduler:monitor
 */

import postgres from 'postgres';
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';

const ENV = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://legal_admin:password@127.0.0.1:5432/legal_ai_db',
  REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
  REDIS_PORT: process.env.REDIS_PORT || '6379',
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || 'redis',
  NATS_URL: process.env.NATS_URL || 'nats://localhost:4222',
};

// ============================================================================
// 1. DATABASE CLIENT
// ============================================================================

let db = null;

async function initDb() {
  if (db) return db;
  db = postgres(ENV.DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
  });
  return db;
}

async function closeDb() {
  if (db) await db.end();
  db = null;
}

// ============================================================================
// 2. JOB EVALUATION (Postgres truth layer)
// ============================================================================

/**
 * Evaluate what work needs to be done based on system state.
 * Returns array of job_type + priority + payload.
 */
async function evaluateJobsNeeded() {
  const db_client = await initDb();
  const jobs = [];

  try {
    // Job Type 1: Index Codebase (if index is stale > 24h or new files detected)
    const lastIndexRun = await db_client`
      SELECT created_at FROM agent_scheduler_jobs
      WHERE job_type = 'index_codebase' AND status = 'completed'
      ORDER BY completed_at DESC LIMIT 1
    `;

    if (!lastIndexRun.length || (Date.now() - lastIndexRun[0].created_at) > 86400000) {
      jobs.push({
        job_type: 'index_codebase',
        priority: 60, // high priority
        payload: {
          mode: 'incremental',
          max_files: 1000,
        },
        reason: 'Index stale or first run',
      });
    }

    // Job Type 2: GPU Refresh (packet_features with stale latent/SOM)
    const stalePackets = await db_client`
      SELECT COUNT(*) as count
      FROM packet_features
      WHERE status = 'stale'
        OR (last_gpu_refresh IS NULL)
        OR (last_gpu_refresh < NOW() - INTERVAL '7 days')
      LIMIT 1
    `;

    if (stalePackets[0].count > 0) {
      jobs.push({
        job_type: 'gpu_refresh',
        priority: 50,
        payload: {
          target: 'packet_features',
          compute_types: ['autoencoder_encode', 'som_train', 'attention_score'],
          batch_size: 100,
          limit: 5000,
        },
        reason: `${stalePackets[0].count} packets need GPU refresh`,
      });
    }

    // Job Type 3: RL Rerank (policy model eval on hot queries)
    const unrerankedTasks = await db_client`
      SELECT COUNT(*) as count
      FROM task_state_projection
      WHERE status = 'completed' AND metrics ->> 'policy_score' IS NULL
      LIMIT 1
    `;

    if (unrerankedTasks[0].count > 0) {
      jobs.push({
        job_type: 'rl_rerank',
        priority: 40,
        payload: {
          target: 'task_state_projection',
          limit: 1000,
        },
        reason: `${unrerankedTasks[0].count} tasks awaiting policy rerank`,
      });
    }

    // Job Type 4: Summary Generation (missing summaries)
    const missingSummaries = await db_client`
      SELECT COUNT(*) as count
      FROM atlas_packets
      WHERE summary IS NULL OR summary = ''
      LIMIT 1
    `;

    if (missingSummaries[0].count > 0) {
      jobs.push({
        job_type: 'summary_generation',
        priority: 45,
        payload: {
          limit: 2000,
          model: 'gemma4-rotorquant:latest',
        },
        reason: `${missingSummaries[0].count} packets need summaries`,
      });
    }

    // Job Type 5: Graph Refresh (Neo4j topology sync)
    const graphOutOfSync = await db_client`
      SELECT COUNT(*) as count
      FROM atlas_packets
      WHERE qdrant_id IS NOT NULL AND (topology_updated_at IS NULL OR topology_updated_at < NOW() - INTERVAL '3 days')
      LIMIT 1
    `;

    if (graphOutOfSync[0].count > 0) {
      jobs.push({
        job_type: 'graph_refresh',
        priority: 35,
        payload: {
          target: 'neo4j_topology',
          limit: 10000,
        },
        reason: `${graphOutOfSync[0].count} packets need topology sync`,
      });
    }

    // Job Type 6: Health Audit (system checks)
    jobs.push({
      job_type: 'health_audit',
      priority: 20, // low priority, runs off-hours
      payload: {
        checks: ['postgres_health', 'redis_health', 'gpu_health', 'qdrant_health'],
      },
      reason: 'Regular health check',
    });

  } catch (err) {
    console.error('[ERROR] evaluateJobsNeeded:', err.message);
  }

  return jobs;
}

// ============================================================================
// 3. JOB DISPATCH (insert into agent_scheduler_jobs)
// ============================================================================

/**
 * Dispatch evaluated jobs to Postgres agent_scheduler_jobs table.
 * Returns array of dispatched job_ids.
 */
async function dispatchJobs(jobs) {
  const db_client = await initDb();
  const dispatchedIds = [];

  for (const job of jobs) {
    try {
      // Check if job already pending (dedup)
      const existing = await db_client`
        SELECT job_id FROM agent_scheduler_jobs
        WHERE job_type = ${job.job_type}
          AND status IN ('pending', 'queued', 'executing')
          AND created_at > NOW() - INTERVAL '1 hour'
        LIMIT 1
      `;

      if (existing.length) {
        console.log(`[SKIP] Job ${job.job_type} already pending: ${existing[0].job_id}`);
        continue;
      }

      // Insert new job
      const jobId = randomUUID();
      await db_client`
        INSERT INTO agent_scheduler_jobs (job_id, job_type, priority, payload, status)
        VALUES (${jobId}, ${job.job_type}, ${job.priority}, ${JSON.stringify(job.payload)}, 'pending')
      `;

      dispatchedIds.push(jobId);
      console.log(`[DISPATCH] ${job.job_type} (priority ${job.priority}): ${jobId}`);
      console.log(`           Reason: ${job.reason}`);

    } catch (err) {
      console.error(`[ERROR] Failed to dispatch ${job.job_type}:`, err.message);
    }
  }

  return dispatchedIds;
}

// ============================================================================
// 4. WORKER ASSIGNMENT (queue to appropriate worker)
// ============================================================================

/**
 * Assign pending jobs to appropriate worker (langraph, gpu-worker, indexer).
 * Returns count of assigned jobs.
 */
async function assignJobs() {
  const db_client = await initDb();
  let assignedCount = 0;

  try {
    // Fetch pending jobs, ordered by priority
    const pendingJobs = await db_client`
      SELECT job_id, job_type, priority, depends_on FROM agent_scheduler_jobs
      WHERE status = 'pending'
      ORDER BY priority DESC
      LIMIT 50
    `;

    for (const job of pendingJobs) {
      // Determine worker based on job_type
      let assignedWorker = null;
      if (['index_codebase', 'summary_generation'].includes(job.job_type)) {
        assignedWorker = 'langraph';
      } else if (['gpu_refresh', 'rl_rerank'].includes(job.job_type)) {
        assignedWorker = 'gpu-worker';
      } else if (['graph_refresh', 'health_audit'].includes(job.job_type)) {
        assignedWorker = 'indexer';
      }

      if (!assignedWorker) continue;

      // Check if dependencies resolved
      let dependenciesMet = true;
      if (job.depends_on && job.depends_on.length > 0) {
        const dependencyStates = await db_client`
          SELECT status FROM agent_scheduler_jobs
          WHERE job_id = ANY(${job.depends_on})
        `;
        dependenciesMet = dependencyStates.every(d => d.status === 'completed');
      }

      if (!dependenciesMet) {
        console.log(`[WAIT] Job ${job.job_id} waiting on dependencies`);
        continue;
      }

      // Assign job to worker
      await db_client`
        UPDATE agent_scheduler_jobs
        SET status = 'queued', assigned_worker = ${assignedWorker}, updated_at = NOW()
        WHERE job_id = ${job.job_id}
      `;

      console.log(`[ASSIGN] ${job.job_type} → ${assignedWorker}`);
      assignedCount++;
    }

  } catch (err) {
    console.error('[ERROR] assignJobs:', err.message);
  }

  return assignedCount;
}

// ============================================================================
// 5. ENGAGEMENT METRICS (for Engram hotness + Karpathy blend)
// ============================================================================

/**
 * Update engram_recall_projection hotness from context_timeline_events signals.
 * Feeds into ACE priority reranking.
 */
async function updateEngram HotnessMetrics() {
  const db_client = await initDb();

  try {
    // Aggregate signals by memory_id over last 7 days
    const signals = await db_client`
      SELECT
        user_intent,
        COUNT(*) as signal_count,
        AVG(CAST(grpo_reward AS float)) as avg_reward
      FROM context_timeline_events
      WHERE created_at > NOW() - INTERVAL '7 days'
        AND signal IS NOT NULL
      GROUP BY user_intent
    `;

    // Update engram_recall_projection.hotness
    for (const sig of signals) {
      // Normalize: higher signal_count + higher avg_reward = higher hotness
      const hotness = Math.min(1.0, (sig.signal_count / 100.0) * (1.0 + (sig.avg_reward || 0.0)));

      // This is a simplified example — real implementation would track memory_id
      console.log(`[HOTNESS] ${sig.user_intent}: ${hotness.toFixed(3)}`);
    }

  } catch (err) {
    console.error('[ERROR] updateEngramHotnessMetrics:', err.message);
  }
}

// ============================================================================
// 6. MAIN ORCHESTRATOR LOOP
// ============================================================================

async function run() {
  const startTime = performance.now();
  console.log('[AGENT SCHEDULER ORCHESTRATOR]');
  console.log(`[START] ${new Date().toISOString()}`);

  try {
    // Step 1: Evaluate what work is needed
    console.log('\n[STEP 1] Evaluating jobs needed...');
    const jobsNeeded = await evaluateJobsNeeded();
    console.log(`[RESULT] ${jobsNeeded.length} job types identified`);

    // Step 2: Dispatch jobs to Postgres
    console.log('\n[STEP 2] Dispatching jobs...');
    const dispatchedIds = await dispatchJobs(jobsNeeded);
    console.log(`[RESULT] ${dispatchedIds.length} jobs dispatched`);

    // Step 3: Assign jobs to workers
    console.log('\n[STEP 3] Assigning jobs to workers...');
    const assignedCount = await assignJobs();
    console.log(`[RESULT] ${assignedCount} jobs assigned`);

    // Step 4: Update Engram hotness metrics
    console.log('\n[STEP 4] Updating Engram hotness metrics...');
    await updateEngramHotnessMetrics();

    // Step 5: Summary
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`\n[COMPLETE] ${duration}s`);
    console.log(`[STATUS] Orchestrator cycle finished. Jobs ready for worker pickup.`);

  } catch (err) {
    console.error('[FATAL]', err.message);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

// ============================================================================
// CLI
// ============================================================================

const cmd = process.argv[2] || 'evaluate';

switch (cmd) {
  case 'evaluate':
    run().catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
    break;

  case 'dry-run':
    (async () => {
      const jobsNeeded = await evaluateJobsNeeded();
      console.log('JOBS NEEDED (dry-run):');
      console.log(JSON.stringify(jobsNeeded, null, 2));
      await closeDb();
    })();
    break;

  default:
    console.error(`Usage: npm run agent:scheduler:evaluate [evaluate|dry-run]`);
    process.exit(1);
}
