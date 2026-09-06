export const EXECUTION_PARALLELISM_V1_SCHEMA = 'parent-atlas.execution-parallelism.v1' as const;

export type EvidenceBranchV1 = 'EXACT' | 'STRUCTURAL' | 'SEMANTIC' | 'GRAPH';

export interface CpuWorkerProfileV1 {
  workerId: 'CPU-0' | 'CPU-1' | 'CPU-2' | 'CPU-3';
  responsibilities: readonly string[];
}

export interface GpuArbiterProfileV1 {
  workerId: 'GPU-0';
  maxConcurrentGpuJobs: 1;
  responsibilities: readonly (
    | 'EMBEDDING'
    | 'CUVS'
    | 'CUGRAPH'
    | 'RERANK'
    | 'MODEL_INFERENCE'
    | 'NVCOMP'
  )[];
}

export interface RabbitMqDispatchPolicyV1 {
  enabled: boolean;
  role: 'OPTIONAL_DISPATCH_ONLY';
  manualAck: true;
  prefetchCount: 1 | 2;
  canonicalQueueOwner: 'POSTGRES_ANALYSIS_JOBS';
}

export interface ExecutionParallelismV1 {
  schema: typeof EXECUTION_PARALLELISM_V1_SCHEMA;
  maxConcurrentEvidenceBranches: 3;
  cpuWorkers: readonly CpuWorkerProfileV1[];
  gpu: GpuArbiterProfileV1;
  rabbitMq: RabbitMqDispatchPolicyV1;
}

export const DEFAULT_EXECUTION_PARALLELISM_V1: ExecutionParallelismV1 = {
  schema: EXECUTION_PARALLELISM_V1_SCHEMA,
  maxConcurrentEvidenceBranches: 3,
  cpuWorkers: [
    {
      workerId: 'CPU-0',
      responsibilities: ['exact', 'metadata', 'PostgreSQL', 'FTS']
    },
    {
      workerId: 'CPU-1',
      responsibilities: ['AST', 'ast-grep', 'NLP']
    },
    {
      workerId: 'CPU-2',
      responsibilities: ['graph assembly', 'ontology', 'JSON transforms']
    },
    {
      workerId: 'CPU-3',
      responsibilities: ['compression', 'hydration', 'misc pass work']
    }
  ],
  gpu: {
    workerId: 'GPU-0',
    maxConcurrentGpuJobs: 1,
    responsibilities: ['EMBEDDING', 'CUVS', 'CUGRAPH', 'RERANK', 'MODEL_INFERENCE', 'NVCOMP']
  },
  rabbitMq: {
    enabled: false,
    role: 'OPTIONAL_DISPATCH_ONLY',
    manualAck: true,
    prefetchCount: 1,
    canonicalQueueOwner: 'POSTGRES_ANALYSIS_JOBS'
  }
};

export function selectEvidenceBranchesV1(
  requested: readonly EvidenceBranchV1[],
  maxBranches = DEFAULT_EXECUTION_PARALLELISM_V1.maxConcurrentEvidenceBranches
): readonly EvidenceBranchV1[] {
  const priority: readonly EvidenceBranchV1[] = ['EXACT', 'STRUCTURAL', 'SEMANTIC', 'GRAPH'];
  const requestedSet = new Set(requested);
  return priority.filter((x) => requestedSet.has(x)).slice(0, Math.max(1, maxBranches));
}
