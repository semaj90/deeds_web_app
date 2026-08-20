import assert from 'node:assert/strict';
import test from 'node:test';

import {
  gpuExecutionEvidenceReceiptSchema,
  gpuTraceArtifactSchema,
  liveGraphFixtureReceiptSchema,
} from '../dist/index.js';

const h = (c) => c.repeat(64);

const nsys = {
  artifact_id: 'trace-r1',
  role: 'NSYS_REP',
  relative_path: 'reports/live-graph.nsys-rep',
  sha256: h('a'),
  size_bytes: 1024,
  canonical_trace_artifact: true,
};

test('only NSYS_REP may be canonical execution-trace evidence', () => {
  assert.throws(() => gpuTraceArtifactSchema.parse({
    artifact_id: 'bad',
    role: 'NSYS_JSONLINES',
    relative_path: 'trace.jsonl',
    sha256: h('b'),
    size_bytes: 12,
    canonical_trace_artifact: true,
  }));
});

test('Tensor Core use cannot be inferred from cuBLAS calls alone', () => {
  assert.throws(() => gpuExecutionEvidenceReceiptSchema.parse({
    receipt_id: 'gpu-r1',
    workflow_id: 'workflow-1',
    workflow_revision: 1,
    source_snapshot_revision: 'source-r1',
    graph_revision: 'graph-r1',
    fixture_checksum: h('c'),
    nvtx_domain: 'parent-atlas',
    nvtx_range: 'atlas.graph_fixture',
    requested_backend: 'CUBLAS_CUBLASLT',
    observed_backend: 'CUBLASLT',
    precision_policy: 'TF32_ALLOWED',
    tensor_core_expectation: 'REQUIRED',
    tensor_core_used: true,
    nsys_version: '2026.4',
    ncu_version: null,
    cuda_version: '13.0',
    cugraph_version: '26.06',
    device_name: 'RTX 3060 Ti',
    compute_capability: '8.6',
    blas_api_observations: [{
      library: 'CUBLASLT',
      api_name: 'cublasLtMatmul',
      call_count: 1,
      nvtx_range: 'atlas.graph_fixture',
      compute_type: 'TF32',
      source: 'NSYS_CUBLAS_VERBOSE',
    }],
    tensor_core_metrics: [],
    artifacts: [nsys],
    status: 'VERIFIED',
    producer_revision: 'test-r1',
  }));
});

test('verified Tensor Core evidence needs both canonical trace and Nsight Compute artifact', () => {
  const receipt = gpuExecutionEvidenceReceiptSchema.parse({
    receipt_id: 'gpu-r2',
    workflow_id: 'workflow-1',
    workflow_revision: 1,
    source_snapshot_revision: 'source-r1',
    graph_revision: 'graph-r1',
    fixture_checksum: h('d'),
    nvtx_domain: 'parent-atlas',
    nvtx_range: 'atlas.graph_fixture',
    requested_backend: 'CUGRAPH_WITH_BLAS_TELEMETRY',
    observed_backend: 'CUBLAS_AND_CUBLASLT',
    precision_policy: 'TF32_ALLOWED',
    tensor_core_expectation: 'OPTIONAL',
    tensor_core_used: true,
    nsys_version: '2026.4',
    ncu_version: '2026.3',
    cuda_version: '13.0',
    cugraph_version: '26.06',
    device_name: 'RTX 3060 Ti',
    compute_capability: '8.6',
    blas_api_observations: [{
      library: 'CUBLAS',
      api_name: 'cublasGemmEx',
      call_count: 2,
      nvtx_range: 'atlas.graph_fixture',
      compute_type: 'TF32',
      source: 'NSYS_CUBLAS_VERBOSE',
    }],
    tensor_core_metrics: [{
      metric_name: 'sm__pipe_tensor_op_hmma_cycles_active.avg.pct_of_peak_sustained_active',
      metric_value: 34.2,
      metric_unit: 'percent',
      kernel_name: 'fixture-kernel',
      nvtx_range: 'atlas.graph_fixture',
      source: 'NSIGHT_COMPUTE',
    }],
    artifacts: [
      nsys,
      {
        artifact_id: 'ncu-r1',
        role: 'NCU_REP',
        relative_path: 'reports/live-graph.ncu-rep',
        sha256: h('e'),
        size_bytes: 2048,
        canonical_trace_artifact: false,
      },
    ],
    status: 'VERIFIED',
    producer_revision: 'test-r1',
  });
  assert.equal(receipt.tensor_core_used, true);
  assert.equal(receipt.artifacts.filter((x) => x.canonical_trace_artifact).length, 1);
});

test('live graph fixture rejects toy graphs smaller than 500 vertices', () => {
  assert.throws(() => liveGraphFixtureReceiptSchema.parse({
    receipt_id: 'fixture-r1',
    workflow_id: 'workflow-1',
    workflow_revision: 1,
    source_snapshot_revision: 'source-r1',
    graph_revision: 'graph-r1',
    feature_revision: 'feature-r1',
    row_identity_checksum: h('f'),
    fixture_checksum: h('1'),
    vertex_count: 100,
    edge_count: 200,
    random_seed: 7,
    algorithms: [],
    gpu_memory_receipt: {},
    rapids_version: '26.06',
    cugraph_version: '26.06',
    cuda_version: '13.0',
    status: 'IMPLEMENTED_UNPROVEN',
    producer_revision: 'test-r1',
  }));
});
