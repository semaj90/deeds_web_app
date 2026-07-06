/**
 * Dispatcher Telemetry Wrapper
 * Captures routing decisions, gRPC traces, tool invocations across all 9 dispatcher nodes
 * Non-blocking emission: Redis sync (<5ms) + Postgres deferred via queueMicrotask
 */

import type { Redis } from 'ioredis';
import type { DispatcherState } from '../langgraph/dispatcher-nodes/types.js';
import { AcpTelemetryCollector } from './acp-mcp-telemetry.js';
import { pool } from '../db/client.js';

export interface DispatcherTelemetryEvent {
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
 * Redis write is synchronous (<5ms); Postgres write is deferred via queueMicrotask (non-blocking)
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
  redis: Redis,
  postgres: any,
  durationMs: number,
  metadata?: {
    decision?: string;
    confidence?: number;
    grpcTraces?: DispatcherTelemetryEvent['grpc_traces'];
    toolCalls?: DispatcherTelemetryEvent['tool_calls'];
    cacheHits?: DispatcherTelemetryEvent['cache_hits'];
    routingMetadata?: DispatcherTelemetryEvent['routing_metadata'];
  }
): Promise<DispatcherTelemetryResult> {
  const timestamp = new Date().toISOString();
  const telemetryEvent: DispatcherTelemetryEvent = {
    node_id: nodeId,
    timestamp,
    duration_ms: durationMs,
    decision: metadata?.decision || state.dispatch_decision,
    confidence: metadata?.confidence || state.dispatch_confidence,
    candidates_count: state.candidates?.length || 0,
    grpc_traces: metadata?.grpcTraces,
    tool_calls: metadata?.toolCalls,
    cache_hits: metadata?.cacheHits,
    routing_metadata: metadata?.routingMetadata,
  };

  const redisKey = `telemetry:dispatcher:${nodeId}:${Date.now()}`;

  // ────────────────────────────────────────────────────────────
  // STEP 1: Write to Redis immediately (sync, <5ms)
  // ────────────────────────────────────────────────────────────
  let redisWritten = false;
  try {
    await redis.setex(
      redisKey,
      86400, // 24-hour TTL
      JSON.stringify(telemetryEvent)
    );
    redisWritten = true;
  } catch (err) {
    console.error(`[dispatcher-telemetry] Redis write failed for ${redisKey}:`, err);
  }

  // ────────────────────────────────────────────────────────────
  // STEP 2: Defer Postgres write via queueMicrotask (non-blocking)
  // ────────────────────────────────────────────────────────────
  let postgresDeferred = false;
  try {
    queueMicrotask(async () => {
      try {
        // Write to acp_telemetry table (schema assumed from ACP spec)
        // This is deferred, so it doesn't block the node handler
        await postgres.run(`
          INSERT INTO acp_telemetry (
            node_id,
            event_type,
            timestamp,
            duration_ms,
            payload
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT DO NOTHING
        `, [
          nodeId,
          'dispatcher_node_execution',
          timestamp,
          durationMs,
          JSON.stringify(telemetryEvent)
        ]);
      } catch (pgErr) {
        // Non-blocking: log but don't propagate
        console.error(`[dispatcher-telemetry] Postgres deferred write failed:`, pgErr);
      }
    });
    postgresDeferred = true;
  } catch (err) {
    console.error(`[dispatcher-telemetry] Failed to queue Postgres write:`, err);
  }

  return {
    redis_written: redisWritten,
    postgres_deferred: postgresDeferred,
    telemetry_event: telemetryEvent,
    redis_key: redisKey,
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
    let error: string | undefined;
    let result = state;

    try {
      result = await handler(state);
    } catch (err) {
      error = String(err);
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
        }
      );

      if (error) {
        console.warn(`[dispatcher-telemetry] Node ${nodeId} error: ${error}`);
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
