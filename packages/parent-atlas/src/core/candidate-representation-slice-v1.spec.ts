import { describe, expect, it } from 'vitest';
import { buildCandidateRepresentationSliceV1, candidateRepresentationSliceV1Schema } from './candidate-representation-slice-v1.js';

const base = {
  candidateSnapshotRevision: 'snapshot:v1',
  ordinalMapChecksum: 'a'.repeat(64),
  representationId: 'latent_256',
  representationRevision: 'checkpoint:v3',
  vectorsChecksum: 'b'.repeat(64),
  candidateOrdinals: [0, 1, 2],
  requested: 3,
  found: 3,
  degraded: 0,
};

describe('CandidateRepresentationSliceV1', () => {
  it('builds a valid slice with no raw vector data present', () => {
    const slice = buildCandidateRepresentationSliceV1(base);
    expect(slice.schema).toBe('atlas.candidate-representation-slice.v1');
    expect(slice.canonicalAuthority).toBe(false);
    expect(slice.writesPerformed).toBe(false);
    expect(Object.keys(slice)).not.toContain('vectors');
    expect(Object.keys(slice)).not.toContain('vector');
  });

  it('rejects found greater than requested', () => {
    expect(() => buildCandidateRepresentationSliceV1({ ...base, found: 4 })).toThrow(
      /CANDIDATE_REPRESENTATION_SLICE_FOUND_EXCEEDS_REQUESTED/,
    );
  });

  it('rejects a candidateOrdinals length that does not match found', () => {
    expect(() => buildCandidateRepresentationSliceV1({ ...base, candidateOrdinals: [0, 1] })).toThrow(
      /CANDIDATE_REPRESENTATION_SLICE_ORDINAL_COUNT_MISMATCH/,
    );
  });

  it('allows a fully-degraded slice (zero found, all requested missing/mismatched)', () => {
    const slice = buildCandidateRepresentationSliceV1({
      ...base,
      candidateOrdinals: [],
      found: 0,
      degraded: 3,
    });
    expect(slice.found).toBe(0);
    expect(slice.degraded).toBe(3);
  });

  it('rejects a non-hex vectorsChecksum', () => {
    expect(() =>
      candidateRepresentationSliceV1Schema.parse({ ...base, schema: 'atlas.candidate-representation-slice.v1', vectorsChecksum: 'not-a-checksum', canonicalAuthority: false, writesPerformed: false }),
    ).toThrow();
  });
});
