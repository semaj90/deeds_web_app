import { describe, expect, it } from 'vitest';
import { planPythonWorker, type PythonRuntimeCapabilityV1 } from './python-worker-capability.js';

function capability(overrides: Partial<PythonRuntimeCapabilityV1> = {}): PythonRuntimeCapabilityV1 {
  return {
    schema: 'atlas.python-runtime-capability.v1',
    implementation: 'CPython',
    python_version: '3.14.0',
    executable: '/usr/bin/python3.14t',
    abi_flags: 't',
    free_thread_build: true,
    gil_enabled_before_imports: false,
    gil_enabled_after_imports: false,
    gil_reenabled_by_extension_import: false,
    networkx: { available: true, version: '3.x', import_error: null },
    torch: { available: true, version: '2.x', import_error: null },
    qdrant_client: { available: true, version: '1.x', import_error: null },
    neo4j: { available: true, version: '6.x', import_error: null },
    torch_cuda_available: true,
    torch_cuda_device_count: 1,
    executor_hints: {},
    ...overrides,
  };
}

describe('Python worker planning', () => {
  it('uses threads for CPU NetworkX only when post-import GIL state proves free threading', () => {
    expect(planPythonWorker({ capability: capability(), workload: 'NETWORKX_CPU_GRAPH' }).mode).toBe('THREAD_POOL');
    expect(planPythonWorker({
      capability: capability({ gil_enabled_after_imports: true, gil_reenabled_by_extension_import: true }),
      workload: 'NETWORKX_CPU_GRAPH',
    }).mode).toBe('PROCESS_POOL');
  });

  it('keeps Qdrant and Neo4j fanout on asyncio', () => {
    expect(planPythonWorker({ capability: capability(), workload: 'QDRANT_IO_FANOUT' }).mode).toBe('ASYNCIO_SINGLE_LOOP');
    expect(planPythonWorker({ capability: capability(), workload: 'NEO4J_IO_FANOUT' }).mode).toBe('ASYNCIO_SINGLE_LOOP');
  });

  it('isolates PyTorch CUDA work from fanout threads', () => {
    const plan = planPythonWorker({ capability: capability(), workload: 'PYTORCH_CUDA' });
    expect(plan.mode).toBe('ISOLATED_GPU_WORKER');
    expect(plan.cudaRequired).toBe(true);
  });
});
