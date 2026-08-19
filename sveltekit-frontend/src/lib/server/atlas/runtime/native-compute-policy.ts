export type NativeRuntime = 'windows-native' | 'wsl2' | 'cpu-only';
export type NativeExecutor =
  | 'cpu'
  | 'cublas'
  | 'cublaslt'
  | 'libtorch-cuda'
  | 'cusolver'
  | 'cutlass'
  | 'cutile'
  | 'tensorrt-rtx'
  | 'pytorch-cuda'
  | 'cuvs-exact'
  | 'cagra'
  | 'cugraph'
  | 'cugraph-pyg'
  | 'tensorrt-llm';
export type ComputeDtype = 'fp64' | 'fp32' | 'tf32' | 'bf16' | 'fp16' | 'int8';
export type NativeOperation =
  | 'GEMM'
  | 'GEMV'
  | 'COSINE_TOPK'
  | 'SIGNED_S3_DOT'
  | 'LOW_RANK_PROJECT'
  | 'SVD'
  | 'PCA'
  | 'PAGERANK'
  | 'PPR'
  | 'GRAPH_BFS'
  | 'GRAPH_SSSP'
  | 'GRAPH_GREEDY_BEST_FIRST'
  | 'GRAPH_ASTAR_REFERENCE'
  | 'KNN_EXACT'
  | 'KNN_ANN'
  | 'GNN_INFER'
  | 'MODEL_INFER'
  | 'CLASSIFY'
  | 'RERANK';

export interface GpuEnvironmentCapabilities {
  receiptId: string;
  runtime: Exclude<NativeRuntime, 'cpu-only'>;
  status: 'PROVEN' | 'DEGRADED' | 'UNAVAILABLE';
  computeCapability: string;
  freeGpuBytes: number;
  cublas?: boolean;
  cublasLt?: boolean;
  libtorch?: boolean;
  cusolver?: boolean;
  cutlass?: boolean;
  cutile?: boolean;
  tensorrtRtx?: boolean;
  pytorch?: boolean;
  cuvs?: boolean;
  cugraph?: boolean;
  cugraphPyg?: boolean;
  tensorrtLlm?: boolean;
}

export interface NativeComputeRequest {
  operation: NativeOperation;
  capability: string;
  shape: number[];
  requiredGpuBytes: number;
  referenceSensitive?: boolean;
  dynamicRangeSensitive?: boolean;
  allowQuantizedInt8?: boolean;
  int8AccuracyProven?: boolean;
  preferWindowsLowLatency?: boolean;
}

export interface NativeComputeDecision {
  runtime: NativeRuntime;
  executor: NativeExecutor;
  dtype: ComputeDtype;
  accumulationDtype: 'fp64' | 'fp32' | 'tf32' | 'bf16' | 'fp16' | 'int32';
  environmentReceiptId: string | null;
  reason: string;
}

function fits(env: GpuEnvironmentCapabilities | undefined, bytes: number): env is GpuEnvironmentCapabilities {
  return Boolean(env && env.status === 'PROVEN' && env.freeGpuBytes >= bytes);
}

function denseDtype(req: NativeComputeRequest): Pick<NativeComputeDecision, 'dtype' | 'accumulationDtype'> {
  if (req.referenceSensitive) return { dtype: 'fp32', accumulationDtype: 'fp32' };
  if (req.dynamicRangeSensitive) return { dtype: 'bf16', accumulationDtype: 'fp32' };
  if (req.allowQuantizedInt8 && req.int8AccuracyProven) return { dtype: 'int8', accumulationDtype: 'int32' };
  return { dtype: 'fp16', accumulationDtype: 'fp32' };
}

