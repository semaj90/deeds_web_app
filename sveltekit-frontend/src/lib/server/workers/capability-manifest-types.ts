/**
 * TypeScript types for Python runtime capability manifests.
 *
 * The control plane:
 *   1. Receives manifests from workers (via POST /api/runtime/capability-probe)
 *   2. Validates with pythonRuntimeCapabilityManifestSchema
 *   3. Upserts into runtime_capability_manifests (Postgres)
 *   4. Routes tasks by querying the manifest JSONB (see CapabilityRoutingRequest)
 *
 * Route by capability flags, NEVER by Python version strings or queue names
 * like "python314t". The manifest shape encodes the user's corrections:
 *   - pyGilDisabledRaw  = sysconfig.get_config_var('Py_GIL_DISABLED') [build-time]
 *   - gilEnabled        = sys._is_gil_enabled() [runtime]
 *   - freeThreadingActive = freeThreadedBuild AND gilEnabled == False [derived routing signal]
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// GIL state (raw probe values + derived routing signal)
// ---------------------------------------------------------------------------

export const gilStateSchema = z.object({
  pyGilDisabledRaw: z.boolean(),
  freeThreadedBuild: z.boolean(),
  gilProbeAvailable: z.boolean(),
  gilEnabled: z.boolean().nullable(),
  // Derived routing signal: freeThreadedBuild AND gilEnabled === false
  freeThreadingActive: z.boolean(),
});

// ---------------------------------------------------------------------------
// Extension probe result
// ---------------------------------------------------------------------------

export const extensionProbeSchema = z.object({
  available: z.boolean(),
  version: z.string().nullable(),
  gilReenabledOnImport: z.boolean().optional(),
  error: z.string().nullable(),
});

export const torchProbeSchema = extensionProbeSchema.extend({
  cudaAvailable: z.boolean().optional(),
  cudaDeviceCount: z.number().int().optional(),
  freeThreadedSupport: z.boolean().optional(),
});

export const rapidsProbeSchema = z.object({
  available: z.boolean(),
  cudf: z.boolean(),
  cugraph: z.boolean(),
  cuvs: z.boolean(),
  skippedReason: z.string().nullable(),
  error: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Capability flags — what the control plane routes on
// ---------------------------------------------------------------------------

export const capabilityFlagsSchema = z.object({
  // CPU NLP with free-threaded parallelism (spaCy + numpy + GIL disabled)
  cpuNlpParallelThreads: z.boolean(),
  // CPU NLP via process pool (spaCy + numpy, any GIL state)
  cpuNlpProcessPool: z.boolean(),
  // GPU compute via PyTorch CUDA
  gpuTorch: z.boolean(),
  // RAPIDS GPU analytics (Linux/WSL2 only)
  rapidsGpu: z.boolean(),
  // HuggingFace transformers available
  transformers: z.boolean(),
  // Free-threaded execution (the capability, not the Python version)
  freeThreadedExecution: z.boolean(),
});

// ---------------------------------------------------------------------------
// Full manifest schema
// ---------------------------------------------------------------------------

export const pythonRuntimeCapabilityManifestSchema = z.object({
  schemaVersion: z.string(),
  probeId: z.string().uuid(),
  probedAt: z.string().datetime(),
  hostId: z.string(),
  environment: z.enum(['wsl2', 'linux', 'windows_native', 'linux_container']),
  python: z.object({
    version: z.string(),
    implementation: z.string(),
    inWsl2: z.boolean(),
  }),
  gilState: gilStateSchema,
  extensions: z.object({
    numpy: extensionProbeSchema,
    torch: torchProbeSchema,
    rapids: rapidsProbeSchema,
    spacy: extensionProbeSchema,
    transformers: extensionProbeSchema,
  }),
  capabilities: capabilityFlagsSchema,
  constraints: z.array(z.string()),
});

export type PythonRuntimeCapabilityManifest = z.infer<
  typeof pythonRuntimeCapabilityManifestSchema
>;

// ---------------------------------------------------------------------------
// Task routing request — what a caller provides to select a worker lane
// ---------------------------------------------------------------------------

export interface CapabilityRoutingRequest {
  // Does this task require CPU NLP work?
  cpuNlp: boolean;
  // Prefer free-threaded execution if available (soft preference)
  freeThreadingPreferred: boolean;
  // Require free-threaded execution (hard gate — fail if unavailable)
  freeThreadingRequired: boolean;
  // Require GPU (torch CUDA)
  gpuRequired: boolean;
  // Require RAPIDS GPU analytics
  rapidsRequired: boolean;
}

// ---------------------------------------------------------------------------
// Selected execution lane
// ---------------------------------------------------------------------------

export type SelectedLane =
  | 'python_free_threaded'   // freeThreadingActive = true, cpuNlpParallelThreads = true
  | 'python_process_pool'    // cpuNlpProcessPool = true, freeThreadingActive = false
  | 'go_preprocessing'       // lightweight Go sidecar (no Python needed)
  | 'typescript_inline';     // in-process TypeScript (trivial work only)

// ---------------------------------------------------------------------------
// Analytics event types emitted by the routing layer
// ---------------------------------------------------------------------------

export interface RuntimeCapabilityProbedEvent {
  type: 'runtime.capability.probed';
  runtimeId: string;
  runtimeClass: string;
  hostId: string;
  environment: string;
  freeThreadingActive: boolean;
  capabilities: Record<string, boolean>;
  probedAt: string;
}

export interface RuntimeTaskRoutedEvent {
  type: 'runtime.task.routed';
  taskId: string;
  commandType: string;
  selectedLane: SelectedLane;
  runtimeId: string;
  freeThreadingActive: boolean;
  routedAt: string;
}

export interface RuntimeTaskFallbackSelectedEvent {
  type: 'runtime.task.fallback_selected';
  taskId: string;
  commandType: string;
  requestedLane: SelectedLane;
  fallbackLane: SelectedLane;
  reason: string;
  routedAt: string;
}
