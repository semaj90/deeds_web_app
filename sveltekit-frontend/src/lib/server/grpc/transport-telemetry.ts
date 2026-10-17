import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import type { RpcCacheResult } from '$lib/types/rpc-cache.js';
import { TelemetryTraceIdSchema, validateTelemetryTraceBinding } from '../telemetry/acp-observation.js';
import { getPacketTelemetryContext } from '../telemetry/packet-telemetry-context.js';

type CodecStage = 'protobuf_encode' | 'protobuf_decode' | 'json_stringify' | 'json_parse';
const codecMeasurementSchema = z.object({ calls: z.number().int().nonnegative(),
  failedCalls: z.number().int().nonnegative(), milliseconds: z.number().finite().nonnegative(),
  bytes: z.number().int().nonnegative() }).strict().refine((value) => value.failedCalls <= value.calls);
export const TransportTelemetrySchema = z.object({
  trace_id: TelemetryTraceIdSchema.nullish(),
  schema: z.literal('atlas.transport-codec-telemetry.v1'), observed_at: z.string().datetime(),
  operation: z.string().max(128).nullable(), measurement_scope: z.literal('CLIENT_CODEC_ONLY'),
  rpc_transport: z.enum(['grpc', 'http']), http_version: z.literal('2').nullable(),
  attempt_outcome: z.enum(['RETURNED', 'NO_RESULT', 'THREW']).optional(),
  measurements: z.object({ protobuf_encode: codecMeasurementSchema.nullable(),
    protobuf_decode: codecMeasurementSchema.nullable(), json_stringify: codecMeasurementSchema.nullable(),
    json_parse: codecMeasurementSchema.nullable() }).strict(),
  canonicalAuthority: z.literal(false),
}).strict();
export type TransportTelemetry = z.infer<typeof TransportTelemetrySchema>;

export const RetrievalDeliveryTelemetrySchema = z.object({
  trace_id: TelemetryTraceIdSchema.nullish(),
  schema: z.literal('atlas.retrieval-delivery.v1'),
  delivered_at: z.string().datetime(),
  source: z.enum(['L1_REDIS', 'COMPUTE_RETURN']),
  origin_transport_telemetry: TransportTelemetrySchema.nullable(),
  canonicalAuthority: z.literal(false),
}).strict();
export type RetrievalDeliveryTelemetry = z.infer<typeof RetrievalDeliveryTelemetrySchema>;

export function annotateRetrievalDelivery<Result extends readonly unknown[]>(result: RpcCacheResult<Result>): Result;
export function annotateRetrievalDelivery<Result extends object>(result: RpcCacheResult<Result>): Omit<Result, 'transportTelemetry'> & { transportTelemetry?: TransportTelemetry; deliveryTelemetry: RetrievalDeliveryTelemetry };
export function annotateRetrievalDelivery<Result>(result: RpcCacheResult<Result>): Result;
export function annotateRetrievalDelivery(result: RpcCacheResult<unknown>): unknown {
  if (!result.value || typeof result.value !== 'object' || Array.isArray(result.value)) return result.value;
  const { transportTelemetry, ...payload } = result.value as Record<string, unknown>;
  const parsed = TransportTelemetrySchema.safeParse(transportTelemetry);
  const origin = parsed.success ? parsed.data : null;
  return {
    ...payload,
    ...(!result.cache.hit && origin ? { transportTelemetry: origin } : {}),
    deliveryTelemetry: RetrievalDeliveryTelemetrySchema.parse({
      schema: 'atlas.retrieval-delivery.v1', delivered_at: new Date().toISOString(),
      trace_id: getPacketTelemetryContext()?.trace_id,
      source: result.cache.hit ? 'L1_REDIS' : 'COMPUTE_RETURN',
      origin_transport_telemetry: origin, canonicalAuthority: false,
    }),
  };
}

const activeTransport = new AsyncLocalStorage<TransportTelemetry>();
const instrumented = new WeakSet<object>();