/**
 * Selects an executor for one already-defined Atlas operation.
 *
 * Runtime choice is operational only. Windows and WSL2 must consume the same
 * revisioned inputs and are judged against the same independent reference.
 *
 * Graph-search rule:
 * - cuGraph owns accelerated BFS/SSSP/PageRank/PPR on bounded graph projections.
 * - Greedy best-first and A* remain reference/helper algorithms unless a dedicated
 *   accelerated implementation is separately proven.
 * - A* may only be selected by the higher-level graph-search policy when its
 *   heuristic is proven admissible for the optimized path cost.
 *
 * Semantic-search rule:
 * - KNN_EXACT/cuVS brute force is a smoke/parity oracle only. Production semantic
 *   seeding is owned by Qdrant or a proven CAGRA hot shard outside this function.
 */
export function chooseNativeComputeExecutor(
  req: NativeComputeRequest,
  envs: GpuEnvironmentCapabilities[],
): NativeComputeDecision {
  const windows = envs.find((env) => env.runtime === 'windows-native');
  const wsl = envs.find((env) => env.runtime === 'wsl2');
  const dense = denseDtype(req);

  if (req.operation === 'PAGERANK' || req.operation === 'PPR' || req.operation === 'GRAPH_BFS' || req.operation === 'GRAPH_SSSP') {
    if (fits(wsl, req.requiredGpuBytes) && wsl.cugraph) {
      return {
        runtime: 'wsl2',
        executor: 'cugraph',
        dtype: 'fp32',
        accumulationDtype: 'fp32',
        environmentReceiptId: wsl.receiptId,
        reason: `${req.operation} uses bounded cuGraph execution; NetworkX/CPU remains the readable oracle`,
      };
    }
    return {
      runtime: 'cpu-only',
      executor: 'cpu',
      dtype: 'fp64',
      accumulationDtype: 'fp64',
      environmentReceiptId: null,
      reason: `${req.operation} GPU environment not proven; use reference-compatible CPU/NetworkX graph path`,
    };
  }

  if (req.operation === 'GRAPH_GREEDY_BEST_FIRST') {
    return {
      runtime: 'cpu-only',
      executor: 'cpu',
      dtype: 'fp64',
      accumulationDtype: 'fp64',
      environmentReceiptId: null,
      reason: 'greedy best-first is a deterministic relevance helper over an already-bounded frontier; no dedicated GPU owner is proven',
    };
  }

  if (req.operation === 'GRAPH_ASTAR_REFERENCE') {
    return {
      runtime: 'cpu-only',
      executor: 'cpu',
      dtype: 'fp64',
      accumulationDtype: 'fp64',
      environmentReceiptId: null,
      reason: 'A* remains a reference-only shortest-path helper and requires an independently proven admissible heuristic',
    };
  }

  if (req.operation === 'KNN_EXACT') {
    if (fits(wsl, req.requiredGpuBytes) && wsl.cuvs) {
      return {
        runtime: 'wsl2',
        executor: 'cuvs-exact',
        ...dense,
        environmentReceiptId: wsl.receiptId,
        reason: 'cuVS brute force exact oracle available for smoke/parity/Recall@K tests only; not a production semantic seed executor',
      };
    }
    return {
      runtime: 'cpu-only',
      executor: 'cpu',
      dtype: 'fp32',
      accumulationDtype: 'fp32',
      environmentReceiptId: null,
      reason: 'cuVS exact unavailable; use CPU exact oracle for tests only',
    };
  }

  if (req.operation === 'KNN_ANN') {
    if (fits(wsl, req.requiredGpuBytes) && wsl.cuvs) {
      return { runtime: 'wsl2', executor: 'cagra', ...dense, environmentReceiptId: wsl.receiptId, reason: 'CAGRA is an ANN executor for a proven resident hot shard; higher-level seed policy decides whether that shard is eligible' };
    }
    return { runtime: 'cpu-only', executor: 'cpu', dtype: 'fp32', accumulationDtype: 'fp32', environmentReceiptId: null, reason: 'GPU ANN unavailable; Qdrant/external persistent search owner must handle the production semantic lane' };
  }

  if (req.operation === 'GNN_INFER') {
    if (fits(wsl, req.requiredGpuBytes) && wsl.cugraphPyg) {
      return { runtime: 'wsl2', executor: 'cugraph-pyg', ...dense, environmentReceiptId: wsl.receiptId, reason: 'cuGraph-PyG challenger available' };
    }
    if (fits(wsl, req.requiredGpuBytes) && wsl.pytorch) {
      return { runtime: 'wsl2', executor: 'pytorch-cuda', ...dense, environmentReceiptId: wsl.receiptId, reason: 'PyTorch GNN fallback available in WSL2' };
    }
    return { runtime: 'cpu-only', executor: 'cpu', dtype: 'fp32', accumulationDtype: 'fp32', environmentReceiptId: null, reason: 'GNN enrichment unavailable; signal must remain UNKNOWN, not zero' };
  }

  if (req.operation === 'SVD' || req.operation === 'PCA') {
    if (fits(windows, req.requiredGpuBytes) && windows.cusolver) {
      return { runtime: 'windows-native', executor: 'cusolver', dtype: 'fp32', accumulationDtype: 'fp32', environmentReceiptId: windows.receiptId, reason: 'cuSOLVER decomposition available behind native bridge' };
    }
    if (fits(wsl, req.requiredGpuBytes) && wsl.pytorch) {
      return { runtime: 'wsl2', executor: 'pytorch-cuda', dtype: 'fp32', accumulationDtype: 'fp32', environmentReceiptId: wsl.receiptId, reason: 'PyTorch CUDA decomposition fallback' };
    }
    return { runtime: 'cpu-only', executor: 'cpu', dtype: 'fp64', accumulationDtype: 'fp64', environmentReceiptId: null, reason: 'decomposition GPU path unavailable; CPU proof path retained' };
  }

  if (req.operation === 'MODEL_INFER' || req.operation === 'CLASSIFY' || req.operation === 'RERANK') {
    if (req.preferWindowsLowLatency && fits(windows, req.requiredGpuBytes) && windows.tensorrtRtx) {
      return { runtime: 'windows-native', executor: 'tensorrt-rtx', ...dense, environmentReceiptId: windows.receiptId, reason: 'low-latency Windows TensorRT-RTX capability is proven' };
    }
    if (req.operation === 'MODEL_INFER' && fits(wsl, req.requiredGpuBytes) && wsl.tensorrtLlm) {
      return { runtime: 'wsl2', executor: 'tensorrt-llm', ...dense, environmentReceiptId: wsl.receiptId, reason: 'WSL2 TensorRT-LLM model-serving executor is proven' };
    }
    if (fits(windows, req.requiredGpuBytes) && windows.libtorch) {
      return { runtime: 'windows-native', executor: 'libtorch-cuda', ...dense, environmentReceiptId: windows.receiptId, reason: 'LibTorch CUDA fallback available in native process' };
    }
  }

  if (['GEMM', 'GEMV', 'COSINE_TOPK', 'SIGNED_S3_DOT', 'LOW_RANK_PROJECT'].includes(req.operation)) {
    if (fits(windows, req.requiredGpuBytes) && windows.cublasLt) {
      return { runtime: 'windows-native', executor: 'cublaslt', ...dense, environmentReceiptId: windows.receiptId, reason: 'cuBLASLt Tensor Core path preferred for dense mixed-precision math' };
    }
    if (fits(windows, req.requiredGpuBytes) && windows.libtorch) {
      return { runtime: 'windows-native', executor: 'libtorch-cuda', ...dense, environmentReceiptId: windows.receiptId, reason: 'LibTorch CUDA fallback for dense math' };
    }
    if (fits(wsl, req.requiredGpuBytes) && wsl.pytorch) {
      return { runtime: 'wsl2', executor: 'pytorch-cuda', ...dense, environmentReceiptId: wsl.receiptId, reason: 'WSL2 PyTorch CUDA fallback for dense math' };
    }
  }

  return { runtime: 'cpu-only', executor: 'cpu', dtype: req.referenceSensitive ? 'fp64' : 'fp32', accumulationDtype: req.referenceSensitive ? 'fp64' : 'fp32', environmentReceiptId: null, reason: 'no proven GPU executor satisfies the capability and resource envelope' };
}
