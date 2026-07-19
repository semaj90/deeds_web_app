// @vitest-environment node

/**
 * P2.1 — HNSW ef profile contract tests.
 *
 * Covers:
 *  - Profile → ef value mapping
 *  - efForProfile fallback for unknown strings
 *  - inferEfProfile heuristics (forced > limit-based > default)
 *  - buildQdrantSearchRequest carries params.hnsw_ef when efSearch is set
 *  - buildQdrantSearchRequest omits params when efSearch is absent
 */

import { describe, it, expect } from 'vitest';
import {
  HNSW_EF_PROFILES,
  efForProfile,
  inferEfProfile,
  type HnswEfProfile,
} from '../src/lib/server/retrieval/hnsw-ef-profiles.js';
import { buildQdrantSearchRequest } from '../src/lib/server/vector/vector-contracts.js';

// ---------------------------------------------------------------------------
// Profile → ef value
// ---------------------------------------------------------------------------

describe('HNSW_EF_PROFILES', () => {
  it('interactive is 64', () => {
    expect(HNSW_EF_PROFILES.interactive).toBe(64);
  });

  it('balanced is 128', () => {
    expect(HNSW_EF_PROFILES.balanced).toBe(128);
  });

  it('thorough is 256', () => {
    expect(HNSW_EF_PROFILES.thorough).toBe(256);
  });

  it('interactive < balanced < thorough', () => {
    expect(HNSW_EF_PROFILES.interactive).toBeLessThan(HNSW_EF_PROFILES.balanced);
    expect(HNSW_EF_PROFILES.balanced).toBeLessThan(HNSW_EF_PROFILES.thorough);
  });
});

// ---------------------------------------------------------------------------
// efForProfile
// ---------------------------------------------------------------------------

describe('efForProfile', () => {
  it.each([
    ['interactive', 64],
    ['balanced', 128],
    ['thorough', 256],
  ] as [HnswEfProfile, number][])(
    'returns %i for profile "%s"',
    (profile, expected) => {
      expect(efForProfile(profile)).toBe(expected);
    },
  );

  it('falls back to balanced (128) for unknown strings', () => {
    expect(efForProfile('turbo_ultra')).toBe(128);
    expect(efForProfile('')).toBe(128);
  });
});

// ---------------------------------------------------------------------------
// inferEfProfile
// ---------------------------------------------------------------------------

describe('inferEfProfile', () => {
  it('forced profile takes priority over limit', () => {
    expect(inferEfProfile({ forced: 'interactive', limit: 200 })).toBe('interactive');
    expect(inferEfProfile({ forced: 'thorough', limit: 1 })).toBe('thorough');
  });

  it('ignores unknown forced value and falls through to limit logic', () => {
    // unknown forced → falls through; limit=10 → balanced
    expect(inferEfProfile({ forced: 'unknown_profile', limit: 10 })).toBe('balanced');
  });

  it('limit > 50 → thorough', () => {
    expect(inferEfProfile({ limit: 51 })).toBe('thorough');
    expect(inferEfProfile({ limit: 100 })).toBe('thorough');
  });

  it('limit ≤ 5 → interactive', () => {
    expect(inferEfProfile({ limit: 5 })).toBe('interactive');
    expect(inferEfProfile({ limit: 1 })).toBe('interactive');
  });

  it('limit 6–50 → balanced', () => {
    expect(inferEfProfile({ limit: 6 })).toBe('balanced');
    expect(inferEfProfile({ limit: 10 })).toBe('balanced');
    expect(inferEfProfile({ limit: 50 })).toBe('balanced');
  });

  it('no opts → balanced', () => {
    expect(inferEfProfile({})).toBe('balanced');
  });
});

// ---------------------------------------------------------------------------
// buildQdrantSearchRequest carries efSearch → params.hnsw_ef
// ---------------------------------------------------------------------------

const BASE_PARAMS = {
  query: 'test query',
  queryVector: new Array(384).fill(0.1),
  vectorName: 'semantic_embedding' as const,
};

describe('buildQdrantSearchRequest — efSearch wiring', () => {
  it('includes params.hnsw_ef when efSearch is provided', () => {
    const payload = buildQdrantSearchRequest({ ...BASE_PARAMS, efSearch: 256 });
    expect(payload.params).toEqual({ hnsw_ef: 256 });
  });

  it('omits params entirely when efSearch is absent', () => {
    const payload = buildQdrantSearchRequest({ ...BASE_PARAMS });
    expect(payload.params).toBeUndefined();
  });

  it('efSearch=64 (interactive) is reflected correctly', () => {
    const ef = efForProfile('interactive');
    const payload = buildQdrantSearchRequest({ ...BASE_PARAMS, efSearch: ef });
    expect(payload.params?.hnsw_ef).toBe(64);
  });

  it('efSearch=128 (balanced) is reflected correctly', () => {
    const ef = efForProfile('balanced');
    const payload = buildQdrantSearchRequest({ ...BASE_PARAMS, efSearch: ef });
    expect(payload.params?.hnsw_ef).toBe(128);
  });

  it('profile pipeline: inferEfProfile → efForProfile → buildQdrantSearchRequest', () => {
    const profile = inferEfProfile({ limit: 100 }); // → thorough
    const ef = efForProfile(profile);               // → 256
    const payload = buildQdrantSearchRequest({ ...BASE_PARAMS, efSearch: ef, limit: 100 });
    expect(payload.params?.hnsw_ef).toBe(256);
    expect(payload.limit).toBe(100);
  });
});
