#!/usr/bin/env node

/**
 * Phase 7: Full Pipeline Orchestrator
 *
 * Complete Phase 7 pipeline with assembly, persistence, and event publishing.
 *
 * Chains:
 * - Phase 7 Assembly (phase7:ace:assembly) — assemble ACE packets
 * - Phase 7 Persistence (phase7:postgres:persistence) — persist to Postgres + warm Redis
 * - Phase 7 NATS Events (phase7:nats:events) — publish events to NATS
 *
 * Provides:
 * - End-to-end Phase 7 orchestration
 * - Cross-layer dependency management
 * - Comprehensive reporting
 * - Single exit code
 *
 * Usage:
 * npx tsx scripts/atlas/phase7-full-pipeline.mts
 *
 * Output:
 * - phase7-full-results/orchestration-report.json
 * - Console output with stage-by-stage progress
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';

const StageResultSchema = z.object({
  stage: z.number(),
  name: z.string(),
  status: z.enum(['RUNNING', 'PASS', 'FAIL']),
  exit_code: z.number(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime().optional(),
  duration_ms: z.number().optional(),
  error_message: z.string().optional(),
});

type StageResult = z.infer<typeof StageResultSchema>;

interface FullPipelineReport {
  orchestration_timestamp: string;
  total_stages: number;
  passed_stages: number;
  failed_stages: number;
  total_duration_ms: number;
  stages: StageResult[];
  overall_result: 'PASS' | 'FAIL';
  summary: {
    assembly_gates: number;
    persistence_gates: number;
    events_gates: number;
    total_gates: number;
  };
}

const stages = [
  {
    number: 1,
    name: 'ACE Packet Assembly',
    npm: 'phase7:ace:assembly',
    description: 'Assemble unified ACE context packets from Phase 3-6 outputs',
    gates: 8,
  },
  {
    number: 2,
    name: 'Postgres Persistence',
    npm: 'phase7:postgres:persistence',
    description: 'Persist ACE packets to Postgres and warm Redis cache',
    gates: 8,
  },
  {
    number: 3,
    name: 'NATS Event Publishing',
    npm: 'phase7:nats:events',
    description: 'Publish ACE packets as events to NATS for downstream consumers',
    gates: 8,
  },
];

function printBanner() {
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 7: Full Pipeline Orchestrator');
  console.log('='.repeat(80));
  console.log(`Total stages: ${stages.length}`);
  console.log(`Start time: ${new Date().toISOString()}`);
  console.log('='.repeat(80));

  console.log('\nPhase 7 Pipeline:');
  stages.forEach((s) => {
    console.log(`  ${s.number}. ${s.name}: ${s.description}`);
  });
  console.log('');
}

function printStageHeader(stage: (typeof stages)[0]) {
  console.log(`\n${'-'.repeat(80)}`);
  console.log(`[STAGE ${stage.number}] ${stage.name}`);
  console.log(`${'-'.repeat(80)}`);
  console.log(`npm: ${stage.npm}`);
  console.log(`Validation gates: ${stage.gates}`);
  console.log(`Start: ${new Date().toISOString()}`);
}

function executeStage(stage: (typeof stages)[0]): StageResult {
  const startTime = new Date();
  printStageHeader(stage);

  const result: StageResult = {
    stage: stage.number,
    name: stage.name,
    status: 'RUNNING',
    exit_code: -1,
    start_time: startTime.toISOString(),
  };

  try {
    const npmCmd = `npm run ${stage.npm}`;
    console.log(`\nExecuting: ${npmCmd}\n`);

    execSync(npmCmd, {
      stdio: 'inherit',
      cwd: resolve('.'),
    });

    result.status = 'PASS';
    result.exit_code = 0;
  } catch (error: any) {
    result.status = 'FAIL';
    result.exit_code = error.status || 1;
    result.error_message =
      error instanceof Error ? error.message : String(error);

    console.error(`\n❌ Stage ${stage.number} failed with exit code ${result.exit_code}`);
  }

  const endTime = new Date();
  result.end_time = endTime.toISOString();
  result.duration_ms = endTime.getTime() - startTime.getTime();

  const icon = result.status === 'PASS' ? '✅' : '❌';
  const durationSec = (result.duration_ms / 1000).toFixed(1);
  console.log(`\n${icon} Stage ${stage.number} ${result.status} (${durationSec}s)`);

  return result;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  return `${minutes.toFixed(1)}m`;
}

function printPipelineSummary(report: FullPipelineReport) {
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 7 PIPELINE SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total stages: ${report.total_stages}`);
  console.log(`Passed: ${report.passed_stages}`);
  console.log(`Failed: ${report.failed_stages}`);
  console.log(`Total duration: ${formatDuration(report.total_duration_ms)}`);
  console.log(`Overall result: ${report.overall_result}\n`);

  console.log('Stage Results:');
  for (const stage of report.stages) {
    const icon = stage.status === 'PASS' ? '✅' : '❌';
    const duration = stage.duration_ms
      ? ` (${formatDuration(stage.duration_ms)})`
      : '';
    console.log(
      `  ${icon} Stage ${stage.stage} (${stage.name}): ${stage.status}${duration}`
    );
  }

  console.log('\nValidation Gates Summary:');
  console.log(`  Stage 1 (Assembly): 8 gates`);
  console.log(`  Stage 2 (Persistence): 8 gates`);
  console.log(`  Stage 3 (Events): 8 gates`);
  console.log(`  Total: 24 validation gates`);

  console.log('\n' + '='.repeat(80) + '\n');
}

async function main() {
  try {
    printBanner();

    const orchestrationStart = new Date();
    const results: StageResult[] = [];
    let passCount = 0;
    let failCount = 0;

    // Execute stages sequentially
    for (const stage of stages) {
      const result = executeStage(stage);
      results.push(result);

      if (result.status === 'PASS') {
        passCount++;
      } else {
        failCount++;
        // Continue on error to collect all results
      }
    }

    const orchestrationEnd = new Date();
    const totalDuration = orchestrationEnd.getTime() - orchestrationStart.getTime();

    // Create report
    const report: FullPipelineReport = {
      orchestration_timestamp: new Date().toISOString(),
      total_stages: stages.length,
      passed_stages: passCount,
      failed_stages: failCount,
      total_duration_ms: totalDuration,
      stages: results,
      overall_result: failCount === 0 ? 'PASS' : 'FAIL',
      summary: {
        assembly_gates: 8,
        persistence_gates: 8,
        events_gates: 8,
        total_gates: 24,
      },
    };

    // Write report
    const outputDir = resolve('phase7-full-results');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const reportPath = resolve(outputDir, 'orchestration-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Print summary
    printPipelineSummary(report);

    // Exit with appropriate code
    process.exit(report.overall_result === 'PASS' ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Phase 7 full pipeline error:', error);
    process.exit(1);
  }
}

main();
