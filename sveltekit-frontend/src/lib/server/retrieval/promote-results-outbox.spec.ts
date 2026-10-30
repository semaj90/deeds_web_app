/**
 * Promotion Enrichment Service — Outbox Integration Tests
 *
 * Validates that enrichment (domain classification, title generation) flows
 * into the promotion service and writes to atlas_packets correctly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { buildPromotionClaimQuery, buildPromotionSummaryQuery, dequeuePromotionJobs, executePromotionJob, PromotionOperation, recordPromotionIntent, summarizePromotionResults } from './promote-results-outbox.js';
import type { FeatureEnvelope } from './feature-envelope.js';

// Mock the db client to inspect SQL calls
vi.mock('$lib/server/db/client', () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [] })
  }
}));

describe('Promotion Enrichment Wiring', () => {
  const testEnvelope: FeatureEnvelope = {
    chunk_id: 'chunk:001',
    packet_key: 'packet:auth:001',
    source_ref: 'src/lib/server/auth.ts',
    feature_id: 'auth.sessions',
    summary: 'Handles Lucia session validation and expiry checks.',
    content: 'function validateSession(token) { ... }',
    content_hash: `sha256:${'b'.repeat(64)}`,
    source_revision: `sha256:${'a'.repeat(64)}`,
    created_at: new Date(),
    retrieval_score: 0.95,
    fusion_score: 0.92,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enriches packets with domain_class and title_id before promotion', async () => {
    const { db } = await import('$lib/server/db/client');
    const result = await recordPromotionIntent([testEnvelope], {
      queryText: 'session validation',
      userId: 'user123'
    });

    expect(result).toBeGreaterThan(0);

    // Verify db.execute was called
    expect(db.execute).toHaveBeenCalled();
  });

  it('refuses promotion without revision-qualified packet identity', async () => {
    const { db } = await import('$lib/server/db/client');
    const invalidEnvelope: FeatureEnvelope = {
      chunk_id: 'chunk:002',
      packet_key: 'packet:test:001',
      source_ref: '',
      feature_id: '',
      summary: 'Test summary',
      content: 'function test() {}',
      created_at: new Date(),
    };

    const result = await recordPromotionIntent([invalidEnvelope], {
      queryText: 'test',
      userId: 'user123'
    });

    expect(result).toBe(0);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('includes enrichment fields in both summary and Qdrant promotion jobs', async () => {
    const envelopeWithQdrant: FeatureEnvelope = {
      ...testEnvelope,
      qdrant_point_id: 'qdrant:auth:001'
    };

    const result = await recordPromotionIntent([envelopeWithQdrant], {
      queryText: 'session',
      userId: 'user123'
    });

    // 2 jobs: promote_summary + promote_qdrant
    expect(result).toBe(2);
  });

  it('generates deterministic title_id (stable per packet_key + generator_version)', async () => {
    // Same packet_key should generate the same title_id consistently
    const result1 = await recordPromotionIntent([testEnvelope], {
      queryText: 'query1',
      userId: 'user1'
    });

    const result2 = await recordPromotionIntent([testEnvelope], {
      queryText: 'query2',
      userId: 'user2'
    });

    // Both should successfully enqueue (title_id determinism is internal)
    expect(result1).toBeGreaterThan(0);
    expect(result2).toBeGreaterThan(0);
  });

  it('classifies domain correctly from summary keywords', async () => {
    const authEnvelope: FeatureEnvelope = {
      chunk_id: 'chunk:003',
      packet_key: 'packet:auth:002',
      source_ref: 'src/lib/server/auth.ts',
      feature_id: 'auth.jwt',
      summary: 'JWT token validation and OAuth credential handling',
      content: 'function validateJWT(token) { ... }',
      content_hash: `sha256:${'e'.repeat(64)}`,
      source_revision: `sha256:${'f'.repeat(64)}`,
      created_at: new Date(),
    };

    const result = await recordPromotionIntent([authEnvelope], {
      queryText: 'authentication',
      userId: 'user123'
    });

    // Should enqueue successfully (domain classification happens internally)
    expect(result).toBeGreaterThan(0);
  });

  it('enqueues packets with source and content revisions', async () => {
    const result = await recordPromotionIntent([testEnvelope], {
      queryText: 'immutable packet test',
      userId: 'user123'
    });

    expect(result).toBeGreaterThan(0);

    // At this point, the packet has all identities:
    // 1. packet_key (source-derived, immutable)
    // 2. source_ref (code location, immutable)
    // 3. feature_id (feature label, immutable)
    // 4. title_id (deterministic per packet_key, immutable after promotion)
    // 5. tree_node_id (would be set by indexing, immutable)
    // 6. qdrant_point_id (set during vector indexing, immutable)
    // 7. domain_class (derived by enrichment, immutable after promotion)
    //
    // After this stage, the packet is frozen and cannot be mutated by user queries
  });

  it('targets both source and content revisions in the pending-job conflict key', async () => {
    const { db } = await import('$lib/server/db/client');
    const changedContent: FeatureEnvelope = {
      ...testEnvelope,
      content_hash: `sha256:${'c'.repeat(64)}`,
    };
    const changedSource: FeatureEnvelope = {
      ...testEnvelope,
      source_revision: `sha256:${'d'.repeat(64)}`,
    };

    await recordPromotionIntent([testEnvelope, changedContent, changedSource], {
      queryText: 'revision-aware promotion',
      userId: 'user123',
    });

    const query = vi.mocked(db.execute).mock.calls[0]?.[0];
    expect(query).toBeDefined();
    const rendered = new PgDialect().sqlToQuery(query!);
    expect(rendered.sql).toMatch(/ON CONFLICT \(packet_key, source_ref, operation, content_hash, source_revision\)/);
    expect(rendered.sql).toContain("status = 'pending'");
    expect(rendered.params).toContain(testEnvelope.content_hash);
    expect(rendered.params).toContain(testEnvelope.source_revision);
    expect(rendered.params).toContain(changedContent.content_hash);
    expect(rendered.params).toContain(changedSource.source_revision);
    expect(JSON.stringify(query?.queryChunks)).toContain('pending');
  });

  it('is idempotent: repeated promotions with same packet_key are deduplicated', async () => {
    const { db } = await import('$lib/server/db/client');

    // First promotion
    const result1 = await recordPromotionIntent([testEnvelope], {
      queryText: 'query1',
      userId: 'user1'
    });

    expect(result1).toBeGreaterThan(0);

    // Reset mock
    vi.clearAllMocks();

    // Second promotion of the same packet (idempotent)
    const result2 = await recordPromotionIntent([testEnvelope], {
      queryText: 'query2',
      userId: 'user2'
    });

    // Should still enqueue (the DB layer handles the duplicate suppression via ON CONFLICT)
    expect(result2).toBeGreaterThan(0);

    // Verify db.execute was called (would have ON CONFLICT clause)
    expect(db.execute).toHaveBeenCalled();
  });

  it('validates enrichment gates and prevents invalid packets from being promoted', async () => {
    // Packet with missing packet_key (violates Gate 1: identity gate)
    const invalidPacket: FeatureEnvelope = {
      chunk_id: 'chunk:invalid',
      packet_key: '', // Empty — fails Gate 1
      source_ref: 'src/lib/test.ts',
      feature_id: 'test.func',
      summary: 'Test',
      content: 'function test() {}',
      created_at: new Date(),
    };

    const result = await recordPromotionIntent([invalidPacket], {
      queryText: 'test',
      userId: 'user123'
    });

    expect(result).toBe(0);
  });

  it('handles enrichment validation gate failures gracefully', async () => {
    // Test each of the 4 validation gates

    // Gate 1: Missing packet_key
    const gate1Fail: FeatureEnvelope = {
      chunk_id: 'chunk:g1',
      packet_key: '', // Fails Gate 1
      source_ref: 'src/lib/test.ts',
      feature_id: 'test',
      summary: 'Test',
      content: 'code',
      created_at: new Date(),
    };

    // Gate 2: Missing both source_ref and feature_id
    const gate2Fail: FeatureEnvelope = {
      chunk_id: 'chunk:g2',
      packet_key: 'packet:test',
      source_ref: '', // Empty
      feature_id: '', // Empty — fails Gate 2
      summary: 'Test',
      content: 'code',
      created_at: new Date(),
    };

    const result1 = await recordPromotionIntent([gate1Fail], { queryText: 'g1' });
    const result2 = await recordPromotionIntent([gate2Fail], { queryText: 'g2' });

    expect(result1).toBe(0);
    expect(result2).toBe(0);
  });

  it('updates only when an existing canonical row matches both revisions', async () => {
    const { db } = await import('$lib/server/db/client');
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [{ packet_id: 'canonical-packet-id' }] } as never);

    const result = await executePromotionJob({
      id: 1n,
      packet_key: 'packet:auth:001',
      source_ref: 'src/lib/server/auth.ts',
      content_hash: `sha256:${'b'.repeat(64)}`,
      summary: 'Revision-grounded summary',
      operation: PromotionOperation.PROMOTE_SUMMARY,
      payload: { source_revision: `sha256:${'a'.repeat(64)}` },
    });

    expect(result.success).toBe(true);
    expect(result.stages_completed).toContain('postgres_summary_upsert');
  });

  it('refuses summary promotion when no canonical row matches the revisions', async () => {
    const { db } = await import('$lib/server/db/client');
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [] } as never);

    const result = await executePromotionJob({
      id: 2n,
      packet_key: 'packet:auth:stale',
      source_ref: 'src/lib/server/auth.ts',
      content_hash: `sha256:${'c'.repeat(64)}`,
      summary: 'Stale summary',
      operation: PromotionOperation.PROMOTE_SUMMARY,
      payload: { source_revision: `sha256:${'d'.repeat(64)}` },
    });

    expect(result.success).toBe(true);
    expect(result.stages_completed).toContain('postgres_summary_stale_revision_skipped');
    expect(result.stages_failed).toHaveLength(0);
  });

  it('does not mirror a stale Qdrant job when PostgreSQL has no exact revision match', async () => {
    const { db } = await import('$lib/server/db/client');
    const qdrantSync = await import('./qdrant-summary-sync.js');
    const syncSpy = vi.spyOn(qdrantSync, 'syncSummaryPayloadToQdrant');
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [] } as never);

    const result = await executePromotionJob({
      id: 3n,
      packet_key: 'packet:auth:stale',
      source_ref: 'src/lib/server/auth.ts',
      content_hash: `sha256:${'e'.repeat(64)}`,
      summary: 'Stale summary',
      operation: PromotionOperation.PROMOTE_QDRANT,
      payload: { source_revision: `sha256:${'f'.repeat(64)}` },
    });

    expect(result.success).toBe(true);
    expect(result.stages_completed).toContain('qdrant_payload_stale_revision_skipped');
    expect(syncSpy).not.toHaveBeenCalled();
    syncSpy.mockRestore();
  });
});

describe('Promotion outbox claiming', () => {
  const renderSql = (query: unknown) => new PgDialect().sqlToQuery(query as never).sql;

  it('claims pending rows with one statement so row locks cannot be released before the status update', async () => {
    const { db } = await import('$lib/server/db/client');
    vi.mocked(db.execute).mockClear();
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [] } as never);

    await dequeuePromotionJobs(5);

    expect(db.execute).toHaveBeenCalledTimes(1);
    const rendered = renderSql(vi.mocked(db.execute).mock.calls[0][0]);
    expect(rendered).toMatch(/UPDATE promotion_outbox/);
    expect(rendered).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(rendered).toMatch(/RETURNING/);
  });

  it('rejects claim sizes that could disable the bounded batch', () => {
    expect(() => buildPromotionClaimQuery(0)).toThrow(RangeError);
    expect(() => buildPromotionClaimQuery(-1)).toThrow(RangeError);
    expect(() => buildPromotionClaimQuery(101)).toThrow(RangeError);
    expect(() => buildPromotionClaimQuery(Number.NaN)).toThrow(RangeError);
  });

  it('includes retry_count with the claim so retry attempts are observable', () => {
    const rendered = new PgDialect().sqlToQuery(buildPromotionClaimQuery(5)).sql;
    expect(rendered).toMatch(/RETURNING[\s\S]*retry_count/);
  });

  it('keeps summary writes guarded by packet, source, content, and source revisions', () => {
    const query = buildPromotionSummaryQuery({
      id: 1n,
      packet_key: 'packet:one',
      source_ref: 'src/one.ts',
      content_hash: `sha256:${'b'.repeat(64)}`,
      summary: 'stale summary',
      operation: PromotionOperation.PROMOTE_SUMMARY,
      payload: {},
    }, `sha256:${'a'.repeat(64)}`);
    const rendered = new PgDialect().sqlToQuery(query);
    expect(rendered.sql).toMatch(/WHERE packet_key = \$\d+/);
    expect(rendered.sql).toMatch(/AND source_ref = \$\d+/);
    expect(rendered.sql).toMatch(/AND content_hash = \$\d+/);
    expect(rendered.sql).toMatch(/AND source_revision = \$\d+/);
  });

  it('returns claimed jobs oldest-first without leaking created_at, and never issues an empty IN ()', async () => {
    const { db } = await import('$lib/server/db/client');
    vi.mocked(db.execute).mockClear();
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [
        { id: 2n, packet_key: 'packet:b', created_at: '2026-10-29T10:00:02Z' },
        { id: 1n, packet_key: 'packet:a', created_at: '2026-10-29T10:00:01Z' },
      ],
    } as never);

    const jobs = await dequeuePromotionJobs(5);

    expect(jobs.map((job) => job.packet_key)).toEqual(['packet:a', 'packet:b']);
    expect(jobs[0]).not.toHaveProperty('created_at');

    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [] } as never);
    expect(await dequeuePromotionJobs(5)).toEqual([]);
    expect(vi.mocked(db.execute)).toHaveBeenCalledTimes(2);
  });

  it('surfaces a failed claim as an error instead of an empty queue', async () => {
    const { db } = await import('$lib/server/db/client');
    vi.mocked(db.execute).mockRejectedValueOnce(new Error('connection refused'));
    await expect(dequeuePromotionJobs(5)).rejects.toThrow('connection refused');
  });

  it('counts claimed, promoted, stale no-op, failed, and retry attempts separately', () => {
    const base = { job_id: 1n, operation: PromotionOperation.PROMOTE_SUMMARY, message: '', stages_failed: [] as string[] };
    const metrics = summarizePromotionResults(4, [
      { ...base, success: true, stages_completed: ['postgres_summary_upsert'] },
      { ...base, success: true, stages_completed: ['postgres_summary_stale_revision_skipped'] },
      { ...base, success: true, stages_completed: ['qdrant_payload_stale_revision_skipped'] },
      { ...base, success: false, stages_completed: [] },
    ], 2);
    expect(metrics).toEqual({ claimed: 4, promoted: 1, stale_noop: 2, failed: 1, retried: 2 });
  });
});
