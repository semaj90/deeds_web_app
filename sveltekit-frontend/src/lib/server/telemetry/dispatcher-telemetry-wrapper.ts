/**
 * Dispatcher Telemetry Wrapper
 * Captures routing decisions, gRPC traces, tool invocations across all 9 dispatcher nodes
 * Non-blocking observation handoff through the existing packet telemetry writer.
 */

import type { Redis } from 'ioredis';
import type { DispatcherState } from '../langgraph/dispatcher-nodes/types.js';
import { AcpTelemetryCollector } from './acp-mcp-telemetry.js';
import { extractPacketContext, recordPacketCentricTelemetry, type PacketCentricContext } from './packet-centric-telemetry.js';
import { AcpObservationSchema } from './acp-observation.js';
import { getPacketTelemetryContext, withPacketTelemetryContext } from './packet-telemetry-context.js';

export interface DispatcherTelemetryEvent {
  trace_id?: string | null;
  packet_context?: PacketCentricContext;
  node_id: string;
  timestamp: string;
  duration_ms: number;
  decision?: string;
  confidence?: number;
  candidates_count?: number;
  error?: string;
  grpc_traces?: Array<{
    service: string;
    method: string;
    duration_ms: number;
    status: string;
    error_class?: string;
  }>;
  tool_calls?: Array<{
    tool_name: string;
    params_hash: string;
    duration_ms: number;
    success: boolean;
    error?: string;
  }>;
  cache_hits?: {
    redis: number;
    qdrant: number;
    neo4j: number;
  };
  routing_metadata?: {
    decision_type: string;
    alternative_paths: string[];
    selected_path: string;
  };
}

export interface DispatcherTelemetryResult {
  redis_written: boolean;
  postgres_deferred: boolean;
  telemetry_event: DispatcherTelemetryEvent;
  redis_key: string;
}

/**
 * Emit telemetry for a dispatcher node
 * Store clients remain compatibility parameters; the existing telemetry writer owns persistence.
 * @param nodeId - Dispatcher node identifier
 * @param state - Current dispatcher state
 * @param redis - ioredis client (for immediate write)
 * @param postgres - Drizzle DB client (for deferred write)
 * @param durationMs - Node execution duration
 * @param metadata - Optional routing/trace metadata
 * @returns Telemetry result with Redis/Postgres status
 */
export async function emitDispatcherTelemetry(
  nodeId: string,
  state: DispatcherState,
  _redis: Redis,
  _postgres: any,
  durationMs: number,
  metadata?: {
    decision?: string;
    confidence?: number;
    grpcTraces?: DispatcherTelemetryEvent['grpc_traces'];
    toolCalls?: DispatcherTelemetryEvent['tool_calls'];
    cacheHits?: DispatcherTelemetryEvent['cache_hits'];
    routingMetadata?: DispatcherTelemetryEvent['routing_metadata'];
    packetContext?: PacketCentricContext;
    executionStatus?: 'success' | 'failure' | 'timeout';
  }
): Promise<DispatcherTelemetryResult> {
  const timestamp = new Date().toISOString();
  const telemetryEvent: DispatcherTelemetryEvent = {
    node_id: nodeId,
    timestamp,
    duration_ms: durationMs,
    trace_id: state.trace_id === undefined ? getPacketTelemetryContext()?.trace_id : state.trace_id,
    packet_context: extractPacketContext({ packet_context: metadata?.packetContext ?? state.packet_context }),
    decision: metadata?.decision ?? state.dispatch_decision,
    confidence: metadata?.confidence ?? state.dispatch_confidence,
    candidates_count: state.candidates?.length || 0,
    grpc_traces: metadata?.grpcTraces,
    tool_calls: metadata?.toolCalls,
    cache_hits: metadata?.cacheHits,
    routing_metadata: metadata?.routingMetadata,
  };

  let postgresDeferred = false;
  try {
    const observation = AcpObservationSchema.parse({ schema: 'atlas.acp-observation.v1', timestamp, node_id: nodeId,
      trace_id: telemetryEvent.trace_id,
      routing_decisions: [{ decision_type: 'dispatcher_route', selected_path: telemetryEvent.decision,
        confidence: telemetryEvent.confidence, alternatives: [] }], tool_calls: [],
      async_ops: [{ op_type: 'dispatcher.node', op_name: nodeId, execution_time_ms: durationMs,
        status: metadata?.executionStatus ?? (state.action === 'failed' ? 'failure' : 'success') }], canonicalAuthority: false });
    queueMicrotask(() => {
      void recordPacketCentricTelemetry({ surface: 'dispatcher', latency_ms: durationMs,
        trace_id: telemetryEvent.trace_id,
        packet_context: telemetryEvent.packet_context, acp_observation: observation }).catch(() => {});
    });
    postgresDeferred = true;
  } catch (err) {
    console.error(`[dispatcher-telemetry] Failed to queue Postgres write:`, err);
  }

  return {
    redis_written: false,
    postgres_deferred: postgresDeferred,
    telemetry_event: telemetryEvent,
    redis_key: '',
  };
}

