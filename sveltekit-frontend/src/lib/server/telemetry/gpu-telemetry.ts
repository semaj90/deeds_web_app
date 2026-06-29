/**
 * gpu-telemetry.ts — GPU kernel telemetry collection
 *
 * Minimal stub for GPU operation telemetry (kernel_name, duration_ms, error_code, etc.)
 * Logs events for observability without blocking on external services.
 */

export interface GpuTelemetryEvent {
  kernel_name: string;
  gpu_backend: string;
  operation: string;
  candidate_count?: number;
  input_dim?: number;
  output_dim?: number;
  fallback_used?: boolean;
  error_code?: string;
  duration_ms: number;
  rpc_transport?: string;
  [key: string]: unknown;
}

/**
 * Emit GPU telemetry event (non-blocking)
 */
export async function emitTelemetry(event: GpuTelemetryEvent): Promise<void> {
  try {
    // Non-blocking telemetry: log to console in debug mode
    if (process.env.DEBUG_GPU_TELEMETRY) {
      console.log('[GPU_TELEMETRY]', {
        timestamp: new Date().toISOString(),
        ...event
      });
    }
    // Future: send to observability backend (Langfuse, Datadog, etc.)
  } catch {
    // Silently ignore telemetry errors (never block on observability)
  }
}
