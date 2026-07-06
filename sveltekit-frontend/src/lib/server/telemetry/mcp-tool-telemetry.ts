/**
 * MCP Tool Telemetry Integration
 * Wraps MCP tool handlers to emit telemetry via AcpTelemetryCollector
 *
 * Pattern: Tool execution → emit routing decision → record async ops → flush telemetry
 */

import { AcpTelemetryCollector } from './acp-mcp-telemetry.js';
import type Redis from 'ioredis';

/**
 * Create a telemetry-wrapped MCP tool handler
 * Captures tool invocation, routing decision, and async operation metrics
 *
 * @param toolName - MCP tool identifier (e.g., 'identity:recover')
 * @param handler - Original tool handler function
 * @param getRedis - Function that returns ioredis client (lazy resolution)
 * @returns Wrapped handler that emits telemetry
 */
export function withMcpToolTelemetry<T extends Record<string, any>, R>(
  toolName: string,
  handler: (args: T) => Promise<R>,
  getRedis: () => Redis
) {
  return async (args: T): Promise<R> => {
    const collector = new AcpTelemetryCollector({
      node_id: `mcp:${toolName}`,
      enable_async_flush: true,
      flush_interval_ms: 500, // Shorter flush for tool-level telemetry
    });

    const startMs = Date.now();
    let redis: Redis | null = null;

    try {
      // Record tool invocation as a routing decision
      collector.recordRoutingDecision({
        decision_type: 'tool_dispatch',
        selected_tool: toolName,
        confidence: 1.0,
        alternative_tools: [],
        rationale: `Dispatching to ${toolName}`,
      });

      // Execute handler and record as async operation
      const operationStart = Date.now();
      const result = await handler(args);
      const operationDuration = Date.now() - operationStart;

      // Record successful tool execution
      collector.recordAsyncOp({
        op_type: 'mcp_tool_call',
        service: 'mcp',
        operation: toolName,
        duration_ms: operationDuration,
        status: 'success',
        details: {
          tool_name: toolName,
          args_keys: Object.keys(args),
          result_type: typeof result,
        },
      });

      // Flush telemetry before returning
      await collector.flush();

      // Persist aggregated metrics to Redis (lazy resolution)
      const metrics = {
        tool_name: toolName,
        duration_ms: Date.now() - startMs,
        status: 'success',
        timestamp: new Date().toISOString(),
      };

      try {
        redis = getRedis();
        await redis.setex(
          `telemetry:mcp:${toolName}:${Date.now()}`,
          86400, // 24-hour TTL
          JSON.stringify(metrics)
        );
      } catch (redisErr) {
        console.error(`[mcp-telemetry] Redis write failed for ${toolName}:`, redisErr);
        // Non-blocking: don't propagate Redis error to tool result
      }

      return result;
    } catch (err) {
      const errorMsg = String(err);
      const durationMs = Date.now() - startMs;

      // Record failed tool execution
      collector.recordAsyncOp({
        op_type: 'mcp_tool_call',
        service: 'mcp',
        operation: toolName,
        duration_ms: durationMs,
        status: 'error',
        details: {
          tool_name: toolName,
          error: errorMsg,
        },
      });

      // Flush error telemetry
      await collector.flush();

      // Persist error metrics to Redis (lazy resolution)
      const metrics = {
        tool_name: toolName,
        duration_ms: durationMs,
        status: 'error',
        error: errorMsg,
        timestamp: new Date().toISOString(),
      };

      try {
        redis = getRedis();
        await redis.setex(
          `telemetry:mcp:${toolName}:${Date.now()}`,
          86400,
          JSON.stringify(metrics)
        );
      } catch (redisErr) {
        console.error(`[mcp-telemetry] Redis write failed for ${toolName}:`, redisErr);
        // Non-blocking: don't propagate Redis error to tool result
      }

      throw err;
    }
  };
}

/**
 * Aggregate MCP tool telemetry across all dispatcher tools
 * Computes per-tool metrics: call count, total duration, success rate
 *
 * @param redis - ioredis client
 * @returns Aggregated metrics per tool
 */
export async function aggregateMcpToolTelemetry(redis: Redis) {
  try {
    const pattern = 'telemetry:mcp:*';
    const keys = await redis.keys(pattern);

    if (keys.length === 0) {
      return {
        total_tools_invoked: 0,
        tools: {},
        aggregated_at: new Date().toISOString(),
      };
    }

    const toolMetrics: Record<
      string,
      {
        call_count: number;
        success_count: number;
        error_count: number;
        total_duration_ms: number;
        avg_duration_ms: number;
        p50_duration_ms: number;
        p95_duration_ms: number;
        success_rate: number;
        last_error?: string;
      }
    > = {};

    // Fetch all telemetry events
    const events = await Promise.all(
      keys.map(async (key) => {
        const value = await redis.get(key);
        return value ? JSON.parse(value) : null;
      })
    );

    // Group by tool name and compute metrics
    for (const event of events) {
      if (!event || !event.tool_name) continue;

      const toolName = event.tool_name;
      if (!toolMetrics[toolName]) {
        toolMetrics[toolName] = {
          call_count: 0,
          success_count: 0,
          error_count: 0,
          total_duration_ms: 0,
          avg_duration_ms: 0,
          p50_duration_ms: 0,
          p95_duration_ms: 0,
          success_rate: 0,
        };
      }

      const metric = toolMetrics[toolName];
      metric.call_count++;
      metric.total_duration_ms += event.duration_ms || 0;

      if (event.status === 'success') {
        metric.success_count++;
      } else {
        metric.error_count++;
        metric.last_error = event.error;
      }
    }

    // Compute derived metrics
    for (const [toolName, metric] of Object.entries(toolMetrics)) {
      if (metric.call_count > 0) {
        metric.avg_duration_ms = metric.total_duration_ms / metric.call_count;
        metric.success_rate = metric.success_count / metric.call_count;
      }

      // Collect durations for percentile calculation (floor-based nearest-rank)
      const toolEvents = events.filter((e) => e?.tool_name === toolName);
      const durations = toolEvents
        .map((e) => e.duration_ms)
        .filter((d) => typeof d === 'number')
        .sort((a, b) => a - b);

      if (durations.length > 0) {
        const p50Idx = Math.floor(durations.length * 0.5);
        const p95Idx = Math.floor(durations.length * 0.95);

        metric.p50_duration_ms = durations[Math.min(p50Idx, durations.length - 1)] || 0;
        metric.p95_duration_ms = durations[Math.min(p95Idx, durations.length - 1)] || 0;
      }
    }

    return {
      total_tools_invoked: Object.keys(toolMetrics).length,
      tools: toolMetrics,
      aggregated_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[mcp-telemetry] Aggregation failed:', err);
    return {
      total_tools_invoked: 0,
      tools: {},
      error: String(err),
      aggregated_at: new Date().toISOString(),
    };
  }
}
