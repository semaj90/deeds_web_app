import { z } from 'zod';

export const PythonPackageCapabilityV1Schema = z.object({
  available: z.boolean(),
  version: z.string().min(1).nullable(),
  import_error: z.string().min(1).nullable(),
}).strict();

export const PythonRuntimeCapabilityV1Schema = z.object({
  schema: z.literal('atlas.python-runtime-capability.v1'),
  implementation: z.string().min(1),
  python_version: z.string().min(1),
  executable: z.string().min(1),
  abi_flags: z.string(),
  free_thread_build: z.boolean(),
  gil_enabled_before_imports: z.boolean().nullable(),
  gil_enabled_after_imports: z.boolean().nullable(),
  gil_reenabled_by_extension_import: z.boolean().nullable(),
  networkx: PythonPackageCapabilityV1Schema,
  torch: PythonPackageCapabilityV1Schema,
  qdrant_client: PythonPackageCapabilityV1Schema,
  neo4j: PythonPackageCapabilityV1Schema,
  torch_cuda_available: z.boolean().nullable(),
  torch_cuda_device_count: z.number().int().nonnegative().nullable(),
  executor_hints: z.record(z.string(), z.string()),
}).strict();
export type PythonRuntimeCapabilityV1 = z.infer<typeof PythonRuntimeCapabilityV1Schema>;

export const PythonWorkloadKindSchema = z.enum([
  'QDRANT_IO_FANOUT',
  'NEO4J_IO_FANOUT',
  'NETWORKX_CPU_GRAPH',
  'PYTORCH_CPU',
  'PYTORCH_CUDA',
]);
export type PythonWorkloadKind = z.infer<typeof PythonWorkloadKindSchema>;

export const PythonWorkerModeSchema = z.enum([
  'ASYNCIO_SINGLE_LOOP',
  'THREAD_POOL',
  'PROCESS_POOL',
  'ISOLATED_GPU_WORKER',
]);
export type PythonWorkerMode = z.infer<typeof PythonWorkerModeSchema>;

export const PythonWorkerPlanV1Schema = z.object({
  schema: z.literal('atlas.python-worker-plan.v1'),
  workload: PythonWorkloadKindSchema,
  mode: PythonWorkerModeSchema,
  trueParallelPythonThreads: z.boolean(),
  packageAvailable: z.boolean(),
  cudaRequired: z.boolean(),
  reasonCodes: z.array(z.string().min(1)).min(1).max(16),
  canonicalWrites: z.literal(false),
}).strict();
export type PythonWorkerPlanV1 = z.infer<typeof PythonWorkerPlanV1Schema>;

function trueParallelThreads(capability: PythonRuntimeCapabilityV1): boolean {
  return capability.free_thread_build && capability.gil_enabled_after_imports === false;
}

/**
 * Plan from observed capability, never from the Python version string alone.
 * Importing an unsupported extension can re-enable the GIL in a free-threaded
 * interpreter, so the post-import GIL state is the deciding signal.
 */
export function planPythonWorker(input: {
  capability: PythonRuntimeCapabilityV1;
  workload: PythonWorkloadKind;
}): PythonWorkerPlanV1 {
  const capability = PythonRuntimeCapabilityV1Schema.parse(input.capability);
  const parallel = trueParallelThreads(capability);
  const reasons: string[] = [
    capability.free_thread_build ? 'FREE_THREAD_BUILD' : 'REGULAR_GIL_BUILD',
    capability.gil_enabled_after_imports === false ? 'GIL_DISABLED_AFTER_IMPORTS' : 'GIL_ENABLED_OR_UNKNOWN_AFTER_IMPORTS',
  ];
  if (capability.gil_reenabled_by_extension_import) reasons.push('EXTENSION_IMPORT_REENABLED_GIL');

  let mode: PythonWorkerMode;
  let packageAvailable = true;
  let cudaRequired = false;

  switch (input.workload) {
    case 'QDRANT_IO_FANOUT':
      packageAvailable = capability.qdrant_client.available;
      mode = 'ASYNCIO_SINGLE_LOOP';
      reasons.push('IO_BOUND_QDRANT');
      break;
    case 'NEO4J_IO_FANOUT':
      packageAvailable = capability.neo4j.available;
      mode = 'ASYNCIO_SINGLE_LOOP';
      reasons.push('IO_BOUND_NEO4J');
      break;
    case 'NETWORKX_CPU_GRAPH':
      packageAvailable = capability.networkx.available;
      mode = parallel ? 'THREAD_POOL' : 'PROCESS_POOL';
      reasons.push(parallel ? 'CPU_THREADS_ALLOWED_BY_OBSERVED_GIL_STATE' : 'PROCESS_ISOLATION_FOR_CPU_GRAPH');
      break;
    case 'PYTORCH_CPU':
      packageAvailable = capability.torch.available;
      mode = parallel ? 'THREAD_POOL' : 'PROCESS_POOL';
      reasons.push('PYTORCH_EXTENSION_CAPABILITY_OBSERVED');
      break;
    case 'PYTORCH_CUDA':
      packageAvailable = capability.torch.available && capability.torch_cuda_available === true;
      cudaRequired = true;
      mode = 'ISOLATED_GPU_WORKER';
      reasons.push('CUDA_CONTEXT_ISOLATED_FROM_FANOUT_THREADS');
      break;
  }

  if (!packageAvailable) reasons.push('REQUIRED_PACKAGE_OR_DEVICE_UNAVAILABLE');
  return PythonWorkerPlanV1Schema.parse({
    schema: 'atlas.python-worker-plan.v1',
    workload: input.workload,
    mode,
    trueParallelPythonThreads: parallel,
    packageAvailable,
    cudaRequired,
    reasonCodes: reasons,
    canonicalWrites: false,
  });
}
