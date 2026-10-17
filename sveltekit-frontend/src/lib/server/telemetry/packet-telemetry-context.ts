import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import { TelemetryTraceIdSchema } from './acp-observation.js';
import type { PacketCentricContext } from './packet-centric-telemetry.js';

const packetContextSchema = z.object({
  packet_id: z.string().max(512).nullish(), source_ref: z.string().max(4096).nullish(),
  feature_id: z.string().max(512).nullish(), som_cell: z.string().max(128).nullish(),
  schema_version: z.number().int().nonnegative().nullish(), embedding_version: z.string().max(256).nullish(),
  tool_version: z.string().max(256).nullish(), gpu_kernel_version: z.string().max(256).nullish(),
  rpc_transport: z.string().max(128).nullish(),
});
export interface PacketTelemetryScope {
  trace_id?: string | null;
  packet_context?: PacketCentricContext | null;
}
const activeContext = new AsyncLocalStorage<Readonly<PacketTelemetryScope>>();

export function getPacketTelemetryContext(): Readonly<PacketTelemetryScope> | undefined {
  return activeContext.getStore();
}

export function withPacketTelemetryContext<Result>(context: PacketTelemetryScope, action: () => Result): Result {
  const parent = activeContext.getStore();
  let snapshot: Readonly<PacketTelemetryScope>;
  try {
    const traceId = context.trace_id === undefined ? parent?.trace_id : TelemetryTraceIdSchema.nullable().parse(context.trace_id);
    const packet = context.packet_context === undefined ? parent?.packet_context
      : context.packet_context === null ? null : packetContextSchema.parse(context.packet_context);
    snapshot = Object.freeze({ trace_id: traceId, packet_context: packet ? Object.freeze({ ...packet }) : packet });
  } catch {
    snapshot = Object.freeze({ trace_id: null, packet_context: null });
  }
  return activeContext.run(snapshot, action);
}
