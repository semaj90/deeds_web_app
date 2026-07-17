/**
 * tests/ae-train-contract.spec.ts
 *
 * Unit tests for scripts/atlas/lib/ae-train-contract.mjs
 *
 * Verifies:
 *  - CONTRACT_VERSION is stable
 *  - validateManifestEntry accepts valid entries and rejects invalid ones
 *  - validateQueueEntry accepts valid entries and rejects invalid ones
 *  - validateManifest accepts a well-formed manifest and rejects bad ones
 */

import { describe, it, expect } from 'vitest';

// Dynamic import because the contract file is ESM .mjs
const contract = await import('../scripts/atlas/lib/ae-train-contract.mjs');

const {
  CONTRACT_VERSION,
  validateManifestEntry,
  validateQueueEntry,
  validateManifest,
} = contract;

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeManifestEntry(overrides = {}): Record<string, unknown> {
  return {
    packet_key:        'feature:test_feature',
    source_ref:        'src/lib/server/auth.ts',
    feature_type:      'sae_latent',
    version:           '1.0.0',
    qdrant_collection: 'codebase_chunks_768',
    qdrant_point_id:   'qdrant-uuid-001',
    embed_dim:         768,
    priority:          80,
    status:            'pending',
    ...overrides,
  };
}

function makeQueueEntry(overrides = {}): Record<string, unknown> {
  return {
    queue_id:          0,
    packet_key:        'feature:test_feature',
    source_ref:        'src/lib/server/auth.ts',
    qdrant_collection: 'codebase_chunks_768',
    qdrant_point_id:   'qdrant-uuid-001',
    embed_dim:         768,
    target_dim:        64,
    version:           '1.0.0',
    priority:          80,
    enqueued_at:       new Date().toISOString(),
    ...overrides,
  };
}

function makeManifest(overrides = {}): Record<string, unknown> {
  const entry = makeManifestEntry();
  const queue = makeQueueEntry();
  return {
    contract_version:  CONTRACT_VERSION,
    generated_at:      new Date().toISOString(),
    ae_version:        '1.0.0',
    qdrant_collection: 'codebase_chunks_768',
    embed_dim:         768,
    target_dim:        64,
    total_records:     1,
    records:           [entry],
    queue:             [queue],
    ...overrides,
  };
}

// ── CONTRACT_VERSION ─────────────────────────────────────────────────────────

describe('CONTRACT_VERSION', () => {
  it('is a non-empty string', () => {
    expect(typeof CONTRACT_VERSION).toBe('string');
    expect(CONTRACT_VERSION.length).toBeGreaterThan(0);
  });

  it('matches atlas-ae-train-v1', () => {
    expect(CONTRACT_VERSION).toBe('atlas-ae-train-v1');
  });
});

// ── validateManifestEntry ─────────────────────────────────────────────────────

describe('validateManifestEntry', () => {
  it('accepts a valid entry', () => {
    expect(() => validateManifestEntry(makeManifestEntry())).not.toThrow();
  });

  it('throws on missing packet_key', () => {
    expect(() =>
      validateManifestEntry(makeManifestEntry({ packet_key: undefined })),
    ).toThrow(/packet_key/);
  });

  it('throws on missing source_ref', () => {
    expect(() =>
      validateManifestEntry(makeManifestEntry({ source_ref: undefined })),
    ).toThrow(/source_ref/);
  });

  it('throws when embed_dim is not 768', () => {
    expect(() =>
      validateManifestEntry(makeManifestEntry({ embed_dim: 384 })),
    ).toThrow(/embed_dim/);
  });

  it('throws on invalid version format', () => {
    expect(() =>
      validateManifestEntry(makeManifestEntry({ version: 'v1' })),
    ).toThrow(/version/);
  });

  it('accepts status=error with error field', () => {
    expect(() =>
      validateManifestEntry(
        makeManifestEntry({ status: 'error', error: 'no_qdrant_point' }),
      ),
    ).not.toThrow();
  });
});

// ── validateQueueEntry ────────────────────────────────────────────────────────

describe('validateQueueEntry', () => {
  it('accepts a valid queue entry', () => {
    expect(() => validateQueueEntry(makeQueueEntry())).not.toThrow();
  });

  it('throws on missing qdrant_point_id', () => {
    expect(() =>
      validateQueueEntry(makeQueueEntry({ qdrant_point_id: undefined })),
    ).toThrow(/qdrant_point_id/);
  });

  it('throws when target_dim is not 64', () => {
    expect(() =>
      validateQueueEntry(makeQueueEntry({ target_dim: 128 })),
    ).toThrow(/target_dim/);
  });

  it('throws when embed_dim is not 768', () => {
    expect(() =>
      validateQueueEntry(makeQueueEntry({ embed_dim: 384 })),
    ).toThrow(/embed_dim/);
  });

  it('throws on missing enqueued_at', () => {
    expect(() =>
      validateQueueEntry(makeQueueEntry({ enqueued_at: undefined })),
    ).toThrow(/enqueued_at/);
  });
});

// ── validateManifest ──────────────────────────────────────────────────────────

describe('validateManifest', () => {
  it('accepts a well-formed manifest', () => {
    expect(() => validateManifest(makeManifest())).not.toThrow();
  });

  it('throws on wrong contract_version', () => {
    expect(() =>
      validateManifest(makeManifest({ contract_version: 'old-version' })),
    ).toThrow(/contract_version/);
  });

  it('throws when records is not an array', () => {
    expect(() =>
      validateManifest(makeManifest({ records: null })),
    ).toThrow(/records/);
  });

  it('throws when queue is not an array', () => {
    expect(() =>
      validateManifest(makeManifest({ queue: 'not-array' })),
    ).toThrow(/queue/);
  });

  it('throws when a records entry is invalid', () => {
    const badEntry = makeManifestEntry({ packet_key: undefined });
    expect(() =>
      validateManifest(makeManifest({ records: [badEntry] })),
    ).toThrow(/packet_key/);
  });

  it('throws when a queue entry is invalid', () => {
    const badQueue = makeQueueEntry({ target_dim: 32 });
    expect(() =>
      validateManifest(makeManifest({ queue: [badQueue] })),
    ).toThrow(/target_dim/);
  });

  it('accepts manifest with empty records and queue', () => {
    expect(() =>
      validateManifest(makeManifest({ records: [], queue: [], total_records: 0 })),
    ).not.toThrow();
  });
});
