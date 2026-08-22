/**
 * ACP/MCP Telemetry Collector
 *
 * Unified observability system for:
 * - LangGraph node execution (duration, cache hits, async ops)
 * - Tool calls (name, params, execution time, errors)
 * - Database operations (query, latency, rows affected)
 * - Cache operations (hits, misses, TTL)
 *
 * All telemetry is indexed by trace_id for correlation.
 */

export interface AsyncOpRecord {
  operation: string;
  latency_ms: number;
  timestamp: string;
  error?: string;
  rows_affected?: number;
  cache_hit?: boolean;
}

export interface ToolCallRecord {
  tool_name: string;
  params: Record<string, unknown>;
  result?: Record<string, unknown>;
  execution_time_ms: number;
  timestamp: string;
  error?: string;
  status: 'success' | 'failure';
}

export interface NodeExecutionRecord {
  node_name: string;
  duration_ms: number;
  async_ops: AsyncOpRecord[];
  cache_hits: number;
  cache_misses: number;
  timestamp: string;
  error?: string;
  status: 'success' | 'failure' | 'timeout';
}

export interface TelemetryCheckpoint {
  trace_id: string;
  step: number;
  node: string;
  timestamp: string;
  duration_ms: number;
  async_operations: AsyncOpRecord[];
  tool_calls?: ToolCallRecord[];
  cache_summary?: {
    hits: number;
    misses: number;
    hit_rate: number;
  };
}

export class TelemetryCollector {
  private trace_id: string;
  private step = 0;
  private nodeExecutions: Map<string, NodeExecutionRecord> = new Map();
  private cacheHits = 0;
  private cacheMisses = 0;
  private checkpoints: TelemetryCheckpoint[] = [];

  constructor(trace_id: string) {
    this.trace_id = trace_id;
  }

  startNodeTimer(nodeName: string) {
    const startTime = performance.now();
    const asyncOps: AsyncOpRecord[] = [];
    let cacheHitsLocal = 0;
    let cacheMissesLocal = 0;

    return {
      recordAsyncOp: (op: string, latency_ms: number, error?: string, rows_affected?: number) => {
        asyncOps.push({
          operation: op,
          latency_ms,
          timestamp: new Date().toISOString(),
          error,
          rows_affected,
        });
      },
      recordCacheHit: () => {
        cacheHitsLocal++;
        this.cacheHits++;
      },
      recordCacheMiss: () => {
        cacheMissesLocal++;
        this.cacheMisses++;
      },
      stop: (error?: string) => {
        const duration_ms = performance.now() - startTime;
        this.nodeExecutions.set(nodeName, {
          node_name: nodeName,
          duration_ms,
          async_ops: asyncOps,
          cache_hits: cacheHitsLocal,
          cache_misses: cacheMissesLocal,
          timestamp: new Date().toISOString(),
          error,
          status: (error ? 'failure' : 'success') as const,
        });
        this.step++;
      },
    };
  }

  recordAsyncOp(operation: string, latency_ms: number, options?: { error?: string; rows_affected?: number; cache_hit?: boolean }) {
    if (options?.cache_hit) {
      this.cacheHits++;
    } else if (options?.cache_hit === false) {
      this.cacheMisses++;
    }
  }

  async emitCheckpoint(): Promise<TelemetryCheckpoint> {
    const totalAsyncOps = Array.from(this.nodeExecutions.values()).flatMap((n) => n.async_ops);
    const totalDuration_ms = Array.from(this.nodeExecutions.values()).reduce((sum, n) => sum + n.duration_ms, 0);
    const cacheSummary = {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hit_rate: this.cacheHits + this.cacheMisses > 0 ? this.cacheHits / (this.cacheHits + this.cacheMisses) : 0,
    };

    const checkpoint: TelemetryCheckpoint = {
      trace_id: this.trace_id,
      step: this.step,
      node: Array.from(this.nodeExecutions.keys()).pop() || 'unknown',
      timestamp: new Date().toISOString(),
      duration_ms: totalDuration_ms,
      async_operations: totalAsyncOps,
      cache_summary: cacheSummary,
    };

    this.checkpoints.push(checkpoint);
    return checkpoint;
  }

  getSummary() {
    return {
      trace_id: this.trace_id,
      step: this.step,
      nodes: Array.from(this.nodeExecutions.entries()).map(([name, record]) => ({
        name,
        ...record,
      })),
      cache_summary: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        hit_rate: this.cacheHits + this.cacheMisses > 0 ? this.cacheHits / (this.cacheHits + this.cacheMisses) : 0,
      },
      checkpoints: this.checkpoints,
    };
  }
}

const telemetryRegistry = new Map<string, TelemetryCollector>();

export function getTelemetryCollector(trace_id: string): TelemetryCollector {
  if (!telemetryRegistry.has(trace_id)) {
    telemetryRegistry.set(trace_id, new TelemetryCollector(trace_id));
  }
  return telemetryRegistry.get(trace_id)!;
}

export function clearTelemetryCollector(trace_id: string): void {
  telemetryRegistry.delete(trace_id);
}

export async function exportTelemetry(trace_id: string, destination: 'redis' | 'file' = 'file'): Promise<void> {
  const collector = telemetryRegistry.get(trace_id);
  if (!collector) return;

  const summary = collector.getSummary();

  if (destination === 'file') {
    const fs = await import('node:fs/promises');
    await fs.mkdir('.tmp/telemetry', { recursive: true });
    await fs.writeFile(`.tmp/telemetry/${trace_id}.json`, JSON.stringify(summary, null, 2));
  } else if (destination === 'redis') {
    console.log(`[telemetry] Would export to Redis: telemetry:${trace_id}`);
  }
}
