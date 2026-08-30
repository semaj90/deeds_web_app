import { describe, expect, it } from 'vitest';
import {
  BITFROST_LATENT256_DIM,
  bitFrostCandidateKeyV1,
  decodeF32LE,
  encodeF32LE,
  bitFrostCandidateRecordFieldsV1,
} from './bitfrost-hot-vector.js';

const identity = {
  candidateId: 'candidate-1',
  candidateSnapshotRevision: 'snapshot-1',
  representationRevision: 'latent256-v1',
  checkpointRevision: 'checkpoint-1',
};

describe('BitFrost latent_256 hot record', () => {
  it('encodes exactly 256 finite values as F32LE and round-trips', () => {
    const values = Array.from({ length: BITFROST_LATENT256_DIM }, (_, index) => index / 100);
    expect(decodeF32LE(encodeF32LE(values))).toEqual(values.map((value) => expect.closeTo(value, 6)));
  });

  it('keys the record by candidate and every representation revision', () => {
    expect(bitFrostCandidateKeyV1(identity)).toMatch(/^bitfrost:candidate:v1:[a-f0-9]{64}$/);
    expect(bitFrostCandidateKeyV1({ ...identity, checkpointRevision: 'checkpoint-2' })).not.toBe(bitFrostCandidateKeyV1(identity));
  });

  it('marks the record as non-authoritative and stores binary latent data', () => {
    const fields = bitFrostCandidateRecordFieldsV1({
      ...identity,
      packetKey: 'packet-1',
      sourceRef: 'src/file.ts',
      sourceRevision: 'source-1',
      workspaceRevision: 'workspace-1',
      latent256: new Array(BITFROST_LATENT256_DIM).fill(0),
    });
    expect(fields.canonical_authority).toBe('false');
    expect(Buffer.isBuffer(fields.latent_256)).toBe(true);
    expect((fields.latent_256 as Buffer).byteLength).toBe(BITFROST_LATENT256_DIM * 4);
  });
});