export function measureTransportCodec<T>(stage: CodecStage, operation: () => T, byteLength: (value: T) => number): T {
  const context = activeTransport.getStore();
  if (!context) return operation();
  const metric = context.measurements[stage] ?? { calls: 0, failedCalls: 0, milliseconds: 0, bytes: 0 };
  context.measurements[stage] = metric;
  metric.calls++;
  const started = performance.now();
  let value: T;
  try {
    value = operation();
  } catch (error) {
    metric.failedCalls++;
    throw error;
  } finally {
    metric.milliseconds += performance.now() - started;
  }
  metric.bytes += byteLength(value);
  return value;
}

type TransportFailureObserver = (observation: TransportTelemetry) => void | Promise<void>;
let packetTelemetryModule: Promise<typeof import('../telemetry/packet-centric-telemetry.js')> | undefined;

export async function recordFailedTransportAttempt(observation: TransportTelemetry): Promise<void> {
  try {
    const telemetry = TransportTelemetrySchema.parse(observation);
    if (telemetry.attempt_outcome !== 'NO_RESULT' && telemetry.attempt_outcome !== 'THREW') return;
    const scope = getPacketTelemetryContext();
    validateTelemetryTraceBinding(scope?.trace_id, telemetry);
    packetTelemetryModule ??= import('../telemetry/packet-centric-telemetry.js').catch((error) => {
      packetTelemetryModule = undefined;
      throw error;
    });
    const { recordPacketCentricTelemetry } = await packetTelemetryModule;
    await recordPacketCentricTelemetry({ surface: 'retrieval_transport_failure', transport_telemetry: telemetry,
      trace_id: telemetry.trace_id,
      packet_context: { ...scope?.packet_context, rpc_transport: telemetry.rpc_transport } });
  } catch { }
}

export function observeTransport<T extends object>(transport: 'grpc' | 'http', action: () => Promise<T>, operation?: string, onFailure?: TransportFailureObserver): Promise<T & { transportTelemetry: TransportTelemetry }>;
export function observeTransport<T>(transport: 'grpc' | 'http', action: () => Promise<T>, operation?: string, onFailure?: TransportFailureObserver): Promise<T>;
export async function observeTransport<T>(transport: 'grpc' | 'http', action: () => Promise<T>, operation?: string, onFailure?: TransportFailureObserver): Promise<T> {
  const context: TransportTelemetry = {
    trace_id: getPacketTelemetryContext()?.trace_id,
    schema: 'atlas.transport-codec-telemetry.v1', rpc_transport: transport,
    observed_at: new Date().toISOString(), operation: operation ?? null, measurement_scope: 'CLIENT_CODEC_ONLY',
    http_version: transport === 'grpc' ? '2' : null,
    measurements: { protobuf_encode: null, protobuf_decode: null, json_stringify: null, json_parse: null },
    canonicalAuthority: false,
  };
  return activeTransport.run(context, async () => {
    try {
      const result = await action();
      context.attempt_outcome = result == null ? 'NO_RESULT' : 'RETURNED';
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        return { ...result, transportTelemetry: context };
      }
      return result;
    } catch (error) {
      context.attempt_outcome = 'THREW';
      throw error;
    } finally {
      if (onFailure && context.attempt_outcome !== 'RETURNED') {
        try { void Promise.resolve(onFailure(TransportTelemetrySchema.parse(context))).catch(() => {}); } catch { }
      }
    }
  });
}

export function instrumentGrpcPackageCodecs(packageDefinition: Record<string, unknown>): void {
  for (const definition of Object.values(packageDefinition)) {
    if (!definition || typeof definition !== 'object') continue;
    for (const entry of Object.values(definition)) {
      if (!entry || typeof entry !== 'object' || instrumented.has(entry)) continue;
      const method = entry as Record<string, unknown>;
      for (const [property, stage] of [['requestSerialize', 'protobuf_encode'], ['responseDeserialize', 'protobuf_decode']] as const) {
        const original = method[property];
        if (typeof original !== 'function') continue;
        method[property] = function (this: unknown, ...args: unknown[]) {
          return measureTransportCodec(stage, () => original.apply(this, args), (value) => {
            const bytes = stage === 'protobuf_encode' ? value : args[0];
            return ArrayBuffer.isView(bytes) ? bytes.byteLength : 0;
          });
        };
      }
      instrumented.add(entry);
    }
  }
}
