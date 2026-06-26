#!/usr/bin/env node
/**
 * ACE Materialization Startup
 *
 * Orchestrates the complete ACE packet materialization pipeline:
 * 1. Graphify audit (feature extraction and validation)
 * 2. Qdrant materialization (packet → Qdrant payload)
 * 3. Redis import (ACE context warming)
 * 4. Neo4j topology refresh (topology consistency)
 * 5. Startup validation (all mirrors synced)
 *
 * Usage:
 *   node scripts/startup/ace-materialization-startup.mjs [--dry-run] [--verbose] [--stage=<stage>]
 *
 * Stages:
 *   - audit       : Run graphify audit
 *   - materialize : Sync Qdrant payloads
 *   - redis       : Import ACE context to Redis
 *   - topology    : Refresh Neo4j topology
 *   - validate    : Verify all mirrors (final gate)
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(ROOT, '.env'), override: false });
dotenv.config({ path: path.join(ROOT, '.env.local'), override: false });

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const STAGE_FILTER = process.argv.find(a => a.startsWith('--stage='))?.split('=')[1];

// Logging
function log(msg, level = 'info') {
  const timestamp = new Date().toISOString();
  const icons = { info: '✓', warn: '⚠', error: '✗', debug: '◆', stage: '→' }[level] || '•';
  console.log(`[${timestamp}] ${icons} ${msg}`);
}

function verbose(msg) {
  if (VERBOSE) log(msg, 'debug');
}

// Run npm script asynchronously
function runNpmScript(script, args = []) {
  return new Promise((resolve, reject) => {
    const fullArgs = [
      'run',
      script,
      '--',
      ...args,
      ...(DRY_RUN ? ['--dry-run'] : []),
      ...(VERBOSE ? ['--verbose'] : [])
    ].filter(Boolean);

    verbose(`Running: npm ${fullArgs.join(' ')}`);

    const proc = spawn('npm', fullArgs, {
      cwd: ROOT,
      stdio: VERBOSE ? 'inherit' : 'pipe',
      shell: true
    });

    let stdout = '';
    let stderr = '';

    if (!VERBOSE) {
      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
    }

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, stdout, stderr });
      } else {
        reject(new Error(`${script} failed with code ${code}:\n${stderr || stdout}`));
      }
    });

    proc.on('error', reject);
  });
}

// Stage: Graphify Audit
async function stageAudit() {
  log('🔍 Stage 1: Graphify Audit', 'stage');
  try {
    const cmd = DRY_RUN ? 'graphify:audit:dry' : 'graphify:audit';
    await runNpmScript(cmd);
    log('✓ Audit complete');
    return { success: true };
  } catch (err) {
    log(`✗ Audit failed: ${err.message}`, 'error');
    return { success: false, error: err };
  }
}

// Stage: Qdrant Materialization
async function stageMaterialize() {
  log('📦 Stage 2: Qdrant Materialization', 'stage');
  try {
    const cmd = DRY_RUN ? 'graphify:materialize:dry' : 'graphify:materialize:apply';
    await runNpmScript(cmd);
    log('✓ Materialization complete');
    return { success: true };
  } catch (err) {
    log(`✗ Materialization failed: ${err.message}`, 'error');
    return { success: false, error: err };
  }
}

// Stage: Redis Import
async function stageRedis() {
  log('🔥 Stage 3: Redis ACE Context Import', 'stage');
  try {
    const cmd = DRY_RUN ? 'graphify:redis:import:dry' : 'graphify:redis:import';
    await runNpmScript(cmd);
    log('✓ Redis import complete');
    return { success: true };
  } catch (err) {
    log(`✗ Redis import failed: ${err.message}`, 'error');
    return { success: false, error: err };
  }
}

// Stage: Topology Refresh
async function stageTopology() {
  log('🔄 Stage 4: Neo4j Topology Refresh', 'stage');
  try {
    // Topology is handled by packet-contract-repair which is eventually consistent
    await runNpmScript('atlas:packet-contract-repair');
    log('✓ Topology refresh queued');
    return { success: true };
  } catch (err) {
    log(`✗ Topology refresh failed: ${err.message}`, 'error');
    return { success: false, error: err };
  }
}

// Stage: Validation
async function stageValidate() {
  log('✓ Stage 5: Startup Validation', 'stage');
  try {
    await runNpmScript('atlas:startup:validate');
    log('✓ All mirrors validated');
    return { success: true };
  } catch (err) {
    log(`✗ Validation failed: ${err.message}`, 'error');
    return { success: false, error: err };
  }
}

// Main orchestrator
async function main() {
  log('🚀 ACE Materialization Startup Pipeline');
  log(`   Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  log(`   Verbose: ${VERBOSE}`);
  if (STAGE_FILTER) log(`   Stage filter: ${STAGE_FILTER}`);
  log('');

  const stages = [
    { name: 'audit', fn: stageAudit },
    { name: 'materialize', fn: stageMaterialize },
    { name: 'redis', fn: stageRedis },
    { name: 'topology', fn: stageTopology },
    { name: 'validate', fn: stageValidate }
  ];

  const results = {};
  const startTime = Date.now();

  for (const stage of stages) {
    // Skip if filter is set
    if (STAGE_FILTER && !stage.name.includes(STAGE_FILTER)) {
      verbose(`Skipping stage: ${stage.name}`);
      continue;
    }

    try {
      const stageStart = Date.now();
      const result = await stage.fn();
      const duration = ((Date.now() - stageStart) / 1000).toFixed(2);
      results[stage.name] = { ...result, duration };
      log(`   (${duration}s)\n`);
    } catch (err) {
      log(`✗ Unexpected error in stage ${stage.name}: ${err.message}`, 'error');
      results[stage.name] = { success: false, error: err.message };
      break;
    }
  }

  // Summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const passed = Object.values(results).filter(r => r.success).length;
  const total = Object.keys(results).length;

  log(`\n📊 Pipeline Summary (${totalTime}s)`);
  log(`   Passed: ${passed}/${total}`);

  Object.entries(results).forEach(([stage, result]) => {
    const icon = result.success ? '✓' : '✗';
    const duration = result.duration ? ` (${result.duration}s)` : '';
    log(`   ${icon} ${stage}${duration}`);
  });

  // Exit code
  const allPassed = passed === total;
  log(`\n${allPassed ? '✅ PIPELINE SUCCESS' : '❌ PIPELINE FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  log(`✗ Fatal error: ${err.message}`, 'error');
  console.error(err);
  process.exit(1);
});