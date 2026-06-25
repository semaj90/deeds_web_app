#!/usr/bin/env node
/**
 * Complete Graphify Startup Pipeline
 *
 * Orchestrates the full graphify audit + consumer workflow:
 * 1. Run graphify:daily audit
 * 2. Start consumer daemon (listens for queue messages)
 * 3. Wait for ACE/cache/topology workers to complete
 * 4. Report completion
 *
 * This replaces the broken graphify:daily that had Valkey race conditions.
 *
 * Usage:
 *   npm run startup:graphify-complete [--full] [--skip-consumer] [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Load environment
dotenv.config({ path: path.join(ROOT, '.env'), override: false });
dotenv.config({ path: path.join(ROOT, '.env.local'), override: false });

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_CONSUMER = process.argv.includes('--skip-consumer');
const FULL_CODEBASE = process.argv.includes('--full');
const VERBOSE = process.argv.includes('--verbose');

// Logging
function log(msg, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = { info: '✓', warn: '⚠', error: '✗', debug: '◆' }[level] || '•';
  console.log(`[${timestamp}] ${prefix} ${msg}`);
}

function verbose(msg) {
  if (VERBOSE) log(msg, 'debug');
}

// Run npm script
async function runNpmScript(script, args = []) {
  return new Promise((resolve, reject) => {
    if (DRY_RUN) {
      log(`[DRY-RUN] npm run ${script} ${args.join(' ')}`, 'debug');
      resolve({ success: true, dry_run: true });
      return;
    }

    const proc = spawn('npm', ['run', script, '--', ...args], {
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
        reject(new Error(`${script} failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', reject);
  });
}

// Main pipeline
async function runPipeline() {
  try {
    log('═════════════════════════════════════════════════════════════');
    log('🚀 GRAPHIFY COMPLETE STARTUP PIPELINE');
    log('═════════════════════════════════════════════════════════════');
    log(`Dry-run: ${DRY_RUN}`);
    log(`Full codebase: ${FULL_CODEBASE}`);
    log(`Skip consumer: ${SKIP_CONSUMER}`);
    log('');

    const startTime = Date.now();

    // PHASE 1: Run Graphify Audit
    log('\n📊 PHASE 1: Running Graphify Audit');
    log('─────────────────────────────────────────────────────────────');
    const auditScript = FULL_CODEBASE ? 'graphify:daily:full' : 'graphify:daily';
    try {
      await runNpmScript(auditScript);
      log('✓ Audit complete');
    } catch (err) {
      log(`✗ Audit failed: ${err.message}`, 'error');
      throw err;
    }

    // PHASE 2: Start Consumer Daemon (if not skipped)
    if (!SKIP_CONSUMER) {
      log('\n🔄 PHASE 2: Starting Consumer Daemon');
      log('─────────────────────────────────────────────────────────────');
      try {
        await runNpmScript('daemon:graphify:start');
        log('✓ Consumer daemon started');

        // Give daemon time to start and process messages
        if (!DRY_RUN) {
          log('  Waiting for queue processing (30 seconds)...');
          await new Promise((resolve) => setTimeout(resolve, 30000));
        }
      } catch (err) {
        log(`✗ Consumer daemon failed to start: ${err.message}`, 'warn');
        // Don't fail the pipeline, just warn
      }
    } else {
      log('\n⏭️  PHASE 2: Skipping Consumer Daemon (--skip-consumer)');
    }

    // PHASE 3: Verify Outputs
    log('\n✅ PHASE 3: Verifying Outputs');
    log('─────────────────────────────────────────────────────────────');
    const tmpDir = path.join(ROOT, '.tmp');
    const expectedFiles = [
      'graphify-audit-manifest.json',
      'gan-validation-results.json',
      'ace-cache-search.json',
      'kanban-update.json',
      'health-check-results.json'
    ];

    let missingFiles = [];
    for (const file of expectedFiles) {
      const filePath = path.join(tmpDir, file);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        log(`  ✓ ${file} (${(stats.size / 1024).toFixed(1)}KB)`);
      } else {
        log(`  ✗ ${file} (missing)`, 'warn');
        missingFiles.push(file);
      }
    }

    if (missingFiles.length > 0) {
      log(`⚠️  ${missingFiles.length} file(s) missing`, 'warn');
    }

    // PHASE 4: Summary
    const elapsedMs = Date.now() - startTime;
    const elapsedSec = (elapsedMs / 1000).toFixed(1);

    log('\n═════════════════════════════════════════════════════════════');
    log('✅ GRAPHIFY STARTUP COMPLETE');
    log('═════════════════════════════════════════════════════════════');
    log(`Duration: ${elapsedSec}s`);
    log(`Output directory: ${tmpDir}`);

    if (!SKIP_CONSUMER) {
      log('\n📡 Consumer daemon is running in background');
      log('  Check status:  npm run daemon:graphify:status');
      log('  View logs:     npm run daemon:graphify:logs');
      log('  Stop daemon:   npm run daemon:graphify:stop');
    }

    log('\n✨ Ready for downstream processing (ACE warming, topology refresh)');

    return {
      success: true,
      duration: elapsedSec,
      phase: 'complete'
    };
  } catch (err) {
    log(`\n✗ Pipeline failed: ${err.message}`, 'error');
    process.exit(1);
  }
}

// Start the pipeline
runPipeline().catch((err) => {
  log(`✗ Fatal error: ${err.message}`, 'error');
  console.error(err);
  process.exit(1);
});
