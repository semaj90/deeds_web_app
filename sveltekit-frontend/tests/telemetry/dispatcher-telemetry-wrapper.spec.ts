import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Redis from 'ioredis';
import type { DispatcherState } from '../../src/lib/server/langgraph/dispatcher-nodes/types';
import {
  emitDispatcherTelemetry,
  withDispatcherTelemetry,
  createNodeTelemetryCollector,
  aggregateDispatcherTelemetry,
  type DispatcherTelemetryEvent,
} from '../../src/lib/server/telemetry/dispatcher-telemetry-wrapper';

describe('Dispatcher Telemetry Wrapper', () => {
  let mockRedis: Partial<Redis>;
  let mockPostgres: any;
  let mockState: DispatcherState;

  beforeEach(() => {
    mockRedis = {
      setex: vi.fn().mockResolvedValue('OK'),
      keys: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
    };

    mockPostgres = {
      run: vi.fn().mockResolvedValue({ rows: [] }),
    };

    mockState = {
      dispatch_decision: 'identity_recovery',
      dispatch_confidence: 0.95,
      candidates: [
        { packet_key: 'test:1', source_ref: 'src/test.ts', feature_id: 'test_feature', confidence: 0.9 },
        { packet_key: 'test:2', source_ref: 'src/test2.ts', feature_id: 'test_feature', confidence: 0.85 },
      ],
      synthesis_path: ['identity_recovery', 'validate_envelope'],
      errors: [],
    } as any;
  });

  describe('emitDispatcherTelemetry', () => {
    it('should write telemetry to Redis immediately', async () => {
      const result = await emitDispatcherTelemetry(
        'node_recover_identity',
        mockState,
        mockRedis as Redis,
        mockPostgres,
        150,
        {
          decision: 'identity_recovery',
          confidence: 0.95,
        }
      );

      expect(result.redis_written).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalled();

      const [key, ttl, value] = (mockRedis.setex as any).mock.calls[0];
      expect(key).toMatch(/^telemetry:dispatcher:node_recover_identity:/);
      expect(ttl).toBe(86400); // 24-hour TTL
      expect(value).toContain('identity_recovery');
    });

    it('should defer Postgres write via queueMicrotask', async () => {
      const result = await emitDispatcherTelemetry(
        'node_validate_envelope',
        mockState,
        mockRedis as Redis,
        mockPostgres,
        100,
        {
          decision: 'validate_envelope',
        }
      );

      expect(result.postgres_deferred).toBe(true);

      // Wait for microtask queue to flush
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockPostgres.run).toHaveBeenCalled();
    });

    it('should capture routing metadata', async () => {
      const result = await emitDispatcherTelemetry(
        'node_escalate_quarantine',
        mockState,
        mockRedis as Redis,
        mockPostgres,
        50,
        {
          routingMetadata: {
            decision_type: 'escalate',
            alternative_paths: ['recover_identity', 'validate_envelope'],
            selected_path: 'escalate_quarantine',
          },
        }
      );

      const telemetryEvent = result.telemetry_event;
      expect(telemetryEvent.routing_metadata).toBeDefined();
      expect(telemetryEvent.routing_metadata?.decision_type).toBe('escalate');
    });

    it('should capture gRPC traces', async () => {
      const grpcTraces = [
        { service: 'PacketRegistry', method: 'GetPacket', duration_ms: 25, status: 'OK' },
        { service: 'Embedding', method: 'Embed', duration_ms: 35, status: 'OK' },
      ];

      const result = await emitDispatcherTelemetry(
        'node_sync_qdrant_mirror',
        mockState,
        mockRedis as Redis,
        mockPostgres,
        80,
        { grpcTraces }
      );

      const telemetryEvent = result.telemetry_event;
      expect(telemetryEvent.grpc_traces).toEqual(grpcTraces);
    });

    it('should capture tool calls', async () => {
      const toolCalls = [
        { tool_name: 'validate_packet', params_hash: 'abc123', duration_ms: 10, success: true },
        { tool_name: 'sync_redis', params_hash: 'def456', duration_ms: 5, success: true },
      ];

      const result = await emitDispatcherTelemetry(
        'node_synthesize_answer',
        mockState,
        mockRedis as Redis,
        mockPostgres,
        60,
        { toolCalls }
      );

      const telemetryEvent = result.telemetry_event;
      expect(telemetryEvent.tool_calls).toEqual(toolCalls);
    });

    it('should handle Redis write failures gracefully', async () => {
      (mockRedis.setex as any).mockRejectedValueOnce(new Error('Redis error'));

      const result = await emitDispatcherTelemetry(
        'node_expand_topology',
        mockState,
        mockRedis as Redis,
        mockPostgres,
        100
      );

      expect(result.redis_written).toBe(false);
      expect(result.postgres_deferred).toBe(true);
    });
  });

  describe('withDispatcherTelemetry', () => {
    it('should wrap a handler and emit telemetry', async () => {
      const handler = vi.fn().mockResolvedValue({
        ...mockState,
        synthesis_path: [...mockState.synthesis_path, 'end'],
      });

      const wrapped = withDispatcherTelemetry(
        'node_rerank_candidates',
        handler,
        mockRedis as Redis,
        mockPostgres
      );

      const result = await wrapped(mockState);

      expect(handler).toHaveBeenCalledWith(mockState);
      expect(result.synthesis_path).toContain('end');
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should handle handler errors and still emit telemetry', async () => {
      const handlerError = new Error('Handler failed');
      const handler = vi.fn().mockRejectedValueOnce(handlerError);

      const wrapped = withDispatcherTelemetry(
        'node_synthesize_answer',
        handler,
        mockRedis as Redis,
        mockPostgres
      );

      await expect(wrapped(mockState)).rejects.toThrow('Handler failed');
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should measure execution duration', async () => {
      const handler = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockState), 50);
          })
      );

      const wrapped = withDispatcherTelemetry(
        'node_expand_topology',
        handler,
        mockRedis as Redis,
        mockPostgres
      );

      await wrapped(mockState);

      const [, , value] = (mockRedis.setex as any).mock.calls[0];
      const event = JSON.parse(value) as DispatcherTelemetryEvent;

      expect(event.duration_ms).toBeGreaterThanOrEqual(50);
      expect(event.duration_ms).toBeLessThan(100); // Some buffer for test overhead
    });
  });

  describe('createNodeTelemetryCollector', () => {
    it('should create a telemetry collector for a node', () => {
      const collector = createNodeTelemetryCollector('node_identity_recovery');

      expect(collector).toBeDefined();
      expect(collector).toHaveProperty('recordRoutingDecision');
      expect(collector).toHaveProperty('recordToolCall');
    });
  });

  describe('aggregateDispatcherTelemetry', () => {
    it('should aggregate telemetry across all nodes', async () => {
      const mockTelemetryKeys = [
        'telemetry:dispatcher:node_recover_identity:1234567890',
        'telemetry:dispatcher:node_validate_envelope:1234567891',
      ];

      const telemetryEvent1: DispatcherTelemetryEvent = {
        node_id: 'node_recover_identity',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        decision: 'identity_recovery',
        confidence: 0.95,
        candidates_count: 2,
      };

      const telemetryEvent2: DispatcherTelemetryEvent = {
        node_id: 'node_validate_envelope',
        timestamp: new Date().toISOString(),
        duration_ms: 50,
        decision: 'validate_envelope',
        confidence: 0.90,
        candidates_count: 2,
      };

      (mockRedis.keys as any).mockResolvedValueOnce(mockTelemetryKeys);
      (mockRedis.get as any)
        .mockResolvedValueOnce(JSON.stringify(telemetryEvent1))
        .mockResolvedValueOnce(JSON.stringify(telemetryEvent2));

      const result = await aggregateDispatcherTelemetry(mockRedis as Redis);

      expect(result.total_events).toBe(2);
      // With 2 values [50, 100]: p50Idx=floor(2*0.5)=1, so p50_ms = arr[1] = 100 (nearest-rank method)
      expect(result.p50_latency_ms).toBe(100);
      expect(result.p95_latency_ms).toBe(100);
      expect(result.p99_latency_ms).toBe(100);
      expect(result.nodes['node_recover_identity']).toBeDefined();
      expect(result.nodes['node_validate_envelope']).toBeDefined();
    });

    it('should handle empty telemetry gracefully', async () => {
      (mockRedis.keys as any).mockResolvedValueOnce([]);

      const result = await aggregateDispatcherTelemetry(mockRedis as Redis);

      expect(result.total_events).toBe(0);
      expect(result.p50_latency_ms).toBe(0);
      expect(result.nodes).toEqual({});
    });

    it('should compute per-node latency percentiles', async () => {
      const mockTelemetryKeys = [
        'telemetry:dispatcher:node_recover_identity:1',
        'telemetry:dispatcher:node_recover_identity:2',
        'telemetry:dispatcher:node_recover_identity:3',
      ];

      const events = [
        { ...mockState, node_id: 'node_recover_identity', duration_ms: 10 } as any,
        { ...mockState, node_id: 'node_recover_identity', duration_ms: 20 } as any,
        { ...mockState, node_id: 'node_recover_identity', duration_ms: 30 } as any,
      ];

      (mockRedis.keys as any).mockResolvedValueOnce(mockTelemetryKeys);
      (mockRedis.get as any)
        .mockResolvedValueOnce(JSON.stringify(events[0]))
        .mockResolvedValueOnce(JSON.stringify(events[1]))
        .mockResolvedValueOnce(JSON.stringify(events[2]));

      const result = await aggregateDispatcherTelemetry(mockRedis as Redis);

      const nodeMetrics = result.nodes['node_recover_identity'];
      expect(nodeMetrics.event_count).toBe(3);
      expect(nodeMetrics.p50_ms).toBe(20);
      expect(nodeMetrics.max_duration_ms).toBe(30);
      expect(nodeMetrics.min_duration_ms).toBe(10);
    });
  });
});
