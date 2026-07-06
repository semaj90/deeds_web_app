import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type Redis from 'ioredis';
import { withMcpToolTelemetry, aggregateMcpToolTelemetry } from '../../src/lib/server/telemetry/mcp-tool-telemetry';

describe('MCP Tool Telemetry', () => {
  let mockRedis: Partial<Redis>;
  let telemetryEmissions: any[] = [];

  beforeEach(() => {
    telemetryEmissions = [];

    mockRedis = {
      setex: vi.fn(async (key: string, ttl: number, value: string) => {
        telemetryEmissions.push({
          type: 'redis_write',
          key,
          ttl,
          value: JSON.parse(value),
        });
        return 'OK';
      }),
      keys: vi.fn(async (pattern: string) => {
        if (pattern === 'telemetry:mcp:*') {
          return telemetryEmissions
            .filter((e) => e.type === 'redis_write')
            .map((e) => e.key);
        }
        return [];
      }),
      get: vi.fn(async (key: string) => {
        const emission = telemetryEmissions.find((e) => e.key === key);
        return emission ? JSON.stringify(emission.value) : null;
      }),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    telemetryEmissions = [];
  });

  describe('withMcpToolTelemetry', () => {
    it('should wrap tool handler and emit telemetry on success', async () => {
      const handler = vi.fn(async (args: { query: string }) => ({
        results: ['result1', 'result2'],
        duration: 42,
      }));

      const getRedisStub = () => mockRedis as Redis;
      const wrapped = withMcpToolTelemetry('identity:recover', handler, getRedisStub);
      const result = await wrapped({ query: 'test packet' });

      // Verify handler was called
      expect(handler).toHaveBeenCalledWith({ query: 'test packet' });
      expect(result).toMatchObject({
        results: ['result1', 'result2'],
      });

      // Verify Redis telemetry was emitted
      expect(mockRedis.setex).toHaveBeenCalled();
      const redisCall = (mockRedis.setex as any).mock.calls[0];
      expect(redisCall[0]).toMatch(/telemetry:mcp:identity:recover:/);
      expect(redisCall[1]).toBe(86400); // 24-hour TTL
    });

    it('should capture tool invocation metadata', async () => {
      const handler = vi.fn(async (args: { packetKey: string }) => ({
        recovered: 1,
      }));

      const getRedisStub = () => mockRedis as Redis;
      const wrapped = withMcpToolTelemetry('identity:recover', handler, getRedisStub);
      await wrapped({ packetKey: 'test:1' });

      const redisEvent = telemetryEmissions.find((e) => e.type === 'redis_write');
      expect(redisEvent?.value).toMatchObject({
        tool_name: 'identity:recover',
        status: 'success',
        duration_ms: expect.any(Number),
        timestamp: expect.any(String),
      });
    });

    it('should measure tool execution duration', async () => {
      const handler = vi.fn(async (args: any) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { success: true };
      });

      const getRedisStub = () => mockRedis as Redis;
      const wrapped = withMcpToolTelemetry('validate:envelope', handler, getRedisStub);
      await wrapped({});

      const redisEvent = telemetryEmissions.find((e) => e.type === 'redis_write');
      expect(redisEvent?.value.duration_ms).toBeGreaterThanOrEqual(20);
      expect(redisEvent?.value.duration_ms).toBeLessThan(100);
    });

    it('should emit telemetry on tool error', async () => {
      const toolError = new Error('Tool execution failed');
      const handler = vi.fn(async () => {
        throw toolError;
      });

      const getRedisStub = () => mockRedis as Redis;
      const wrapped = withMcpToolTelemetry('sync:qdrant', handler, getRedisStub);

      await expect(wrapped({})).rejects.toThrow('Tool execution failed');

      // Verify Redis telemetry was emitted even on error
      expect(mockRedis.setex).toHaveBeenCalled();
      const redisEvent = telemetryEmissions.find((e) => e.type === 'redis_write');
      expect(redisEvent?.value).toMatchObject({
        tool_name: 'sync:qdrant',
        status: 'error',
      });
    });

    it('should handle Redis write failures gracefully', async () => {
      (mockRedis.setex as any).mockRejectedValueOnce(new Error('Redis error'));

      const handler = vi.fn(async () => ({ success: true }));
      const getRedisStub = () => mockRedis as Redis;
      const wrapped = withMcpToolTelemetry('graph:expand', handler, getRedisStub);

      // Should not throw even if Redis fails
      const result = await wrapped({});
      expect(result).toMatchObject({ success: true });
    });
  });

  describe('aggregateMcpToolTelemetry', () => {
    it('should aggregate tool metrics across all invocations', async () => {
      // Simulate 3 tool invocations: 2 success, 1 error
      telemetryEmissions = [
        {
          type: 'redis_write',
          key: 'telemetry:mcp:identity:recover:1',
          value: {
            tool_name: 'identity:recover',
            status: 'success',
            duration_ms: 50,
            timestamp: '2026-07-06T13:30:00Z',
          },
        },
        {
          type: 'redis_write',
          key: 'telemetry:mcp:identity:recover:2',
          value: {
            tool_name: 'identity:recover',
            status: 'success',
            duration_ms: 75,
            timestamp: '2026-07-06T13:30:05Z',
          },
        },
        {
          type: 'redis_write',
          key: 'telemetry:mcp:identity:recover:3',
          value: {
            tool_name: 'identity:recover',
            status: 'error',
            duration_ms: 30,
            error: 'Recovery failed',
            timestamp: '2026-07-06T13:30:10Z',
          },
        },
      ];

      const aggregated = await aggregateMcpToolTelemetry(mockRedis as Redis);

      expect(aggregated.total_tools_invoked).toBe(1);
      expect(aggregated.tools['identity:recover']).toMatchObject({
        call_count: 3,
        success_count: 2,
        error_count: 1,
        total_duration_ms: 155,
        avg_duration_ms: 155 / 3,
        success_rate: 2 / 3,
      });
    });

    it('should compute per-tool latency percentiles', async () => {
      telemetryEmissions = [
        {
          type: 'redis_write',
          key: 'telemetry:mcp:sync:neo4j:1',
          value: {
            tool_name: 'sync:neo4j',
            status: 'success',
            duration_ms: 10,
          },
        },
        {
          type: 'redis_write',
          key: 'telemetry:mcp:sync:neo4j:2',
          value: {
            tool_name: 'sync:neo4j',
            status: 'success',
            duration_ms: 20,
          },
        },
        {
          type: 'redis_write',
          key: 'telemetry:mcp:sync:neo4j:3',
          value: {
            tool_name: 'sync:neo4j',
            status: 'success',
            duration_ms: 30,
          },
        },
      ];

      const aggregated = await aggregateMcpToolTelemetry(mockRedis as Redis);

      expect(aggregated.tools['sync:neo4j']).toMatchObject({
        p50_duration_ms: 20,
        p95_duration_ms: 30,
      });
    });

    it('should handle empty telemetry gracefully', async () => {
      (mockRedis.keys as any).mockResolvedValueOnce([]);

      const aggregated = await aggregateMcpToolTelemetry(mockRedis as Redis);

      expect(aggregated.total_tools_invoked).toBe(0);
      expect(aggregated.tools).toEqual({});
    });

    it('should aggregate multiple tools independently', async () => {
      telemetryEmissions = [
        {
          type: 'redis_write',
          key: 'telemetry:mcp:tool1:1',
          value: {
            tool_name: 'tool1',
            status: 'success',
            duration_ms: 50,
          },
        },
        {
          type: 'redis_write',
          key: 'telemetry:mcp:tool2:1',
          value: {
            tool_name: 'tool2',
            status: 'success',
            duration_ms: 100,
          },
        },
        {
          type: 'redis_write',
          key: 'telemetry:mcp:tool1:2',
          value: {
            tool_name: 'tool1',
            status: 'success',
            duration_ms: 60,
          },
        },
      ];

      const aggregated = await aggregateMcpToolTelemetry(mockRedis as Redis);

      expect(aggregated.total_tools_invoked).toBe(2);
      expect(aggregated.tools['tool1']).toMatchObject({
        call_count: 2,
        total_duration_ms: 110,
        avg_duration_ms: 55,
      });
      expect(aggregated.tools['tool2']).toMatchObject({
        call_count: 1,
        total_duration_ms: 100,
        avg_duration_ms: 100,
      });
    });

    it('should track last error per tool', async () => {
      telemetryEmissions = [
        {
          type: 'redis_write',
          key: 'telemetry:mcp:tool1:1',
          value: {
            tool_name: 'tool1',
            status: 'error',
            error: 'First error',
            duration_ms: 10,
          },
        },
        {
          type: 'redis_write',
          key: 'telemetry:mcp:tool1:2',
          value: {
            tool_name: 'tool1',
            status: 'error',
            error: 'Second error',
            duration_ms: 15,
          },
        },
      ];

      const aggregated = await aggregateMcpToolTelemetry(mockRedis as Redis);

      expect(aggregated.tools['tool1'].last_error).toBe('Second error');
    });

    it('should handle Redis fetch errors gracefully', async () => {
      (mockRedis.keys as any).mockRejectedValueOnce(new Error('Redis error'));

      const aggregated = await aggregateMcpToolTelemetry(mockRedis as Redis);

      expect(aggregated.total_tools_invoked).toBe(0);
      expect(aggregated.error).toBeDefined();
    });
  });
});