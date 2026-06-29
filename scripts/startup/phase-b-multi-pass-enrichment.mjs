#!/usr/bin/env node
/**
 * Phase B Multi-Pass Summary Enrichment Orchestrator
 *
 * Runs 4 sequential enrichment passes after Phase A (Gemma4 summaries):
 * - Pass 2: Entity Extraction (LangExtract + keyword extraction)
 * - Pass 3: Domain Classification (Gemma4 ontology tagging)
 * - Pass 4: Feature Relationship Graph (Neo4j + Postgres relationship building)
 * - Pass 5: BM25 Full-Text Indexing (Go service + Redis cache warmup)
 *
 * Usage:
 *   node scripts/startup/phase-b-multi-pass-enrichment.mjs [--skip-pass N] [--dry-run] [--verbose]
 *
 * Flags:
 *   --skip-pass N    Skip a specific pass (2, 3, 4, or 5)
 *   --dry-run        Dry-run mode (no writes, no service calls)
 *   --verbose        Detailed logging
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const SKIP_PASSES = new Set();
process.argv.forEach((arg) => {
  if (arg.startsWith('--skip-pass=')) {
    SKIP_PASSES.add(parseInt(arg.split('=')[1]));
  }
});

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

const report = {
  timestamp: new Date().toISOString(),
  phase: 'phase-b-multi-pass-enrichment',
  mode: DRY_RUN ? 'dry-run' : 'apply',
  passes: {
    2: { name: 'Entity Extraction', status: 'pending', startTime: null, endTime: null, exitCode: null },
    3: { name: 'Domain Classification', status: 'pending', startTime: null, endTime: null, exitCode: null },
    4: { name: 'Feature Relationships', status: 'pending', startTime: null, endTime: null, exitCode: null },
    5: { name: 'BM25 Full-Text Indexing', status: 'pending', startTime: null, endTime: null, exitCode: null },
  },
  summary: {
    passed: 0,
    failed: 0,
    skipped: 0,
    totalDuration: 0,
  }
};

async function logReport() {
  const logsDir = resolve(ROOT, 'logs/task-output/phase-b-enrichment');
  await mkdir(logsDir, { recursive: true });
  const reportPath = resolve(logsDir, 'orchestrator-report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📋 Report saved: ${reportPath}`);
}

function runCommand(passNumber, description, command, args, options = {}) {
  return new Promise((resolve) => {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`📝 PASS ${passNumber}: ${description}`);
    console.log(`${'═'.repeat(70)}`);
    console.log(`   Command: ${command} ${args.join(' ')}`);

    report.passes[passNumber].status = 'running';
    report.passes[passNumber].startTime = new Date().toISOString();

    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: VERBOSE ? 'inherit' : 'pipe',
      ...options
    });

    let stdout = '';
    let stderr = '';

    if (!VERBOSE) {
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    child.on('error', (error) => {
      console.error(`   ❌ Error: ${error.message}`);
      report.passes[passNumber].status = 'failed';
      report.passes[passNumber].exitCode = 1;
      resolve({ exitCode: 1, error: error.message });
    });

    child.on('exit', (code) => {
      report.passes[passNumber].endTime = new Date().toISOString();

      if (code === 0) {
        console.log(`   ✅ PASS ${passNumber} completed successfully`);
        report.passes[passNumber].status = 'passed';
        report.summary.passed++;
      } else {
        console.error(`   ❌ PASS ${passNumber} failed with exit code: ${code}`);
        if (stderr) console.error(`   Stderr: ${stderr.substring(0, 500)}`);
        report.passes[passNumber].status = 'failed';
        report.summary.failed++;
      }
      report.passes[passNumber].exitCode = code;
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase B: Multi-Pass Summary Enrichment Orchestrator           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Timestamp: ${report.timestamp}\n`);

  if (DRY_RUN) {
    console.log('⚠️  DRY-RUN MODE: No database writes, service calls in read-only mode\n');
  }

  const startTime = Date.now();

  // Pass 2: Entity Extraction (LangExtract + Keywords)
  if (!SKIP_PASSES.has(2)) {
    const result = await runCommand(
      2,
      'Entity Extraction (LangExtract + Keywords)',
      process.platform === 'win32' ? 'cmd.exe' : 'npm',
      process.platform === 'win32'
        ? ['/d', '/s', '/c', 'npm.cmd', 'run', DRY_RUN ? 'atlas:phase-b2:langextract:dry' : 'atlas:phase-b2:langextract:apply']
        : ['run', DRY_RUN ? 'atlas:phase-b2:langextract:dry' : 'atlas:phase-b2:langextract:apply'],
      { cwd: resolve(ROOT, 'sveltekit-frontend') }
    );

    if (result.exitCode !== 0 && !DRY_RUN) {
      console.error('\n❌ Pass 2 failed. Aborting pipeline.');
      report.status = 'FAIL';
      await logReport();
      process.exit(1);
    }
  } else {
    report.passes[2].status = 'skipped';
    report.summary.skipped++;
    console.log('\n⏭️  PASS 2 skipped (--skip-pass=2)');
  }

  // Pass 3: Domain Classification (Gemma4 + Ontology)
  if (!SKIP_PASSES.has(3)) {
    const result = await runCommand(
      3,
      'Domain Classification (Gemma4 Ontology Tagging)',
      process.platform === 'win32' ? 'cmd.exe' : 'npm',
      process.platform === 'win32'
        ? ['/d', '/s', '/c', 'npm.cmd', 'run', DRY_RUN ? 'atlas:phase-b3:classify:dry' : 'atlas:phase-b3:classify:apply']
        : ['run', DRY_RUN ? 'atlas:phase-b3:classify:dry' : 'atlas:phase-b3:classify:apply'],
      { cwd: resolve(ROOT, 'sveltekit-frontend') }
    );

    if (result.exitCode !== 0 && !DRY_RUN) {
      console.error('\n❌ Pass 3 failed. Aborting pipeline.');
      report.status = 'FAIL';
      await logReport();
      process.exit(1);
    }
  } else {
    report.passes[3].status = 'skipped';
    report.summary.skipped++;
    console.log('\n⏭️  PASS 3 skipped (--skip-pass=3)');
  }

  // Pass 4: Feature Relationship Graph (Neo4j + Postgres)
  if (!SKIP_PASSES.has(4)) {
    const result = await runCommand(
      4,
      'Feature Relationship Graph (Neo4j + Postgres)',
      process.platform === 'win32' ? 'cmd.exe' : 'npm',
      process.platform === 'win32'
        ? ['/d', '/s', '/c', 'npm.cmd', 'run', DRY_RUN ? 'atlas:phase-b4:relationships:dry' : 'atlas:phase-b4:relationships:apply']
        : ['run', DRY_RUN ? 'atlas:phase-b4:relationships:dry' : 'atlas:phase-b4:relationships:apply'],
      { cwd: resolve(ROOT, 'sveltekit-frontend') }
    );

    if (result.exitCode !== 0 && !DRY_RUN) {
      console.error('\n❌ Pass 4 failed. Aborting pipeline.');
      report.status = 'FAIL';
      await logReport();
      process.exit(1);
    }
  } else {
    report.passes[4].status = 'skipped';
    report.summary.skipped++;
    console.log('\n⏭️  PASS 4 skipped (--skip-pass=4)');
  }

  // Pass 5: BM25 Full-Text Indexing (Go Service + Redis Warmup)
  if (!SKIP_PASSES.has(5)) {
    const result = await runCommand(
      5,
      'BM25 Full-Text Indexing (Go Service + Redis Warmup)',
      process.platform === 'win32' ? 'cmd.exe' : 'npm',
      process.platform === 'win32'
        ? ['/d', '/s', '/c', 'npm.cmd', 'run', DRY_RUN ? 'atlas:phase-b5:bm25:dry' : 'atlas:phase-b5:bm25:apply']
        : ['run', DRY_RUN ? 'atlas:phase-b5:bm25:dry' : 'atlas:phase-b5:bm25:apply'],
      { cwd: resolve(ROOT, 'sveltekit-frontend') }
    );

    if (result.exitCode !== 0 && !DRY_RUN) {
      console.error('\n❌ Pass 5 failed. Aborting pipeline.');
      report.status = 'FAIL';
      await logReport();
      process.exit(1);
    }
  } else {
    report.passes[5].status = 'skipped';
    report.summary.skipped++;
    console.log('\n⏭️  PASS 5 skipped (--skip-pass=5)');
  }

  // Final summary
  const duration = (Date.now() - startTime) / 1000 / 60;
  report.summary.totalDuration = duration;

  console.log('\n' + '═'.repeat(70));
  console.log('✅ Phase B Multi-Pass Enrichment Complete');
  console.log('═'.repeat(70));
  console.log(`\n📊 Summary:`);
  console.log(`   Passed: ${report.summary.passed}`);
  console.log(`   Failed: ${report.summary.failed}`);
  console.log(`   Skipped: ${report.summary.skipped}`);
  console.log(`   Total Duration: ${duration.toFixed(1)} minutes\n`);
  console.log('📝 Pass Results:');
  for (const [passNum, passData] of Object.entries(report.passes)) {
    const emoji = passData.status === 'passed' ? '✅' : passData.status === 'failed' ? '❌' : '⏭️ ';
    console.log(`   ${emoji} Pass ${passNum}: ${passData.name} - ${passData.status.toUpperCase()}`);
  }

  console.log('\n📝 Next Steps:');
  console.log('   1. Verify Postgres: SELECT * FROM v_phase_b_progress;');
  console.log('   2. Check Neo4j: MATCH (fr:FeatureRelationship) RETURN COUNT(fr);');
  console.log('   3. Test BM25: curl http://localhost:8096/search?q=error');
  console.log('   4. Proceed to Phase C: RFF Lane Fusion\n');

  report.status = report.summary.failed === 0 ? 'PASS' : 'FAIL';
  await logReport();

  process.exit(report.summary.failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  report.status = 'FAIL';
  logReport().then(() => process.exit(1));
});
