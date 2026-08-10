export type NumericOperation =
  | 'EXACT_COSINE_TOPK'
  | 'CAGRA_SEARCH'
  | 'KMEANS_FIT'
  | 'KMEANS_PREDICT'
  | 'GEMM_SCORE'
  | 'REDUCE'
  | 'NORMALIZE'
  | 'PROJECT'
  | 'QUANTIZE'
  | 'INTERPOLATE_GRID';

export type ResourceClass = 'CPU_LIGHT' | 'CPU_HEAVY' | 'IO' | 'GPU_LIGHT' | 'GPU_HEAVY' | 'LLM';

export interface NumericBackendDescriptor {
  backendId: string;
  operation: NumericOperation;
  resourceClass: ResourceClass;
  preferred: boolean;
  cpuOracle?: string;
  absoluteTolerance?: number;
  relativeTolerance?: number;
  deterministic: 'YES' | 'SEEDED' | 'NO';
}
