// @vitest-environment node

/**
 * Hermetic unit tests for HyperRAGPacketPipelineImpl.
 * No Postgres, no Qdrant, no network — all DB calls are stubbed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FeatureResolution } from '../../src/lib/server/hyperrag/hyperrag-packet-pipeline.js';

// ── Minimal DB stub ──────────────────────────────────────────────────────────

function makeDb(rows: Array<{ featureId: string; featureLabel: string }>) {
  const selectMock = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
  return {
    select: vi.fn().mockReturnValue(selectMock),
  };
}

// ── Import the class under test (lazy, after mocks are in place) ─────────────

// We instantiate directly rather than via the factory to keep the test hermetic.
async function buildPipeline(dbRows: Array<{ featureId: string; featureLabel: string }>) {
  // Dynamic import so top-level await in the module doesn't break the test runner.
  const mod = await import('../../src/lib/server/hyperrag/hyperrag-packet-pipeline.js');
  const db = makeDb(dbRows) as any;
  return new mod.HyperRAGPacketPipelineImpl(db);
}

// ── resolveFeatureCandidates ──────────────────────────────────────────────────

describe('resolveFeatureCandidates', () => {
  it('returns resolved status when a candidate matches a featureLabel (not featureId)', async () => {
    // The DB row has featureId="auth.sessions" and featureLabel="Authentication Sessions".
    // The caller passes the human label — resolution must match on label, not id.
    const pipeline = await buildPipeline([
      { featureId: 'auth.sessions', featureLabel: 'Authentication Sessions' },
    ]);

    const results: FeatureResolution[] = await pipeline.resolveFeatureCandidates([
      'Authentication Sessions',
    ]);

    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') {
      expect(r.featureId).toBe('auth.sessions');
      expect(r.featureLabel).toBe('Authentication Sessions');
      expect(r.candidate).toBe('Authentication Sessions');
    }
  });

  it('returns resolved when candidate matches featureLabel even if featureId differs', async () => {
    // Verifies the bug fix: old `normalizeFeatureIds` compared r.featureId === c (wrong).
    const pipeline = await buildPipeline([
      { featureId: 'qdrant.vector', featureLabel: 'Qdrant Vector Index' },
    ]);

    const results = await pipeline.resolveFeatureCandidates(['Qdrant Vector Index']);

    expect(results[0].status).toBe('resolved');
    if (results[0].status === 'resolved') {
      expect(results[0].featureId).toBe('qdrant.vector');
    }
  });

  it('returns unresolved when candidate has no matching featureLabel in DB', async () => {
    const pipeline = await buildPipeline([]); // empty DB

    const results = await pipeline.resolveFeatureCandidates(['NonExistentFeature']);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('unresolved');
    expect(results[0].candidate).toBe('NonExistentFeature');
  });

  it('does not arbitrarily choose between duplicate labels (ambiguity detection)', async () => {
    // Two rows share the same featureLabel but have different featureIds.
    // The pipeline must NOT silently pick one — it must signal ambiguity.
    const pipeline = await buildPipeline([
      { featureId: 'auth.sessions.v1', featureLabel: 'Auth Handler' },
      { featureId: 'auth.sessions.v2', featureLabel: 'Auth Handler' },
    ]);

    const results = await pipeline.resolveFeatureCandidates(['Auth Handler']);

    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.status).toBe('ambiguous');
    if (r.status === 'ambiguous') {
      expect(r.candidateFeatureIds).toContain('auth.sessions.v1');
      expect(r.candidateFeatureIds).toContain('auth.sessions.v2');
      expect(r.candidateFeatureIds).toHaveLength(2);
    }
  });

  it('handles mixed resolved / unresolved / ambiguous in one call', async () => {
    const pipeline = await buildPipeline([
      { featureId: 'auth.sessions', featureLabel: 'Auth Sessions' },
      { featureId: 'vec.v1', featureLabel: 'Vector Index' },
      { featureId: 'vec.v2', featureLabel: 'Vector Index' },
    ]);

    const results = await pipeline.resolveFeatureCandidates([
      'Auth Sessions',    // resolved
      'Vector Index',     // ambiguous
      'Missing Feature',  // unresolved
    ]);

    expect(results).toHaveLength(3);
    expect(results.find((r) => r.candidate === 'Auth Sessions')?.status).toBe('resolved');
    expect(results.find((r) => r.candidate === 'Vector Index')?.status).toBe('ambiguous');
    expect(results.find((r) => r.candidate === 'Missing Feature')?.status).toBe('unresolved');
  });

  it('returns empty array for empty input', async () => {
    const pipeline = await buildPipeline([]);
    const results = await pipeline.resolveFeatureCandidates([]);
    expect(results).toEqual([]);
  });

  it('deduplicates candidates before querying', async () => {
    const pipeline = await buildPipeline([
      { featureId: 'auth.sessions', featureLabel: 'Auth Sessions' },
    ]);

    const results = await pipeline.resolveFeatureCandidates([
      'Auth Sessions',
      'Auth Sessions',
      'Auth Sessions',
    ]);

    // Three inputs but only one unique candidate
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('resolved');
  });
});

// ── normalizeFeatureIds (deprecated shim) ────────────────────────────────────

describe('normalizeFeatureIds (deprecated shim)', () => {
  it('returns only featureIds of resolved candidates — unresolved are dropped', async () => {
    const pipeline = await buildPipeline([
      { featureId: 'auth.sessions', featureLabel: 'Auth Sessions' },
    ]);

    // "Unknown Feature" has no DB row — must be dropped, NOT lowercased into a fake ID
    const ids = await pipeline.normalizeFeatureIds(['Auth Sessions', 'Unknown Feature']);

    expect(ids).toContain('auth.sessions');
    expect(ids).not.toContain('unknown feature');
    expect(ids).not.toContain('Unknown Feature');
    expect(ids).toHaveLength(1);
  });

  it('returns empty array when nothing resolves', async () => {
    const pipeline = await buildPipeline([]);
    const ids = await pipeline.normalizeFeatureIds(['foo', 'bar']);
    expect(ids).toEqual([]);
  });
});
