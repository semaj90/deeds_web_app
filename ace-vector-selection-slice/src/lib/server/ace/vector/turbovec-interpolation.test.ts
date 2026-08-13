import { describe, expect, it } from 'vitest';
import {
  cosineSimilarity64,
  interpolateTurboVec,
} from './turbovec-interpolation';

function unit(index: number): Float32Array {
  const vector = new Float32Array(64);
  vector[index] = 1;
  return vector;
}

describe('turbovec-interpolation', () => {
  it('is deterministic and returns an L2-normalized 64d vector', () => {
    const input = {
      packet: unit(0),
      query: unit(1),
      centroid: unit(2),
      packetWeight: 0.5,
      queryWeight: 0.3,
      centroidWeight: 0.2,
    };

    const first = interpolateTurboVec(input);
    const second = interpolateTurboVec(input);

    expect(Array.from(first)).toEqual(Array.from(second));

    const norm = Math.sqrt(
      Array.from(first).reduce(
        (sum, value) => sum + value * value,
        0,
      ),
    );

    expect(norm).toBeCloseTo(1, 6);
  });

  it('produces stable cosine similarity', () => {
    expect(cosineSimilarity64(unit(0), unit(0))).toBeCloseTo(1, 6);
    expect(cosineSimilarity64(unit(0), unit(1))).toBeCloseTo(0, 6);
  });

  it('rejects centroid weight without centroid vector', () => {
    expect(() =>
      interpolateTurboVec({
        packet: unit(0),
        query: unit(1),
        packetWeight: 0.5,
        queryWeight: 0.4,
        centroidWeight: 0.1,
      }),
    ).toThrow(/centroidWeight/i);
  });
});
