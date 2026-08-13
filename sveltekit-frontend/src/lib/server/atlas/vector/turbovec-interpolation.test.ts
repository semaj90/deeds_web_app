import { describe, expect, it } from 'vitest';

import { interpolateTurboVec, l2Normalize64 } from './turbovec-interpolation.js';

function makeVector(seed: number): Float32Array {
  return new Float32Array(Array.from({ length: 64 }, (_, i) => seed + i + 1));
}

describe('turbovec-interpolation', () => {
  it('interpolates deterministically and normalizes output', () => {
    const packet = makeVector(1);
    const query = makeVector(2);
    const centroid = makeVector(3);

    const first = interpolateTurboVec({
      packet,
      query,
      centroid,
      packetWeight: 0.5,
      queryWeight: 0.3,
      centroidWeight: 0.2,
    });
    const second = interpolateTurboVec({
      packet,
      query,
      centroid,
      packetWeight: 0.5,
      queryWeight: 0.3,
      centroidWeight: 0.2,
    });

    expect(first).toEqual(second);
    expect(first).toHaveLength(64);

    const normalized = l2Normalize64(first);
    expect(normalized).toHaveLength(64);
  });
});
