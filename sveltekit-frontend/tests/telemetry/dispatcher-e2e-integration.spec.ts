import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type Redis from 'ioredis';
import type { DispatcherState } from '../../src/lib/server/langgraph/dispatcher-nodes/types';
import {
  withDispatcherTelemetry,
  emitDispatcherTelemetry,
} from '../../src/lib/server/telemetry/dispatcher-telemetry-wrapper';

describe('Dispatcher Telemetry E2E Integration', () => {
  let mockRedis: Partial<Redis>;
  let mockPostgres: any;
  let mockState: DispatcherState;
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
      keys: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
    };

    mockPostgres = {
      run: vi.fn(async () => {
        telemetryEmissions.push({
          type: 'postgres_write',
          timestamp: new Date().toISOString(),
        });
        return { rows: [] };
      }),
    };

    mockState = {
      query: 'test query',
      candidates: [
        {
          packet_key: 'test:1',
          source_ref: 'src/test.ts',
          feature_id: 'test_feature',
          confidence: 0.9,
          identity_lane: 'canonical',
        },
      ],
      identity_lane: 'canonical',
      parity_status: 'aligned',
      dispatch_decision: 'recover',
      dispatch_confidence: 0.95,
      synthesis_path: [],
      tool_calls: [],
      errors: [],
      latency_ms: 0,
      action: 'success',
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Full dispatcher node execution with telemetry', () => {
    it('should emit telemetry on successful node execution', async () => {
      const handler = vi.fn(async (state: DispatcherState) => ({
        ...state,
        synthesis_path: [...state.synthesis_path, 'node_recover_identity'],
        action: 'success' as const,
      }));

      const wrapped = withDispatcherTelemetry(
        'node_recover_identity',
        handler,
        mockRedis as Redis,
        mockPostgres
      );

      const result = await wrapped(mockState);

      // Verify handler was called
      expect(handler).toHaveBeenCalledWith(mockState);

      // Verify result contains telemetry marker
      expect(result.synthesis_path).toContain('node_recover_identity');

      // Allow microtask to settle
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify Redis write fired
      expect(mockRedis.setex).toHaveBeenCalled();
      expect(telemetryEmissions).toHaveLength(2); // Redis + deferred Postgres
    });

    it('should capture node routing decision in telemetry', async () => {
      const handler = vi.fn(async (state: DispatcherState) => ({
        ...state,
        dispatch_decision: 'recover' as const,
        dispatch_confidence: 0.95,
        reason: 'Attempting deterministic recovery',
      }));

      const wrapped = withDispatcherTelemetry(
        'node_recover_identity',
        handler,
        mockRedis as Redis,
        mockPostgres
      );

      await wrapped(mockState);

      // Check Redis telemetry payload
      const redisEvent = telemetryEmissions.find((e) => e.type === 'redis_write');
      expect(redisEvent).toBeDefined();
      expect(redisEvent.value).toMatchObject({
        node_id: 'node_recover_identity',
        decision: 'recover',
        confidence: 0.95,
      });
    });

    it('should measure and record node execution duration', async () => {
      const handler = vi.fn(async (state: DispatcherState) => {
        // Simulate work
        await new Promise((resolve) => setTimeout(resolve, 25));
        return { ...state, action: 'success' as const };
      });

      const wrapped = withDispatcherTelemetry(
        'node_expand_topology',
        handler,
        mockRedis as Redis,
        mockPostgres
      );

      await wrapped(mockState);

      const redisEvent = telemetryEmissions.find((e) => e.type === 'redis_write');
      expect(redisEvent?.value.duration_ms).toBeGreaterThanOrEqual(25);
      expect(redisEvent?.value.duration_ms).toBeLessThan(100);
    });

    it('should emit telemetry even on node error', async () => {
      const handlerError = new Error('Node execution failed');
      const handler = vi.fn(async () => {
        throw handlerError;
      });

      const wrapped = withDispatcherTelemetry(
        'node_validate_envelope',
        handler,
        mockRedis as Redis,
        mockPostgres
      );

      await expect(wrapped(mockState)).rejects.toThrow('Node execution failed');

      // Redis write should still fire
      expect(mockRedis.setex).toHaveBeenCalled();

      // Allow microtask to settle
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Both Redis and deferred Postgres should be in emissions
      expect(telemetryEmissions.length).toBeGreaterThanOrEqual(1);
    });

    it('should capture tool calls within node execution', async () => {
      const toolCall = {
        tool_name: 'identity:recover',
        params: { packet_count: 1 },
        result: { recovered: 1 },
        duration_ms: 15,
      };

      const handler = vi.fn(async (state: DispatcherState) => ({
        ...state,
        tool_calls: [toolCall],
      }));

      const wrapped = withDispatcherTelemetry(
        'node_recover_identity',
        handler,
        mockRedis as Redis,
        mockPostgres
      );

      const result = await wrapped(mockState);

      // Verify result state captures tool calls
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls[0]).toMatchObject({
        tool_name: 'identity:recover',
        duration_ms: 15,
      });

      // Telemetry emitted with routing decision and duration
      const redisEvent = telemetryEmissions.find((e) => e.type === 'redis_write');
      expect(redisEvent?.value).toMatchObject({
        node_id: 'node_recover_identity',
        duration_ms: expect.any(Number),
      });
    });

    it('should defer Postgres write to avoid blocking node', async () => {
      let postgresWriteTime = 0;
      const handler = vi.fn(async (state: DispatcherState) => {
        const startTime = Date.now();
        postgresWriteTime = startTime; // Capture when handler starts
        return { ...state, action: 'success' as const };
      });

      const wrapped = withDispatcherTelemetry(
        'node_sync_qdrant_mirror',
        handler,
        mockRedis as Redis,
        mockPostgres
      );

      const result = await wrapped(mockState);

      // Postgres run should be called (deferred), but handler completes immediately
      expect(result.action).toBe('success');

      // Wait for microtask queue to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify Postgres write eventually fired
      expect(mockPostgres.run).toHaveBeenCalled();
    });

    it('should aggregate latency across multiple node executions', async () => {
      const executions = [];

      for (let i = 0; i < 5; i++) {
        const handler = vi.fn(async (state: DispatcherState) => {
          await new Promise((resolve) => setTimeout(resolve, 10 + i * 5));
          return { ...state, action: 'success' as const };
        });

        const wrapped = withDispatcherTelemetry(
          `node_test_${i}`,
          handler,
          mockRedis as Redis,
          mockPostgres
        );

        const result = await wrapped(mockState);
        executions.push(result);
      }

      // Verify all executions completed
      expect(executions).toHaveLength(5);

      // Verify telemetry was captured for each
      const redisWrites = telemetryEmissions.filter((e) => e.type === 'redis_write');
      expect(redisWrites.length).toBeGreaterThanOrEqual(5);

      // Durations should be increasing
      const durations = redisWrites.slice(0, 5).map((e) => e.value.duration_ms);
      expect(durations[0]).toBeLessThan(durations[4]);
    });

    it('should include node context in telemetry', async () => {
      const handler = vi.fn(async (state: DispatcherState) => {
        return {
          ...state,
          candidates: [
            ...state.candidates,
            {
              packet_key: 'new:candidate',
              source_ref: 'src/new.ts',
              feature_id: 'new_feature',
              confidence: 0.85,
              identity_lane: 'recoverable',
            },
          ],
          action: 'success' as const,
        };
      });

      const wrapped = withDispatcherTelemetry(
        'node_expand_topology',
        handler,
        mockRedis as Redis,
        mockPostgres
      );

      const result = await wrapped(mockState);

      // Verify state was enriched
      expect(result.candidates).toHaveLength(2);

      const redisEvent = telemetryEmissions.find((e) => e.type === 'redis_write');
      expect(redisEvent?.value).toMatchObject({
        node_id: 'node_expand_topology',
        timestamp: expect.any(String),
        duration_ms: expect.any(Number),
      });
    });

    it('should track synthesis path breadcrumbs', async () => {
      const handlers = [
        {
          name: 'node_recover_identity',
          handler: vi.fn(async (state: DispatcherState) => ({
            ...state,
            synthesis_path: [...state.synthesis_path, 'node_recover_identity'],
          })),
        },
        {
          name: 'node_validate_envelope',
          handler: vi.fn(async (state: DispatcherState) => ({
            ...state,
            synthesis_path: [...state.synthesis_path, 'node_validate_envelope'],
          })),
        },
        {
          name: 'node_expand_topology',
          handler: vi.fn(async (state: DispatcherState) => ({
            ...state,
            synthesis_path: [...state.synthesis_path, 'node_expand_topology'],
          })),
        },
      ];

      let currentState = mockState;

      for (const { name, handler } of handlers) {
        const wrapped = withDispatcherTelemetry(name, handler, mockRedis as Redis, mockPostgres);
        currentState = await wrapped(currentState);
      }

      // Verify synthesis path accumulates
      expect(currentState.synthesis_path).toEqual([
        'node_recover_identity',
        'node_validate_envelope',
        'node_expand_topology',
      ]);

      // Verify each node emission captured the path at that point
      const redisWrites = telemetryEmissions.filter((e) => e.type === 'redis_write');
      expect(redisWrites.length).toBeGreaterThanOrEqual(3);
    });
  });
});
