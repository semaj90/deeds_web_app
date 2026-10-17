/**
 * ACP/MCP Telemetry Collector
 * Unified observability for agentic workflows: routing decisions, tool calls, async ops
 * Used by dispatcher nodes, MCP tools, and LangGraph subagents
 */

import { AcpObservationSchema } from './acp-observation.js';
import type { PacketCentricContext, PacketCentricTelemetryEvent } from './packet-centric-telemetry.js';

export interface AcpTelemetryConfig {
  trace_id?: string | null;
  node_id?: string;
  enable_async_flush?: boolean;
  flush_interval_ms?: number;
  max_buffer_events?: number;
  packet_context?: PacketCentricContext;
}

export interface RoutingDecision {
  decision_type: string;
  confidence: number;
  alternatives: string[];
  selected_path: string;
  metadata?: Record<string, any>;
}

export interface ToolCall {
  tool_name: string;
  params_hash: string;
  execution_time_ms: number;
  status: 'success' | 'failure' | 'timeout';
  error?: string;
  cache_hit?: boolean;
}

export interface AsyncOp {
  op_type: 'postgres.query' | 'redis.get' | 'qdrant.search' | 'neo4j.run' | 'grpc.call' | 'mcp.invoke' | 'dispatcher.node';
  op_name: string;
  execution_time_ms: number;
  status: 'success' | 'failure' | 'timeout';
  error?: string;
}

export interface TelemetryEvent {
  trace_id?: string | null;
  packet_context?: PacketCentricContext;
  timestamp: string;
  node_id?: string;
  routing_decisions: RoutingDecision[];
  tool_calls: ToolCall[];
  async_ops: AsyncOp[];
  latency_ms?: number;
}

/**
 * Collects telemetry events for agentic workflows
 * Tracks routing decisions, tool calls, and async operations
 * Non-blocking: batches events and flushes asynchronously
 */
export class AcpTelemetryCollector {
  private events: TelemetryEvent[] = [];
  private config: Required<Omit<AcpTelemetryConfig, 'packet_context' | 'trace_id'>>;
  private traceId?: string | null;
  private packetContext?: PacketCentricContext;
  private flushPromise?: Promise<void>;
  private droppedEvents = 0;
  private flushTimer?: NodeJS.Timeout;

  constructor(config: AcpTelemetryConfig = {}) {
    this.config = {
      node_id: config.node_id || 'unknown',
      enable_async_flush: config.enable_async_flush ?? true,
      flush_interval_ms: config.flush_interval_ms || 1000,
      max_buffer_events: Math.max(1, Math.min(10000, Math.trunc(config.max_buffer_events ?? 1000) || 1000)),
    };
    this.packetContext = config.packet_context ? { ...config.packet_context } : undefined;
    this.traceId = config.trace_id;

    if (this.config.enable_async_flush) {
      this.startFlushTimer();
    }
  }

  /**
   * Record a routing decision
   */
  recordRoutingDecision(decision: RoutingDecision): void {
    const timestamp = new Date().toISOString();
    const event: TelemetryEvent = {
      timestamp,
      node_id: this.config.node_id,
      routing_decisions: [decision],
      tool_calls: [],
      async_ops: [],
    };
    this.enqueue(event);
  }

  /**
   * Record a tool call
   */
  recordToolCall(toolCall: ToolCall): void {
    const timestamp = new Date().toISOString();
    const event: TelemetryEvent = {
      timestamp,
      node_id: this.config.node_id,
      routing_decisions: [],
      tool_calls: [toolCall],
      async_ops: [],
    };
    this.enqueue(event);
  }

  /**
   * Record an async operation
   */
  recordAsyncOp(asyncOp: AsyncOp): void {
    const timestamp = new Date().toISOString();
    const event: TelemetryEvent = {
      timestamp,
      node_id: this.config.node_id,
      routing_decisions: [],
      tool_calls: [],
      async_ops: [asyncOp],
    };
    this.enqueue(event);
  }

  /**
   * Record multiple events
   */
  recordEvents(events: TelemetryEvent[]): void {
    for (const event of events) this.enqueue(event);
  }

