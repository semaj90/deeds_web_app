#!/usr/bin/env node
/**
 * Audit the local GPU rerank/cache lane.
 *
 * This verifies the CUDA bridge exports needed for fixed-shape rerank work:
 * query [1,768] + candidates [N,768] -> cosine/topK, optionally via CUDA Graph
 * capture/replay. It also records ONNX Runtime package availability without
 * installing or mutating dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const REPORT_JSON = path.join(REPO_ROOT, 'docs/reports/gpu-rerank-cache-lane.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs/reports/gpu-rerank-cache-lane.md');

const bridgeCandidates = [
  'simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node',
  'simd-bridge/cpp/build/Release/tensorrt_bridge.node',
  'simd-bridge/cpp/build-x64-cuda-cublas/Release/tensorrt_bridge.node',
].map((rel) => path.join(REPO_ROOT, rel));

function tryLoadBridge(filePath) {
  if (!fs.existsSync(filePath)) return { path: filePath, exists: false, loaded: false };
  try {
    const addon = require(filePath);
    const exports = Object.keys(addon).filter((key) => typeof addon[key] === 'function').sort();
    return {
      path: filePath,
      exists: true,
      loaded: true,
      cuda_available: Number(addon.checkCudaAvailable?.() ?? 0) === 1,
      cuda_raw: addon.checkCudaAvailable?.() ?? null,
      exports,
      has_cuda_graphs: ['captureGraph', 'replayGraph', 'replayGraphOnStream', 'cudaGraphCount'].every((name) => exports.includes(name)),
      has_fixed_shape_rerank: ['batchCosineSimilarity', 'topKIndicesGPU'].every((name) => exports.includes(name)),
      has_topology: ['kmeansWithCentroids', 'trainSOM', 'pageRankGPU', 'pcaProject'].every((name) => exports.includes(name)),
      graph_count: typeof addon.cudaGraphCount === 'function' ? addon.cudaGraphCount() : null,
    };
  } catch (error) {
    return { path: filePath, exists: true, loaded: false, error: error.message };
  }
}

function packageAvailability() {
  const roots = [REPO_ROOT, path.join(REPO_ROOT, 'sveltekit-frontend')];
  const packages = ['onnxruntime-node', 'onnxruntime-web', 'onnxruntime-gpu'];
  const found = [];

  for (const root of roots) {
    for (const pkg of packages) {
      try {
        const resolved = require.resolve(pkg, { paths: [root] });
        found.push({ root, package: pkg, available: true, resolved });
      } catch (error) {
        found.push({ root, package: pkg, available: false, error: error.code ?? error.message });
      }
    }
  }
  return found;
}

function recommendedLane(primary) {
  if (!primary?.cuda_available) return 'Use CPU/Qdrant fallback; CUDA bridge is not available.';
  if (primary.has_cuda_graphs && primary.has_fixed_shape_rerank) {
    return 'Use CUDA Graph capture for fixed-shape rerank: query[1,768] + candidates[200,768] -> cosine -> topK.';
  }
  if (primary.has_fixed_shape_rerank) return 'Use direct CUDA cosine/topK without graph capture.';
  return 'Use CUDA only for clustering/topology; keep rerank on Qdrant/CPU.';
}

function renderMarkdown(report) {
  const lines = [
    '# GPU Rerank Cache Lane Audit',
    '',
    `- generated_at: ${report.generated_at}`,
    `- verdict: ${report.verdict}`,
    `- primary_bridge: ${report.primary_bridge?.path ?? 'none'}`,
    `- cuda_available: ${report.primary_bridge?.cuda_available ?? false}`,
    `- cuda_graphs: ${report.primary_bridge?.has_cuda_graphs ?? false}`,
    `- fixed_shape_rerank: ${report.primary_bridge?.has_fixed_shape_rerank ?? false}`,
    `- topology_exports: ${report.primary_bridge?.has_topology ?? false}`,
    `- recommendation: ${report.recommendation}`,
    '',
    '## Bridge Candidates',
    '',
    '| Path | Loaded | CUDA | CUDA Graphs | Rerank | Graph Count |',
    '|---|---:|---:|---:|---:|---:|',
    ...report.bridges.map((bridge) => `| \`${path.relative(REPO_ROOT, bridge.path)}\` | ${bridge.loaded ? 'yes' : 'no'} | ${bridge.cuda_available ? 'yes' : 'no'} | ${bridge.has_cuda_graphs ? 'yes' : 'no'} | ${bridge.has_fixed_shape_rerank ? 'yes' : 'no'} | ${bridge.graph_count ?? ''} |`),
    '',
    '## ONNX Runtime Packages',
    '',
    '| Root | Package | Available |',
    '|---|---|---:|',
    ...report.onnx_runtime.map((entry) => `| \`${path.relative(REPO_ROOT, entry.root) || '.'}\` | \`${entry.package}\` | ${entry.available ? 'yes' : 'no'} |`),
    '',
    '## Boundary',
    '',
    '- CUDA Graphs are for fixed-shape rerank/cosine/topK, not variable JSON parsing or text generation.',
    '- TensorRT engine caches are separate from Redis and should be stored as model artifacts.',
    '- Persistent tensors in VRAM are runtime cache only; Postgres remains canonical truth.',
    '- Qdrant HNSW remains production ANN until a cuVS/Weaviate/OpenSearch benchmark proves better recall/latency.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const bridges = bridgeCandidates.map(tryLoadBridge);
  const primary = bridges.find((bridge) => bridge.loaded && bridge.cuda_available) ?? bridges.find((bridge) => bridge.loaded) ?? null;
  const report = {
    generated_at: new Date().toISOString(),
    verdict: primary?.cuda_available && primary?.has_cuda_graphs && primary?.has_fixed_shape_rerank ? 'READY' : 'PARTIAL',
    primary_bridge: primary,
    bridges,
    onnx_runtime: packageAvailability(),
    recommendation: recommendedLane(primary),
    next_order: [
      'Keep Qdrant HNSW as production ANN.',
      'Use CUDA Graphs for fixed-shape rerank batches only.',
      'Use Redis/BitFrost for result/topK cache, not GPU tensors.',
      'Run SOM/AE/4D topology after summary and feature-envelope coverage improves.',
      'Benchmark cuVS/Weaviate/OpenSearch later as mirror accelerators, not truth stores.',
    ],
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(REPORT_MD, renderMarkdown(report), 'utf8');
  console.log(JSON.stringify({
    verdict: report.verdict,
    primary_bridge: primary?.path ?? null,
    cuda_available: primary?.cuda_available ?? false,
    cuda_graphs: primary?.has_cuda_graphs ?? false,
    fixed_shape_rerank: primary?.has_fixed_shape_rerank ?? false,
    recommendation: report.recommendation,
    outputs: { json: REPORT_JSON, markdown: REPORT_MD },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
