#!/usr/bin/env node

/**
 * Master Orchestrator: Phases 3-6 Complete Pipeline
 *
 * Chains all phases of the Atlas snapshot validation and synthesis pipeline:
 * - Phase 3: Deterministic Snapshot Validation (Steps 9-13)
 * - Phase 4: GPU Embedding Indexing
 * - Phase 5: GPU Reranking & Authority Blending
 * - Phase 6: Synthesis & Evidence Grounding
 *
 * Provides:
 * - End-to-end pipeline orchestration
 * - Cross-phase dependency management
 * - Comprehensive timing and gate reporting
 * - Single exit code for entire pipeline
 *
 * Usage:
 * npx tsx scripts/atlas/phases-3-6-master-orchestrator.mts
 *
 * Output:
 * - master-pipeline-results/orchestration-report.json
 * - Console output with phase-by-phase progress
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';

const PhaseResultSchema = z.object({
  phase: z.number(),
  name: z.string(),
  status: z.enum(['RUNNING', 'PASS', 'FAIL']),
  exit_code: z.number(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime().optional(),
  duration_ms: z.number().optional(),
  error_message: z.string().optional(),
});

type PhaseResult = z.infer<typeof PhaseResultSchema>;

interface MasterOrchestrationReport {
  orchestration_timestamp: string;
  total_phases: number;
  passed_phases: number;
  failed_phases: number;
  total_duration_ms: number;
  phases: PhaseResult[];
  overall_result: 'PASS' | 'FAIL';
  summary: {
    phase_3_gates: number;
    phase_4_gates: number;
    phase_5_gates: number;
    phase_6_gates: number;
    total_gates: number;
  };
}

const phases = [
  {
    number: 3,
    name: 'Snapshot Validation',
    npm: 'phase3:pipeline:orchestrator',
    description: 'Identity resolution, determinism validation, observation quality',
  },
  {
    number: 4,
    name: 'GPU Embedding Indexing',
    npm: 'phase4:gpu:embedding:indexing',
    description: 'Convert observations to 768-dim embeddings, index in Qdrant',
  },
  {
    number: 5,
    name: 'GPU Reranking',
    npm: 'phase5:gpu:reranking',
    description: 'Cosine similarity reranking, authority blend (0.6·cos + 0.2·pr + 0.2·auth)',
  },
  {
    number: 6,
    name: 'Synthesis & Grounding',
    npm: 'phase6:synthesis',
    description: 'Gemma4 evidence-grounded summaries, citation validation',
  },
];

function printBanner() {
  console.log('\n' + '='.repeat(80));
  console.log('MASTER ORCHESTRATOR: Atlas Phases 3-6 Complete Pipeline');
  console.log('='.repeat(80));
  console.log(`Total phases: ${phases.length}`);
  console.log(`Start time: ${new Date().toISOString()}`);
  console.log('='.repeat(80));

  console.log('\nPhase Pipeline:');
  phases.forEach((p) => {
    console.log(`  ${p.number}. ${p.name}: ${p.description}`);
  });
  console.log('');
}

function printPhaseHeader(phase: (typeof phases)[0]) {
  console.log(`\n${'-'.repeat(80)}`);
  console.log(`[PHASE ${phase.number}] ${phase.name}`);
  console.log(`${'-'.repeat(80)}`);
  console.log(`npm: ${phase.npm}`);
  console.log(`Start: ${new Date().toISOString()}`);
}

function executePhase(phase: (typeof phases)[0]): PhaseResult {
  const startTime = new Date();
  printPhaseHeader(phase);

  const result: PhaseResult = {
    phase: phase.number,
    name: phase.name,
    status: 'RUNNING',
    exit_code: -1,
    start_time: startTime.toISOString(),
  };

  try {
    const npmCmd = `npm run ${phase.npm}`;
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

    console.error(`\n❌ Phase ${phase.number} failed with exit code ${result.exit_code}`);
  }

  const endTime = new Date();
  result.end_time = endTime.toISOString();
  result.duration_ms = endTime.getTime() - startTime.getTime();

  const icon = result.status === 'PASS' ? '✅' : '❌';
  const durationSec = (result.duration_ms / 1000).toFixed(1);
  console.log(`\n${icon} Phase ${phase.number} ${result.status} (${durationSec}s)`);

  return result;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  return `${minutes.toFixed(1)}m`;
}

function printMasterSummary(report: MasterOrchestrationReport) {
  console.log('\n' + '='.repeat(80));
  console.log('MASTER ORCHESTRATION SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total phases: ${report.total_phases}`);
  console.log(`Passed: ${report.passed_phases}`);
  console.log(`Failed: ${report.failed_phases}`);
  console.log(`Total duration: ${formatDuration(report.total_duration_ms)}`);
  console.log(`Overall result: ${report.overall_result}\n`);

  console.log('Phase Results:');
  for (const phase of report.phases) {
    const icon = phase.status === 'PASS' ? '✅' : '❌';
    const duration = phase.duration_ms
      ? ` (${formatDuration(phase.duration_ms)})`
      : '';
    console.log(
      `  ${icon} Phase ${phase.phase} (${phase.name}): ${phase.status}${duration}`
    );
  }

  console.log('\nValidation Gates Summary:');
  console.log(`  Phase 3 (Snapshot Validation): 25 gates`);
  console.log(`  Phase 4 (GPU Embedding): 7 gates`);
  console.log(`  Phase 5 (GPU Reranking): 5 gates`);
  console.log(`  Phase 6 (Synthesis): 5 gates`);
  console.log(`  Total: 42 validation gates`);

  console.log('\n' + '='.repeat(80) + '\n');
}

async function main() {
  try {
    printBanner();

    const orchestrationStart = new Date();
    const results: PhaseResult[] = [];
    let passCount = 0;
    let failCount = 0;

    // Execute phases sequentially
    for (const phase of phases) {
      const result = executePhase(phase);
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
    const report: MasterOrchestrationReport = {
      orchestration_timestamp: new Date().toISOString(),
      total_phases: phases.length,
      passed_phases: passCount,
      failed_phases: failCount,
      total_duration_ms: totalDuration,
      phases: results,
      overall_result: failCount === 0 ? 'PASS' : 'FAIL',
      summary: {
        phase_3_gates: 25,
        phase_4_gates: 7,
        phase_5_gates: 5,
        phase_6_gates: 5,
        total_gates: 42,
      },
    };

    // Write report
    const outputDir = resolve('master-pipeline-results');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const reportPath = resolve(outputDir, 'orchestration-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Print summary
    printMasterSummary(report);

    // Exit with appropriate code
    process.exit(report.overall_result === 'PASS' ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Master orchestrator error:', error);
    process.exit(1);
  }
}

main();