  /**
   * Get accumulated events
   */
  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }

  /**
   * Clear accumulated events
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Flush events to storage
   * This is where you'd implement Redis/Postgres writes
   */
  flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    const batch = this.events.slice(0, 16);
    if (batch.length === 0) return Promise.resolve();
    this.flushPromise = this.flushBatch(batch).finally(() => { this.flushPromise = undefined; });
    return this.flushPromise;
  }

  getDeliveryStatus(): { pending: number; dropped: number } {
    return { pending: this.events.length, dropped: this.droppedEvents };
  }

  private enqueue(event: TelemetryEvent): void {
    this.events.push({ ...event, trace_id: Object.hasOwn(event, 'trace_id') ? event.trace_id : this.traceId,
      packet_context: { ...(event.packet_context ?? this.packetContext) } });
    const overflow = this.events.length - this.config.max_buffer_events;
    if (overflow > 0) {
      this.events.splice(0, overflow);
      this.droppedEvents += overflow;
    }
  }

  private async flushBatch(batch: TelemetryEvent[]): Promise<void> {
    for (const event of batch) {
      try {
        const observation = AcpObservationSchema.parse({ schema: 'atlas.acp-observation.v1', timestamp: event.timestamp,
          trace_id: event.trace_id,
          node_id: event.node_id ?? null, canonicalAuthority: false,
          routing_decisions: event.routing_decisions.map((decision) => ({ decision_type: decision.decision_type,
            selected_path: decision.selected_path, confidence: decision.confidence, alternatives: decision.alternatives })),
          tool_calls: event.tool_calls.map((call) => ({ tool_name: call.tool_name, execution_time_ms: call.execution_time_ms,
            status: call.status, cache_hit: call.cache_hit ?? null })),
          async_ops: event.async_ops.map((operation) => ({ op_type: operation.op_type, op_name: operation.op_name,
            execution_time_ms: operation.execution_time_ms, status: operation.status })),
        });
        const payload: PacketCentricTelemetryEvent = { surface: 'acp', packet_context: event.packet_context,
          trace_id: event.trace_id,
          latency_ms: event.latency_ms, acp_observation: observation };
        const { recordPacketCentricTelemetryAcknowledged } = await import('./packet-centric-telemetry.js');
        if (await recordPacketCentricTelemetryAcknowledged(payload) === true) {
          this.events = this.events.filter((pending) => pending !== event);
        }
      } catch { }
    }
  }

  /**
   * Start periodic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(async () => {
      try {
        await this.flush();
      } catch (err) {
        console.error('[acp-telemetry] Flush error:', err);
      }
    }, this.config.flush_interval_ms);
    this.flushTimer.unref?.();
  }

  /**
   * Stop flush timer
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }
}

/**
 * Analyze telemetry to identify slow operations
 */
export function identifySlowOps(events: TelemetryEvent[], thresholdMs: number = 100): AsyncOp[] {
  const slowOps: AsyncOp[] = [];

  for (const event of events) {
    for (const op of event.async_ops) {
      if (op.execution_time_ms > thresholdMs) {
        slowOps.push(op);
      }
    }
  }

  return slowOps.sort((a, b) => b.execution_time_ms - a.execution_time_ms);
}

/**
 * Aggregate tool call statistics
 */
export function aggregateToolStats(events: TelemetryEvent[]): Record<string, any> {
  const stats: Record<string, { count: number; total_ms: number; success: number }> = {};

  for (const event of events) {
    for (const call of event.tool_calls) {
      if (!stats[call.tool_name]) {
        stats[call.tool_name] = { count: 0, total_ms: 0, success: 0 };
      }

      stats[call.tool_name].count++;
      stats[call.tool_name].total_ms += call.execution_time_ms;
      if (call.status === 'success') {
        stats[call.tool_name].success++;
      }
    }
  }

  // Calculate averages and success rates
  const result: Record<string, any> = {};
  for (const [toolName, data] of Object.entries(stats)) {
    result[toolName] = {
      ...data,
      avg_ms: data.total_ms / data.count,
      success_rate: (data.success / data.count) * 100,
    };
  }

  return result;
}

/**
 * Aggregate async operation statistics
 */
export function aggregateAsyncOpStats(events: TelemetryEvent[]): Record<string, any> {
  const stats: Record<string, { count: number; total_ms: number; success: number }> = {};

  for (const event of events) {
    for (const op of event.async_ops) {
      const key = `${op.op_type}:${op.op_name}`;
      if (!stats[key]) {
        stats[key] = { count: 0, total_ms: 0, success: 0 };
      }

      stats[key].count++;
      stats[key].total_ms += op.execution_time_ms;
      if (op.status === 'success') {
        stats[key].success++;
      }
    }
  }

  const result: Record<string, any> = {};
  for (const [opName, data] of Object.entries(stats)) {
    result[opName] = {
      ...data,
      avg_ms: data.total_ms / data.count,
      success_rate: (data.success / data.count) * 100,
    };
  }

  return result;
}
