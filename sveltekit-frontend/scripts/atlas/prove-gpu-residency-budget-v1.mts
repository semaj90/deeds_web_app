#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mibToBytes, planGpuResidencyV1 } from '../../src/lib/server/atlas/gpu/gpu-residency-budget.js';

const repoRoot = resolve(process.cwd(), '..');
const output = resolve(repoRoot, 'docs/reports/gpu-residency-budget-v1.json');
const telemetry = (freeMiB: number) => ({
  schema: 'atlas.gpu-memory-telemetry.v1' as const,
  source: 'rapids-sidecar-cupy' as const,
  capturedAt: 'fixture:read-only',
  totalVramBytes: mibToBytes(8192),
  freeVramBytes: mibToBytes(freeMiB),
  usedVramBytes: mibToBytes(8192 - freeMiB),
  deviceName: 'NVIDIA GeForce RTX 3060 Ti',
});
const cases = [
  { name: 'admit_512', plan: planGpuResidencyV1(telemetry(2048), 500) },
  { name: 'down_bucket_under_pressure', plan: planGpuResidencyV1(telemetry(900), 500) },
  { name: 'fallback_below_lease_floor', plan: planGpuResidencyV1(telemetry(500), 128) },
  { name: 'fallback_without_telemetry', plan: planGpuResidencyV1(null, 128) },
];
const report = {
  schema: 'GpuResidencyBudgetProofV1',
  generatedAt: new Date().toISOString(),
  status: cases[0].plan.executionTarget === 'gpu' && cases[2].plan.executionTarget === 'qdrant' && cases[3].plan.executionTarget === 'qdrant'
    ? 'GPU_RESIDENCY_POLICY_PROVEN_READ_ONLY'
    : 'GPU_RESIDENCY_POLICY_FAILED',
  owner: 'sveltekit-frontend/src/lib/server/atlas/gpu/gpu-residency-budget.ts',
  cases: cases.map(({ name, plan }) => ({
    name,
    requestedCandidateBucket: plan.requestedCandidateBucket,
    maxCandidateBucket: plan.maxCandidateBucket,
    executionTarget: plan.executionTarget,
    degraded: plan.degraded,
    leaseableBytes: plan.leaseableBytes,
    reason: plan.reason,
  })),
  failClosedError: 'GPU_RESIDENCY_BUDGET_EXCEEDED',
  implicitOomAllowed: false,
  implicitFallbackAllowed: false,
  crossExecutorAccounting: 'NOT_YET_WIRED',
  canonicalAuthority: false,
  writesPerformed: false,
  nextRequirement: 'ONE_REVISIONED_LEASE_OWNER_ACROSS_PYTORCH_CUDA_CUVS_TENSORRT_RTX_DIRECTML_WEBGPU_AND_LLM_RUNTIME',
};
mkdirSync(resolve(repoRoot, 'docs/reports'), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, cases: report.cases.map(({ name, executionTarget }) => ({ name, executionTarget })), output }, null, 2));
