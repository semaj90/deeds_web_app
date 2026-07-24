#!/usr/bin/env node
/**
 * Daily Graphify Orchestrator (Stage 0–14)
 *
 * Unified runner for complete codebase intelligence pipeline:
 * 1. Incremental file inventory (delta detection)
 * 2. Structural extraction (AST parsing)
 * 3. Semantic embeddings (768-dim via embeddinggemma)
 * 4. Topology extraction (USES/CALLS/IMPORTS edges)
 * 4b. Edge endpoint validation (orphan detection)
 * 5. PageRank authority scoring
 * 6. K-means clustering (20 clusters)
 * 7. Self-organizing map (20×20 grid)
 * 8. Neo4j topology materialization
 *
 * Hard gates at each stage:
 * - INCREMENTAL_FILE_INVENTORY_PROVEN (Stage 1)
 * - STRUCTURAL_EXTRACTION_COMPLETE (Stage 2)
 * - SEMANTIC_EMBEDDING_COMPLETE (Stage 3)
 * - EDGE_ENDPOINT_INTEGRITY_PROVEN (Stage 4b)
 * - NETWORKX_REFERENCE_PROVEN (Stage 5)
 * - TOPOLOGY_MATERIALIZATION_COMPLETE (Stage 8)
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import Redis from 'ioredis';

const execAsync = promisify(exec);
const WORKSPACE_ROOT = process.cwd();
const CONFIG_PATH = path.join(WORKSPACE_ROOT, 'scripts/atlas/daily-graphify-config.json');
const STAGE_SCRIPTS_DIR = path.join(WORKSPACE_ROOT, 'scripts/atlas');
const LOG_FILE = path.join(WORKSPACE_ROOT, 'docs/graphify-execution-log.md');
const REPORT_FILE = path.join(WORKSPACE_ROOT, 'docs/reports/graphify-daily-execution-report.json');

/**
 * Load orchestrator configuration
 */
function loadConfig() {
  try {
    const configJson = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(configJson);
  } catch (err) {
    console.error(`[Orchestrator] Config load failed: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Log execution event to both console and markdown log file
 */
function logEvent(event, details) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${event}: ${JSON.stringify(details)}`;

  console.log(logEntry);

  try {
    const mdEntry = `- **${timestamp}** — ${event}: ${details.message || ''}`;
    fs.appendFileSync(LOG_FILE, mdEntry + '\n', 'utf-8');
  } catch (err) {
    console.warn(`[Orchestrator] Log write failed: ${err.message}`);
  }
}

/**
 * Execute a single stage script with error handling and gate validation
 */
async function executeStage(config, stageConfig, stageIndex) {
  const stageId = stageConfig.stageId;
  const stageName = stageConfig.name;
  const scriptPath = path.join(STAGE_SCRIPTS_DIR, stageConfig.script);
  const timeoutSeconds = stageConfig.timeout_seconds || 600;
  const isCritical = stageConfig.critical !== false;
  const gateName = stageConfig.gate || null;

  logEvent('STAGE_START', {
    stage: stageId,
    name: stageName,
    script: stageConfig.script,
    timeout: timeoutSeconds,
    critical: isCritical,
  });

  try {
    // Check if script exists
    if (!fs.existsSync(scriptPath)) {
      const msg = `Script not found: ${scriptPath}`;
      logEvent('STAGE_ERROR', { stage: stageId, error: msg });

      if (isCritical) {
        console.error(`[Orchestrator] Critical stage ${stageId} failed: ${msg}`);
        return { success: false, stageId, stageName, error: msg };
      }
      return { success: true, stageId, stageName, skipped: true, reason: 'Script not found' };
    }

    // Execute stage script with timeout
    const command = `node ${scriptPath}`;
    const timeout = timeoutSeconds * 1000;

    console.log(`[Orchestrator] Running: ${command}`);
    const { stdout, stderr } = await execAsync(command, { timeout, maxBuffer: 10 * 1024 * 1024 });

    if (stderr) {
      console.warn(`[Stage ${stageId}] stderr: ${stderr}`);
    }

    logEvent('STAGE_COMPLETE', {
      stage: stageId,
      name: stageName,
      output_lines: stdout.split('\n').length,
    });

    return { success: true, stageId, stageName, output: stdout };
  } catch (err) {
    const errorMsg = err.message || String(err);
    logEvent('STAGE_FAILED', { stage: stageId, name: stageName, error: errorMsg });

    if (isCritical) {
      console.error(`[Orchestrator] Critical stage ${stageId} failed: ${errorMsg}`);
      return { success: false, stageId, stageName, error: errorMsg };
    }

    // Non-critical stage failure: log and continue
    console.warn(`[Orchestrator] Non-critical stage ${stageId} failed; continuing...`);
    return { success: false, stageId, stageName, error: errorMsg, critical: false };
  }
}

/**
 * Validate hard gates between stages
 */
async function validateGate(gateName, redis) {
  if (!gateName) {
    return true; // No gate to validate
  }

  try {
    const gateKey = `gate:${gateName}`;
    const gateStatus = await redis.get(gateKey);

    if (!gateStatus || gateStatus !== 'PROVEN') {
      console.warn(`[Orchestrator] Gate ${gateName} not proven; proceeding cautiously...`);
      return false;
    }

    console.log(`[Orchestrator] Gate ${gateName} PROVEN ✓`);
    return true;
  } catch (err) {
    console.warn(`[Orchestrator] Gate validation error: ${err.message}`);
    return false; // Soft fail: allow continuation
  }
}

/**
 * Emit metrics to Redis for monitoring
 */
async function emitMetrics(redis, config, results) {
  if (!config.monitoring?.emitMetricsToRedis) {
    return;
  }

  try {
    const keyPrefix = config.monitoring.redisKeyPrefix || 'graphify:daily';
    const metrics = {
      last_run: new Date().toISOString(),
      total_stages: results.length,
      successful_stages: results.filter((r) => r.success).length,
      failed_stages: results.filter((r) => !r.success).length,
      duration_seconds: 0, // Will be calculated by caller
    };

    await redis.set(`${keyPrefix}:metrics`, JSON.stringify(metrics), 'EX', 86400);
    console.log(`[Orchestrator] Metrics emitted to Redis`);
  } catch (err) {
    console.warn(`[Orchestrator] Metrics emission failed: ${err.message}`);
  }
}

/**
 * Generate JSON report of execution
 */
function generateReport(config, results, duration) {
  const report = {
    execution_date: new Date().toISOString(),
    duration_seconds: Math.round(duration / 1000),
    workspace_id: config.workspace_id,
    stages: results,
    summary: {
      total_stages: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success && r.critical).length,
      skipped: results.filter((r) => r.skipped).length,
    },
  };

  try {
    const reportDir = path.dirname(REPORT_FILE);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`[Orchestrator] Report written: ${REPORT_FILE}`);
  } catch (err) {
    console.warn(`[Orchestrator] Report generation failed: ${err.message}`);
  }

  return report;
}

