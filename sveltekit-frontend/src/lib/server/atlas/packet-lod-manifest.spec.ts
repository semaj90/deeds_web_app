import { describe, expect, it } from 'vitest';
import { estimateTokenCount } from './packet-lod-manifest.js';

describe('Parent Atlas packet LOD token estimate', () => {
  it('counts Unicode code points instead of UTF-16 code units', () => {
    expect('😀'.length).toBe(2);
    expect(estimateTokenCount('😀😀😀😀')).toBe(1);
  });
});
