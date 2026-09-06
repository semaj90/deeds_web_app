export const EXECUTION_HEADROOM_V1_SCHEMA = 'parent-atlas.execution-headroom.v1' as const;

export interface ExecutionHeadroomV1 {
  schema: typeof EXECUTION_HEADROOM_V1_SCHEMA;
  requestId: string;

  maxWallClockMs: number;

  maxPostgresReads: number;
  maxSourceReads: number;
  maxFetchedBytes: number;

  maxSemanticCandidates: number;
  maxGraphExpansions: number;

  maxCpuBytes: number;
  maxGpuBytes: number;

  maxContextTokens: number;

  maxConcurrentEvidenceBranches: number;
  maxCpuWorkers: number;
  maxConcurrentGpuJobs: number;

  reserveGpuBytes: number;
  reserveContextTokens: number;
}

export interface HeadroomUsageV1 {
  elapsedMs: number;
  postgresReads: number;
  sourceReads: number;
  fetchedBytes: number;
  semanticCandidates: number;
  graphExpansions: number;
  cpuBytes: number;
  gpuBytes: number;
  contextTokens: number;
}

export function buildExecutionHeadroomV1(
  input: Omit<ExecutionHeadroomV1, 'schema'>
): ExecutionHeadroomV1 {
  if (input.maxConcurrentEvidenceBranches < 1) {
    throw new Error('maxConcurrentEvidenceBranches must be >= 1');
  }
  if (input.maxCpuWorkers < 1) throw new Error('maxCpuWorkers must be >= 1');
  if (input.maxConcurrentGpuJobs < 1) throw new Error('maxConcurrentGpuJobs must be >= 1');

  return { schema: EXECUTION_HEADROOM_V1_SCHEMA, ...input };
}

export function remainingHeadroomV1(
  headroom: ExecutionHeadroomV1,
  used: HeadroomUsageV1
) {
  return {
    wallClockMs: Math.max(0, headroom.maxWallClockMs - used.elapsedMs),
    postgresReads: Math.max(0, headroom.maxPostgresReads - used.postgresReads),
    sourceReads: Math.max(0, headroom.maxSourceReads - used.sourceReads),
    fetchedBytes: Math.max(0, headroom.maxFetchedBytes - used.fetchedBytes),
    semanticCandidates: Math.max(0, headroom.maxSemanticCandidates - used.semanticCandidates),
    graphExpansions: Math.max(0, headroom.maxGraphExpansions - used.graphExpansions),
    cpuBytes: Math.max(0, headroom.maxCpuBytes - used.cpuBytes),
    gpuBytes: Math.max(0, headroom.maxGpuBytes - used.gpuBytes),
    contextTokens: Math.max(0, headroom.maxContextTokens - used.contextTokens)
  };
}
