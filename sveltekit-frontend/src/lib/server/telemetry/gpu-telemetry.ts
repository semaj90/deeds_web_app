/**
 * gpu-telemetry.ts — GPU kernel telemetry collection
 *
 * Validated resource observations forwarded to the existing packet telemetry owner.
 * Caller wall time and requested kernels are not proof of CUDA kernel execution.
 */

import { z } from 'zod';
import type { PacketCentricContext } from './packet-centric-telemetry.js';
import { getPacketTelemetryContext } from './packet-telemetry-context.js';
import { TelemetryTraceIdSchema, validateTelemetryTraceBinding } from './acp-observation.js';

const ComputeOperationObservationSchema = z.object({
  trace_id: TelemetryTraceIdSchema.nullish(),
  schema: z.literal('atlas.resource-operation.v1'), operation: z.string().min(1).max(128),
  native_export: z.string().min(1).max(128).nullable(), requested_kernel: z.string().max(128).nullable(),
  kernel_name: z.null(), kernel_ms: z.null(),
  wall_ms: z.number().finite().nonnegative(), duration_scope: z.enum(['PIPELINE_WALL_TIME', 'CALLER_WALL_TIME']),
  execution_backend: z.enum(['CPU_REFERENCE', 'NATIVE_EXPORT_UNVERIFIED', 'REMOTE_UNVERIFIED', 'CACHE']),
  reported_backend: z.string().max(128).nullable(), candidate_count: z.number().int().nonnegative().nullable(),
  input_dim: z.number().int().nonnegative().nullable(), output_dim: z.number().int().nonnegative().nullable(),
  canonicalAuthority: z.literal(false),
}).strict();
export const StoreOperationObservationSchema = z.object({
  trace_id: TelemetryTraceIdSchema.nullish(),
  schema: z.literal('atlas.store-operation.v1'),
  service: z.enum(['redis', 'qdrant', 'neo4j']),
  operation: z.enum(['get', 'hgetall', 'hmget', 'points_query', 'read_query']),
  observed_at: z.string().datetime(),
  wall_ms: z.number().finite().nonnegative(),
  duration_scope: z.literal('CLIENT_REQUEST_WALL_TIME'),
  outcome: z.enum(['RETURNED', 'THREW']),
  kernel_name: z.null(), kernel_ms: z.null(),
  canonicalAuthority: z.literal(false),
}).strict().refine((observation) => {
  if (observation.service === 'redis') return ['get', 'hgetall', 'hmget'].includes(observation.operation);
  return observation.operation === (observation.service === 'qdrant' ? 'points_query' : 'read_query');
});
export const ResourceOperationObservationSchema = z.union([ComputeOperationObservationSchema, StoreOperationObservationSchema]);
export type ResourceOperationObservation = z.infer<typeof ResourceOperationObservationSchema>;
type StoreOperationObservation = z.infer<typeof StoreOperationObservationSchema>;

export async function observeStoreRequest<Result>(
  service: StoreOperationObservation['service'],
  operation: StoreOperationObservation['operation'],
  request: () => Promise<Result>,
  context?: PacketCentricContext,
): Promise<Result> {
  const observedAt = new Date().toISOString();
  const started = performance.now();
  let outcome: StoreOperationObservation['outcome'] = 'THREW';
  try {
    const result = await request();
    outcome = 'RETURNED';
    return result;
  } finally {
    void recordResourceOperation({ schema: 'atlas.store-operation.v1', service, operation,
      observed_at: observedAt, wall_ms: performance.now() - started, duration_scope: 'CLIENT_REQUEST_WALL_TIME',
      outcome, kernel_name: null, kernel_ms: null, canonicalAuthority: false }, context);
  }
}

let packetTelemetryModule: Promise<typeof import('./packet-centric-telemetry.js')> | undefined;

export async function recordResourceOperation(observation: ResourceOperationObservation, context?: PacketCentricContext): Promise<void> {
  try {
    const scope = getPacketTelemetryContext();
    validateTelemetryTraceBinding(scope?.trace_id, observation);
    const resource = ResourceOperationObservationSchema.parse({ ...observation,
      trace_id: observation.trace_id === undefined ? scope?.trace_id : observation.trace_id });
    packetTelemetryModule ??= import('./packet-centric-telemetry.js').catch((error) => {
      packetTelemetryModule = undefined;
      throw error;
    });
    const { recordPacketCentricTelemetry } = await packetTelemetryModule;
    await recordPacketCentricTelemetry({ latency_ms: resource.wall_ms, surface: 'resource_telemetry',
      trace_id: resource.trace_id,
      packet_context: context ?? scope?.packet_context ?? { feature_id: resource.schema === 'atlas.store-operation.v1'
        ? `resource.${resource.service}.${resource.operation}` : `gpu.pipeline.${resource.operation}` }, resource_observation: resource });
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
    void recordResourceOperation(observation);
    // Non-blocking telemetry: log to console in debug mode
    if (process.env.DEBUG_GPU_TELEMETRY) {
      console.log('[GPU_TELEMETRY]', {
        timestamp: new Date().toISOString(),
        observation
      });
    }
  } catch {
    // Silently ignore telemetry errors (never block on observability)
  }
}
