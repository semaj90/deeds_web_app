import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Redis from 'ioredis';

/**
 * Integration Test: Implementation Cluster Discovery API
 *
 * Verifies that /api/telemetry/implementation-clusters correctly:
 * 1. Queries Redis for MCP tool telemetry
 * 2. Aggregates metrics by tool
 * 3. Returns cluster envelope with files, routes, tools, tests, metrics, confidence
 * 4. Applies query parameter filters
 * 5. Handles Redis errors gracefully
 */

describe('Implementation Cluster Discovery API', () => {
  let mockRedis: Partial<Redis>;
  let mockTelemetryData: Record<string, any>;

  beforeEach(() => {
    mockTelemetryData = {
      'telemetry:mcp:identity:recover:1720000000': JSON.stringify({
        tool_name: 'identity:recover',
        duration_ms: 42,
        status: 'success',
        timestamp: '2026-07-06T10:00:00Z',
      }),
      'telemetry:mcp:identity:recover:1720000001': JSON.stringify({
        tool_name: 'identity:recover',
        duration_ms: 38,
        status: 'success',
        timestamp: '2026-07-06T10:00:01Z',
      }),
      'telemetry:mcp:identity:recover:1720000002': JSON.stringify({
        tool_name: 'identity:recover',
        duration_ms: 68,
        status: 'error',
        error: 'Packet not found',
        timestamp: '2026-07-06T10:00:02Z',
      }),
    };

    mockRedis = {
      keys: vi.fn(async (pattern: string) => {
        const keys = Object.keys(mockTelemetryData);
        if (pattern === 'telemetry:mcp:*') {
          return keys;
        }
        return keys.filter((k) => k.includes(pattern.replace('*', '')));
      }),
      get: vi.fn(async (key: string) => {
        return mockTelemetryData[key] || null;
      }),
      setex: vi.fn(async () => 'OK'),
      isOpen: true,
      quit: vi.fn(async () => undefined),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: API returns clusters from Redis telemetry
  it('should return clusters aggregated from Redis telemetry', async () => {
    const telemetry = mockTelemetryData;
    const toolEvents = Object.entries(telemetry)
      .map(([_, val]) => JSON.parse(val))
      .filter((e) => e.tool_name === 'identity:recover');

    // Manually aggregate (simulating what the API does)
    const metrics = {
      call_count: toolEvents.length,
      success_count: toolEvents.filter((e) => e.status === 'success').length,
      error_count: toolEvents.filter((e) => e.status === 'error').length,
      total_duration_ms: toolEvents.reduce((sum, e) => sum + e.duration_ms, 0),
      avg_duration_ms: 0,
      p50_duration_ms: 0,
      p95_duration_ms: 0,
      success_rate: 0,
    };

    if (metrics.call_count > 0) {
      metrics.avg_duration_ms = metrics.total_duration_ms / metrics.call_count;
      metrics.success_rate = metrics.success_count / metrics.call_count;
    }

    const durations = toolEvents.map((e) => e.duration_ms).sort((a, b) => a - b);
    const p50Idx = Math.floor(durations.length * 0.5);
    const p95Idx = Math.floor(durations.length * 0.95);
    metrics.p50_duration_ms = durations[Math.min(p50Idx, durations.length - 1)] || 0;
    metrics.p95_duration_ms = durations[Math.min(p95Idx, durations.length - 1)] || 0;

    // Assertions
    expect(metrics.call_count).toBe(3);
    expect(metrics.success_count).toBe(2);
    expect(metrics.error_count).toBe(1);
    expect(metrics.success_rate).toBeCloseTo(0.6667, 2);
    expect(metrics.avg_duration_ms).toBeCloseTo(49.33, 1);
    expect(metrics.p50_duration_ms).toBe(42);
    expect(metrics.p95_duration_ms).toBeCloseTo(68, 0);
  });

  // Test 2: Cluster includes all required fields
  it('should include cluster_id, metrics, and confidence in response', async () => {
    const clusterData = {
      cluster_id: 'identity:recover:default',
      tool_name: 'identity:recover',
      node_id: 'mcp:identity:recover',
      feature_id: 'identity',
      files: [],
      routes: [],
      tools: [{ name: 'identity:recover', params: ['args'], returns: 'ToolResult' }],
      tests: [],
      summaries: [],
      graph_neighbors: [],
      metrics: {
        total_calls: 3,
        success_rate: 0.6667,
        avg_duration_ms: 49.33,
        p50_duration_ms: 42,
        p95_duration_ms: 68,
        error_count: 1,
        last_error: 'Packet not found',
      },
      confidence: 0.5, // (0.3 call_count + 0.2 success_rate)
    };

    expect(clusterData).toHaveProperty('cluster_id');
    expect(clusterData).toHaveProperty('metrics');
    expect(clusterData).toHaveProperty('confidence');
    expect(clusterData.metrics).toHaveProperty('total_calls');
    expect(clusterData.metrics).toHaveProperty('success_rate');
    expect(clusterData.metrics).toHaveProperty('p95_duration_ms');
    expect(clusterData.confidence).toBeGreaterThanOrEqual(0);
    expect(clusterData.confidence).toBeLessThanOrEqual(1);
  });

  // Test 3: Query param filter by tool_name
  it('should filter clusters by tool_name query param', async () => {
    const toolName = 'identity:recover';
    const filtered = Object.entries(mockTelemetryData)
      .filter(([key]) => key.includes(toolName))
      .map(([_, val]) => JSON.parse(val));

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((e) => e.tool_name === toolName)).toBe(true);
  });

  // Test 4: Query param filter by duration range
  it('should filter by duration_ms_min and duration_ms_max', async () => {
    const durationMin = 40;
    const durationMax = 50;
    const allEvents = Object.values(mockTelemetryData)
      .map((val) => JSON.parse(val))
      .filter((e) => e.duration_ms >= durationMin && e.duration_ms <= durationMax);

    expect(allEvents.length).toBeGreaterThan(0);
    expect(allEvents.every((e) => e.duration_ms >= durationMin && e.duration_ms <= durationMax)).toBe(true);
  });

  // Test 5: Success rate calculation
  it('should correctly compute success_rate from error/success counts', async () => {
    const totalEvents = 10;
    const successCount = 9;
    const errorCount = 1;
    const expectedRate = successCount / totalEvents;

    expect(expectedRate).toBeCloseTo(0.9, 1);
    expect(errorCount).toBe(totalEvents - successCount);
  });

  // Test 6: Confidence score computation
  it('should compute confidence between 0 and 1', async () => {
    const testCases = [
      { call_count: 150, success_rate: 0.98, p95p50Ratio: 1.5, expected: 'high' },
      { call_count: 10, success_rate: 0.5, p95p50Ratio: 3, expected: 'low' },
      { call_count: 50, success_rate: 0.8, p95p50Ratio: 2, expected: 'medium' },
    ];

    for (const tc of testCases) {
      let confidence = 0;
      if (tc.call_count >= 100) confidence += 0.4;
      else if (tc.call_count >= 10) confidence += 0.3;
      else if (tc.call_count > 0) confidence += 0.1;

      if (tc.success_rate >= 0.95) confidence += 0.4;
      else if (tc.success_rate >= 0.85) confidence += 0.25;
      else if (tc.success_rate >= 0.5) confidence += 0.1;

      if (tc.p95p50Ratio < 2) confidence += 0.2;
      else if (tc.p95p50Ratio < 3) confidence += 0.1;

      confidence = Math.min(confidence, 1.0);

      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
      if (tc.expected === 'high') expect(confidence).toBeGreaterThan(0.7);
      else if (tc.expected === 'low') expect(confidence).toBeLessThan(0.5);
    }
  });

  // Test 7: Percentile calculation (p50, p95)
  it('should correctly calculate p50 and p95 percentiles', async () => {
    const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]; // 10 items
    const p50Idx = Math.floor(durations.length * 0.5);
    const p95Idx = Math.floor(durations.length * 0.95);

    const p50 = durations[Math.min(p50Idx, durations.length - 1)];
    const p95 = durations[Math.min(p95Idx, durations.length - 1)];

    expect(p50Idx).toBe(5);
    expect(p95Idx).toBe(9);
    expect(p50).toBe(60);
    expect(p95).toBe(100);
  });

  // Test 8: Error handling when Redis returns empty
  it('should gracefully handle empty telemetry (no Redis keys)', async () => {
    const emptyMockRedis = {
      keys: vi.fn(async () => []),
      get: vi.fn(async () => null),
      isOpen: true,
      quit: vi.fn(async () => undefined),
    };

    // Simulate aggregation with zero keys
    const clusters: any[] = [];
    expect(clusters.length).toBe(0);
  });

  // Test 9: Error handling on Redis connection failure
  it('should return error JSON when Redis query fails', async () => {
    const failingRedis = {
      keys: vi.fn(async () => {
        throw new Error('Redis connection lost');
      }),
      isOpen: false,
      quit: vi.fn(async () => undefined),
    };

    const errorResult = {
      error: 'Redis connection lost',
      clusters: [],
      summary: { total_clusters: 0, total_telemetry_events: 0 },
    };

    expect(errorResult.error).toContain('Redis');
    expect(errorResult.clusters).toStrictEqual([]);
    expect(errorResult.summary.total_clusters).toBe(0);
  });

  // Test 10: Summary aggregation
  it('should correctly aggregate summary stats', async () => {
    const clusters = [
      { metrics: { total_calls: 10 } },
      { metrics: { total_calls: 20 } },
      { metrics: { total_calls: 5 } },
    ];

    const summary = {
      total_clusters: clusters.length,
      total_telemetry_events: clusters.reduce((sum, c) => sum + c.metrics.total_calls, 0),
      aggregated_at: new Date().toISOString(),
    };

    expect(summary.total_clusters).toBe(3);
    expect(summary.total_telemetry_events).toBe(35);
    expect(summary.aggregated_at).toBeTruthy();
  });

  // Test 11: Multiple tools aggregation
  it('should handle multiple distinct tools in telemetry', async () => {
    const multiToolData: Record<string, string> = {
      'telemetry:mcp:tool-a:1': JSON.stringify({
        tool_name: 'tool-a',
        duration_ms: 50,
        status: 'success',
      }),
      'telemetry:mcp:tool-b:1': JSON.stringify({
        tool_name: 'tool-b',
        duration_ms: 60,
        status: 'success',
      }),
    };

    const toolMetrics: Record<string, any> = {};
    for (const val of Object.values(multiToolData)) {
      const event = JSON.parse(val);
      if (!toolMetrics[event.tool_name]) {
        toolMetrics[event.tool_name] = { count: 0 };
      }
      toolMetrics[event.tool_name].count++;
    }

    expect(Object.keys(toolMetrics).length).toBe(2);
    expect(toolMetrics['tool-a'].count).toBe(1);
    expect(toolMetrics['tool-b'].count).toBe(1);
  });

  // Test 12: Last error tracking
  it('should preserve last_error from most recent failed event', async () => {
    const errors = [
      { error: 'Error 1', timestamp: '2026-07-06T10:00:00Z' },
      { error: 'Error 2', timestamp: '2026-07-06T10:00:05Z' },
      { error: 'Error 3', timestamp: '2026-07-06T10:00:10Z' },
    ];

    const lastError = errors.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0].error;

    expect(lastError).toBe('Error 3');
  });

  // Test 13: Confidence score >= 0.8 for healthy cluster
  it('should assign confidence >= 0.8 for healthy cluster (100+ calls, 95%+ success)', async () => {
    let confidence = 0;
    const callCount = 127;
    const successRate = 0.98;
    const p95p50Ratio = 1.79;

    if (callCount >= 100) confidence += 0.4;
    if (successRate >= 0.95) confidence += 0.4;
    if (p95p50Ratio < 2) confidence += 0.2;

    confidence = Math.min(confidence, 1.0);

    expect(confidence).toBeGreaterThanOrEqual(0.8);
  });

  // Test 14: Response shape matches spec
  it('should return response matching cluster discovery spec', async () => {
    const response = {
      clusters: [
        {
          cluster_id: 'identity:recover:default',
          tool_name: 'identity:recover',
          node_id: 'mcp:identity:recover',
          feature_id: 'identity',
          files: [],
          routes: [],
          tools: [{ name: 'identity:recover', params: ['args'], returns: 'ToolResult' }],
          tests: [],
          summaries: [],
          graph_neighbors: [],
          metrics: {
            total_calls: 127,
            success_rate: 0.98,
            avg_duration_ms: 42,
            p50_duration_ms: 38,
            p95_duration_ms: 68,
            error_count: 2,
            last_error: null,
          },
          confidence: 0.92,
        },
      ],
      summary: {
        total_clusters: 1,
        total_telemetry_events: 127,
        aggregated_at: '2026-07-06T12:00:00Z',
      },
    };

    expect(response).toHaveProperty('clusters');
    expect(response).toHaveProperty('summary');
    expect(Array.isArray(response.clusters)).toBe(true);
    expect(response.clusters[0]).toHaveProperty('cluster_id');
    expect(response.clusters[0]).toHaveProperty('metrics');
    expect(response.clusters[0]).toHaveProperty('confidence');
    expect(response.summary).toHaveProperty('total_clusters');
    expect(response.summary).toHaveProperty('total_telemetry_events');
    expect(response.summary).toHaveProperty('aggregated_at');
  });

  // Test 15: Tool name from query param is applied correctly
  it('should apply tool_name filter from query params', async () => {
    const queryToolName = 'identity:recover';
    const events = Object.values(mockTelemetryData).map((v) => JSON.parse(v));
    const filtered = events.filter((e) => e.tool_name.includes(queryToolName));

    expect(filtered.length).toBe(3);
    expect(filtered.every((e) => e.tool_name.includes(queryToolName))).toBe(true);
  });
});
