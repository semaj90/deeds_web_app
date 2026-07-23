import { z } from 'zod';

// ---------------------------------------------------------------------------
// Extension probe shape — mirrors the Python dataclass
// ---------------------------------------------------------------------------

export const extensionCompatibilitySchema = z.object({
  status: z.enum(['pass', 'fail', 'not_installed', 'not_applicable', 'degraded']),
  version: z.string().nullable().optional(),
  import_passed: z.boolean(),
  gil_enabled_after_import: z.boolean().nullable().optional(),
  parallel_smoke_passed: z.boolean().nullable().optional(),
  reason: z.string().nullable().optional(),
});

export type ExtensionCompatibility = z.infer<typeof extensionCompatibilitySchema>;

// ---------------------------------------------------------------------------
// Full Python runtime capability manifest
// ---------------------------------------------------------------------------

export const pythonRuntimeCapabilityManifestSchema = z.object({
  schemaVersion: z.literal('1.0'),
  platform: z.object({
    os: z.string(),
    release: z.string(),
    architecture: z.string(),
  }),
  environment: z.enum(['wsl2', 'linux', 'windows_native', 'linux_container']),
  python: z.object({
    version: z.string(),
    implementation: z.string(),
    executable: z.string(),
    abiFlags: z.string(),
  }),
  // Raw probe values — preserved for audit; do NOT route on these directly
  pyGilDisabledRaw: z.unknown(),
  freeThreadedBuild: z.boolean(),
  gilProbeAvailable: z.boolean(),
  gilEnabled: z.boolean().nullable(),
  // The derived fact that matters for routing
  freeThreadingActive: z.boolean(),
  extensions: z.object({
    numpy: extensionCompatibilitySchema,
    spacy: extensionCompatibilitySchema,
    torch: extensionCompatibilitySchema,
    rapids: extensionCompatibilitySchema,
    onnxruntime: extensionCompatibilitySchema,
  }),
  // Capabilities the control plane routes on — derived from probed facts
  capabilities: z.object({
    cpuNlpParallelThreads: z.boolean(),
    torchFreeThreadedExperimental: z.boolean(),
    rapidsGpuGraph: z.boolean(),
    rapidsGpuAnn: z.boolean(),
  }),
  constraints: z.array(z.string()),
});

export type PythonRuntimeCapabilityManifest = z.infer<typeof pythonRuntimeCapabilityManifestSchema>;

// ---------------------------------------------------------------------------
// Task routing request — what callers ask for; control plane resolves the lane
// ---------------------------------------------------------------------------

export interface CapabilityRoutingRequest {
  taskId: string;
  requestedCapabilities: {
    cpuNlp?: boolean;
    freeThreadingPreferred?: boolean;
    // freeThreadingRequired: true blocks on missing capability — use sparingly
    freeThreadingRequired?: boolean;
    rapidsGpuGraph?: boolean;
    rapidsGpuAnn?: boolean;
  };
}

export type SelectedLane =
  | 'python_free_threaded'   // freeThreadingActive + validated extensions
  | 'python_process_pool'    // standard CPython, process-isolated
  | 'go_preprocessing'       // Go retrieval fan-out
  | 'typescript_inline';     // TypeScript control plane (lightweight)

export interface CapabilityRoutingDecision {
  taskId: string;
  selectedLane: SelectedLane;
  fallbackLane: SelectedLane | null;
  runtimeId: string;
  freeThreadedBuild: boolean;
  gilEnabled: boolean | null;
  freeThreadingActive: boolean;
  extensionSetHash: string;
  manifestVersion: string;
}

// ---------------------------------------------------------------------------
// Analytics event payloads for capability routing (emitted to analytics_events)
// ---------------------------------------------------------------------------

export interface RuntimeCapabilityProbedEvent {
  eventType: 'runtime.capability_probed';
  runtimeId: string;
  runtimeClass: string;
  freeThreadingActive: boolean;
  gilEnabled: boolean | null;
  capabilitiesHash: string;
}

export interface RuntimeTaskRoutedEvent {
  eventType: 'runtime.task_routed';
  runtimeId: string;
  taskId: string;
  requestedCapabilities: CapabilityRoutingRequest['requestedCapabilities'];
  selectedLane: SelectedLane;
  fallbackLane: SelectedLane | null;
  freeThreadedBuild: boolean;
  gilEnabled: boolean | null;
  extensionSetHash: string;
  manifestVersion: string;
}

export interface RuntimeTaskFallbackSelectedEvent {
  eventType: 'runtime.task_fallback_selected';
  runtimeId: string;
  taskId: string;
  requestedLane: SelectedLane;
  selectedLane: SelectedLane;
  reason: string;
}
