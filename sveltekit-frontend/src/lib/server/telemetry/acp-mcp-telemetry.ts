/**
 * ACP/MCP Telemetry Collector
 * Unified observability for agentic workflows: routing decisions, tool calls, async ops
 * Used by dispatcher nodes, MCP tools, and LangGraph subagents
 */

export interface AcpTelemetryConfig {
  node_id?: string;
  enable_async_flush?: boolean;
  flush_interval_ms?: number;
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
  op_type: 'postgres.query' | 'redis.get' | 'qdrant.search' | 'neo4j.run' | 'grpc.call' | 'mcp.invoke';
  op_name: string;
  execution_time_ms: number;
  status: 'success' | 'failure' | 'timeout';
  error?: string;
}

export interface TelemetryEvent {
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
  private config: Required<AcpTelemetryConfig>;
  private flushTimer?: NodeJS.Timeout;

  constructor(config: AcpTelemetryConfig = {}) {
    this.config = {
      node_id: config.node_id || 'unknown',
      enable_async_flush: config.enable_async_flush ?? true,
      flush_interval_ms: config.flush_interval_ms || 1000,
    };

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
    this.events.push(event);
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
    this.events.push(event);
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
    this.events.push(event);
  }

  /**
   * Record multiple events
   */
  recordEvents(events: TelemetryEvent[]): void {
    this.events.push(...events);
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
  async flush(): Promise<void> {
    if (this.events.length === 0) {
      return;
    }

    // In real implementation, write to Redis/Postgres here
    // For now, just clear the buffer
    this.events = [];
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
