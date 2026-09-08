// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_ORDINAL_MAX_UINT32,
  canonicalCandidateV1Schema,
  candidateOrdinalMapChecksum,
  candidateOrdinalMapV1Schema,
  compareUtf8,
  materializeCandidateOrdinalMap,
  assertCandidateOrdinalMapIntegrityV1,
  resolveCanonicalCandidateByOrdinal,
  type CanonicalCandidateIdentityInput,
} from './canonical-candidate-v1.js';

function candidate(overrides: Partial<CanonicalCandidateIdentityInput> = {}): CanonicalCandidateIdentityInput {
  return {
    canonicalId: 'cand:1',
    packetKey: 'packet:1',
    sourceRef: null,
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision: 'ws-r1',
    sourceRevision: 'src-r1',
    graphRevision: null,
    semanticRevision: null,
    degradedIdentity: false,
    evidenceRefs: [],
    representationBindings: [],
    ...overrides,
  };
}

describe('compareUtf8 — deterministic, non-locale ordering', () => {
  it('is not the same comparator as localeCompare for at least one real case', () => {
    // "a" < "B" under a plain byte/codepoint comparator (uppercase precedes lowercase in ASCII),
    // but many locale collations treat "a" and "B" case-insensitively or order them the other way.
    // This test exists to catch an accidental revert back to localeCompare.
    expect(compareUtf8('a', 'B')).toBeGreaterThan(0);
    expect('a'.localeCompare('B')).not.toBe(compareUtf8('a', 'B'));
  });

  it('orders ASCII strings the same way plain < would', () => {
    expect(compareUtf8('apple', 'banana')).toBeLessThan(0);
    expect(compareUtf8('banana', 'apple')).toBeGreaterThan(0);
    expect(compareUtf8('same', 'same')).toBe(0);
  });
});

describe('candidateOrdinalMapChecksum — deterministic regardless of key insertion order', () => {
  it('produces the identical checksum for objects with keys inserted in different orders', () => {
    const a = { z: 1, a: 2, m: 3 };
    const b = { a: 2, m: 3, z: 1 };
    expect(candidateOrdinalMapChecksum(a)).toBe(candidateOrdinalMapChecksum(b));
  });
});

describe('materializeCandidateOrdinalMap', () => {
  const baseInput = {
    candidateSnapshotRevision: 'snap-r1',
    workspaceRevision: 'ws-r1',
    producerRevision: 'prod-r1',
  };

  it('assigns dense ordinals 0..N-1 in deterministic canonicalId order', () => {
    const map = materializeCandidateOrdinalMap({
      ...baseInput,
      candidates: [
        candidate({ canonicalId: 'cand:zebra' }),
        candidate({ canonicalId: 'cand:apple' }),
      ],
    });
    expect(map.rowCount).toBe(2);
    expect(map.candidates[0].canonicalId).toBe('cand:apple');
    expect(map.candidates[0].candidateOrdinal).toBe(0);
    expect(map.candidates[1].canonicalId).toBe('cand:zebra');
    expect(map.candidates[1].candidateOrdinal).toBe(1);
  });

  it('produces a byte-identical checksum across two runs with the same input in different array order', () => {
    const mapA = materializeCandidateOrdinalMap({
      ...baseInput,
      candidates: [candidate({ canonicalId: 'cand:a' }), candidate({ canonicalId: 'cand:b', packetKey: 'packet:2' })],
    });
    const mapB = materializeCandidateOrdinalMap({
      ...baseInput,
      candidates: [candidate({ canonicalId: 'cand:b', packetKey: 'packet:2' }), candidate({ canonicalId: 'cand:a' })],
    });
    expect(mapA.ordinalMapChecksum).toBe(mapB.ordinalMapChecksum);
  });

  it('rejects a duplicate canonicalId', () => {
    expect(() =>
      materializeCandidateOrdinalMap({
        ...baseInput,
        candidates: [candidate({ canonicalId: 'cand:dup' }), candidate({ canonicalId: 'cand:dup' })],
      })
    ).toThrow(/CANDIDATE_CANONICAL_ID_DUPLICATE/);
  });

  it('rejects a candidate whose workspaceRevision does not match the map input', () => {
    expect(() =>
      materializeCandidateOrdinalMap({
        ...baseInput,
        candidates: [candidate({ workspaceRevision: 'wrong-ws' })],
      })
    ).toThrow(/CANDIDATE_WORKSPACE_REVISION_MISMATCH/);
  });

  it('returns a map that already passes its own integrity assertion', () => {
    const map = materializeCandidateOrdinalMap({
      ...baseInput,
      candidates: [candidate({ canonicalId: 'cand:a' }), candidate({ canonicalId: 'cand:b', packetKey: 'packet:2' })],
    });
    expect(() => assertCandidateOrdinalMapIntegrityV1(map)).not.toThrow();
  });
});

