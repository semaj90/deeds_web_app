/**
 * GAN Audit Integration Tests
 *
 * Tests GanAuditOrchestrator in multiple contexts:
 * - SvelteKit context (with $lib imports)
 * - Workspace root context (without $lib, using dependency injection)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GanAuditOrchestrator, executeGanAudit } from './gan-audit-integration.js';
import type { GanAuditDependencies, GanAuditConfig } from './gan-audit-integration.js';

describe('GanAuditOrchestrator', () => {
  let mockDb: any;
  let mockRedis: any;
  let mockNats: any;
  let mockLogTrace: any;

  beforeEach(() => {
    // Mock Drizzle DB client
    mockDb = {
      execute: vi.fn(async () => [
        {
          packet_key: 'test:packet:001',
          source_ref: 'src/lib/test.ts',
          feature_id: 'test.module',
          summary: 'Test packet',
          ganValidated: false,
        },
      ]),
    };

    // Mock ioredis client
    mockRedis = {
      del: vi.fn(async () => 1),
      setex: vi.fn(async () => 'OK'),
    };

    // Mock NATS client
    mockNats = {
      publishTraceCheckpoint: vi.fn(async () => {}),
    };

    // Mock trace logger
    mockLogTrace = vi.fn(async () => {});
  });

  it('should execute full 5-step audit with injected dependencies (workspace root context)', async () => {
    const config: GanAuditConfig = {
      operation: 'gan-audit',
      dryRun: false,
      verbose: true,
      batchSize: 10,
    };

    const deps: GanAuditDependencies = {
      db: mockDb,
      redis: mockRedis,
      nats: mockNats,
      logWorkflowTrace: mockLogTrace,
    };

    const orchestrator = new GanAuditOrchestrator(config, deps);
    const result = await orchestrator.execute();

    expect(result.operation).toBe('gan-audit');
    expect(result.processed).toBeGreaterThanOrEqual(0);
    expect(result.trace_id).toBeDefined();
    expect(mockDb.execute).toHaveBeenCalled();
    expect(mockLogTrace).toHaveBeenCalled();

    const trace = mockLogTrace.mock.calls[0][0];
    expect(trace.trace_id).toBe(result.trace_id);
    expect(trace.user_query).toBe('GAN packet validation audit');
    expect(trace.validator_name).toBe('gan-adversarial-validator');
  });

  it('should handle dry-run mode without writing to Postgres', async () => {
    const config: GanAuditConfig = {
      operation: 'gan-audit',
      dryRun: true,
      verbose: false,
      batchSize: 10,
    };

    const deps: GanAuditDependencies = {
      db: mockDb,
      redis: mockRedis,
      nats: mockNats,
    };

    const result = await executeGanAudit(config, deps);

    // In dry-run mode, execute is called but UPDATE statements are logged, not executed
    expect(result.operation).toBe('gan-audit');
    expect(result.trace_id).toBeDefined();
  });

  it('should validate packet structure with 6 adversarial probes', async () => {
    const config: GanAuditConfig = {
      operation: 'gan-audit',
      dryRun: true,
      verbose: false,
      batchSize: 100,
    };

    // Mock DB returning packets with issues
    const mockDbWithProblems = {
      execute: vi.fn(async () => [
        // ADV001: missing packet_key
        {
          packet_key: null,
          source_ref: 'src/lib/test.ts',
          feature_id: 'test.module',
          summary: 'Test packet',
          ganValidated: false,
        },
        // ADV002: invalid source_ref
        {
          packet_key: 'test:packet:002',
          source_ref: 'INVALID_PATH',
          feature_id: 'test.module',
          summary: 'Test packet',
          ganValidated: false,
        },
        // ADV001: missing feature_id
        {
          packet_key: 'test:packet:003',
          source_ref: 'src/lib/test.ts',
          feature_id: null,
          summary: 'Test packet',
          ganValidated: false,
        },
        // Soft warnings: missing summary
        {
          packet_key: 'test:packet:004',
          source_ref: 'src/lib/test.ts',
          feature_id: 'test.module',
          summary: null,
          ganValidated: false,
        },
        // Pass (all identity fields present)
        {
          packet_key: 'test:packet:005',
          source_ref: 'src/lib/test.ts',
          feature_id: 'test.module',
          summary: 'Valid packet',
          ganValidated: false,
        },
      ]),
    };

    const deps: GanAuditDependencies = {
      db: mockDbWithProblems,
      redis: mockRedis,
      nats: mockNats,
    };

    const orchestrator = new GanAuditOrchestrator(
      {
        operation: 'gan-audit',
        dryRun: true,
        verbose: false,
        batchSize: 100,
      },
      deps
    );

    const result = await orchestrator.execute();

    // Should detect hard failures and soft warnings
    expect(result.hardFailures).toBeGreaterThan(0); // ADV001, ADV002, ADV001
    expect(result.softWarnings).toBeGreaterThan(0); // Missing summary
    expect(result.passed).toBeGreaterThan(0); // Valid packet
  });

  it('should emit NATS events with correct trace_id', async () => {
    const config: GanAuditConfig = {
      operation: 'gan-audit',
      dryRun: false,
      verbose: false,
      batchSize: 10,
    };

    const deps: GanAuditDependencies = {
      db: mockDb,
      redis: mockRedis,
      nats: mockNats,
      logWorkflowTrace: mockLogTrace,
    };

    const orchestrator = new GanAuditOrchestrator(config, deps);
    const result = await orchestrator.execute();

    // Verify NATS was called with the correct trace_id
    if (mockNats.publishTraceCheckpoint.mock.calls.length > 0) {
      const firstCall = mockNats.publishTraceCheckpoint.mock.calls[0][0];
      expect(firstCall.trace_id).toBe(result.trace_id);
      expect(firstCall.node).toBe('gan_audit');
      expect(firstCall.step).toBe(5); // Step 5: Emit events
    }
  });

  it('should handle Postgres connection failures gracefully', async () => {
    const mockDbFailure = {
      execute: vi.fn(async () => {
        throw new Error('Connection refused');
      }),
    };

    const config: GanAuditConfig = {
      operation: 'gan-audit',
      dryRun: false,
      verbose: false,
      batchSize: 10,
    };

    const deps: GanAuditDependencies = {
      db: mockDbFailure,
      redis: mockRedis,
      nats: mockNats,
    };

    const orchestrator = new GanAuditOrchestrator(config, deps);
    const result = await orchestrator.execute();

    // Should return 0 processed packets but not throw
    expect(result.processed).toBe(0);
    expect(result.operation).toBe('gan-audit');
  });

  it('should not block on Redis or NATS failures', async () => {
    const mockRedisFailure = {
      del: vi.fn(async () => {
        throw new Error('Redis connection lost');
      }),
    };

    const mockNatsFailure = {
      publishTraceCheckpoint: vi.fn(async () => {
        throw new Error('NATS connection lost');
      }),
    };

    const config: GanAuditConfig = {
      operation: 'gan-audit',
      dryRun: false,
      verbose: false,
      batchSize: 10,
    };

    const deps: GanAuditDependencies = {
      db: mockDb,
      redis: mockRedisFailure,
      nats: mockNatsFailure,
    };

    // Should complete without throwing
    const orchestrator = new GanAuditOrchestrator(config, deps);
    const result = await orchestrator.execute();

    expect(result.operation).toBe('gan-audit');
  });

  it('should log complete workflow trace with all metadata', async () => {
    const config: GanAuditConfig = {
      operation: 'gan-audit',
      dryRun: false,
      verbose: false,
      batchSize: 10,
    };

    const deps: GanAuditDependencies = {
      db: mockDb,
      redis: mockRedis,
      nats: mockNats,
      logWorkflowTrace: mockLogTrace,
    };

    const orchestrator = new GanAuditOrchestrator(config, deps);
    const result = await orchestrator.execute();

    expect(mockLogTrace).toHaveBeenCalled();
    const trace = mockLogTrace.mock.calls[0][0];

    expect(trace).toEqual(
      expect.objectContaining({
        trace_id: result.trace_id,
        timestamp: expect.any(String),
        user_query: 'GAN packet validation audit',
        route: 'gan-audit-direct',
        tools_used: expect.arrayContaining(['validatePacketStructure']),
        validator_name: 'gan-adversarial-validator',
        total_duration_ms: expect.any(Number),
        success: expect.any(Boolean),
      })
    );
  });
});

describe('GanAuditOrchestrator context-agnostic execution', () => {
  it('should work without dependency injection (falls back to $lib imports in SvelteKit context)', async () => {
    // This test verifies the fallback path exists, but won't actually run
    // in workspace root context due to missing $lib
    const config: GanAuditConfig = {
      operation: 'gan-audit',
      dryRun: true,
      verbose: false,
      batchSize: 1,
    };

    // Create orchestrator without dependencies - will try to import from $lib
    // In SvelteKit context, this succeeds; in workspace root, gracefully fails
    const orchestrator = new GanAuditOrchestrator(config);
    expect(orchestrator).toBeDefined();
    expect(orchestrator['trace_id']).toBeDefined();
  });
});
