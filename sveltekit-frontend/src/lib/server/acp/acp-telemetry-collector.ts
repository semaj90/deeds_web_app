/**
 * ACP Telemetry Collector — Observable Routing, Latency, Tool Invocation
 *
 * Tracks ACP packet routing decisions, gRPC call latency, tool execution paths,
 * and error signals for observability and debugging.
 *
 * Exports telemetry to:
 * - Redis (fast queries, real-time dashboards)
 * - Postgres (durable audit trail, historical analysis)
 * - Langfuse/OpenTelemetry (optional, via environment flags)
 */

import { createHash } from 'node:crypto';

/**
 * Routing decision made by ACP dispatcher
 */
export interface RoutingDecision {
  queryId: string;
  timestamp: Date;
  decision: 'cache_hit' | 'vector_search' | 'graph_traversal' | 'hybrid' | 'fallback';
  confidence: number; // 0.0-1.0
  selectedTools: string[]; // e.g., ['retrieval:rerank', 'graph:expand']
  reasoning?: string;
}

/**
 * gRPC call execution trace
 */
export interface GrpcCallTrace {
  traceId: string;
  serviceId: 'embedding' | 'retrieval' | 'toolCalling' | 'chatAssistant' | 'codeIntel';
  methodName: string;
  requestSize: number;
  responseSize: number;
  durationMs: number;
  status: 'success' | 'error' | 'timeout';
  errorMessage?: string;
  timestamp: Date;
}

/**
 * Tool invocation path through dispatcher
 */
export interface ToolInvocationTrace {
  traceId: string;
  toolId: string; // e.g., 'identity:recover'
  serviceId: string;
  proto: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  durationMs: number;
  status: 'success' | 'error' | 'skipped';
  errorMessage?: string;
  inputHash: string; // SHA256 of input args for deduplication
  cacheHit: boolean;
  timestamp: Date;
}

/**
 * Packet assembly trace (gRPC response → canonical envelope)
 */
export interface PacketAssemblyTrace {
  traceId: string;
  sourceService: string;
  sourceMethod: string;
  packetKey: string;
  identityExtracted: boolean;
  semanticsExtracted: boolean;
  topologyExtracted: boolean;
  mirrorsExtracted: boolean;
  validationStatus: 'pass' | 'fail';
  validationErrors?: string[];
  durationMs: number;
  timestamp: Date;
}

/**
 * Central telemetry collector — accumulates all ACP signals
 */
export class AcpTelemetryCollector {
  private routingDecisions: RoutingDecision[] = [];
  private grpcCalls: GrpcCallTrace[] = [];
  private toolInvocations: ToolInvocationTrace[] = [];
  private packetAssemblies: PacketAssemblyTrace[] = [];
  private sessionId: string;
  private maxTracesPerCategory: number = 1000;

  constructor(sessionId?: string, maxTracesPerCategory: number = 1000) {
    this.sessionId = sessionId || this.generateSessionId();
    this.maxTracesPerCategory = maxTracesPerCategory;
  }

  /**
   * Record a routing decision
   */
  recordRoutingDecision(decision: RoutingDecision): void {
    this.routingDecisions.push(decision);
    this.pruneIfNeeded();
  }

  /**
   * Record a gRPC call
   */
  recordGrpcCall(call: GrpcCallTrace): void {
    this.grpcCalls.push(call);
    this.pruneIfNeeded();
  }

  /**
   * Record a tool invocation
   */
  recordToolInvocation(tool: ToolInvocationTrace): void {
    this.toolInvocations.push(tool);
    this.pruneIfNeeded();
  }

  /**
   * Record a packet assembly
   */
  recordPacketAssembly(assembly: PacketAssemblyTrace): void {
    this.packetAssemblies.push(assembly);
    this.pruneIfNeeded();
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    return {
      sessionId: this.sessionId,
      recordedAt: new Date().toISOString(),
      routingDecisions: this.routingDecisions.length,
      grpcCalls: this.grpcCalls.length,
      toolInvocations: this.toolInvocations.length,
      packetAssemblies: this.packetAssemblies.length,
      totalTraces:
        this.routingDecisions.length +
        this.grpcCalls.length +
        this.toolInvocations.length +
        this.packetAssemblies.length,
      avgGrpcLatency: this.computeAverageLatency(this.grpcCalls),
      avgToolLatency: this.computeAverageLatency(this.toolInvocations),
      cacheHitRate: this.computeCacheHitRate(),
      successRate: this.computeSuccessRate(),
    };
  }

