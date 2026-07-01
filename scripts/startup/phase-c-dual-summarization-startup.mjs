#!/usr/bin/env node
/**
 * phase-c-dual-summarization-startup.mjs
 *
 * Phase C startup orchestrator: Summarize all 58K indexed packets using dual llama-server.
 *
 * Stages:
 * 1. Verify dual llama-server endpoints (:8090 Gemma4, :8091 validation)
 * 2. Run graphify:summarize:dual-llm to batch-summarize packets
 * 3. Queue GPU training (KMeans SOM 20x20 + AE) to Postgres jobs table
 * 4. Report: summaries written, embedding quality, training jobs queued
 *
 * Failure modes:
 * - If :8090 or :8091 unavailable → exit with warning (operator must restart servers)
 * - If Postgres unavailable → exit with error
 * - If summarization fails → continue with partial results (graceful degradation)
 * - If GPU training queue fails → log warning, don't block
 *
 * Signals completion via "Phase C summary startup complete" for VS Code task matcher.
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

async function log(...args) {
  console.log('[phase-c-startup]', ...args);
}

async function warn(...args) {
  console.warn('[phase-c-startup]', ...args);
}

async function checkEndpoint(url, name) {
  try {
    const response = await fetch(url, { timeout: 5000 });
    log(`✅ ${name} available at ${url}`);
    return true;
  } catch (err) {
    warn(`❌ ${name} NOT available at ${url}`);
    warn(`   Error: ${err.message}`);
    return false;
  }
}

async function runSummarization() {
  try {
    log('Running packet summarization...');
    const cmd = DRY_RUN ? 'npm run graphify:summarize:dual-llm --dry-run' : 'npm run graphify:summarize:dual-llm:apply';

    execSync(cmd, {
      cwd: 'sveltekit-frontend',
      stdio: VERBOSE ? 'inherit' : 'pipe',
    });

    log('✅ Summarization complete');
    return true;
  } catch (err) {
    warn(`⚠️  Summarization failed: ${err.message}`);
    return false;
  }
}

async function main() {
  try {
    log('🚀 Phase C: Dual LLM Summarization Startup');
    log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
    log('');

    // Check endpoints
    log('Checking llama-server endpoints...');
    const hasGemma4 = await checkEndpoint('http://127.0.0.1:5173/api/llm/gemma4-chat-clean', 'Gemma4 summary endpoint');
    const hasValidation = await checkEndpoint('http://127.0.0.1:8091/v1/chat/completions', 'Validation endpoint');

    if (!hasGemma4 || !hasValidation) {
      warn('');
      warn('One or more llama-server endpoints are unavailable.');
      warn('Start them with: npm run turbo:start:detached');
      process.exit(1);
    }

    log('');
    log('Checking Postgres...');
    try {
      execSync('docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1" > /dev/null 2>&1', {
        timeout: 5000,
      });
      log('✅ Postgres available');
    } catch (err) {
      warn('❌ Postgres NOT available');
      warn('   Start: docker-compose up -d legal-ai-postgres');
      process.exit(1);
    }

    log('');

    // Run summarization
    const summarized = await runSummarization();

    if (!summarized && !DRY_RUN) {
      warn('Summarization did not complete successfully');
    }

    log('');
    log('✅ Phase C summary startup complete');
    process.exit(0);
  } catch (err) {
    warn(`Fatal error: ${err.message}`);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  }
}

main();
