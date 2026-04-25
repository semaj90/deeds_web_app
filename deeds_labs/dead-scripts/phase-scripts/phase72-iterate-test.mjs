#!/usr/bin/env node
/**
 * Phase 72: GPU Pipeline Iterative Test (3 Cycles)
 * Runs: svelte-check → vectorize → cluster → ACE fix, three times
 * Logs all metrics and errors to timestamped file
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Create logs directory
const LOGS_DIR = path.join(ROOT, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = path.join(LOGS_DIR, `phase72-iterate-${timestamp}.log`);
const METRICS_FILE = path.join(LOGS_DIR, `phase72-metrics-${timestamp}.json`);

class TestLogger {
  constructor(logPath, metricsPath) {
    this.logPath = logPath;
    this.metricsPath = metricsPath;
    this.metrics = {
      startTime: new Date().toISOString(),
      cycles: [],
      summary: {}
    };
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] [${level}] ${message}`;
    console.log(entry);
    fs.appendFileSync(this.logPath, entry + '\n');
  }

  logSection(title) {
    const separator = '='.repeat(70);
    this.log(separator);
    this.log(title);
    this.log(separator);
  }

  error(message, error) {
    this.log(`ERROR: ${message}`, 'ERROR');
    if (error) {
      this.log(`  Details: ${error.message}`, 'ERROR');
      if (error.stderr) this.log(`  Stderr: ${error.stderr.toString().slice(0, 500)}`, 'ERROR');
    }
  }

  saveCycleMetrics(cycle, data) {
    this.metrics.cycles.push({
      cycle,
      timestamp: new Date().toISOString(),
      ...data
    });
  }

  saveMetrics() {
    this.metrics.endTime = new Date().toISOString();
    fs.writeFileSync(this.metricsPath, JSON.stringify(this.metrics, null, 2));
    this.log(`📊 Metrics saved to: ${this.metricsPath}`);
  }
}

const logger = new TestLogger(LOG_FILE, METRICS_FILE);

logger.logSection('🚀 Phase 72: GPU Pipeline Iterative Test (3 Cycles)');
logger.log(`Log file: ${LOG_FILE}`);
logger.log(`Metrics file: ${METRICS_FILE}`);

async function runCommand(cmd, args, label) {
  return new Promise((resolve, reject) => {
    logger.log(`\n► Running: ${cmd} ${args.join(' ')}`);
    const startTime = Date.now();

    const proc = spawn(cmd, args, {
      cwd: ROOT,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });

    proc.on('exit', (code) => {
      const duration = Date.now() - startTime;
      const success = code === 0;

      if (success) {
        logger.log(`✅ ${label} completed in ${(duration / 1000).toFixed(1)}s`);
      } else {
        logger.log(
          `❌ ${label} failed with exit code ${code} (${(duration / 1000).toFixed(1)}s)`,
          'ERROR'
        );
      }

      resolve({ code, stdout, stderr, duration, success });
    });

    proc.on('error', (err) => {
      logger.error(`${label} failed to start`, err);
      reject(err);
    });
  });
}

async function getSvelteCheckErrorCount() {
  try {
    const result = await runCommand('npx', ['svelte-check', '--output', 'json'], 'svelte-check');
    if (result.success) {
      const data = JSON.parse(result.stdout);
      let count = 0;
      if (data.diagnostics) count = data.diagnostics.length;
      else if (data.files) {
        for (const file of Object.values(data.files)) {
          if (file.result?.errors) count += file.result.errors.length;
        }
      }
      return count;
    }
  } catch (err) {
    logger.error('Failed to parse svelte-check output', err);
  }
  return -1;
}

async function runCycle(cycleNum) {
  logger.logSection(`🔄 CYCLE ${cycleNum}/3: GPU Pipeline + ACE Fix`);

  const cycleData = {
    cycle: cycleNum,
    errorsBefore: -1,
    errorsAfter: -1,
    pipelineTime: 0,
    aceTime: 0,
    errorReduction: 0,
    pipelineSuccess: false,
    aceSuccess: false
  };

  try {
    // Get baseline error count
    logger.log('\n📊 Getting baseline error count...');
    cycleData.errorsBefore = await getSvelteCheckErrorCount();
    logger.log(`   Baseline: ${cycleData.errorsBefore} errors`);

    // Run GPU pipeline
    logger.log('\n📈 Step 1: Running GPU-accelerated pipeline...');
    const pipelineResult = await runCommand(
      'npm',
      ['run', 'phase72:gpu:pipeline'],
      'GPU Pipeline'
    );
    cycleData.pipelineTime = pipelineResult.duration;
    cycleData.pipelineSuccess = pipelineResult.success;

    if (!pipelineResult.success) {
      logger.error('GPU pipeline failed', { stderr: pipelineResult.stderr });
    } else {
      // Run ACE fix
      logger.log('\n🤖 Step 2: Running ACE execute...');
      const aceResult = await runCommand('npm', ['run', 'ace:execute'], 'ACE Execute');
      cycleData.aceTime = aceResult.duration;
      cycleData.aceSuccess = aceResult.success;

      if (!aceResult.success) {
        logger.error('ACE execute failed', { stderr: aceResult.stderr });
      }
    }

    // Get final error count
    logger.log('\n📊 Getting final error count...');
    cycleData.errorsAfter = await getSvelteCheckErrorCount();
    logger.log(`   Final: ${cycleData.errorsAfter} errors`);

    // Calculate reduction
    if (cycleData.errorsBefore > 0 && cycleData.errorsAfter >= 0) {
      cycleData.errorReduction = (
        (cycleData.errorsBefore - cycleData.errorsAfter) /
        cycleData.errorsBefore
      ) * 100;
    }

    logger.log(`\n📈 Cycle ${cycleNum} Summary:`);
    logger.log(`   Errors: ${cycleData.errorsBefore} → ${cycleData.errorsAfter}`);
    logger.log(`   Reduction: ${cycleData.errorReduction.toFixed(1)}%`);
    logger.log(`   Pipeline time: ${(cycleData.pipelineTime / 1000).toFixed(1)}s`);
    logger.log(`   ACE time: ${(cycleData.aceTime / 1000).toFixed(1)}s`);
    logger.log(`   Total: ${((cycleData.pipelineTime + cycleData.aceTime) / 1000).toFixed(1)}s`);
  } catch (err) {
    logger.error(`Cycle ${cycleNum} failed`, err);
  }

  logger.saveCycleMetrics(cycleNum, cycleData);
  return cycleData;
}

async function main() {
  const cycles = [];

  for (let i = 1; i <= 3; i++) {
    try {
      const cycleData = await runCycle(i);
      cycles.push(cycleData);

      // Wait between cycles
      if (i < 3) {
        logger.log('\n⏳ Waiting 5s before next cycle...');
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (err) {
      logger.error(`Cycle ${i} failed unexpectedly`, err);
      break;
    }
  }

  // Final summary
  logger.logSection('🎉 Test Complete - Final Summary');

  let totalBefore = 0;
  let totalAfter = 0;
  let totalReduction = 0;

  for (const cycle of cycles) {
    if (cycle.errorsBefore > 0) {
      totalBefore = cycle.errorsBefore; // Use last cycle's baseline
      totalAfter = cycle.errorsAfter;
    }
    logger.log(
      `Cycle ${cycle.cycle}: ${cycle.errorsBefore} → ${cycle.errorsAfter} (${cycle.errorReduction.toFixed(1)}% reduction)`
    );
  }

  if (totalBefore > 0 && totalAfter >= 0) {
    totalReduction = ((totalBefore - totalAfter) / totalBefore) * 100;
    logger.log(`\n📊 Cumulative: ${totalBefore} → ${totalAfter} errors (${totalReduction.toFixed(1)}% reduction)`);
  }

  logger.log('\n✅ All cycles completed!');
  logger.log(`📝 Log: ${LOG_FILE}`);
  logger.log(`📊 Metrics: ${METRICS_FILE}`);

  // Save metrics
  logger.metrics.summary = {
    totalCycles: cycles.length,
    totalBefore,
    totalAfter,
    totalReduction,
    cycleSummaries: cycles
  };
  logger.saveMetrics();

  process.exit(cycles.some((c) => !c.pipelineSuccess || !c.aceSuccess) ? 1 : 0);
}

main().catch((err) => {
  logger.error('Fatal error', err);
  logger.saveMetrics();
  process.exit(1);
});