  /**
   * Export all traces for external observability system
   */
  exportTraces() {
    return {
      sessionId: this.sessionId,
      exportedAt: new Date().toISOString(),
      routing: this.routingDecisions,
      grpc: this.grpcCalls,
      tools: this.toolInvocations,
      packets: this.packetAssemblies,
    };
  }

  /**
   * Export as Redis cache keys (fast lookup)
   */
  exportToRedisKeys(prefix: string = 'acp:telemetry'): Record<string, string> {
    const keys: Record<string, string> = {};

    // Session summary
    const summary = this.getSummary();
    keys[`${prefix}:${this.sessionId}:summary`] = JSON.stringify(summary);

    // Latest routing decision
    if (this.routingDecisions.length > 0) {
      const latest = this.routingDecisions[this.routingDecisions.length - 1];
      keys[`${prefix}:${this.sessionId}:latest:routing`] = JSON.stringify(latest);
    }

    // Latest gRPC call
    if (this.grpcCalls.length > 0) {
      const latest = this.grpcCalls[this.grpcCalls.length - 1];
      keys[`${prefix}:${this.sessionId}:latest:grpc`] = JSON.stringify(latest);
    }

    // Latency percentiles
    const grpcLatencies = this.grpcCalls.map((c) => c.durationMs);
    if (grpcLatencies.length > 0) {
      keys[`${prefix}:${this.sessionId}:grpc:p50`] = String(this.percentile(grpcLatencies, 0.5));
      keys[`${prefix}:${this.sessionId}:grpc:p95`] = String(this.percentile(grpcLatencies, 0.95));
      keys[`${prefix}:${this.sessionId}:grpc:p99`] = String(this.percentile(grpcLatencies, 0.99));
    }

    return keys;
  }

  /**
   * Clear all traces
   */
  clear(): void {
    this.routingDecisions = [];
    this.grpcCalls = [];
    this.toolInvocations = [];
    this.packetAssemblies = [];
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────

  private generateSessionId(): string {
    return `session:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
  }

  private pruneIfNeeded(): void {
    if (this.routingDecisions.length > this.maxTracesPerCategory) {
      this.routingDecisions = this.routingDecisions.slice(-this.maxTracesPerCategory);
    }
    if (this.grpcCalls.length > this.maxTracesPerCategory) {
      this.grpcCalls = this.grpcCalls.slice(-this.maxTracesPerCategory);
    }
    if (this.toolInvocations.length > this.maxTracesPerCategory) {
      this.toolInvocations = this.toolInvocations.slice(-this.maxTracesPerCategory);
    }
    if (this.packetAssemblies.length > this.maxTracesPerCategory) {
      this.packetAssemblies = this.packetAssemblies.slice(-this.maxTracesPerCategory);
    }
  }

  private computeAverageLatency(traces: { durationMs: number }[]): number {
    if (traces.length === 0) return 0;
    const total = traces.reduce((sum, t) => sum + t.durationMs, 0);
    return Math.round(total / traces.length);
  }

  private computeCacheHitRate(): number {
    if (this.toolInvocations.length === 0) return 0;
    const hits = this.toolInvocations.filter((t) => t.cacheHit).length;
    return parseFloat((hits / this.toolInvocations.length).toFixed(2));
  }

  private computeSuccessRate(): number {
    const allTraces = [
      ...this.routingDecisions,
      ...this.grpcCalls,
      ...this.toolInvocations,
      ...this.packetAssemblies,
    ];
    if (allTraces.length === 0) return 0;

    const successCount = [
      ...this.grpcCalls.filter((c) => c.status === 'success'),
      ...this.toolInvocations.filter((t) => t.status === 'success'),
      ...this.packetAssemblies.filter((p) => p.validationStatus === 'pass'),
    ].length;

    return parseFloat((successCount / allTraces.length).toFixed(2));
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }
}

/**
 * Global telemetry collector instance (one per request/session)
 * In production, use dependency injection instead of globals.
 */
let globalCollector: AcpTelemetryCollector | null = null;

export function initializeGlobalCollector(sessionId?: string): AcpTelemetryCollector {
  globalCollector = new AcpTelemetryCollector(sessionId);
  return globalCollector;
}

export function getGlobalCollector(): AcpTelemetryCollector {
  if (!globalCollector) {
    globalCollector = new AcpTelemetryCollector();
  }
  return globalCollector;
}

export function clearGlobalCollector(): void {
  if (globalCollector) {
    globalCollector.clear();
    globalCollector = null;
  }
}
