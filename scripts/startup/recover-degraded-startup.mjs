#!/usr/bin/env node

/**
 * Recover from Degraded Startup
 *
 * When startup health check reports FAIL/WARN states, this script:
 * 1. Identifies which services are down
 * 2. Attempts graceful recovery (restart containers, clear cache)
 * 3. Records degradation state for ACE/MCP awareness
 * 4. Returns exit code 0 (proceed) or 1 (hard block)
 *
 * Usage:
 *   node scripts/startup/recover-degraded-startup.mjs [--auto-restart] [--verbose]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const STATUS_FILE = path.join(REPO_ROOT, '.tmp', 'ace-startup-status.json');

const argv = process.argv.slice(2);
const AUTO_RESTART = argv.includes('--auto-restart');
const VERBOSE = argv.includes('--verbose');

function log(msg) {
  console.log(`[recover-degraded-startup] ${msg}`);
}

function warn(msg) {
  console.warn(`[recover-degraded-startup] WARN ${msg}`);
}

/**
 * Load startup status from last health check
 */
function loadStartupStatus() {
  if (!fs.existsSync(STATUS_FILE)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  } catch (err) {
    warn(`Failed to load startup status: ${err.message}`);
    return null;
  }
}

/**
 * Identify which services are down
 */
function analyzeFailures(status) {
  const checks = status?.checks ?? {};
  const readCheck = (key) => checks[key] ?? checks[key.toLowerCase()] ?? checks[key.toUpperCase()];
  const failures = {
    redis: readCheck('redis')?.ok === false,
    qdrant: readCheck('qdrant')?.ok === false,
    postgres: readCheck('postgres')?.ok === false,
    bifrost: readCheck('bifrost')?.ok === false,
    goRetrieval: readCheck('goRetrieval')?.ok === false,
    turbovec: readCheck('turboVec')?.ok === false,
  };

  const criticalDown = [
    failures.redis && 'Redis (cache)',
    failures.qdrant && 'Qdrant (vector store)',
    failures.postgres && 'Postgres (truth layer)',
  ].filter(Boolean);

  const warningDown = [
    failures.bifrost && 'Bifrost (semantic cache)',
    failures.goRetrieval && 'Go Retrieval (search)',
    failures.turbovec && 'TurboVec (prefilter)',
  ].filter(Boolean);

  return { failures, criticalDown, warningDown };
}

/**
 * Attempt recovery for each failed service
 */
async function attemptRecovery(failures) {
  const recovery = {
    redis: false,
    qdrant: false,
    postgres: false,
  };

  if (failures.redis && AUTO_RESTART) {
    log('Attempting to restart Redis/Valkey...');
    try {
      execSync('docker restart legal-ai-redis', { stdio: 'ignore', timeout: 15_000 });
      log('✓ Redis/Valkey restarted');
      recovery.redis = true;
    } catch (err) {
      warn(`Redis restart failed: ${err.message}`);
    }
  }

  if (failures.qdrant && AUTO_RESTART) {
    log('Attempting to restart Qdrant...');
    try {
      execSync('docker restart legal-ai-qdrant', { stdio: 'ignore', timeout: 15_000 });
      log('✓ Qdrant restarted');
      recovery.qdrant = true;
    } catch (err) {
      warn(`Qdrant restart failed: ${err.message}`);
    }
  }

  if (failures.postgres && AUTO_RESTART) {
    log('Attempting to restart Postgres...');
    try {
      execSync('docker restart legal-ai-postgres', { stdio: 'ignore', timeout: 15_000 });
      log('✓ Postgres restarted');
      recovery.postgres = true;
    } catch (err) {
      warn(`Postgres restart failed: ${err.message}`);
    }
  }

  return recovery;
}

/**
 * Record degraded state for downstream awareness
 */
function recordDegradedState(failures, recovery) {
  const degradedState = {
    timestamp: new Date().toISOString(),
    services: {
      redis: {
        down: failures.redis,
        recovered: recovery.redis,
        impact: 'Cache operations will fall back to memory-only'
      },
      qdrant: {
        down: failures.qdrant,
        recovered: recovery.qdrant,
        impact: 'Vector search unavailable; SQL/lexical fallback enabled'
      },
      postgres: {
        down: failures.postgres,
        recovered: recovery.postgres,
        impact: 'Database read-only or unavailable; in-memory fallback'
      },
      bifrost: {
        down: failures.bifrost,
        recovered: false,
        impact: 'Semantic cache unavailable'
      },
      goRetrieval: {
        down: failures.goRetrieval,
        recovered: false,
        impact: 'Search orchestrator unavailable'
      },
    },
    recommendations: [
      !recovery.redis && 'Restart Docker: docker restart legal-ai-redis',
      !recovery.qdrant && 'Restart Docker: docker restart legal-ai-qdrant',
      !recovery.postgres && 'Restart Docker: docker restart legal-ai-postgres',
      'Or run: docker compose -f docker-compose.yml up -d',
    ].filter(Boolean),
    canProceed: !failures.postgres && !failures.redis,  // Can proceed if DB + cache online
  };

  const stateFile = path.join(REPO_ROOT, '.tmp', 'ace-degraded-state.json');
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(degradedState, null, 2));

  return degradedState;
}

/**
 * Main recovery flow
 */
async function recoverFromDegradedStartup() {
  log('Starting degraded startup recovery...');

  const status = loadStartupStatus();
  if (!status) {
    log('No startup status found; assuming services are healthy');
    return 0;
  }

  const { failures, criticalDown, warningDown } = analyzeFailures(status);

  if (criticalDown.length === 0 && warningDown.length === 0) {
    log('All services operational; no recovery needed');
    return 0;
  }

  if (criticalDown.length > 0) {
    console.error(`\n⚠️  CRITICAL SERVICES DOWN:\n${criticalDown.map(s => `  - ${s}`).join('\n')}\n`);
  }

  if (warningDown.length > 0) {
    console.warn(`\n⚠️  WARNING SERVICES DOWN:\n${warningDown.map(s => `  - ${s}`).join('\n')}\n`);
  }

  if (AUTO_RESTART) {
    log('Auto-restart enabled; attempting recovery...');
    const recovery = await attemptRecovery(failures);
    const degradedState = recordDegradedState(failures, recovery);

    if (degradedState.canProceed) {
      log('✓ Critical services recovered; proceeding with startup');
      return 0;
    } else {
      console.error('\n✗ Failed to recover critical services; blocking startup');
      console.error('Recommendations:');
      degradedState.recommendations.forEach(r => console.error(`  - ${r}`));
      return 1;
    }
  } else {
    log('Auto-restart disabled; recording degraded state');
    const degradedState = recordDegradedState(failures, {
      redis: false,
      qdrant: false,
      postgres: false,
    });

    if (degradedState.canProceed) {
      log('✓ Can proceed with degraded mode');
      log('  Downstream systems will use fallback strategies');
      return 0;
    } else {
      console.error('\n✗ Cannot proceed; critical services offline');
      console.error('Recommendations:');
      degradedState.recommendations.forEach(r => console.error(`  - ${r}`));
      return 1;
    }
  }
}

// Execute
const exitCode = await recoverFromDegradedStartup();
process.exit(exitCode);
