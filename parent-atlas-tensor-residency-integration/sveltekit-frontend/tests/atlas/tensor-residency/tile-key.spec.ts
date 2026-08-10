import { describe, expect, it } from 'vitest';
import { buildTileKey, hilbertIndex2D } from '../../../src/lib/server/atlas/tensors/tile-key';

describe('tile keys', () => {
  it('is deterministic', () => {
    expect(buildTileKey('r17', { somX: 7, somY: 13, authorityBin: 5, entropyBin: 2 }))
      .toBe(buildTileKey('r17', { somX: 7, somY: 13, authorityBin: 5, entropyBin: 2 }));
  });
  it('keeps 2d locality key in range', () => {
    expect(hilbertIndex2D(19, 19, 5)).toBeGreaterThanOrEqual(0);
    expect(hilbertIndex2D(19, 19, 5)).toBeLessThan(32 * 32);
  });
});
