/**
 * gpu-telemetry.ts — GPU kernel telemetry collection
 *
 * Minimal stub for GPU operation telemetry (kernel_name, duration_ms, error_code, etc.)
 * Logs events for observability without blocking on external services.
 */

import { z } from 'zod';
import type { PacketCentricContext } from './packet-centric-telemetry.js';

export const ResourceOperationObservationSchema = z.object({
  schema: z.literal('atlas.resource-operation.v1'), operation: z.string().min(1).max(128),
  native_export: z.string().min(1).max(128).nullable(), requested_kernel: z.string().max(128).nullable(),
  kernel_name: z.string().max(128).nullable(), kernel_ms: z.number().finite().nonnegative().nullable(),
  wall_ms: z.number().finite().nonnegative(), duration_scope: z.enum(['PIPELINE_WALL_TIME', 'CALLER_WALL_TIME']),
  execution_backend: z.enum(['CPU_REFERENCE', 'NATIVE_EXPORT_UNVERIFIED', 'REMOTE_UNVERIFIED', 'CACHE']),
  reported_backend: z.string().max(128).nullable(), candidate_count: z.number().int().nonnegative().nullable(),
  input_dim: z.number().int().nonnegative().nullable(), output_dim: z.number().int().nonnegative().nullable(),
  canonicalAuthority: z.literal(false),
}).strict();
export type ResourceOperationObservation = z.infer<typeof ResourceOperationObservationSchema>;

export async function recordResourceOperation(observation: ResourceOperationObservation, context?: PacketCentricContext): Promise<void> {
  try {
    const resource = ResourceOperationObservationSchema.parse(observation);
    const { recordPacketCentricTelemetry } = await import('./packet-centric-telemetry.js');
    await recordPacketCentricTelemetry({ latency_ms: resource.wall_ms, surface: 'resource_telemetry',
      packet_context: context ?? { feature_id: `gpu.pipeline.${resource.operation}` }, resource_observation: resource });
  } catch { }
}

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
    const observation = ResourceOperationObservationSchema.parse({
      schema: 'atlas.resource-operation.v1', operation: event.operation, native_export: null,
      requested_kernel: event.kernel_name, kernel_name: null, kernel_ms: null,
      wall_ms: event.duration_ms, duration_scope: 'CALLER_WALL_TIME', execution_backend: 'REMOTE_UNVERIFIED',
      reported_backend: event.gpu_backend, candidate_count: event.candidate_count ?? null,
      input_dim: event.input_dim ?? null, output_dim: event.output_dim ?? null, canonicalAuthority: false,
    });
    await recordResourceOperation(observation);
    // Non-blocking telemetry: log to console in debug mode
    if (process.env.DEBUG_GPU_TELEMETRY) {
      console.log('[GPU_TELEMETRY]', {
        timestamp: new Date().toISOString(),
        observation
      });
    }
    // Future: send to observability backend (Langfuse, Datadog, etc.)
  } catch {
    // Silently ignore telemetry errors (never block on observability)
  }
}
