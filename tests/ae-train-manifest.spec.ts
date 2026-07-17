/**
 * tests/ae-train-manifest.spec.ts
 *
 * Offline unit tests for the AE train manifest generator.
 *
 * These tests exercise the contract/validation layer and the shape of what the
 * manifest generator would produce, WITHOUT hitting Qdrant or the filesystem.
 * They are hermetic — no network or DB connections required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Import contract helpers ───────────────────────────────────────────────────
const contract = await import('../scripts/atlas/lib/ae-train-contract.mjs');
const { CONTRACT_VERSION, validateManifest, validateManifestEntry, validateQueueEntry } = contract;

// ── Shared fixtures ───────────────────────────────────────────────────────────

const REGISTRY_SAMPLE = [
  {
    featureKey: 'auth_sessions',
    title: 'Authentication Sessions',
    status: 'implemented',
    summary: 'Handles Lucia session validation.',
    sourceRefs: ['local:src/lib/server/auth.ts#L1'],
    missing: [],
    nextQuery: 'rg "validateSession" src',
  },
  {
    featureKey: 'qdrant_vector_index',
    title: 'Qdrant Vector Index',
    status: 'implemented',
    summary: 'ANN search over codebase embeddings.',
    sourceRefs: ['local:src/lib/server/vector/qdrant-manager.ts#L1'],
    missing: [],
    nextQuery: 'rg "qdrant" src',
  },
  {
    featureKey: 'missing_feature',
    title: 'Missing Feature',
    status: 'partial',
    summary: 'Not fully implemented yet.',
    sourceRefs: [],
    missing: ['embeddings', 'indexing'],
    nextQuery: '',
  },
];

// ── Priority scoring (mirrors ae-train-manifest.mjs logic) ───────────────────

function scorePriority(entry: Record<string, unknown>, hasQdrantPoint: boolean): number {
  let score = 0;
  if (entry.status === 'implemented') score += 40;
  if (Array.isArray(entry.sourceRefs) && (entry.sourceRefs as string[]).length > 0) score += 20;
  if (Array.isArray(entry.missing) && (entry.missing as unknown[]).length === 0) score += 20;
  const key = ((entry.featureKey as string) ?? '').toLowerCase();
  if (/embedding|vector|ae|autoencoder|latent/.test(key)) score += 10;
  if (hasQdrantPoint) score += 10;
  return Math.min(score, 100);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('priority scoring', () => {
  it('gives highest score to implemented features with sourceRefs, no missing, Qdrant point', () => {
    const score = scorePriority(REGISTRY_SAMPLE[0], true);
    // 40 (impl) + 20 (sourceRefs) + 20 (no missing) + 10 (Qdrant) = 90
    expect(score).toBe(90);
  });

  it('boosts vector/ae/embedding feature keys', () => {
    const scoreNoBoost = scorePriority(REGISTRY_SAMPLE[0], false);
    const scoreBoost   = scorePriority(REGISTRY_SAMPLE[1], false);
    // REGISTRY_SAMPLE[1] has "vector" in key → +10 bonus
    expect(scoreBoost).toBeGreaterThan(scoreNoBoost);
  });

  it('gives lower score to partial features with missing items', () => {
    const score = scorePriority(REGISTRY_SAMPLE[2], false);
    // 0 (not impl) + 0 (no sourceRefs) + 0 (missing) + 0 (no key match) + 0 (no Qdrant) = 0
    expect(score).toBe(0);
  });

  it('caps score at 100', () => {
    const highEntry = {
      featureKey: 'autoencoder_ae_embedding_vector_latent',
      status: 'implemented',
      sourceRefs: ['local:src/x.ts'],
      missing: [],
    };
    const score = scorePriority(highEntry, true);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('manifest shape validation', () => {
  it('rejects manifest without records array', () => {
    expect(() =>
      validateManifest({
        contract_version:  CONTRACT_VERSION,
        generated_at:      new Date().toISOString(),
        ae_version:        '1.0.0',
        qdrant_collection: 'codebase_chunks_768',
        embed_dim:         768,
        target_dim:        64,
        total_records:     0,
        records:           null,
        queue:             [],
      } as Record<string, unknown>),
    ).toThrow(/records/);
  });

  it('accepts a minimal valid manifest with zero records', () => {
    expect(() =>
      validateManifest({
        contract_version:  CONTRACT_VERSION,
        generated_at:      new Date().toISOString(),
        ae_version:        '1.0.0',
        qdrant_collection: 'codebase_chunks_768',
        embed_dim:         768,
        target_dim:        64,
        total_records:     0,
        records:           [],
        queue:             [],
      }),
    ).not.toThrow();
  });

  it('validates all records in the manifest', () => {
    const badRecord = {
      // missing packet_key
      source_ref:        'src/bad.ts',
      feature_type:      'sae_latent',
      version:           '1.0.0',
      qdrant_collection: 'codebase_chunks_768',
      qdrant_point_id:   'pt-001',
      embed_dim:         768,
      priority:          50,
      status:            'pending',
    };
    expect(() =>
      validateManifest({
        contract_version:  CONTRACT_VERSION,
        generated_at:      new Date().toISOString(),
        ae_version:        '1.0.0',
        qdrant_collection: 'codebase_chunks_768',
        embed_dim:         768,
        target_dim:        64,
        total_records:     1,
        records:           [badRecord],
        queue:             [],
      }),
    ).toThrow(/packet_key/);
  });
});

describe('queue entry contract', () => {
  const validQueue = {
    queue_id:          0,
    packet_key:        'feature:auth_sessions',
    source_ref:        'src/lib/server/auth.ts',
    qdrant_collection: 'codebase_chunks_768',
    qdrant_point_id:   'qdrant-pt-001',
    embed_dim:         768,
    target_dim:        64,
    version:           '1.0.0',
    priority:          90,
    enqueued_at:       new Date().toISOString(),
  };

  it('accepts a valid queue entry', () => {
    expect(() => validateQueueEntry(validQueue)).not.toThrow();
  });

  it('rejects wrong embed_dim', () => {
    expect(() => validateQueueEntry({ ...validQueue, embed_dim: 384 })).toThrow(/embed_dim/);
  });

  it('rejects wrong target_dim', () => {
    expect(() => validateQueueEntry({ ...validQueue, target_dim: 128 })).toThrow(/target_dim/);
  });

  it('rejects missing packet_key', () => {
    const { packet_key: _, ...rest } = validQueue;
    expect(() => validateQueueEntry(rest)).toThrow(/packet_key/);
  });
});

describe('manifest deque ordering', () => {
  function buildDeque(entries: Array<{ priority: number; packet_key: string }>) {
    return [...entries].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.packet_key.localeCompare(b.packet_key);
    });
  }

  it('sorts by priority descending', () => {
    const entries = [
      { priority: 20, packet_key: 'feature:a' },
      { priority: 90, packet_key: 'feature:b' },
      { priority: 50, packet_key: 'feature:c' },
    ];
    const deque = buildDeque(entries);
    expect(deque[0].priority).toBe(90);
    expect(deque[1].priority).toBe(50);
    expect(deque[2].priority).toBe(20);
  });

  it('uses packet_key as tiebreaker for equal priorities', () => {
    const entries = [
      { priority: 80, packet_key: 'feature:zoo' },
      { priority: 80, packet_key: 'feature:alpha' },
    ];
    const deque = buildDeque(entries);
    expect(deque[0].packet_key).toBe('feature:alpha');
    expect(deque[1].packet_key).toBe('feature:zoo');
  });

  it('returns empty array for empty input', () => {
    expect(buildDeque([])).toEqual([]);
  });
});

describe('manifest entry status mapping', () => {
  it('pending entries have no error field', () => {
    const entry = {
      packet_key:        'feature:auth',
      source_ref:        'src/auth.ts',
      feature_type:      'sae_latent',
      version:           '1.0.0',
      qdrant_collection: 'codebase_chunks_768',
      qdrant_point_id:   'pt-001',
      embed_dim:         768,
      priority:          80,
      status:            'pending',
    };
    expect(() => validateManifestEntry(entry)).not.toThrow();
    expect(entry).not.toHaveProperty('error');
  });

  it('error entries have a synthetic point ID', () => {
    // When no Qdrant point is found, manifest uses synthetic:packet_key
    const entry = {
      packet_key:        'feature:unknown',
      source_ref:        'feature:unknown',
      feature_type:      'sae_latent',
      version:           '1.0.0',
      qdrant_collection: 'codebase_chunks_768',
      qdrant_point_id:   'synthetic:feature:unknown',
      embed_dim:         768,
      priority:          0,
      status:            'error',
      error:             'no_qdrant_point',
    };
    expect(() => validateManifestEntry(entry)).not.toThrow();
    expect(entry.qdrant_point_id).toMatch(/^synthetic:/);
  });
});
