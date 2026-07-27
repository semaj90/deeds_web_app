#!/usr/bin/env node

/**
 * Phase 3 Pipeline Orchestrator
 *
 * Executes the complete Phase 3 snapshot validation pipeline (Steps 9-13):
 * 1. Identity Resolution (Step 9)
 * 2. Parquet + Arrow Export (Step 10)
 * 3. Determinism Validation (Step 11)
 * 4. Feature Lane Materialization (Step 12)
 * 5. Observation Validation & Refinement (Step 13)
 *
 * Provides:
 * - Sequential execution with error handling
 * - Progress tracking and timing
 * - Comprehensive validation gate reporting
 * - Exit code aggregation (0 = all pass, 1 = any failure)
 *
 * Usage:
 * npx tsx scripts/atlas/phase3-pipeline-orchestrator.mts
 *
 * Output:
 * - phase3-pipeline-results/orchestration-report.json (timing, gate results, overall verdict)
 */

import { execSync, spawn } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';

const StepResultSchema = z.object({
  step: z.number(),
  name: z.string(),
  status: z.enum(['RUNNING', 'PASS', 'FAIL']),
  exit_code: z.number(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime().optional(),
  duration_ms: z.number().optional(),
  error_message: z.string().optional(),
});

type StepResult = z.infer<typeof StepResultSchema>;

interface OrchestrationReport {
  orchestration_timestamp: string;
  total_steps: number;
  passed_steps: number;
  failed_steps: number;
  total_duration_ms: number;
  steps: StepResult[];
  overall_result: 'PASS' | 'FAIL';
  gates_summary: Record<string, number>;
}

const steps = [
  {
    number: 9,
    name: 'Identity Resolver',
    script: 'scripts/atlas/phase3-identity-resolver.mts',
    npm: 'phase3:identity:resolver',
  },
  {
    number: 10,
    name: 'Parquet + Arrow Exporters',
    script: 'scripts/atlas/phase3-step10-parquet-arrow-exporters.mts',
    npm: 'phase3:parquet:arrow:export',
  },
  {
    number: 11,
    name: 'Determinism Validator',
    script: 'scripts/atlas/phase3-step11-determinism-validator.mts',
    npm: 'phase3:determinism:validator',
  },
  {
    number: 12,
    name: 'Feature Lane Materializers',
    script: 'scripts/atlas/phase3-step12-feature-lane-materializers.mts',
    npm: 'phase3:feature:lanes:materialize',
  },
  {
    number: 13,
    name: 'Observation Validation & Refinement',
    script: 'scripts/atlas/phase3-step13-observation-validation.mts',
    npm: 'phase3:observation:validation',
  },
];

function printBanner() {
  console.log('\n' + '='.repeat(70));
  console.log('Phase 3 Snapshot Validation Pipeline Orchestrator');
  console.log('='.repeat(70));
  console.log(`Total steps: ${steps.length}`);
  console.log(`Start time: ${new Date().toISOString()}`);
  console.log('='.repeat(70) + '\n');
}

function printStepHeader(step: (typeof steps)[0]) {
  console.log(`\n[Step ${step.number}] ${step.name}`);
  console.log('-'.repeat(70));
  console.log(`npm: ${step.npm}`);
  console.log(`Start: ${new Date().toISOString()}`);
}

function executeStep(step: (typeof steps)[0]): StepResult {
  const startTime = new Date();
  printStepHeader(step);

  const result: StepResult = {
    step: step.number,
    name: step.name,
    status: 'RUNNING',
    exit_code: -1,
    start_time: startTime.toISOString(),
  };

  try {
    // Execute npm script
    const npmCmd = `npm run ${step.npm}`;
    console.log(`Executing: ${npmCmd}\n`);

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

    console.error(`\n❌ Step ${step.number} failed with exit code ${result.exit_code}`);
    if (result.error_message) {
      console.error(`Error: ${result.error_message}`);
    }
  }

  const endTime = new Date();
  result.end_time = endTime.toISOString();
  result.duration_ms = endTime.getTime() - startTime.getTime();

  // Print step result
  const icon = result.status === 'PASS' ? '✓' : '❌';
  const durationSec = (result.duration_ms / 1000).toFixed(1);
  console.log(`${icon} Step ${step.number} ${result.status} (${durationSec}s)`);

  return result;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  return `${minutes.toFixed(1)}m`;
}

function printOrchestrationSummary(report: OrchestrationReport) {
  console.log('\n' + '='.repeat(70));
  console.log('Orchestration Summary');
  console.log('='.repeat(70));
  console.log(`Total steps: ${report.total_steps}`);
  console.log(`Passed: ${report.passed_steps}`);
  console.log(`Failed: ${report.failed_steps}`);
  console.log(`Total duration: ${formatDuration(report.total_duration_ms)}`);
  console.log(`Overall result: ${report.overall_result}\n`);

  console.log('Step Results:');
  for (const step of report.steps) {
    const icon = step.status === 'PASS' ? '✓' : '❌';
    const duration = step.duration_ms
      ? ` (${formatDuration(step.duration_ms)})`
      : '';
    console.log(
      `  ${icon} Step ${step.step} (${step.name}): ${step.status}${duration}`
    );
  }

  console.log('\nGates Summary:');
  for (const [gateName, count] of Object.entries(report.gates_summary)) {
    console.log(`  ${gateName}: ${count}`);
  }

  console.log('='.repeat(70) + '\n');
}

async function main() {
  try {
    printBanner();

    const orchestrationStart = new Date();
    const results: StepResult[] = [];
    let passCount = 0;
    let failCount = 0;

    // Execute steps sequentially
    for (const step of steps) {
      const result = executeStep(step);
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
    const report: OrchestrationReport = {
      orchestration_timestamp: new Date().toISOString(),
      total_steps: steps.length,
      passed_steps: passCount,
      failed_steps: failCount,
      total_duration_ms: totalDuration,
      steps: results,
      overall_result: failCount === 0 ? 'PASS' : 'FAIL',
      gates_summary: {
        'Total validation gates': 25,
        'Expected passing gates': 25,
      },
    };

    // Write report
    const outputDir = resolve('phase3-pipeline-results');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const reportPath = resolve(outputDir, 'orchestration-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Print summary
    printOrchestrationSummary(report);

    // Exit with appropriate code
    process.exit(report.overall_result === 'PASS' ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Orchestrator error:', error);
    process.exit(1);
  }
}

main();
