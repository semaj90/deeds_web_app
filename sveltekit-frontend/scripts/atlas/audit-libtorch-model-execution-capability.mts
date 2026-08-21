#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  getAddonInternal,
  isCudaAvailable,
} from '../../src/lib/server/gpu/libtorch-bridge.js';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

const output = path.resolve(
  process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length) ??
    'docs/reports/libtorch-model-execution-capability.json',
);

const addon = getAddonInternal();
const exportNames = addon ? Object.keys(addon).sort() : [];
const genericModelCandidates = exportNames.filter((name) =>
  /(torchscript|jit|module|model|forward|inference|load)/i.test(name),
);

const reportCore = {
  schema: 'atlas.libtorch-model-execution-capability-audit.v1',
  generatedAt: new Date().toISOString(),
  nativeAddonLoaded: Boolean(addon),
  cudaAdvertised: isCudaAvailable(),
  exportNames,
  genericModelCandidates,
  requiredCapability: 'TORCHSCRIPT_MODEL_LOADER',
  capabilityStatus:
    genericModelCandidates.length === 0
      ? 'CAPABILITY_NOT_PRESENT'
      : 'UNCONTRACTED_CANDIDATE_EXPORTS_PRESENT',
  torch02Eligibility: false,
  reason:
    genericModelCandidates.length === 0
      ? 'No generic TorchScript/JIT model loader or forward module contract is exposed by the current N-API bridge.'
      : 'Potential model-related native exports exist, but none are accepted as a revisioned TORCH-02 model execution contract.',
  allowedExistingRoles: [
    'cosine_similarity',
    'kmeans',
    'pca',
    'pagerank',
    'softmax',
    'topk',
    'specialized_cuda_kernels',
  ],
  canonicalOwnerChanged: false,
  logicalLaneVoteAdded: false,
  writesPerformed: false,
};

const report = {
  ...reportCore,
  receiptSha256: sha256(JSON.stringify(reportCore)),
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));

if (report.capabilityStatus !== 'CAPABILITY_NOT_PRESENT') {
  process.exitCode = 2;
}
