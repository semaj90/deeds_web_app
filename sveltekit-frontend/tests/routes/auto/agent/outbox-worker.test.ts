// @vitest-environment node
/**
 * Outbox worker unit tests — no live DB, Redis, or Qdrant.
 * Validates handler routing, partial-failure semantics, and publish/retry logic.
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks before any imports that pull in $lib paths
// ---------------------------------------------------------------------------

const mockDbExecute = vi.hoisted(() => vi.fn());
const mockRedisSet  = vi.hoisted(() => vi.fn());
const mockQdrantUpsert = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/db/client.js', () => ({
    db: { execute: mockDbExecute },
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
    outboxEvents: {},
}));

vi.mock('$lib/server/redis.js', () => ({
    getRedis: () => ({ set: mockRedisSet }),
}));

vi.mock('$lib/server/vector/qdrant-singleton.js', () => ({
    getQdrantClient: () => ({ upsert: mockQdrantUpsert }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

let runOutboxCycle: typeof import('$lib/server/agent/outbox-worker.js').runOutboxCycle;

beforeEach(async () => {
    vi.resetAllMocks();
    // Lazy import so mocks are in place before module initialises
    ({ runOutboxCycle } = await import('$lib/server/agent/outbox-worker.js'));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<{
    outboxId: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
}> = {}) {
    return {
        outbox_id:      overrides.outboxId      ?? 'a1b2c3d4-0000-0000-0000-000000000001',
        aggregate_type: overrides.aggregateType ?? 'agent_run_action',
        aggregate_id:   overrides.aggregateId   ?? 'a1b2c3d4-0000-0000-0000-000000000002',
        event_type:     overrides.eventType     ?? 'assign.centroid.proposed',
        payload:        overrides.payload        ?? {
            contentHash:   'a'.repeat(64),
            centroidId:    2,
            centroidManifest: 'centroids-v1',
            runId:  'run-001',
            actionId: 'act-001',
        },
        created_at:     new Date('2026-07-19T00:00:00Z'),
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('outbox worker — claimBatch returns empty', () => {
    it('returns zero-result summary when no rows pending', async () => {
        mockDbExecute.mockResolvedValueOnce({ rows: [] });

        const result = await runOutboxCycle({ batchSize: 10 });

        expect(result.processed).toBe(0);
        expect(result.published).toBe(0);
        expect(result.retried).toBe(0);
        expect(result.errors).toHaveLength(0);
    });
});

describe('outbox worker — centroid routing cache fanout', () => {
    it('writes Redis key for assign.centroid.proposed and marks published', async () => {
        mockDbExecute.mockResolvedValueOnce({ rows: [makeRow()] });
        mockRedisSet.mockResolvedValueOnce('OK');

        const result = await runOutboxCycle({ batchSize: 10 });

        expect(result.processed).toBe(1);
        expect(result.published).toBe(1);
        expect(result.retried).toBe(0);
        expect(result.errors).toHaveLength(0);

        // Redis was called with the canonical key pattern
        const [key, , , ttl] = mockRedisSet.mock.calls[0] as [string, string, string, number];
        expect(key).toBe(`route:${'a'.repeat(64)}:centroids-v1`);
        expect(ttl).toBe(3600);
    });

    it('skips Redis write when contentHash is missing from payload', async () => {
        mockDbExecute.mockResolvedValueOnce({
            rows: [makeRow({ payload: { centroidId: 1 } })], // no contentHash
        });

        const result = await runOutboxCycle();

        expect(result.processed).toBe(1);
        expect(result.published).toBe(1); // claim already set published_at
        expect(mockRedisSet).not.toHaveBeenCalled();
    });
});

describe('outbox worker — Qdrant fanout', () => {
    it('upserts to Qdrant when embedding is 384-dim', async () => {
        const embedding = Array.from({ length: 384 }, (_, i) => i / 384);
        mockDbExecute.mockResolvedValueOnce({
            rows: [makeRow({
                eventType: 'encode.embedding.succeeded',
                payload: {
                    sourceRef:   'src/lib/server/agent/policy.ts',
                    contentHash: 'b'.repeat(64),
                    embedding,
                    runId:    'run-002',
                    actionId: 'act-002',
                },
            })],
        });
        mockQdrantUpsert.mockResolvedValueOnce({ status: 'ok' });

        const result = await runOutboxCycle();

        expect(result.processed).toBe(1);
        expect(result.published).toBe(1);
        expect(mockQdrantUpsert).toHaveBeenCalledOnce();

        const [collection, body] = mockQdrantUpsert.mock.calls[0] as [string, { points: { vector: number[] }[] }];
        expect(collection).toBe('agent_memory_observations');
        expect(body.points[0]!.vector).toHaveLength(384);
    });

    it('skips Qdrant when embedding is wrong dimension', async () => {
        mockDbExecute.mockResolvedValueOnce({
            rows: [makeRow({
                eventType: 'encode.embedding.succeeded',
                payload: { sourceRef: 'foo.ts', embedding: [0.1, 0.2] }, // 2-dim, wrong
            })],
        });

        const result = await runOutboxCycle();

        expect(result.published).toBe(1);
        expect(mockQdrantUpsert).not.toHaveBeenCalled();
    });
});

describe('outbox worker — partial failure semantics', () => {
    it('marks retried when the only handler throws', async () => {
        mockDbExecute
            .mockResolvedValueOnce({ rows: [makeRow()] })   // claimBatch
            .mockResolvedValueOnce(undefined);               // unpublish

        mockRedisSet.mockRejectedValueOnce(new Error('Redis down'));

        const result = await runOutboxCycle();

        expect(result.processed).toBe(1);
        expect(result.published).toBe(0);
        expect(result.retried).toBe(1);
        expect(result.errors[0]!.errors[0]!.handler).toBe('handleCentroidCache');
    });

    it('publishes successfully when at least one handler succeeds', async () => {
        // encode.embedding.succeeded triggers both Qdrant (will fail) and nothing else,
        // but Qdrant missing sourceRef = skip (not a throw) → publishedAt set
        const embedding = Array.from({ length: 384 }, () => 0.5);
        mockDbExecute.mockResolvedValueOnce({
            rows: [makeRow({
                eventType: 'encode.embedding.succeeded',
                payload:   { embedding, sourceRef: 'ok.ts', contentHash: 'c'.repeat(64) },
            })],
        });
        mockQdrantUpsert.mockResolvedValueOnce({ status: 'ok' });

        const result = await runOutboxCycle();

        expect(result.published).toBe(1);
        expect(result.retried).toBe(0);
    });
});

describe('outbox worker — unknown event type', () => {
    it('publishes without errors when no handler is registered', async () => {
        mockDbExecute.mockResolvedValueOnce({
            rows: [makeRow({ eventType: 'some.unknown.event' })],
        });

        const result = await runOutboxCycle();

        expect(result.processed).toBe(1);
        expect(result.published).toBe(1);
        expect(result.errors).toHaveLength(0);
        expect(mockRedisSet).not.toHaveBeenCalled();
        expect(mockQdrantUpsert).not.toHaveBeenCalled();
    });
});
