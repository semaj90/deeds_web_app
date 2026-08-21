#!/usr/bin/env node
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const outPath = path.resolve('.tmp/gpu-bridge-export-ownership.json');
mkdirSync(path.dirname(outPath), { recursive: true });

const candidates = [
  process.env.TENSORRT_BRIDGE_NODE_PATH?.trim(),
  path.resolve('simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
  path.resolve('simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
  path.resolve('../simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
  path.resolve('../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
].filter(Boolean);
const addonPath = candidates.find((candidate) => existsSync(candidate));

const explicit = new Map([
  ['checkCudaAvailable', 'CUDA_RUNTIME'],
  ['getCudaMemory', 'CUDA_RUNTIME'],
  ['captureGraph', 'CUDA_RUNTIME'],
  ['replayGraph', 'CUDA_RUNTIME'],
  ['replayGraphOnStream', 'CUDA_RUNTIME'],
  ['cudaGraphCount', 'CUDA_RUNTIME'],
  ['cudaStreamCount', 'CUDA_RUNTIME'],
  ['attentionScoreGPU_fp16', 'LIBTORCH_FP16'],
  ['rewardScoreGPU_fp16', 'LIBTORCH_FP16'],
  ['batchCosineSimilarity_fp16', 'LIBTORCH_FP16'],
  ['graphSimilarity', 'LIBTORCH_TENSOR'],
  ['graphSimilarityHalf', 'LIBTORCH_TENSOR'],
  ['clusterEmbeddings', 'LIBTORCH_TENSOR'],
  ['computeCaseEmbedding', 'LIBTORCH_TENSOR'],
  ['batchCosineSimilarity', 'LIBTORCH_TENSOR'],
  ['pageRankGPU', 'LIBTORCH_TENSOR'],
  ['attentionScoreGPU', 'LIBTORCH_TENSOR'],
  ['rewardScoreGPU', 'LIBTORCH_TENSOR'],
  ['softmaxGPU', 'LIBTORCH_TENSOR'],
  ['topKIndicesGPU', 'LIBTORCH_TENSOR'],
  ['kmeansWithCentroids', 'LIBTORCH_TENSOR'],
  ['trainSOM', 'LIBTORCH_TENSOR'],
  ['autoencoderEncode', 'LIBTORCH_TENSOR'],
  ['autoencoderDecode', 'LIBTORCH_TENSOR'],
  ['pcaProject', 'LIBTORCH_TENSOR'],
  ['lstmAdd', 'CUSTOM_CUDA_PRIMITIVE'],
  ['dotProduct', 'CUSTOM_CUDA_PRIMITIVE'],
  ['scale', 'CUSTOM_CUDA_PRIMITIVE'],
  ['relu', 'CUSTOM_CUDA_PRIMITIVE'],
  ['somCache', 'CUSTOM_CUDA_PRIMITIVE'],
  ['simdJsonParse', 'CPU_SIMD_CONTROL_PLANE'],
  ['simdJsonValidate', 'CPU_SIMD_CONTROL_PLANE'],
  ['simdJsonExtractNumbers', 'CPU_SIMD_CONTROL_PLANE'],
  ['simdJsonBackend', 'CPU_SIMD_CONTROL_PLANE'],
  ['bridgeSIMD', 'LEGACY_TENSORRT_NAMING_UNPROVEN'],
  ['cuvsCompress', 'CUVS_EXPERIMENTAL_BRIDGE'],
]);

const report = {
  schema: 'atlas.gpu-bridge-export-ownership.v1',
  timestamp: new Date().toISOString(),
  addonPath: addonPath ?? null,
  addonLoaded: false,
  exports: [],
  counts: {},
  unknownExports: [],
  actualTensorRtEngineExports: [],
  status: 'NOT_RUN',
  notes: [
    'The addon filename is not an ownership proof. TensorRT ownership requires an actual TensorRT engine/runtime export.',
    'cuVS ANN remains owned by the dedicated RAPIDS/cuVS executor unless separately promoted.',
  ],
};

try {
  if (!addonPath) throw new Error('NATIVE_ADDON_NOT_FOUND');
  const addon = require(addonPath);
  report.addonLoaded = true;
  for (const name of Object.keys(addon).sort()) {
    const owner = explicit.get(name) ?? 'UNCLASSIFIED';
    report.exports.push({ name, owner });
    report.counts[owner] = (report.counts[owner] ?? 0) + 1;
    if (owner === 'UNCLASSIFIED') report.unknownExports.push(name);
  }
  // Deliberately empty unless a future audited export actually loads/builds/
  // executes a TensorRT engine. `bridgeSIMD` alone is legacy naming evidence.
  report.status = report.unknownExports.length === 0
    ? 'GPU_BRIDGE_EXPORT_OWNERSHIP_CLASSIFIED'
    : 'GPU_BRIDGE_EXPORT_OWNERSHIP_PARTIAL';
} catch (error) {
  report.status = 'GPU_BRIDGE_EXPORT_OWNERSHIP_NOT_PROVEN';
  report.error = error instanceof Error ? error.message : String(error);
}

writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.status === 'GPU_BRIDGE_EXPORT_OWNERSHIP_NOT_PROVEN') process.exitCode = 1;