/**
 * Wrap a dispatcher node handler with telemetry collection
 * Captures execution duration, errors, and optional traces
 * @param nodeId - Dispatcher node identifier
 * @param handler - Original node handler function
 * @param redis - ioredis client
 * @param postgres - Drizzle DB client
 * @returns Wrapped handler that emits telemetry
 */
export function withDispatcherTelemetry(
  nodeId: string,
  handler: (state: DispatcherState) => Promise<DispatcherState>,
  redis: Redis,
  postgres: any
) {
  return async (state: DispatcherState): Promise<DispatcherState> => {
    const startMs = Date.now();
    let failed = false;
    let result = state;

    try {
      result = await withPacketTelemetryContext({ trace_id: state.trace_id, packet_context: state.packet_context }, () => handler(state));
    } catch (err) {
      failed = true;
      throw err;
    } finally {
      const durationMs = Date.now() - startMs;

      // Emit telemetry (non-blocking)
      await emitDispatcherTelemetry(
        nodeId,
        result,
        redis,
        postgres,
        durationMs,
        {
          decision: result.dispatch_decision,
          confidence: result.dispatch_confidence,
          executionStatus: failed ? 'failure' : result.action === 'failed' ? 'failure' : 'success',
        }
      );

      if (failed) {
        console.warn(`[dispatcher-telemetry] Node ${nodeId} failed`);
      }
    }

    return result;
  };
}

/**
 * Create a telemetry collector for a node
 * Captures routing decisions, gRPC traces, tool invocations
 * @param nodeId - Dispatcher node identifier
 * @returns Telemetry collector instance
 */
export function createNodeTelemetryCollector(nodeId: string): AcpTelemetryCollector {
  return new AcpTelemetryCollector({
    node_id: nodeId,
    enable_async_flush: true,
    flush_interval_ms: 1000,
  });
}

/**
 * Aggregate telemetry across all 9 dispatcher nodes
 * Computes p50/p95/p99 latency percentiles
 * @param redis - ioredis client
 * @returns Aggregated metrics across all nodes
 */
export async function aggregateDispatcherTelemetry(redis: Redis) {
  try {
    // Fetch all telemetry keys for dispatcher nodes
    const pattern = 'telemetry:dispatcher:*';
    const keys = await redis.keys(pattern);

    if (keys.length === 0) {
      return {
        total_events: 0,
        nodes: {},
        p50_latency_ms: 0,
        p95_latency_ms: 0,
        p99_latency_ms: 0,
      };
    }

    const telemetryMap = new Map<string, DispatcherTelemetryEvent[]>();
    const allLatencies: number[] = [];

    // Fetch all telemetry events
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const event = JSON.parse(data) as DispatcherTelemetryEvent;
        const nodeId = event.node_id;

        if (!telemetryMap.has(nodeId)) {
          telemetryMap.set(nodeId, []);
        }
        telemetryMap.get(nodeId)!.push(event);
        allLatencies.push(event.duration_ms);
      }
    }

    // Calculate percentiles
    allLatencies.sort((a, b) => a - b);
    const p50Idx = Math.floor(allLatencies.length * 0.5);
    const p95Idx = Math.floor(allLatencies.length * 0.95);
    const p99Idx = Math.floor(allLatencies.length * 0.99);

    // Aggregate per node
    const nodeMetrics: Record<string, any> = {};
    for (const [nodeId, events] of telemetryMap) {
      const latencies = events.map((e) => e.duration_ms);
      latencies.sort((a, b) => a - b);

      nodeMetrics[nodeId] = {
        event_count: events.length,
        avg_duration_ms: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        p50_ms: latencies[Math.floor(latencies.length * 0.5)],
        p95_ms: latencies[Math.floor(latencies.length * 0.95)],
        p99_ms: latencies[Math.floor(latencies.length * 0.99)],
        max_duration_ms: Math.max(...latencies),
        min_duration_ms: Math.min(...latencies),
      };
    }

    return {
      total_events: allLatencies.length,
      nodes: nodeMetrics,
      p50_latency_ms: allLatencies[p50Idx] || 0,
      p95_latency_ms: allLatencies[p95Idx] || 0,
      p99_latency_ms: allLatencies[p99Idx] || 0,
    };
  } catch (err) {
    console.error('[dispatcher-telemetry] Aggregation failed:', err);
    return {
      total_events: 0,
      nodes: {},
      p50_latency_ms: 0,
      p95_latency_ms: 0,
      p99_latency_ms: 0,
    };
  }
}
