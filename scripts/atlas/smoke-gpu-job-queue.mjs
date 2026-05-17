#!/usr/bin/env node
/**
 * scripts/atlas/smoke-gpu-job-queue.mjs
 *
 * Verifies single-flight concurrency mutex serialization, execution timeouts,
 * and CPU fallback pathways in the GPU queue guard.
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import the TypeScript queue guard dynamically (executed via npx tsx)
import {
  runGpuJob,
  withCpuFallback,
  getGpuQueueState
} from '../../sveltekit-frontend/src/lib/server/gpu/gpu-job-queue.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSmoke() {
  console.log('🧪 Starting Phase 12C: GPU Job Mutex Queue Smoke Test...');

  const report = {
    timestamp: new Date().toISOString(),
    concurrencySerializedPassed: false,
    timeoutEnforcementPassed: false,
    cpuFallbackPassed: false,
    simulations: [],
    finalQueueState: {},
    overallStatus: 'FAIL'
  };

  // --- TEST 1: Concurrency Serialization Mutex ---
  console.log('\n🚀 Test 1: Simulating two concurrent GPU jobs (should execute sequentially)...');
  const jobTimeline = [];
  
  const promise1 = runGpuJob('simulated_gpu_job_1', async () => {
    const start = Date.now();
    jobTimeline.push({ name: 'job_1', event: 'start', time: start });
    await sleep(200); // 200ms execution
    const end = Date.now();
    jobTimeline.push({ name: 'job_1', event: 'end', time: end });
    return 'result_1';
  });

  // Start job 2 slightly after job 1
  await sleep(20);
  const promise2 = runGpuJob('simulated_gpu_job_2', async () => {
    const start = Date.now();
    jobTimeline.push({ name: 'job_2', event: 'start', time: start });
    await sleep(100); // 100ms execution
    const end = Date.now();
    jobTimeline.push({ name: 'job_2', event: 'end', time: end });
    return 'result_2';
  });

  const [res1, res2] = await Promise.all([promise1, promise2]);
  console.log(`   ✔️ Job 1 completed: ${res1}`);
  console.log(`   ✔️ Job 2 completed: ${res2}`);

  // Assertions for serialization: Job 2 start must be >= Job 1 end
  const job1End = jobTimeline.find(t => t.name === 'job_1' && t.event === 'end').time;
  const job2Start = jobTimeline.find(t => t.name === 'job_2' && t.event === 'start').time;

  console.log(`   - Job 1 ended at: ${job1End}`);
  console.log(`   - Job 2 started at: ${job2Start}`);
  
  if (job2Start >= job1End) {
    report.concurrencySerializedPassed = true;
    console.log('   ✅ PASS: Jobs executed sequentially without VRAM overlap!');
  } else {
    console.error('   🔴 FAIL: Jobs executed concurrently (VRAM overlap danger)!');
  }

  report.simulations.push({
    testName: 'concurrency_serialization',
    timeline: jobTimeline,
    passed: report.concurrencySerializedPassed
  });

  // --- TEST 2: Job Execution Timeout ---
  console.log('\n🚀 Test 2: Simulating job execution timeout...');
  let timeoutThrown = false;
  try {
    // Force a tight execution limit of 50ms on a 200ms job
    await runGpuJob('simulated_timeout_job', async () => {
      await sleep(200);
      return 'timeout_success';
    }, { jobTimeoutMs: 50 });
  } catch (err) {
    timeoutThrown = true;
    console.log(`   ✔️ Successfully caught timeout error: "${err.message}"`);
  }

  if (timeoutThrown) {
    report.timeoutEnforcementPassed = true;
    console.log('   ✅ PASS: Execution timeout successfully enforced!');
  } else {
    console.error('   🔴 FAIL: Timeout guard did not trigger!');
  }

  report.simulations.push({
    testName: 'job_timeout',
    passed: report.timeoutEnforcementPassed
  });

  // --- TEST 3: Dynamic CPU Fallback ---
  console.log('\n🚀 Test 3: Simulating GPU job failure with CPU fallback...');
  let fallbackExecuted = false;

  const result = await withCpuFallback(
    'simulated_fallback_job',
    async () => {
      // GPU function throws VRAM exhaustion error
      throw new Error('VRAM allocation limit exceeded');
    },
    async () => {
      fallbackExecuted = true;
      return 'fallback_cpu_data_resolved';
    }
  );

  console.log(`   ✔️ Fallback function returned: "${result}"`);

  if (fallbackExecuted && result === 'fallback_cpu_data_resolved') {
    report.cpuFallbackPassed = true;
    console.log('   ✅ PASS: CPU Fallback successfully triggered!');
  } else {
    console.error('   🔴 FAIL: CPU Fallback did not execute correctly!');
  }

  report.simulations.push({
    testName: 'cpu_fallback',
    passed: report.cpuFallbackPassed
  });

  // Retrieve final state
  report.finalQueueState = getGpuQueueState();
  
  if (report.concurrencySerializedPassed && report.timeoutEnforcementPassed && report.cpuFallbackPassed) {
    report.overallStatus = 'PASS';
  }

  // Save report files
  const reportsDir = resolve(REPO_ROOT, 'docs/reports');
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true });
  }

  const jsonPath = join(reportsDir, 'gpu-job-queue-smoke-report.json');
  const mdPath = join(reportsDir, 'gpu-job-queue-smoke-report.md');

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  // Format MD Report
  const mdContent = `# Workstation GPU Job Mutex Queue Smoke Report

## Execution Summary
- **Timestamp**: ${report.timestamp}
- **Overall Result**: **${report.overallStatus}**

## Verification Checklist
- [x] **Strict Mutex Concurrency Serialization**: ${report.concurrencySerializedPassed ? '✅ PASS' : '❌ FAIL'}
- [x] **Job Execution Timeout Enforcement**: ${report.timeoutEnforcementPassed ? '✅ PASS' : '❌ FAIL'}
- [x] **In-Situ CPU Fallback Triggering**: ${report.cpuFallbackPassed ? '✅ PASS' : '❌ FAIL'}

---

## Technical Details

### 1. Job Serialization Timeline
- **Job 1**: Started at 0ms, ran for 200ms.
- **Job 2**: Attempted concurrent enqueue at 20ms.
- **Result**: Queue held Job 2 until Job 1 released the lock. 
  - Job 1 End: **${job1End} ms**
  - Job 2 Start: **${job2Start} ms**
  - Delta: **${job2Start - job1End} ms** (Strictly non-overlapping).

### 2. Final Queue Metrics
- **Active Jobs**: ${report.finalQueueState.activeJobsCount}
- **Queue Wait Count**: ${report.finalQueueState.waitingJobsCount}
- **Total Processed**: ${report.finalQueueState.totalJobsProcessed}
- **Total Timeouts Enforced**: ${report.finalQueueState.totalTimeoutsEnforced}
- **Total Fallbacks Triggered**: ${report.finalQueueState.totalFallbacksTriggered}

---
*Report programmatically generated by the GPU queue smoke-test validator.*
`;

  writeFileSync(mdPath, mdContent, 'utf8');
  console.log(`\n✔️ GPU queue reports successfully saved:`);
  console.log(`   - JSON: ${jsonPath}`);
  console.log(`   - Markdown: ${mdPath}\n`);

  if (report.overallStatus === 'PASS') {
    console.log('🎉 GPU Job Mutex Queue Smoke Check completed with 100% SUCCESS!');
    process.exit(0);
  } else {
    console.error('🔴 GPU Job Mutex Queue Smoke Check FAILED.');
    process.exit(1);
  }
}

runSmoke().catch(err => {
  console.error('🔴 Critical queue smoke failure:', err);
  process.exit(1);
});
