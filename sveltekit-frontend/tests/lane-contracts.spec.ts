// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { validateCandidate } from '../src/lib/server/retrieval/lane-contracts.js';
import type { LaneCandidate, FusedLaneCandidate } from '../src/lib/server/retrieval/lane-contracts.js';

// Helper: build a valid candidate with overrides
function makeCandidate(overrides: Partial<LaneCandidate> = {}): LaneCandidate {
  return {
    packetKey: 'ace:packet:auth:001',
    sourceRef: 'src/lib/server/auth.ts',
    rank: 1,
    score: 0.95,
    lane: 'dense',
    ...overrides,
  };
}

describe('validateCandidate', () => {
  it('returns the candidate unchanged when all required fields are valid', () => {
    const c = makeCandidate();
    const result = validateCandidate(c);
    expect(result).toBe(c); // same reference — not a copy
  });

  // packetKey validation
  it('returns null when packetKey is empty string', () => {
    expect(validateCandidate(makeCandidate({ packetKey: '' }))).toBeNull();
  });

  it('returns null when packetKey is whitespace-only', () => {
    expect(validateCandidate(makeCandidate({ packetKey: '   ' }))).toBeNull();
  });

  // sourceRef validation
  it('returns null when sourceRef is empty string', () => {
    expect(validateCandidate(makeCandidate({ sourceRef: '' }))).toBeNull();
  });

  it('returns null when sourceRef is whitespace-only', () => {
    expect(validateCandidate(makeCandidate({ sourceRef: '\t\n' }))).toBeNull();
  });

  // rank validation
  it('returns null when rank is 0 (not ≥ 1)', () => {
    expect(validateCandidate(makeCandidate({ rank: 0 }))).toBeNull();
  });

  it('returns null when rank is negative', () => {
    expect(validateCandidate(makeCandidate({ rank: -1 }))).toBeNull();
  });

  it('returns null when rank is a non-integer (e.g. 1.5)', () => {
    expect(validateCandidate(makeCandidate({ rank: 1.5 }))).toBeNull();
  });

  // score: null is valid (unscored / disabled lane)
  it('accepts score: null (unscored disabled lane is valid)', () => {
    const c = makeCandidate({ score: null });
    expect(validateCandidate(c)).toBe(c);
  });

  // lane values
  it('accepts lane: dense', () => {
    const c = makeCandidate({ lane: 'dense' });
    expect(validateCandidate(c)).toBe(c);
  });

  it('accepts lane: sparse', () => {
    const c = makeCandidate({ lane: 'sparse' });
    expect(validateCandidate(c)).toBe(c);
  });

  it('accepts lane: exact', () => {
    const c = makeCandidate({ lane: 'exact' });
    expect(validateCandidate(c)).toBe(c);
  });

  it('accepts lane: ast', () => {
    const c = makeCandidate({ lane: 'ast' });
    expect(validateCandidate(c)).toBe(c);
  });

  it('accepts lane: bm25', () => {
    const c = makeCandidate({ lane: 'bm25' });
    expect(validateCandidate(c)).toBe(c);
  });

  it('accepts lane: rg', () => {
    const c = makeCandidate({ lane: 'rg' });
    expect(validateCandidate(c)).toBe(c);
  });

  it('accepts lane: bm42', () => {
    const c = makeCandidate({ lane: 'bm42' });
    expect(validateCandidate(c)).toBe(c);
  });

  it('accepts lane: go-retrieval', () => {
    const c = makeCandidate({ lane: 'go-retrieval' });
    expect(validateCandidate(c)).toBe(c);
  });

  // optional fields do not affect validity
  it('accepts a candidate with optional fields omitted', () => {
    const c: LaneCandidate = {
      packetKey: 'ace:packet:test:001',
      sourceRef: 'src/index.ts',
      rank: 3,
      score: null,
      lane: 'bm25',
    };
    expect(validateCandidate(c)).toBe(c);
  });

  it('accepts a candidate with all optional fields present', () => {
    const c = makeCandidate({
      packetId: 'uuid-1234',
      qdrantPointId: 'qdrant-5678',
      metadata: { extra: 'data' },
    });
    expect(validateCandidate(c)).toBe(c);
  });

  // boundary: rank = 1 is the minimum valid value
  it('accepts rank: 1 (minimum valid)', () => {
    const c = makeCandidate({ rank: 1 });
    expect(validateCandidate(c)).toBe(c);
  });

  it('accepts rank: 100 (large valid rank)', () => {
    const c = makeCandidate({ rank: 100 });
    expect(validateCandidate(c)).toBe(c);
  });

  // fusionStage: optional on LaneCandidate, not checked by validateCandidate
  it('accepts fusionStage: lane (adapter-emitted candidate)', () => {
    const c = makeCandidate({ fusionStage: 'lane' });
    expect(validateCandidate(c)).toBe(c);
  });

  it('accepts fusionStage: search_runtime (post-RRF candidate)', () => {
    const c = makeCandidate({ fusionStage: 'search_runtime' });
    expect(validateCandidate(c)).toBe(c);
  });

  it('accepts a candidate with fusionStage omitted (field is optional)', () => {
    const c = makeCandidate();
    expect(c.fusionStage).toBeUndefined();
    expect(validateCandidate(c)).toBe(c);
  });
});

describe('FusedLaneCandidate shape', () => {
  it('FusedLaneCandidate is assignable with required fusedScore and rrfScore', () => {
    const fused: FusedLaneCandidate = {
      packetKey: 'ace:packet:test:001',
      sourceRef: 'src/index.ts',
      rank: 1,
      score: 0.9,
      lane: 'dense',
      fusionStage: 'search_runtime',
      fusedScore: 0.017,
      rrfScore: 0.017,
    };
    // Type-level assertion — the object construction above would fail tsc if types are wrong.
    expect(fused.fusionStage).toBe('search_runtime');
    expect(typeof fused.fusedScore).toBe('number');
    expect(typeof fused.rrfScore).toBe('number');
  });
});
