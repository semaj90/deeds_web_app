import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';

type CodecStage = 'protobuf_encode' | 'protobuf_decode' | 'json_stringify' | 'json_parse';
const codecMeasurementSchema = z.object({ calls: z.number().int().nonnegative(),
  failedCalls: z.number().int().nonnegative(), milliseconds: z.number().finite().nonnegative(),
  bytes: z.number().int().nonnegative() }).strict().refine((value) => value.failedCalls <= value.calls);
export const TransportTelemetrySchema = z.object({
  schema: z.literal('atlas.transport-codec-telemetry.v1'), observed_at: z.string().datetime(),
  operation: z.string().max(128).nullable(), measurement_scope: z.literal('CLIENT_CODEC_ONLY'),
  rpc_transport: z.enum(['grpc', 'http']), http_version: z.literal('2').nullable(),
  measurements: z.object({ protobuf_encode: codecMeasurementSchema.nullable(),
    protobuf_decode: codecMeasurementSchema.nullable(), json_stringify: codecMeasurementSchema.nullable(),
    json_parse: codecMeasurementSchema.nullable() }).strict(),
  canonicalAuthority: z.literal(false),
}).strict();
export type TransportTelemetry = z.infer<typeof TransportTelemetrySchema>;

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

export function observeTransport<T extends object>(transport: 'grpc' | 'http', action: () => Promise<T>, operation?: string): Promise<T & { transportTelemetry: TransportTelemetry }>;
export function observeTransport<T>(transport: 'grpc' | 'http', action: () => Promise<T>, operation?: string): Promise<T>;
export async function observeTransport<T>(transport: 'grpc' | 'http', action: () => Promise<T>, operation?: string): Promise<T> {
  const context: TransportTelemetry = {
    schema: 'atlas.transport-codec-telemetry.v1', rpc_transport: transport,
    observed_at: new Date().toISOString(), operation: operation ?? null, measurement_scope: 'CLIENT_CODEC_ONLY',
    http_version: transport === 'grpc' ? '2' : null,
    measurements: { protobuf_encode: null, protobuf_decode: null, json_stringify: null, json_parse: null },
    canonicalAuthority: false,
  };
  return activeTransport.run(context, async () => {
    const result = await action();
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return { ...result, transportTelemetry: context };
    }
    return result;
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
