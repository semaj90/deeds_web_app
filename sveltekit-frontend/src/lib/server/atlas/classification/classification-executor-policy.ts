export type ClassificationTask = 'domain' | 'ontology' | 'concept' | 'entity' | 'rerank';
export type ClassificationExecutor =
  | 'deterministic_ts'
  | 'xgboost_cpu'
  | 'xgboost_cuda'
  | 'pytorch_cpu'
  | 'pytorch_cuda'
  | 'heuristic';

export interface ClassificationExecutorCapabilities {
  xgboostAvailable: boolean;
  xgboostCudaAvailable: boolean;
  pytorchAvailable: boolean;
  pytorchCudaAvailable: boolean;
  gpuBusy: boolean;
  freeVramBytes: number;
  minFreeVramBytes: number;
}

export interface ClassificationExecutorDecision {
  logicalSignal: 'classification';
  task: ClassificationTask;
  executor: ClassificationExecutor;
  reason: string;
  fallbackChain: ClassificationExecutor[];
}

/**
 * Executor policy only. DomainClassificationV1 / ontology/concept owners remain
 * canonical producers. CPU and CUDA executions are NOT separate feature votes.
 */
export function chooseClassificationExecutor(input: {
  task: ClassificationTask;
  preferLearned?: boolean;
  preferTreeModel?: boolean;
  capabilities: ClassificationExecutorCapabilities;
}): ClassificationExecutorDecision {
  const c = input.capabilities;
  const gpuEligible = !c.gpuBusy && c.freeVramBytes >= c.minFreeVramBytes;
  const fallbackChain: ClassificationExecutor[] = [];

  if (input.preferLearned !== false && input.preferTreeModel) {
    if (c.xgboostCudaAvailable && gpuEligible) fallbackChain.push('xgboost_cuda');
    if (c.xgboostAvailable) fallbackChain.push('xgboost_cpu');
  }
  if (input.preferLearned !== false) {
    if (c.pytorchCudaAvailable && gpuEligible) fallbackChain.push('pytorch_cuda');
    if (c.pytorchAvailable) fallbackChain.push('pytorch_cpu');
  }
  fallbackChain.push('deterministic_ts', 'heuristic');

  return {
    logicalSignal: 'classification',
    task: input.task,
    executor: fallbackChain[0]!,
    reason: fallbackChain[0]!.includes('cuda')
      ? 'learned classifier selected within GPU resource envelope'
      : fallbackChain[0]!.includes('cpu')
        ? 'learned CPU classifier selected; GPU unavailable or not needed'
        : 'deterministic fallback selected',
    fallbackChain: [...new Set(fallbackChain)],
  };
}
