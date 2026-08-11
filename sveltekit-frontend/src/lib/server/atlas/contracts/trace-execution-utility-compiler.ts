/**
 * Trace Execution Utility Compiler — Single Aggregation Owner for trace_packet_events
 *
 * Sole owner responsible for querying trace_packet_events and compiling execution_utility.
 * Output is passed downstream to FeatureVector5 materializers.
 */

export interface TracePacketEvent {
  event_id: string;
  packet_key: string;
  event_kind: 'execution_success' | 'execution_failure' | 'retrieval_hit' | 'cache_miss';
  latency_ms: number;
  utility_score: number; // 0.0 to 1.0
  recorded_at: string;
}

export interface CompiledExecutionUtility {
  packet_key: string;
  execution_utility: number | null; // null if no trace events exist
  event_count: number;
  presence: boolean;
}

export function compileExecutionUtility(
  packetKey: string,
  events: TracePacketEvent[]
): CompiledExecutionUtility {
  const packetEvents = events.filter((e) => e.packet_key === packetKey);
  if (packetEvents.length === 0) {
    return {
      packet_key: packetKey,
      execution_utility: null,
      event_count: 0,
      presence: false,
    };
  }

  const sumScore = packetEvents.reduce((sum, e) => sum + e.utility_score, 0);
  const avgUtility = sumScore / packetEvents.length;

  return {
    packet_key: packetKey,
    execution_utility: avgUtility,
    event_count: packetEvents.length,
    presence: true,
  };
}