describe('assertCandidateOrdinalMapIntegrityV1 — catches corruption schema validation alone would miss', () => {
  const baseInput = {
    candidateSnapshotRevision: 'snap-r1',
    workspaceRevision: 'ws-r1',
    producerRevision: 'prod-r1',
  };

  function validMap() {
    return materializeCandidateOrdinalMap({
      ...baseInput,
      candidates: [candidate({ canonicalId: 'cand:a' }), candidate({ canonicalId: 'cand:b', packetKey: 'packet:2' })],
    });
  }

  it('rejects a declared rowCount that does not match the actual candidate array length', () => {
    const map = validMap();
    const corrupted = candidateOrdinalMapV1Schema.parse({ ...map, rowCount: 99 });
    expect(() => assertCandidateOrdinalMapIntegrityV1(corrupted)).toThrow(/ROW_COUNT_MISMATCH/);
  });

  it('rejects a broken ordinal sequence (candidateOrdinal not matching array index)', () => {
    const map = validMap();
    const shuffled = candidateOrdinalMapV1Schema.parse({
      ...map,
      candidates: [...map.candidates].reverse(),
    });
    expect(() => assertCandidateOrdinalMapIntegrityV1(shuffled)).toThrow(/ORDINAL_SEQUENCE_BROKEN/);
  });

  it('rejects a candidate whose workspaceRevision diverges from the map', () => {
    const map = validMap();
    const corrupted = candidateOrdinalMapV1Schema.parse({
      ...map,
      candidates: [
        { ...map.candidates[0], workspaceRevision: 'other-ws' },
        map.candidates[1],
      ],
    });
    expect(() => assertCandidateOrdinalMapIntegrityV1(corrupted)).toThrow(/WORKSPACE_REVISION_MISMATCH/);
  });

  it('rejects a candidate whose candidateSnapshotRevision diverges from the map', () => {
    const map = validMap();
    const corrupted = candidateOrdinalMapV1Schema.parse({
      ...map,
      candidates: [
        { ...map.candidates[0], candidateSnapshotRevision: 'other-snap' },
        map.candidates[1],
      ],
    });
    expect(() => assertCandidateOrdinalMapIntegrityV1(corrupted)).toThrow(/SNAPSHOT_REVISION_MISMATCH/);
  });

  it('rejects a stale checksum after the candidate list was mutated without recomputing it', () => {
    const map = validMap();
    const tampered = candidateOrdinalMapV1Schema.parse({
      ...map,
      candidates: [
        { ...map.candidates[0], evidenceRefs: ['injected-after-the-fact'] },
        map.candidates[1],
      ],
    });
    expect(() => assertCandidateOrdinalMapIntegrityV1(tampered)).toThrow(/CHECKSUM_MISMATCH/);
  });
});

describe('CANDIDATE_ORDINAL_MAX_UINT32 boundary', () => {
  it('accepts a candidateOrdinal at exactly the uint32 max', () => {
    expect(() =>
      canonicalCandidateV1Schema.parse({
        schema: 'atlas.canonical-candidate.v1',
        candidateOrdinal: CANDIDATE_ORDINAL_MAX_UINT32,
        canonicalId: 'cand:1',
        packetKey: 'packet:1',
        sourceRef: null,
        treeNodeId: null,
        symbolVersionId: null,
        workspaceRevision: 'ws-r1',
        sourceRevision: 'src-r1',
        graphRevision: null,
        semanticRevision: null,
        candidateSnapshotRevision: 'snap-r1',
        degradedIdentity: false,
        evidenceRefs: [],
        representationBindings: [],
      })
    ).not.toThrow();
  });

  it('rejects a candidateOrdinal one past the uint32 max', () => {
    expect(() =>
      canonicalCandidateV1Schema.parse({
        schema: 'atlas.canonical-candidate.v1',
        candidateOrdinal: CANDIDATE_ORDINAL_MAX_UINT32 + 1,
        canonicalId: 'cand:1',
        packetKey: 'packet:1',
        sourceRef: null,
        treeNodeId: null,
        symbolVersionId: null,
        workspaceRevision: 'ws-r1',
        sourceRevision: 'src-r1',
        graphRevision: null,
        semanticRevision: null,
        candidateSnapshotRevision: 'snap-r1',
        degradedIdentity: false,
        evidenceRefs: [],
        representationBindings: [],
      })
    ).toThrow();
  });
});

describe('resolveCanonicalCandidateByOrdinal — unaffected by the integrity-assertion change', () => {
  it('still resolves a valid ordinal after the comparator/integrity fix', () => {
    const map = materializeCandidateOrdinalMap({
      candidateSnapshotRevision: 'snap-r1',
      workspaceRevision: 'ws-r1',
      producerRevision: 'prod-r1',
      candidates: [candidate({ canonicalId: 'cand:a' })],
    });
    const resolved = resolveCanonicalCandidateByOrdinal(map, 0);
    expect(resolved.canonicalId).toBe('cand:a');
  });
});
