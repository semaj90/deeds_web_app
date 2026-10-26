import { z } from 'zod';
import { ValidationSchema } from '$lib/schemas/packet-canonical.js';

export const TelemetryTraceIdSchema = ValidationSchema.shape.trace_id.max(128);

const label = z.string().min(1).max(256);
const duration = z.number().finite().nonnegative();
export const AcpObservationSchema = z.object({
  schema: z.literal('atlas.acp-observation.v1'),
  trace_id: TelemetryTraceIdSchema.nullish(),
  timestamp: z.string().datetime(),
  node_id: label.nullable(),
  routing_decisions: z.array(z.object({ decision_type: label, selected_path: label,
    confidence: z.number().finite().min(0).max(1), alternatives: z.array(label).max(16) }).strict()).max(16),
  tool_calls: z.array(z.object({ tool_name: label, execution_time_ms: duration,
    status: z.enum(['success', 'failure', 'timeout']), cache_hit: z.boolean().nullable() }).strict()).max(16),
  async_ops: z.array(z.object({ op_type: z.enum(['postgres.query', 'redis.get', 'qdrant.search', 'neo4j.run', 'grpc.call', 'mcp.invoke', 'dispatcher.node']),
    op_name: label, execution_time_ms: duration, status: z.enum(['success', 'failure', 'timeout']) }).strict()).max(16),
  canonicalAuthority: z.literal(false),
}).strict();
export type AcpObservation = z.infer<typeof AcpObservationSchema>;

export function validateTelemetryTraceBinding(traceId: unknown, observation?: { trace_id?: string | null }): string | null | undefined {
  const parsed = TelemetryTraceIdSchema.nullish().parse(traceId);
  if (parsed != null && observation?.trace_id != null && parsed !== observation.trace_id) {
    throw new Error('TRACE_CONTEXT_MISMATCH');
  }
  return parsed;
}