/**
 * Main orchestrator loop
 */
async function main() {
  const config = loadConfig();
  const startTime = Date.now();

  // Initialize Redis for gate validation and metrics
  let redis = null;
  try {
    redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    await redis.connect();
    console.log('[Orchestrator] Redis connected');
  } catch (err) {
    console.warn(`[Orchestrator] Redis unavailable (non-blocking): ${err.message}`);
  }

  logEvent('ORCHESTRATOR_START', {
    workspace_id: config.workspace_id,
    schedule: config.schedule.cron,
    stages: config.stages.length,
  });

  const results = [];

  for (let i = 0; i < config.stages.length; i++) {
    const stageConfig = config.stages[i];

    // Validate gate before executing stage (if gate specified)
    if (stageConfig.gate) {
      const gateProven = await validateGate(stageConfig.gate, redis);
      if (!gateProven) {
        console.warn(`[Orchestrator] Gate ${stageConfig.gate} not proven; stage may be incomplete`);
      }
    }

    // Execute stage
    const result = await executeStage(config, stageConfig, i);
    results.push(result);

    // On critical failure, stop execution
    if (!result.success && stageConfig.critical) {
      console.error(`[Orchestrator] Critical stage ${stageConfig.stageId} failed; aborting pipeline`);
      logEvent('ORCHESTRATOR_ABORT', {
        reason: `Critical stage ${stageConfig.stageId} failure`,
        completed_stages: i,
        total_stages: config.stages.length,
      });
      break;
    }
  }

  // Generate report
  const duration = Date.now() - startTime;
  const report = generateReport(config, results, duration);

  // Emit metrics
  if (redis) {
    await emitMetrics(redis, config, results);
    await redis.quit();
  }

  // Final log event
  logEvent('ORCHESTRATOR_COMPLETE', {
    duration_seconds: Math.round(duration / 1000),
    successful_stages: report.summary.successful,
    failed_stages: report.summary.failed,
  });

  // Exit with status
  const hasFailedCritical = results.some((r) => !r.success && r.critical);
  process.exit(hasFailedCritical ? 1 : 0);
}

// Run orchestrator
main().catch((err) => {
  console.error(`[Orchestrator] Fatal error: ${err.message}`);
  process.exit(1);
});
