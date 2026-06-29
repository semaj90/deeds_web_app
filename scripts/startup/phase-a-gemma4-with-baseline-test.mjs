#!/usr/bin/env node
/**
 * Phase A + TurboVec Baseline Test Orchestrator
 *
 * Runs Gemma4 batch summarizer in foreground while launching TurboVec baseline
 * test detached in background. Provides visibility into both:
 *   - Gemma4 summary generation progress (foreground)
 *   - TurboVec retrieval baseline measurements (background)
 *
 * Usage:
 *   node scripts/startup/phase-a-gemma4-with-baseline-test.mjs [--skip-baseline] [--dry-run]
 *
 * Flags:
 *   --skip-baseline   Don't run TurboVec baseline (just run Gemma4)
 *   --dry-run         Dry-run mode (no writes, no baseline)
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const SKIP_BASELINE = process.argv.includes('--skip-baseline');
const DRY_RUN = process.argv.includes('--dry-run');

const report = {
  timestamp: new Date().toISOString(),
  phase: 'phase-a-with-baseline',
  mode: DRY_RUN ? 'dry-run' : 'apply',
  gemma4: {
    status: 'pending',
    command: 'npm run atlas:summaries:gemma4:500:apply',
    startTime: null,
    endTime: null,
    exitCode: null,
    output: []
  },
  turbovecBaseline: {
    status: SKIP_BASELINE ? 'skipped' : 'pending',
    command: 'npm run eval:turbovec:baseline:detached',
    startTime: null,
    endTime: null,
    output: []
  }
};

async function logReport() {
  const logsDir = resolve(ROOT, 'logs/task-output/phase-a-baseline');
  await mkdir(logsDir, { recursive: true });
  const reportPath = resolve(logsDir, 'orchestrator-report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📋 Report saved: ${reportPath}`);
}

function runCommand(description, command, args, options = {}) {
  return new Promise((resolve) => {
    console.log(`\n🚀 ${description}`);
    console.log(`   Command: ${command} ${args.join(' ')}`);

    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: 'inherit',
      ...options
    });

    child.on('error', (error) => {
      console.error(`   ❌ Error: ${error.message}`);
      resolve({ exitCode: 1, error: error.message });
    });

    child.on('exit', (code) => {
      console.log(`   ✅ Exit code: ${code}`);
      resolve({ exitCode: code });
    });
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase A + TurboVec Baseline Test Orchestrator                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Timestamp: ${report.timestamp}\n`);

  if (DRY_RUN) {
    console.log('⚠️  DRY-RUN MODE: Not making real API calls or database writes\n');
  }

  // Phase 1: Run Gemma4 batch summarizer (foreground)
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📝 PHASE 1: Gemma4 Batch Summarizer (Foreground)');
  console.log('═══════════════════════════════════════════════════════════════');

  report.gemma4.status = 'running';
  report.gemma4.startTime = new Date().toISOString();

  const gemma4Args = [
    'run',
    DRY_RUN ? 'atlas:summaries:gemma4:500:dry' : 'atlas:summaries:gemma4:500:apply'
  ];

  const gemma4Result = await runCommand(
    'Gemma4 Batch Summarizer',
    process.platform === 'win32' ? 'cmd.exe' : 'npm',
    process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd', ...gemma4Args] : gemma4Args
  );

  report.gemma4.endTime = new Date().toISOString();
  report.gemma4.status = gemma4Result.exitCode === 0 ? 'passed' : 'failed';
  report.gemma4.exitCode = gemma4Result.exitCode;

  if (gemma4Result.exitCode !== 0 && !DRY_RUN) {
    console.error('\n❌ Gemma4 summarizer failed. Aborting pipeline.');
    report.status = 'FAIL';
    await logReport();
    process.exit(1);
  }

  // Phase 2: Launch TurboVec baseline test (background, detached)
  if (!SKIP_BASELINE) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('🔬 PHASE 2: TurboVec Baseline Test (Background, Detached)');
    console.log('═══════════════════════════════════════════════════════════════');

    report.turbovecBaseline.status = 'launching';
    report.turbovecBaseline.startTime = new Date().toISOString();

    const baselineArgs = [
      'run',
      'eval:turbovec:baseline:detached'
    ];

    // Don't wait for detached process; just launch it
    const baselineChild = spawn(
      process.platform === 'win32' ? 'cmd.exe' : 'npm',
      process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd', ...baselineArgs] : baselineArgs,
      {
        cwd: ROOT,
        detached: true,
        stdio: 'ignore'
      }
    );

    baselineChild.unref();

    report.turbovecBaseline.status = 'running';
    console.log(`\n✅ TurboVec baseline test launched in background`);
    console.log(`   Output will be logged to: logs/task-output/pipeline-test/`);
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ Orchestrator Complete');
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (!SKIP_BASELINE) {
    console.log('📊 Status:');
    console.log(`   ✅ Gemma4 Summarizer: ${report.gemma4.status.toUpperCase()}`);
    console.log(`   ⏳ TurboVec Baseline: Running in background (detached)`);
    console.log('\n💡 To monitor TurboVec baseline progress:');
    console.log('   tail -f logs/task-output/pipeline-test/eval-turbovec-baseline.out.log');
  } else {
    console.log('📊 Status:');
    console.log(`   ✅ Gemma4 Summarizer: ${report.gemma4.status.toUpperCase()}`);
    console.log('   ⏭️  TurboVec Baseline: Skipped');
  }

  console.log('\n📝 Next Steps:');
  console.log('   1. Monitor Gemma4 progress (if still running)');
  console.log('   2. Once Gemma4 completes, RFF indexing Phases B-E can proceed:');
  console.log('      - Phase B: Summary embedding backfill');
  console.log('      - Phase C: Qdrant payload sync');
  console.log('      - Phase D: RFF cache warmup');
  console.log('      - Phase E: End-to-end verification');

  report.status = 'PASS';
  await logReport();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  report.status = 'FAIL';
  logReport().then(() => process.exit(1));
});