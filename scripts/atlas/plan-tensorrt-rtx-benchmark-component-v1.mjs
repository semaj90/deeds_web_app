import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const checkpoint = join(root, 'models', 'gemma4_assistant_huggingface_7_3_26', 'model.safetensors');
const configPath = join(root, 'models', 'gemma4_assistant_huggingface_7_3_26', 'config.json');
const reportPath = join(root, 'docs', 'reports', 'tensorrt-rtx-benchmark-component-v1.json');
const present = existsSync(checkpoint);
const configPresent = existsSync(configPath);
const checksum = present ? createHash('sha256').update(readFileSync(checkpoint)).digest('hex') : null;
const config = configPresent ? JSON.parse(readFileSync(configPath, 'utf8')) : null;
const configChecksum = configPresent ? createHash('sha256').update(readFileSync(configPath)).digest('hex') : null;
const boundedShape = config
  ? {
      batch: 1,
      inputTokens: 512,
      hiddenSize: config.text_config?.hidden_size ?? null,
      dtype: config.dtype ?? config.text_config?.dtype ?? null,
      useCache: false,
      shapeStatus: 'PLANNED_BOUNDED_EXPORT_CONTRACT',
    }
  : null;
const componentRevision = present && configChecksum
  ? `sha256:${createHash('sha256')
      .update(JSON.stringify({ artifactSha256: checksum, configSha256: configChecksum, boundedShape }))
      .digest('hex')}`
  : null;
const report = {
  schema: 'TensorRtRtxBenchmarkComponentSelectionV1',
  generatedAt: new Date().toISOString(),
  status: present && config ? 'HEAVIER_COMPONENT_BOUND_NOT_EXECUTED' : 'NO_COMPONENT_SELECTED',
  selectedComponent: {
    role: 'bounded_reranker_or_prefill_auxiliary_challenger',
    artifactPath: 'models/gemma4_assistant_huggingface_7_3_26/model.safetensors',
    artifactPresent: present,
    artifactBytes: present ? statSync(checkpoint).size : null,
    artifactSha256: checksum,
    configPath: 'models/gemma4_assistant_huggingface_7_3_26/config.json',
    configSha256: configChecksum,
    componentRevision: componentRevision ?? 'UNBOUND_MODEL_COMPONENT_REVISION',
    boundedShape: boundedShape ?? 'UNBOUND_PENDING_EXPORT_CONTRACT',
    rationale: 'Heavier bounded neural workload gives AOT/JIT/runtime-cache overhead a measurable chance to amortize.',
    expectedAmortization: 'Compare one-time portable-AOT/device-JIT cost separately from steady-state execution over repeated batch-1, 512-token runs.',
  },
  excludedComponent: {
    component: 'QueryRouterTensorV1[154] -> hidden -> heads',
    reason: 'Correctness/reference plumbing only; too small for the TensorRT-RTX performance criterion.',
  },
  requiredLadder: ['pytorch_cpu_fp32', 'pytorch_cuda_sm86', 'libtorch_node_api', 'onnx_runtime_gpu', 'tensorrt_rtx'],
  execution: { exported: false, engineBuilt: false, runtimeCacheObserved: false, benchmarked: false },
  canonicalAuthority: false,
  writesPerformed: false,
  nextGate: 'PROVE_PYTORCH_REFERENCE_AND_EXPORT_BOUNDED_ONNX_AFTER_LINEAGE_AND_PARITY_GATES',
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, artifactBytes: report.selectedComponent.artifactBytes, artifactSha256: report.selectedComponent.artifactSha256, output: reportPath }, null, 2));
